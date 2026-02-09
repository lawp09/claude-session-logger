# Claude Code Session Logger (CSL)

## Project Overview

Application web pour logger, persister et visualiser en temps reel toutes les sessions Claude Code.
Architecture hybride : daemon local (Mac) + Next.js all-in-one (K3s).

## Architecture

```
Mac (daemon)                         K3s (web)
─────────────                        ─────────
Claude Code CLI → JSONL files        Next.js 15 (API Routes + Frontend)
       ↓                                    ↓
chokidar file watcher                PostgreSQL 17 (ClusterIP)
       ↓                                    ↓
JSONL parser → HTTP POST ──────→ POST /api/ingest
               (Bearer token)        GET /api/sessions
                                     GET /api/sessions/:id/messages
                                     SSE push (PG LISTEN/NOTIFY)
```

## Monorepo Structure

```
packages/
  daemon/          # File watcher + JSONL parser + HTTP client (Mac)
apps/
  web/             # Next.js 15 all-in-one (API Routes + Frontend)
docs/              # Schema SQL, ADRs
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js >= 22, TypeScript |
| Package manager | pnpm (workspace monorepo) |
| Daemon | chokidar, better-sqlite3 (offline buffer) |
| Web framework | Next.js 15 (App Router, standalone) |
| Frontend | React 19, Tailwind CSS v4, shadcn/ui |
| Database | PostgreSQL 17 (pg client) |
| Tests | Vitest 3, testcontainers, memfs |
| Linting | ESLint flat config, Prettier |

## Development Commands

```bash
# Install dependencies
pnpm install

# Dev mode (all packages)
pnpm dev

# Run tests
pnpm test                    # All tests
pnpm test:unit               # Unit tests only
pnpm test:integration        # Integration tests (needs Docker)

# Lint & format
pnpm lint
pnpm format

# Build
pnpm build

# Daemon only
pnpm --filter @csl/daemon dev
pnpm --filter @csl/daemon test

# Web only
pnpm --filter @csl/web dev
pnpm --filter @csl/web test
```

## Database

- PostgreSQL 17 on K3s (ClusterIP, never exposed)
- 4 tables: `sessions`, `messages`, `content_blocks`, `subagents`
- Schema: `docs/schema.sql`
- Idempotence: `ON CONFLICT DO NOTHING` everywhere

## Key Design Decisions

1. **No `progress` messages in DB** — 70-80% of JSONL volume, only transit via SSE (fire and forget)
2. **Deduplication by `requestId`** — Claude streams partial then final assistant messages, keep only the last
3. **Truncation** — `tool_result` content capped at 50KB in DB
4. **Offline resilience** — daemon buffers in local SQLite when API unreachable, auto-retry every 30s
5. **Bearer token auth** on `/api/ingest` — bypasses Authelia, validated in Next.js middleware

## Conventions

- **Language**: TypeScript strict mode everywhere
- **Naming**: camelCase functions, PascalCase types/classes, kebab-case files
- **Tests**: TDD approach, colocated in `__tests__/` dirs, `.test.ts` suffix
- **Imports**: Relative within package, `@csl/daemon` or `@csl/web` cross-package
- **Error handling**: Never silently fail, meaningful error messages, log with context
- **Git**: Conventional commits, no secrets in code

## Environment Variables

### Daemon (Mac)
```
CSL_API_URL=https://csl.philippelawson.net/api/ingest
CSL_API_TOKEN=<bearer-token>
CSL_WATCH_DIR=~/.claude/projects
CSL_BUFFER_DB=~/.claude-session-logger/buffer.db
```

### Web (K3s)
```
DATABASE_URL=postgresql://csl:password@postgresql:5432/csl
CSL_INGEST_TOKEN=<bearer-token>
```
