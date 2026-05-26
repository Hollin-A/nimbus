import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../app';
import {
  addMessage,
  clearMessages,
  getHistory,
} from '../messages/messages.store';
import {
  historyQuerySchema,
  messageInputSchema,
} from '../messages/messages.schema';
import { closeSocket, initSocket, roomFor } from '../realtime/socket';
import type { LiveMessage } from '../types';

// Fixed coordinates for the cities used across tests. Two Melbournes
// (AU + FL) exercise the "same name, different coords" case the
// coord-keyed model was introduced to handle.
const MELBOURNE_AU = { latitude: -37.81, longitude: 144.96 };
const MELBOURNE_FL = { latitude: 28.08, longitude: -80.61 };
const SYDNEY_AU = { latitude: -33.87, longitude: 151.21 };

// ---------------------------------------------------------------------------
// Zod schemas — accept and reject payloads
// ---------------------------------------------------------------------------

describe('messageInputSchema', () => {
  it('accepts a valid message with explicit severity', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'Storm warning',
      severity: 'alert',
    });
    expect(result.success).toBe(true);
  });

  it('defaults severity to "info" when omitted', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'Test',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.severity).toBe('info');
    }
  });

  it('accepts a message exactly 280 characters long', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'a'.repeat(280),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing city', () => {
    const result = messageInputSchema.safeParse({
      ...MELBOURNE_AU,
      message: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing message', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      ...MELBOURNE_AU,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing coordinates', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      message: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects coordinates out of range', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      latitude: 200,
      longitude: 0,
      message: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty city', () => {
    const result = messageInputSchema.safeParse({
      city: '',
      ...MELBOURNE_AU,
      message: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty message', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a message longer than 280 characters', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'a'.repeat(281),
    });
    expect(result.success).toBe(false);
  });

  it('rejects severity values outside info/warning/alert', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'Test',
      severity: 'critical',
    });
    expect(result.success).toBe(false);
  });
});

describe('historyQuerySchema', () => {
  it('accepts valid coordinates', () => {
    const result = historyQuerySchema.safeParse(MELBOURNE_AU);
    expect(result.success).toBe(true);
  });

  it('coerces numeric strings (query string values)', () => {
    const result = historyQuerySchema.safeParse({
      latitude: '-37.81',
      longitude: '144.96',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing latitude or longitude', () => {
    expect(historyQuerySchema.safeParse({}).success).toBe(false);
    expect(
      historyQuerySchema.safeParse({ latitude: -37.81 }).success,
    ).toBe(false);
  });

  it('rejects coordinates out of range', () => {
    expect(
      historyQuerySchema.safeParse({ latitude: 100, longitude: 0 }).success,
    ).toBe(false);
    expect(
      historyQuerySchema.safeParse({ latitude: 0, longitude: 200 }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// messages.store — coord-keyed buckets, ordering, per-city cap
// ---------------------------------------------------------------------------

describe('messages.store', () => {
  beforeEach(() => {
    clearMessages();
  });

  it('addMessage returns the stored message with id, coords, severity and createdAt', () => {
    const msg = addMessage({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'Storm warning',
      severity: 'alert',
    });
    expect(msg.id).toEqual(expect.any(String));
    expect(msg.id.length).toBeGreaterThan(8);
    expect(msg.city).toBe('Melbourne');
    expect(msg.latitude).toBe(MELBOURNE_AU.latitude);
    expect(msg.longitude).toBe(MELBOURNE_AU.longitude);
    expect(msg.message).toBe('Storm warning');
    expect(msg.severity).toBe('alert');
    expect(msg.createdAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(msg.createdAt))).toBe(false);
  });

  it('getHistory returns messages for a coord, newest first', async () => {
    addMessage({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'First',
      severity: 'info',
    });
    await new Promise((r) => setTimeout(r, 5));
    addMessage({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'Second',
      severity: 'warning',
    });
    await new Promise((r) => setTimeout(r, 5));
    addMessage({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'Third',
      severity: 'alert',
    });

    const history = getHistory(MELBOURNE_AU.latitude, MELBOURNE_AU.longitude);
    expect(history).toHaveLength(3);
    expect(history[0]?.message).toBe('Third');
    expect(history[1]?.message).toBe('Second');
    expect(history[2]?.message).toBe('First');
  });

  it('scopes messages per coordinate, not per name', () => {
    addMessage({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'AU msg',
      severity: 'info',
    });
    addMessage({
      city: 'Melbourne',
      ...MELBOURNE_FL,
      message: 'FL msg',
      severity: 'info',
    });

    expect(
      getHistory(MELBOURNE_AU.latitude, MELBOURNE_AU.longitude),
    ).toHaveLength(1);
    expect(
      getHistory(MELBOURNE_FL.latitude, MELBOURNE_FL.longitude),
    ).toHaveLength(1);
    expect(
      getHistory(MELBOURNE_AU.latitude, MELBOURNE_AU.longitude)[0]?.message,
    ).toBe('AU msg');
    expect(
      getHistory(MELBOURNE_FL.latitude, MELBOURNE_FL.longitude)[0]?.message,
    ).toBe('FL msg');
  });

  it('groups by coordinate regardless of stored display name casing', () => {
    addMessage({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'A',
      severity: 'info',
    });
    addMessage({
      city: 'melbourne',
      ...MELBOURNE_AU,
      message: 'B',
      severity: 'info',
    });
    addMessage({
      city: 'MELBOURNE',
      ...MELBOURNE_AU,
      message: 'C',
      severity: 'info',
    });

    const history = getHistory(MELBOURNE_AU.latitude, MELBOURNE_AU.longitude);
    expect(history).toHaveLength(3);
  });

  it('rounds coordinates to 4 decimal places when keying', () => {
    addMessage({
      city: 'Melbourne',
      latitude: -37.8100001,
      longitude: 144.9600001,
      message: 'A',
      severity: 'info',
    });
    // Same coords to 4 dp — should land in the same bucket.
    expect(getHistory(-37.81, 144.96)).toHaveLength(1);
  });

  it('caps history at 50 messages per coordinate, dropping the oldest', () => {
    for (let i = 0; i < 55; i++) {
      addMessage({
        city: 'Melbourne',
        ...MELBOURNE_AU,
        message: `Msg ${i}`,
        severity: 'info',
      });
    }
    const history = getHistory(MELBOURNE_AU.latitude, MELBOURNE_AU.longitude);
    expect(history).toHaveLength(50);
    expect(history[0]?.message).toBe('Msg 54');
    expect(history[49]?.message).toBe('Msg 5');
  });

  it('returns [] for coordinates with no messages', () => {
    expect(getHistory(0, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// HTTP endpoints
// ---------------------------------------------------------------------------

const app = createApp();
let token: string;

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'demo', password: 'demo123' });
  token = login.body.token;
});

describe('POST /api/messages', () => {
  beforeEach(() => {
    clearMessages();
  });

  it('returns 401 without an auth token', async () => {
    const res = await request(app).post('/api/messages').send({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'Test',
      severity: 'info',
    });
    expect(res.status).toBe(401);
  });

  it('returns 201 with the stored message on valid input', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        city: 'Melbourne',
        ...MELBOURNE_AU,
        message: 'Storm warning',
        severity: 'alert',
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatchObject({
      city: 'Melbourne',
      latitude: MELBOURNE_AU.latitude,
      longitude: MELBOURNE_AU.longitude,
      message: 'Storm warning',
      severity: 'alert',
    });
    expect(res.body.message.id).toEqual(expect.any(String));
    expect(res.body.message.createdAt).toEqual(expect.any(String));
  });

  it('defaults severity to "info" when omitted', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        city: 'Melbourne',
        ...MELBOURNE_AU,
        message: 'No severity',
      });

    expect(res.status).toBe(201);
    expect(res.body.message.severity).toBe('info');
  });

  it('returns 400 when the message exceeds 280 characters', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        city: 'Melbourne',
        ...MELBOURNE_AU,
        message: 'a'.repeat(281),
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when coordinates are missing', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ city: 'Melbourne', message: 'Test' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when city name is missing', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...MELBOURNE_AU, message: 'Test' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when severity is invalid', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        city: 'Melbourne',
        ...MELBOURNE_AU,
        message: 'Test',
        severity: 'critical',
      });

    expect(res.status).toBe(400);
  });

  it('persists the message so subsequent GETs return it', async () => {
    await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        city: 'Melbourne',
        ...MELBOURNE_AU,
        message: 'Persistent',
        severity: 'info',
      });

    const res = await request(app)
      .get(
        `/api/messages?latitude=${MELBOURNE_AU.latitude}&longitude=${MELBOURNE_AU.longitude}`,
      )
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].message).toBe('Persistent');
  });
});

describe('GET /api/messages', () => {
  beforeEach(() => {
    clearMessages();
  });

  function historyUrl(coords: { latitude: number; longitude: number }) {
    return `/api/messages?latitude=${coords.latitude}&longitude=${coords.longitude}`;
  }

  it('returns 401 without an auth token', async () => {
    const res = await request(app).get(historyUrl(MELBOURNE_AU));
    expect(res.status).toBe(401);
  });

  it('returns the history for a coordinate, newest first', async () => {
    addMessage({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'First',
      severity: 'info',
    });
    await new Promise((r) => setTimeout(r, 5));
    addMessage({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'Second',
      severity: 'warning',
    });

    const res = await request(app)
      .get(historyUrl(MELBOURNE_AU))
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0].message).toBe('Second');
    expect(res.body.messages[1].message).toBe('First');
  });

  it('returns 400 when coordinates are missing', async () => {
    const res = await request(app)
      .get('/api/messages')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 when only one of lat/lon is supplied', async () => {
    const res = await request(app)
      .get(`/api/messages?latitude=${MELBOURNE_AU.latitude}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns an empty list for coordinates with no messages', async () => {
    const res = await request(app)
      .get(historyUrl({ latitude: 0, longitude: 0 }))
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
  });

  it("keeps two Melbournes' histories separate", async () => {
    addMessage({
      city: 'Melbourne',
      ...MELBOURNE_AU,
      message: 'AU storm',
      severity: 'alert',
    });
    addMessage({
      city: 'Melbourne',
      ...MELBOURNE_FL,
      message: 'FL launch delay',
      severity: 'info',
    });

    const auRes = await request(app)
      .get(historyUrl(MELBOURNE_AU))
      .set('Authorization', `Bearer ${token}`);
    const flRes = await request(app)
      .get(historyUrl(MELBOURNE_FL))
      .set('Authorization', `Bearer ${token}`);

    expect(auRes.body.messages).toHaveLength(1);
    expect(auRes.body.messages[0].message).toBe('AU storm');
    expect(flRes.body.messages).toHaveLength(1);
    expect(flRes.body.messages[0].message).toBe('FL launch delay');
  });
});

// ---------------------------------------------------------------------------
// roomFor — coordinate-to-room normalisation (unit)
// ---------------------------------------------------------------------------

describe('roomFor', () => {
  it('formats coordinates as "city:<lat>|<lon>" rounded to 4 dp', () => {
    expect(roomFor(-37.81, 144.96)).toBe('city:-37.8100|144.9600');
  });

  it('produces the same room for coordinates that round equal at 4 dp', () => {
    expect(roomFor(-37.81, 144.96)).toBe(roomFor(-37.8100001, 144.9600001));
  });

  it('produces distinct rooms for the two Melbournes', () => {
    expect(roomFor(MELBOURNE_AU.latitude, MELBOURNE_AU.longitude)).not.toBe(
      roomFor(MELBOURNE_FL.latitude, MELBOURNE_FL.longitude),
    );
  });
});

// ---------------------------------------------------------------------------
// Socket.IO real-time layer (integration)
// ---------------------------------------------------------------------------

describe('Socket.IO real-time layer', () => {
  let httpServer: http.Server;
  let url: string;
  let socketToken: string;
  let socketApp: ReturnType<typeof createApp>;

  function joinCoords(
    client: ClientSocket,
    coords: { latitude: number; longitude: number },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      client.emit(
        'join-city',
        coords,
        (res: { ok: boolean; error?: string }) => {
          if (res?.ok) resolve();
          else reject(new Error(res?.error ?? 'join failed'));
        },
      );
    });
  }

  function connect(authOverride?: object): Promise<ClientSocket> {
    const socket = ioClient(url, {
      auth: authOverride ?? { token: socketToken },
      reconnection: false,
      transports: ['websocket'],
    });
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (err) => reject(err));
    });
  }

  beforeAll(async () => {
    socketApp = createApp();
    httpServer = http.createServer(socketApp);
    initSocket(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address() as AddressInfo;
        url = `http://localhost:${address.port}`;
        resolve();
      });
    });

    const login = await request(socketApp)
      .post('/api/auth/login')
      .send({ username: 'demo', password: 'demo123' });
    socketToken = login.body.token;
  });

  afterAll(async () => {
    await closeSocket();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  beforeEach(() => {
    clearMessages();
  });

  it('rejects connections with no token', async () => {
    await expect(connect({})).rejects.toThrow(/auth/i);
  });

  it('rejects connections with an invalid token', async () => {
    await expect(connect({ token: 'not-a-jwt' })).rejects.toThrow(
      /invalid|expired/i,
    );
  });

  it('delivers a live-message to the joined coordinate room', async () => {
    const client = await connect();
    try {
      await joinCoords(client, MELBOURNE_AU);

      const received = new Promise<LiveMessage>((resolve) => {
        client.once('live-message', resolve);
      });

      await request(socketApp)
        .post('/api/messages')
        .set('Authorization', `Bearer ${socketToken}`)
        .send({
          city: 'Melbourne',
          ...MELBOURNE_AU,
          message: 'Storm warning',
          severity: 'alert',
        });

      const msg = await received;
      expect(msg).toMatchObject({
        city: 'Melbourne',
        latitude: MELBOURNE_AU.latitude,
        longitude: MELBOURNE_AU.longitude,
        message: 'Storm warning',
        severity: 'alert',
      });
      expect(msg.id).toEqual(expect.any(String));
    } finally {
      client.disconnect();
    }
  });

  it("does not deliver between two Melbournes (same name, different coords)", async () => {
    const auClient = await connect();
    const flClient = await connect();

    try {
      await joinCoords(auClient, MELBOURNE_AU);
      await joinCoords(flClient, MELBOURNE_FL);

      const auReceived: LiveMessage[] = [];
      const flReceived: LiveMessage[] = [];
      auClient.on('live-message', (msg: LiveMessage) =>
        auReceived.push(msg),
      );
      flClient.on('live-message', (msg: LiveMessage) =>
        flReceived.push(msg),
      );

      // Broadcast to AU Melbourne only.
      await request(socketApp)
        .post('/api/messages')
        .set('Authorization', `Bearer ${socketToken}`)
        .send({
          city: 'Melbourne',
          ...MELBOURNE_AU,
          message: 'AU only',
          severity: 'alert',
        });

      await new Promise((r) => setTimeout(r, 100));

      expect(auReceived).toHaveLength(1);
      expect(auReceived[0]?.message).toBe('AU only');
      expect(flReceived).toHaveLength(0);
    } finally {
      auClient.disconnect();
      flClient.disconnect();
    }
  });

  it('does not deliver to clients in other coordinate rooms', async () => {
    const melClient = await connect();
    const sydClient = await connect();

    try {
      await joinCoords(melClient, MELBOURNE_AU);
      await joinCoords(sydClient, SYDNEY_AU);

      const melReceived: LiveMessage[] = [];
      const sydReceived: LiveMessage[] = [];
      melClient.on('live-message', (msg: LiveMessage) =>
        melReceived.push(msg),
      );
      sydClient.on('live-message', (msg: LiveMessage) =>
        sydReceived.push(msg),
      );

      await request(socketApp)
        .post('/api/messages')
        .set('Authorization', `Bearer ${socketToken}`)
        .send({
          city: 'Sydney',
          ...SYDNEY_AU,
          message: 'Sydney alert',
          severity: 'alert',
        });

      await new Promise((r) => setTimeout(r, 100));

      expect(sydReceived).toHaveLength(1);
      expect(sydReceived[0]?.message).toBe('Sydney alert');
      expect(melReceived).toHaveLength(0);
    } finally {
      melClient.disconnect();
      sydClient.disconnect();
    }
  });

  it('moves a client between rooms when join-city is called again', async () => {
    const client = await connect();
    try {
      await joinCoords(client, MELBOURNE_AU);
      await joinCoords(client, SYDNEY_AU);

      const received: LiveMessage[] = [];
      client.on('live-message', (msg: LiveMessage) => received.push(msg));

      // Send to Melbourne — old room. Client should NOT receive it.
      await request(socketApp)
        .post('/api/messages')
        .set('Authorization', `Bearer ${socketToken}`)
        .send({
          city: 'Melbourne',
          ...MELBOURNE_AU,
          message: 'Old room',
          severity: 'info',
        });

      // Send to Sydney — current room. Client SHOULD receive it.
      await request(socketApp)
        .post('/api/messages')
        .set('Authorization', `Bearer ${socketToken}`)
        .send({
          city: 'Sydney',
          ...SYDNEY_AU,
          message: 'New room',
          severity: 'info',
        });

      await new Promise((r) => setTimeout(r, 100));

      expect(received).toHaveLength(1);
      expect(received[0]?.message).toBe('New room');
    } finally {
      client.disconnect();
    }
  });

  it('rejects join-city with invalid coordinates', async () => {
    const client = await connect();
    try {
      await expect(
        joinCoords(client, { latitude: 200, longitude: 0 }),
      ).rejects.toThrow(/invalid/i);
    } finally {
      client.disconnect();
    }
  });
});
