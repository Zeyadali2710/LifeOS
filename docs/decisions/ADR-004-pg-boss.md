# ADR-004: pg-boss for jobs and schedules
Status: Accepted (2026-10-07)
## Decision
Background jobs, retries with backoff, cron schedules and delayed jobs use pg-boss on the existing Postgres.
## Why
No Redis/broker to run, secure, or back up. Jobs are transactional with app data. Throughput needs are tiny (one user).
## Revisit when
Job volume makes Postgres the bottleneck (unlikely).
