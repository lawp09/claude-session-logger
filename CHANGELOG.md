# Changelog

Tous les changements notables seront documentes ici.

## [Unreleased]

### Added
- Extraction automatique du slug/summary depuis `sessions-index.json` (priorité) et `raw.slug` JSONL (fallback)
- `upsertSession` accepte un `summary` (COALESCE : ne remplace pas une valeur existante)
- Stats par outil (`content_blocks.tool_name`) dans `getSessionStats`
- `docker-compose.yml` et `Dockerfile.dev` pour le développement local
- Requêtes `getSessionMessages` et `getSessionStats` parallélisées (Promise.all)

### Previously added
- Dockerfile multi-stage Next.js standalone (node:22-alpine, user non-root, healthcheck)
- GitHub Actions workflow build + push GHCR (amd64 + arm64, cache GHA, path filter)
- Script build-push.sh pour build/push local avec --dry-run
- Script smoke-test.sh pour validation post-deploiement (health, ingest, sessions, SSE)
- .dockerignore optimise pour monorepo pnpm
- Panneau detail 3eme colonne responsive (resume session, fichiers modifies, stats outils)
- DiffViewer avec syntax highlighting shiki (dark/light, unified diff format)
- CodeBlock shiki lazy-loaded dans MessageBubble (remplacement blocs code bruts)
- Subagent tree view collapsible (API, hook, composant) integre dans detail panel
- Pagination cursor-based GET /api/sessions/:id/messages (?limit=50&cursor=timestamp)
- Infinite scroll messages (useInfiniteQuery + IntersectionObserver)
- GET /api/sessions/:id/subagents endpoint
- Tests integration daemon pipeline (7 tests parse-pipeline)
- Tests integration API ingest + PostgreSQL testcontainers (7 tests)
- 13 tests unitaires edge cases parser (UTF-8, queue-operation, pr-link, etc.)

### Fixed
- Troncation UTF-8 incorrecte dans tool_result (coupait les caracteres multi-octets)
- ON CONFLICT manquant sur INSERT content_blocks (risque de doublons)
- Index UNIQUE manquant sur content_blocks(message_id, block_index)

### Previously added (Phase 0-2)
- API Routes Next.js 15 : POST /api/ingest (Bearer auth, batch INSERT PG, pg_notify), GET /api/sessions (pagination, filtre projet), GET /api/sessions/:id/messages (content_blocks imbriques), GET /api/sessions/:id/stats (tokens, duree, top tools)
- SSE endpoint temps reel via PG LISTEN/NOTIFY avec keepalive 30s
- DB queries PostgreSQL avec transactions, ON CONFLICT DO NOTHING
- Layout responsive sidebar + zone principale avec toggle mobile
- Sidebar sessions groupees par projet avec timestamps relatifs (date-fns)
- MessageBubble : user/assistant, thinking collapsible, markdown (react-markdown), tool badges couleur
- Dark/light mode via next-themes + CSS variables Tailwind v4
- React Query hooks (useSessions, useSessionMessages, useSessionStats) + SSE invalidation cache
- Daemon local Mac : JSONL parser (8 types, dedup requestId), state manager (byte offsets), file watcher (chokidar), HTTP ingest client, buffer SQLite offline
- Schema PostgreSQL 4 tables (sessions, messages, content_blocks, subagents) + 7 index
- Monorepo pnpm (packages/daemon + apps/web), Vitest 3, ESLint flat config, Prettier

## [0.1.0] - 2026-02-09

### Added
- Init du projet
