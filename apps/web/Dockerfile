# Build from the repo root:
#   docker build -f apps/web/Dockerfile -t web .
FROM oven/bun:1.4-alpine AS base

# Prune the monorepo down to what the web app needs
FROM base AS pruner
WORKDIR /app
COPY . .
RUN bun x turbo@2.11.10 prune @repo/web --docker

# Install from the pruned lockfile, then build
FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN bun x turbo run build --filter=@repo/web

# Production-only dependencies (the SSR bundle keeps react/react-dom external)
FROM base AS prod-deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile --production

# Runtime image: static client + SSR handler behind server.ts
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/ .
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/apps/web/server.ts ./apps/web/server.ts
USER bun
WORKDIR /app/apps/web
ENV PORT=3001
EXPOSE 3001
CMD ["bun", "run", "server.ts"]
