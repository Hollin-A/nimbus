import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import {
  clearCache,
  describeWeatherCode,
  getWeather,
  searchCities,
  WeatherError,
} from '../weather/weather.service';

// ---------------------------------------------------------------------------
// describeWeatherCode — pure WMO-code-to-{label,icon} mapping
// ---------------------------------------------------------------------------

describe('describeWeatherCode', () => {
  it('maps clear sky (0) to "Clear sky" and the clear icon', () => {
    const result = describeWeatherCode(0);
    expect(result.condition).toBe('Clear sky');
    expect(result.icon).toBe('clear');
  });

  it('maps partly cloudy (2) to the partly-cloudy icon', () => {
    expect(describeWeatherCode(2).icon).toBe('partly-cloudy');
  });

  it('maps overcast (3) to the cloudy icon', () => {
    expect(describeWeatherCode(3).icon).toBe('cloudy');
  });

  it('maps fog (45 and 48) to the fog icon', () => {
    expect(describeWeatherCode(45).icon).toBe('fog');
    expect(describeWeatherCode(48).icon).toBe('fog');
  });

  it('maps drizzle (51, 53, 55) to the drizzle icon', () => {
    expect(describeWeatherCode(51).icon).toBe('drizzle');
    expect(describeWeatherCode(53).icon).toBe('drizzle');
    expect(describeWeatherCode(55).icon).toBe('drizzle');
  });

  it('maps rain (61, 63, 65) and rain showers (80, 81, 82) to the rain icon', () => {
    expect(describeWeatherCode(61).icon).toBe('rain');
    expect(describeWeatherCode(65).icon).toBe('rain');
    expect(describeWeatherCode(80).icon).toBe('rain');
    expect(describeWeatherCode(82).icon).toBe('rain');
  });

  it('maps snow (71, 73, 75, 77, 85, 86) to the snow icon', () => {
    expect(describeWeatherCode(71).icon).toBe('snow');
    expect(describeWeatherCode(75).icon).toBe('snow');
    expect(describeWeatherCode(77).icon).toBe('snow');
    expect(describeWeatherCode(85).icon).toBe('snow');
    expect(describeWeatherCode(86).icon).toBe('snow');
  });

  it('maps thunderstorm (95, 96, 99) to the thunderstorm icon', () => {
    expect(describeWeatherCode(95).icon).toBe('thunderstorm');
    expect(describeWeatherCode(96).icon).toBe('thunderstorm');
    expect(describeWeatherCode(99).icon).toBe('thunderstorm');
  });

  it('falls back gracefully for unknown codes (no throw)', () => {
    const result = describeWeatherCode(999);
    expect(result.condition).toEqual(expect.any(String));
    expect(result.icon).toEqual(expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// HTTP layer — both routes are auth-protected and proxy Open-Meteo
// ---------------------------------------------------------------------------

const app = createApp();
let token: string;
let fetchMock: ReturnType<typeof vi.fn>;

function mockUpstreamJson(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'demo', password: 'demo123' });
  token = login.body.token;
});

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  clearCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/weather/cities', () => {
  it('returns 401 without an auth token', async () => {
    const res = await request(app).get('/api/weather/cities?q=Melbourne');
    expect(res.status).toBe(401);
  });

  it('returns a normalised list of cities for a valid query', async () => {
    mockUpstreamJson(200, {
      results: [
        {
          name: 'Melbourne',
          latitude: -37.81,
          longitude: 144.96,
          country: 'Australia',
        },
        {
          name: 'Melbourne',
          latitude: 28.08,
          longitude: -80.61,
          country: 'United States',
        },
      ],
    });

    const res = await request(app)
      .get('/api/weather/cities?q=Melbourne')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.cities).toBeInstanceOf(Array);
    expect(res.body.cities).toHaveLength(2);
    expect(res.body.cities[0]).toMatchObject({
      name: 'Melbourne',
      latitude: -37.81,
      longitude: 144.96,
      country: 'Australia',
    });
  });

  it('returns an empty list when geocoding finds nothing', async () => {
    mockUpstreamJson(200, {}); // Open-Meteo omits "results" when empty

    const res = await request(app)
      .get('/api/weather/cities?q=Xyzzy')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.cities).toEqual([]);
  });

  it('returns 400 when the query is missing', async () => {
    const res = await request(app)
      .get('/api/weather/cities')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the query is shorter than 2 characters', async () => {
    const res = await request(app)
      .get('/api/weather/cities?q=M')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 502 when the upstream geocoding API fails', async () => {
    mockUpstreamJson(503, {});

    const res = await request(app)
      .get('/api/weather/cities?q=Melbourne')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(502);
  });
});

describe('GET /api/weather', () => {
  function mockForecast() {
    mockUpstreamJson(200, {
      current: {
        time: '2026-05-25T14:00',
        temperature_2m: 22.4,
        apparent_temperature: 21.0,
        relative_humidity_2m: 55,
        wind_speed_10m: 12.3,
        surface_pressure: 1013.2,
        uv_index: 4,
        is_day: 1,
        weather_code: 2,
      },
      daily: {
        temperature_2m_max: [24.1],
        temperature_2m_min: [15.5],
      },
      timezone: 'Australia/Melbourne',
    });
  }

  it('returns 401 without an auth token', async () => {
    const res = await request(app).get(
      '/api/weather?lat=-37.81&lon=144.96&name=Melbourne',
    );
    expect(res.status).toBe(401);
  });

  it('returns normalised weather for valid coordinates', async () => {
    mockForecast();

    const res = await request(app)
      .get('/api/weather?lat=-37.81&lon=144.96&name=Melbourne')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.weather).toMatchObject({
      city: 'Melbourne',
      temperature: 22, // rounded from 22.4
      apparentTemperature: 21,
      humidity: 55,
      windSpeed: 12, // rounded from 12.3
      uvIndex: 4,
      high: 24, // rounded from 24.1
      low: 16, // rounded from 15.5
      isDay: true,
      weatherCode: 2,
      icon: 'partly-cloudy',
    });
    expect(res.body.weather.condition).toEqual(expect.any(String));
    expect(res.body.weather.observedAt).toEqual(expect.any(String));
  });

  it('passes through the optional country field when supplied', async () => {
    mockForecast();

    const res = await request(app)
      .get('/api/weather?lat=-37.81&lon=144.96&name=Melbourne&country=Australia')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.weather.country).toBe('Australia');
  });

  it('returns 400 when required params are missing', async () => {
    const res = await request(app)
      .get('/api/weather?lat=-37.81')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when lat or lon are out of range', async () => {
    const res = await request(app)
      .get('/api/weather?lat=200&lon=144.96&name=Melbourne')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 502 when the upstream forecast API fails', async () => {
    mockUpstreamJson(500, {});

    const res = await request(app)
      .get('/api/weather?lat=-37.81&lon=144.96&name=Melbourne')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(502);
  });

  it('caches identical queries within the TTL', async () => {
    // Same coords twice; the second request must NOT hit upstream.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        current: {
          time: '2026-05-25T14:00',
          temperature_2m: 22.4,
          apparent_temperature: 21.0,
          relative_humidity_2m: 55,
          wind_speed_10m: 12.3,
          surface_pressure: 1013.2,
          uv_index: 4,
          is_day: 1,
          weather_code: 2,
        },
        daily: {
          temperature_2m_max: [24.1],
          temperature_2m_min: [15.5],
        },
        timezone: 'Australia/Melbourne',
      }),
    } as Response);

    const url = '/api/weather?lat=-37.81&lon=144.96&name=Melbourne';
    await request(app).get(url).set('Authorization', `Bearer ${token}`);
    await request(app).get(url).set('Authorization', `Bearer ${token}`);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Upstream timeout — backend gives up on stalled upstream calls
// ---------------------------------------------------------------------------

describe('upstream timeout', () => {
  // Mocks fetch to honour the AbortSignal — resolves never, rejects on abort.
  function mockHangingUpstream() {
    fetchMock.mockImplementationOnce((_input, init) => {
      const signal = (init as { signal?: AbortSignal } | undefined)?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });
  }

  it('throws WeatherError(502) when geocoding takes longer than the timeout', async () => {
    vi.useFakeTimers();
    try {
      mockHangingUpstream();
      const promise = searchCities('Melbourne').catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(10_000);
      const err = await promise;
      expect(err).toBeInstanceOf(WeatherError);
      expect((err as WeatherError).status).toBe(502);
      expect((err as WeatherError).message).toMatch(/timed out/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws WeatherError(502) when the forecast takes longer than the timeout', async () => {
    vi.useFakeTimers();
    try {
      mockHangingUpstream();
      const promise = getWeather(-37.81, 144.96, 'Melbourne').catch(
        (e: unknown) => e,
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const err = await promise;
      expect(err).toBeInstanceOf(WeatherError);
      expect((err as WeatherError).status).toBe(502);
      expect((err as WeatherError).message).toMatch(/timed out/i);
    } finally {
      vi.useRealTimers();
    }
  });
});
