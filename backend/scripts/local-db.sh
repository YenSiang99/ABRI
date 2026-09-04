#!/bin/sh
# Starts and stops the local Postgres used for development. Nothing deployed
# uses this: the EC2 host runs Postgres under systemd, and the containers reach
# it over the Docker bridge.
#
# This exists because `brew services` registers the launchd job on this machine
# but never actually launches it, and its KeepAlive doesn't fire either — so the
# service that is supposed to make this automatic silently does nothing.
#
# LC_ALL is not optional on macOS. Without a valid locale the postmaster dies
# with "became multithreaded during startup" before it ever listens, which reads
# like a corrupt cluster rather than a missing environment variable.
set -e

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@16/bin}"
PGDATA="${PGDATA:-/opt/homebrew/var/postgresql@16}"
PGLOG="${PGLOG:-/opt/homebrew/var/log/postgresql@16.log}"

case "${1:-start}" in
  start)
    if "$PGBIN/pg_isready" -q 2>/dev/null; then
      echo "Postgres is already running on port 5432"
      exit 0
    fi
    LC_ALL=en_US.UTF-8 "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGLOG" start
    ;;
  stop)
    "$PGBIN/pg_ctl" -D "$PGDATA" stop -m fast
    ;;
  status)
    "$PGBIN/pg_isready"
    ;;
  *)
    echo "usage: npm run db:{start|stop|status}" >&2
    exit 1
    ;;
esac
