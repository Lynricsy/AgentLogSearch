# AgentLogSearch 项目全景分析文档

本文档基于 2026-06-23 当前工作树快照编写，目标是让后续分析者不必逐文件阅读源码，也能理解项目的架构、数据模型、核心流程、接口边界、前端交互、隐私约束和下一步规划重点。

当前仓库存在大量未提交变更，因此本文描述的是“当前磁盘上的实现状态”，不等同于某个稳定发布版本或 Git HEAD 状态。

## 1. 项目定位

AgentLogSearch 是一个本地优先的 Agent CLI 会话历史语义检索工作台。它读取本机或容器只读挂载中的 Agent 历史文件，将不同 CLI 的历史格式统一解析为会话、消息和可检索片段，写入 PostgreSQL/pgvector，再通过 Web UI 提供语义搜索、数据源管理、扫描任务查看和会话详情查看。

项目的核心约束是：

- 默认运行在本机回环地址或 Docker 内部网络，避免暴露完整会话历史。
- 系统只读取历史文件，不修改原始 Agent CLI 历史目录。
- 恢复命令只展示和复制，应用不会执行 `codex resume`、`claude --resume`、`pi --session` 或 `opencode --session`。
- 原始工具返回正文默认不持久化、不索引，降低噪声和隐私风险。
- API 当前没有认证授权层，因此不能对不可信网络开放。

## 2. 仓库结构

项目是 pnpm monorepo：

```text
.
├── apps/
│   ├── api/                 # NestJS API、Prisma schema、扫描/解析/嵌入/搜索服务
│   └── web/                 # Next.js Web UI、API 客户端、交互组件
├── packages/
│   └── shared/              # 前后端共享的 Zod 契约、枚举、类型和默认值
├── sample-data/             # 脱敏测试 fixture，覆盖各类 parser
├── docs/                    # 深度文档和规划材料
├── docker-compose.yml       # Docker demo：Postgres、API、Web、Ollama embedding
├── docker-compose.dev.yml   # 本机源码开发时把 Postgres 暴露到 127.0.0.1
└── README.md                # 使用说明、API 示例、运行方式
```

根脚本：

- `pnpm dev`：并行启动 `api` 和 `web`。
- `pnpm build`：递归构建所有 workspace。
- `pnpm lint`：运行 Biome 和各 workspace lint。
- `pnpm typecheck`：递归 TypeScript 类型检查。
- `pnpm test`：递归测试。
- `pnpm test:e2e`：运行 API e2e 测试，默认连接本机 PostgreSQL。

运行环境要求：

- Node.js `>=22.0.0`
- pnpm `>=10.14.0`
- PostgreSQL + pgvector
- 可选 Ollama，用于 Docker demo 的真实 embedding

## 3. 技术栈

后端：

- NestJS 11
- Prisma 6
- `pg` 原生连接池，用于 pgvector 和行锁相关 SQL
- PostgreSQL 17 + pgvector
- Jest + Supertest

前端：

- Next.js 16 App Router
- React 19
- HeroUI
- Tailwind CSS 4
- Framer Motion
- lucide-react
- ky
- react-markdown、remark-gfm、remark-math、rehype-katex、mermaid
- Vitest + Testing Library

共享包：

- TypeScript ESM
- Zod 4
- 统一导出 source、search、domain、pagination、embedding、error 契约

## 4. 运行拓扑

### 本机源码开发

本机开发时推荐只让浏览器访问 Web：

```text
Browser
  -> http://127.0.0.1:3000
  -> Next.js /api/* route handler
  -> http://127.0.0.1:3001/api/*
  -> NestJS API
  -> PostgreSQL
```

默认端口：

- Web：`127.0.0.1:3000`
- API：`127.0.0.1:3001`
- PostgreSQL：开发 compose 可暴露到 `127.0.0.1:${POSTGRES_PORT:-5432}`

API 在 `apps/api/src/main.ts` 中默认绑定 `127.0.0.1`，可通过 `API_HOST` 和 `API_PORT` 覆盖。`apps/api/src/bootstrap.ts` 设置全局前缀 `/api`，并只允许 `http://127.0.0.1:3000` 与 `http://localhost:3000` 作为 CORS origin。

Web 的 `apps/web/app/api/[...path]/route.ts` 负责同源 API 反代。默认 `API_PROXY_TARGET` 是 `http://api:3001`，在 Docker compose 中正确；本机开发通常通过 `.env.example` 或环境变量改成 `http://127.0.0.1:3001` 或 `http://localhost:3001`。该反代支持 `GET`、`POST`、`PATCH`、`DELETE`，剔除 hop-by-hop header，超时为 180 秒。

### Docker Demo

Docker demo 使用 `demo` profile：

```text
Browser
  -> host Web port only
  -> web container /api/*
  -> api container
  -> postgres container
  -> embedding-model container
```

服务：

- `postgres`：`pgvector/pgvector:pg17`
- `embedding-model`：Ollama，默认不暴露宿主端口
- `embedding-model-pull`：一次性拉取 `EMBEDDING_MODEL`
- `api`：内部网络监听 `0.0.0.0:3001`
- `web`：唯一发布宿主端口，默认 `${WEB_PORT:-3000}:3000`

Docker demo 会只读挂载 `sample-data`，也支持按需把真实宿主历史目录只读挂载到 `/host-history/*`。

## 5. 共享契约

共享包位于 `packages/shared/src`，所有导出集中在 `index.ts`。

### 枚举与常量

`constants.ts` 定义 API 边界上的稳定枚举：

- `SOURCE_PRESETS`：`codex`、`claude-code`、`pi-agent`、`opencode`、`generic`
- `PARSER_TYPES`：`codex-jsonl`、`claude-jsonl`、`pi-jsonl`、`opencode-sqlite`、`generic-jsonl`、`generic-json`、`generic-markdown`
- `SOURCE_READER_TYPES`：`file-glob`、`sqlite`
- `EMBEDDING_STATUSES`：`pending`、`processing`、`ready`、`failed`
- `PARSE_STATUSES`：`PENDING`、`PROCESSING`、`READY`、`FAILED`
- `SCAN_JOB_STATUSES`：`queued`、`running`、`completed`、`failed`
- `EMBEDDING_JOB_STATUSES`：`queued`、`running`、`completed`、`failed`
- `EMBEDDING_JOB_REQUESTERS`：`process`、`rebuild`、`scheduler`、`manual`

注意：部分 Prisma enum 使用下划线和小写值，例如 `claude_code`、`codex_jsonl`。API 边界统一使用连字符值，由 `apps/api/src/sources/source-mapping.ts` 负责显式映射。

### Source 契约

`sources.ts` 定义数据源创建、更新、展示和预设契约。

默认预设：

| 预设 | Parser | Reader | 默认根路径 | 默认 glob | 恢复命令模板 |
| --- | --- | --- | --- | --- | --- |
| Codex CLI | `codex-jsonl` | `file-glob` | `~/.codex/sessions` | `**/*.jsonl` | `cd {quoted cwd} && codex resume {quoted threadId}` |
| Claude Code | `claude-jsonl` | `file-glob` | `~/.claude/projects` | `**/*.jsonl` | `cd {quoted cwd} && claude --resume {quoted threadId}` |
| Pi Agent | `pi-jsonl` | `file-glob` | `~/.pi/agent/sessions` | `**/*.jsonl` | `cd {quoted cwd} && pi --session {quoted threadId}` |
| OpenCode | `opencode-sqlite` | `sqlite` | `~/.local/share/opencode` | `opencode.db` | `cd {quoted cwd} && opencode --session {quoted threadId}` |
| Generic | 默认 `generic-jsonl` | `file-glob` | `~/agent-log-search/history` | `**/*.{jsonl,json,md}` | `cd {quoted cwd}` |

`SOURCE_PRESET_METADATA` 在 UI 中拆出 `generic-jsonl`、`generic-json`、`generic-markdown` 三个可选项，但底层 `sourcePreset` 仍是 `generic`。

创建请求字段：

- `name`：1 到 100 字符
- `sourcePreset`
- `parserType`
- `readerType`
- `rootPath`：必须是绝对路径、`~` 或 `~/...`
- `fileGlob`：默认 `**/*`
- `resumeTemplate`
- `enabled`：默认 `true`
- `scanIntervalSeconds`：60 到 86400，默认 300
- `maxFileSizeBytes`：1 到 104857600，默认 5242880
- `maxFilesPerScan`：1 到 100000，默认 1000
- `followSymlinks`：默认 `false`

当前重要差异：`maxFileSizeBytes`、`maxFilesPerScan`、`followSymlinks` 会在 API 请求契约和前端表单类型中出现，其中 `followSymlinks` 参与根路径规范化，但 Prisma 模型只持久化 source 基础字段和 `scanIntervalSeconds`，当前扫描器也未按 `maxFileSizeBytes`/`maxFilesPerScan` 做实际限流。这是后续规划需要补齐的点。

### Domain 契约

`domain.ts` 定义：

- `AgentRole`：`system`、`user`、`assistant`、`tool`、`unknown`
- `AgentMessagePartKind`：`assistant_response`、`metadata`、`text`、`thinking`、`tool_call`、`unknown`
- `AgentSession`
- `AgentMessage`
- `AgentSessionDetail`
- `ScanJob`
- `ScanRunRecord`
- `ScanJobsResponse`
- `ScanRunResponse`

后端会在返回搜索命中和会话详情时把完整消息切分成 `AgentMessagePart[]`，前端不再依赖文本猜测用户消息、Agent 回复、工具调用或思考内容边界。

### Search 契约

`search.ts` 定义语义搜索请求：

- `query`：必填，trim 后 1 到 2000 字符
- `topK`：默认 50，最大 100
- `sessionLimit`：默认 10，最大 50
- `agentName`：可选
- `cwdKeyword`：可选

响应是会话级：

- `records[]`
- 每个 record 包含 `sessionId`、`score`、`agentName`、`cwd`、`threadId`、`title`、`resumeCommand`、`messageCount`、`lastMessageAt`、`matchedChunks`
- 每个 matched chunk 包含 `chunkId`、`score`、`snippet`、消息序号范围、可选 metadata 和结构化消息

### Pagination 与 Error 契约

`pagination.ts` 定义 `page`、`pageSize`，默认 `1/20`，最大 pageSize 为 100。

`errors.ts` 定义标准 API 错误 envelope：

```json
{
  "error": {
    "code": "source_not_found",
    "message": "Source not found",
    "details": {}
  }
}
```

前端 `ApiClientError` 会把该 envelope 转成可展示异常；如果响应不符合 Zod 契约，会转成 `invalid_response`。

## 6. 数据库模型

数据库由 `apps/api/prisma/schema.prisma` 和初始迁移描述。PostgreSQL 启用 `vector` extension，`agent_chunk.embedding` 是 `vector(1024)`，并创建 HNSW cosine 索引。

核心表：

### `agent_source`

表示一个可扫描数据源。

重要字段：

- `id`
- `name`
- `source_preset`
- `parser_type`
- `reader_type`
- `root_path`
- `file_glob`
- `resume_template`
- `enabled`
- `scan_interval_seconds`
- `last_scan_at`

关系：

- 一个 source 有多个 history file、session、chunk、scan job、embedding job。
- 删除 source 会级联删除 history、session、message、chunk；scan job 和 embedding job 的 source 外键是 `ON DELETE SET NULL`。

### `history_file`

表示已经发现和扫描过的历史文件。

重要字段：

- `source_id`
- `file_path`
- `file_hash`
- `file_size`
- `modified_at`
- `last_scanned_at`
- `parse_status`
- `error_message`

唯一约束：

- `(source_id, file_path)`

扫描时通过 `file_hash` 判断是否跳过未变化文件。

### `agent_session`

统一后的会话元数据。

重要字段：

- `source_id`
- `history_file_id`
- `agent_name`
- `external_thread_id`
- `title`
- `cwd`
- `model_name`
- `started_at`
- `last_message_at`
- `message_count`
- `resume_command`

唯一约束：

- `(source_id, external_thread_id)`

同一 source 下再次扫描同一 external thread 会 upsert 同一个 session，并替换其消息和 chunk。

### `agent_message`

统一后的会话消息。

重要字段：

- `session_id`
- `seq_no`
- `role`
- `content`
- `model`
- `created_at`

唯一约束：

- `(session_id, seq_no)`

会话详情按 `seq_no ASC` 返回完整消息。

### `agent_chunk`

搜索索引片段。

重要字段：

- `session_id`
- `source_id`
- `chunk_index`
- `start_message_seq`
- `end_message_seq`
- `agent_name`
- `external_thread_id`
- `cwd`
- `chunk_text`
- `embedding vector(1024)`
- `embedding_model`
- `embedding_status`
- `embedding_error`
- `embedding_requested_at`
- `embedding_ready_at`

唯一约束：

- `(session_id, chunk_index)`

索引：

- `embedding_status`
- `(source_id, embedding_status)`
- HNSW：`embedding vector_cosine_ops`

搜索只查询 `embedding_status = 'ready'` 且 embedding 非空的 chunk。

### `scan_job`

记录扫描运行历史。

字段包括状态、发现文件数、解析文件数、失败文件数、导入会话数、导入消息数、创建 chunk 数、错误摘要、开始/结束时间。

### `embedding_job`

记录 embedding 处理或 rebuild 历史。

字段包括：

- `source_id`
- `status`
- `requested_by`
- `total_chunks`
- `processed_chunks`
- `failed_chunks`
- `error_message`
- 时间戳

约束保证 `processed_chunks + failed_chunks <= total_chunks`。

## 7. 后端模块结构

Nest 根模块 `apps/api/src/app.module.ts` 导入：

- `ConfigModule`
- `ScheduleModule`
- `DatabaseModule`
- `SourcesModule`
- `ScanJobsModule`
- `ScannerModule`
- `EmbeddingsModule`
- `SearchModule`
- `SessionsModule`

### DatabaseModule

提供两个数据库访问层：

- `PrismaService`：继承 `PrismaClient`，用于常规 CRUD 和事务。
- `PgService`：封装 `pg.Pool`，用于 pgvector、`FOR UPDATE SKIP LOCKED`、手写 SQL 和连接池事务。

设计原因：Prisma 对 `Unsupported("vector(1024)")` 和部分 pgvector SQL 不够直接，因此向量读写、相似度检索和行锁声明使用原生 SQL。

### SourcesModule

职责：

- 管理 source CRUD。
- 暴露 source presets。
- 校验和规范化 root path。
- 映射 API enum 与 Prisma enum。

接口：

- `GET /api/sources`
- `GET /api/sources/presets`
- `POST /api/sources`
- `PATCH /api/sources/:id`
- `DELETE /api/sources/:id`

`PathPolicyService` 行为：

- 展开 `~` 和 `~/...`
- 要求路径绝对化
- 要求路径存在且是目录
- 默认拒绝 symlink root
- 若 `followSymlinks=true`，存储 realpath
- 若 `followSymlinks=false`，rootPath 中不能包含 symlink

### ScannerModule

扫描模块把 source 中的文件变成数据库里的 history/session/message/chunk。

主要组件：

- `ScannerService`：扫描入口、source 级内存锁、任务状态聚合。
- `ScannerSourceStore`：读取 enabled/due source。
- `ScannerJobStore`：创建/完成 scan job，标记文件失败，更新 source last scan。
- `ScannerFileRunner`：单文件 fingerprint、跳过未变化文件、调用 parser、调用 importer。
- `ScannerImporter`：事务导入 history/session/message/chunk。
- `ChunkerService`：把消息窗口切成可 embedding chunk。
- `SourceReaderRegistry`：根据 reader type 调用 `file-glob` 或 `sqlite` reader。
- `ScannerScheduler`：可选定时扫描 due source。

接口：

- `POST /api/scan/run`
- `POST /api/scan/run/:sourceId`

#### 扫描主流程

```text
用户或 scheduler 触发扫描
  -> ScannerService 找 enabled source
  -> source 级 runningSources 锁防止同一 source 并发扫描
  -> ScannerJobStore.start 创建 running scan_job
  -> SourceReaderRegistry 读取 parserSources
  -> 对每个 parserSource：
       -> fingerprintSource 生成 sha256 fingerprint
       -> 若 history_file.file_hash 相同，跳过
       -> ParserRegistry 按 parserType 解析
       -> parsed.errors 非空则失败
       -> ScannerImporter.importFile 事务导入
       -> 更新 counters
  -> ScanJobStore.finish 写 completed/failed 和计数
  -> touchLastScan 更新 agent_source.last_scan_at
```

当前 `ScannerService` 对每个 source 顺序扫描，不并行跑多个 source；同一个 source 的并发扫描会抛 `ScannerConflictError`。

#### 文件读取

`FileGlobSourceReader`：

- 从 rootPath 递归收集普通文件。
- 把相对路径转成 portable `/` 路径。
- 用项目内简化 glob 转正则匹配。
- 匹配后按文件路径排序。
- 读取 UTF-8 文本。

支持的 glob 能力：

- `*`
- `**`
- `?`
- `{jsonl,json,md}` 形式的 brace alternates

`SqliteSourceReader`：

- 同样基于 glob 找数据库文件。
- 返回 `kind: "sqlite"` 和 `databasePath`。
- 不直接读取文件内容，解析器负责只读打开。

当前 reader 没有实际使用 source 请求中的 `maxFileSizeBytes` 或 `maxFilesPerScan`。

#### Fingerprint

`fingerprintSource` 行为：

- 文本 source：hash 读取到的 content，file size 和 modifiedAt 来自 `stat(filePath)`。
- SQLite source：读取数据库文件 bytes 做 hash。
- OpenCode SQLite 额外把 `opencode.db-wal` 和 `opencode.db-shm` sidecar 纳入 hash 和 size，缺失 sidecar 时忽略。

#### 导入事务

`ScannerImporter.importFile` 用 Prisma `$transaction` 包裹整个文件导入：

1. upsert `history_file`，状态设为 `processing`。
2. 对每个 parsed session：
   - 调用 `retainHistoryMessages` 删除 `role === "tool"` 的消息。
   - upsert `agent_session`。
   - 删除该 session 旧 `agent_chunk`。
   - 删除该 session 旧 `agent_message`。
   - 批量创建 retained messages。
   - 用 `ChunkerService` 生成 chunk draft。
   - 批量创建 `embeddingStatus = pending` 的 chunk。
3. 把 `history_file.parseStatus` 设为 `ready`。

如果事务中途失败，旧消息和旧 chunk 不会半清空。文件级失败会被 `ScannerFileRunner` 捕获，并通过 `ScannerJobStore.markFileFailed` 写入 history 状态和错误摘要。

#### 恢复命令

`buildResumeCommand` 支持模板占位符：

- `{threadId}`
- `{quoted threadId}`
- `{cwd}`
- `{quoted cwd}`

`shellQuote` 用单引号包裹并处理单引号转义。命令只存储和展示，项目不执行。

#### 消息保留策略

当前导入层会丢弃 standalone `tool` role 消息。保留内容包括：

- 用户消息
- assistant 回复
- assistant 侧工具调用描述
- system/unknown，如果 parser 产生

这样可以保留“Agent 决定调用了什么工具、参数是什么”的上下文，同时避免 raw stdout/stderr、工具结果正文、巨大返回内容进入数据库和 embedding。

### Parser 体系

Parser 位于 `apps/api/src/parsers`。

公共类型：

- `ParserSource`：`text` 或 `sqlite`
- `ParsedMessage`：`role`、`content`、`model`、`sequence`、`createdAt`
- `ParsedSession`：`parserType`、`sourcePath`、`threadId`、`cwd`、`title`、`model`、`startedAt`、`updatedAt`、`messages`
- `ParseResult`：`sessions`、`warnings`、`errors`

`ParserRegistry.createDefault()` 注册 7 个 parser：

- `CodexJsonlParser`
- `ClaudeJsonlParser`
- `PiJsonlParser`
- `OpenCodeSqliteParser`
- `GenericJsonlParser`
- `GenericJsonParser`
- `GenericMarkdownParser`

Parser 的通用目标：

- 把各 CLI 私有格式变成统一 session。
- 生成稳定 thread id。
- 尽量提取 cwd、model、title、startedAt、updatedAt。
- 为缺失字段生成 warning，而不是让所有缺失都成为硬错误。
- 过滤或压缩工具调用/工具结果噪声。

#### Codex JSONL

支持两类格式：

- 较新的 `session_meta` + `response_item`/`event_msg` rollout 格式。
- 旧式带 `type: "session"` 等记录的 agent JSONL。

Codex parser 会识别 session metadata、消息 payload、用户/assistant 内容、工具调用相关结构，并推导 title。对于工具调用，会倾向保存命令、workdir、短参数、触及文件名等摘要信息，避免保存完整 raw result。

#### Claude JSONL

用 `sessionId` 作为 thread id。当前格式中 Claude 的 `message.role = "user"` 且内容是 `tool_result` 的记录会被规范化为 `tool`，随后在导入层丢弃。

#### Pi Agent JSONL

识别 `type` 或 `event` 中的 session 记录，thread 字段优先 `id`、`threadId`。当前 Pi 历史通常没有稳定独立 title，因此 parser 会从第一条真实用户请求推导标题。

#### OpenCode SQLite

支持旧版 `sessions/messages` 表和当前 `session/message/part` 表。读取 SQLite 时应保持只读。OpenCode session title 优先读 SQLite 的 `session.title`。

#### Generic JSONL/JSON/Markdown

Generic JSONL 和 JSON 期望数据可映射到：

- `threadId`
- `cwd`
- `title`
- `messages[]`
- message 的 `role`、`content`、`model`、`createdAt`

Generic Markdown 用于导入脱敏文本历史，适合作为未知 Agent CLI 的临时接入方式。

### Chunker

`ChunkerService` 把 retained messages 切成 chunk。

关键参数：

- `MAX_MESSAGES_PER_CHUNK = 16`
- `MIN_MESSAGES_BEFORE_SIZE_SPLIT = 3`
- `OVERLAP_MESSAGES = 2`
- `MAX_TARGET_CHARS = 2000`
- `TARGET_LONG_MESSAGE_PART_CHARS = 2400`
- `MAX_LONG_MESSAGE_PART_CHARS = 3200`
- `MIN_TRAILING_PART_CHARS = 600`

切分规则：

- 先过滤掉空内容和 `tool` role。
- 普通 chunk 最多 16 条消息。
- 超过 3 条消息后，如果累计正文超过 2000 字符，就提前切分。
- 相邻 chunk 保留最多 2 条消息重叠。
- 新 chunk 起点优先落在 user 消息上，避免从 assistant 回复中间开始。
- 单条超长消息单独成 chunk。
- 超过 3200 字符的单条消息继续切成多 part。
- 长文本切分优先按换行、空白、标点、括号等自然边界，避免极小尾段。
- 每个 chunk 文本以 header 开头：

```text
Agent: <sourcePreset>
CWD: <cwd or 未记录>
Thread: <threadId>
```

如果是长消息多 part，还会加入：

```text
Part: 1/3
```

这些 header 后续也用于搜索结果 metadata 展示和 `Part` 识别。

### EmbeddingsModule

职责：

- 提供 embedding provider。
- 处理 pending/failed chunk。
- 支持 rebuild。
- 启动时校验 provider 维度与数据库 vector 维度一致。
- 可选后台 worker 自动处理 chunk。

接口：

- `POST /api/embeddings/process`
- `POST /api/embeddings/rebuild`

请求 body 可为空，也可传：

```json
{
  "sourceId": "1"
}
```

#### Provider

`embedding-provider.ts` 定义：

- `MockEmbeddingProvider`
- `OllamaEmbeddingProvider`

`MockEmbeddingProvider`：

- 模型名是 `mock-1024`。
- 输出 1024 维。
- 使用词、字符 bigram/trigram、sha256 hash 和符号 hash 生成确定性 lexical 向量。
- 适合测试和本机无模型开发，不代表真实语义质量。

`OllamaEmbeddingProvider`：

- 调用 `${baseUrl}/api/embed`。
- 请求包含 `model`、`input`、`dimensions`、`keep_alive`、`truncate: true`。
- 默认模型来自环境变量或 README 推荐的 Qwen3 embedding。
- 默认 timeout 120 秒。

环境变量：

- `EMBEDDING_PROVIDER`：空、`mock-1024` 或 `mock` 都归一为 mock；`ollama` 使用 Ollama。
- `EMBEDDING_DIMENSION`：项目固定期望 1024。
- `EMBEDDING_MODEL`
- `EMBEDDING_OLLAMA_BASE_URL`
- `EMBEDDING_OLLAMA_KEEP_ALIVE`
- `EMBEDDING_OLLAMA_TIMEOUT_MS`

当前未实现 OpenAI 或通用 HTTP embedding provider。

#### Processing

`EmbeddingsService.process`：

1. 校验 source 是否存在。
2. 创建 `embedding_job`，默认 requester 是 `process`，worker 调用时是 `scheduler`。
3. 标记 job running。
4. 调用 `EmbeddingSqlStore.claimBatch` 领取最多 16 个 chunk。
5. 对每个 chunk 调 provider embed。
6. 校验向量维度。
7. 成功则 `markReady` 写入 vector、model、ready 时间。
8. 失败则 `markFailed` 写入错误。
9. 完成 job，记录 total/processed/failed/error。

`claimBatch` 使用：

```sql
FOR UPDATE SKIP LOCKED
```

并在同一事务内把 chunk 状态改为 `processing`，避免多 worker 重复处理。

`EmbeddingsService.rebuild`：

- 统计 ready/failed chunk。
- 创建 requester 为 `rebuild` 的 job。
- 把 ready/failed chunk 重置为 pending，清空 vector/model/error/requested/ready。
- job 本身立即 completed。真正重新 embed 由后续 worker 或 process 执行。

#### Worker

`EmbeddingWorker` 在模块初始化时读取配置：

- `EMBEDDING_WORKER_ENABLED`：默认测试环境 false，非测试 true。
- `EMBEDDING_WORKER_INTERVAL_MS`：默认 5000。
- `EMBEDDING_WORKER_SOURCE_ID`：可选。
- `EMBEDDING_WORKER_STALE_PROCESSING_MS`：默认 15 分钟。

每次 tick：

1. 防重入。
2. 重置超过 stale 时间仍处于 processing 的 chunk。
3. 统计 pending/failed chunk。
4. 若存在，调用 `embeddings.process(sourceId, "scheduler")`。

### SearchModule

职责：

- 对查询文本生成 embedding。
- 在 ready chunk 中做 pgvector cosine 检索。
- 把 chunk hit 聚合成 session-level result。

接口：

- `POST /api/search/semantic`

流程：

```text
SearchController
  -> ZodValidationPipe 校验 semanticSearchRequestSchema
  -> SearchService.semantic
  -> provider.embed(query)
  -> SearchSqlStore.searchChunks
  -> aggregateSemanticHits
  -> SemanticSearchResponse
```

`SearchSqlStore.searchChunks` 查询逻辑：

- CTE `ranked_chunks`
- 只查 `embedding_status = 'ready'` 且 embedding 非空。
- 可按 `agentName` 精确过滤。
- 可按 `cwdKeyword` 做 `ILIKE '%keyword%'`。
- 使用 `c.embedding <=> $1::vector` 做 cosine distance。
- 分数为 `1 - distance`，并 clamp 到 0 到 1。
- 按 distance 升序、chunk id 升序取 `topK`。
- join `agent_session` 获取会话 metadata。
- left join `agent_message` 获取 chunk 消息序号范围内的消息。
- 用 `json_agg` 按 `seq_no ASC` 聚合消息。

`aggregateSemanticHits`：

- 按 `sessionId` 聚合 chunk hit。
- session score 取该 session 命中的最高 chunk score。
- 每个 session 最多保留 3 个 matched chunks。
- chunk 内按 score 降序、chunk id 升序排序。
- session 按 score 降序、`lastMessageAt` 降序、session id 升序排序。
- 最终截断到 `sessionLimit`。
- 每条 hit message 会通过 `splitAgentMessageParts` 变成结构化 parts。

### SessionsModule

职责：

- 返回完整会话详情。

接口：

- `GET /api/sessions/:id`

行为：

- id 必须是正整数字符串。
- 用 Prisma `findUnique` 查 session。
- include messages，按 `seqNo ASC`。
- 不存在或 id 格式非法都返回 404 `session_not_found`。
- `toSessionDetail` 把 BigInt 和 Date 转成 API 字符串，并对每条 message 生成 `parts`。

### ScanJobsModule

职责：

- 查询扫描任务历史。

接口：

- `GET /api/scan-jobs?page=1&pageSize=20`

行为：

- 按 `createdAt DESC` 查询。
- include source 的 `id`、`name`、`sourcePreset`、`parserType`。
- 返回 `records` 和 `pagination`。
- `errorMessage` 会被截断。
- API 层把 Prisma enum 映射为 shared enum。

## 8. 结构化消息分块

`apps/api/src/messages/message-parts.ts` 将原始消息内容拆成前端可直接渲染的块。

输出 kind：

- `assistant_response`
- `metadata`
- `text`
- `thinking`
- `tool_call`
- `unknown`

作用：

- 让搜索结果和会话详情复用同一套结构。
- 前端不再基于字符串猜测 tool call、thinking、metadata。
- assistant 的非正文块默认可折叠，降低长工具调用和元数据对阅读的干扰。
- Markdown、KaTeX、Mermaid 渲染只在适合的文本块上开启。

拆分逻辑包含：

- role 默认 kind 映射。
- 识别结构化字段如 `thinking`、工具参数、metadata。
- 合并相邻同类 part。
- 去除某些重复 echo。
- 保留 label，方便 UI 展示“Agent 回复”“工具调用”“元数据”等。

## 9. 前端结构

Next.js App Router 页面入口非常薄，业务状态集中在 client workspace 组件：

```text
apps/web/app/layout.tsx             # 语言、metadata、Providers、AppShell
apps/web/app/page.tsx               # redirect("/search")
apps/web/app/search/page.tsx        # SearchWorkspace
apps/web/app/sources/page.tsx       # SourceWorkspace
apps/web/app/scan-jobs/page.tsx     # ScanJobsWorkspace
apps/web/app/sessions/[id]/page.tsx # SessionDetailWorkspace
apps/web/app/api/[...path]/route.ts # API 反代
apps/web/app/template.tsx           # 页面切换动画
```

`Providers`：

- `NextThemesProvider`
- `HeroUIProvider locale="zh-CN"`
- `reducedMotion="user"`

`AppShell`：

- 左侧/顶部响应式导航。
- 导航项：搜索、数据源、扫描任务。
- 主题切换。
- 内容最大宽度 `max-w-7xl`。

### API Client

`apps/web/lib/api.ts`：

- 使用 ky。
- 默认 base URL 是 `/api`。
- 默认 timeout 120 秒。
- 每个接口都用 shared Zod schema 校验响应。
- HTTP 错误会解析 shared error envelope。
- Zod 响应校验失败会变成 `ApiClientError(code="invalid_response")`。

方法：

- `searchSemantic`
- `listSources`
- `listSourcePresets`
- `createSource`
- `updateSource`
- `deleteSource`
- `runSourceScan`
- `listScanJobs`
- `getSession`

注意：后端 scan jobs 响应字段是 `records/pagination`，前端 `listScanJobs` 会转换为组件通用的 `PaginatedResponse<ScanJob>`，即 `items/page/pageSize/totalItems/totalPages`。

### Search UI

组件：

- `SearchWorkspace`
- `SearchBox`
- `SearchResultCard`
- `ResumeCommandBox`
- `CollapsibleMessagePart`
- `MarkdownContent`

状态：

- `idle`
- `loading`
- `ready`
- `error`

输入：

- 语义查询
- `topK`
- `sessionLimit`
- 可折叠筛选条件：`agentName`、`cwdKeyword`

行为：

- 表单由 `search-types.ts` 做前端解析和错误提示。
- 提交后调用 `client.searchSemantic`。
- loading 使用近似结果布局的 skeleton。
- 空结果展示中文 empty state。
- 每个结果卡展示：
  - title
  - 匹配度
  - Agent
  - 消息数
  - 打开详情链接
  - matched chunks
  - resume command copy 区域

Matched chunk 展示：

- chunk id
- chunk score
- 消息序号范围
- Part 标记
- Agent/CWD/Thread metadata
- 若后端返回 structured messages，则按消息和 part 展示。
- 若没有 messages，则回退展示原始 snippet。

### Sources UI

组件：

- `SourceWorkspace`
- `SourceWorkspaceView`
- `SourceForm`
- `SourceTable`

行为：

- 首次加载并行请求 sources 和 presets。
- 可创建、编辑、删除 source。
- 可启用/禁用 source。
- 可对单个 source 发起扫描。
- 扫描结果以每行状态提示展示。
- 扫描后只刷新 source 列表，以更新 `lastScanAt` 等字段。

表单：

- 预设下拉会填充 parser、reader、rootPath、fileGlob、resumeTemplate。
- 保留当前用户输入的 `name` 和 `enabled`。
- parserType 和 readerType 当前是只读字段。
- 前端校验 rootPath、fileGlob、resumeTemplate、scanIntervalSeconds。

当前 UI 暴露的是核心持久字段；虽然 shared create schema 包含 scan guard 字段，当前表单并未作为显式高级控制完整呈现这些字段。

### Scan Jobs UI

组件：

- `ScanJobsWorkspace`
- `ScanJobsTable`

状态：

- `loading`
- `ready`
- `error`

行为：

- 默认 page size 20。
- 支持刷新。
- 支持分页。
- UI 本地 tab 筛选状态：全部、进行中、已完成、失败。
- “进行中”包含 `running` 和 `queued`。
- 失败长文本折叠在详情动作后。

注意：状态 tab 是当前页内本地筛选，不是后端查询筛选；如果未来数据量大，应考虑把 status filter 下推到 API。

### Session Detail UI

组件：

- `SessionDetailWorkspace`
- `MessageBubble`
- `ResumeCommandBox`
- `MarkdownContent`
- `CollapsibleMessagePart`

行为：

- 根据 route param 调 `getSession`。
- 使用 request id 避免旧请求覆盖新状态。
- 展示 session metadata。
- 展示 copy-only resume command。
- 按 role 渲染消息气泡：
  - user 靠右
  - assistant 靠左
  - tool/system/unknown 居中
- 对 message parts 使用不同色块和 icon。
- assistant 的非 `assistant_response` part 默认折叠。

### Markdown 渲染

`MarkdownContent` 支持：

- GFM
- 数学公式
- KaTeX
- Mermaid

全局 CSS 对 `.markdown-content` 做了表格、代码块、标题、KaTeX、Mermaid 的间距和溢出处理。

## 10. API 总览

所有后端接口在 Nest 中有全局 `/api` 前缀。Web 通过同源 `/api` 反代访问。

### Health

```http
GET /api/health
```

用于服务健康检查。

### Sources

```http
GET    /api/sources
GET    /api/sources/presets
POST   /api/sources
PATCH  /api/sources/:id
DELETE /api/sources/:id
```

Source API 使用 shared schema 校验请求 body。非法路径返回 `invalid_source_path`。不存在 source 返回 `source_not_found`。

### Manual Scan

```http
POST /api/scan/run
POST /api/scan/run/:sourceId
```

`run/:sourceId` 中非法 id 会被解析为 `0n`，随后因为找不到 enabled source 而返回 source not found 类错误。这个实现能避免 BigInt parse 异常外泄，但语义上可以在后续统一为显式 404 错误 envelope。

### Scan Jobs

```http
GET /api/scan-jobs?page=1&pageSize=20
```

分页参数经 `paginationQueryStringSchema` coerce 成 number。

### Embeddings

```http
POST /api/embeddings/process
POST /api/embeddings/rebuild
```

body 可为空或包含 `sourceId`。当前 controller 内部写了轻量 schema，而不是直接复用 `packages/shared/src/embeddings.ts` 中的 `embeddingJobRequestSchema`。功能上等价，但后续可以统一。

### Semantic Search

```http
POST /api/search/semantic
```

请求示例：

```json
{
  "query": "之前修过登录接口 500 的那次",
  "topK": 50,
  "sessionLimit": 10,
  "agentName": "generic",
  "cwdKeyword": "CliSearch"
}
```

无 ready chunk 或无匹配时返回 200：

```json
{
  "records": []
}
```

### Sessions

```http
GET /api/sessions/:id
```

返回完整 session metadata 和 messages。该接口隐私风险最高，因为会返回完整 indexed conversation。

## 11. 隐私与安全边界

项目当前的安全模型是本地工具，不是多用户 Web 服务。

已实现的保护：

- API 默认绑定 `127.0.0.1`。
- Web dev/start 默认绑定 `127.0.0.1`。
- Docker demo 只发布 Web 端口，API/Postgres/Ollama 只在 compose 网络内。
- source rootPath 必须存在且默认拒绝 symlink。
- 原始历史目录只读读取。
- 工具结果消息不持久化、不索引。
- 恢复命令 copy-only，不执行。
- `.env`、真实 Agent 历史、AgentLogs 等不应提交。

未实现的保护：

- 无登录认证。
- 无 per-source/per-session 授权。
- 无 CSRF 设计。
- 无审计日志。
- 无 secret 自动脱敏。
- 无网络部署 threat model。
- 无 source 目录 allowlist，仅依赖用户创建 source 和本机边界。

如果要变成团队共享服务，必须先完成认证授权、租户隔离、敏感信息脱敏、网络暴露策略和审计设计。

## 12. 测试与质量现状

已有测试覆盖方向：

后端：

- 数据库服务测试
- parser fixture 校验
- parser 单元测试
- source enum mapping
- source service
- scanner service
- scanner scheduler
- chunker
- embedding provider
- embeddings service
- embedding worker
- search aggregation
- message parts
- e2e：health、sources、scan run、scan jobs、scanner scheduler、embeddings、search

前端：

- API client
- scan jobs API 适配
- app shell
- source workspace
- source scan interval
- search workspace
- search adversarial cases
- scan jobs workspace
- scan jobs concurrency
- session detail workspace
- display labels
- markdown content

质量特征：

- API 请求和响应大量使用 Zod 契约校验。
- Prisma enum 与 API enum 明确映射。
- BigInt/Date 出 API 前转字符串。
- 导入事务避免半更新。
- embedding claim 使用数据库行锁，支持多实例时减少重复处理。
- 搜索聚合有独立单元测试。
- 前端 API client 会拒绝不符合契约的响应。

测试缺口和风险点：

- `maxFileSizeBytes`、`maxFilesPerScan` 尚未落到 scanner 实现。
- Embeddings controller 未复用 shared embedding request schema。
- Search SQL 与数据库实际 pgvector 行为更多依赖 e2e。
- Source reader 的 glob 实现是项目内简化版本，复杂 glob 行为有限。
- Scan jobs UI 的 status filter 是当前页本地筛选，分页语义可能让用户误解。
- 无认证授权相关测试，因为产品目前没有该能力。

## 13. 当前实现中的关键设计取舍

### 为什么用 shared Zod 契约

前后端共享 Zod schema，可以让 API 输入、API 输出和前端解析保持一致。缺点是后端 controller 需要注意不要绕过 shared schema；当前 embedding controller 就存在轻微重复。

### 为什么 Prisma 和 pg 并存

Prisma 适合关系模型 CRUD、事务、upsert 和测试 fake；pgvector 的 `vector(1024)`、`<=>`、HNSW、`FOR UPDATE SKIP LOCKED` 更适合手写 SQL。因此项目保留两条数据库访问路径。

### 为什么搜索按 chunk 命中但返回 session

用户通常想找“哪次会话”，而不是孤立片段。chunk 适合向量召回，session 适合 UI 展示和恢复操作。聚合层将多个 chunk 命中折叠到一个 session，并保留最多 3 个高分 matched chunks。

### 为什么丢弃 tool role 消息

工具返回常常包含大量 stdout/stderr、文件内容、环境信息或私密数据。保留它们会降低搜索质量并增加隐私风险。当前策略保留 assistant 侧工具调用描述，足以回答“Agent 当时打算做什么”，但不保留工具结果正文。

### 为什么恢复命令只复制

自动执行恢复命令会跨越“搜索工具”和“命令执行器”的边界，并可能在用户未确认时恢复某个 agent 会话。copy-only 保持产品职责清晰，也更符合本地隐私边界。

## 14. 后续规划建议

### P0：明确安全边界

- 在 README 和 UI 中继续强调本地工具属性。
- 如果要允许网络访问，先设计认证授权和部署威胁模型。
- 为 session detail 和 search result 增加敏感信息脱敏策略前，不要暴露到公共网络。

### P1：补齐 source scan guard

当前契约已有 `maxFileSizeBytes`、`maxFilesPerScan`，但 scanner 未实际使用。建议：

- Prisma 增加字段或明确这些字段仅为 request-time 临时值。
- `SourceReaderRequest` 增加 limit 和 size 限制。
- reader 层跳过超限文件并产生可追踪 warning。
- scan job counters 增加 skipped/oversized 统计。
- UI 暴露高级扫描限制。

### P1：统一 embedding 契约

- Embeddings controller 直接复用 shared `embeddingJobRequestSchema`。
- 前端若未来展示 embedding jobs，也复用 shared summary schema。
- 增加 `GET /api/embeddings/jobs` 或 source 详情里的 embedding 状态。

### P1：扫描与 embedding 可观测性

- Scan jobs 增加按 source/status/filter 查询。
- Embedding jobs 增加列表 API 和 UI。
- Source 列表展示 pending/ready/failed chunk 数。
- 后台 worker 当前只写 Nest logger，后续可将关键错误持久化到 job 表或独立事件表。

### P2：搜索体验增强

- 支持时间范围筛选。
- 支持 sourceId 筛选。
- 支持只搜 title/cwd/thread。
- 对 score、chunk、session 提供更可解释的排序信息。
- 搜索结果支持直接跳到 session detail 中对应消息范围。
- 对无 ready chunk 的情况给出“需要扫描/嵌入”的具体提示。

### P2：Parser 扩展策略

新增一类 Agent CLI 时应同时提交：

- 脱敏 fixture。
- parser 实现。
- fixture validation。
- source preset metadata。
- README/API 文档更新。
- 工具结果过滤规则。
- title/cwd/thread/model 提取规则。

不建议直接把未知 CLI 加为 first-class preset；先用 Generic JSONL/JSON/Markdown 导入验证数据形状。

### P2：数据库演进

- 考虑给 chunk 记录 token estimate。
- 考虑记录 parser warnings。
- 考虑 session title provenance：native、derived、fallback。
- 考虑 history file skipped/unchanged 统计。
- 考虑 embedding model 迁移策略，避免不同模型向量混用。

### P3：产品化前端

- Source detail 页面。
- Session detail 中 matched chunk 高亮。
- Scan job detail 页面，展示文件级失败。
- Empty state 里给出下一步操作入口。
- 统一表格筛选、排序、分页为 URL 状态。

## 15. 快速读代码路线

如果后续仍需要深入源码，推荐按这个顺序阅读：

1. `packages/shared/src/constants.ts`
2. `packages/shared/src/sources.ts`
3. `packages/shared/src/domain.ts`
4. `packages/shared/src/search.ts`
5. `apps/api/prisma/schema.prisma`
6. `apps/api/src/app.module.ts`
7. `apps/api/src/sources/sources.service.ts`
8. `apps/api/src/scanner/scanner.service.ts`
9. `apps/api/src/scanner/scanner-file-runner.ts`
10. `apps/api/src/scanner/scanner-importer.ts`
11. `apps/api/src/parsers/parser-registry.ts`
12. `apps/api/src/scanner/chunker.service.ts`
13. `apps/api/src/embeddings/embeddings.service.ts`
14. `apps/api/src/embeddings/embedding-sql.ts`
15. `apps/api/src/search/search.service.ts`
16. `apps/api/src/search/search-sql.ts`
17. `apps/api/src/search/search-records.ts`
18. `apps/api/src/sessions/sessions.service.ts`
19. `apps/web/lib/api.ts`
20. `apps/web/components/search-workspace.tsx`
21. `apps/web/components/search-result-card.tsx`
22. `apps/web/components/source-workspace.tsx`
23. `apps/web/components/scan-jobs-workspace.tsx`
24. `apps/web/components/session-detail-workspace.tsx`

这条路线基本覆盖从 API 契约、数据模型、导入管线、向量处理、搜索聚合到 UI 展示的完整主路径。

## 16. 一句话总结

AgentLogSearch 当前已经具备一个完整的本地语义检索闭环：配置 source、扫描历史、解析会话、生成 chunk、处理 embedding、pgvector 检索、会话级聚合、Web 展示和 copy-only 恢复命令。下一阶段最值得优先投入的是扫描限制真正落地、embedding/scan 可观测性、搜索筛选与详情联动，以及在任何网络化部署之前补齐认证和隐私治理。
