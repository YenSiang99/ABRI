# ABRI backend

Node.js + Express API, PostgreSQL via Prisma. Schema lives in `prisma/schema.prisma`, modeled directly on the frontend's mock store layer (`frontend/src/lib/store/*.js`) — see the comments in the schema for what's intentionally different from the mock (real password hashing, no denormalized vouch counts, a uniqueness constraint on vouches, etc).

## Setup

1. `npm install`
2. Start Postgres 16 — the version the EC2 host runs, so a migration that applies locally applies there. Either:
   - Homebrew: `brew install postgresql@16`, then `LC_ALL=en_US.UTF-8 /opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 start`. `LC_ALL` is not optional on macOS — without it the postmaster exits with "became multithreaded during startup". Then `createuser -s abri` and `createdb -O abri abri`.
   - Docker: `docker compose -f ../deploy/docker-compose.local.yml up -d`, which creates the role and database for you.
3. `cp .env.example .env` — the defaults already point at that container.
4. `npm run prisma:migrate` — creates the tables and generates the Prisma client. Prompts you to name the first migration (e.g. `init`).
5. `npm run dev` — starts the server on `http://localhost:4000` with auto-reload (Node's built-in `--watch`).

## Verifying it's connected

- `GET /health` — always returns `{ status: "ok" }`, doesn't touch the database.
- `GET /health/db` — runs a real query (`prisma.business.count()`). Returns an error until steps 2–4 above are done.

## Scripts

- `npm run dev` — dev server with auto-reload
- `npm run start` — run once, no reload
- `npm run prisma:generate` — regenerate the Prisma client after editing `schema.prisma`
- `npm run prisma:migrate` — create/apply a migration after editing `schema.prisma`
- `npm run prisma:studio` — open Prisma's GUI to browse/edit data in the database
