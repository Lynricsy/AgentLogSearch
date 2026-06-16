# AgentLogSearch

AgentLogSearch is a local-first semantic search workspace for Agent CLI conversation history.
The target development system runs on localhost, indexes local history files, normalizes sessions
and messages, stores searchable chunks, and shows copy-only resume commands.

## Status

The project has completed the T1-T6 foundation work:

- pnpm monorepo workspace and shared TypeScript configuration.
- `packages/shared` contracts for source presets, API payloads, and route-facing types.
- `apps/web` Next.js shell with API client wiring and initial routes.
- `apps/api` NestJS service with `/api/health`.
- PostgreSQL, Prisma, and pgvector schema/migration/service foundation for sources, history files,
  sessions, messages, chunks, scan jobs, and embedding jobs.

The scanner, parser/import pipeline, embedding worker, semantic search implementation, and final
search UI workflows are still pending.

## Workspace

- `apps/web`: Next.js application shell for the search UI, using the shared contracts and API client.
- `apps/api`: NestJS API service with health checks, Prisma setup, and database service tests.
- `packages/shared`: shared contracts, source preset definitions, and typed API shapes.

## Local Privacy Boundary

AgentLogSearch is designed to run on localhost by default. Local Agent CLI history stays on the
developer machine during this implementation wave. Resume commands are displayed and copied only;
the application must never execute `codex resume`, `claude --resume`, `pi --session`, or
`opencode --session` on behalf of the user.

Do not commit private local state:

- `AgentLogs/`
- `.omo/evidence/`
- `.env` or `.env.*`
- real personal Agent CLI history, API tokens, environment dumps, cookies, or raw private logs

Use `.env.example` as the committed environment template.

## Database

Local PostgreSQL is provided by Docker Compose:

- Image: `pgvector/pgvector:pg17`
- Host: `localhost`
- Port: `5432`
- Database/user/password: `agent_log_search`
- `DATABASE_URL`: copied from `.env.example`

Start the database:

```bash
docker compose up -d postgres
```

Generate the Prisma client and apply migrations:

```bash
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate
```

Run the database service test:

```bash
pnpm --filter api test -- database.service.spec.ts
```

## First-Class Sources Planned

- Codex CLI: `~/.codex/sessions/**/*.jsonl`
- Claude Code: `~/.claude/projects/**/*.jsonl`
- Pi Agent: `~/.pi/agent/sessions/**/*.jsonl`
- OpenCode: `~/.local/share/opencode/opencode.db`
- Generic JSONL, JSON, and Markdown imports

## Sources API

The API now exposes source configuration endpoints under `/api/sources`:

- `GET /api/sources`
- `GET /api/sources/presets`
- `POST /api/sources`
- `PATCH /api/sources/:id`
- `DELETE /api/sources/:id`

Source payloads use shared hyphenated values such as `claude-code`, `codex-jsonl`, and
`file-glob`; the API maps them explicitly to Prisma underscore enum values such as
`claude_code`, `codex_jsonl`, and `file_glob`. `rootPath` accepts absolute paths and `~/...`,
is normalized before storage, and must point to an existing directory. Symlink roots are rejected
unless the request explicitly sets `followSymlinks: true`. Scan guard fields
`maxFileSizeBytes`, `maxFilesPerScan`, and `followSymlinks` are validated at the API boundary;
the scanner persistence model lands in the later scan implementation.

## Development

Install dependencies:

```bash
pnpm install
```

Run the standard gates:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Start the API:

```bash
pnpm --filter api dev
```

The API listens on `API_PORT` from `.env.example` and defaults to `3001`. Health check:

```bash
curl http://localhost:3001/api/health
```

Start the web app:

```bash
pnpm --filter web dev
```

The web app uses `NEXT_PUBLIC_API_BASE_URL` from `.env.example` and defaults to
`http://localhost:3001/api`.
