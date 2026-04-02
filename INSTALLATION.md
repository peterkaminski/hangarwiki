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

## Running locally with an AI coding agent

When developing with an AI agent like Claude Code, the agent can start the server and mediate the login flow for you. The key challenge is that magic link tokens are printed to the server console, which the agent needs to be able to read.

### Recommended approach

Have the agent start the servers with output captured to a log file:

```bash
ENCRYPTION_KEY=$(openssl rand -hex 32) EMAIL_PROVIDER=console \
  npm run dev > /tmp/hangarwiki-dev.log 2>&1 &
```

Then, after you request a magic link from the login page at `http://localhost:5173/login`:

1. Ask the agent to read the log file for the magic link URL
2. The agent extracts the `?token=...` URL from the console email output
3. Open that URL in your browser to complete login

The agent can also interact with the API directly on your behalf — creating wikis, pages, and checking state — using `curl` against `http://localhost:4000/api/`.

### Browser automation with Playwright

The project includes [Playwright](https://playwright.dev/) as a dev dependency, giving AI agents a headless Chromium browser they can use to visually inspect the running application. This is useful for:

- **Verifying rendered output** — checking that CSS, layout, and incipient link styling look correct
- **Taking screenshots** — capturing the current state of a page for review
- **End-to-end testing** — driving the full login flow, creating wikis, editing pages
- **Debugging visual issues** — the agent can see exactly what you see

Example: taking a screenshot from the agent's perspective:

```javascript
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5173/my-first-wiki/README');
await page.waitForSelector('.prose');
await page.screenshot({ path: '/tmp/screenshot.png', fullPage: true });
await browser.close();
```

The agent can read the screenshot file to see the rendered page. This closes the feedback loop — the agent can make a CSS change, take a screenshot, and verify the result without asking you to check manually.

To install the Chromium browser binary (required once after cloning):

```bash
npx playwright install chromium
```

> **Note:** Playwright bundles a full Chromium, which is a ~160 MB download. We're watching [Lightpanda](https://lightpanda.io/), a lightweight headless browser written in Zig that uses V8 for JavaScript and speaks the Chrome DevTools Protocol. It claims 9-16x less memory than Chrome and is dramatically smaller. As of early 2026 it's still in beta — it doesn't do CSS layout or visual rendering, which we need — but if it matures into a full rendering engine, it would be a much lighter replacement for Playwright's Chromium dependency.

### Why this works

In development mode (`EMAIL_PROVIDER=console`), magic link emails are printed to stdout instead of sent. An AI agent with shell access can read these logs, find the token URL, and relay it to you. This avoids the need for a real email provider during local testing. With Playwright, the agent can also see the rendered pages, making it a fully capable development partner.

### Stopping the server

```bash
lsof -ti:4000 -ti:5173 | xargs kill
```

## Production deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for a complete guide covering:

- Hetzner CX22 server setup with Ubuntu 24.04
- Forgejo installation and configuration
- HangarWiki build, configuration, and systemd service
- Caddy reverse proxy with automatic HTTPS
- Multiple instances on one server
- Backup strategy and monitoring
