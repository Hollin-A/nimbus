// Mirror of the backend's API contract. Kept in lockstep with backend/src/types.ts
// and the route response shapes — duplicated rather than shared to avoid a
// build-step or workspace-level package for two small packages.

export type Severity = 'info' | 'warning' | 'alert';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
}

export interface LiveMessage {
  id: string;
  city: string;
  message: string;
  severity: Severity;
  createdAt: string;
}

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
