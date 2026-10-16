#!/bin/sh
# Daily verified pg_dump. A dump only replaces today's file after it fully restores into a throwaway database (then
# dropped), and every run records its outcome in settings.backup.last so LifeOS can flag a failed or stale backup.
set -u
verify() { # $1 = dump file; restores into a uniquely named temporary database, always dropped afterwards
  vdb="lifeos_backup_verify_$(date +%s)_$$"
  psql -d postgres -v ON_ERROR_STOP=1 -q -c "create database $vdb" || return 1
  pg_restore --no-owner --exit-on-error -d "$vdb" "$1"; rc=$?
  psql -d postgres -q -c "drop database if exists $vdb" >/dev/null
  return $rc
}
while true; do
  day=$(date +%F); tmp="/backups/.lifeos-$day.dump.tmp"; out="/backups/lifeos-$day.dump"
  if pg_dump -Fc -f "$tmp" && verify "$tmp"; then
    mv "$tmp" "$out"
    bytes=$(wc -c < "$out" | tr -d ' ')
    status="{\"ok\":true,\"at\":\"$(date -u +%FT%TZ)\",\"file\":\"lifeos-$day.dump\",\"bytes\":$bytes}"
    find /backups -name 'lifeos-*.dump' -mtime +14 -delete
  else
    rm -f "$tmp"
    status="{\"ok\":false,\"at\":\"$(date -u +%FT%TZ)\",\"file\":null,\"bytes\":0}"
    echo "backup FAILED for $day" >&2
  fi
  psql -v ON_ERROR_STOP=1 -q -c "insert into settings (key, value) values ('backup.last', '$status'::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()" \
    || echo "could not record backup status" >&2
  [ "${RUN_ONCE:-}" = 1 ] && break # test hook
  sleep 86400
done
