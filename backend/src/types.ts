export type Severity = 'info' | 'warning' | 'alert';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
}

export interface LiveMessage {
  id: string;
  /** Display name of the city (e.g. "Melbourne"). Not unique on its own. */
  city: string;
  /** Latitude in degrees. Identifies the city in combination with longitude. */
  latitude: number;
  /** Longitude in degrees. */
  longitude: number;
  message: string;
  severity: Severity;
  createdAt: string;
}
