export type Severity = 'info' | 'warning' | 'alert';

export type UserRole = 'admin' | 'user';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
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
