# ADR 0006 — Postgres + Prisma for persistence

**Status:** accepted

## Context

ADR 0002 chose in-memory storage for v1 with an explicit trade-off:
zero infrastructure for reviewers, at the cost of all state resetting
on every restart. That trade-off comes due in v2 — real accounts,
durable message history, and revocable sessions (ADR 0007) all require
a database as the source of truth.

Two decisions: which database, and which access layer.

## Decision

**Postgres 16**, accessed through **Prisma** (v6), with migrations
managed by `prisma migrate` and tracked in
`backend/prisma/migrations/`. Route code never touches the Prisma
client directly — a thin repository layer (`usersRepo`, `messagesRepo`,
`refreshTokensRepo`) wraps it, so tests mock at the repo boundary and a
future access-layer swap stays cheap.

### Why Postgres

Boring, ubiquitous, free-tier hosted options, and the relational shape
fits the data (users → refresh tokens is a textbook foreign key; the
message-history query is one composite index).

### Why Prisma (over Drizzle)

- The most mature migration tooling in the ecosystem: generated SQL
  migrations, drift detection, `migrate deploy` for CI/production.
- `schema.prisma` reads as documentation — a reviewer learns the whole
  data model from one declarative file.
- Costs, accepted consciously: a query-engine binary in the Docker
  image (linux-musl target + openssl on alpine, ~15-20 MB) and a
  `prisma generate` codegen step before build. Drizzle is lighter and
  more SQL-transparent; for this codebase the migration story and
  schema legibility outweigh that.
- Pinned to Prisma 6 (`^6`): Prisma 7 shipped recently; a fresh major
  and a stable submission repo are a bad mix. Upgrade is routine later.

### Databases per environment

| Environment | Database |
|---|---|
| Local dev | compose `postgres` service, published on `localhost:5432` |
| Tests (local + CI) | same instance, separate `nimbus_test` database; CI runs a `postgres` service container |
| Staging (when deployment resumes) | Neon, `dev` branch |
| Production | Neon, `main` branch |

Local dev never points at a deployed database. **Neon over Supabase**
for the hosted tiers: free Supabase projects pause after roughly a week
of inactivity and require a manual dashboard unpause — the wrong
failure mode for a portfolio demo that must work whenever a reviewer
clicks the link. Neon auto-suspends but auto-wakes on the next
connection (~500 ms), and its copy-on-write branching gives staging a
production-shaped database for free.

## Consequences

- `docker compose up` now also starts Postgres (named volume, fail-loud
  password, healthcheck-gated backend start).
- Backend tests require a reachable Postgres — locally via the compose
  service, in CI via a service container. The suite is no longer
  network-free, which is the honest cost of testing real persistence.
- The in-memory stores from ADR 0002 are replaced by repos during this
  phase's cutover; the ADR 0002 design (stores behind small modules)
  is what makes that cutover a per-module swap rather than a rewrite.
