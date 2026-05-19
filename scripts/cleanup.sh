#!/usr/bin/env bash
# cleanup.sh — reclaim disk from old Docker images / build cache.
#
# After every `--build` Docker keeps the previous image as an untagged
# dangling layer "for rollback". After ~5-10 deploys this accumulates
# into multi-GB of `/var/lib/docker` waste. This script removes:
#
#   - Dangling / unused images (anything not referenced by a running
#     container or by a current tag)
#   - Build cache layers
#   - Stopped containers (panel-* lifecycle uses `--rm` for the
#     migrate one-shot already; stopped panel-backend/frontend after
#     a crash get cleared)
#
# It does NOT touch:
#   - Named volumes (postgres_prod_data + redis_prod_data — the live
#     DATABASE).  `docker volume prune` is a foot-cannon, never call it
#     blind on this host.
#   - Networks (left alone — recreating them is cheap)
#
# Usage:    ./scripts/cleanup.sh
#           ./scripts/cleanup.sh --dry      # preview only, no deletion
#
# Schedule weekly via cron:
#   0 4 * * 0  cd /opt/iceslab && ./scripts/cleanup.sh >> /var/log/iceslab-cleanup.log 2>&1

set -euo pipefail

DRY=0
for arg in "$@"; do
    case "$arg" in
        --dry|--dry-run|-n) DRY=1 ;;
        *)
            echo "[cleanup] unknown arg: $arg" >&2
            exit 2
            ;;
    esac
done

run() {
    if [[ $DRY -eq 1 ]]; then
        printf '[cleanup:dry] would run: %s\n' "$*"
    else
        "$@"
    fi
}

echo "[cleanup] disk before:"
df -h /var/lib/docker 2>/dev/null || df -h /

echo
echo "[cleanup] dangling + unused images …"
run docker image prune --all --force

echo
echo "[cleanup] build cache …"
run docker builder prune --all --force

echo
echo "[cleanup] stopped containers …"
run docker container prune --force

echo
echo "[cleanup] disk after:"
df -h /var/lib/docker 2>/dev/null || df -h /

echo
echo "[cleanup] done. Volumes (postgres + redis data) — UNTOUCHED:"
docker volume ls --filter 'name=iceslab'
