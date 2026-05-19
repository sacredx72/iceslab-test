#!/usr/bin/env bash
# iceslab-backup.sh — slice 34
#
# Single-file backup of the Iceslab control plane:
#   - Postgres dump  (pg_dump inside iceslab-prod-postgres → SQL)
#   - Redis dump     (BGSAVE then copy dump.rdb out of iceslab-prod-redis)
#   - .env.production (host-side, contains JWT_SECRET, POSTGRES_PASSWORD, etc)
#
# All three artefacts go into a single timestamped tar.gz at the path you
# choose (default `./backups/`). With `--password <pw>` the tarball is
# AES-256 encrypted via `openssl enc` — the CA private key, JWT secret,
# user creds and node mTLS material all sit inside, so encrypting at rest
# is the right default for off-host storage (S3, rsync to friend's box).
#
# Usage:
#   ./scripts/iceslab-backup.sh [--out /path/to/dir] [--password <pw>]
#
# Restore with the matching iceslab-restore.sh script.

set -euo pipefail

# ───── Defaults ─────
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
OUT_DIR="./backups"
PASSWORD=""

POSTGRES_CONTAINER="iceslab-prod-postgres"
REDIS_CONTAINER="iceslab-prod-redis"

# ───── Args ─────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --out)
            OUT_DIR="$2"
            shift 2
            ;;
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
        -h|--help)
            sed -n '2,16p' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            echo "unknown arg: $1" >&2
            exit 2
            ;;
    esac
done

# ───── Pre-flight ─────
if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "compose file not found: $COMPOSE_FILE" >&2
    echo "run from the panel project root, or pass --compose-file" >&2
    exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
    echo "env file not found: $ENV_FILE — run from the panel project root" >&2
    exit 1
fi

mkdir -p "$OUT_DIR"

# Pull POSTGRES_USER / POSTGRES_DB from the env file so we don't hard-code them.
# shellcheck disable=SC1090
source <(grep -E '^(POSTGRES_USER|POSTGRES_DB)=' "$ENV_FILE")
: "${POSTGRES_USER:?missing POSTGRES_USER in $ENV_FILE}"
: "${POSTGRES_DB:?missing POSTGRES_DB in $ENV_FILE}"

# Sanity-check both containers are up — running pg_dump against a stopped
# DB is the most common mistake when this is wired into a cron the night
# after a deploy that never finished.
if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
    echo "container ${POSTGRES_CONTAINER} is not running" >&2
    exit 1
fi
if ! docker ps --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
    echo "container ${REDIS_CONTAINER} is not running" >&2
    exit 1
fi

# ───── Stage everything in a temp dir ─────
TS="$(date -u +%Y%m%dT%H%M%SZ)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "[backup] postgres → ${STAGE}/postgres.sql"
docker exec -e PGPASSWORD -i "$POSTGRES_CONTAINER" \
    pg_dump --clean --if-exists --no-owner --no-privileges \
            -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    > "${STAGE}/postgres.sql"

echo "[backup] redis BGSAVE …"
docker exec "$REDIS_CONTAINER" redis-cli BGSAVE >/dev/null
# BGSAVE is async; wait for the timestamp on LASTSAVE to advance.
prev_lastsave="$(docker exec "$REDIS_CONTAINER" redis-cli LASTSAVE)"
for _ in $(seq 1 30); do
    sleep 1
    cur="$(docker exec "$REDIS_CONTAINER" redis-cli LASTSAVE)"
    if [[ "$cur" != "$prev_lastsave" ]]; then
        break
    fi
done
docker cp "${REDIS_CONTAINER}:/data/dump.rdb" "${STAGE}/redis.rdb"

echo "[backup] env → ${STAGE}/env"
cp "$ENV_FILE" "${STAGE}/env"

# Pack the manifest so restore can sanity-check what it's about to overwrite.
cat > "${STAGE}/manifest.json" <<EOF
{
  "createdAt": "${TS}",
  "compose": "${COMPOSE_FILE}",
  "envFile": "${ENV_FILE}",
  "postgresUser": "${POSTGRES_USER}",
  "postgresDb": "${POSTGRES_DB}",
  "components": ["postgres.sql", "redis.rdb", "env"]
}
EOF

# ───── Tar + optional encryption ─────
ARCHIVE="${OUT_DIR}/iceslab-backup-${TS}.tar.gz"

if [[ -n "$PASSWORD" ]]; then
    ENCRYPTED="${ARCHIVE}.enc"
    tar -C "$STAGE" -czf - postgres.sql redis.rdb env manifest.json \
        | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
                       -pass "pass:${PASSWORD}" \
                       -out "$ENCRYPTED"
    chmod 600 "$ENCRYPTED"
    SIZE="$(du -h "$ENCRYPTED" | cut -f1)"
    echo "[backup] done: ${ENCRYPTED} (${SIZE}, AES-256-CBC)"
else
    tar -C "$STAGE" -czf "$ARCHIVE" postgres.sql redis.rdb env manifest.json
    chmod 600 "$ARCHIVE"
    SIZE="$(du -h "$ARCHIVE" | cut -f1)"
    echo "[backup] done: ${ARCHIVE} (${SIZE}, unencrypted)"
    echo "[backup] WARN: archive contains JWT_SECRET + DB password + CA private key" >&2
    echo "[backup] WARN: encrypt with --password before storing off-host" >&2
fi
