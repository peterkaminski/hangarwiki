# Installation

## Prerequisites

- **Node.js** 20 or later
- **git** (installed and on your PATH)
- **Docker** (optional, for local Forgejo instance)

## Development setup

### 1. Clone and install

```bash
git clone https://github.com/peterkaminski/hangarwiki.git
cd hangarwiki
npm install
```

### 2. Configure environment

```bash
cp env.sh-template env.sh
```

Edit `env.sh` and fill in values. For development, the defaults work — emails will be logged to the console instead of sent.

Generate an encryption key for private key storage:

```bash
openssl rand -hex 32
```

Add it to `env.sh` as `ENCRYPTION_KEY`.

### 3. Start the development servers

```bash
source env.sh
npm run dev
```

This starts:
- **Server** on `http://localhost:4000` (Fastify API)
- **Frontend** on `http://localhost:5173` (Vite dev server with proxy to API)

Open `http://localhost:5173` in your browser.

### 4. (Optional) Start a local Forgejo instance

For testing Forge API integration:

```bash
docker compose up -d
```

Forgejo will be available at `http://localhost:3000`. On first run:
1. Complete the installation wizard
2. Create an admin user
3. Generate an API token (Settings > Applications)
4. Add the token to `env.sh` as `FORGE_API_TOKEN`

## Production deployment

HangarWiki is designed to run alongside a Forgejo instance behind a Caddy reverse proxy.

### 1. Build

```bash
npm run build
```

This compiles the server TypeScript and builds the Vite frontend.

### 2. Server setup

Create a systemd service (example):

```ini
[Unit]
Description=HangarWiki
After=network.target

[Service]
Type=simple
User=hangarwiki
WorkingDirectory=/opt/hangarwiki
ExecStart=/usr/bin/node packages/server/dist/index.js
EnvironmentFile=/opt/hangarwiki/env.sh
Restart=always

[Install]
WantedBy=multi-user.target
```

### 3. Caddy configuration

```
wiki.example.com {
    reverse_proxy localhost:4000
}

git.example.com {
    reverse_proxy localhost:3000
}
```

### 4. Email configuration

For production, configure a transactional email provider:

**Postmark** (recommended):
```bash
export EMAIL_PROVIDER=postmark
export POSTMARK_API_TOKEN=your-token-here
export EMAIL_FROM=wiki@yourdomain.com
```

**Resend** (alternative):
```bash
export EMAIL_PROVIDER=resend
export RESEND_API_KEY=re_your-key-here
export EMAIL_FROM=wiki@yourdomain.com
```

Make sure your sending domain is verified with your email provider.

### 5. Security checklist

- [ ] Set a strong `ENCRYPTION_KEY` (32+ random hex characters)
- [ ] Use HTTPS (Caddy handles this automatically)
- [ ] Set `APP_URL` to your actual domain (`https://wiki.example.com`)
- [ ] Verify email sending works before inviting users
- [ ] Back up the SQLite database (`data/hangarwiki.db`) regularly
- [ ] Git repos are stored in `data/repos/` — include in backups
