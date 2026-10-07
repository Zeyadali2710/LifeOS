# Phase 1: Foundation — Summary

**Status:** Complete (2026-10-07) · Requirements FND-01..FND-12

## Delivered
- Next.js 16 app (App Router, Tailwind v4 tokens, Geist) + esbuild-bundled worker/scripts from one package
- Better Auth single-owner login; sign-up disabled; 5/min/IP sign-in limit (DB-backed); hardened cookies; audit of sign-in/fail/out
- `src/proxy.ts`: auth gate (redirect pages, 401 APIs), per-request nonce CSP, X-Forwarded-For normalization
- Drizzle schema + `0000_init` migration: auth tables, audit_log, settings, activity_events, notifications
- AES-256-GCM secret encryption, zod env validation, pino structured logs with redaction
- pg-boss worker with queued heartbeat; `/api/health` (db + worker)
- Docker: multi-stage non-root images; prod Compose (db on internal network, migrate, web, worker, backup, tailscale); dev Compose
- CI: typecheck, lint, vitest, npm audit, Playwright, gitleaks

## Verification
- typecheck + lint clean; vitest 11/11; Playwright 16/16 (desktop + mobile)
- Prod Compose run locally: all services healthy, non-root, limits applied, backup dump written
- Code review (high): 7 findings, all fixed (open redirect, XFF spoofing, rate-limit test, session dedupe, log labels, atomic owner creation, worker shutdown)

## Not verified
- Tailscale sidecar (needs TS_AUTHKEY + real tailnet) — verify on first Proxmox deploy
- CI workflow has not run (no GitHub remote yet)
- Signed-in Home page checked via Playwright only, not visually in the browser pane

## Deviations
- Dropped `server-only` (breaks the plain-Node worker); see ADR-002 amendment
- Local e2e uses system Chrome (Playwright browser download blocked on this network)
