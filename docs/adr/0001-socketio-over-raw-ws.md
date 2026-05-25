# 0001 — Socket.IO over raw `ws`

**Status:** Accepted
**Date:** 2026-05-25

## Context

The brief requires real-time push of messages to clients watching a specific
city. Three plausible transports:

1. **Raw WebSockets** via Node's `ws` library.
2. **Socket.IO** — a higher-level layer over WebSockets, with its own client.
3. **Server-Sent Events (SSE)** — one-way HTTP streaming.

The brief explicitly allows "WebSockets or an equivalent real-time solution."

## Decision

Use Socket.IO on both sides — `socket.io@4` on the server,
`socket.io-client@4` on the client.

Each city is a **room** named `city:<lowercased-trimmed-name>` (the
normalisation lives in `roomFor()`). A connected client joins exactly one
room at a time — the city it is currently viewing.
`broadcastMessage(msg)` emits `live-message` to `io.to(roomFor(msg.city))`
only.

Handshake auth uses the same JWT issued by `POST /api/auth/login`, sent as
`auth: { token }` on the Socket.IO handshake. A middleware verifies the
token; bad or missing tokens are rejected before the connection completes
(see ADR 0003).

## Consequences

**Positive**

- **Rooms are first-class.** `socket.join('city:melbourne')` and
  `io.to('city:melbourne').emit(...)` are one-liners. The same shape on raw
  `ws` would mean hand-rolling a subscriber registry, threading add/remove
  on join/leave/disconnect, and dealing with corner cases (reconnects,
  leaks).
- **Reconnection, transport fallback, and explicit `connect_error`** events
  come for free. Long-polling fallback matters for corporate networks that
  proxy or block raw WebSocket upgrades.
- **One auth path covers both transports.** The `verifyToken()` used by
  `requireAuth` is the same one the socket middleware calls. No second
  auth mechanism to design or test.
- The client library (`socket.io-client`) is what the frontend's
  `useLiveMessages` hook uses, so the server/client wire format matches by
  construction.

**Negative / mitigated**

- ~25 KB minified added to the client bundle. Acceptable for an installed
  PWA. Smaller than the gain from not hand-rolling rooms.
- Server emits framed in Socket.IO's protocol, not raw WS frames —
  incompatible with `wscat`. Mitigated by documenting the events in the
  README and in `docs/openapi.yaml`.
- One extra dep on each side.

## Why not the alternatives

- **Raw `ws`** — would require ~80 lines of plumbing for what Socket.IO
  gives in 10. The "we save bundle size" argument doesn't hold for a code
  challenge that explicitly allows the abstraction.
- **Server-Sent Events** — one-way (server → client) only. Fine for
  broadcasts, but `join-city` / `leave-city` are client → server, so we'd
  still need a second channel. Not worth the asymmetry.
