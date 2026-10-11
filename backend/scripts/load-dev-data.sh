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
# Usage, from backend/:
#   DEV_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5433/abri_dev' \
#     bash scripts/load-dev-data.sh
#
# It opens the SSH tunnel (local 5433 → host 5432) itself and closes it at
# the end.
set -euo pipefail

: "${DEV_DATABASE_URL:?set DEV_DATABASE_URL to the abri_dev URL on localhost:5433}"
KEY="${ABRI_SSH_KEY:-$HOME/Downloads/abri.pem}"
HOST="${ABRI_SSH_HOST:-ec2-user@ec2-43-216-217-161.ap-southeast-5.compute.amazonaws.com}"
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
