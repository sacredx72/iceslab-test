#!/usr/bin/env bash
# Run the full panel CI suite locally, the same way GitHub Actions does:
# install -> prisma generate -> migrate (test db) -> typecheck -> vitest -> lint.
#
# Meant to run inside the dev container, or any node:22 container that can reach
# the compose `postgres-test` + `redis` services. Required env:
#   DATABASE_URL  (the TEST database)
#   REDIS_URL
#   JWT_SECRET    (>=32 chars)
#   NODE_ENV=test
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
step() { echo ""; echo "===== $1 ====="; }

corepack enable

step "pnpm install"
pnpm install --frozen-lockfile 2>&1 | tail -3 || fail=1

step "prisma generate"
( cd apps/panel-backend && pnpm exec prisma generate 2>&1 | tail -2 ) || fail=1

step "prisma migrate deploy (test db)"
( cd apps/panel-backend && pnpm exec prisma migrate deploy 2>&1 | tail -8 ) || fail=1

step "backend typecheck"
( cd apps/panel-backend && pnpm exec tsc --noEmit ) && echo "BE_TSC_OK" || { echo "BE_TSC_FAIL"; fail=1; }

step "frontend typecheck"
( cd apps/panel-frontend && pnpm exec tsc --noEmit ) && echo "FE_TSC_OK" || { echo "FE_TSC_FAIL"; fail=1; }

step "backend tests (vitest)"
( cd apps/panel-backend && pnpm test ) && echo "BE_TESTS_OK" || { echo "BE_TESTS_FAIL"; fail=1; }

step "lint (not part of CI; informational)"
pnpm -r lint 2>&1 | tail -25 || echo "LINT_ISSUES"

echo ""
echo "===== SUMMARY fail=$fail ====="
exit $fail
