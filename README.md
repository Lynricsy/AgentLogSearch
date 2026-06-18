# AgentLogSearch

AgentLogSearch is a local-first semantic search workspace for Agent CLI conversation history.
The target development system runs on localhost, indexes local history files, normalizes sessions
and messages, stores searchable chunks, and shows copy-only resume commands.

## Status

The project has completed the T1-T19 foundation, scanner/import, scheduler, chunker, mock
embedding, semantic search, session detail API, `/sources` source management UI, and `/search`
semantic search UI, `/scan-jobs` scan history UI, and `/sessions/[id]` session detail UI work:

- pnpm monorepo workspace and shared TypeScript configuration.
- `packages/shared` contracts for source presets, API payloads, and route-facing types.
- `apps/web` Next.js shell with API client wiring, search/session routes, and `/sources` source
  CRUD plus manual scan controls.
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
- Sources UI for creating/editing/deleting enabled local sources from first-class presets, toggling
  sources, and running source-scoped manual scans.
- Search UI for submitting semantic queries, applying `agentName`/`cwdKeyword`/`topK`/`sessionLimit`
  filters, opening full session details from result cards, viewing matched chunks, and copying resume
  commands with a clipboard fallback.
- Scan jobs UI for loading paginated scan history, showing status/source/start/finish/count columns,
  and keeping long failure text collapsed behind an explicit details action.
- Session detail UI for loading full messages, rendering role-specific user/assistant/tool/system/
  unknown bubbles, showing metadata, and copying nullable resume commands safely.

Supported parser types:

- `codex-jsonl`
- `claude-jsonl`
- `pi-jsonl`
- `opencode-sqlite`
- `generic-jsonl`
- `generic-json`
- `generic-markdown`

Real OpenAI/Ollama/http embedding providers are still pending.

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

## 本机 Dev 冷启动

本机 dev 模式用于读取当前用户的真实 Agent CLI 历史。API 和 Web 默认只绑定本机回环
地址；API 允许读取宿主机上的 `~/.codex`、`~/.claude`、`~/.pi` 和
`~/.local/share/opencode`，前提是你在 `/sources` 页面或 API 请求中显式创建这些
source。系统只读扫描历史文件，不会改写 CLI 历史目录。

从干净环境启动数据库、迁移并运行两个服务：

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate
pnpm dev
```

`pnpm dev` 会同时启动：

- API: `http://127.0.0.1:3001/api`
- Web: `http://127.0.0.1:3000`

健康检查：

```bash
curl http://127.0.0.1:3001/api/health
```

使用仓库内的脱敏 demo fixture 完成本机端到端搜索。注意：本机 dev 的 `rootPath` 使用
宿主机绝对路径；把下面命令中的 `$PWD` 保持为仓库根目录即可。

```bash
SOURCE_ID=$(
  curl -sS http://127.0.0.1:3001/api/sources \
    -H 'content-type: application/json' \
    -d "{
      \"name\":\"README demo-agent\",
      \"sourcePreset\":\"generic\",
      \"parserType\":\"generic-jsonl\",
      \"readerType\":\"file-glob\",
      \"rootPath\":\"$PWD/sample-data/demo-agent\",
      \"fileGlob\":\"**/*.jsonl\",
      \"resumeTemplate\":\"cd {quoted cwd} && codex resume {quoted threadId}\",
      \"enabled\":true,
      \"scanIntervalSeconds\":300,
      \"maxFileSizeBytes\":5242880,
      \"maxFilesPerScan\":1000,
      \"followSymlinks\":false
    }" | node -pe 'JSON.parse(fs.readFileSync(0, "utf8")).id'
)

curl -sS -X POST "http://127.0.0.1:3001/api/scan/run/$SOURCE_ID"
curl -sS -X POST http://127.0.0.1:3001/api/embeddings/process \
  -H 'content-type: application/json' \
  -d "{\"sourceId\":\"$SOURCE_ID\"}"

SEARCH_JSON=$(
  curl -sS http://127.0.0.1:3001/api/search/semantic \
    -H 'content-type: application/json' \
    -d '{"query":"之前修过登录接口 500 的那次","topK":50,"sessionLimit":10}'
)
echo "$SEARCH_JSON" | node -pe 'const data = JSON.parse(fs.readFileSync(0, "utf8")); data.records[0]?.threadId'

SESSION_ID=$(echo "$SEARCH_JSON" | node -pe 'const data = JSON.parse(fs.readFileSync(0, "utf8")); data.records[0]?.sessionId')
curl -sS "http://127.0.0.1:3001/api/sessions/$SESSION_ID"
```

期望搜索命中 synthetic thread `abc123`，session detail 返回完整消息和 copy-only
`resumeCommand`。

### 端口覆盖

默认端口是 Postgres `5432`、API `3001`、Web `3000`。如果本机端口冲突：

```bash
POSTGRES_PORT=15432 docker compose up -d postgres
DATABASE_URL=postgresql://agent_log_search:agent_log_search@localhost:15432/agent_log_search \
API_PORT=3101 \
pnpm --filter api dev
API_PROXY_TARGET=http://localhost:3101 \
pnpm --filter web dev -- --port 3100
```

Web 默认通过同源 `/api/*` rewrite 访问 API；如果设置
`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3101/api` 让浏览器直连 API，请仍只在本机
回环地址使用。当前 API CORS 只允许 `http://127.0.0.1:3000` 与
`http://localhost:3000`。

## Docker Demo

Docker demo 使用只读 fixture，不默认读取真实宿主历史，并且所有宿主端口仍只发布到
`127.0.0.1`：

```bash
docker compose --profile demo config
docker compose --profile demo build
docker compose --profile demo up -d
curl http://127.0.0.1:3001/api/health
curl http://127.0.0.1:3000/api/health
```

在 Docker demo 中创建 source 时，`rootPath` 必须使用容器内路径，例如：

- demo-agent: `/sample-data/demo-agent`
- Codex fixture: `/sample-data/codex`
- Claude Code fixture: `/sample-data/claude`
- Pi Agent fixture: `/sample-data/pi-agent`
- OpenCode fixture: `/sample-data/opencode`
- Codex 可选 bind mount: `/host-history/codex`
- Claude Code 可选 bind mount: `/host-history/claude`
- Pi Agent 可选 bind mount: `/host-history/pi`
- OpenCode 可选 bind mount: `/host-history/opencode`

Docker demo 的端到端 API 命令与本机 dev 相同，只需要把 source 创建请求里的
`rootPath` 改为 `/sample-data/demo-agent`。compose 会始终挂载
`./sample-data:/sample-data:ro`。

可选读取真实宿主历史时，只设置你需要的变量，用绝对宿主路径覆盖对应 bind mount，
并保持只读：

```bash
CODEX_HISTORY_HOST_PATH="$HOME/.codex/sessions" \
docker compose --profile demo up -d
```

如果某个真实目录不存在，不要设置对应变量；未设置时 compose 会把安全 fixture 挂载到
`/host-history/*`：Codex 使用 `./sample-data/codex`，Claude Code 使用
`./sample-data/claude`，Pi Agent 使用 `./sample-data/pi-agent`，OpenCode 使用
`./sample-data/opencode`，便于 demo 启动。复制 `.env.example` 后，这些变量默认保持
注释状态。

API 容器通过 `API_HOST=0.0.0.0` 在容器内监听，Web 容器通过
`next start --hostname 0.0.0.0` 暴露给宿主端口，且 Web 的
`API_PROXY_TARGET=http://api:3001` 指向 compose 网络内的 API 服务。

停止 Docker demo：

```bash
docker compose --profile demo down
```

## First-Class Sources

- Codex CLI: `~/.codex/sessions/**/*.jsonl`
- Claude Code: `~/.claude/projects/**/*.jsonl`
- Pi Agent: `~/.pi/agent/sessions/**/*.jsonl`
- OpenCode: `~/.local/share/opencode/opencode.db`
- Generic JSONL, JSON, and Markdown imports

The `/sources` UI and `GET /api/sources/presets` expose first-class presets for Codex CLI,
Claude Code, Pi Agent, OpenCode, Generic JSONL, Generic JSON, and Generic Markdown. Unsupported
Agent CLIs are intentionally not first-class presets in this wave. Import them through Generic JSONL,
Generic JSON, or Generic Markdown after exporting/sanitizing into those shapes; add a real preset only
after sample history fixtures and parser rules are available.

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

The web UI exposes `/sessions/[id]` for the same detail contract. Search results link to the encoded
session id returned by the API, and the detail page renders API failures as an error state instead of
assuming arbitrary strings are valid database ids.

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

The API listens on `API_HOST`/`API_PORT` from `.env.example` and defaults to
`127.0.0.1:3001`. Health check:

```bash
curl http://127.0.0.1:3001/api/health
```

Start the web app:

```bash
pnpm --filter web dev
```

或者用根脚本同时启动 API 和 Web：

```bash
pnpm dev
```

Web 的 `dev` 和 `start` 脚本都会显式绑定 `127.0.0.1`，因此默认只监听本机回环地址。
Web 客户端默认请求相对路径 `/api`，Next.js rewrite 会把 `/api/*` 代理到
`API_PROXY_TARGET`，未设置时默认是 `http://localhost:3001`。在 Web 也只绑定回环地址
的前提下，同源 `/api` rewrite 只服务本机访问，不会把本地 API 暴露到外部网络。只有
本地开发需要浏览器直连 API 时，才设置可选的
`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001/api`；直连模式需要 API CORS 允许对应
本机 Web 源。

`.env.example` 覆盖本地运行所需的 API/Web/Postgres 变量、scanner scheduler 变量和
Docker 可选历史目录 bind mount 变量。Embedding 当前固定使用代码内置
`mock-1024` provider 与 `vector(1024)` schema；`.env.example` 中的 embedding 字段是
文档对齐项，不会切换 provider。路径限制是 source 请求字段：
`scanIntervalSeconds`、`maxFileSizeBytes`、`maxFilesPerScan`、`followSymlinks`；当前不是
全局运行时 env 开关。
