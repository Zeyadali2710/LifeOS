# ADR-005: Activity events table + LISTEN/NOTIFY
Status: Accepted (2026-10-07)
## Decision
Every important change appends to `activity_events`. A trigger/explicit `pg_notify('activity', id)` lets the web process push to browsers via SSE. Domain reactions run as pg-boss jobs.
## Why
Durable and replayable (the table is the log), real-time without new infra, consumers stay decoupled.
