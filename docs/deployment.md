# Deployment

LifeOS runs in its own Debian VM on Proxmox, using Docker Compose. It is reachable **only over your Tailscale network**: no ports are opened on your router, and nothing is exposed to the internet.

```
 phone / laptop / desktop (Tailscale app)
        │  https://lifeos.<tailnet>.ts.net
        ▼
 ┌──────────── Debian VM (Proxmox) ─────────────┐
 │ tailscale ──► web :3000 ──┐                  │
 │                worker ────┼──► db (Postgres) │  ◄─ db is on an internal-only network
 │                backup ────┘                  │
 └──────────────────────────────────────────────┘
```

| Service | What it does |
|---|---|
| `db` | Postgres 17 + pgvector. Data in the `pgdata` Docker volume. Not reachable from outside the stack. |
| `migrate` | Applies database migrations, then exits. `web`/`worker` wait for it. |
| `web` | The Next.js app on port 3000, which is reachable only through Tailscale. |
| `worker` | Background jobs (heartbeat now; syncs, agents and automations later). |
| `backup` | `pg_dump` once a day into `./backups/`, keeping 14 days. |
| `tailscale` | Joins your tailnet as the machine `lifeos` and serves HTTPS → `web:3000`. |

---

## Part 1 — Push the code to GitHub (on your Windows PC)

1. On github.com → **New repository** → name `LifeOS`, **Private**, and **don't** add a README, .gitignore or license (the repo already has them).
2. In the LifeOS folder:
   ```bash
   git remote add origin https://github.com/<your-username>/LifeOS.git
   git push -u origin main
   ```
   Git for Windows will open a browser to sign you in the first time.
3. Check the **Actions** tab: the CI workflow runs on every push (typecheck, lint, tests, audit, e2e, secret scan). It should go green.

`.env` is gitignored and has never been committed. Your secrets stay on your PC and, later, on the VM.

---

## Part 2 — Create the VM in Proxmox

1. Download the **Debian 13 netinst ISO** (debian.org → "Download") and upload it in Proxmox: *local storage → ISO Images → Upload*.
2. **Create VM**:
   | Tab | Setting |
   |---|---|
   | General | Name `lifeos` |
   | OS | The Debian ISO, type Linux |
   | System | Check **Qemu Agent** |
   | Disks | 40 GB, VirtIO SCSI, **Discard** on if your storage is SSD |
   | CPU | 2 cores, type `host` |
   | Memory | 4096 MB (the first `docker build` of Next.js needs the headroom) |
   | Network | Your normal bridge (`vmbr0`), VirtIO |
3. Start it and run the installer:
   - Hostname `lifeos`. Make a normal user (e.g. `zeyad`) and set a root password.
   - At **Software selection**, untick the desktop environment and tick only **SSH server** and **standard system utilities**.
4. After reboot, log in on the Proxmox console and get its LAN IP: `ip -4 a`. Ideally give it a DHCP reservation on your router.
5. From your PC: `ssh zeyad@<vm-ip>`. All remaining steps run on the VM.

### Base setup
```bash
su -                      # become root (root password from the installer)
apt update && apt full-upgrade -y
apt install -y sudo git curl ca-certificates qemu-guest-agent unattended-upgrades
usermod -aG sudo zeyad
systemctl enable --now qemu-guest-agent
dpkg-reconfigure -plow unattended-upgrades   # answer Yes: automatic security updates
exit                      # back to your user; log out and in again so sudo works
```

### Install Docker (official repository)
```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker zeyad     # log out and back in afterwards
docker run --rm hello-world       # sanity check
```

---

## Part 3 — Clone the private repo onto the VM

Use a **read-only deploy key** so the VM can pull this one repo and nothing else on your account.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/lifeos_deploy -N "" -C "lifeos-vm"
cat ~/.ssh/lifeos_deploy.pub
```
Copy the printed line to GitHub → your repo → **Settings → Deploy keys → Add deploy key**. Paste it and leave "Allow write access" **unchecked**.

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-lifeos
  HostName github.com
  User git
  IdentityFile ~/.ssh/lifeos_deploy
EOF
git clone git@github-lifeos:<your-username>/LifeOS.git ~/lifeos
cd ~/lifeos
```

---

## Part 4 — Prepare Tailscale

In the Tailscale admin console (login.tailscale.com):

1. **DNS** tab: make sure **MagicDNS** is on, then click **Enable HTTPS** (this lets `tailscale serve` get a real certificate).
   Note your tailnet name shown there, e.g. `tail1234.ts.net`. Your LifeOS URL will be **`https://lifeos.tail1234.ts.net`**.
2. **Access controls** tab: add a tag owner so the server can be tagged (tags make it a server device rather than "you"):
   ```json
   "tagOwners": { "tag:server": ["autogroup:admin"] },
   ```
3. **Settings → Keys → Generate auth key**: Reusable **off**, Ephemeral **off**, **Tags: `tag:server`**. Copy the `tskey-auth-…` value. You'll put it in `.env` next.
   The key is only used on first login. Afterwards the node's identity lives in the `tsstate` volume, so it's fine for the key to expire. Tagged devices don't have node-key expiry, so it won't log itself out.
4. Install the Tailscale app on every device that should reach LifeOS (phone, laptop, tablet) and sign in to the same tailnet.

---

## Part 5 — Create `.env` on the VM

```bash
cd ~/lifeos
cp .env.example .env
chmod 600 .env
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)"
echo "LIFEOS_MASTER_KEY=$(openssl rand -base64 32)"
nano .env
```
Paste the generated values in, so the file looks like:

```ini
NODE_ENV=production
LOG_LEVEL=info

POSTGRES_USER=lifeos
POSTGRES_PASSWORD=<hex from above>        # hex only: it is embedded in a URL
POSTGRES_DB=lifeos
# DATABASE_URL is ignored in production; compose builds it from POSTGRES_*.

BETTER_AUTH_SECRET=<base64 from above>
BETTER_AUTH_URL=https://lifeos.<your-tailnet>.ts.net    # exact URL, no trailing slash
LIFEOS_MASTER_KEY=<base64 from above>

TS_AUTHKEY=tskey-auth-...
```

**Back up `.env` now** (e.g. to your password manager), especially `LIFEOS_MASTER_KEY`. Database backups are useless for integration tokens without it.

> `BETTER_AUTH_URL` must match the address in your browser exactly. If it doesn't, sign-in is rejected by the origin (CSRF) check.

---

## Part 6 — Start LifeOS

Create a shortcut first. Every compose command needs both the compose file and `.env`, and `lc` supplies both:
```bash
echo "alias lc='docker compose -f ~/lifeos/docker/compose.yml --env-file ~/lifeos/.env'" >> ~/.bashrc
source ~/.bashrc
```

```bash
cd ~/lifeos
lc up -d --build
```
The first build takes a few minutes. Then check:

```bash
lc ps
```
Expected: `db`, `web`, `worker`, `backup` and `tailscale` are **running/healthy**, and `migrate` shows **exited (0)**.

```bash
# app health from inside the stack
lc exec web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(console.log)"
# → {"status":"ok","db":"ok","worker":"ok",...}

# tailscale joined and is serving
lc exec tailscale tailscale status
lc exec tailscale tailscale serve status
```
The machine `lifeos` should also appear in the Tailscale admin console.

### Create your owner account (once)
`read -rs` lets you type the password without it echoing or landing in shell history:
```bash
read -rs OWNER_PASSWORD; export OWNER_PASSWORD
lc run --rm \
  -e OWNER_EMAIL=you@example.com -e OWNER_NAME="Zeyad" -e OWNER_PASSWORD \
  worker node dist/scripts/create-owner.mjs
unset OWNER_PASSWORD
```
The password needs at least 12 characters. The script refuses to run if an owner already exists.

### Open it
On any device signed in to Tailscale, open `https://lifeos.<your-tailnet>.ts.net` and sign in.
The first request can take ~10 s while Tailscale issues the certificate.

---

## Part 7 — Proxmox backups (whole-VM safety net)

Proxmox → **Datacenter → Backup → Add**: select the `lifeos` VM, schedule daily (e.g. 03:30), Mode **Snapshot**, and set retention (e.g. keep 7 daily). The in-stack `pg_dump` files land in `~/lifeos/backups/`, so they're inside these VM backups too.

---

## Day-to-day operations

All commands run from `~/lifeos` on the VM and use the `lc` alias from Part 6.

**Update to the latest code** (after pushing from your PC):
```bash
git pull
lc up -d --build
docker image prune -f          # remove old image layers
```
`migrate` runs automatically before `web` and `worker` start.

**Logs:**
```bash
lc logs -f web worker      # structured JSON
lc logs --since 1h tailscale
```

**Restart / stop:**
```bash
lc restart web
lc down          # stops; data volumes are kept
```
Never run `down -v` on the VM: `-v` deletes the database volume.

**Restore a database backup:**
```bash
lc stop web worker
lc exec -T db pg_restore -U lifeos -d lifeos --clean --if-exists < backups/lifeos-YYYY-MM-DD.dump
lc start web worker
```
Restoring requires the same `LIFEOS_MASTER_KEY` that was in use when the backup was taken.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `migrate` exited non-zero | `lc logs migrate`. Usually a bad `POSTGRES_PASSWORD` (use hex) or `db` not healthy yet. Re-run `lc up -d`. |
| App container keeps restarting | `lc logs web` and look for `Invalid environment:` with the variable name. Fix `.env`, then `lc up -d`. |
| Sign-in fails with no clear error | `BETTER_AUTH_URL` doesn't match the browser URL exactly. Fix `.env`, then `lc up -d` (`lc restart` does **not** reload `.env`). |
| Changed `.env` but nothing changed | Use `lc up -d` — it recreates containers with the new values; `restart` keeps the old environment. |
| "Too many attempts" | Rate limit: 5 sign-ins/min. Wait a minute. |
| URL doesn't resolve on phone | Phone's Tailscale app is off or on another account; MagicDNS disabled. |
| Certificate error | HTTPS not enabled in the tailnet DNS settings; check `tailscale serve status`. |
| `tailscale` logs say auth key invalid | Key expired/used before first login. Make a new one, update `.env`, run `lc rm -sf tailscale && docker volume rm lifeos_tsstate`, then `lc up -d`. |
| Build is killed (exit 137) | VM out of memory during `next build`; give it 4 GB+. |

See also `troubleshooting.md`.
