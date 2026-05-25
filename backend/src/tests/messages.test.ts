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

// ---------------------------------------------------------------------------
// Zod schemas — accept and reject payloads
// ---------------------------------------------------------------------------

describe('messageInputSchema', () => {
  it('accepts a valid message with explicit severity', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      message: 'Storm warning',
      severity: 'alert',
    });
    expect(result.success).toBe(true);
  });

  it('defaults severity to "info" when omitted', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      message: 'Test',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as { severity: string }).severity).toBe('info');
    }
  });

  it('accepts a message exactly 280 characters long', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      message: 'a'.repeat(280),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing city', () => {
    const result = messageInputSchema.safeParse({ message: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing message', () => {
    const result = messageInputSchema.safeParse({ city: 'Melbourne' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty city', () => {
    const result = messageInputSchema.safeParse({ city: '', message: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty message', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      message: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a message longer than 280 characters', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      message: 'a'.repeat(281),
    });
    expect(result.success).toBe(false);
  });

  it('rejects severity values outside info/warning/alert', () => {
    const result = messageInputSchema.safeParse({
      city: 'Melbourne',
      message: 'Test',
      severity: 'critical',
    });
    expect(result.success).toBe(false);
  });
});

describe('historyQuerySchema', () => {
  it('accepts a valid city query', () => {
    const result = historyQuerySchema.safeParse({ city: 'Melbourne' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing city', () => {
    const result = historyQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an empty city', () => {
    const result = historyQuerySchema.safeParse({ city: '' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// messages.store — ordering, per-city cap, city-key normalisation
// ---------------------------------------------------------------------------

describe('messages.store', () => {
  beforeEach(() => {
    clearMessages();
  });

  it('addMessage returns the stored message with id, severity and createdAt', () => {
    const msg = addMessage({
      city: 'Melbourne',
      message: 'Storm warning',
      severity: 'alert',
    });
    expect(msg.id).toEqual(expect.any(String));
    expect(msg.id.length).toBeGreaterThan(8);
    expect(msg.city).toBe('Melbourne');
    expect(msg.message).toBe('Storm warning');
    expect(msg.severity).toBe('alert');
    expect(msg.createdAt).toEqual(expect.any(String));
    // ISO timestamp — must round-trip through Date
    expect(Number.isNaN(Date.parse(msg.createdAt))).toBe(false);
  });

  it('getHistory returns messages for a city, newest first', async () => {
    addMessage({ city: 'Melbourne', message: 'First', severity: 'info' });
    await new Promise((r) => setTimeout(r, 5));
    addMessage({ city: 'Melbourne', message: 'Second', severity: 'warning' });
    await new Promise((r) => setTimeout(r, 5));
    addMessage({ city: 'Melbourne', message: 'Third', severity: 'alert' });

    const history = getHistory('Melbourne');
    expect(history).toHaveLength(3);
    expect(history[0]?.message).toBe('Third');
    expect(history[1]?.message).toBe('Second');
    expect(history[2]?.message).toBe('First');
  });

  it('scopes messages per city', () => {
    addMessage({ city: 'Melbourne', message: 'Mel msg', severity: 'info' });
    addMessage({ city: 'Sydney', message: 'Syd msg', severity: 'info' });

    expect(getHistory('Melbourne')).toHaveLength(1);
    expect(getHistory('Sydney')).toHaveLength(1);
    expect(getHistory('Melbourne')[0]?.message).toBe('Mel msg');
    expect(getHistory('Sydney')[0]?.message).toBe('Syd msg');
  });

  it('treats city names case-insensitively', () => {
    addMessage({ city: 'Melbourne', message: 'A', severity: 'info' });
    addMessage({ city: 'melbourne', message: 'B', severity: 'info' });
    addMessage({ city: 'MELBOURNE', message: 'C', severity: 'info' });

    expect(getHistory('Melbourne')).toHaveLength(3);
    expect(getHistory('melbourne')).toHaveLength(3);
    expect(getHistory('MELBOURNE')).toHaveLength(3);
  });

  it('trims whitespace from the city key', () => {
    addMessage({ city: 'Melbourne', message: 'A', severity: 'info' });
    addMessage({ city: '  Melbourne  ', message: 'B', severity: 'info' });

    expect(getHistory('Melbourne')).toHaveLength(2);
    expect(getHistory('  melbourne  ')).toHaveLength(2);
  });

  it('caps history at 50 messages per city, dropping the oldest', () => {
    for (let i = 0; i < 55; i++) {
      addMessage({
        city: 'Melbourne',
        message: `Msg ${i}`,
        severity: 'info',
      });
    }
    const history = getHistory('Melbourne');
    expect(history).toHaveLength(50);
    // Newest first; oldest five (Msg 0–4) dropped.
    expect(history[0]?.message).toBe('Msg 54');
    expect(history[49]?.message).toBe('Msg 5');
  });

  it('returns [] for a city with no messages', () => {
    expect(getHistory('Atlantis')).toEqual([]);
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
    const res = await request(app)
      .post('/api/messages')
      .send({ city: 'Melbourne', message: 'Test', severity: 'info' });
    expect(res.status).toBe(401);
  });

  it('returns 201 with the stored message on valid input', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        city: 'Melbourne',
        message: 'Storm warning',
        severity: 'alert',
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatchObject({
      city: 'Melbourne',
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
      .send({ city: 'Melbourne', message: 'No severity' });

    expect(res.status).toBe(201);
    expect(res.body.message.severity).toBe('info');
  });

  it('returns 400 when the message exceeds 280 characters', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ city: 'Melbourne', message: 'a'.repeat(281) });

    expect(res.status).toBe(400);
  });

  it('returns 400 when city is missing', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Test' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when severity is invalid', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        city: 'Melbourne',
        message: 'Test',
        severity: 'critical',
      });

    expect(res.status).toBe(400);
  });

  it('persists the message so subsequent GETs return it', async () => {
    await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ city: 'Melbourne', message: 'Persistent', severity: 'info' });

    const res = await request(app)
      .get('/api/messages?city=Melbourne')
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

  it('returns 401 without an auth token', async () => {
    const res = await request(app).get('/api/messages?city=Melbourne');
    expect(res.status).toBe(401);
  });

  it('returns the history for a city, newest first', async () => {
    addMessage({ city: 'Melbourne', message: 'First', severity: 'info' });
    await new Promise((r) => setTimeout(r, 5));
    addMessage({ city: 'Melbourne', message: 'Second', severity: 'warning' });

    const res = await request(app)
      .get('/api/messages?city=Melbourne')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0].message).toBe('Second');
    expect(res.body.messages[1].message).toBe('First');
  });

  it('returns 400 when the city query is missing', async () => {
    const res = await request(app)
      .get('/api/messages')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns an empty list for a city with no messages', async () => {
    const res = await request(app)
      .get('/api/messages?city=Atlantis')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// roomFor — city-to-room normalisation (unit)
// ---------------------------------------------------------------------------

describe('roomFor', () => {
  it('prefixes "city:" and lowercases the name', () => {
    expect(roomFor('Melbourne')).toBe('city:melbourne');
    expect(roomFor('MELBOURNE')).toBe('city:melbourne');
  });

  it('trims whitespace', () => {
    expect(roomFor('  Melbourne  ')).toBe('city:melbourne');
  });

  it('produces the same key for equivalent inputs', () => {
    expect(roomFor('Melbourne')).toBe(roomFor('  MELBOURNE  '));
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

  function joinCity(client: ClientSocket, city: string): Promise<void> {
    return new Promise((resolve, reject) => {
      client.emit(
        'join-city',
        city,
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

  it('delivers a live-message to the joined city room', async () => {
    const client = await connect();
    try {
      await joinCity(client, 'Melbourne');

      const received = new Promise<LiveMessage>((resolve) => {
        client.once('live-message', resolve);
      });

      await request(socketApp)
        .post('/api/messages')
        .set('Authorization', `Bearer ${socketToken}`)
        .send({
          city: 'Melbourne',
          message: 'Storm warning',
          severity: 'alert',
        });

      const msg = await received;
      expect(msg).toMatchObject({
        city: 'Melbourne',
        message: 'Storm warning',
        severity: 'alert',
      });
      expect(msg.id).toEqual(expect.any(String));
    } finally {
      client.disconnect();
    }
  });

  it('does not deliver to clients in other city rooms', async () => {
    const melClient = await connect();
    const sydClient = await connect();

    try {
      await joinCity(melClient, 'Melbourne');
      await joinCity(sydClient, 'Sydney');

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
          message: 'Sydney alert',
          severity: 'alert',
        });

      // Allow time for any errant emit to arrive.
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
      await joinCity(client, 'Melbourne');
      await joinCity(client, 'Sydney');

      const received: LiveMessage[] = [];
      client.on('live-message', (msg: LiveMessage) => received.push(msg));

      // Send to Melbourne — old room. Client should NOT receive it.
      await request(socketApp)
        .post('/api/messages')
        .set('Authorization', `Bearer ${socketToken}`)
        .send({ city: 'Melbourne', message: 'Old room', severity: 'info' });

      // Send to Sydney — current room. Client SHOULD receive it.
      await request(socketApp)
        .post('/api/messages')
        .set('Authorization', `Bearer ${socketToken}`)
        .send({ city: 'Sydney', message: 'New room', severity: 'info' });

      await new Promise((r) => setTimeout(r, 100));

      expect(received).toHaveLength(1);
      expect(received[0]?.message).toBe('New room');
    } finally {
      client.disconnect();
    }
  });
});
