#!/usr/bin/env bash
# Run Postgres-backed vitest suites on the VM against a separate test Postgres.
# Throwaway test DBs only (setupTestDb creates/drops lifeos_test_*); never point at the production database.
# Usage (repo root on the VM): bash scripts/vm-db-test.sh [test files...]   (no args = whole suite)
# The test Postgres is the dev compose file under project "lifeos-test" (-p overrides the file's name, so its volume is
# lifeos-test_pgdata-dev, separate from dev). Left running on purpose so repeat runs skip startup. lifeos_test_* DBs
# from crashed runs can pile up; wipe them with: docker compose -f docker/compose.dev.yml -p lifeos-test down -v
set -euo pipefail

docker compose -f docker/compose.dev.yml -p lifeos-test up -d --wait db

docker run --rm --network host \
  -v "$PWD":/app -v lifeos-test-node-modules:/app/node_modules -w /app \
  -e TEST_DATABASE_ADMIN_URL=postgres://lifeos:lifeos@127.0.0.1:5433/postgres \
  node:24-slim sh -c 'npm ci --no-audit --no-fund >/dev/null && npx vitest run "$@"' sh "$@"
