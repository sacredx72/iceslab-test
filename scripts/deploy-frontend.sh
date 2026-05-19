#!/usr/bin/env bash
# deploy-frontend.sh — fast path for SPA-only changes.
#
# Skips Prisma migrate + backend rebuild. Use this when you only edited
# anything under apps/panel-frontend/. --no-cache is ON by default — the
# Vite bundle is content-hashed but the COPY layer occasionally hits a
# Docker cache hit that lands a stale dist/ in the image. ~30s slower
# but trades for "what I see is what shipped."
#
# Usage:
#   ./scripts/deploy-frontend.sh           # default --no-cache
#   ./scripts/deploy-frontend.sh --cache   # opt back into Docker layer
#                                            cache (faster, occasionally
#                                            stale — only use when you
#                                            trust the diff)

set -euo pipefail

NO_CACHE=1   # default ON
for arg in "$@"; do
    case "$arg" in
        --no-cache|--fresh) NO_CACHE=1 ;;
        --cache)            NO_CACHE=0 ;;
        *)
            echo "[deploy-fe] unknown arg: $arg" >&2
            exit 2
            ;;
    esac
done

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

if [[ ! -f "$COMPOSE_FILE" || ! -f "$ENV_FILE" ]]; then
    echo "[deploy-fe] run from panel project root (need $COMPOSE_FILE + $ENV_FILE)" >&2
    exit 1
fi

DC=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

echo "[deploy-fe] git pull"
git pull

if [[ $NO_CACHE -eq 1 ]]; then
    echo "[deploy-fe] forced rebuild (no cache)"
    "${DC[@]}" build --no-cache frontend
    "${DC[@]}" up -d frontend
else
    echo "[deploy-fe] rebuild + restart frontend"
    "${DC[@]}" up -d --build frontend
fi

echo "[deploy-fe] status"
"${DC[@]}" ps frontend
