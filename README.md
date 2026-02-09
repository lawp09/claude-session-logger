# Claude Session Logger (CSL)

Application web self-hosted pour logger, persister et visualiser en temps reel toutes les sessions Claude Code.

## Architecture

```
┌────────────── Mac (daemon) ──────────────┐
│                                          │
│  Claude Code CLI → fichiers JSONL        │
│       ↓                                  │
│  csl-daemon (Node.js, launchd)           │
│  - chokidar file watcher                 │
│  - parse JSONL incrementalement          │
│  - deduplication par requestId           │
│  - HTTPS POST /api/ingest (batch)        │
│  - buffer SQLite si offline              │
└──────────────┬───────────────────────────┘
               │ HTTPS POST (Bearer token)
               ↓
┌────────────── K3s cluster ───────────────┐
│                                          │
│  Traefik → Authelia (sauf /api/ingest)   │
│       ↓                                  │
│  csl-web (Next.js 15 all-in-one)         │
│  - POST /api/ingest                      │
│  - GET /api/sessions, /api/messages      │
│  - PG LISTEN/NOTIFY → SSE push           │
│  - Frontend React 19                     │
│       ↓                                  │
│  PostgreSQL 17 (ClusterIP)               │
└──────────────────────────────────────────┘
```

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Runtime | Node.js >= 22, TypeScript |
| Package manager | pnpm (workspace monorepo) |
| Daemon | chokidar, better-sqlite3 |
| Web | Next.js 15 (App Router), React 19 |
| Styles | Tailwind CSS v4, shadcn/ui |
| Database | PostgreSQL 17 |
| Tests | Vitest 3, testcontainers |

## Structure du projet

```
claude-session-logger/
├── packages/
│   └── daemon/              # File watcher + JSONL parser + HTTP client
│       ├── src/
│       │   ├── parser/      # JSONL parser + types messages
│       │   ├── state/       # State manager (byte offsets)
│       │   ├── watcher/     # chokidar file watcher
│       │   └── http/        # Ingest client + buffer SQLite
│       └── __tests__/
├── apps/
│   └── web/                 # Next.js 15 all-in-one
│       └── src/
│           ├── app/         # Pages + API Routes
│           ├── components/  # React components
│           └── lib/         # DB, hooks, utils
├── docs/
│   └── schema.sql           # Schema PostgreSQL
└── vitest.workspace.ts
```

## Developpement

```bash
# Prerequisites
node >= 22, pnpm >= 9

# Installation
pnpm install

# Dev mode
pnpm dev

# Tests
pnpm test              # Tous les tests
pnpm test:unit         # Tests unitaires
pnpm test:integration  # Tests integration (Docker requis)

# Lint & format
pnpm lint
pnpm format

# Build
pnpm build
```

## Schema base de donnees

4 tables PostgreSQL : `sessions`, `messages`, `content_blocks`, `subagents`

Voir `docs/schema.sql` pour le schema complet.

## Licence

MIT
