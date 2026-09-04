# The ABRI backend as a container image. Single-stage on purpose: `prisma` is a
# runtime dependency now (the entrypoint runs `migrate deploy`), so devDependencies
# is empty and a build stage would install exactly the same tree twice.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./

# The schema has to be in place before `npm ci`, because @prisma/client's
# postinstall generates the client against it. Copying it here rather than after
# the install means editing the schema re-runs the install — which is the point:
# a generated client that has drifted from the schema is the failure this
# ordering exists to prevent.
COPY prisma ./prisma

# prisma.config.ts is what the CLI actually reads — it sets the schema path,
# the migrations path and the datasource. Leave it out and the container
# resolves its config differently from every local run, which is exactly the
# kind of difference that only shows up during a deploy.
COPY prisma.config.ts ./

RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY src ./src
COPY scripts ./scripts
COPY docker-entrypoint.sh ./

# node:22-alpine ships an unprivileged `node` user. Nothing here is written to
# at runtime, so the app never needs to own its own files.
USER node

EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
