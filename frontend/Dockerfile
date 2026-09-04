# ---------------------------------------------------------------------------
# Build stage. Runs on a GitHub-hosted runner, never on the EC2 host — a Vite
# build peaks around 1.5 GB and the box has 913 MiB total.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# VITE_API_URL is inlined at build time, and .env.production sets it to "/api".
# Every environment proxies the backend on its own origin (host nginx does the
# rewrite), so this one build is correct for dev and prod alike — they differ
# only in which image tag a container is running.
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage — ~12 MB, no Node, no source, just the built assets.
# ---------------------------------------------------------------------------
FROM nginx:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
