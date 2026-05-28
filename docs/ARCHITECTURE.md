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
        │  AuthContext ─ token     │
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
        │  In-memory stores:                    │
        │   users · messages (per city) · cache │
        └─────────────────┬────────────────────┘
                          │ HTTPS (fetch, 8s timeout + retry)
                          ▼
        ┌──────────────────────────┐
        │   Open-Meteo public API   │
        │  geocoding + forecast     │
        └──────────────────────────┘
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
        ├─► messages.store.addMessage()  → in-memory per-city history (cap 50)
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
just not the routing key.

## Request flows

### Login

```
client  POST /api/auth/login { username, password }
server  bcrypt.compareSync against the seeded user
server  → 200 { token (JWT), user }   |  401 invalid  |  400 missing fields
client  store token in localStorage; AuthContext status → "authed"
client  open an authenticated Socket.IO connection (auth: { token })
```

On reload, `AuthProvider` restores the session: if a token is in localStorage it
calls `GET /api/auth/me`; a valid token rehydrates the user, an invalid/expired
one is dropped and the user lands on `/login`. The splash screen shows during
this check.

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
server     Zod-validate → messages.store.addMessage() → broadcastMessage()
server     → 201 { message }   AND   socket emit to the city room
watcher    useCityMessages receives "live-message"
watcher    → prepend to history, set "latest" → ToastHost shows a popup
```

The per-city history a watcher sees on city-select comes from
`GET /api/messages` (REST); live messages while watching arrive over the socket
and are merged in (deduped by id). On reconnect, the client re-emits
`join-city` so it doesn't miss messages after a network blip.

## Module breakdown

### Backend (`backend/src`)

| Module | Responsibility |
|--------|----------------|
| `config.ts` | Typed, frozen env config parsed via Zod; fails fast on a default `JWT_SECRET` in production |
| `app.ts` | `createApp()` — middleware stack + route mounts; importable by supertest without binding a port |
| `index.ts` | HTTP server bootstrap + `initSocket()` |
| `auth/users.store.ts` | In-memory users, bcrypt seeding of the demo account |
| `auth/auth.service.ts` | `authenticate()`, JWT sign/verify, timing-safe unknown-user path |
| `auth/auth.middleware.ts` | `requireAuth` — Bearer parsing, attaches `req.auth` |
| `auth/auth.routes.ts` | `POST /login`, `GET /me` |
| `weather/weather.service.ts` | Open-Meteo proxy, WMO→icon mapping, cache, timeout + retry |
| `weather/weather.routes.ts` | `GET /cities`, `GET /` (both auth + Zod-validated) |
| `messages/messages.schema.ts` | Zod schemas (input + history query) |
| `messages/messages.store.ts` | `Map<cityKey, LiveMessage[]>`, capped 50, newest-first |
| `messages/messages.routes.ts` | `POST /` (validate → store → broadcast), `GET /` (history) |
| `realtime/socket.ts` | Socket.IO server, handshake auth, `roomFor`, `broadcastMessage` |

### Frontend (`frontend/src`)

| Module | Responsibility |
|--------|----------------|
| `api/client.ts` | Typed fetch wrapper (`ApiError`, 15s timeout, optional caller abort signal) + endpoint functions |
| `auth/context.ts` + `AuthContext.tsx` + `useAuth.ts` | Session state, restore-on-mount, login/logout |
| `auth/ProtectedRoute.tsx` | Redirects anon users to `/login` |
| `socket/LiveMessagesProvider.tsx` | Owns the socket lifecycle + connection status |
| `socket/useLiveMessages.ts` | `useConnectionStatus()` + `useCityMessages(city)` (room join, history, live merge) |
| `components/CitySearch.tsx` | Debounced search, abortable, dropdown + recent chips |
| `components/WeatherCard.tsx` | Hero + metric tiles; empty / loading / error variants |
| `components/ToastHost.tsx` + `Toast.tsx` | Top-right toast stack (max 3, 7s, per-toast timers) |
| `components/MessageHistory.tsx` | Per-city alert list with relative times |
| `components/MobileTabBar.tsx` · `OfflineNotice.tsx` · `InstallPrompt.tsx` | Mobile nav, offline banner, PWA install chip |
| `pages/` | `LoginPage`, `HomePage`, `BroadcastPage` |

## Testing strategy

The core backend domain logic is built **test-first** — the commit history
shows a `test(...)` commit (the failing spec) immediately preceding the
`feat(...)` commit that makes it pass, for auth, weather, and messages. HTTP
endpoints follow outside-in TDD via supertest; the Socket.IO integration is
covered by tests that run a real `socket.io-client` against a real HTTP server.
React components are tested with Testing Library using semantic queries.
Totals: 85 backend tests, 53 frontend tests.
