import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { messagesRepo } from '../messages/messages.repo';
import { truncateAll, disconnectDb } from './helpers/db';

// Persistence-behaviour tests against the real schema (nimbus_test):
// coordinate grouping, ordering, and the read-side cap.

const MELBOURNE = { latitude: -37.81, longitude: 144.96 };

// Sequential awaited inserts almost never share a millisecond, but
// "almost never" flakes eventually — the ordering-sensitive tests space
// inserts out explicitly.
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function input(message: string, coords = MELBOURNE) {
  return {
    city: 'Melbourne',
    ...coords,
    message,
    severity: 'info' as const,
  };
}

beforeEach(truncateAll);
afterAll(disconnectDb);

describe('messagesRepo.add', () => {
  it('returns the stored message in the LiveMessage shape', async () => {
    const stored = await messagesRepo.add(input('Storm warning'));

    expect(stored.id).toEqual(expect.any(String));
    expect(stored.id).toHaveLength(36); // uuid
    expect(stored.city).toBe('Melbourne');
    expect(stored.message).toBe('Storm warning');
    expect(stored.severity).toBe('info');
    // createdAt is an ISO string — the wire shape routes and the
    // frontend already consume — not a Date.
    expect(stored.createdAt).toEqual(expect.any(String));
    expect(new Date(stored.createdAt).toISOString()).toBe(stored.createdAt);
  });

  it('trims the city name', async () => {
    const stored = await messagesRepo.add(input('x'));
    const padded = await messagesRepo.add({ ...input('y'), city: '  Melbourne  ' });
    expect(padded.city).toBe('Melbourne');
    expect(stored.city).toBe('Melbourne');
  });
});

describe('messagesRepo.history', () => {
  it('returns messages for the coordinate, newest first', async () => {
    await messagesRepo.add(input('first'));
    await delay(5);
    await messagesRepo.add(input('second'));
    await delay(5);
    await messagesRepo.add(input('third'));

    const history = await messagesRepo.history(MELBOURNE.latitude, MELBOURNE.longitude);
    expect(history.map((m) => m.message)).toEqual(['third', 'second', 'first']);
  });

  it('groups coordinates by 4-decimal rounding (~11m), matching the room key', async () => {
    await messagesRepo.add(input('close enough', { latitude: -37.81004, longitude: 144.96001 }));

    const history = await messagesRepo.history(-37.81001, 144.95997);
    expect(history.map((m) => m.message)).toEqual(['close enough']);
  });

  it('keeps different coordinates isolated (Melbourne AU vs Melbourne FL)', async () => {
    await messagesRepo.add(input('aussie'));
    await messagesRepo.add(input('floridian', { latitude: 28.08, longitude: -80.61 }));

    const au = await messagesRepo.history(MELBOURNE.latitude, MELBOURNE.longitude);
    const fl = await messagesRepo.history(28.08, -80.61);
    expect(au.map((m) => m.message)).toEqual(['aussie']);
    expect(fl.map((m) => m.message)).toEqual(['floridian']);
  });

  it('caps history at 50, dropping the oldest from the result', async () => {
    for (let i = 1; i <= 55; i++) {
      await messagesRepo.add(input(`msg-${i}`));
      await delay(2);
    }

    const history = await messagesRepo.history(MELBOURNE.latitude, MELBOURNE.longitude);
    expect(history).toHaveLength(50);
    expect(history[0]?.message).toBe('msg-55'); // newest first
    const returned = new Set(history.map((m) => m.message));
    for (let i = 1; i <= 5; i++) {
      expect(returned.has(`msg-${i}`)).toBe(false); // five oldest dropped
    }
  });

  it('returns an empty array for a coordinate with no messages', async () => {
    expect(await messagesRepo.history(0, 0)).toEqual([]);
  });
});
