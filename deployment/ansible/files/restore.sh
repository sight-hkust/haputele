#!/usr/bin/env bash
#
# Restore a Postgres dump from Cloudflare R2 over the live database. Installed at
# /opt/haputele/restore.sh by the Ansible playbook. This is the other half of
# backup.sh — a backup nobody has restored from is a hypothesis, not a backup.
#
#   ./restore.sh --list
#   ./restore.sh latest --yes-drop-existing
#   ./restore.sh haputele-2026-08-12T031500Z.dump --yes-drop-existing
#
# DESTRUCTIVE: --clean drops every existing object before reloading, so whatever
# is in the database now is discarded. The confirmation flag is mandatory and
# deliberately verbose; there is no interactive prompt, because this has to work
# over a flaky SSH session during an incident.
#
# api and frontend are stopped for the duration so nothing writes into a
# half-restored schema, and are brought back up on exit even if the restore fails.

set -euo pipefail

APP_DIR=/opt/haputele
PREFIX=postgres

set -a
# shellcheck disable=SC1091  # rendered by Ansible, not present at lint time
. "$APP_DIR/.env"
set +a

export RCLONE_CONFIG_BACKUP_TYPE=s3
export RCLONE_CONFIG_BACKUP_PROVIDER=Cloudflare
export RCLONE_CONFIG_BACKUP_ENDPOINT="$BACKUP_S3_ENDPOINT_URL"
export RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_BACKUP_REGION=auto
export RCLONE_CONFIG_BACKUP_NO_CHECK_BUCKET=true

REMOTE="backup:${BACKUP_S3_BUCKET}/${PREFIX}"

compose() {
  docker compose --env-file "$APP_DIR/.env" \
    -f "$APP_DIR/docker-compose.prod.yml" "$@"
}

usage() {
  sed -n '3,18p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-1}"
}

[ $# -ge 1 ] || usage

if [ "$1" = "--list" ]; then
  # Timestamps sort lexically (see backup.sh), so this is newest-last.
  rclone lsl "$REMOTE" | sort -k4
  exit 0
fi

target="$1"
[ "${2:-}" = "--yes-drop-existing" ] || {
  echo "restore: refusing to run without --yes-drop-existing" >&2
  echo "restore: this DROPS the current contents of ${POSTGRES_DB}" >&2
  exit 1
}

if [ "$target" = "latest" ]; then
  target="$(rclone lsf "$REMOTE" | sort | tail -1)"
  [ -n "$target" ] || {
    echo "restore: no dumps found at ${REMOTE}" >&2
    exit 1
  }
  echo "restore: latest is ${target}"
fi

workdir="$(mktemp -d)"
dump="$workdir/$target"
# The archive is copied into the container rather than piped over exec's stdin,
# which was observed to corrupt -Fc archives. See the same note in backup.sh.
remote_dump="/tmp/restore-$$.dump"

scrub() {
  rm -rf "$workdir"
  compose exec -T db rm -f "$remote_dump" >/dev/null 2>&1 || true
}
trap scrub EXIT

echo "restore: downloading ${target}"
rclone copyto "${REMOTE}/${target}" "$dump"

# Validate before touching the live database: if the dump is unreadable, we want
# to find out while the current data is still intact.
[ -s "$dump" ] || {
  echo "restore: downloaded file is empty" >&2
  exit 1
}
compose cp "$dump" "db:${remote_dump}"
compose exec -T db pg_restore -l "$remote_dump" >/dev/null
echo "restore: dump is readable"

# From here on the stack must be returned to a running state no matter what.
restart_stack() {
  echo "restore: bringing the stack back up"
  compose up -d
  scrub
}
trap restart_stack EXIT

echo "restore: stopping api and frontend"
compose stop api frontend

echo "restore: reloading ${POSTGRES_DB}"
# --clean --if-exists: drop existing objects first, tolerating ones that are not
# there (a restore into an empty database is a normal case). --no-owner: object
# ownership is reassigned to the connecting role, so a dump taken under a
# different generated password still restores cleanly onto a rebuilt VM.
compose exec -T db pg_restore \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --clean --if-exists --no-owner "$remote_dump"

echo "restore: row counts"
compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  SELECT 'accounts' AS relation, count(*) FROM accounts
  UNION ALL SELECT 'patients', count(*) FROM patients
  UNION ALL SELECT 'appointments', count(*) FROM appointments
  UNION ALL SELECT 'consultations', count(*) FROM consultations
  UNION ALL SELECT 'appointment_attachments', count(*) FROM appointment_attachments;
"

echo "restore: done — verify the app serves this data before calling it good"
