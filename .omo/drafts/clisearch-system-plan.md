# AgentLogSearch 系统开发规划草稿

status: approved
pending_action: run Metis gap analysis, then write .omo/plans/clisearch-system-plan.md
plan_slug: clisearch-system-plan
mode: ulw-plan
created_at: 2026-06-16
approved_at: 2026-06-16

## 用户目标

根据当前目录中的大致设计文档，规划开发 AgentLogSearch 系统。

补充约束：
- Git remote 已由主人指定为 `git@github.com:Lynricsy/AgentLogSearch.git`。
- 本轮是规划模式，只写 `.omo/drafts` 草稿；审批后才写 `.omo/plans/clisearch-system-plan.md`，不实施业务代码。
- 主人已批准写最终计划；测试策略按默认采用 `TDD + e2e + 浏览器 QA`。
- 主人询问首轮支持哪些 Agent CLI；最终计划必须明确首轮支持矩阵。
- 主人后续要求首轮追加 Pi Agent 与 OpenCode，因为二者常用且实现难度不高。

## 分级

Architecture / HEAVY。

依据：
- 目标是从设计文档规划一个完整系统，而不是单点改动。
- 设计文档覆盖前端、后端、数据库、向量检索、扫描任务、解析器、embedding worker、Docker Compose 和演示数据。
- 当前目录没有现成应用代码，执行计划需要从零建立 monorepo、工程脚手架、数据库迁移、API、UI 和端到端验收链路。
- 用户明确使用 `$omo:ulw-plan`，必须走探索、审批、Metis、计划文件生成流程。

更高风险事实检查：
- 未发现用户要求本轮直接实现系统。
- 未发现必须接入真实 OpenAI/Ollama 密钥才能完成首轮可演示闭环，设计文档明确建议先用 mock provider。
- 未发现现有业务代码需要迁移或保留。

## 探索证据

### 仓库状态

- 工作目录：`/root/Projects/Cources/ComprehensiveProject/CliSearch`
- 初始状态只有规格文档和 `.gitignore`，无 `package.json`、`apps/`、`packages/`、`src/`、测试配置或 CI。
- 已按主人要求初始化 Git 仓库并设置远端：
  - `git remote get-url origin` -> `git@github.com:Lynricsy/AgentLogSearch.git`
  - 当前分支：`main`
  - 当前未提交文件：`.gitignore`、`大致设计.md`
- `.gitignore` 当前只忽略 `AgentLogs/`，任务日志不纳入普通版本控制。
- 本机存在 Codex CLI 历史目录：`/root/.codex/sessions/**/*.jsonl`。抽样结构显示顶层字段为 `type`、`timestamp`、`payload`；`session_meta.payload` 包含 `id`、`cwd`，`response_item.payload` 包含 `role`、`content`、`type`。
- 本机存在 Claude Code 历史目录：`/root/.claude/projects/**/*.jsonl`。抽样结构显示顶层字段包含 `sessionId`、`cwd`、`timestamp`、`type`、`message`；`message` 包含 `role`、`content`、`model` 等。
- 本机存在 Pi Agent 历史目录：`/root/.pi/agent/sessions/**/*.jsonl`。抽样结构显示首行 `type=session`，包含 `id/cwd/timestamp/version`；消息行 `type=message`，包含 `message.role/content/timestamp`；本地 `pi --help` 显示支持 `--resume`、`--session <path|id>`、`--session-dir <dir>` 与 `--export`。
- 本机存在 OpenCode 历史数据库：`/root/.local/share/opencode/opencode.db`。SQLite schema 含 `session`、`message`、`part`、`session_message` 表；本地 `opencode --help` 显示支持 `opencode --session <sessionId>`、`opencode session list`、`opencode export [sessionID] --sanitize`。
- 本机存在 Cursor 配置/终端记录目录，但当前只确认到 `/root/.cursor/projects/**/terminals/*.txt` 等终端文本和技能文件，没有足够证据把 Cursor Chat/Cursor Agent 历史格式作为首轮一等 preset。

### 设计文档事实

主要输入文件：`大致设计.md`

关键定位：
- `大致设计.md:5` 项目一句话：Next.js + Tailwind CSS + HeroUI + NestJS + PostgreSQL/pgvector 的 Agent CLI 对话历史语义检索系统。
- `大致设计.md:13` 技术栈：Next.js App Router、TypeScript、Tailwind CSS、HeroUI、NestJS、PostgreSQL、pgvector、Prisma 或 TypeORM、node-postgres、@nestjs/schedule。
- `大致设计.md:47` 建议 monorepo：`apps/web`、`apps/api`、`packages/shared`。
- `大致设计.md:171` 必做功能：历史源配置、手动/定时扫描、JSONL/JSON/Markdown 解析、session/message/cwd/threadId、chunk、embedding、pgvector 搜索、session 聚合、完整会话、resume 命令、扫描任务。
- `大致设计.md:201` 数据库设计开始。
- `大致设计.md:211` `agent_source`
- `大致设计.md:236` `history_file`
- `大致设计.md:255` `agent_session`
- `大致设计.md:277` `agent_message`
- `大致设计.md:293` `agent_chunk`
- `大致设计.md:318` `scan_job`
- `大致设计.md:336` `embedding_job`
- `大致设计.md:361` HNSW vector index。
- `大致设计.md:370` Embedding provider 策略：mock -> ollama -> openai/http。
- `大致设计.md:452` 后端扫描、向量化、搜索核心流程。
- `大致设计.md:520` Parser 接口和 JSONL/JSON/Markdown 规则。
- `大致设计.md:604` Chunk 切分规则。
- `大致设计.md:651` API 设计。
- `大致设计.md:725` `POST /api/search/semantic`
- `大致设计.md:768` `GET /api/sessions/:id`
- `大致设计.md:861` Resume 命令生成，且只复制不执行。
- `大致设计.md:885` 前端页面设计。
- `大致设计.md:1027` Docker Compose。
- `大致设计.md:1072` 环境变量。
- `大致设计.md:1092` 示例数据与搜索验收句。
- `大致设计.md:1114` 六阶段开发任务拆分。

### 外部技术事实

用于规划约束的官方文档事实：
- Next.js App Router 使用 `app` 目录文件路由，根布局必须有 `app/layout.tsx` 并包含 `html` / `body`，页面由 `page.tsx` 定义。
- Next.js 需要将交互式组件标记为 client component，例如搜索表单、复制按钮、过滤控件。
- NestJS REST API 按 controller/service/module 组织，CRUD 端点使用 `@Controller`、`@Get`、`@Post`、`@Patch`、`@Delete` 等装饰器。
- NestJS 测试可使用 `@nestjs/testing` 组装 TestingModule；计划中的 controller/service 单测应走这个 seam。
- `@nestjs/schedule` 支持 interval/cron 风格任务，适合扫描和 embedding worker。
- Prisma 可负责普通 CRUD 与 migration，但 pgvector 扩展类型和向量 SQL 需要 raw SQL / node-postgres 配合，避免把向量查询硬塞进 Prisma CRUD。
- HeroUI 需要在 Next 根布局中包裹 `HeroUIProvider`，Tailwind content/plugin 需要覆盖 HeroUI 包路径。
- Tailwind CSS 最新 Next 集成使用 `@tailwindcss/postcss` 和 `globals.css` 中的 Tailwind import。
- Codex CLI 当前本地帮助和 Codex manual 都显示支持 `codex resume <SESSION_ID>`，session 文件在 `~/.codex/sessions`。
- Claude Code 当前本地帮助显示支持 `claude --resume [value]`，可用 session id 恢复会话。
- Pi Agent 当前本地帮助显示支持 `pi --resume`、`pi --session <path|id>` 和 `pi --session-dir <dir>`，可从 session JSONL 恢复。
- OpenCode 当前本地帮助显示支持 `opencode --session <sessionId>` 继续会话，也支持 `opencode export [sessionID]` 导出 JSON。

## 决策草案

### 技术路线

- 使用 pnpm workspace 管理 monorepo。
- 目录采用设计文档建议：
  - `apps/web`：Next.js App Router + TypeScript + Tailwind CSS + HeroUI。
  - `apps/api`：NestJS + TypeScript。
  - `packages/shared`：共享 DTO/type/schema。
- 数据库使用 PostgreSQL + pgvector，开发环境通过 `docker-compose.yml` 启动 `pgvector/pgvector:pg17`。
- 数据访问策略：
  - Prisma 管普通表、迁移和常规 CRUD。
  - `pg` 原生客户端执行 pgvector 查询、HNSW 索引相关 SQL 和需要 vector cast 的查询。
- 首轮 embedding provider 默认实现 `mock-1024`，确保无需外部服务即可完成端到端演示。
- Ollama/OpenAI/http provider 作为后续扩展任务，不阻塞 MVP。

### Agent CLI 支持矩阵

首轮一等支持：

1. Codex CLI
   - source preset：`codex`
   - 默认 root path：`~/.codex/sessions`
   - 默认 file glob：`**/*.jsonl`
   - parser：`codex-jsonl`
   - thread id：`session_meta.payload.id`
   - cwd：`session_meta.payload.cwd`
   - message：`response_item.payload.role/content`
   - resume template：`cd "{cwd}" && codex resume "{threadId}"`
   - 理由：本机存在真实历史文件；Codex manual 与本地 CLI 帮助都确认 sessions 路径和 resume 命令。

2. Claude Code
   - source preset：`claude-code`
   - 默认 root path：`~/.claude/projects`
   - 默认 file glob：`**/*.jsonl`
   - parser：`claude-jsonl`
   - thread id：顶层 `sessionId`
   - cwd：顶层 `cwd`
   - message：顶层 `message.role/content/model`
   - resume template：`cd "{cwd}" && claude --resume "{threadId}"`
   - 理由：本机存在真实历史文件；本地 CLI 帮助确认 `--resume` 支持。

3. Pi Agent
   - source preset：`pi-agent`
   - 默认 root path：`~/.pi/agent/sessions`
   - 默认 file glob：`**/*.jsonl`
   - parser：`pi-jsonl`
   - thread id：`type=session` 行的 `id`，fallback 为文件名 UUID 部分
   - cwd：`type=session` 行的 `cwd`
   - message：`type=message` 行的 `message.role/content/timestamp`
   - resume template：`cd "{cwd}" && pi --session "{threadId}"`
   - 理由：本机存在真实历史文件；本地 CLI 帮助确认 `--session` 与 `--resume`。

4. OpenCode
   - source preset：`opencode`
   - 默认 root path：`~/.local/share/opencode`
   - 默认 file glob：`opencode.db`
   - parser：`opencode-sqlite`
   - thread id：`session.id`
   - cwd：`session.directory`
   - message：优先从 `session_message.data` 或 `message.data` + `part.data` 归一化 `role/content`
   - resume template：`cd "{cwd}" && opencode --session "{threadId}"`
   - 理由：本机存在真实 SQLite 历史数据库；本地 CLI 帮助确认 `--session` 和 `export`。

首轮通用兼容：

5. Generic JSONL
   - parser：`generic-jsonl`
   - 支持设计文档示例字段：`threadId`、`cwd`、`role`、`content`、`createdAt`
   - 用于 Demo Agent、课程示例数据和可导出的简单 Agent 历史。

6. Generic JSON
   - parser：`generic-json`
   - 支持设计文档示例字段：`threadId`、`cwd`、`title`、`model`、`messages[]`

7. Generic Markdown
   - parser：`generic-markdown`
   - 支持 frontmatter 中的 `threadId/cwd/title`，用 `## User` / `## Assistant` 分段。

暂不作为首轮一等 preset：
- Cursor / Cursor Agent：本机只确认到终端文本和工具配置，没有稳定聊天历史格式证据。
- Gemini CLI / Qwen Code / Aider / Continue / Goose / Roo/Kilo 等：未在当前环境发现稳定历史目录和可验证字段；可通过 generic parser 导入，后续拿到样例后再加 preset。

架构要求：
- `agent_source.type` 不直接等同文件格式，而应支持 source preset / parser type / reader type 分层，例如 `codex-jsonl`、`claude-jsonl`、`pi-jsonl`、`opencode-sqlite`、`generic-jsonl`、`generic-json`、`generic-markdown`；OpenCode 需要 `sqlite` reader，其余首轮 preset 默认 `file-glob` reader。
- scanner 需要支持两类 source reader：文件 glob reader 与 SQLite reader；OpenCode 使用 SQLite reader，其余首轮 preset 使用文件 glob reader。
- 前端新增 source 时提供 preset 快捷选择，同时保留自定义 rootPath、fileGlob、resumeTemplate 和 parserType。
- 每个一等 preset 必须有 fixture、parser 单测、扫描 e2e 和 resume command 断言。

### 实施波次草案

1. 工程与质量底座：
   - 初始化 pnpm workspace、Next、Nest、shared 包、TypeScript/ESLint/格式化、README、env 示例、Docker Compose。
   - 建立 Git 首次提交策略，但执行阶段才提交。

2. 数据库与后端基础：
   - Prisma schema + raw SQL migration 创建 pgvector 扩展、表、索引。
   - Nest 配置、PrismaService、PgService、健康检查、sources CRUD、scan-jobs 查询。

3. Parser 与扫描闭环：
   - Parser 接口、Codex/Claude/Pi/OpenCode/Generic parser、source reader、fingerprint、scanner service、手动扫描 API、scan_job 记录。
   - 基于 `sample-data/demo-agent/session-1.jsonl` 建立可复现扫描验收。

4. Chunk 与 embedding：
   - ChunkerService、agent_chunk 写入、MockEmbeddingProvider、EmbeddingWorker、embedding process/rebuild API。
   - 明确状态流转：PENDING -> PROCESSING -> READY / FAILED。

5. 语义搜索 API：
   - query embedding、pgvector cosine 查询、过滤条件、chunk -> session 聚合、`POST /api/search/semantic`。
   - 用“之前修过登录接口 500 的那次”作为端到端验收句。

6. 前端可用体验：
   - AppShell、搜索页、结果卡片、会话详情、sources、scan-jobs、复制 resume 命令。
   - 搜索页作为第一屏，不做营销页。

7. 最终演示与收口：
   - README 完整启动流程、示例数据、常见问题。
   - 通过 docker compose + API curl + 浏览器 Playwright 完成手动 QA。

### 范围边界

必须包含：
- 设计文档中的所有“必做功能”。
- mock embedding 全流程。
- 示例数据导入、扫描、embedding、搜索、详情、resume 复制。
- Agent 执行级验证命令和真实界面 QA。

首轮不强制包含：
- OpenAI 真实 provider。
- BGE-M3 Python embedding service。
- 复杂权限/登录。
- 生产级部署平台。
- 混合搜索、敏感信息脱敏、多 provider UI 切换、命中消息定位、重新生成单个 chunk embedding；这些可列为加分任务或后续 todo，除非主人要求纳入首轮。

硬性安全边界：
- 只生成和复制 resume command，不在后端或前端执行本地 shell 命令。
- root_path/file_glob 扫描只读文件，不改写历史源。
- 避免在日志、错误和 UI 中泄漏 embedding provider 密钥。

## 测试与 QA 建议

已批准默认：TDD + 端到端手动 QA。

原因：
- Parser、chunker、resume command、search 聚合、embedding 状态流转都有明确可测试 seam，未来回归风险高。
- 数据库和 pgvector 查询需要 integration/e2e 证明，不适合只靠 mock。
- 前端搜索、复制、详情跳转必须用浏览器真实驱动验证。

计划中的验证策略：
- 单元测试：parser、chunker、resume command、provider mock、聚合函数。
- API/e2e 测试：sources CRUD、scan run、embedding process、search semantic、session detail。
- 数据库验证：Docker Postgres + pgvector extension + migration + HNSW index 存在性。
- 手动 QA：
  - `curl -i` 命中后端 API。
  - Playwright 浏览器访问 `apps/web`，完成 source 配置、扫描、搜索、详情、复制 resume 命令。
  - 证据写入 `.omo/evidence/`。

## 待审批问题

已通过主人批准采用默认测试策略。已补充主人追问的 Agent CLI 支持范围。

无阻塞问题。

## 审批门

主人已批准。下一步执行以下动作：

1. 运行 Metis gap analysis。
2. 写入 `.omo/plans/clisearch-system-plan.md`。

写完计划后仍然不会实现业务代码；会询问主人是“现在开始执行”还是“先运行高精度 Momus 计划审查”。
