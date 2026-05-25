# 0002 — In-memory storage

**Status:** Accepted
**Date:** 2026-05-25

## Context

Nimbus needs to persist three kinds of state:

- Users (one demo account for the challenge).
- Live message history, per city.
- A short-TTL weather cache.

The challenge brief explicitly permits in-memory storage. There is no
requirement for durability between restarts, no multi-instance deployment, and
no user-generated data that must survive process death.

## Decision

All state is held in process memory, behind small per-domain modules:

- `auth/users.store.ts` — a `Map<userId, User>`.
- `messages/messages.store.ts` — a `Map<cityKey, LiveMessage[]>` capped per city.
- The weather cache lives inside `weather/weather.service.ts`.

Each store exposes a narrow interface (`findByUsername`, `addMessage`, …) and
owns its own data structure. Stores are stateful singletons within the
process.

## Consequences

**Positive**

- Zero infrastructure. `npm run dev` and the demo is fully functional — a
  reviewer never installs a database.
- No schema migrations, no connection pooling, no ORM. The whole data layer
  reads in a few minutes.
- Tests run against the real stores; no mocking layer needed.

**Negative / mitigated**

- State is lost on restart. Acceptable here: the demo account is re-seeded on
  every boot, message history starts fresh, the weather cache warms up again.
- The app cannot scale horizontally — multiple instances would not share
  state. Out of scope for this challenge.
- bcrypt-hashing the demo password at boot adds ~80 ms to startup. Trivial.

## Migration path

Each store is the only thing that touches its data. Swapping any one to
Postgres / Redis / DynamoDB means rewriting one module (~50 lines), with no
changes to routes, services, or business logic. This isolation is
deliberate — the routes import `addMessage(...)`, not `db.messages.insert(...)`.
