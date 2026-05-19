#!/usr/bin/env bash
# logs.sh — quick log inspector for the panel stack.
#
# Default (no args) prints the last 100 lines of every Docker service
# (backend / frontend / postgres / redis) plus a tail of the host's
# Caddy systemd unit when it's installed (Caddy runs as a native
# systemd service, not a docker container — install-iceslab.sh does
# `apt-get install caddy` in domain mode).
#
# Modes:
#   ./scripts/logs.sh              # last 100 of every service
#   ./scripts/logs.sh -f           # follow live (all services)
#   ./scripts/logs.sh be           # backend only (alias: backend)
#   ./scripts/logs.sh fe           # frontend only (alias: frontend)
#   ./scripts/logs.sh caddy        # caddy / TLS (journalctl, not Docker)
#   ./scripts/logs.sh db           # postgres
#   ./scripts/logs.sh redis        # redis
#   ./scripts/logs.sh be -f        # follow specific service
#   ./scripts/logs.sh --tail=500   # override default 100

set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

if [[ ! -f "$COMPOSE_FILE" || ! -f "$ENV_FILE" ]]; then
    echo "[logs] run from panel project root (need $COMPOSE_FILE + $ENV_FILE)" >&2
    exit 1
fi

DC=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

# Resolve short alias → either a compose service name (Docker logs) or
# the literal string "caddy" (systemd path). Stays in sync with
# docker-compose.prod.yml — update if services rename.
SERVICE=""
FOLLOW=0
TAIL_N=100

for arg in "$@"; do
    case "$arg" in
        be|backend)         SERVICE="backend" ;;
        fe|frontend)        SERVICE="frontend" ;;
        caddy|tls)          SERVICE="caddy" ;;
        db|postgres|pg)     SERVICE="postgres" ;;
        redis|cache)        SERVICE="redis" ;;
        -f|--follow|tail)   FOLLOW=1 ;;
        --tail=*)           TAIL_N="${arg#--tail=}" ;;
        *)
            echo "[logs] unknown arg: $arg (try: be / fe / caddy / db / redis / -f)" >&2
            exit 2
            ;;
    esac
done

# Caddy lives outside Docker — it's a host-side systemd unit set up by
# install-iceslab.sh. Route its logs through journalctl instead of
# `docker compose logs`.
caddy_logs() {
    local follow_flag=""
    if [[ $FOLLOW -eq 1 ]]; then follow_flag="-f"; fi
    if command -v journalctl >/dev/null 2>&1; then
        journalctl -u caddy $follow_flag --no-pager -n "$TAIL_N" 2>/dev/null \
            || echo "(caddy systemd unit not found — bare-IP install, skipping)"
    else
        echo "(journalctl not available — can't read caddy logs)"
    fi
}

if [[ "$SERVICE" == "caddy" ]]; then
    caddy_logs
    exit $?
fi

ARGS=(--tail="$TAIL_N")
if [[ $FOLLOW -eq 1 ]]; then
    ARGS+=(-f)
fi

if [[ -n "$SERVICE" ]]; then
    "${DC[@]}" logs "${ARGS[@]}" "$SERVICE"
    exit $?
fi

# All-services mode — one block per service. Printing them grouped is
# easier to skim than the interleaved default.
for s in backend frontend postgres redis; do
    echo "═══════════════════════════════════════════════════════════"
    echo " $s (last $TAIL_N lines)"
    echo "═══════════════════════════════════════════════════════════"
    "${DC[@]}" logs --tail="$TAIL_N" "$s" 2>/dev/null || echo "(service '$s' not running)"
    echo
done

# Caddy block at the end so even an all-services tail covers TLS
# issues. Output stays empty + a friendly note when bare-IP mode skipped
# the install.
echo "═══════════════════════════════════════════════════════════"
echo " caddy (systemd, last $TAIL_N lines)"
echo "═══════════════════════════════════════════════════════════"
caddy_logs
echo
