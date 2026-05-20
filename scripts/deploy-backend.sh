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

LIB_PREFIX="deploy-be"
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
trap 'on_err $LINENO' ERR

# ───── Args ─────
NO_CACHE=1
for arg in "$@"; do
    case "$arg" in
        --no-cache|--fresh) NO_CACHE=1 ;;
        --cache)            NO_CACHE=0 ;;
        -h|--help)
            sed -n '2,11p' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            log_err "unknown arg: $arg"
            exit 2
            ;;
    esac
done

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
require_compose_root

DC=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
STEP_TOTAL=4

# ───── Step 1: git pull ─────
SHA_BEFORE=$(git_short_sha)
step 1 "git pull (was at ${SHA_BEFORE})"
git pull --ff-only
SHA_AFTER=$(git_short_sha)
if [[ "$SHA_BEFORE" == "$SHA_AFTER" ]]; then
    log_info "  no new commits — re-deploying ${SHA_AFTER}"
else
    log_info "  ${SHA_BEFORE} → ${SHA_AFTER}"
fi
step_done

# ───── Step 2: prisma migrate deploy ─────
step 2 "prisma migrate deploy"
# Same trick as deploy.sh — use `up --abort-on-container-exit` instead of
# `run --rm` so the migrate container reliably joins the project network
# (podman compose backends have a known regression with `run`).
"${DC[@]}" up -d postgres
"${DC[@]}" up --abort-on-container-exit --exit-code-from migrate migrate
"${DC[@]}" rm -fsv migrate >/dev/null 2>&1 || true
step_done

# ───── Step 3: rebuild backend ─────
if [[ $NO_CACHE -eq 1 ]]; then
    step 3 "rebuild backend (--no-cache)"
    "${DC[@]}" build --no-cache backend
else
    step 3 "rebuild backend (cached)"
fi
"${DC[@]}" up -d --build backend
step_done

# ───── Step 4: status + tail ─────
step 4 "status + backend tail"
"${DC[@]}" ps backend
echo
log_info "backend tail (last 40 lines):"
"${DC[@]}" logs --tail=40 backend || true
step_done

echo
log_ok "backend deploy complete in $(elapsed_total) — now serving ${SHA_AFTER}"
