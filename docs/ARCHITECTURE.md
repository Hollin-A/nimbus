# Architecture

Nimbus is a single-page React client talking to a Node API over two channels:
REST for request/response, and a WebSocket for server-pushed alerts. This
document covers the system shape, the city-room model, the key request flows,
and the module breakdown. Decision rationale lives in [adr/](adr/).

## System overview

```
        ┌──────────────────────────┐
        │        Browser           │
        │   React + Vite (PWA)     │
        │                          │
        │  AuthContext ─ tokens    │
        │  LiveMessagesProvider ─ socket
        └─────┬───────────────┬────┘
              │ REST (HTTPS)  │ WebSocket (Socket.IO)
              ▼               ▼
        ┌──────────────────────────────────────┐
        │            Express API                │
        │            Node + TypeScript          │
        │                                       │
        │  helmet → cors → rate-limit → json    │
        │  /api/auth   /api/weather             │
        │  /api/messages   /api/health          │
        │                                       │
        │  ┌────────────────────────────────┐   │
        │  │ Socket.IO server               │   │
        │  │  handshake auth (same JWT)     │   │
        │  │  rooms: city:<lat>|<lon>       │   │
        │  └────────────────────────────────┘   │
        │                                       │
        │  Prisma repos → PostgreSQL            │
        │   (users · messages · refresh/reset   │
        │    tokens) · in-memory weather cache  │
        └──────────┬──────────────────┬─────────┘
                   │ SQL (Prisma)      │ HTTPS (8s timeout + retry)
                   ▼                   ▼
        ┌──────────────────┐  ┌──────────────────────────┐
        │    PostgreSQL    │  │   Open-Meteo public API   │
        │ users · messages │  │   geocoding + forecast    │
        │ · tokens         │  └──────────────────────────┘
        └──────────────────┘
```

Deployment: the frontend is a static build served by Vercel; the backend runs
as a Docker container on Render. They share nothing but the public HTTP(S) +
WebSocket contract.

## The coordinate-keyed city-room model

Each city the user can watch is a Socket.IO **room**. The room key is the
city's **coordinates**, not its name:

```
roomFor(lat, lon) => `city:${lat.toFixed(4)}|${lon.toFixed(4)}`
```

A connected client joins exactly one room at a time — the city it is currently
viewing. `broadcastMessage(msg)` emits `live-message` only to
`io.to(roomFor(msg.latitude, msg.longitude))`.

```
POST /api/messages { city:"Melbourne", latitude:-37.81, longitude:144.96, ... }
        │
        ├─► messagesRepo.add()  → Postgres per-city history (cap 50)
        │
        └─► socket: io.to("city:-37.8100|144.9600").emit("live-message", msg)
                          │
            ┌─────────────┴───────────────┐
            ▼                              ▼
   Client A — joined                  Client C — joined
   city:-37.8100|144.9600             city:151.2100|-33.8700  (Sydney)
   → popup appears                    → receives nothing
```

**Why coordinates instead of name:** two cities can share a name (Melbourne,
Australia vs Melbourne, Florida). Name-keying would collapse them into one
alert stream — a flood warning for the Australian city would pop up for someone
watching the Floridian one. Coordinates (rounded to 4 dp, ~11m, the same
precision the weather cache uses) keep them distinct. The frontend's city
search resolves to a fully-qualified `City` object `(name, latitude,
longitude)`, so the publisher always targets a specific place. See
[ADR 0001](adr/0001-socketio-over-raw-ws.md).

The display `name` still rides along on every `LiveMessage` for rendering; it's
just not the routing key. The full Socket.IO event contract — handshake,
payloads, and acks — is documented in [openapi.yaml](openapi.yaml) (the
Socket.IO events section) and summarised in the README.

## Request flows

### Login

```
client  POST /api/auth/login { username, password }
server  bcrypt compare against the user row (Postgres)
server  → 200 { accessToken (15m JWT), refreshToken, user }  |  401  |  400
client  store both tokens; AuthContext status → "authed"
client  open an authenticated Socket.IO connection (auth: { token: accessToken })
```

On reload, `AuthProvider` restores the session: if an access token is in
localStorage it calls `GET /api/auth/me` (with a 10s timeout so a hung backend
can't strand the splash). A valid token rehydrates the user; an expired one is
recovered transparently by the refresh below; a dead session drops to `/login`.

### Access + refresh tokens

Access tokens are short (15 min) JWTs carrying `{ sub, username, role }`;
refresh tokens are opaque, random, stored **hashed** in Postgres with a 30-day
sliding window. The client's API layer refreshes transparently:

```
any request → 401
client  single-flight POST /api/auth/refresh { refreshToken }
server  validate + ROTATE → new access + new refresh (old refresh revoked)
server  reuse of an already-rotated token → revoke the whole token family
client  retry the original request with the new access token
```

A "single-flight" guard collapses the many 401s a page load can produce into
**one** refresh, so rotation doesn't race itself into a reuse-detection
logout. See [ADR 0007](adr/0007-refresh-token-rotation.md).

### Authorization (roles)

The user's `role` is a claim **in the access token**, so `requireRole('admin')`
is an in-memory check layered after `requireAuth` — no per-request DB hit. This
is safe only because access tokens are short: a role change takes effect on the
next token (≤15 min), or instantly if the user's refresh tokens are revoked.
`POST /api/messages` is the one admin-gated route; the frontend hiding the
Broadcast tab is convenience, not the boundary. See
[ADR 0008](adr/0008-role-in-access-token.md).

### Weather

```
client  GET /api/weather/cities?q=<query>      (debounced 300ms, prior request aborted)
server  → Open-Meteo geocoding → City[]
client  user picks a City (captures lat/lon)
client  GET /api/weather?lat&lon&name[&country]
server  cache hit (≤5 min)? → return it (re-applying caller's name/country)
server  else → Open-Meteo forecast → normalise (round temps, map WMO code) → cache → return
```

Upstream calls go through `fetchWithRetry` → `fetchWithTimeout`: an 8-second
timeout per attempt, up to 3 attempts with 200/400ms backoff on connection
errors or upstream 5xx (Render's free tier produces transient cold-start
failures). Our own timeout is **not** retried. Failures surface as a 502, which
the frontend renders as a retry card. See
[ADR 0004](adr/0004-open-meteo-weather-api.md).

### Broadcast → live delivery

```
publisher  POST /api/messages { city, latitude, longitude, message, severity? }
server     requireRole('admin') → validate → messagesRepo.add() → broadcastMessage()
server     → 201 { message }   AND   socket emit to the city room
watcher    useCityMessages receives "live-message"
watcher    → prepend to history (deduped) + fan out to ToastHost → popup
```

The per-city history a watcher sees on city-select comes from
`GET /api/messages` (REST); live messages while watching arrive over the socket
and are merged in (deduped by id). On reconnect, the client re-emits
`join-city` so it doesn't miss messages after a network blip.

## Module breakdown

### Backend (`backend/src`)

| Module | Responsibility |
|--------|----------------|
| `config.ts` | Typed, frozen env config parsed via Zod; fails fast on a default `JWT_SECRET`/`CORS_ORIGIN` in production |
| `app.ts` | `createApp()` — middleware stack, route mounts, global error handler (incl. `ZodError → 400`); importable by supertest without binding a port |
| `index.ts` | HTTP server bootstrap, `initSocket()`, and `seed()` before listen |
| `db.ts` | The shared Prisma client |
| `seed.ts` | Idempotent seed of the `admin` / `viewer` demo accounts |
| `prisma/schema.prisma` | Data model — users, messages, refresh + password-reset tokens (+ migrations) |
| `auth/*.repo.ts` | Prisma repositories: `usersRepo`, `refreshTokensRepo`, `passwordResetTokensRepo` |
| `auth/auth.service.ts` | `authenticate()`, access-token sign/verify, refresh rotation + reuse detection, password reset |
| `auth/auth.middleware.ts` | `requireAuth` (Bearer → `req.auth`) + `requireRole(role)` |
| `auth/auth.routes.ts` | login, register, refresh, logout, password-reset ×2, `GET /me` |
| `weather/weather.service.ts` | Open-Meteo proxy, WMO→icon mapping, cache, timeout + retry |
| `weather/weather.routes.ts` | `GET /cities`, `GET /` (auth + validated) |
| `messages/messages.repo.ts` | Per-city history in Postgres, capped 50, newest-first |
| `messages/messages.routes.ts` | `POST /` (admin → validate → store → broadcast), `GET /` (history) |
| `middleware/validation.ts` | `validateBody` / `validateQuery` — safeParse, forward a `ZodError` to the handler |
| `middleware/request-context.ts` | Per-request id + child logger |
| `realtime/socket.ts` | Socket.IO server, handshake auth, `roomFor`, `broadcastMessage` |

### Frontend (`frontend/src`)

| Module | Responsibility |
|--------|----------------|
| `api/client.ts` | Typed fetch wrapper (`ApiError`, 15s timeout, optional abort signal) + transparent 401 → refresh → retry with single-flight |
| `auth/context.ts` + `AuthContext.tsx` + `useAuth.ts` | Session state (access + refresh), restore-on-mount with timeout, cross-tab logout sync, periodic `/me` ping |
| `auth/ProtectedRoute.tsx` | Redirects anon users to `/login` (stashing the attempted path) |
| `socket/LiveMessagesProvider.tsx` | Owns the socket lifecycle + connection status |
| `socket/useLiveMessages.ts` | `useConnectionStatus()` + `useCityMessages(city)` (room join, history, live merge, `subscribe` fan-out) |
| `components/CitySearch.tsx` | Headless UI combobox — debounced, abortable search; recent-city chips ([ADR 0009](adr/0009-combobox-headless-ui.md)) |
| `components/WeatherCard.tsx` | Hero + metric tiles; empty / loading / offline / error variants |
| `components/StatusBanner.tsx` | Unified error / success / info banner used across pages |
| `components/ToastHost.tsx` + `Toast.tsx` | Top-right toast stack (max 3, 7s, per-toast timers), driven by a subscription |
| `components/MessageHistory.tsx` | Per-city alert list with relative times |
| `components/MobileTabBar.tsx` · `OfflineNotice.tsx` · `InstallPrompt.tsx` | Mobile nav, offline banner, PWA install chip |
| `pages/` | `LoginPage`, `RegisterPage`, `PasswordReset*Page`, `HomePage`, `BroadcastPage` |

## Testing strategy

The core backend domain logic is built **test-first** — the commit history
shows a `test(...)` commit (the failing spec) immediately preceding the
`feat(...)` commit that makes it pass, for auth, weather, and messages. HTTP
endpoints follow outside-in TDD via supertest; the Socket.IO integration is
covered by tests that run a real `socket.io-client` against a real HTTP server.
React components are tested with Testing Library using semantic queries.
Totals: 159 backend tests, 130 frontend tests.
