# ADR 0008 — Role in the access token

**Status:** accepted

## Context

Nimbus has one privileged action — broadcasting alerts to a city. It
needs authorization, not just authentication. The question is *where the
role is read from* on each request:

- **In the access token** — the role is a claim, checked in memory.
- **Per request** — look the user's role up in the database on every
  authorized request.

A single `role` enum (`admin | user`) is enough; a roles/permissions
matrix is out of scope.

## Decision

**Put the role in the access token.** It's signed into the JWT from the
DB user at login and refresh, and `requireRole('admin')` reads it off the
already-verified claims (`req.auth.role`) with **no database hit** on the
request path.

This is only safe because access tokens are now short-lived (15 min, ADR
0007). The cost of role-in-JWT is staleness: a role change takes effect
on the user's next token, i.e. within 15 minutes — or **instantly** if
you revoke their refresh tokens (which forces a re-login that mints a
fresh, role-correct token). With v1's 2-hour tokens this staleness would
have been a real bug; short tokens make it a non-issue. That ordering is
why role-based authz came after refresh tokens.

| | Role in the JWT *(chosen)* | Per-request lookup |
|---|---|---|
| Request cost | zero DB hits | one `findById` per authorized request |
| Freshness | ≤15 min, or instant via refresh-token revocation | always current |
| Why it fits | safe because tokens are short (ADR 0007) | simpler, but adds DB load |

## Consequences

- `requireRole` is a pure in-memory check layered after `requireAuth`.
  401 = not authenticated (refreshable); 403 = authenticated, wrong role.
- `POST /api/messages` is admin-only on the server — the real boundary.
  The frontend hiding the Broadcast nav/tab and redirecting `/broadcast`
  is convenience, not security.
- `verifyToken` requires a valid `role` claim, so a token minted before
  this shipped is rejected (401) and the client's transparent refresh
  mints a role-bearing replacement — no forced logout.
- A role demoted mid-session keeps its privilege until the access token
  expires (≤15 min) or its refresh tokens are revoked. Acceptable for
  this app; revocation is the lever when an instant cut is needed.
