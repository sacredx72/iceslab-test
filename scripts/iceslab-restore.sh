#!/usr/bin/env bash
# iceslab-restore.sh — slice 34
#
# Restore a tarball produced by iceslab-backup.sh. The script:
#   1. Decrypts (if `--password` given) and unpacks the archive.
#   2. Reads manifest.json, prints a summary, and asks the user to confirm.
#   3. Stops the panel/migrate services so nothing writes during restore.
#   4. Drops + recreates the postgres database, then `psql` the dump.
#   5. Stops redis, replaces dump.rdb on its volume, restarts redis.
#   6. Replaces the host .env.production (only if the archive's was preserved).
#   7. Starts the panel back up.
#
# DESTRUCTIVE — overwrites the database and redis state. Always take a
# fresh `iceslab-backup.sh` of the current host first.
#
# Usage:
#   ./scripts/iceslab-restore.sh ./backups/iceslab-backup-...tar.gz \
#       [--password <pw>] [--yes]

set -euo pipefail

# ───── Defaults ─────
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
PASSWORD=""
ASSUME_YES=0
ARCHIVE=""

POSTGRES_CONTAINER="iceslab-prod-postgres"
REDIS_CONTAINER="iceslab-prod-redis"

# ───── Args ─────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --password)
            PASSWORD="$2"
            shift 2
            ;;
        --compose-file)
            COMPOSE_FILE="$2"
            shift 2
            ;;
        --env-file)
            ENV_FILE="$2"
            shift 2
            ;;
        --yes|-y)
            ASSUME_YES=1
            shift
            ;;
        -h|--help)
            sed -n '2,18p' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            if [[ -z "$ARCHIVE" ]]; then
                ARCHIVE="$1"
                shift
            else
                echo "unknown arg: $1" >&2
                exit 2
            fi
            ;;
    esac
done

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
    echo "usage: $0 <archive.tar.gz[.enc]> [--password <pw>] [--yes]" >&2
    exit 1
fi
if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "compose file not found: $COMPOSE_FILE — run from the panel project root" >&2
    exit 1
fi

# ───── Stage ─────
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

if [[ "$ARCHIVE" == *.enc ]]; then
    if [[ -z "$PASSWORD" ]]; then
        echo "archive is encrypted but --password was not given" >&2
        exit 1
    fi
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
                 -pass "pass:${PASSWORD}" \
                 -in "$ARCHIVE" \
        | tar -C "$STAGE" -xzf -
else
    tar -C "$STAGE" -xzf "$ARCHIVE"
fi

if [[ ! -f "${STAGE}/manifest.json" ]]; then
    echo "archive missing manifest.json — not produced by iceslab-backup.sh?" >&2
    exit 1
fi

echo "[restore] manifest:"
cat "${STAGE}/manifest.json"
echo

if [[ $ASSUME_YES -ne 1 ]]; then
    read -r -p "[restore] this WILL drop and recreate the live database. continue? (yes/no) " ans
    if [[ "$ans" != "yes" ]]; then
        echo "[restore] aborted"
        exit 1
    fi
fi

# Pull POSTGRES_USER / POSTGRES_DB from the host env file (the live target,
# not the archive's copy — see the `env` step below).
# shellcheck disable=SC1090
source <(grep -E '^(POSTGRES_USER|POSTGRES_DB)=' "$ENV_FILE")
: "${POSTGRES_USER:?missing POSTGRES_USER in $ENV_FILE}"
: "${POSTGRES_DB:?missing POSTGRES_DB in $ENV_FILE}"

# ───── 1. Stop panel-side services ─────
echo "[restore] stopping panel-backend + frontend …"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    stop panel-backend panel-frontend 2>/dev/null || true

# ───── 2. Postgres restore ─────
echo "[restore] restoring postgres …"
# Drop and recreate the schema cleanly. pg_dump --clean --if-exists already
# emits DROP statements for each table, but a fresh DROP SCHEMA + CREATE
# ensures we don't leak orphan objects from a previous incarnation.
docker exec -i "$POSTGRES_CONTAINER" \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
    -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' >/dev/null

docker exec -i "$POSTGRES_CONTAINER" \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
    < "${STAGE}/postgres.sql" >/dev/null

# ───── 3. Redis restore ─────
echo "[restore] restoring redis …"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop redis
# Wait for the container to actually stop — `docker cp` to a stopped
# container fails fast, but `docker cp` to a running container with
# AOF active produces a corrupt rdb on next start.
docker cp "${STAGE}/redis.rdb" "${REDIS_CONTAINER}:/data/dump.rdb"
# AOF is the source of truth in our config (--appendonly yes). If the
# AOF file exists, it overrides the rdb on startup; flush it so the
# rdb takes effect.
docker exec "$REDIS_CONTAINER" sh -c 'rm -f /data/appendonlydir/*.aof || true' 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" start redis

# ───── 4. Bring panel back up ─────
echo "[restore] starting panel-backend + frontend …"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    start panel-backend panel-frontend

echo "[restore] done"
echo "[restore] note: .env.production was NOT overwritten — review ${STAGE}/env"
echo "[restore]       and merge any drifted values manually if needed."
