# AgentLogSearch

AgentLogSearch is a local-first semantic search workspace for Agent CLI conversation history.
The target development system runs on localhost, indexes local history files, normalizes sessions
and messages, stores searchable chunks, and shows copy-only resume commands.

## Status

The project has completed the T1-T15 foundation, scanner/import, scheduler, chunker, mock
embedding, semantic search, and session detail API work:

- pnpm monorepo workspace and shared TypeScript configuration.
- `packages/shared` contracts for source presets, API payloads, and route-facing types.
- `apps/web` Next.js shell with API client wiring and initial routes.
- `apps/api` NestJS service with `/api/health`, semantic search, and session detail routes.
- PostgreSQL, Prisma, and pgvector schema/migration/service foundation for sources, history files,
  sessions, messages, chunks, scan jobs, and embedding jobs.
- Scan job listing API with source metadata, pagination bounds, explicit parse status mapping, and
  truncated list error messages.
- Synthetic fixture data and validation tests for Codex CLI, Claude Code, Pi Agent, OpenCode,
  Generic JSONL, Generic JSON, Generic Markdown, and demo-agent sessions.
- Parser infrastructure for the seven supported history formats, including `ParserRegistry`,
  `file-glob` source reading, and read-only SQLite source reading for OpenCode.
- Scanner service and importer for manual scans, including sha256 fingerprints, unchanged-file
  skips, per-source in-process scan locks, scan job/history status updates, session/message import,
  and transactionally generated pending chunks.
- Manual scan API under `/api/scan/run` and `/api/scan/run/:sourceId`.
- Scheduler support for periodic due-source scans.
- Chunker service that creates overlapping message windows with session metadata headers for later
  embedding.
- Deterministic lexical `mock-1024` embedding provider plus process/rebuild APIs for pending
  chunks.
- pgvector semantic search API that ranks ready chunks with cosine distance, aggregates chunk
  matches to session-level results, and returns matched chunk snippets.
- Session detail API that returns session metadata, resume command, and complete messages ordered by
  sequence.

Supported parser types:

- `codex-jsonl`
- `claude-jsonl`
- `pi-jsonl`
- `opencode-sqlite`
- `generic-jsonl`
- `generic-json`
- `generic-markdown`

Real OpenAI/Ollama/http embedding providers and final wired search UI workflows are still pending.

## Workspace

- `apps/web`: Next.js application shell for the search UI, using the shared contracts and API client.
- `apps/api`: NestJS API service with health checks, Prisma setup, and database service tests.
- `packages/shared`: shared contracts, source preset definitions, and typed API shapes.
- `sample-data`: synthetic sanitized Agent CLI history fixtures used by parser and scanner tests.

## Local Privacy Boundary

AgentLogSearch is designed to run on localhost by default. Local Agent CLI history stays on the
developer machine during this implementation wave. Resume commands are displayed and copied only;
the application must never execute `codex resume`, `claude --resume`, `pi --session`, or
`opencode --session` on behalf of the user.

The current API has no authentication or authorization layer. Search and session detail endpoints can
return complete indexed conversation messages, so keep the API and web app bound to localhost only.
Do not bind the services to `0.0.0.0`, publish the ports, put them behind a public reverse proxy, or
otherwise expose them to a network you do not fully control.

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

## Sample Data Fixtures

Synthetic fixtures live under `sample-data/` and are safe to commit because they contain no real
personal Agent CLI history. They cover:

- `sample-data/codex/session-1.jsonl`
- `sample-data/claude/session-1.jsonl`
- `sample-data/pi-agent/session-1.jsonl`
- `sample-data/opencode/opencode.db`
- `sample-data/opencode/create-fixture.sql`
- `sample-data/generic/session-1.jsonl`
- `sample-data/generic/session-1.json`
- `sample-data/generic/session-1.md`
- `sample-data/demo-agent/session-1.jsonl`

Regenerate the OpenCode SQLite fixture from its sanitized SQL source when needed:

```bash
sqlite3 sample-data/opencode/opencode.db < sample-data/opencode/create-fixture.sql
```

Validate the fixture baseline:

```bash
pnpm --filter api test -- --runTestsByPath src/fixtures/fixture-validation.spec.ts
```

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
`maxFileSizeBytes`, `maxFilesPerScan`, and `followSymlinks` are validated at the API boundary.
Manual and scheduled scans persist history file fingerprints, imported sessions, messages, pending
chunks, and scan job counters in PostgreSQL.

## Manual Scan API

The API exposes manual scan triggers:

- `POST /api/scan/run`: scan all enabled sources.
- `POST /api/scan/run/:sourceId`: scan one enabled source.

The response is a `records` array of scan job summaries:

```json
{
  "records": [
    {
      "id": "1",
      "sourceId": "1",
      "status": "completed",
      "filesDiscovered": 1,
      "filesParsed": 1,
      "filesFailed": 0,
      "sessionsImported": 1,
      "messagesImported": 3,
      "chunksCreated": 1,
      "errorMessage": null,
      "startedAt": "2026-06-17T10:00:00.000Z",
      "finishedAt": "2026-06-17T10:00:01.000Z"
    }
  ]
}
```

Manual scans use the configured source reader and parser. Files whose fingerprint matches the last
successful history record are skipped. Changed files are parsed and imported transactionally so a
failed message/chunk import does not half-clear previously imported messages or chunks. OpenCode SQLite
fingerprints include the database file plus optional `-wal` and `-shm` sidecars, and parsing opens
SQLite read-only.

Imported sessions are chunked before embedding. Empty messages are ignored, normal chunks contain up
to eight messages, adjacent chunks keep a two-message overlap, long messages become standalone
chunks, and each chunk text starts with `Agent:`, `CWD:`, and `Thread:` headers. New chunks are
stored with `embeddingStatus` set to `pending`; the embeddings process API consumes those pending
chunks with the local deterministic mock provider.

## Embeddings API

The API exposes local mock embedding job endpoints:

- `POST /api/embeddings/process`: creates a `process` embedding job and processes a small locked
  batch of `pending` or `failed` chunks.
- `POST /api/embeddings/rebuild`: creates a `rebuild` embedding job and resets `ready` or `failed`
  chunks to `pending`; accepts optional `sourceId` to scope the rebuild.

Request body for either endpoint may be empty or source-scoped:

```json
{
  "sourceId": "1"
}
```

The response is an embedding job summary:

```json
{
  "id": "1",
  "sourceId": "1",
  "status": "completed",
  "requestedBy": "process",
  "totalChunks": 1,
  "processedChunks": 1,
  "failedChunks": 0,
  "errorMessage": null,
  "createdAt": "2026-06-17T10:00:00.000Z",
  "startedAt": "2026-06-17T10:00:00.000Z",
  "finishedAt": "2026-06-17T10:00:01.000Z"
}
```

The first implementation only includes the deterministic lexical `mock-1024` provider. It validates
the provider and database vector dimensions at startup, writes `vector(1024)` values through raw
PostgreSQL via `PgService`, and uses row locks with `FOR UPDATE SKIP LOCKED` to avoid duplicate
batch processing. Real OpenAI, Ollama, and HTTP embedding providers are intentionally left as future
provider implementations.

## Semantic Search API

The API exposes semantic search under `POST /api/search/semantic`. The endpoint embeds the query
with the local `mock-1024` provider, searches only chunks whose embedding status is `ready` and whose
vector is present, ranks chunk candidates with pgvector cosine distance (`<=>`) through raw
PostgreSQL, and aggregates the top chunk hits into session-level records.

Request body:

```json
{
  "query": "之前修过登录接口 500 的那次",
  "topK": 50,
  "sessionLimit": 10,
  "agentName": "generic",
  "cwdKeyword": "CliSearch"
}
```

`query` is required and capped at 2,000 characters. `topK` defaults to `50` and is capped at `100`;
`sessionLimit` defaults to `10` and is capped at `50`. `agentName` and `cwdKeyword` are optional
filters. When no ready chunks are available or no chunks match, the response is HTTP 200 with an
empty records array:

```json
{
  "records": []
}
```

Result records are session-level. Each record includes the session id, score, agent name, cwd,
thread id, title, resume command, message count, last message timestamp, and up to three matched
chunks sorted by score:

```json
{
  "records": [
    {
      "sessionId": "1",
      "score": 0.91,
      "agentName": "generic",
      "cwd": "/workspace/clisearch-demo",
      "threadId": "abc123",
      "title": "登录接口 500 修复演示",
      "resumeCommand": "cd '/workspace/clisearch-demo' && codex resume 'abc123'",
      "messageCount": 4,
      "lastMessageAt": "2026-01-02T03:04:08.000Z",
      "matchedChunks": [
        {
          "chunkId": "1",
          "score": 0.91,
          "snippet": "Agent: generic\nCWD: /workspace/clisearch-demo\nThread: abc123..."
        }
      ]
    }
  ]
}
```

## Sessions API

The API exposes session detail under `GET /api/sessions/:id`. It returns session metadata, the
copy-only resume command, and complete messages ordered by `seqNo` ascending. Missing or malformed
ids return the standard API error envelope with HTTP 404 and `session_not_found`.

Because this endpoint returns complete indexed messages, it is intended for local development use
only and must not be exposed without adding authentication and an explicit deployment threat model.

## Scan Jobs API

The API exposes scan history under `GET /api/scan-jobs?page=1&pageSize=20`.

Response shape:

```json
{
  "records": [
    {
      "id": "1",
      "sourceId": "1",
      "source": {
        "id": "1",
        "name": "Codex local",
        "sourcePreset": "codex",
        "parserType": "codex-jsonl"
      },
      "status": "completed",
      "filesDiscovered": 1,
      "filesParsed": 1,
      "filesFailed": 0,
      "sessionsImported": 1,
      "messagesImported": 12,
      "chunksCreated": 3,
      "errorMessage": null,
      "createdAt": "2026-06-16T10:00:00.000Z",
      "startedAt": "2026-06-16T10:00:00.000Z",
      "finishedAt": "2026-06-16T10:00:01.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

`page` starts at `1`, `pageSize` defaults to `20`, and the maximum page size is `100`. Long scan
job and history file error messages are truncated in list responses. History file parse status is
modeled explicitly as `PENDING`, `PROCESSING`, `READY`, or `FAILED` at the shared/API boundary while
Prisma stores the database enum as lowercase values.

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
