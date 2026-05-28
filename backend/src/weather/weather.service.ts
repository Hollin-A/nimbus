// Open-Meteo proxy. Two upstream endpoints (geocoding + forecast),
// one WMO-code-to-display mapping, and a small in-memory cache keyed
// by coordinates. See docs/adr/0004 for why Open-Meteo.

export type WeatherIcon =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunderstorm';

export interface City {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export interface Weather {
  city: string;
  country?: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  pressure: number;
  uvIndex: number;
  high: number;
  low: number;
  isDay: boolean;
  weatherCode: number;
  condition: string;
  icon: WeatherIcon;
  localTime: string;
  observedAt: string;
}

export class WeatherError extends Error {
  public readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'WeatherError';
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// WMO weather code → human label + icon key
// ---------------------------------------------------------------------------
// Reference: https://open-meteo.com/en/docs (WMO Weather interpretation codes)

const WMO: Record<number, { condition: string; icon: WeatherIcon }> = {
  0: { condition: 'Clear sky', icon: 'clear' },
  1: { condition: 'Mainly clear', icon: 'clear' },
  2: { condition: 'Partly cloudy', icon: 'partly-cloudy' },
  3: { condition: 'Overcast', icon: 'cloudy' },
  45: { condition: 'Fog', icon: 'fog' },
  48: { condition: 'Depositing rime fog', icon: 'fog' },
  51: { condition: 'Light drizzle', icon: 'drizzle' },
  53: { condition: 'Moderate drizzle', icon: 'drizzle' },
  55: { condition: 'Dense drizzle', icon: 'drizzle' },
  56: { condition: 'Light freezing drizzle', icon: 'drizzle' },
  57: { condition: 'Dense freezing drizzle', icon: 'drizzle' },
  61: { condition: 'Slight rain', icon: 'rain' },
  63: { condition: 'Moderate rain', icon: 'rain' },
  65: { condition: 'Heavy rain', icon: 'rain' },
  66: { condition: 'Light freezing rain', icon: 'rain' },
  67: { condition: 'Heavy freezing rain', icon: 'rain' },
  71: { condition: 'Slight snow', icon: 'snow' },
  73: { condition: 'Moderate snow', icon: 'snow' },
  75: { condition: 'Heavy snow', icon: 'snow' },
  77: { condition: 'Snow grains', icon: 'snow' },
  80: { condition: 'Slight rain showers', icon: 'rain' },
  81: { condition: 'Moderate rain showers', icon: 'rain' },
  82: { condition: 'Violent rain showers', icon: 'rain' },
  85: { condition: 'Slight snow showers', icon: 'snow' },
  86: { condition: 'Heavy snow showers', icon: 'snow' },
  95: { condition: 'Thunderstorm', icon: 'thunderstorm' },
  96: { condition: 'Thunderstorm with slight hail', icon: 'thunderstorm' },
  99: { condition: 'Thunderstorm with heavy hail', icon: 'thunderstorm' },
};

export function describeWeatherCode(
  code: number,
): { condition: string; icon: WeatherIcon } {
  return WMO[code] ?? { condition: 'Unknown conditions', icon: 'cloudy' };
}

// ---------------------------------------------------------------------------
// Shared upstream plumbing
// ---------------------------------------------------------------------------

// Backend gives up well before the frontend's 15-second client timeout so a
// stalled upstream surfaces as a clean 502 to the client rather than a hung
// request handler.
const UPSTREAM_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(
  url: string,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(handle);
  }
}

function isAbortError(err: unknown): err is DOMException {
  return err instanceof DOMException && err.name === 'AbortError';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Render's free tier sleeps after ~15 min idle; the first few outbound calls
// to Open-Meteo after a cold start fail at the connection level (DNS / TCP
// warm-up), then stabilise. Those failures are transient — the same request
// succeeds a beat later — so we retry connection errors and upstream 5xx with
// a short backoff. We do NOT retry our own timeout (a genuinely hung upstream
// shouldn't be hammered) or 4xx (won't change on retry).
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 200;

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(url);
      if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
        await delay(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      return response;
    } catch (err) {
      if (isAbortError(err)) throw err; // our timeout — don't retry
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// City search (geocoding)
// ---------------------------------------------------------------------------

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

interface GeocodingResult {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
}

interface GeocodingResponse {
  results?: GeocodingResult[];
}

export async function searchCities(query: string): Promise<City[]> {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=10&language=en&format=json`;

  let response: Response;
  try {
    response = await fetchWithRetry(url);
  } catch (err) {
    if (isAbortError(err)) {
      throw new WeatherError('Geocoding upstream timed out', 502);
    }
    throw new WeatherError('Could not reach geocoding API', 502);
  }

  if (!response.ok) {
    throw new WeatherError(`Geocoding upstream returned ${response.status}`, 502);
  }

  let body: GeocodingResponse;
  try {
    body = (await response.json()) as GeocodingResponse;
  } catch {
    throw new WeatherError('Invalid response from geocoding API', 502);
  }

  const results = body.results ?? [];
  return results.map((r) => ({
    name: r.name,
    country: r.country,
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

// ---------------------------------------------------------------------------
// Current weather (forecast) + in-memory cache
// ---------------------------------------------------------------------------

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  weather: Weather;
  expiresAt: number;
}

const weatherCache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lon: number): string {
  // 4 decimal places ≈ ~11m of precision — plenty for city-level weather.
  return `${lat.toFixed(4)}|${lon.toFixed(4)}`;
}

interface OpenMeteoCurrent {
  time: string;
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
  surface_pressure: number;
  uv_index: number;
  is_day: 0 | 1;
  weather_code: number;
}

interface OpenMeteoDaily {
  temperature_2m_max: number[];
  temperature_2m_min: number[];
}

interface ForecastResponse {
  current: OpenMeteoCurrent;
  daily: OpenMeteoDaily;
  timezone: string;
}

function buildForecastUrl(lat: number, lon: number): string {
  const current = [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'wind_speed_10m',
    'surface_pressure',
    'uv_index',
    'is_day',
    'weather_code',
  ].join(',');
  const daily = ['temperature_2m_max', 'temperature_2m_min'].join(',');
  return `${FORECAST_URL}?latitude=${lat}&longitude=${lon}&current=${current}&daily=${daily}&timezone=auto`;
}

function normalise(
  body: ForecastResponse,
  name: string,
  country: string | undefined,
): Weather {
  const high = body.daily?.temperature_2m_max?.[0];
  const low = body.daily?.temperature_2m_min?.[0];
  if (high === undefined || low === undefined) {
    throw new WeatherError('Incomplete forecast data', 502);
  }
  const { condition, icon } = describeWeatherCode(body.current.weather_code);
  return {
    city: name,
    country,
    temperature: Math.round(body.current.temperature_2m),
    apparentTemperature: Math.round(body.current.apparent_temperature),
    humidity: Math.round(body.current.relative_humidity_2m),
    windSpeed: Math.round(body.current.wind_speed_10m),
    pressure: Math.round(body.current.surface_pressure),
    uvIndex: body.current.uv_index,
    high: Math.round(high),
    low: Math.round(low),
    isDay: body.current.is_day === 1,
    weatherCode: body.current.weather_code,
    condition,
    icon,
    localTime: body.current.time,
    observedAt: new Date().toISOString(),
  };
}

export async function getWeather(
  lat: number,
  lon: number,
  name: string,
  country?: string,
): Promise<Weather> {
  const key = cacheKey(lat, lon);
  const cached = weatherCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    // Re-apply the caller's display name/country to a cache hit, so two
    // requests for the same coords with different labels both look right.
    return { ...cached.weather, city: name, country };
  }

  const url = buildForecastUrl(lat, lon);

  let response: Response;
  try {
    response = await fetchWithRetry(url);
  } catch (err) {
    if (isAbortError(err)) {
      throw new WeatherError('Forecast upstream timed out', 502);
    }
    throw new WeatherError('Could not reach forecast API', 502);
  }

  if (!response.ok) {
    throw new WeatherError(`Forecast upstream returned ${response.status}`, 502);
  }

  let body: ForecastResponse;
  try {
    body = (await response.json()) as ForecastResponse;
  } catch {
    throw new WeatherError('Invalid response from forecast API', 502);
  }

  const weather = normalise(body, name, country);
  weatherCache.set(key, { weather, expiresAt: Date.now() + CACHE_TTL_MS });
  return weather;
}

/** Test helper — clears the in-memory cache. */
export function clearCache(): void {
  weatherCache.clear();
}
