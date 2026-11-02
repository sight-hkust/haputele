#!/usr/bin/env bash
#
# Nightly Postgres backup to Cloudflare R2. Installed at /opt/haputele/backup.sh
# by the Ansible playbook and run by haputele-backup.timer (03:00 Asia/Colombo).
# Run it by hand with: systemctl start haputele-backup.service
#
# Dumps through the running db container rather than a host psql client, so the
# pg_dump version always matches the server it is dumping. Output is -Fc (custom
# format): compressed, and pg_restore can be selective at restore time.
#
# Uploads to a bucket reached with BACKUP_S3_* credentials, which are deliberately
# NOT the app's S3_* keys: those live in the api container's environment, so an
# app compromise must not also be able to destroy the backups.
#
# Everything is written to a temp dir that is removed on exit (including on
# failure) — a dump left on disk is a plaintext copy of every patient record.

set -euo pipefail

APP_DIR=/opt/haputele
RETENTION_DAYS=30
PREFIX=postgres

# Config and credentials. `set -a` exports everything sourced, so rclone below
# inherits the RCLONE_CONFIG_* vars without naming each one twice.
set -a
# shellcheck disable=SC1091  # rendered by Ansible, not present at lint time
. "$APP_DIR/.env"
set +a

# Define the rclone remote "backup:" purely through the environment, so the
# credentials never land in a config file on disk. rclone reads any setting as
# RCLONE_CONFIG_<REMOTE>_<KEY>.
export RCLONE_CONFIG_BACKUP_TYPE=s3
export RCLONE_CONFIG_BACKUP_PROVIDER=Cloudflare
export RCLONE_CONFIG_BACKUP_ENDPOINT="$BACKUP_S3_ENDPOINT_URL"
export RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_BACKUP_REGION=auto
# The token is scoped to one existing bucket and cannot create buckets, so stop
# rclone from probing/creating it on upload.
export RCLONE_CONFIG_BACKUP_NO_CHECK_BUCKET=true

compose() {
  docker compose --env-file "$APP_DIR/.env" \
    -f "$APP_DIR/docker-compose.prod.yml" "$@"
}

# UTC, and largest unit first, so lexical order is chronological — that is what
# lets `rclone lsf | sort | tail -1` find the newest dump at restore time.
stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
name="haputele-${stamp}.dump"

workdir="$(mktemp -d)"
dump="$workdir/$name"
# pg_dump writes inside the container and the result is copied out with
# `compose cp`, rather than streamed through `docker exec`. Feeding a -Fc archive
# back in over exec's stdin was observed to corrupt it ("did not find magic
# string in file header"), so neither script relies on exec's binary streams.
remote_dump="/tmp/${name}"

cleanup() {
  rm -rf "$workdir"
  compose exec -T db rm -f "$remote_dump" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "backup: dumping ${POSTGRES_DB} as ${POSTGRES_USER}"
compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$remote_dump"

# Two cheap checks against the worst outcome: a backup that looks fine for months
# and turns out to be unreadable on the day it is needed. Parse the archive's
# table of contents while it is still next to the database that produced it.
compose exec -T db pg_restore -l "$remote_dump" >/dev/null

compose cp "db:${remote_dump}" "$dump"
[ -s "$dump" ] || {
  echo "backup: dump is empty after copy, refusing to upload" >&2
  exit 1
}

size="$(du -h "$dump" | cut -f1)"
echo "backup: uploading ${name} (${size})"
rclone copyto "$dump" "backup:${BACKUP_S3_BUCKET}/${PREFIX}/${name}"

# Prune only after the new dump has landed.
echo "backup: pruning dumps older than ${RETENTION_DAYS}d"
rclone delete "backup:${BACKUP_S3_BUCKET}/${PREFIX}" --min-age "${RETENTION_DAYS}d"

echo "backup: ok ${name} (${size})"
