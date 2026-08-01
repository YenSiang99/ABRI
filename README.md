# ABRI

The verified business network for Malaysia. See `ABRI-master-blueprint.md` for the product blueprint.

## Layout

- `frontend/` — React + Vite app (see `frontend/README.md`)
- `backend/` — Node.js + Express API, PostgreSQL via Prisma (see `backend/README.md`)

## Getting started

```sh
cd frontend && npm install && npm run dev

cd backend && npm install && npm run dev
```

The backend needs a `DATABASE_URL` in `backend/.env` — see `backend/.env.example`.
