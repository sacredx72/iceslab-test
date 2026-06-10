# shellcheck shell=bash
#
# _lib.sh — shared helpers for ops scripts (deploy*, cleanup, logs, backup,
# restore). NOT meant to be executed directly. Source it from a script that
# has already set LIB_PREFIX:
#
#   LIB_PREFIX="deploy"
#   source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
#
# Provides:
#   - color helpers (auto-disabled when stdout isn't a TTY)
#   - log_info / log_ok / log_warn / log_err  (consistent prefix + colors)
#   - elapsed_total / fmt_duration  (wall-clock since script start)
#   - step / step_done  (numbered "[N/M] doing X" headers with timing)
#   - on_err trap installer  (prints which line + command failed)
#   - require_compose_root  (ensures we're in /opt/iceslab or equivalent)
#   - git_short_sha  (current HEAD hash, "no-git" if not a repo)
#
# Install scripts (install-iceslab.sh, install-iceslab-node.sh) deliberately
# do NOT source this — they're curl-piped standalone and must work without
# the rest of the scripts/ directory present.

# ───── Colors ─────
# Only emit escape codes when stdout is an interactive TTY. CI logs,
# pipes, and journalctl capture as plain text, so noisy escapes
# would clutter them.
if [[ -t 1 ]]; then
    C_INFO=$'\033[1;36m'   # cyan
    C_OK=$'\033[1;32m'     # green
    C_WARN=$'\033[1;33m'   # yellow
    C_ERR=$'\033[1;31m'    # red
    C_DIM=$'\033[2m'
    C_RST=$'\033[0m'
else
    C_INFO=; C_OK=; C_WARN=; C_ERR=; C_DIM=; C_RST=
fi

# ───── Timing ─────
# Use SECONDS (bash builtin, monotonic-ish) to avoid spawning `date`
# on every log line. Subtraction gives wall-clock seconds since the
# library was sourced.
_LIB_START_SECONDS=$SECONDS
_LIB_STEP_SECONDS=$SECONDS

fmt_duration() {
    # Pretty-print seconds as "Xs" / "XmYs" / "XhYm" depending on scale.
    local s=$1
    if (( s < 60 )); then
        printf '%ds' "$s"
    elif (( s < 3600 )); then
        printf '%dm%ds' $((s/60)) $((s%60))
    else
        printf '%dh%dm' $((s/3600)) $(((s%3600)/60))
    fi
}

elapsed_total() { fmt_duration $((SECONDS - _LIB_START_SECONDS)); }
elapsed_step()  { fmt_duration $((SECONDS - _LIB_STEP_SECONDS)); }

# ───── Logging ─────
# Caller sets LIB_PREFIX to a short tag (deploy / cleanup / backup / etc).
# Falls back to script basename if unset.
LIB_PREFIX="${LIB_PREFIX:-$(basename "${0:-script}" .sh)}"

log_info() { printf '%b[%s]%b %s\n' "$C_INFO" "$LIB_PREFIX" "$C_RST" "$*"; }
log_ok()   { printf '%b[%s]%b %b%s%b\n' "$C_INFO" "$LIB_PREFIX" "$C_RST" "$C_OK" "$*" "$C_RST"; }
log_warn() { printf '%b[%s]%b %b%s%b\n' "$C_INFO" "$LIB_PREFIX" "$C_RST" "$C_WARN" "$*" "$C_RST" >&2; }
log_err()  { printf '%b[%s]%b %b%s%b\n' "$C_INFO" "$LIB_PREFIX" "$C_RST" "$C_ERR" "$*" "$C_RST" >&2; }

# ───── Numbered steps ─────
# Operators want to see "step 3 of 7" + how long each step took, so a long
# deploy doesn't feel like it's hanging. Mirrors the [N/M] pattern used
# in install-iceslab.sh.
#
#   STEP_TOTAL=4
#   step 1 "git pull"
#     git pull --ff-only
#   step_done
#
STEP_TOTAL="${STEP_TOTAL:-?}"

step() {
    local n=$1
    shift
    _LIB_STEP_SECONDS=$SECONDS
    printf '\n%b[%s]%b %b[%s/%s]%b %s %b(+%s total)%b\n' \
        "$C_INFO" "$LIB_PREFIX" "$C_RST" \
        "$C_INFO" "$n" "$STEP_TOTAL" "$C_RST" \
        "$*" \
        "$C_DIM" "$(elapsed_total)" "$C_RST"
}

step_done() {
    printf '%b[%s]%b   %b✓ done in %s%b\n' \
        "$C_INFO" "$LIB_PREFIX" "$C_RST" \
        "$C_OK" "$(elapsed_step)" "$C_RST"
}

# ───── Error context ─────
# Without an ERR trap, `set -e` aborts on the failing command but the
# operator only sees the line that exit'd — no idea what step or which
# command. This trap prints exit code + line number + the actual command
# text (read back from the script source) so debugging from journalctl
# doesn't require staring at line numbers.
#
# Caller installs:
#   trap 'on_err $LINENO' ERR

on_err() {
    local exit_code=$?
    local line=$1
    local src cmd
    # Best-effort: grab the failing line back from the script source.
    # Won't work if the script is being piped via stdin (`<(curl)`) but
    # ops scripts here are always run from disk.
    src="${BASH_SOURCE[1]:-$0}"
    cmd=$(sed -n "${line}p" "$src" 2>/dev/null | sed 's/^[[:space:]]*//' || echo '?')
    printf '\n%b[%s]%b %b═══ FAILED ═══%b\n' \
        "$C_INFO" "$LIB_PREFIX" "$C_RST" "$C_ERR" "$C_RST" >&2
    printf '%b[%s]%b   line:    %s (in %s)\n' \
        "$C_INFO" "$LIB_PREFIX" "$C_RST" "$line" "$(basename "$src")" >&2
    printf '%b[%s]%b   command: %s\n' \
        "$C_INFO" "$LIB_PREFIX" "$C_RST" "$cmd" >&2
    printf '%b[%s]%b   exit:    %s\n' \
        "$C_INFO" "$LIB_PREFIX" "$C_RST" "$exit_code" >&2
    printf '%b[%s]%b   elapsed: %s\n' \
        "$C_INFO" "$LIB_PREFIX" "$C_RST" "$(elapsed_total)" >&2
    exit "$exit_code"
}

# ───── Pre-flight ─────
# Most ops scripts assume CWD is the panel project root (where the compose
# file + .env.production sit). Bail with a useful message instead of a
# cryptic docker-compose error if invoked from the wrong directory.
require_compose_root() {
    local compose="${COMPOSE_FILE:-docker-compose.prod.yml}"
    local env="${ENV_FILE:-.env.production}"
    if [[ -f "$compose" && -f "$env" ]]; then
        return 0
    fi
    # Not in the project root. Operators naturally `cd scripts && ./deploy.sh`;
    # auto-resolve to the dir above this lib (scripts/.. == project root) and
    # re-check, so the ops scripts work from either location instead of just
    # erroring out. Caught live 2026-06-09: deploy run from /opt/iceslab/scripts.
    local root
    root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)" || root=""
    if [[ -n "$root" && -f "$root/$compose" && -f "$root/$env" ]]; then
        cd "$root"
        log_info "switched to project root: $root"
        return 0
    fi
    log_err "run from panel project root — missing $compose or $env"
    log_err "  (try: cd /opt/iceslab)"
    exit 1
}

# ───── Git helpers ─────
git_short_sha() {
    git rev-parse --short HEAD 2>/dev/null || echo "no-git"
}

git_short_sha_or_die() {
    if ! git rev-parse --git-dir >/dev/null 2>&1; then
        log_err "not a git repository — git_short_sha_or_die"
        exit 1
    fi
    git rev-parse --short HEAD
}

# git_sync_to_ref: bring the checkout to ICESLAB_REF (a branch like `main`, or a
# pinned tag like v0.1.4). Defaults to the current branch when ICESLAB_REF is
# unset. Replaces a bare `git pull --ff-only`, which was a trap: the installer
# leaves a tag-pinned DETACHED HEAD where pull silently no-ops, so operators
# rebuilt STALE code believing they had updated (caught live 2026-06-10, a panel
# stuck rebuilding v0.1.2). This fetches ALL branches + tags (overriding the
# single-branch refspec a shallow install clone leaves behind), then checks out
# the target explicitly, erroring loudly when the intent is ambiguous.
#
# Sets globals for the caller to log: SHA_BEFORE, SHA_AFTER, SYNC_TARGET.
# Honors FORCE_RESET=1 to discard local edits. Exits non-zero on bad state.
git_sync_to_ref() {
    SHA_BEFORE=$(git_short_sha)
    SYNC_TARGET="${ICESLAB_REF:-}"
    if [[ -z "$SYNC_TARGET" ]]; then
        SYNC_TARGET=$(git symbolic-ref --short -q HEAD || true)
        if [[ -z "$SYNC_TARGET" ]]; then
            log_err "Detached HEAD (repo pinned to a tag/sha) and ICESLAB_REF unset."
            log_err "Pick what to deploy, for example:"
            log_err "    ICESLAB_REF=main   bash scripts/deploy.sh   # track latest"
            log_err "    ICESLAB_REF=v0.1.4 bash scripts/deploy.sh   # pin a release"
            exit 1
        fi
    fi
    if [[ -n "$(git status --porcelain)" && "${FORCE_RESET:-0}" != "1" ]]; then
        log_err "Working tree has local changes; refusing to switch/reset refs."
        log_err "Commit or stash them, or re-run with FORCE_RESET=1 to discard."
        exit 1
    fi
    git fetch origin '+refs/heads/*:refs/remotes/origin/*' --tags --prune
    if git show-ref --verify --quiet "refs/remotes/origin/${SYNC_TARGET}"; then
        git checkout -B "$SYNC_TARGET" "origin/$SYNC_TARGET"   # branch: track + advance
    else
        git checkout --force "$SYNC_TARGET"                    # tag/sha: pinned checkout
    fi
    SHA_AFTER=$(git_short_sha)
}
