# Amazon Wholesale AI System

Multi-tenant SaaS that takes Amazon product URLs from Excel/CSV files through two AI agents — **seller contact research → B2B email outreach** — with human approval at every hand-off and clear separation of factual, estimated and unavailable data.

**Status:** Phase 1 (SaaS foundation) complete. Phase 2 (Agent 1: Product Research) was skipped and removed. Agents 2 and 3 arrive in Phases 3–4 — see [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Stack

TypeScript monorepo (npm workspaces) · Next.js 15 / React 19 / Tailwind 4 · NestJS 11 · PostgreSQL 16 + Prisma 6 · Redis 7 + BullMQ · Keepa (product data) · Anthropic Claude (LLM)

```
apps/api        NestJS REST API
apps/worker     background jobs (BullMQ)
apps/web        Next.js dashboard
packages/shared enums, permissions, zod schemas, Amazon URL parser
packages/db     Prisma schema, migrations, tenant-scoped client
packages/core   crypto, storage, spreadsheet import/export, queues, workers
packages/agents agent contract + registry
samples/        sample import files
docs/           architecture, schema, agents, integrations, API, plan
```

## Quick start

Requirements: Node ≥ 20.11, Docker.

```bash
cp .env.example .env     # set JWT_ACCESS_SECRET and ENCRYPTION_KEY (see comments)
docker compose up -d
npm install
npm run db:deploy
npm run db:seed          # admin@demo.test / DemoPass123
npm run dev              # web http://localhost:3000 · API http://localhost:4000/api
```

### Running with little memory

`npm run dev` recompiles pages on demand and the web server alone can use around 1 GB. On a machine that is short on memory this shows up as the Next.js error "Jest worker encountered 2 child process exceptions". For normal use, run the built app instead:

```bash
npm run start:fresh      # build everything, then run API, worker and web in production mode
npm run start            # run again without rebuilding (after a restart, no code changes)
```

Use `npm run dev` only while editing code.

## Tests

```bash
npm test                 # unit tests (all packages)
npm run test:e2e         # API e2e against Docker Postgres/Redis
npm run test:ui          # Playwright smoke tests (with `npm run dev` running)
```

## Documentation

* [Architecture](docs/ARCHITECTURE.md) — system design, tenancy, jobs, security
* [Database](docs/DATABASE.md) — full schema across all phases
* [Agents](docs/AGENTS.md) — agent contract, orchestration, agent workflows
* [Integrations](docs/INTEGRATIONS.md) — Keepa, SP-API, Claude, email, storage
* [API](docs/API.md) — endpoints (implemented and planned)
* [Implementation plan](docs/IMPLEMENTATION_PLAN.md) · [Phase 1 report](docs/phase-1.md)
