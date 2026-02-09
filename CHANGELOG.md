# Changelog

Tous les changements notables seront documentes ici.

## [Unreleased]

### Added
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
