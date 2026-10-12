#!/usr/bin/env bash
# Brings a server database up to the current data/seed/listings.csv.
#
#   bash backend/scripts/load-seed-data.sh dev     # abri_dev
#   bash backend/scripts/load-seed-data.sh prod    # abri
#
# RUN IT AFTER THE DEPLOY, never before: the deploy applies the migrations
# these scripts write to (map points, SourceRecord, …).
#
# Steps:
#   1. a backup of the database on the host, before anything is written
#   2. sync-seed-names  — only when an earlier import into this database has
#                         a manifest: names, points, ids; drops rows the merge
#                         has since ruled out
#   3. import-seed      — inserts every listing not already there
#   4. sync-seed-fields — phone / WhatsApp / email into empty columns
#   5. sync-source-records — which source said what (SourceRecord)
# Every write touches only untouched listings (L0, no account): a business a
# member has claimed is never changed.
#
# The database URL is read from the host's /etc/abri/<target>.env (the one
# that server's container uses) and pointed at an SSH tunnel on local port
# 5433, so the password is never typed or printed.
set -euo pipefail

TARGET="${1:-}"
case "$TARGET" in
  dev)  DB=abri_dev ;;
  prod) DB=abri ;;
  *) echo "Usage: $0 dev|prod"; exit 1 ;;
esac

KEY="${ABRI_SSH_KEY:-$HOME/Downloads/abri.pem}"
HOST="${ABRI_SSH_HOST:-ec2-user@ec2-43-216-217-161.ap-southeast-5.compute.amazonaws.com}"
STAMP=$(date +%Y%m%d-%H%M)

cd "$(dirname "$0")/.."

REMOTE_URL=$(ssh -i "$KEY" "$HOST" "sudo grep -E '^DATABASE_URL=' /etc/abri/$TARGET.env | head -1 | cut -d= -f2-" | tr -d "\"'")
DATABASE_URL=$(printf '%s' "$REMOTE_URL" | sed -E 's#@[^/]+/#@localhost:5433/#')
# The database name in the URL must be exactly the one this target means,
# or nothing runs: "abri" and "abri_dev" share a server.
URL_DB=$(printf '%s' "$DATABASE_URL" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')
if [ "$URL_DB" != "$DB" ]; then
  echo "/etc/abri/$TARGET.env points at database '$URL_DB', not '$DB'; stopping"
  exit 1
fi

if [ "$TARGET" = prod ]; then
  read -r -p "This writes to PROD ($DB). Type 'prod' to continue: " ok
  [ "$ok" = prod ] || { echo "Stopped."; exit 1; }
fi

echo "== 1. Backup $DB on the host"
BACKUP="/srv/abri/backups/$DB-before-seed-load-$STAMP.dump"
ssh -i "$KEY" "$HOST" "sudo -u postgres pg_dump -Fc $DB | sudo tee $BACKUP > /dev/null && ls -la $BACKUP"

echo "== Opening the tunnel"
ssh -i "$KEY" -f -N -o ExitOnForwardFailure=yes -L 5433:localhost:5432 "$HOST"
trap 'pkill -f "5433:localhost:5432" || true' EXIT
sleep 2

export DATABASE_URL
export ABRI_IMPORT_CONFIRM="localhost:5433/$DB"

# Every earlier import into this database has a manifest; each one is
# brought in line (sync-seed-names only touches the rows its manifest lists).
MANIFESTS=$(ls ../data/seed/imports/localhost-5433-"$DB"-20*.csv 2>/dev/null | grep -v -- "-names-\|-fields-" || true)
if [ -n "$MANIFESTS" ]; then
  for MANIFEST in $MANIFESTS; do
    echo "== 2. Names, points, ids (manifest $(basename "$MANIFEST"))"
    node scripts/sync-seed-names.mjs --manifest "$MANIFEST" --apply
  done
else
  echo "== 2. No earlier import into $DB: nothing to rename"
fi
echo "== 3. New listings"
node scripts/import-seed.mjs --apply
echo "== 4. Contacts"
node scripts/sync-seed-fields.mjs --apply
echo "== 5. Source records"
node scripts/sync-source-records.mjs --apply

echo "== Done. Backup: $BACKUP"
