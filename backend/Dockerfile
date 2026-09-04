# The ABRI backend as a container image. Single-stage on purpose: `prisma` is a
# runtime dependency now (the entrypoint runs `migrate deploy`), so devDependencies
# is empty and a build stage would install exactly the same tree twice.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./

# The schema is copied before the install so that editing it invalidates this
# layer and everything after it — a generated client that has drifted from the
# schema is the failure this ordering exists to prevent.
COPY prisma ./prisma

# prisma.config.ts is what the CLI actually reads — it sets the schema path,
# the migrations path and the datasource. Leave it out and the container
# resolves its config differently from every local run, which is exactly the
# kind of difference that only shows up during a deploy.
COPY prisma.config.ts ./

RUN npm ci --omit=dev --no-audit --no-fund

# Generated EXPLICITLY, not left to @prisma/client's postinstall. That hook does
# not run here — prisma.config.ts takes over config resolution, and on Prisma 6
# an --omit=dev install produced an image carrying only the stub
# node_modules/.prisma/client (no query engine binary at all). `migrate deploy`
# still worked, because it needs no client, so the container applied its
# migrations and then died on the first import with "@prisma/client did not
# initialize yet" — a failure that looks like a database problem and isn't.
#
# The placeholder URL is required and never dialled. prisma.config.ts resolves
# env("DATABASE_URL") when the CLI LOADS the config, before it knows the command
# needs no database, so a build with it unset dies at
# "PrismaConfigEnvError: Missing required environment variable: DATABASE_URL".
# The real value is injected at runtime from /etc/abri/*.env. DIRECT_URL is not
# needed: generate never reads it.
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
      npx prisma generate \
    && npm cache clean --force

COPY src ./src
COPY scripts ./scripts
COPY docker-entrypoint.sh ./

# node:22-alpine ships an unprivileged `node` user. Nothing here is written to
# at runtime, so the app never needs to own its own files.
USER node

EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
