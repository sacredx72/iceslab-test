#!/usr/bin/env bash
# deploy.sh — full panel re-deploy (slice 34 ops)
#
# Pulls the latest code, applies any new Prisma migrations, rebuilds all
# containers (--no-cache by default so the same nginx.conf / dist / env
# change never lands on a stale layer), and prints status + a tail of
# the backend log so you can spot a startup error before tabbing away.
#
# Usage:
#   ./scripts/deploy.sh             # standard re-deploy (--no-cache default)
#   ./scripts/deploy.sh --cache     # opt out of --no-cache for a faster
#                                     deploy when you trust Docker's layer
#                                     hashing (i.e. you only changed code,
#                                     not nginx.conf / Dockerfile)
#   ./scripts/deploy.sh --cleanup   # also prune old images/build cache
#                                     after the rebuild lands
#
# Run from the panel project root (where docker-compose.prod.yml lives).

set -euo pipefail

CLEANUP_AFTER=0
NO_CACHE=1   # default ON — paid ~30s for "what I see is what shipped"
for arg in "$@"; do
    case "$arg" in
        --cleanup|--prune) CLEANUP_AFTER=1 ;;
        --cache)           NO_CACHE=0 ;;
        --no-cache)        NO_CACHE=1 ;;
        *)
            echo "[deploy] unknown arg: $arg" >&2
            exit 2
            ;;
    esac
done

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

if [[ ! -f "$COMPOSE_FILE" || ! -f "$ENV_FILE" ]]; then
    echo "[deploy] run from panel project root (need $COMPOSE_FILE + $ENV_FILE)" >&2
    exit 1
fi

DC=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

echo "[deploy] git pull"
git pull

echo "[deploy] prisma migrate deploy"
# Ensure postgres is up first (some compose backends — notably podman's docker
# shim — don't attach `run --rm` containers to the project network reliably,
# which makes `postgres:5432` unresolvable). Bringing up postgres first +
# using `up --abort-on-container-exit` for the one-shot migrate sidesteps it.
"${DC[@]}" up -d postgres
"${DC[@]}" up --abort-on-container-exit --exit-code-from migrate migrate
"${DC[@]}" rm -fsv migrate || true

echo "[deploy] rebuild + restart all services$([[ $NO_CACHE -eq 1 ]] && echo ' (--no-cache)')"
if [[ $NO_CACHE -eq 1 ]]; then
    "${DC[@]}" build --no-cache backend frontend
fi
"${DC[@]}" up -d --build

echo "[deploy] status"
"${DC[@]}" ps

echo "[deploy] backend tail"
"${DC[@]}" logs --tail=30 backend || true

if [[ $CLEANUP_AFTER -eq 1 ]]; then
    echo
    echo "[deploy] running cleanup …"
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    "$SCRIPT_DIR/cleanup.sh"
fi
