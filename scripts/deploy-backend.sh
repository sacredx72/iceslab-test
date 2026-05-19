#!/usr/bin/env bash
# deploy-backend.sh — backend-only re-deploy.
#
# Pulls latest, applies pending migrations, rebuilds + restarts backend.
# Frontend stays untouched. --no-cache is ON by default — pays ~20s
# extra rebuild for "what I see is what shipped". Pass --cache to opt
# into Docker layer cache when you trust the diff.
#
# Usage:
#   ./scripts/deploy-backend.sh           # default --no-cache
#   ./scripts/deploy-backend.sh --cache   # use Docker cache (faster)

set -euo pipefail

NO_CACHE=1
for arg in "$@"; do
    case "$arg" in
        --no-cache|--fresh) NO_CACHE=1 ;;
        --cache)            NO_CACHE=0 ;;
        *)
            echo "[deploy-be] unknown arg: $arg" >&2
            exit 2
            ;;
    esac
done

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

if [[ ! -f "$COMPOSE_FILE" || ! -f "$ENV_FILE" ]]; then
    echo "[deploy-be] run from panel project root (need $COMPOSE_FILE + $ENV_FILE)" >&2
    exit 1
fi

DC=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

echo "[deploy-be] git pull"
git pull

echo "[deploy-be] prisma migrate deploy"
# Same trick as deploy.sh — use `up --abort-on-container-exit` instead of
# `run --rm` so the migrate container reliably joins the project network
# (podman compose backends have a known regression with `run`).
"${DC[@]}" up -d postgres
"${DC[@]}" up --abort-on-container-exit --exit-code-from migrate migrate
"${DC[@]}" rm -fsv migrate || true

echo "[deploy-be] rebuild + restart backend$([[ $NO_CACHE -eq 1 ]] && echo ' (--no-cache)')"
if [[ $NO_CACHE -eq 1 ]]; then
    "${DC[@]}" build --no-cache backend
fi
"${DC[@]}" up -d --build backend

echo "[deploy-be] status"
"${DC[@]}" ps backend

echo "[deploy-be] backend tail"
"${DC[@]}" logs --tail=40 backend || true
