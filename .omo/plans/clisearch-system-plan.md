# AgentLogSearch 系统开发计划

## TL;DR
> Summary:      从当前只有规格文档的目录中，从零落地一个 Agent CLI 对话历史语义检索 monorepo：Next.js 前端、NestJS API、PostgreSQL/pgvector、扫描解析、chunk、mock embedding、语义搜索、会话回溯和 resume 命令复制。首轮一等支持 Codex CLI、Claude Code、Pi Agent 与 OpenCode 历史，同时保留 Generic JSONL / JSON / Markdown 导入能力。
> Deliverables:
> - pnpm monorepo：`apps/web`、`apps/api`、`packages/shared`
> - PostgreSQL + pgvector 数据库、Prisma + raw SQL migration、Docker Compose
> - Codex CLI / Claude Code / Pi Agent / OpenCode / Generic JSONL / Generic JSON / Generic Markdown parser 与 source preset
> - source CRUD、手动扫描、定时扫描、scan job、history file fingerprint
> - chunker、mock-1024 embedding provider、embedding worker、process/rebuild API
> - `POST /api/search/semantic`、`GET /api/sessions/:id`、session 聚合搜索
> - `/search`、`/sources`、`/scan-jobs`、`/sessions/[id]` 前端页面与 Playwright QA
> Effort:       XL
> Risk:         High - 多服务从零搭建、pgvector/raw SQL、宿主历史文件/SQLite 扫描、parser 格式兼容、端到端检索稳定性

## Scope
### Must have
- 使用 pnpm workspace 管理 monorepo。
- 前端：Next.js App Router + TypeScript + Tailwind CSS + HeroUI。
- 后端：NestJS + TypeScript，外部公开 API 统一带 `/api` prefix。
- 数据库：PostgreSQL + pgvector；Prisma 负责普通 CRUD 和 model，`pg` 原生 SQL 负责 vector 查询与 raw vector 写入。
- 数据库模型覆盖 `agent_source`、`history_file`、`agent_session`、`agent_message`、`agent_chunk`、`scan_job`、`embedding_job`。
- `agent_source` 必须区分 `source_preset`、`parser_type` 和 `reader_type`；不要把 `type` 同时当 source、parser 和 reader 用。
- 首轮一等 Agent CLI preset：
  - Codex CLI：`source_preset=codex`、`parser_type=codex-jsonl`、root `~/.codex/sessions`、glob `**/*.jsonl`、resume `cd {quoted cwd} && codex resume {quoted threadId}`。
  - Claude Code：`source_preset=claude-code`、`parser_type=claude-jsonl`、root `~/.claude/projects`、glob `**/*.jsonl`、resume `cd {quoted cwd} && claude --resume {quoted threadId}`。
  - Pi Agent：`source_preset=pi-agent`、`parser_type=pi-jsonl`、root `~/.pi/agent/sessions`、glob `**/*.jsonl`、resume `cd {quoted cwd} && pi --session {quoted threadId}`。
  - OpenCode：`source_preset=opencode`、`parser_type=opencode-sqlite`、root `~/.local/share/opencode`、glob `opencode.db`、resume `cd {quoted cwd} && opencode --session {quoted threadId}`。
- 通用导入 parser：`generic-jsonl`、`generic-json`、`generic-markdown`。
- 一等 preset 必须包含前端 preset 下拉、默认 rootPath/fileGlob/resumeTemplate 自动填充、专用 parser、fixture、单测、扫描 e2e、resume command 断言。
- Parser 归一化规则：
  - Codex：从 `session_meta.payload.id/cwd` 建 session；导入 `response_item.payload.role/content` 中可归一化文本的 user/assistant/tool/system；数组/对象 content 只提取文本块，无法文本化的结构用简短占位如 `[tool_call] <name>`，不丢失 seq。
  - Claude Code：从顶层 `sessionId/cwd/timestamp` 建 session；导入 `message.role/content/model`；数组 content 中 text block 转文本，`tool_use`/`tool_result` 归一到 `tool` role，占位保留工具名和摘要。
  - Pi Agent：从 `type=session` 行的 `id/cwd/timestamp` 建 session；导入 `type=message` 行的 `message.role/content/timestamp`；`model_change` 行更新 session model；其它事件跳过但保留 seq 稳定。
  - OpenCode：从 SQLite `session.id/directory/title/time_created/time_updated/agent/model` 建 session；优先读取 `session_message`，否则用 `message` + `part` 表拼接；`part.data.type=text` 转文本，`reasoning/tool/step` 类型归一为 tool 或简短占位。
  - Generic JSONL：支持 `threadId/cwd/role/content/createdAt`；按 line 分组和排序。
  - Generic JSON：支持 `threadId/cwd/title/model/messages[]`。
  - Generic Markdown：frontmatter 可选 `threadId/cwd/title`，`## User` / `## Assistant` / `## Tool` / `## System` 分段。
- Generic parser 容错策略：
  - 非法 JSON 行：记录 parse error 并让该文件 `parse_status=FAILED`，不部分导入。
  - 缺失 `threadId`：使用稳定 fallback `sha256(filePath)`，并在 warning 中标记。
  - 缺失 `cwd`：允许为空，resume command 中 cwd 使用空字符串但 UI 标注“未记录”。
  - 空 content：跳过该 message 并记录 skipped count。
  - 无 frontmatter Markdown：允许导入，thread id 使用 fallback。
- Source reader 规则：
  - `file-glob` reader 用于 Codex、Claude、Pi、Generic JSONL/JSON/Markdown。
  - `sqlite` reader 用于 OpenCode；必须只读打开 `opencode.db`，优先使用 read-only URI 或复制 `opencode.db`/`opencode.db-wal`/`opencode.db-shm` 到临时目录后查询，不能写入原数据库。
- 文件 fingerprint 使用 `sha256(file content)` 作为最终变更依据；size/mtime 只做快速跳过提示，不能替代 hash。
- 扫描必须只读历史文件，不改写 source root。
- Path policy：
  - 支持 `~` 展开和绝对路径规范化。
  - 拒绝不存在路径、普通文件 root、相对路径逃逸。
  - 默认不跟随 symlink；如需要跟随必须显式配置。
  - 配置最大文件大小和最大扫描文件数。
  - 错误中不输出完整敏感正文。
- 手动扫描和定时扫描都必须实现；定时扫描采用全局 interval 轮询 enabled sources，根据 `last_scan_at + scan_interval_seconds` 判断是否到期，避免为每个 source 动态注册 timer。
- 扫描和 embedding 必须有重入保护：
  - 手动扫描和定时扫描同时触发同一 source 不得重复导入。
  - embedding worker 使用 batch + 行级锁或等价机制，避免重复处理 chunk。
- 导入事务边界：每个文件或每个 session 的删除旧 message/chunk、插入新 message/chunk 必须在事务内完成；失败不得留下 message/chunk 半清空状态。
- Chunker 默认：3 到 8 条 message、500 到 1200 中文字目标长度、overlap 1 到 2 条 message、优先从 user message 开始、空消息跳过。
- Embedding 首轮只实现 `mock-1024` provider。Ollama/OpenAI/http 只保留接口、配置占位和 README 后续说明，不要求 UI 切换，不作为验收阻塞项。
- `embedding_status` 是首轮核心依赖，不再视为可选加分项；搜索只查 READY chunk。
- `mock-1024` 必须确定性，并能让 demo 搜索句“之前修过登录接口 500 的那次”在 topN 命中 thread `abc123`。
- `POST /api/embeddings/process` 必做；`POST /api/embeddings/rebuild` 首轮支持按 source 或全量将 READY/FAILED chunk 重置为 PENDING，并可重新 process。
- Search API：
  - Nest 全局 prefix `/api`，controller route `/search/semantic`，外部公开 URL `/api/search/semantic`。
  - `query` 必填非空；`topK` 默认 50、上限 100；`sessionLimit` 默认 10、上限 50。
  - 支持 `agentName`、`cwdKeyword` 过滤。
  - 无 READY chunk 或无命中返回 `200 { records: [] }`。
  - 按 score desc，再按 `lastMessageAt` desc 稳定排序。
- Resume command：
  - 系统只生成和复制命令，绝不执行命令。
  - 不允许裸 `replaceAll` 插值；必须 shell quote/escape `cwd` 与 `threadId`。
  - 单测覆盖空格、双引号、分号、美元符号。
- 前端第一屏是可用搜索页，不做营销页。
- 前端必须包含 `/search`、`/sources`、`/scan-jobs`、`/sessions/[id]`。
- 前端必须有 loading、empty、error、validation 状态和复制失败 fallback。
- README 从 Phase 1 起创建并持续更新；最终 QA 必须按 README 冷启动跑通。
- 默认仅绑定 localhost；README 明确本地隐私边界：不上传历史内容、不带鉴权、不要暴露公网。
- 日志和错误中截断消息正文，不打印完整历史内容或密钥样式字符串。
- Git 约束：
  - 不得设置 local `user.name`、`user.email` 或任何身份信息。
  - 如执行 commit，message 格式为 `<type>(<scope>): <gitmoji> <subject>`。
  - commit body 加 `Co-authored-by: Wine Fox <fox@ling.plus>`。
  - 当前 remote 已是 `git@github.com:Lynricsy/AgentLogSearch.git`，不得覆盖为其他 remote。

### Must NOT have
- 首轮不实现真实 OpenAI provider、真实 Ollama provider、BGE-M3 Python service、登录/权限、生产部署平台。
- 首轮不承诺 Cursor / Cursor Agent、Gemini CLI、Qwen Code、Aider、Continue、Goose、Roo/Kilo 的一等 preset；这些可通过 generic parser 或后续拿样例再扩展。
- 不在后端执行 resume command。
- 不把 Agent 历史正文完整输出到 server log、browser console、测试日志或错误响应。
- 不用测试替代真实 surface QA；最终必须用 API curl 和浏览器驱动验证。
- 不以 mock-only 单元测试宣称 pgvector 搜索完成。
- 不提交 `.omo/evidence/` 和 `AgentLogs/`，除非主人后续明确要求。

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Jest/Supertest for API, Vitest or Jest for shared/parser utilities, Playwright for web, SQL verification for pgvector
- QA policy: every todo includes tests and an agent-executed API/browser/manual scenario
- Evidence: `.omo/evidence/task-<N>-<slug>.<ext>`，证据只本地留存，默认不纳入 git
- Required command gates by final wave:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:e2e`
  - `pnpm build`
  - `pnpm playwright test`
  - `docker compose up -d postgres`
  - API curl sequence against `http://localhost:3001/api`
  - Playwright desktop and mobile viewport QA against `http://localhost:3000`

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. `< 3` per wave is allowed only for the final verification wave.

Wave 1 (no deps): T1, T2, T3, T4, T5
Wave 2 (after 1): T6, T7, T8, T9, T10
Wave 3 (after 2): T11, T12, T13, T14, T15
Wave 4 (after 3): T16, T17, T18, T19, T20
Final verification wave (after all todos): F1, F2, F3, F4

Critical path:
T1 -> T2 -> T6 -> T7 -> T8 -> T10 -> T11 -> T12 -> T13 -> T14 -> T15 -> T16 -> T17 -> T20 -> F3

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| T1 | none | T2, T3, T4, T5 | T2 draft decisions only |
| T2 | T1 | T6, T7, T8, T10 | T3, T4, T5 |
| T3 | T1 | T4, T16, T20 | T2, T5 |
| T4 | T1, T3 | T16, T20 | T2, T5 |
| T5 | T1 | T6, T7, T8, T10 | T2, T3 |
| T6 | T2, T5 | T7, T10, T11 | T8, T9 |
| T7 | T2, T5, T6 | T10, T11 | T8, T9 |
| T8 | T2, T5 | T10, T11 | T6, T7, T9 |
| T9 | T2, T5 | T10, T11 | T6, T7, T8 |
| T10 | T6, T7, T8, T9 | T11, T12 | none |
| T11 | T10 | T12, T13 | none |
| T12 | T11 | T13, T14, T15 | none |
| T13 | T12 | T14, T15 | none |
| T14 | T13 | T15, T17 | T16 |
| T15 | T13, T14 | T16, T17 | none |
| T16 | T3, T4, T15 | T17, T18, T20 | T19 |
| T17 | T14, T15, T16 | T20 | T18, T19 |
| T18 | T16 | T20 | T17, T19 |
| T19 | T16 | T20 | T17, T18 |
| T20 | T1-T19 | F1-F4 | none |

## Todos
> Implementation + Test = ONE todo. Never separate.

- [x] T1. 初始化 monorepo、工具链、README 骨架和 Git/环境约束
  What to do / Must NOT do:
  - 在根目录建立 `package.json`、`pnpm-workspace.yaml`、`.npmrc`、`tsconfig.base.json`、ESLint/Prettier 或等价格式化配置、`README.md`、`.env.example`、`docker-compose.yml` 初稿。
  - 创建 `apps/web`、`apps/api`、`packages/shared` 基础目录。
  - README 明确本地隐私边界、默认 localhost、`AgentLogs/` 和 `.omo/evidence/` 默认不提交、禁止执行 resume command。
  - 不设置 local git identity；保留 `origin git@github.com:Lynricsy/AgentLogSearch.git`。
  Parallelization: Can parallel Y | Wave 1 | Blocks T2/T3/T4/T5
  References:
  - `大致设计.md:47` monorepo 结构
  - `大致设计.md:1027` Docker Compose
  - `.omo/drafts/clisearch-system-plan.md:39` 当前目录状态
  - `.omo/drafts/clisearch-system-plan.md:41` remote 已设置
  Acceptance criteria:
  - `pnpm --version` exits 0, then `pnpm install` exits 0.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test` scripts exist; before implementation they may run no-op smoke tests but must exit 0.
  - `git config --local --list` contains no `user.name` or `user.email`.
  - `git remote get-url origin` prints `git@github.com:Lynricsy/AgentLogSearch.git`.
  QA scenarios:
  - Shell: `pnpm install && pnpm lint && pnpm typecheck && pnpm test`; save summary to `.omo/evidence/task-1-tooling.txt`.
  - Shell: `git config --local --list && git remote -v`; save to `.omo/evidence/task-1-git.txt`.
  Commit: Y | `chore(workspace): 🧱 initialize monorepo workspace` | root config, README, env, compose skeleton

- [x] T2. 搭建 shared 契约、错误模型和验证 schema
  What to do / Must NOT do:
  - 在 `packages/shared` 定义 DTO/type/schema：sources、scan jobs、sessions、messages、chunks、search、embedding status、parser types、source presets、source reader types。
  - 明确 API 错误响应格式、分页默认/上限、`topK/sessionLimit` 默认和上限。
  - 使用 Zod 或等价 schema；不要在 API/Web 复制不一致类型。
  Parallelization: Can parallel Y | Wave 1 | Blocks T6/T7/T8/T10
  References:
  - `大致设计.md:651` API 设计
  - `大致设计.md:725` search request/response
  - `.omo/drafts/clisearch-system-plan.md:157` source preset / parser type 分层
  Acceptance criteria:
  - Unit tests cover valid/invalid `SemanticSearchRequest`、source payload、pagination bounds。
  - `pnpm --filter @agent-log-search/shared test` exits 0.
  - Generated/compiled package exports are importable from API and Web.
  QA scenarios:
  - Shell: run shared tests and typecheck; save to `.omo/evidence/task-2-shared-tests.txt`.
  Commit: Y | `feat(shared): 🧩 define API contracts and validation schemas` | `packages/shared`

- [x] T3. 搭建 Next.js App Router + Tailwind + HeroUI 基础壳
  What to do / Must NOT do:
  - 创建 `apps/web` Next.js App Router 项目结构：`app/layout.tsx`、`app/page.tsx` 重定向 `/search`、`app/providers.tsx`、`app/globals.css`。
  - 接入 Tailwind CSS、HeroUIProvider、基础 AppShell 导航。
  - 使用操作型界面，不做 landing/hero 营销页。
  Parallelization: Can parallel Y | Wave 1 | Blocks T4/T16/T20
  References:
  - `大致设计.md:65` 前端目录
  - `大致设计.md:885` 前端页面设计
  - `.omo/drafts/clisearch-system-plan.md:84` Next App Router 事实
  - `.omo/drafts/clisearch-system-plan.md:91` HeroUI provider 事实
  Acceptance criteria:
  - `pnpm --filter web lint`, `pnpm --filter web typecheck`, `pnpm --filter web build` exit 0.
  - Browser opens `/search` as first user surface and AppShell nav has Search/Sources/Scan Jobs/Settings or implemented subset with disabled future item if needed.
  QA scenarios:
  - Playwright: open `http://localhost:3000/search`, assert shell/nav/search heading visible at desktop viewport; screenshot `.omo/evidence/task-3-web-shell.png`.
  Commit: Y | `feat(web): 🖥️ scaffold app shell and UI foundation` | `apps/web`

- [x] T4. 搭建前端 API client、状态组件和基础页面占位
  What to do / Must NOT do:
  - 在 `apps/web/lib/api.ts` 使用 `NEXT_PUBLIC_API_BASE_URL`，默认 `http://localhost:3001/api`。
  - 建立 `StatusBadge`、loading/empty/error state、form validation helper。
  - 创建 `/search`、`/sources`、`/scan-jobs`、`/sessions/[id]` 页面骨架，先使用 API client contract 和 placeholder state。
  Parallelization: Can parallel Y | Wave 1 | Blocks T16/T18/T19/T20
  References:
  - `大致设计.md:1011` 前端 API Client
  - `大致设计.md:885` AppShell/Search/Sources/Scan Jobs
  Acceptance criteria:
  - `pnpm --filter web test` covers API client base URL and error handling.
  - `pnpm --filter web build` exits 0.
  QA scenarios:
  - Playwright: navigate all planned routes and assert no runtime error overlay; save `.omo/evidence/task-4-web-routes.txt`.
  Commit: Y | `feat(web): 🧭 add API client and route skeletons` | `apps/web`

- [x] T5. 搭建 NestJS API 基础、配置、健康检查和测试基座
  What to do / Must NOT do:
  - 创建 `apps/api` NestJS 项目结构：`main.ts`、`app.module.ts`、config、global validation pipe、global prefix `/api`。
  - 建立 `GET /api/health`、统一错误响应、Jest/Supertest e2e 基座。
  - 引入 `@nestjs/schedule`，但 scheduler 业务后续 todo 实现。
  Parallelization: Can parallel Y | Wave 1 | Blocks T6/T7/T8/T9/T10
  References:
  - `大致设计.md:101` 后端目录
  - `.omo/drafts/clisearch-system-plan.md:87` Nest controller/service 事实
  - Metis: route prefix `/api` 决议
  Acceptance criteria:
  - `pnpm --filter api test`, `pnpm --filter api test:e2e`, `pnpm --filter api build` exit 0.
  - `curl -i http://localhost:3001/api/health` returns HTTP 200 JSON.
  QA scenarios:
  - HTTP: start API and capture `curl -i /api/health` to `.omo/evidence/task-5-health.http`.
  Commit: Y | `feat(api): 🩺 scaffold NestJS API foundation` | `apps/api`

- [x] T6. 实现数据库 schema、raw pgvector migration 和数据库服务
  What to do / Must NOT do:
  - 配置 Prisma schema 与 migrations。
  - 使用 raw SQL migration 创建 `CREATE EXTENSION IF NOT EXISTS vector`、`vector(1024)`、HNSW index。
  - Prisma 中 `agent_chunk.embedding` 使用 `Unsupported("vector")` 或明确不经 Prisma 写入。
  - 实现 `PrismaService`、`PgService`、migration/seed 命令。
  - `agent_source` schema 包含 `source_preset`、`parser_type`、`reader_type`、`root_path`、`file_glob`、`resume_template`、`enabled`、`scan_interval_seconds`。
  - `embedding_job` schema 明确定义 embedding 批处理审计与重试：`id`、`source_id?`、`status`、`requested_by`、`total_chunks`、`processed_chunks`、`failed_chunks`、`error_message?`、`created_at`、`started_at?`、`finished_at?`；`POST /api/embeddings/process` 每次创建一个 job，`rebuild` 创建 rebuild job 并重置目标 chunks。
  Parallelization: Can parallel Y | Wave 2 | Blocks T7/T10/T11
  References:
  - `大致设计.md:201` 数据库设计
  - `大致设计.md:293` `agent_chunk`
  - `大致设计.md:361` HNSW index
  - Metis: Prisma + pgvector 映射
  Acceptance criteria:
  - `docker compose up -d postgres` starts pgvector Postgres.
  - `pnpm --filter api prisma:migrate` exits 0.
  - SQL checks pass:
    - `SELECT extname FROM pg_extension WHERE extname='vector';`
    - index `idx_agent_chunk_embedding_hnsw` exists.
  - Prisma client generation succeeds.
  - `embedding_job` table exists with status enum/check constraint and source relation/index; migration test can insert queued/process/rebuild job metadata without writing vectors through Prisma.
  QA scenarios:
  - SQL: run migration and index checks; save to `.omo/evidence/task-6-db.sql.txt`.
  Commit: Y | `feat(db): 🗄️ add pgvector schema and migrations` | `apps/api/prisma`, `apps/api/src/database`, compose

- [x] T7. 实现 sources CRUD、source preset API 和路径策略
  What to do / Must NOT do:
  - 实现 `SourcesModule`、controller/service/dto。
  - CRUD endpoints: `GET/POST/PATCH/DELETE /api/sources`。
  - 实现 source preset list endpoint 或把 preset metadata 暴露在 shared/web。
  - Preset 必须覆盖 Codex CLI、Claude Code、Pi Agent、OpenCode、Generic JSONL/JSON/Markdown；OpenCode 的 reader type 是 `sqlite`，其余默认 `file-glob`。
  - 实现 `PathPolicyService`：`~` 展开、绝对路径规范化、不存在路径错误、最大文件大小、最大文件数、symlink 默认不跟随。
  - 不扫描、不读取 message content，除非后续 scanner 调用。
  Parallelization: Can parallel Y | Wave 2 | Blocks T10/T11/T16
  References:
  - `大致设计.md:651` Sources API
  - `.omo/drafts/clisearch-system-plan.md:112` Agent CLI 支持矩阵
  - Metis: 路径访问与安全边界
  Acceptance criteria:
  - TDD: service/controller tests cover create/list/update/delete, preset defaults for codex/claude/pi/opencode/generic, invalid path, symlink policy.
  - API e2e validates DTO errors and HTTP status.
  QA scenarios:
  - HTTP: `curl -i -X POST /api/sources` with Demo source returns 201 and includes `parserType`; invalid root returns 400; save `.omo/evidence/task-7-sources.http`.
  Commit: Y | `feat(sources): 🗂️ add source presets and path policy` | sources module, shared types

- [x] T8. 实现 scan_job/history_file 查询与状态模型
  What to do / Must NOT do:
  - 实现 `ScanJobsModule` 和 `HistoryFile` service/query helpers。
  - `GET /api/scan-jobs?page=&pageSize=` 支持分页上限、source 关联字段、错误消息截断。
  - 定义 parse status：PENDING / PROCESSING / READY / FAILED 或等价清晰状态。
  Parallelization: Can parallel Y | Wave 2 | Blocks T10/T16/T18
  References:
  - `大致设计.md:318` `scan_job`
  - `大致设计.md:693` scan jobs API
  - Metis: 错误处理策略
  Acceptance criteria:
  - Unit/e2e tests cover empty list, pagination, invalid page/pageSize, failed job error truncation.
  QA scenarios:
  - HTTP: `curl -i /api/scan-jobs?page=1&pageSize=20` returns 200 with `records` and pagination metadata; save `.omo/evidence/task-8-scan-jobs.http`.
  Commit: Y | `feat(scan-jobs): 📋 expose scan job history` | scan-jobs/history-file modules

- [x] T9. 实现 fixture 和 parser 测试基座
  What to do / Must NOT do:
  - 添加 fixtures：
    - `sample-data/demo-agent/session-1.jsonl`
    - `sample-data/generic/session-1.json`
    - `sample-data/generic/session-1.md`
    - `sample-data/codex/session-1.jsonl`
    - `sample-data/claude/session-1.jsonl`
    - `sample-data/pi-agent/session-1.jsonl`
    - `sample-data/opencode/opencode.db` 或等价可重复生成的 sanitized SQLite fixture
  - Codex/Claude/Pi/OpenCode fixture 覆盖 cwd、thread id、user/assistant、tool/非文本 content、model、resume command。
  - 不使用真实个人历史正文；fixture 必须是脱敏合成数据。
  Parallelization: Can parallel Y | Wave 2 | Blocks T10/T11
  References:
  - `大致设计.md:1092` 示例数据
  - `.omo/drafts/clisearch-system-plan.md:46` Codex 抽样结构
  - `.omo/drafts/clisearch-system-plan.md:47` Claude 抽样结构
  - Metis: fixture 不足风险
  Acceptance criteria:
  - Fixtures parse as valid JSON/Markdown where applicable.
  - Shared/parser tests can load fixture files without needing `/root/.codex`、`/root/.claude`、`/root/.pi` 或 `~/.local/share/opencode`。
  QA scenarios:
  - Shell: run fixture validation script and save `.omo/evidence/task-9-fixtures.txt`.
  Commit: Y | `test(fixtures): 🧪 add parser and demo history samples` | `sample-data`, test helpers

- [x] T10. 实现七类 parser、source reader 与 ParserRegistry
  What to do / Must NOT do:
  - 实现 `AgentHistoryParser` interface、`ParsedSession`/`ParsedMessage` mapping、`ParserRegistry`。
  - Parser: `codex-jsonl`、`claude-jsonl`、`pi-jsonl`、`opencode-sqlite`、`generic-jsonl`、`generic-json`、`generic-markdown`。
  - Source reader: `file-glob` reader 与 `sqlite` reader；OpenCode parser 只能通过 read-only SQLite reader 读取。
  - 明确非文本 content 归一化、tool role、fallback thread id、empty content、invalid JSON 策略。
  - 不让 parser 直接写数据库。
  Parallelization: Can parallel N | Wave 2 | Blocks T11/T12
  References:
  - `大致设计.md:520` Parser 设计
  - `.omo/drafts/clisearch-system-plan.md:112` Agent CLI 支持矩阵
  - Metis: Parser topology gaps
  Acceptance criteria:
  - TDD first: each parser has fixture-based unit tests asserting session id、cwd、title、message seq、role、content、model、warnings/errors。
  - OpenCode SQLite fixture tests assert session/message/part or session_message extraction, and prove parser never writes the fixture DB.
  - Invalid generic JSONL line marks file parse failure in parser result or throws typed parse error, per plan.
  - `pnpm --filter api test -- parsers` exits 0.
  QA scenarios:
  - Shell: run parser tests and write `.omo/evidence/task-10-parser-tests.txt`.
  Commit: Y | `feat(parsers): 🧠 parse common agent histories` | parser modules, fixtures tests

- [x] T11. 实现 ScannerService、fingerprint、事务导入和手动扫描 API
  What to do / Must NOT do:
  - 实现 `ScannerService`：按 source reader 查文件或 SQLite 数据库、sha256 fingerprint、判断新增/变更、调用 parser、事务 upsert session/message/chunk placeholder。
  - OpenCode source fingerprint 默认组合 `opencode.db`、`opencode.db-wal`、`opencode.db-shm` 的 sha256；读取时使用 read-only SQLite reader 或临时快照，不写入原 DB。
  - 每个文件或 session 的重新导入必须事务化。
  - 实现 `POST /api/scan/run` 和 `POST /api/scan/run/:sourceId`。
  - 使用 source-level lock 防重复扫描。
  - 失败更新 `scan_job`、`history_file.parse_status/error_message`。
  Parallelization: Can parallel N | Wave 3 | Blocks T12/T13
  References:
  - `大致设计.md:452` 扫描流程
  - `大致设计.md:689` scan API
  - Metis: fingerprint、事务、并发控制
  Acceptance criteria:
  - Tests cover unchanged file skip, changed file reimport, parser failure, transaction rollback, duplicate scan prevention.
  - API e2e creates Demo/Codex/Claude/Pi/OpenCode source, runs scan, asserts sessions/messages imported.
  QA scenarios:
  - HTTP sequence: create source -> run scan -> list scan jobs -> query DB counts; save `.omo/evidence/task-11-scan.http`.
  Commit: Y | `feat(scanner): 🔍 import history files safely` | scanner modules, tests

- [x] T12. 实现 ScannerScheduler 定时扫描
  What to do / Must NOT do:
  - 使用 `@nestjs/schedule` 实现全局 interval 轮询 enabled sources，根据 `last_scan_at + scan_interval_seconds` 判断到期。
  - Scheduler 调用同一 ScannerService path，复用 lock，避免与手动扫描重复。
  - 增加配置：`SCAN_SCHEDULER_ENABLED`、`SCAN_INTERVAL_SECONDS` 或等价。
  Parallelization: Can parallel N | Wave 3 | Blocks T13
  References:
  - `大致设计.md:177` 定时扫描历史源
  - `大致设计.md:219` `scan_interval_seconds`
  - `.omo/drafts/clisearch-system-plan.md:89` schedule 事实
  - Metis: 定时扫描缺失
  Acceptance criteria:
  - Tests with fake timers cover due/not-due source, disabled source, lock busy.
  - E2E can configure short interval, wait/trigger scheduler, observe new scan_job.
  QA scenarios:
  - Shell/API: start API with scheduler enabled and short interval, capture scan_job created by scheduler to `.omo/evidence/task-12-scheduler.txt`.
  Commit: Y | `feat(scanner): ⏱️ schedule recurring source scans` | scheduler modules, tests

- [x] T13. 实现 ChunkerService 与 chunk 写入
  What to do / Must NOT do:
  - 实现 chunker 策略：3-8 messages、500-1200 中文字目标、1-2 overlap、优先 user message、保留 Agent/CWD/Thread header。
  - Scanner 导入 message 后生成 `agent_chunk`，状态 PENDING。
  - 对重导入 session 删除旧 chunk 并重新生成，事务内完成。
  Parallelization: Can parallel N | Wave 3 | Blocks T14/T15
  References:
  - `大致设计.md:604` Chunk 切分规则
  - `大致设计.md:624` chunk_text 模板
  - Metis: Chunker topology gaps
  Acceptance criteria:
  - Unit tests cover short session、long message、overlap、empty message、starts from user where possible。
  - Scan e2e asserts chunks created with correct `startMessageSeq/endMessageSeq` and PENDING status.
  QA scenarios:
  - SQL/API: after scan, query chunk count and sample text header; save `.omo/evidence/task-13-chunks.txt`.
  Commit: Y | `feat(chunks): 🧱 build semantic message chunks` | chunks module, scanner integration

- [x] T14. 实现 mock embedding provider、worker 和 process/rebuild API
  What to do / Must NOT do:
  - 实现 `EmbeddingProvider` interface 与 deterministic `MockEmbeddingProvider` dimension 1024。
  - 实现 embedding worker/service：batch size、PROCESSING、READY、FAILED、retry_count、error_message。
  - 每次 `process`/`rebuild` 创建并更新 `embedding_job`：QUEUED -> RUNNING -> COMPLETED/FAILED；job 记录 source scope、processed/failed counts、错误摘要和时间戳。Chunk 级状态仍保存在 `agent_chunk.embedding_status`，job 级状态用于审计一次批处理。
  - 使用 row lock 或等价机制防重复处理。
  - 启动时校验 provider dimension、env dimension、DB vector dimension。
  - API: `POST /api/embeddings/process`、`POST /api/embeddings/rebuild`，支持 optional sourceId。
  - Ollama/OpenAI/http 只留接口/README 占位，不实现真实调用。
  Parallelization: Can parallel Y | Wave 3 | Blocks T15/T17
  References:
  - `大致设计.md:370` Embedding 方案
  - `大致设计.md:705` embeddings API
  - Metis: embedding concurrency/dimension/rebuild gaps
  Acceptance criteria:
  - Unit tests cover deterministic vector, dimension mismatch, FAILED retry, rebuild by source, job state transition, and job count updates.
  - API e2e process pending chunks and asserts READY with embedding not null plus one COMPLETED `embedding_job` with processed count > 0.
  - Rebuild e2e by source resets target chunks to PENDING, creates a rebuild `embedding_job`, then processes them back to READY without changing other sources.
  QA scenarios:
  - HTTP: `POST /api/embeddings/process`, SQL count READY chunks and inspect latest `embedding_job`; save `.omo/evidence/task-14-embedding.http`.
  Commit: Y | `feat(embeddings): 🧬 process mock vectors reliably` | embeddings module, tests

- [x] T15. 实现 pgvector semantic search、session 聚合和 session detail API
  What to do / Must NOT do:
  - 实现 `SearchService` raw SQL cosine query using `<=>` and `LIMIT`。
  - 过滤：READY only、agentName、cwdKeyword。
  - 聚合：chunk -> session，score max，matchedChunks top 3，排序稳定。
  - API: `POST /api/search/semantic`，`GET /api/sessions/:id`。
  - 空结果返回 200 records []。
  Parallelization: Can parallel N | Wave 3 | Blocks T16/T17
  References:
  - `大致设计.md:496` 搜索流程
  - `大致设计.md:725` semantic search API
  - `大致设计.md:768` sessions detail API
  - `大致设计.md:807` vector SQL
  - Metis: route prefix/search topology gaps
  Acceptance criteria:
  - Unit tests cover aggregation sorting and empty READY case.
  - API e2e seed/scan/process then search “之前修过登录接口 500 的那次”; topN contains thread `abc123`; matched chunk contains “登录接口返回 500”。
  - `GET /api/sessions/:id` returns full messages and resume command.
  QA scenarios:
  - HTTP: full curl sequence create source -> scan -> process -> search -> session detail; save `.omo/evidence/task-15-search.http`.
  Commit: Y | `feat(search): 🔎 query pgvector sessions semantically` | search/sessions modules, tests

- [x] T16. 实现 `/sources` 前端：preset、CRUD、手动扫描
  What to do / Must NOT do:
  - 实现 sources table、create/edit/delete form、preset select。
  - Selecting Codex/Claude/Pi/OpenCode fills rootPath/fileGlob/resumeTemplate/parserType/sourcePreset/readerType.
  - 表单校验 invalid path/api error 显示清楚。
  - 每行提供 manual scan action，展示最近扫描状态。
  Parallelization: Can parallel Y | Wave 4 | Blocks T17/T18/T20
  References:
  - `大致设计.md:971` 历史源配置页
  - `.omo/drafts/clisearch-system-plan.md:112` Agent CLI 支持矩阵
  - Metis: 一等 preset UI 定义
  Acceptance criteria:
  - Component tests cover preset autofill and validation.
  - Playwright creates Demo Generic JSONL source from `sample-data/demo-agent`, triggers scan, sees success state.
  QA scenarios:
  - Browser desktop: `/sources` create source, scan source, status changes; screenshot `.omo/evidence/task-16-sources.png`.
  Commit: Y | `feat(web): 🗃️ manage history sources` | web sources page/components

- [x] T17. 实现 `/search` 前端：语义搜索、过滤、结果卡片、resume 复制
  What to do / Must NOT do:
  - SearchBox、FilterPanel、SearchResultCard、ResumeCommandBox。
  - 支持 query、agentName、cwdKeyword、topK/sessionLimit 默认。
  - 展示 title、score、matched chunks、agentName、cwd、threadId、resumeCommand。
  - Copy resume command 使用 Clipboard API，有失败 fallback；不执行命令。
  Parallelization: Can parallel Y | Wave 4 | Blocks T20
  References:
  - `大致设计.md:895` 搜索页
  - `大致设计.md:725` search response
  - Metis: 前端 QA 场景
  Acceptance criteria:
  - Component tests cover search success, empty state, API error, copy command.
  - Playwright after seeded backend searches “之前修过登录接口 500 的那次” and sees thread `abc123`, cwd, resume command.
  QA scenarios:
  - Browser desktop+mobile: search, verify result, copy command, assert clipboard text equals expected shell-quoted command; screenshots `.omo/evidence/task-17-search-desktop.png` and `.omo/evidence/task-17-search-mobile.png`.
  Commit: Y | `feat(web): 🔍 build semantic search experience` | web search components/page

- [x] T18. 实现 `/scan-jobs` 前端
  What to do / Must NOT do:
  - 展示 scan job table：status、source、startedAt、endedAt、filesSeen、filesChanged、sessionsImported、messagesImported、chunksCreated、errorMessage。
  - 支持分页、loading、empty、error state。
  - 错误消息截断显示，保留详情 tooltip/modal 不暴露完整正文。
  Parallelization: Can parallel Y | Wave 4 | Blocks T20
  References:
  - `大致设计.md:1000` 扫描任务页
  - `大致设计.md:693` scan jobs API
  Acceptance criteria:
  - Component tests cover empty/error/success rows.
  - Playwright shows a scan job after manual scan.
  QA scenarios:
  - Browser: `/scan-jobs` after scan shows completed row and counts; screenshot `.omo/evidence/task-18-scan-jobs.png`.
  Commit: Y | `feat(web): 📊 show scan job history` | web scan-jobs page

- [x] T19. 实现 `/sessions/[id]` 前端详情页和消息气泡
  What to do / Must NOT do:
  - 左侧聊天消息，右侧元信息：Agent、Thread ID、CWD、Resume Command、消息数量、更新时间。
  - MessageBubble 按 user/assistant/tool/system/unknown role 渲染。
  - 支持从搜索结果跳转到详情；可复制 resume command。
  Parallelization: Can parallel Y | Wave 4 | Blocks T20
  References:
  - `大致设计.md:944` 会话详情页
  - `大致设计.md:768` sessions API
  Acceptance criteria:
  - Component tests cover role rendering and copy.
  - Playwright opens detail from search result and verifies messages/resume visible.
  QA scenarios:
  - Browser: search -> click detail -> assert user/assistant messages and metadata; screenshot `.omo/evidence/task-19-session-detail.png`.
  Commit: Y | `feat(web): 💬 render full session details` | web sessions page/components

- [x] T20. Docker/dev workflow、README 完整化和端到端演示收口
  What to do / Must NOT do:
  - 完成 Dockerfiles/compose for postgres/api/web。
  - 明确两种运行模式：
    - 本机 dev：`pnpm dev`，API 可读宿主 `~/.codex` / `~/.claude` / `~/.pi` / `~/.local/share/opencode`。
    - Docker demo：只读挂载 `./sample-data:/sample-data:ro`，可选 `CODEX_HISTORY_HOST_PATH` / `CLAUDE_HISTORY_HOST_PATH` / `PI_HISTORY_HOST_PATH` / `OPENCODE_HISTORY_HOST_PATH` bind mount 到容器只读路径。
  - README 包含从冷启动到搜索 demo 的完整命令。
  - `.env.example` 覆盖 API/Web/Postgres/embedding/scanner/path limits。
  - 端口冲突时说明如何覆盖端口。
  Parallelization: Can parallel N | Wave 4 | Blocks final verification
  References:
  - `大致设计.md:1027` Docker Compose
  - `大致设计.md:1072` 环境变量
  - Metis: Docker 与宿主历史目录访问、README 风险
  Acceptance criteria:
  - Fresh checkout flow documented and runnable.
  - `docker compose up -d postgres` works; full app can run via pnpm dev or compose profile as implemented.
  - README includes Codex/Claude/Pi/OpenCode preset support and unsupported CLI policy.
  QA scenarios:
  - Shell/browser/API: follow README cold-start path, save transcript `.omo/evidence/task-20-readme-smoke.txt`.
  Commit: Y | `docs(app): 📝 document startup and demo workflow` | README, Dockerfiles, env docs

## Final verification wave (after ALL todos)
> Runs in parallel. ALL must APPROVE. Execute all verification without asking the user for extra confirmation, then report the evidence paths, pass/fail status, and residual risks before declaring the work complete.

- [x] F1. Plan compliance audit
  - Verify every Must have item has implementation evidence.
  - Verify Codex/Claude/Pi/OpenCode/generic parser support has fixtures, tests, e2e scan, and frontend preset behavior.
  - Evidence: `.omo/evidence/f1-plan-compliance.md`

- [x] F2. Code quality review
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`.
  - Run LSP diagnostics on changed TS/TSX files.
  - Verify no `as any`, no `@ts-ignore`, no skipped tests, no local git identity.
  - Evidence: `.omo/evidence/f2-code-quality.txt`

- [x] F3. Real manual QA
  - Start Postgres/API/Web.
  - API curl sequence:
    1. `GET /api/health` -> 200
    2. `POST /api/sources` Demo source -> 201
    3. `POST /api/scan/run/:sourceId` -> 201/202 and scan job id
    4. `POST /api/embeddings/process` -> processed chunks > 0
    5. `POST /api/search/semantic` with “之前修过登录接口 500 的那次” -> records includes thread `abc123`
    6. `GET /api/sessions/:id` -> messages and shell-quoted resume command
  - Browser Playwright:
    - Desktop `/search`, `/sources`, `/scan-jobs`, `/sessions/[id]`
    - Mobile `/search`
    - Clipboard assertion for resume command
  - Evidence: `.omo/evidence/f3-api.http`, `.omo/evidence/f3-web-desktop.png`, `.omo/evidence/f3-web-mobile.png`

- [x] F4. Scope fidelity
  - Confirm no real OpenAI/Ollama/BGE provider was implemented beyond interface/config placeholders.
  - Confirm unsupported CLIs are documented as future/generic import only.
  - Confirm resume command is never executed.
  - Confirm logs/errors truncate content and README warns local privacy limits.
  - Evidence: `.omo/evidence/f4-scope-fidelity.md`

## Commit strategy
- Default: do not commit unless the user explicitly starts work with commit permission.
- If committing during execution, use atomic commits per todo or tightly coupled todo group.
- Commit message format must follow user rule: `<type>(<scope>): <gitmoji> <subject>`.
- Every commit body must include:
  ```
  Co-authored-by: Wine Fox <fox@ling.plus>
  Plan: .omo/plans/clisearch-system-plan.md
  ```
- Do not set local git config for identity. Use global config only.
- Do not stage `AgentLogs/` or `.omo/evidence/` unless the user explicitly asks.
- Before any commit, inspect `git status --short`, `git diff --stat`, and staged diff to avoid unrelated changes.

## Success criteria
- A fresh local run can scan demo data, process mock embeddings, search “之前修过登录接口 500 的那次”, show the matched session, open full detail, and copy a safe resume command.
- Codex CLI、Claude Code、Pi Agent and OpenCode are available as first-class source presets with parser-specific tests and fixtures.
- Generic JSONL/JSON/Markdown import works with documented fallback/error behavior.
- Manual and scheduled scans both produce scan jobs and do not duplicate imports under concurrent triggers.
- PostgreSQL has pgvector extension and HNSW index; vector search uses `<=>` and filters READY chunks.
- `mock-1024` embedding is deterministic and stable for demo QA.
- All planned commands pass: lint, typecheck, unit tests, e2e tests, build, Playwright, API curl QA.
- README documents startup, demo flow, local privacy, Docker vs host history access, supported/unsupported CLIs, and troubleshooting.
- No final claim is made until F1-F4 all pass with evidence files recorded.
