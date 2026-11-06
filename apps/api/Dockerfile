# Build from the repo root:
#   docker build -f apps/api/Dockerfile -t api .
FROM oven/bun:1.4-alpine AS base

# Prune the monorepo down to what the api needs
FROM base AS pruner
WORKDIR /app
COPY . .
RUN bun x turbo@2.11.10 prune @repo/api --docker

# Install from the pruned lockfile, then build
FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN bun x turbo run build --filter=@repo/api

# Minimal runtime image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
USER bun
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "dist/index.js"]
