# 0003 — JWT authentication

**Status:** Accepted
**Date:** 2026-05-25

## Context

The brief requires username/password login. The frontend is a single-page app;
the API must authenticate both REST calls and the Socket.IO handshake. Three
plausible options:

1. **Stateful session cookie** — server holds session state, browser holds an
   opaque cookie ID.
2. **JWT in `Authorization: Bearer` header** — server holds nothing; the token
   is self-describing and self-verifying.
3. **OAuth via a third-party identity provider** — overkill for a single demo
   account in a take-home challenge.

## Decision

Use stateless JWTs signed with HS256.

- Issued by `POST /api/auth/login` after a bcrypt password verification.
- Sent by the client in `Authorization: Bearer <token>` for REST, and in the
  `auth.token` field of the Socket.IO handshake.
- Payload: `{ sub: userId, username }`.
- Lifetime: 2 hours (configurable via `JWT_EXPIRES_IN`).
- Secret: `JWT_SECRET` from env. The app refuses to boot in production if it
  is still the development default (`config.ts`).
- Passwords are hashed with bcryptjs (cost 10) at seed time. The
  `authenticate()` function uses `bcrypt.compareSync` against the stored hash,
  and runs a dummy compare on the "unknown user" path to keep wall-clock cost
  roughly uniform — a cheap username-enumeration timing defence.

## Consequences

**Positive**

- No session store needed — aligned with ADR 0002 (in-memory everything). The
  server can restart without invalidating tokens.
- One auth path serves two transports. The same JWT authenticates REST and
  the WebSocket handshake; no second auth mechanism to design or test.
- Cross-origin friendly. No cookie/CORS interaction, no SameSite footguns.

**Negative / mitigated**

- Tokens cannot be revoked before expiry. For one demo account with a 2-hour
  lifetime this is fine; in a real product we would add a server-side
  revocation set keyed by JWT `jti`.
- Tokens are stored client-side in `localStorage`, which is XSS-readable. The
  alternative — httpOnly cookies — trades XSS exposure for CSRF exposure, a
  different bug. Helmet's default CSP mitigates the XSS risk.
- A leaked `JWT_SECRET` is total compromise. Hence the production fail-fast
  check at startup.

## Library choices

- `jsonwebtoken` for sign/verify — the de-facto Node JWT library.
- `bcryptjs` (pure-JS) over `bcrypt` (native) — same API, no native build
  step. Easier to Dockerize and avoids platform-specific install issues for
  reviewers running the repo cold.
