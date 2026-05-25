// Stub: shapes and signatures for the upcoming weather service. The real
// behavior — Open-Meteo proxy, WMO code mapping, cache — lands in the next
// commit. Tests in src/tests/weather.test.ts depend on these exports
// compiling; their assertions fail until the implementation is wired up.

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

export function describeWeatherCode(
  _code: number,
): { condition: string; icon: WeatherIcon } {
  return { condition: '[not implemented]', icon: 'clear' };
}

export async function searchCities(_query: string): Promise<City[]> {
  throw new WeatherError('not implemented');
}

export async function getWeather(
  _lat: number,
  _lon: number,
  _name: string,
  _country?: string,
): Promise<Weather> {
  throw new WeatherError('not implemented');
}

/** Test helper — clears the in-memory cache. */
export function clearCache(): void {
  // stub
}
