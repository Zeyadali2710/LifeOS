# Security

LifeOS holds tokens to email, calendars, socials and code. Treat it as highly sensitive.

## Layers
1. **Network** — reachable only over Tailscale (`tailscale serve` provides HTTPS with a valid cert on the tailnet hostname). Postgres is on an internal Docker network, never published.
2. **Authentication** — Better Auth, single owner account. Email+password (argon2/scrypt hashing) with passkeys planned. Sign-up is disabled after the owner exists. Login rate-limited.
3. **Sessions** — DB-backed, httpOnly, `Secure`, `SameSite=Lax` cookies. Better Auth validates `Origin` on mutating requests (CSRF).
4. **Authorization** — every route and server action checks the session. Every agent tool call goes through the permission gateway (`permissions.md`).
5. **Secrets** — `.env` on host (mode 600, gitignored) for bootstrap secrets; integration tokens encrypted at rest with AES-256-GCM (`src/server/crypto.ts`, key `LIFEOS_MASTER_KEY`). Keys never reach the browser: no `NEXT_PUBLIC_*` secrets exist (ADR-002 amendment).
6. **Client IP** — `src/proxy.ts` rewrites `X-Forwarded-For` to the rightmost (proxy-appended) hop before Better Auth sees it, so clients cannot spoof the IP used for rate limiting (5 sign-ins/min/IP) and audit.
7. **Headers** — per-request nonce CSP (`src/proxy.ts`, `strict-dynamic`), HSTS, `X-Frame-Options: DENY`/`frame-ancestors 'none'`, `nosniff`, strict referrer policy, permissions policy.
8. **Input/output validation** — zod at every trust boundary: env, HTTP bodies, provider responses, LLM tool inputs and outputs.
9. **Audit** — `audit_log` for auth events, approvals, permission changes, integration connects/disconnects, and all side-effecting tool calls.
10. **Supply chain** — lockfile committed, `npm audit` + gitleaks in CI, minimal dependencies.

## Rules
- Never commit credentials. Never hardcode secrets. Never log tokens (pino redaction paths configured).
- Never trust agent-generated ids or permission claims.
- OAuth scopes are least-privilege and listed per provider in `integrations.md`.

## Key rotation
`src/scripts/rotate-key.ts` (bundled as `dist/scripts/rotate-key.mjs`) re-encrypts every secret listed in `ENCRYPTED_COLUMNS` (`src/server/key-rotation.ts`: `connections.ciphertext`, `event_sources.url_ciphertext`) from the current key to a new one in a single transaction, verifying each new ciphertext before commit. Any value that does not decrypt aborts the whole rotation. OAuth state cookies in flight are invalidated (just reconnect).

On the VM:
```bash
cd ~/lifeos
NEW=$(openssl rand -base64 32)                      # keep it in your password manager first
lc stop web worker                                  # nothing may decrypt with the old key mid-rotation
lc run --rm -e LIFEOS_MASTER_KEY_NEW="$NEW" -e DRY_RUN=1 migrate node dist/scripts/rotate-key.mjs   # check
lc run --rm -e LIFEOS_MASTER_KEY_NEW="$NEW" migrate node dist/scripts/rotate-key.mjs               # rotate
# set LIFEOS_MASTER_KEY=$NEW in .env, then:
lc up -d
```
Back the key up separately from DB backups: a DB backup without the key cannot reveal tokens, and without the key tokens are unrecoverable (reconnect integrations). Backups taken before a rotation need the old key.

## Backups (Phase 10)
`docker/backup.sh` (the `backup` service) writes a daily `pg_dump -Fc`, keeps it only if `pg_restore --list` can read it back, prunes after 14 days and records the outcome in `settings.backup.last`. A failed backup, or none for 36 hours, appears as a red Home priority. `scripts/restore-drill.sh` restores the newest dump into a throwaway database, compares row counts of key tables with live, then drops it.

## OpenRouter and free models (Phase 3.1)
- **Key storage.** The OpenRouter key is stored like an integration token (AES-256-GCM, ADR-007), shown as last4 only, decrypted per call, sent only in the Authorization header, never logged or sent to the browser. Connect/remove is audited.
- **Private-data gate.** Free models never see private repo content unless the owner turns on "Allow private-repo content on free models" (Settings -> Connections, off by default). Before each free turn, `mentionsSensitive` scans the whole conversation for names of private repos; `private` null (unknown) is treated as private, so it fails closed. A hit switches the run to Sonnet before any free request is built.
- **Thread taint.** `agent_runs.saw_private` is set from a run's prompt and tool results (any model) and backfilled by migration 0002 for runs that existed before the upgrade. Once private data has entered a thread, further delegations in it are not routed free. This closes the paraphrase gap, where the model rewords a private repo name.
- **Provider logging.** Requests set `data_collection: deny` (best effort; if no provider matches, one retry without it). Redaction paths cover the key.
- **Residual risk.** Public data sent to a free model may be logged or trained on by the provider. Only public data should reach it; opt-in on removes the guarantee for private data too.

## Calendar (Phase 4)
- **OAuth state + PKCE.** Google connect keeps state and verifier in an encrypted, single-use cookie, behind the owner session. Redirects use `BETTER_AUTH_URL`.
- **Secrets and rotation.** Google tokens and the iCloud app password are AES-256-GCM encrypted in `integrations`; no `last4` fragment is kept. Reconnecting overwrites the secret; no redeploy. The iCloud password is entered in Settings, never `.env`.
- **SSRF pinning.** Google calls go to fixed Google hosts; CalDAV URLs must be https on `*.icloud.com`.
- **ICS safety.** ICS is written only via ical.js setters (no string concatenation, so CRLF injection is not possible).
- **Prompt injection.** Event text is untrusted; agent writes need approval and locked fields are rebuilt from the DB.
- **Private-data taint.** Calendar tools are marked private: reading calendar data taints the run (`agent_runs.saw_private`), so free models are moved to Sonnet unless `ai.free_private_ok` is on.
- **Audit.** Event metadata in `audit_log` carries ids and actor only, never event text.
- **DB tests.** `scripts/vm-db-test.sh` uses a separate throwaway test Postgres on the VM, never production.
