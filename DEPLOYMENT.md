# HangarWiki — Deployment Guide

Deploy HangarWiki and Forgejo on a Hetzner CX22 (2 vCPU, 4GB RAM, 40GB SSD) running Ubuntu 24.04.

## Server Setup

### 1. Create the server

- Hetzner Cloud Console: create a CX22 with Ubuntu 24.04
- Enable IPv4 ($0.60/mo) — IPv6-only causes reachability issues for some users
- Add your SSH key during creation
- Note the server's IPv4 and IPv6 addresses

### 2. DNS

Point two subdomains to your server's IP address:

```
wiki.example.org    A    → <server-ipv4>
git.example.org     A    → <server-ipv4>
wiki.example.org    AAAA → <server-ipv6>
git.example.org     AAAA → <server-ipv6>
```

`wiki.example.org` serves HangarWiki. `git.example.org` serves Forgejo. Caddy handles HTTPS automatically for both.

### 3. Initial server config

```bash
ssh root@<server-ip>

# Update system
apt update && apt upgrade -y

# Create a non-root user
adduser --disabled-password hangar
usermod -aG sudo hangar

# Allow passwordless sudo (optional, for convenience during setup)
echo "hangar ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/hangar

# Set up firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Reboot to pick up kernel updates
reboot
```

### 4. Install dependencies

```bash
ssh hangar@<server-ip>

# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Git (should already be installed, but ensure it's current)
sudo apt install -y git

# Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

## Forgejo Setup

### 5. Install Forgejo

```bash
# Download latest Forgejo binary
FORGEJO_VERSION="10.0.1"  # Check https://codeberg.org/forgejo/forgejo/releases for latest
wget -O /tmp/forgejo "https://codeberg.org/forgejo/forgejo/releases/download/v${FORGEJO_VERSION}/forgejo-${FORGEJO_VERSION}-linux-amd64"
sudo install /tmp/forgejo /usr/local/bin/forgejo

# Create Forgejo system user and directories
sudo adduser --system --shell /bin/bash --group --home /home/forgejo forgejo
sudo mkdir -p /var/lib/forgejo/{custom,data,log}
sudo chown -R forgejo:forgejo /var/lib/forgejo
```

### 6. Configure Forgejo

Create `/etc/forgejo/app.ini`:

```bash
sudo mkdir -p /etc/forgejo
sudo tee /etc/forgejo/app.ini << 'APPINI'
[server]
DOMAIN             = git.example.org
ROOT_URL           = https://git.example.org/
HTTP_PORT          = 3000
SSH_DOMAIN         = git.example.org
START_SSH_SERVER   = true
SSH_PORT           = 2222
LFS_START_SERVER   = false
OFFLINE_MODE       = true

[database]
DB_TYPE  = sqlite3
PATH     = /var/lib/forgejo/data/forgejo.db

[repository]
ROOT = /var/lib/forgejo/data/repositories

[security]
INSTALL_LOCK = true
SECRET_KEY   = <generate-with: openssl rand -hex 32>

[service]
DISABLE_REGISTRATION = true

[log]
MODE  = file
LEVEL = Warn
APPINI
sudo chown -R forgejo:forgejo /etc/forgejo
```

Generate the secret key:

```bash
SECRET=$(openssl rand -hex 32)
sudo sed -i "s|<generate-with: openssl rand -hex 32>|${SECRET}|" /etc/forgejo/app.ini
```

### 7. Forgejo systemd service

```bash
sudo tee /etc/systemd/system/forgejo.service << 'EOF'
[Unit]
Description=Forgejo
After=network.target

[Service]
User=forgejo
Group=forgejo
WorkingDirectory=/var/lib/forgejo
ExecStart=/usr/local/bin/forgejo web --config /etc/forgejo/app.ini
Restart=always
RestartSec=3
Environment=FORGEJO_WORK_DIR=/var/lib/forgejo

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now forgejo
```

### 8. Create the Forgejo admin user and API token

```bash
# Create admin user (used by HangarWiki for repo management)
sudo -u forgejo /usr/local/bin/forgejo admin user create \
  --config /etc/forgejo/app.ini \
  --username hangarwiki \
  --password "$(openssl rand -base64 24)" \
  --email wiki@example.org \
  --admin

# Generate an API token for HangarWiki
# Log into Forgejo at https://git.example.org after Caddy is set up,
# then: Settings → Applications → Generate New Token (with repo scope)
```

## HangarWiki Setup

### 9. Clone and build

```bash
# As the hangar user
cd /home/hangar
git clone https://github.com/peterkaminski/hangarwiki.git
cd hangarwiki
npm install
npm run build
```

### 10. Configure HangarWiki

```bash
tee /home/hangar/hangarwiki/env.sh << 'ENVSH'
# Server
export PORT=4000
export HOST=127.0.0.1
export NODE_ENV=production
export DATA_DIR=/home/hangar/hangarwiki/data

# App URL (must match the Caddy domain)
export APP_URL=https://wiki.example.org

# Forgejo
export FORGE_URL=http://127.0.0.1:3000
export FORGE_API_TOKEN=<your-forgejo-api-token>

# Email — choose one provider
export EMAIL_PROVIDER=postmark
export POSTMARK_API_TOKEN=<your-postmark-token>
export EMAIL_FROM=wiki@example.org

# Encryption key for stored private keys (generate once, never lose it)
export ENCRYPTION_KEY=<generate-with: openssl rand -hex 32>
ENVSH

chmod 600 /home/hangar/hangarwiki/env.sh
```

Generate the encryption key:

```bash
ENCKEY=$(openssl rand -hex 32)
sed -i "s|<generate-with: openssl rand -hex 32>|${ENCKEY}|" /home/hangar/hangarwiki/env.sh
```

Fill in the Forgejo API token and email provider credentials.

### 11. HangarWiki systemd service

```bash
sudo tee /etc/systemd/system/hangarwiki.service << 'EOF'
[Unit]
Description=HangarWiki
After=network.target forgejo.service

[Service]
User=hangar
Group=hangar
WorkingDirectory=/home/hangar/hangarwiki
EnvironmentFile=/home/hangar/hangarwiki/env.sh
ExecStart=/usr/bin/node packages/server/dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now hangarwiki
```

Verify it's running:

```bash
curl -s http://127.0.0.1:4000/api/health
# Should return: {"status":"ok","version":"0.1.0"}
```

## Caddy Setup

### 12. Configure Caddy

```bash
sudo tee /etc/caddy/Caddyfile << 'EOF'
wiki.example.org {
    reverse_proxy 127.0.0.1:4000
}

git.example.org {
    reverse_proxy 127.0.0.1:3000
}
EOF

sudo systemctl reload caddy
```

Caddy automatically provisions HTTPS certificates via Let's Encrypt. No further TLS configuration needed.

## Serving the Frontend

HangarWiki in production needs to serve the built React SPA. The simplest approach: build the frontend and have the server serve it as static files.

### 13. Build and serve the frontend

The Vite build outputs to `packages/web/dist/`. Configure the server to serve these files and fall back to `index.html` for client-side routing.

If the server doesn't yet have a static file handler for the SPA, you can use Caddy to serve it directly:

```
wiki.example.org {
    root * /home/hangar/hangarwiki/packages/web/dist
    try_files {path} /index.html
    file_server

    handle /api/* {
        reverse_proxy 127.0.0.1:4000
    }
}
```

This serves the SPA from Caddy and proxies `/api/*` to the Node.js server.

## Updates

To deploy a new version:

```bash
cd /home/hangar/hangarwiki
git pull
npm install
npm run build
sudo systemctl restart hangarwiki
```

## Monitoring

```bash
# Check service status
sudo systemctl status hangarwiki
sudo systemctl status forgejo
sudo systemctl status caddy

# View logs
sudo journalctl -u hangarwiki -f
sudo journalctl -u forgejo -f

# Disk usage (40GB SSD — keep an eye on git repos)
df -h /
du -sh /home/hangar/hangarwiki/data/repos/
du -sh /var/lib/forgejo/data/repositories/
```

## Backup

The critical data is:

| What | Where | How to back up |
|---|---|---|
| Wiki content (git repos) | `data/repos/` | `tar` or `rsync` (they're just git repos) |
| SQLite database | `data/hangarwiki.db` | `sqlite3 ... .backup` or file copy (stop service first) |
| Forgejo data | `/var/lib/forgejo/data/` | `tar` or Forgejo's built-in dump |
| Encryption key | `env.sh` | Copy to a secure location (password manager). Without this key, stored private keys are unrecoverable. |
| Forgejo config | `/etc/forgejo/app.ini` | Copy alongside env.sh |

Simple backup script:

```bash
#!/bin/bash
BACKUP_DIR="/home/hangar/backups/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# SQLite backup (online-safe)
sqlite3 /home/hangar/hangarwiki/data/hangarwiki.db ".backup '$BACKUP_DIR/hangarwiki.db'"

# Git repos
tar czf "$BACKUP_DIR/repos.tar.gz" -C /home/hangar/hangarwiki/data repos/

# Config
cp /home/hangar/hangarwiki/env.sh "$BACKUP_DIR/"
cp /etc/forgejo/app.ini "$BACKUP_DIR/"

echo "Backup complete: $BACKUP_DIR"
```

## Resource Expectations (CX22)

| Resource | Expected usage |
|---|---|
| RAM | ~200MB (Node.js) + ~100MB (Forgejo) + OS ≈ 500MB total. 4GB is plenty. |
| CPU | Idle most of the time. Git operations spike briefly on save. |
| Disk | 40GB is generous. A wiki with 1000 pages ≈ 10-50MB. Git history grows slowly. |
| Bandwidth | 20TB/mo included. A wiki won't use 1% of this. |
