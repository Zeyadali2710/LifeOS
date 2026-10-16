#!/usr/bin/env bash
# Restore drill (run on the VM from ~/lifeos): restores the newest dump into a throwaway database inside the db
# container, compares row counts of key tables with live, then drops only that database. Never touches the live one.
# Usage: bash scripts/restore-drill.sh            (needs the `lc` compose alias or `docker compose -f docker/compose.yml`)
set -euo pipefail
LC="${LC:-docker compose --env-file .env -f docker/compose.yml}"
dump=$(ls -1t backups/lifeos-*.dump 2>/dev/null | head -1 || true)
[ -n "$dump" ] || { echo "No backups/lifeos-*.dump found"; exit 1; }
user=$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2-); live=$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2-)
drill="lifeos_restore_drill_$(date +%Y%m%d%H%M%S)"   # unique: never reuses or drops a database it didn't create
echo "Restoring $dump into $drill ..."
$LC exec -T db psql -U "$user" -d postgres -v ON_ERROR_STOP=1 -q -c "create database $drill"
trap '$LC exec -T db psql -U "$user" -d postgres -q -c "drop database if exists $drill" >/dev/null' EXIT
$LC exec -T db pg_restore -U "$user" -d "$drill" --no-owner < "$dump"
fail=0
for t in __drizzle_migrations users projects tasks finance_transactions knowledge_items goals automations audit_log; do
  q="select count(*) from $t"; [ "$t" = __drizzle_migrations ] && q="select count(*) from drizzle.__drizzle_migrations"
  a=$($LC exec -T db psql -U "$user" -d "$drill" -tAc "$q" 2>/dev/null || echo missing)
  b=$($LC exec -T db psql -U "$user" -d "$live" -tAc "$q" 2>/dev/null || echo missing)
  printf '%-24s restored=%-8s live=%s\n' "$t" "$a" "$b"
  [ "$a" = missing ] && fail=1
done
[ $fail = 0 ] && echo "Restore drill OK (live counts may be higher: rows added since the dump)." || { echo "Restore drill FAILED: a table is missing from the restore"; exit 1; }
