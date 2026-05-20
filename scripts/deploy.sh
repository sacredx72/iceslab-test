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

LIB_PREFIX="deploy"
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
trap 'on_err $LINENO' ERR

# ───── Args ─────
CLEANUP_AFTER=0
NO_CACHE=1   # default ON — paid ~30s for "what I see is what shipped"
for arg in "$@"; do
    case "$arg" in
        --cleanup|--prune) CLEANUP_AFTER=1 ;;
        --cache)           NO_CACHE=0 ;;
        --no-cache)        NO_CACHE=1 ;;
        -h|--help)
            sed -n '2,18p' "$0" | sed 's/^# \?//'
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
STEP_TOTAL=5

# ───── Step 1: git pull (ff-only, fail loudly on divergence) ─────
SHA_BEFORE=$(git_short_sha)
step 1 "git pull (was at ${SHA_BEFORE})"
# --ff-only refuses to merge on local divergence. If git_pull would
# create a merge commit, operator wanted to know about local changes
# before the deploy nuked their working tree.
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
# Ensure postgres is up first (some compose backends — notably podman's
# docker shim — don't attach `run --rm` containers to the project network
# reliably, which makes `postgres:5432` unresolvable). Bringing up postgres
# first + using `up --abort-on-container-exit` for the one-shot migrate
# sidesteps it.
"${DC[@]}" up -d postgres
"${DC[@]}" up --abort-on-container-exit --exit-code-from migrate migrate
"${DC[@]}" rm -fsv migrate >/dev/null 2>&1 || true
step_done

# ───── Step 3: rebuild ─────
if [[ $NO_CACHE -eq 1 ]]; then
    step 3 "rebuild backend + frontend (--no-cache)"
    "${DC[@]}" build --no-cache backend frontend
else
    step 3 "rebuild backend + frontend (cached)"
fi
step_done

# ───── Step 4: restart all services ─────
step 4 "restart all services"
"${DC[@]}" up -d --build
step_done

# ───── Step 5: status + smoke ─────
step 5 "status + backend tail"
"${DC[@]}" ps
echo
log_info "backend tail (last 30 lines):"
"${DC[@]}" logs --tail=30 backend || true
step_done

# ───── Optional cleanup ─────
if [[ $CLEANUP_AFTER -eq 1 ]]; then
    echo
    log_info "running cleanup …"
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    "$SCRIPT_DIR/cleanup.sh"
fi

echo
log_ok "deploy complete in $(elapsed_total) — now serving ${SHA_AFTER}"
