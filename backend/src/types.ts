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
