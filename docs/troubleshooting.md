# Troubleshooting

| Symptom | Check |
|---|---|
| `/api/health` shows `db: down` | `docker compose ps db`, `docker compose logs db`; `DATABASE_URL` host must be `db` inside compose, `localhost:5433` on the dev machine |
| `/api/health` shows `worker: stale` | `docker compose logs worker`; heartbeat runs every minute and is stale after 3 |
| App exits at boot with env error | Message lists the invalid/missing variable; compare with `.env.example` |
| Can't sign in | Owner exists? `npm run create-owner`. Rate limited after repeated failures — wait 60s |
| Tailscale URL not resolving | `docker compose logs tailscale`; auth key expired? HTTPS certs enabled in tailnet admin? |
| Integration tokens unreadable after restore | `LIFEOS_MASTER_KEY` must match the one used when tokens were stored |
