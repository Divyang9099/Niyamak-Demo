# Niyamak Backend — AWS EC2 Deployment

Backend `api.varunaat.in` runs on EC2 in Mumbai. This doc describes what is
**actually deployed** as of 2026-09-01, how to redeploy, and how to rebuild the
box from scratch if it is ever lost.

> The frontend is **not** here. It lives on cPanel at `69.57.172.154` and is
> deployed by FTP + `extract.php`. Nothing in this file affects it.

---

## Current production

| | |
|---|---|
| Host | EC2 `13.207.136.167` (Elastic IP), ap-south-1 Mumbai |
| AWS account | **Divyang90 — 470693845603** |
| SSH key | `~/Downloads/varuna-key-2.pem` |
| OS / runtime | Ubuntu 24.04 LTS · Node 22 |
| Instance | t3.small (2 GB) · 20 GB gp3 |
| Code | `~/Varuna-ops` (GitHub remote carries a PAT, so `git pull` never prompts) |
| Process manager | PM2, **two processes** via `ecosystem.config.js` |
| Web server | nginx → `localhost:5000`, TLS by certbot (auto-renews) |

```bash
ssh -i ~/Downloads/varuna-key-2.pem ubuntu@13.207.136.167
```

### Nothing durable lives on this box

| Data | Where it actually lives |
|---|---|
| All records | **Neon** Postgres (external) |
| All uploaded files | **Cloudflare R2** (external) — `R2_BUCKET=varunaops-client` |
| Job queue | **Redis Cloud** (external) — *not* localhost, despite `.env.example` |
| Secrets | `~/Varuna-ops/backend/.env` — **the only irreplaceable thing here** |

A spare copy of `.env` is kept at `~/env-safe-copy.txt`. Restore with:

```bash
cp ~/env-safe-copy.txt ~/Varuna-ops/backend/.env
```

Keep it in sync after any `.env` edit.

### The two processes

```bash
pm2 start ecosystem.config.js     # starts both
```

| Process | Runs | Notes |
|---|---|---|
| `varuna-api` | HTTP + Socket.IO + BullMQ workers | `DISABLE_SCHEDULER=true` |
| `varuna-worker` | BullMQ workers + **cron scheduler** | owns all scheduled jobs |

`server.js` loads the workers in-process too, so both processes consume the
queue. That is fine — BullMQ locks jobs. The scheduler must run in **exactly
one** place, which is why the API has it disabled.

---

## Redeploy (the normal case)

```powershell
.\deploy-backend.ps1 -Message "your commit message"
```

Or by hand:

```bash
cd ~/Varuna-ops && git pull origin main
cd backend && npm install
npm run migrate                              # safe — skips already-applied
pm2 restart varuna-api varuna-worker --update-env
curl localhost:5000/health
```

`npm run migrate` tracks applied files in a `schema_migrations` table, so
re-running it against a live database is safe.

---

## Rebuilding the server from scratch

Only needed if the instance is lost or you are moving accounts again.

### 1. Save the secrets off the old box FIRST

```bash
mkdir -p ~/varuna-backup && cd ~/varuna-backup
cp ~/Varuna-ops/backend/.env ./env.backup
sudo cp /etc/nginx/sites-available/varuna-api ./nginx-varuna-api.conf
cp ~/.pm2/dump.pm2 ./pm2-processes.json 2>/dev/null
{ node -v; npm -v; pm2 -v; nginx -v; } > ./versions.txt 2>&1
sudo chown ubuntu:ubuntu ./* && cd ~
tar -czf varuna-backup.tar.gz varuna-backup
```

Then `scp` that one archive down to your PC. **Do not proceed without it** —
`JWT_SECRET` cannot be regenerated without logging every user out.

### 2. Launch the instance

Ubuntu 24.04 · 64-bit x86 · **t3.small** · 20 GB gp3 · Elastic IP attached.
Security group: SSH 22 (My IP), HTTP 80 (anywhere), HTTPS 443 (anywhere).

### 3. Install

```bash
sudo NEEDRESTART_MODE=a DEBIAN_FRONTEND=noninteractive apt-get update -y && sudo NEEDRESTART_MODE=a DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
sudo NEEDRESTART_MODE=a apt-get install -y build-essential git nginx
sudo npm install -g pm2
```

*(A local `redis-server` is not required — production Redis is Redis Cloud.)*

### 4. Code and secrets

```bash
git clone https://<PAT>@github.com/Divyang9099/Varuna-ops.git ~/Varuna-ops
cd ~/Varuna-ops/backend && npm install
```

Upload `env.backup` from your PC to `~/Varuna-ops/backend/.env`, then
`cp ~/Varuna-ops/backend/.env ~/env-safe-copy.txt`.

### 5. Verify connections before starting anything

```bash
redis-cli -u "$(grep '^REDIS_URL=' ~/Varuna-ops/backend/.env | cut -d= -f2-)" ping
cd ~/Varuna-ops/backend && node -e "require('dotenv').config();const{Pool}=require('pg');new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,ssl:{rejectUnauthorized:false}}).query('SELECT COUNT(*) FROM users').then(r=>{console.log('DB OK -',r.rows[0].count);process.exit(0)}).catch(e=>{console.error('DB FAILED:',e.message);process.exit(1)})"
```

Both must pass. If either fails, the service has an IP allowlist that needs the
new address added.

### 6. Start

```bash
cd ~/Varuna-ops/backend && npm run migrate
pm2 start ecosystem.config.js
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
pm2 save
```

### 7. nginx

```bash
sudo tee /etc/nginx/sites-available/varuna-api > /dev/null <<'EOF'
server {
    listen 80;
    server_name api.varunaat.in;

    client_max_body_size 200M;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 300s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/varuna-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

`client_max_body_size` is essential — without it nginx caps uploads at 1 MB and
returns a 413 carrying **no CORS header**, which the browser misreports as a
CORS error. If uploads fail with a phantom CORS error, check this first.

### 8. Test on the raw IP, THEN move DNS

Open `http://<NEW_IP>/health` in a browser. Only once that returns
`{"status":"ok"}` should you change DNS.

DNS is in **Hostingraja cPanel → Zone Editor** (nameservers `ns1–ns4.mysecurecloudhost.com`),
not Cloudflare. Change only the `A` record named `api.varunaat.in.`. Leave
`app`, `www`, root, MX, TXT and DKIM alone.

### 9. TLS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.varunaat.in
```

Wait for DNS to resolve to the new IP first, or the challenge fails.

---

## Gotchas learned the hard way

**Gmail SMTP breaks on a new server IP.** The `.env` can be byte-identical
(verified by matching `md5sum`) and Gmail will still return
`535-5.7.8 Username and Password not accepted` from an unfamiliar address.
Fix: create a **new** app password at `myaccount.google.com/apppasswords` for
`hemalam.37@gmail.com` and replace `SMTP_PASS`. Verify without restarting:

```bash
cd ~/Varuna-ops/backend && node -e "require('./src/core/utils/mailer').verifyConnection().then(ok=>{console.log('RESULT:', ok?'EMAIL WORKS':'EMAIL BROKEN');process.exit(0)})"
```

**Multi-line pastes into SSH get jumbled.** Lines echo while an earlier command
is still running and half of them end up unexecuted. Paste a single long line
joined with `&&` / `;`, or use a heredoc that writes a file.

**`rm -rf ~/Varuna-ops && git clone ...` is dangerous over SSH.** If the
connection drops between the two halves, the code is gone. It happened.
Recovery is a fresh clone plus `cp ~/env-safe-copy.txt` — which is why that
spare copy exists.

**SSH source is set to "My IP".** A changing home/mobile IP produces a connect
timeout. The website is unaffected (80/443 are open to all). Fix in
EC2 → Security Groups → `launch-wizard-1` → Edit inbound rules → SSH → My IP.

**Check for forgotten resources when decommissioning.** The old account was
billing ~$34/month because it ran a *second* unrelated instance (`pratibimb-api`)
plus two Elastic IPs. Before assuming an account is idle, check Instances,
Elastic IPs and unattached Volumes. AWS bills every public IPv4 — attached or
not, running or stopped.

---

## Handy commands

| Task | Command |
|---|---|
| Status | `pm2 status` |
| API logs | `pm2 logs varuna-api --lines 50` |
| Worker logs | `pm2 logs varuna-worker --lines 50` |
| Restart both | `pm2 restart varuna-api varuna-worker` |
| Health | `curl localhost:5000/health` |
| Test nginx | `sudo nginx -t` |
| Reload nginx | `sudo systemctl reload nginx` |
| Disk / memory | `df -h` · `free -m` |
| Edit secrets | `nano ~/Varuna-ops/backend/.env` |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 502 Bad Gateway | App not running | `pm2 status`, then `pm2 logs varuna-api` |
| Login bounces out | Cookie domain | `COOKIE_DOMAIN=.varunaat.in` — leading dot required |
| CORS error in console | Origin mismatch | `FRONTEND_URL` must include `https://app.varunaat.in` |
| Everyone logged out | `JWT_SECRET` changed | Restore the exact value from backup |
| Live updates dead | Websocket blocked | nginx missing `Upgrade`/`Connection` headers |
| Exports never finish | Worker or Redis down | `pm2 logs varuna-worker`; check `REDIS_URL` |
| Uploads fail >1 MB | nginx body limit | Add `client_max_body_size 200M;` |
| No emails | Gmail app password | See the SMTP gotcha above |
| DB connection refused | Neon IP allowlist | Add the server's Elastic IP in Neon settings |
| `ssh` times out | Security group | SSH source → My IP |
| App dies after hours | Out of memory | `free -m`; PM2 restarts at 500 MB by design |

---

*Backend: EC2 ap-south-1 · Frontend: cPanel · DB: Neon · Files: Cloudflare R2 · Queue: Redis Cloud*
