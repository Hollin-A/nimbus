# ADR 0007 — Refresh-token model & rotation policy

**Status:** accepted

## Context

v1 issued a single 2-hour access JWT at login (ADR 0003) with no
revocation: a leaked token was valid for its full lifetime, logout
invalidated nothing, and the only kill switch was rotating `JWT_SECRET`
— which logs every user out at once. ADR 0003 flagged this as an
accepted v1 trade-off; v2 resolves it.

## Decision

Two token types:

- **Access token** — short-lived (15 min), JWT, HS256, sent as the
  `Bearer` credential on every request. If it leaks it's useless within
  15 minutes.
- **Refresh token** — opaque random (`randomBytes(32)`), stored only as a
  sha256 hash in `refresh_tokens`, used solely at `/api/auth/refresh`.
  Database-backed rather than a JWT *precisely so it can be revoked* —
  logout, rotation and reuse detection all depend on that.

### Rotation

`/refresh` does not just mint a new access token — it **rotates**: the
presented refresh token is revoked and a brand-new access + refresh pair
is issued. A stolen refresh token is therefore usable at most once before
it's revoked.

### Reuse detection

Because a token is revoked the instant it's used, encountering an
**already-revoked** refresh token at `/refresh` means the chain is
compromised — either a thief replaying a stolen token, or the legitimate
user racing a thief who rotated first. The response is to revoke the
user's **entire token family** (`revokeAllForUser`) and 401, forcing both
parties to re-authenticate. This is what makes the sliding window (below)
safe.

### Sliding window, not absolute expiry

Each rotation issues a refresh token with a **fresh** 30-day expiry, so
an active user is never logged out; only 30 days of *inactivity* ends the
session. We accept the sliding window because reuse detection bounds a
stolen token's damage regardless. An absolute cap (the chain expiring a
fixed time after the original login) would add defense-in-depth at the
cost of logging active users out periodically — not worth it here.

### Logout

`/logout` revokes the presented refresh token (idempotent). The client
calls it on logout but logs out locally regardless of the result.

### Client storage & transparent refresh

The refresh token is kept in `localStorage` alongside the access token —
consistent with v1, no CORS-credentials/CSRF machinery. The trade-off:
both are readable by an XSS payload. An httpOnly cookie for the refresh
token (unreadable by JS) is the production hardening, deferred post-v2;
acceptable here as a demo with no real user data.

The client refreshes **reactively**, on a 401 from an authenticated
request — it never inspects the (opaque, unreadable) refresh token's
expiry. Concurrent 401s share a **single in-flight refresh** so rotation
+ reuse detection don't trip over a self-inflicted replay. On a live
WebSocket the access token expiring mid-session does not drop the
connection (handshake auth is one-time); reconnects read the freshest
token. Periodic re-validation of long-lived sockets is a documented
post-v2 item.

## Consequences

- Sessions are revocable (logout means something) and stolen-token reuse
  is detectable and self-healing.
- The access token's short life limits the blast radius of a leak; the
  refresh token's storage in `localStorage` is the residual XSS exposure,
  documented above.
- `JWT_EXPIRES_IN` now defaults to 15m (was 2h).
