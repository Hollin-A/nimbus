import type { LiveMessage, Severity } from '../types';

export interface MessageInput {
  city: string;
  message: string;
  severity: Severity;
}

// Stub: real implementation in the next commit. addMessage throws so any
// test that exercises it fails loudly with a clear "not implemented"
// message; getHistory returns [] so the "unknown city" test happens to
// pass — also fine.

export function addMessage(_input: MessageInput): LiveMessage {
  throw new Error('addMessage not implemented');
}

export function getHistory(_city: string): LiveMessage[] {
  return [];
}

export function clearMessages(): void {
  // stub
}
