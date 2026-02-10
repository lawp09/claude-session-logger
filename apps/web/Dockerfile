# ---- base ----
FROM node:22-alpine AS base
RUN corepack enable pnpm

# ---- deps ----
FROM base AS deps
WORKDIR /app

# Copy only what pnpm needs to resolve the workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/daemon/package.json packages/daemon/package.json

RUN pnpm install --frozen-lockfile

# ---- build ----
FROM base AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

RUN pnpm --filter @csl/web build

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./

# Copy static assets
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Copy public folder if it exists (optional)
# COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

LABEL org.opencontainers.image.source="https://github.com/lawp09/claude-session-logger"
LABEL org.opencontainers.image.description="Claude Session Logger - Web App"
LABEL org.opencontainers.image.licenses="MIT"

CMD ["node", "apps/web/server.js"]
