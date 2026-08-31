# monorepo-template

Bun + Turborepo full-stack template: Elysia API with a declarative
policy/cache/error pipeline, TanStack Start frontend, shared shadcn UI
package, Drizzle + PostgreSQL, better-auth, Biome, t3-env — Docker-ready.

## Structure

```
apps/
  api/          Elysia API (Bun) — port 3000
  web/          TanStack Start frontend (React, Vite, Tailwind) — port 3001
packages/
  db/           Drizzle ORM + PostgreSQL + better-auth instance
  ui/           design tokens + shadcn components (tailwind v4)
  typescript-config/  shared tsconfig base
```

## Getting started

```bash
nix develop            # or: direnv allow — provides bun, psql, redis-cli
docker compose up -d   # postgres :5432 + redis :6381
cp .env.example .env   # fill BETTER_AUTH_SECRET (openssl rand -base64 32)
bun install
cd packages/db && bun run db:migrate && cd ../..
bun run dev
```

## API pipeline (apps/api)

Cross-cutting concerns are two Elysia plugins — route authors declare, never wire:

```ts
.get("/accounts", () => svc.listAccounts(), {
	user: true,                                  // access policy (whitelist)
	cache: { ttlSeconds: 300, tag: "accounts" }, // declarative response cache
	errors: ["not_found"],                       // error codes this route may answer
	response: t.Array(accountResponse),          // egress schema
})
.post("/accounts", …, { user: true, invalidates: ["accounts"] })
```

- **AuthN/AuthZ — whitelist, blocked by default.** Every route must declare
  `public: true` or `user: true`. Missing policy → the app refuses to boot
  (`assertPolicies`) *and* answers `403 policy_missing` at runtime.
- **Caching** — `CachePort` (`src/infra/cache/port.ts`) with in-memory and
  Redis (Bun native client) adapters; Redis is picked when `REDIS_URL` is set.
  Namespace invalidation is an O(1) generation bump; the Redis adapter fails
  open. Cache hits still pass auth and the response schema.
- **Observability** — request id on every response (`x-request-id`),
  structured JSON logs, RED metrics behind a no-op `Metrics` port.
- **Error tracking** — uniform envelope `{ error, message?, requestId }`.
  Routes whitelist their error codes; an undeclared `ApiError`, response
  schema violation, or plain exception becomes `500 INTERNAL` and goes to the
  `ErrorSink` port (point it at Sentry/GlitchTip in `src/http/runtime.ts`).
- **Testing** — the whole pipeline runs through `app.handle()` with injected
  resolvers (`configurePolicies`), no HTTP server, no DB. See
  `src/http/pipeline.test.ts`.

## Commands

```bash
bun run dev            # api + web in watch mode (turbo)
bun run build          # build everything
bun run check-types    # typecheck everything
bun x turbo run test   # run tests
bun run lint           # biome check
bun run lint:fix       # biome check --write

# database (from packages/db)
bun run db:generate    # generate migrations from the schema
bun run db:migrate     # apply migrations
bun run db:studio      # drizzle studio
```

## UI (packages/ui)

Design tokens and components live only in `packages/ui`; changing the design
never touches an app. Add more shadcn components from `apps/web` — they land
in `packages/ui`:

```bash
cd apps/web && bun x shadcn@latest add dialog
```

## Docker

Both apps build from the repo root using `turbo prune --docker`:

```bash
docker build -f apps/api/Dockerfile -t api .
docker build -f apps/web/Dockerfile -t web .
```

## Nix

`flake.nix` provides the dev toolchain (bun, psql, redis-cli); turbo, biome
and typescript come from bun. With direnv installed, `direnv allow` once and
the shell loads automatically.
