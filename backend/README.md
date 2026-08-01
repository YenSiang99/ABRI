# ABRI backend

Node.js + Express API, PostgreSQL via Prisma. Schema lives in `prisma/schema.prisma`, modeled directly on the frontend's mock store layer (`frontend/src/lib/store/*.js`) — see the comments in the schema for what's intentionally different from the mock (real password hashing, no denormalized vouch counts, a uniqueness constraint on vouches, etc).

## Setup

1. `npm install`
2. Create a free Postgres database at [neon.tech](https://neon.tech), then copy its connection string (Neon dashboard → **Connect** → **Prisma** tab).
3. Paste it into `.env` as `DATABASE_URL` (copy `.env.example` if `.env` doesn't exist yet).
4. `npm run prisma:migrate` — creates the tables in your Neon database and generates the Prisma client. Prompts you to name the first migration (e.g. `init`).
5. `npm run dev` — starts the server on `http://localhost:4000` with auto-reload (Node's built-in `--watch`).

## Verifying it's connected

- `GET /health` — always returns `{ status: "ok" }`, doesn't touch the database.
- `GET /health/db` — runs a real query (`prisma.business.count()`). Returns an error until step 3–4 above are done with a real connection string.

## Scripts

- `npm run dev` — dev server with auto-reload
- `npm run start` — run once, no reload
- `npm run prisma:generate` — regenerate the Prisma client after editing `schema.prisma`
- `npm run prisma:migrate` — create/apply a migration after editing `schema.prisma`
- `npm run prisma:studio` — open Prisma's GUI to browse/edit data in the database
