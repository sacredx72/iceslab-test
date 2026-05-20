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

LIB_PREFIX="deploy-fe"
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
            sed -n '2,15p' "$0" | sed 's/^# \?//'
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
STEP_TOTAL=3

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

# ───── Step 2: rebuild frontend ─────
if [[ $NO_CACHE -eq 1 ]]; then
    step 2 "rebuild frontend (--no-cache)"
    "${DC[@]}" build --no-cache frontend
    "${DC[@]}" up -d frontend
else
    step 2 "rebuild + restart frontend (cached)"
    "${DC[@]}" up -d --build frontend
fi
step_done

# ───── Step 3: status ─────
step 3 "status"
"${DC[@]}" ps frontend
step_done

echo
log_ok "frontend deploy complete in $(elapsed_total) — now serving ${SHA_AFTER}"
