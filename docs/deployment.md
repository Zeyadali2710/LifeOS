# Deployment

## Target
Proxmox VE → dedicated **Debian 13 VM** (start: 2 vCPU, 4 GB RAM, 40 GB disk) → Docker Engine + Compose plugin.

## Services (`docker/compose.yml`)
| Service | Image | Notes |
|---|---|---|
| `db` | `pgvector/pgvector:pg17` | Volume `pgdata`; internal network only; healthcheck `pg_isready` |
| `migrate` | app image | Runs migrations once, then exits; `web`/`worker` depend on it |
| `web` | app image (`node server.js`, Next standalone) | Healthcheck `/api/health`; non-root user |
| `worker` | app image (`node dist/worker.js`) | pg-boss jobs; writes heartbeat |
| `backup` | `postgres:17` | Nightly `pg_dump -Fc` to `./backups`, 14-day retention |
| `tailscale` | `tailscale/tailscale` | Joins tailnet, `tailscale serve` HTTPS → `web:3000` |

All services: `restart: unless-stopped`, memory/CPU limits, json-file log rotation.

## Remote access
Devices (desktop, laptop, phone, tablet) install Tailscale and open `https://lifeos.<tailnet>.ts.net`. No public ports, no port forwarding.

## Backups
- Nightly pg_dump (in-stack) + Proxmox vzdump of the VM.
- `LIFEOS_MASTER_KEY` and `.env` stored separately (password manager).
- Restore procedure tested in Phase 10.

## Deploy procedure (Phase 1 manual; automate later)
```bash
git pull && docker compose -f docker/compose.yml --env-file .env up -d --build
```

## Local development
```bash
docker compose -f docker/compose.dev.yml up -d   # Postgres only
npm run db:migrate
npm run dev        # web on :3000
npm run worker     # worker
```
