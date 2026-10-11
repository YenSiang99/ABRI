#!/usr/bin/env bash
# Brings the dev database (abri_dev on the EC2 host) up to the current
# data/seed/listings.csv, the same steps local `abri` went through:
#
#   1. a backup of abri_dev on the host, before anything is written
#   2. sync-seed-names  — names, map points and ids of the 26 Sep import;
#                         drops rows the merge has since ruled out
#   3. import-seed      — inserts the new listings (registers, CIDB, …)
#   4. sync-seed-fields — phone / WhatsApp / email into empty columns
#   5. sync-source-records — which source said what (SourceRecord)
#
# Every write touches only untouched listings (L0, no account).
#
# Usage, from anywhere:
#   bash backend/scripts/load-dev-data.sh
#
# The database URL is read from the host's /etc/abri/dev.env (the one the
# dev container uses) and pointed at the tunnel, so the password is never
# typed or printed. DEV_DATABASE_URL overrides it.
#
# It opens the SSH tunnel (local 5433 → host 5432) itself and closes it at
# the end.
set -euo pipefail

KEY="${ABRI_SSH_KEY:-$HOME/Downloads/abri.pem}"
HOST="${ABRI_SSH_HOST:-ec2-user@ec2-43-216-217-161.ap-southeast-5.compute.amazonaws.com}"
if [ -z "${DEV_DATABASE_URL:-}" ]; then
  REMOTE_URL=$(ssh -i "$KEY" "$HOST" "sudo grep -E '^DATABASE_URL=' /etc/abri/dev.env | head -1 | cut -d= -f2-" | tr -d "\"'")
  # Whatever host:port the container uses becomes the tunnel's end.
  DEV_DATABASE_URL=$(printf '%s' "$REMOTE_URL" | sed -E 's#@[^/]+/#@localhost:5433/#')
  [ -n "$DEV_DATABASE_URL" ] || { echo "No DATABASE_URL in /etc/abri/dev.env"; exit 1; }
  case "$DEV_DATABASE_URL" in
    */abri_dev*) ;;
    *) echo "dev.env's DATABASE_URL isn't abri_dev; stopping"; exit 1 ;;
  esac
fi
MANIFEST="data/seed/imports/localhost-5433-abri_dev-2026-09-26T05-43-30-859Z.csv"
STAMP=$(date +%Y%m%d-%H%M)

cd "$(dirname "$0")/.."

echo "== 1. Backup abri_dev on the host"
ssh -i "$KEY" "$HOST" "sudo -u postgres pg_dump -Fc abri_dev | sudo tee /srv/abri/backups/abri_dev-before-oct-load-$STAMP.dump > /dev/null && ls -la /srv/abri/backups/abri_dev-before-oct-load-$STAMP.dump"

echo "== Opening the tunnel"
ssh -i "$KEY" -f -N -o ExitOnForwardFailure=yes -L 5433:localhost:5432 "$HOST"
trap 'pkill -f "5433:localhost:5432" || true' EXIT
sleep 2

export DATABASE_URL="$DEV_DATABASE_URL"
export ABRI_IMPORT_CONFIRM="localhost:5433/abri_dev"

echo "== 2. Names, points, ids"
node scripts/sync-seed-names.mjs --manifest "../$MANIFEST" --apply
echo "== 3. New listings"
node scripts/import-seed.mjs --apply
echo "== 4. Contacts"
node scripts/sync-seed-fields.mjs --apply
echo "== 5. Source records"
node scripts/sync-source-records.mjs --apply

echo "== Done. Backup: /srv/abri/backups/abri_dev-before-oct-load-$STAMP.dump"
