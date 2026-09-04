#!/bin/sh
# Applies any pending migrations before the new code serves a single request —
# the same guarantee render.yaml's buildCommand used to give us. It matters more
# than "the new feature works": every Vouch read joins through currentRevision
# (src/lib/accountView.js), so code running against the old tables breaks login
# and the public profile, not just the thing that changed.
#
# `set -e` is what makes it a guarantee rather than a hope. A failed migration
# has to kill the container so Docker's restart policy leaves the previous one
# serving, instead of starting a server on a half-migrated database.
#
# Safe to run on every start: it's a no-op when the database is already current.
set -e

echo "==> Applying migrations"
npx prisma migrate deploy

echo "==> Starting ABRI backend"
exec node src/index.js
