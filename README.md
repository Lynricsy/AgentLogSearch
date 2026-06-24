# AgentLogSearch

AgentLogSearch is a local-first semantic search workspace for Agent CLI conversation history.
The target development system runs on localhost, indexes local history files, normalizes sessions
and messages, stores searchable chunks, and shows copy-only resume commands.

For a codebase-level walkthrough intended for further analysis and planning, see
[`docs/PROJECT_ANALYSIS.md`](docs/PROJECT_ANALYSIS.md).

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
  Generic JSONL, Generic JSON, and Generic Markdown sessions.
- Parser infrastructure for the seven supported history formats, including `ParserRegistry`,
  `file-glob` source reading, and read-only SQLite source reading for OpenCode.
- Scanner service and importer for manual scans, including sha256 fingerprints, unchanged-file
  skips, per-source in-process scan locks, scan job/history status updates, session/message import,
  and transactionally generated pending chunks.
- Manual scan API under `/api/scan/run` and `/api/scan/run/:sourceId`.
- Scheduler support for periodic due-source scans.
- Chunker service that creates overlapping message windows with session metadata headers for later
  embedding.
- Configurable embedding provider with deterministic lexical `mock-1024` for tests/dev and Ollama
  HTTP embeddings for Docker demo, plus process/rebuild APIs for pending chunks.
- pgvector semantic search API that ranks ready chunks with cosine distance, aggregates chunk
  matches to session-level results, and returns matched chunk snippets.
- Session detail API that returns session metadata, resume command, and complete messages ordered by
  sequence.
- Sources UI for creating/editing/deleting enabled local sources from first-class presets, toggling
  sources, and running source-scoped manual scans.
- Search UI for submitting semantic queries, applying `agentName`/`cwdKeyword`/`topK`/`sessionLimit`
  filters, opening full session details from result cards, viewing matched chunks, and copying resume
  commands with a clipboard fallback.
- Search UI loading state now uses result-shaped skeleton cards that mirror the eventual result
  layout, including matched chunk and resume command areas.
- Scan jobs UI for loading paginated scan history, showing status/source/start/finish/count columns,
  and keeping long failure text collapsed behind an explicit details action.
- Session detail UI for loading full messages, rendering role-specific user/assistant/tool/system/
  unknown bubbles, showing metadata, and copying nullable resume commands safely.
- 搜索结果和会话详情复用后端结构化消息分块，按用户、Agent、思考、工具调用和元数据拆成独立卡片展示，
  避免前端依赖片段文本猜测消息边界。
- 前端 UI 已统一中文化，覆盖导航、表单、状态提示、表格、可访问性标签和默认错误提示；
  后端 API 枚举与请求协议仍保留原始英文值，仅在展示层映射为中文。
- 前端界面已移除开发期接口路径和本机地址徽章，并在展示层清理导入流水线产生的内部
  名称片段，例如 `tool_result filtered` 与长时间戳；API 客户端路由和本地代理配置保持不变。

Supported parser types:

- `codex-jsonl`
- `claude-jsonl`
- `pi-jsonl`
- `opencode-sqlite`
- `generic-jsonl`
- `generic-json`
- `generic-markdown`

OpenAI/http embedding providers are still pending.

## Embedding Model

Docker demo includes a dedicated `embedding-model` container running Ollama for local embeddings. On
this server, `lscpu`/`free` report a 24-thread AMD Ryzen 9 7950X3D, about 91 GiB RAM, and no detected
GPU. That is enough headroom for a CPU-only quantized embedding model, so the default model is:

- Model: `qwen3-embedding:8b-q4_K_M`
- Runtime: Ollama on the compose internal network
- API provider: `EMBEDDING_PROVIDER=ollama`
- Vector size used by this project: `EMBEDDING_DIMENSION=1024`
- Container image: `OLLAMA_IMAGE=ollama/ollama:latest`, override this in `.env` to pin a version.

Qwen3-Embedding is a multilingual text embedding family for retrieval, code retrieval, clustering,
classification, and bitext mining. The Qwen model card says the 8B model ranks No.1 on the MTEB
multilingual leaderboard as of June 5, 2025, supports 100+ languages and programming languages, and
supports user-defined output dimensions from 32 to 4096. Ollama's `/api/embed` endpoint also supports
a `dimensions` request field, so the API asks Ollama for 1024-dimensional vectors to match the
existing PostgreSQL `vector(1024)` schema.

The selected Ollama `qwen3-embedding:8b` family tag is about 4.7 GB, which is appropriate for this
server's memory budget and gives the best quality headroom among the available Qwen3 embedding
sizes. The first `docker compose --profile demo up -d` downloads the model into the `ollama-data`
volume via the one-shot `embedding-model-pull` service. Later starts reuse that volume.

For smaller machines, set `EMBEDDING_MODEL=qwen3-embedding:4b-q4_K_M` or
`EMBEDDING_MODEL=qwen3-embedding:0.6b` before starting the demo, then rebuild embeddings because
vectors generated by different models should not be mixed.

Sources used for this choice:

- [Qwen3-Embedding-8B model card](https://huggingface.co/Qwen/Qwen3-Embedding-8B)
- [Ollama qwen3-embedding model page](https://ollama.com/library/qwen3-embedding)
- [Ollama /api/embed documentation](https://docs.ollama.com/api/embed)

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
- Docker demo keeps PostgreSQL on the internal compose network.
- Source-code development can publish PostgreSQL to `127.0.0.1:${POSTGRES_PORT:-5432}` by adding
  `docker-compose.dev.yml`.
- Database/user/password: `agent_log_search`
- `DATABASE_URL`: copied from `.env.example`

Start the database for source-code development:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
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
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate
pnpm dev
```

`pnpm dev` 会同时启动 API 和 Web。浏览器与 curl 默认只访问 Web 端口，Web 再通过
Next.js route handler 把 `/api/*` 反代到本机 API：

- App/API 统一入口：`http://127.0.0.1:3000`
- API 反代路径：`http://127.0.0.1:3000/api`
- API 本机监听：`http://127.0.0.1:3001/api`，仅供调试，不是浏览器默认入口

健康检查：

```bash
curl http://127.0.0.1:3000/api/health
```

使用仓库内的脱敏通用 fixture 完成本机端到端搜索。注意：本机 dev 的 `rootPath` 使用
宿主机绝对路径；把下面命令中的 `$PWD` 保持为仓库根目录即可。

```bash
SOURCE_ID=$(
  curl -sS http://127.0.0.1:3000/api/sources \
    -H 'content-type: application/json' \
    -d "{
      \"name\":\"本地 JSONL 会话样例\",
      \"sourcePreset\":\"generic\",
      \"parserType\":\"generic-jsonl\",
      \"readerType\":\"file-glob\",
      \"rootPath\":\"$PWD/sample-data/generic\",
      \"fileGlob\":\"**/*.jsonl\",
      \"resumeTemplate\":\"cd {quoted cwd} && codex resume {quoted threadId}\",
      \"enabled\":true,
      \"scanIntervalSeconds\":300,
      \"maxFileSizeBytes\":5242880,
      \"maxFilesPerScan\":1000,
      \"followSymlinks\":false
    }" | node -pe 'JSON.parse(fs.readFileSync(0, "utf8")).id'
)

curl -sS -X POST "http://127.0.0.1:3000/api/scan/run/$SOURCE_ID"
curl -sS -X POST http://127.0.0.1:3000/api/embeddings/process \
  -H 'content-type: application/json' \
  -d "{\"sourceId\":\"$SOURCE_ID\"}"

SEARCH_JSON=$(
  curl -sS http://127.0.0.1:3000/api/search/semantic \
    -H 'content-type: application/json' \
    -d '{"query":"之前修过登录接口 500 的那次","topK":50,"sessionLimit":10}'
)
echo "$SEARCH_JSON" | node -pe 'const data = JSON.parse(fs.readFileSync(0, "utf8")); data.records[0]?.threadId'

SESSION_ID=$(echo "$SEARCH_JSON" | node -pe 'const data = JSON.parse(fs.readFileSync(0, "utf8")); data.records[0]?.sessionId')
curl -sS "http://127.0.0.1:3000/api/sessions/$SESSION_ID"
```

期望搜索命中 synthetic thread `abc123`，session detail 返回完整消息和 copy-only
`resumeCommand`。

### 端口覆盖

默认单入口端口是 Web `3000`。源码开发时，Postgres `5432` 与 API `3001` 只服务本机
开发链路；如果本机端口冲突：

```bash
POSTGRES_PORT=15432 docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
DATABASE_URL=postgresql://agent_log_search:agent_log_search@localhost:15432/agent_log_search \
API_PORT=3101 \
pnpm --filter api dev
API_PROXY_TARGET=http://localhost:3101 \
pnpm --filter web dev -- --port 3100
```

Web 默认通过同源 `/api/*` 代理路由访问 API；如果设置
`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3101/api` 让浏览器直连 API，请仍只在本机
回环地址使用。直连模式会绕过单端口反代，仅用于调试。当前 API CORS 只允许
`http://127.0.0.1:3000` 与 `http://localhost:3000`。

## Docker Demo

Docker demo 使用只读 fixture，不默认读取真实宿主历史，并且宿主机只发布一个 Web 端口。
API 和 PostgreSQL 只在 compose 内部网络可达；所有浏览器/API 请求都从 Web 的
`/api/*` 反代进入后端：

```bash
docker compose --profile demo config
docker compose --profile demo build
docker compose --profile demo up -d
curl http://127.0.0.1:3000/api/health
```

`embedding-model` 也在 `demo` profile 下启动，但不会发布宿主端口。一次性
`embedding-model-pull` 服务负责把 `EMBEDDING_MODEL` 拉取到 `ollama-data` volume；API
容器通过 `http://embedding-model:11434/api/embed` 访问 embedding 服务。

在 Docker demo 中创建 source 时，`rootPath` 必须使用容器内路径，例如：

- Generic fixture: `/sample-data/generic`
- Codex fixture: `/sample-data/codex`
- Claude Code fixture: `/sample-data/claude`
- Pi Agent fixture: `/sample-data/pi-agent`
- OpenCode fixture: `/sample-data/opencode`
- Codex 可选 bind mount: `/host-history/codex`
- Claude Code 可选 bind mount: `/host-history/claude`
- Pi Agent 可选 bind mount: `/host-history/pi`
- OpenCode 可选 bind mount: `/host-history/opencode`

Docker demo 的端到端 API 命令与本机 dev 相同，都访问
`http://127.0.0.1:${WEB_PORT:-3000}/api/*`；只需要把 source 创建请求里的 `rootPath`
改为 `/sample-data/generic`。compose 会始终挂载 `./sample-data:/sample-data:ro`。

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

API 容器通过 `API_HOST=0.0.0.0` 只在容器网络内监听，Web 容器通过
`next start --hostname 0.0.0.0` 暴露唯一宿主端口，且 Web 的
`API_PROXY_TARGET=http://api:3001` 指向 compose 网络内的 API 服务。Embedding model 也只
在 compose 网络内监听。不要给 `api`、`postgres` 或 `embedding-model` 服务增加宿主
`ports`，除非是在源码开发时显式叠加 `docker-compose.dev.yml` 只发布 Postgres 给本机
API 使用。

### 真实历史验证记录

2026-06-21 在本机用固定未占用端口 `WEB_PORT=44136` 验证过完整 compose 链路：

- 外部只暴露 `127.0.0.1:44136->3000`，健康检查入口为
  `http://127.0.0.1:44136/api/health`。
- `api`、`postgres`、`embedding-model` 都只在 compose 内部网络可达。
- `embedding-model` 使用 Ollama，已拉取 `qwen3-embedding:8b-q4_K_M` 和
  `qwen3-embedding:0.6b`，当前 `.env` 使用 `qwen3-embedding:0.6b`。
- 将宿主真实 Pi Agent 历史目录只读挂载到 `/host-history/pi` 后，创建 `pi-agent` source
  并扫描成功：29/29 个 JSONL 文件，29 个会话。过滤工具返回前是 731 条消息和 1189 个
  chunk；识别并丢弃 Pi `toolResult` 工具返回后，保留 391 条 user/assistant 消息和
  429 个 chunk，扫描耗时约 0.57 秒。数据库中 source 430 的 `tool`、`unknown` 角色消息
  数为 0，chunk 中也没有 `Tool:`、`toolResult`、`stdout=` 或 `stderr=` 痕迹。
- CPU-only embedding 实测：`qwen3-embedding:8b-q4_K_M` 连续 3 个批次共 48 个 chunk
  耗时约 264 秒，约 0.18 chunk/s。`qwen3-embedding:0.6b` 在旧 chunk 上处理 48 个 chunk
  耗时约 41 秒，约 1.16 chunk/s；在过滤工具返回后的 source 430 上处理 48 个 chunk
  耗时约 45 秒，约 1.07 chunk/s。全量 429 个 chunk 预计约 6 到 7 分钟。
- 在已有 48 个 0.6B ready chunk 的情况下，语义搜索
  `opencode 的 MCP 配置同步到 pi` 命中 source 430 的正确 Pi Agent 会话，HTTP 200，
  耗时约 0.4 秒，top score 约 0.879。结果保留 assistant 侧工具调用描述，例如
  `server`、`tool`、`args`、`id`，但不包含工具返回正文。

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

Regenerate the OpenCode SQLite fixture from its sanitized SQL source when needed:

```bash
sqlite3 sample-data/opencode/opencode.db < sample-data/opencode/create-fixture.sql
```

Validate the fixture baseline:

```bash
pnpm --filter api test -- --runTestsByPath src/fixtures/fixture-validation.spec.ts
```

为 Evidence Edition 旁路流水线清点 fixture 结构：

```bash
pnpm --filter api inspect:fixtures
```

该命令会写入 `docs/evidence/fixture-shape-inventory.json`，记录 parser type、顶层字段、
tool call/result 类型形态、候选 call id/result id/exit code 字段、shell 命令字段、patch
字段，以及 OpenCode SQLite 表和 part 形态。它只保存结构信息，不持久化消息正文、工具输出
正文、stdout/stderr、文件内容或原始 patch 内容。

Evidence Edition 同时在 `apps/api/src/pipeline-versions.ts` 增加版本常量，并在
`.env.example` 增加默认关闭的运行时开关。`EVIDENCE_PIPELINE_ENABLED=true` 会在扫描时持久化
脱敏 trace/evidence，`EXPERIENCE_WORKER_ENABLED=true` 会异步构建 experience，
`EXPERIENCE_SEARCH_ENABLED=true` 会开放 experience search/detail/check API。搜索请求可选传入
`repositoryPath`，用于在结果中展示只读的静态仓库兼容性信号。

Evidence Edition 的本机最终演示步骤记录在
[`docs/evidence/final-demo-script.md`](docs/evidence/final-demo-script.md)，覆盖 source
扫描、experience search/detail/check、MCP 查询和 secret 脱敏验证。

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

Tool result messages are intentionally not persisted or indexed. The retained history keeps user
messages, assistant responses, and assistant-side tool call descriptions, but drops standalone
`tool` role messages because those contain raw tool outputs that are often noisy, large, and more
privacy-sensitive than the LLM decision to call the tool.

The first-class parsers cover both fixture-era and current local formats. Codex supports the newer
`session_meta` plus `response_item`/`event_msg` rollout JSONL records, and OpenCode supports both
legacy `sessions/messages` SQLite tables and current `session/message/part` tables. Codex tool
calls are compacted to call metadata such as tool name, call id, command, workdir, short arguments,
or touched file names; duplicated tool end events, stdout, stderr, raw result payloads, and OpenCode
`state.output` are not retained for search. Claude Code `message.role = "user"` records whose
content is `tool_result` are normalized to `tool` and dropped by the importer.

Session titles are resolved during parsing, before sessions are imported into PostgreSQL. Native
title-like fields are preferred: OpenCode reads the SQLite `session.title`, Claude Code reads the
current JSONL `slug`, and older JSONL formats can still use `title`, `summary`, or `name` when those
fields exist. Current Codex and Pi Agent JSONL files do not consistently store a dedicated session
title, so the parser derives a display title from the first real user request while ignoring IDE
context wrappers and synthetic agent instructions.

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
to eight retained messages, adjacent chunks keep a two-message overlap, and long messages become
standalone chunks. Standalone `tool` role messages are skipped before chunking, so raw tool output is
not embedded; assistant messages that describe the tool call remain searchable. Very long single
messages are split with a line/natural-boundary-first algorithm, using a hard size cap as fallback
and iterating on Unicode character boundaries so surrogate pairs are not broken. Tiny trailing
fragments are avoided when a safe earlier split point can keep the tail useful. Each chunk text
starts with `Agent:`, `CWD:`, and `Thread:` headers. New chunks are stored with `embeddingStatus`
set to `pending`; the API container's embedding worker automatically consumes those pending chunks
with the configured embedding provider.

## Embeddings API

The API exposes embedding job endpoints:

- Background worker: when `EMBEDDING_WORKER_ENABLED=true`, the API container periodically checks for
  `pending` or `failed` chunks and processes one small locked batch per tick. Worker-created jobs are
  recorded with `requestedBy=scheduler`.
- `POST /api/embeddings/process`: creates a manual `process` embedding job and processes a small
  locked batch of `pending` or `failed` chunks. This is mainly useful for debugging or one-off runs;
  normal Docker demo operation does not require calling it by hand.
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

The embedding pipeline supports the deterministic lexical `mock-1024` provider for tests/dev and an
Ollama provider for Docker demo. It validates the provider and database vector dimensions at startup,
writes `vector(1024)` values through raw PostgreSQL via `PgService`, and uses row locks with
`FOR UPDATE SKIP LOCKED` to avoid duplicate batch processing. OpenAI and generic HTTP embedding
providers are intentionally left as future provider implementations.

Embedding worker knobs:

- `EMBEDDING_WORKER_ENABLED`: defaults to `true` outside tests and is explicitly enabled in Docker
  demo.
- `EMBEDDING_WORKER_INTERVAL_MS`: default `5000`. The worker waits this long between batch attempts.
- `EMBEDDING_WORKER_SOURCE_ID`: optional source id scope. Empty means all sources.
- `EMBEDDING_WORKER_STALE_PROCESSING_MS`: default `900000`. Chunks stuck in `processing` longer than
  this are reset to `pending` before the next batch, so an API restart does not leave them stranded.

## Semantic Search API

The API exposes semantic search under `POST /api/search/semantic`. The endpoint embeds the query
with the configured embedding provider, searches only chunks whose embedding status is `ready` and
whose vector is present, ranks chunk candidates with pgvector cosine distance (`<=>`) through raw
PostgreSQL, and aggregates the top chunk hits into session-level records. Use the same provider/model
for indexing and querying; after changing `EMBEDDING_MODEL`, run the rebuild/process flow before
trusting search results.

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

## Experience Search API

Evidence-aware experience APIs are guarded by `EXPERIENCE_SEARCH_ENABLED=true`. They read only
`READY` sessions whose `agent_experience.sourceRevision` matches the session `traceRevision`, so a
new scan can mark a session pending without deleting the last usable experience set first.

`POST /api/experiences/search` performs a conservative lexical and structured search over built
experiences. Dense experience embeddings are still a later milestone, so this endpoint currently
ranks by code/error/path/symbol/command overlap and evidence score.

Request body:

```json
{
  "query": "TS2339 scanner importer 测试失败",
  "errorText": "error TS2339: Property 'foo' does not exist",
  "files": ["apps/api/src/scanner/scanner-importer.ts"],
  "symbols": ["ScannerImporter"],
  "repositoryPath": "/workspace/CliSearch",
  "mode": "all",
  "topK": 10
}
```

Responses are grouped by outcome:

```json
{
  "successful": [],
  "failedAttempts": [],
  "partial": [],
  "unverified": []
}
```

Each result includes the experience id, session id, task summary, evidence level/reason codes,
score breakdown, matched path/error tokens, attempts, and evidence event summaries. It does not
return full raw tool output.

When `repositoryPath` is provided, search results also include a static repository compatibility
block. The API compares the historical experience paths and repo key against the current Git tree,
adds a `compatibilityFactor` to the score breakdown, and reranks the top candidates conservatively.
This signal is intentionally limited to existence/rename/repo identity/dependency snapshot context
and always carries the compatibility disclaimer from the Repository Compatibility section.

`GET /api/experiences/:id` returns one experience with attempts, source session metadata, and
redacted evidence event summaries. Invalid or missing ids return the standard error envelope with
`experience_not_found`.

`GET /api/experiences/status` returns the current build queue and search-readiness counters:
pending/processing/ready/failed sessions, current-vs-stale experience counts, experience embedding
status counts, feature flag state, and the latest worker error if a build failed. This endpoint is
read-only and remains available even when `EXPERIENCE_SEARCH_ENABLED=false`, so operators can see
why search is not ready yet.

`POST /api/experiences/rebuild` marks matching sessions `PENDING` and clears build errors without
running the worker inside the HTTP request. By default it skips sessions that are already `READY`;
pass `includeReady: true` to force rebuilding ready sessions.

```json
{
  "sourceId": "1",
  "includeReady": true
}
```

`POST /api/experiences/check-failed-attempt` checks a planned operation against historical failed
attempts. The compatibility alias `POST /api/experiences/check-attempt` accepts the same payload.
The checker only searches failed attempts and uses a fixed, non-prescriptive warning message:
`计划操作与一条历史失败尝试高度相似。`

```json
{
  "task": "修复 ScannerImporter 后准备运行测试",
  "files": ["apps/api/src/scanner/scanner-importer.ts"],
  "symbols": ["ScannerImporter"],
  "operationKinds": ["TEST"],
  "plannedCommand": "pnpm --filter api test",
  "topK": 5
}
```

The response risk is `none`, `low`, `medium`, or `high`; matches include the failed attempt, matched
tokens, score breakdown, and redacted evidence summaries. It intentionally avoids wording such as
"必然失败" or "不要这样做"; callers should present it as prior-art context, not a hard rule.

## MCP Read-Only Tools

The `apps/mcp` package exposes a stdio MCP server for local clients that need evidence-aware history
context without direct database access. It calls the HTTP API only, so start the API/Web entrypoint
first and keep `EXPERIENCE_SEARCH_ENABLED=true`.

```bash
pnpm --filter mcp build
AGENT_LOG_SEARCH_API_BASE_URL=http://127.0.0.1:3000/api \
pnpm --filter mcp dev
```

After building, MCP clients can run the compiled stdio entrypoint:

```json
{
  "mcpServers": {
    "agent-log-search": {
      "command": "node",
      "args": ["/absolute/path/to/CliSearch/apps/mcp/dist/main.js"],
      "env": {
        "AGENT_LOG_SEARCH_API_BASE_URL": "http://127.0.0.1:3000/api"
      }
    }
  }
}
```

The default API base URL is `http://127.0.0.1:3000/api`. Override it with
`AGENT_LOG_SEARCH_API_BASE_URL` or `AGENT_LOG_SEARCH_API_URL` when using a different local port.

Available tools:

- `search_engineering_history`: wraps `POST /api/experiences/search`.
- `check_failed_attempt`: wraps `POST /api/experiences/check-failed-attempt`.
- `get_experience_evidence`: wraps `GET /api/experiences/:id`.

The MCP server intentionally does not expose command execution, file editing, patch application,
agent resume, or direct database tools. Every tool response includes this disclaimer:

```text
历史执行结果不等于当前环境中的操作建议。
```

Validate the stdio entrypoint without a running API by listing tools from the built server:

```bash
pnpm --filter mcp build
pnpm --filter mcp smoke:stdio
```

## Repository Compatibility

Evidence Edition includes a read-only repository compatibility foundation under
`apps/api/src/repositories`. The first slice safely locates a Git repository from an absolute path,
derives a credential-free `repoKey`, captures the current Git snapshot, and compares historical
experience file paths with the current tree. It can distinguish deleted files from Git renames when
the historical commit is available.

The compatibility snapshot also includes a summarized Node dependency signal when manifest files are
present. It reads `package.json`, `pnpm-lock.yaml`, `package-lock.json`, and `yarn.lock`, exposes the
package name, detected package managers, lockfile count, top-level dependency count, and unknown
major-version count, and keeps `manifestHash` as the stable change detector. The API does not expose
raw lockfile contents or full dependency maps.

Built experience records store a nullable build-time `manifestHash` plus a bounded
`dependencySnapshot` JSON summary. When a later search provides `repositoryPath`, compatibility
checks compare the historical hash and dependency majors with the current repository snapshot. They
surface `DEPENDENCIES_UNCHANGED`, `LOCKFILE_CHANGED`, `DEPENDENCY_VERSION_UNKNOWN`, or
`DEPENDENCY_MAJOR_CHANGED` reason codes without exposing raw manifest or lockfile contents.

The repository package also includes a bounded Tree-sitter symbol index service for TS, TSX, JS, and
JSX files. It only parses explicitly supplied experience-related relative paths, skips unsupported
or unsafe paths, and records symbol name/kind/location/container metadata. Compatibility checks use
that index to emit `SYMBOL_STILL_EXISTS` or `SYMBOL_MISSING` for historical symbol tokens.

The web experience result card presents this block as “当前状态匹配”, renders reason codes as Chinese
labels, and keeps the static-compatibility disclaimer visible.

Compatibility is static context, not patch validation. Any UI or automation that presents this data
must keep the disclaimer visible:

```text
该结果只表示相关工程对象仍然存在或相似，不代表历史 patch 可以直接应用。
```

Git inspection is performed with argument arrays and a small command allowlist. The implementation
does not run historical commands and does not mutate the target repository.

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
`127.0.0.1:3001`. In normal development, call it through the Web reverse proxy:

```bash
curl http://127.0.0.1:3000/api/health
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
的前提下，同源 `/api` rewrite 只服务本机访问；Docker demo 也只发布 Web 端口。源码
开发若不启动 Ollama，可把 `.env` 中 `EMBEDDING_PROVIDER` 改成 `mock`。只有本地调试
需要浏览器直连 API 时，才设置可选的
`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001/api`；直连模式需要 API CORS 允许对应
本机 Web 源，并且会绕过单端口反代。

`.env.example` 覆盖本地运行所需的 API/Web/Postgres 变量、scanner scheduler 变量、
embedding provider 变量和 Docker 可选历史目录 bind mount 变量。源码开发默认
`EMBEDDING_PROVIDER=mock`，Docker demo 会在 compose 内覆盖为 `ollama`。路径限制是 source
请求字段：`scanIntervalSeconds`、`maxFileSizeBytes`、`maxFilesPerScan`、`followSymlinks`；
当前不是全局运行时 env 开关。
