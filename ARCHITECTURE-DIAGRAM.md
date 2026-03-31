# Architecture Diagram

```mermaid
graph TB
    subgraph Browser
        Web["<b>packages/web</b><br/>React 18 + Vite + Tailwind<br/>CodeMirror 6 editor"]
    end

    subgraph "Node.js Server"
        Server["<b>packages/server</b><br/>Fastify API"]
        Routes["Routes<br/>/api/auth/* /api/wikis/* /api/wikis/:wiki/pages/*"]
        Auth["Auth Service<br/>magic links, sessions,<br/>Ed25519 keypairs"]
        Wiki["Wiki Service<br/>CRUD, access control,<br/>auto-join public wikis"]
        Email["Email Service<br/>Postmark | Resend | Console"]
        Git["Git Service<br/>shell out to git CLI"]
        Forge["Forge Client<br/>Gitea-compatible API<br/>(planned)"]
    end

    subgraph "packages/shared"
        Markdown["Markdown Pipeline<br/>remark + rehype<br/>wikilinks, embeds,<br/>sanitization"]
    end

    subgraph "Data (on disk)"
        DB[("SQLite<br/>users, sessions,<br/>magic_links, wikis,<br/>wiki_members")]
        Repos[("Git Repos<br/>data/repos/{slug}/<br/>one repo per wiki<br/>Markdown files")]
    end

    subgraph "External Services"
        EmailAPI["Postmark / Resend<br/>transactional email"]
        ForgeServer["Forgejo / Gitea<br/>(optional)"]
    end

    Web -- "REST API<br/>/api/*<br/>(Vite proxies in dev)" --> Server
    Web -- "imports" --> Markdown
    Server --> Routes
    Routes --> Auth
    Routes --> Wiki
    Auth --> Email
    Auth --> DB
    Wiki --> Git
    Wiki --> DB
    Email -- "HTTP" --> EmailAPI
    Git -- "git CLI<br/>init, commit, log,<br/>read, write" --> Repos
    Forge -- "HTTP API<br/>(planned)" --> ForgeServer
    Server -- "imports" --> Markdown

    style Web fill:#dbeafe,stroke:#3b82f6
    style Server fill:#fef3c7,stroke:#f59e0b
    style Markdown fill:#d1fae5,stroke:#10b981
    style DB fill:#fce7f3,stroke:#ec4899
    style Repos fill:#fce7f3,stroke:#ec4899
    style EmailAPI fill:#e5e7eb,stroke:#6b7280
    style ForgeServer fill:#e5e7eb,stroke:#6b7280,stroke-dasharray: 5 5
    style Forge stroke-dasharray: 5 5
```

## Key relationships

| From | To | How |
|---|---|---|
| **Browser** | **Server** | REST API over HTTP. Vite dev server proxies `/api/*` to Fastify on port 4000. In production, Caddy reverse-proxies everything. |
| **Web** | **Shared** | Direct import. The browser renders Markdown client-side for page view and editor preview, using the same pipeline as the server. |
| **Server** | **Shared** | Direct import. Server-side rendering for API responses that include HTML. |
| **Server** | **SQLite** | Drizzle ORM. Stores users, sessions, wiki metadata, and membership. Not page content — that's in git. |
| **Server** | **Git repos** | Shells out to the `git` CLI. Each wiki is a bare-ish repo in `data/repos/{slug}/`. Every page edit is a commit. |
| **Server** | **Email** | HTTP API calls to Postmark or Resend. In dev mode, emails are logged to console. |
| **Server** | **Forgejo** | Planned. Will use Gitea-compatible REST API for repo creation, webhooks, SSH key registration. Dashed lines = not yet wired up. |

## File layout

```
hangarwiki/
├── packages/
│   ├── server/           # Fastify API server
│   │   └── src/
│   │       ├── routes/       auth.ts, wikis.ts, pages.ts
│   │       ├── services/     auth.ts, wiki.ts, git.ts, email.ts,
│   │       │                 crypto.ts, forge.ts, paths.ts
│   │       ├── db/           schema.ts, index.ts (SQLite + Drizzle)
│   │       ├── middleware/   auth.ts (session validation)
│   │       └── config.ts     env var getters
│   ├── web/              # React frontend
│   │   └── src/
│   │       ├── pages/        Login, WikiList, WikiHome, PageView,
│   │       │                 PageEdit, PageHistory
│   │       ├── components/   Editor (CodeMirror wrapper)
│   │       ├── hooks/        useAuth (context + provider)
│   │       ├── lib/          api.ts (REST client), markdown.ts
│   │       └── styles/       index.css (Tailwind + wikilink styles)
│   └── shared/           # Shared code (used by both)
│       └── src/markdown/
│           ├── wikilink.ts   extract [[links]] and ![[embeds]]
│           └── render.ts     unified/remark pipeline
└── data/                 # Runtime data (gitignored)
    ├── hangarwiki.db         SQLite database
    └── repos/                Git repos, one per wiki
        └── {wiki-slug}/
```
