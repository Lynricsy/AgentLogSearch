# AgentLogSearch Evidence Edition
## 下一阶段开发实施说明书（可直接执行版）

- 文档版本：1.0
- 基线：`PROJECT_ANALYSIS.md` 所描述的 2026-06-23 工作树
- 目标读者：后端、前端、测试开发者
- 技术边界：允许 embedding / reranker 等非生成式语义模型；禁止依赖 LLM、聊天补全或文本生成模型
- 核心目标：把“搜索相似会话”升级为“检索可追溯的历史工程操作，并区分成功、失败和未验证状态”
- 本文中的“成功”仅指日志中存在明确的测试、构建、类型检查等验证证据，不代表系统推断出了真实根因

---

# 0. 开发者先读：这次到底要交付什么

本阶段不开发新的 Coding Agent，也不让系统自动修代码。系统只完成以下闭环：

```text
Agent 原始历史
  -> 保留工具调用与工具结果
  -> 提取命令、退出码、测试摘要、错误、文件和 patch
  -> 按用户任务切成 episode
  -> 按“修改 -> 验证”切成 attempt
  -> 生成模板化经验记录
  -> embedding + 结构化字段混合检索
  -> 分开展示成功操作、失败尝试和未验证记录
  -> 所有结论都能跳回原始证据
```

## 0.1 MVP 必须完成的演示

准备一段真实或脱敏日志，内容至少包含：

```text
用户提出任务
  -> 执行测试，失败
  -> 修改文件 A
  -> 再次测试，失败
  -> 修改文件 B
  -> 再次测试，通过
```

系统扫描后必须展示：

```text
任务：原用户请求
历史结果：成功（存在验证证据）
尝试 1：修改文件 A -> 验证失败
尝试 2：修改文件 B -> 验证成功
错误：提取出的错误代码/错误类型
涉及文件：A、B
证据等级：A/B/C/D
原始证据：每个结论对应的 tool call/result
```

搜索同类问题时：

1. 这条经验应进入前 3。
2. 失败尝试应在独立区域出现。
3. 未发现验证结果的记录不能显示为成功。
4. 数据库与 API 响应中不能出现 fixture 中植入的测试密钥。
5. 原有会话搜索、扫描、会话详情不能回归失败。

## 0.2 MVP 首批支持范围

先做深，不要同时支持所有生态。

首批必须支持：

- Codex JSONL
- Claude Code JSONL
- shell/terminal 类工具调用
- `apply_patch`、`write_file`、`edit_file` 类文件修改
- Jest
- Vitest
- 通用 exit code
- JavaScript/TypeScript 常见错误
- 文件路径与 Git diff/apply_patch 格式
- Experience API
- Experience Web UI

第二批再支持：

- Pi Agent
- OpenCode SQLite
- Pytest、Go test、Cargo test
- 当前仓库兼容性
- Tree-sitter 符号索引
- MCP

## 0.3 明确不做

本阶段禁止出现以下逻辑：

- 根据 assistant 自述判断“已经修好”
- 自动生成“根因”“最佳解决方案”“推荐修改”
- 自动执行历史命令
- 自动应用历史 patch
- 自动修改 Git 工作区
- 使用 LLM 总结会话
- 将完整工具输出、完整文件正文或完整 patch 持久化
- 用 embedding 分数判断某个操作是否成功

---

# 1. 改造策略：保留现有主链路，新增旁路

当前已有链路：

```text
source
  -> reader
  -> parser
  -> parsed session/message
  -> scanner importer
  -> agent_session / agent_message / agent_chunk
  -> embedding
  -> semantic search
  -> Web
```

不要替换这条链路。新增旁路：

```text
parser
  -> parsed trace event
  -> tool exchange assembler
  -> evidence pipeline
  -> agent_trace_event
  -> experience worker
  -> agent_experience / agent_attempt
  -> experience search
  -> Web
```

原有 `agent_message` 继续用于会话详情，`agent_chunk` 继续用于旧版语义搜索。新表只承担工程证据与经验检索。

---

# 2. 开发顺序与合并策略

按以下顺序开发，不允许跳过基础阶段直接做 UI。

| 里程碑 | 内容 | 可独立验收 |
|---|---|---|
| M0 | 开关、版本常量、fixture 清点 | 是 |
| M1 | 数据库迁移和 shared 契约 | 是 |
| M2 | Codex/Claude 工具调用与结果解析 | 是 |
| M3 | Evidence 提取和持久化 | 是 |
| M4 | Episode/Attempt/Experience 构建 | 是 |
| M5 | Experience 混合搜索 API | 是 |
| M6 | 前端经验页和证据详情 | 是，形成 MVP |
| M7 | Pi/OpenCode 和更多测试框架 | 是 |
| M8 | 仓库状态与 Tree-sitter | 是 |
| M9 | MCP 只读工具 | 是 |

推荐每个里程碑一个 PR。每个 PR 必须包含测试，不能先合“空接口”再补实现。

---

# 3. M0：基线、开关和 fixture 清点

## 3.1 新增环境开关

在 API 配置层增加：

```env
EVIDENCE_PIPELINE_ENABLED=false
EXPERIENCE_WORKER_ENABLED=false
EXPERIENCE_SEARCH_ENABLED=false
REPOSITORY_COMPATIBILITY_ENABLED=false

EVIDENCE_MAX_TOOL_OUTPUT_CHARS=2000000
EVIDENCE_MAX_EXCERPT_CHARS=2000
EVIDENCE_MAX_ERRORS_PER_EVENT=20
EVIDENCE_MAX_PATHS_PER_EVENT=100

EXPERIENCE_WORKER_INTERVAL_MS=3000
EXPERIENCE_WORKER_BATCH_SIZE=8
EXPERIENCE_WORKER_STALE_PROCESSING_MS=900000
```

默认全部关闭，单元测试按测试用例显式开启。Docker demo 在 M6 完成后再开启前三项。

新增文件：

```text
apps/api/src/evidence/evidence.config.ts
apps/api/src/experiences/experience.config.ts
```

配置解析要求：

- 数值必须限定上下界。
- 非法值启动时直接报配置错误。
- 测试环境默认关闭 worker，避免测试进程残留计时器。

## 3.2 增加版本常量

新增：

```text
apps/api/src/pipeline-versions.ts
```

内容：

```ts
export const TRACE_PARSER_VERSION = "trace-v1";
export const EVIDENCE_EXTRACTOR_VERSION = "evidence-v1";
export const EXPERIENCE_BUILDER_VERSION = "experience-v1";
export const EXPERIENCE_SEARCH_DOCUMENT_VERSION = "experience-search-v1";
```

以后任何解析规则变更都必须提升对应版本。禁止只改代码不改版本，否则未变化历史文件会被错误跳过。

## 3.3 先清点真实 fixture 结构

新增脚本：

```text
apps/api/scripts/inspect-agent-fixtures.ts
```

脚本只输出结构，不输出敏感正文：

```ts
{
  parserType,
  recordTypeCounts,
  topLevelKeys,
  payloadTypeCounts,
  contentBlockTypeCounts,
  callIdFields,
  resultIdFields,
  possibleExitCodeFields
}
```

运行：

```bash
pnpm --filter ./apps/api tsx scripts/inspect-agent-fixtures.ts ../../sample-data
```

输出写入：

```text
docs/evidence/fixture-shape-inventory.json
```

清点时必须回答：

- Codex tool call 的实际 `type` 和字段路径是什么？
- Codex tool result 的实际 `type` 和字段路径是什么？
- Claude `tool_use` 和 `tool_result` 是否都位于 `message.content[]`？
- 每种来源是否有稳定 call id？
- shell 工具的命令参数字段名是什么？
- exit code 在结构化字段、文本还是两者都存在？
- patch 位于调用参数还是工具结果？
- OpenCode 当前数据库实际有哪些表和 part type？

说明书后面的候选字段是实现起点，最终以 fixture 清点结果为准。

## 3.4 M0 验收

- 所有开关能被配置模块读取。
- fixture 清点脚本不打印消息正文。
- 清点脚本对缺少字段的记录不会崩溃。
- `pipeline-versions.ts` 有单元测试，确保常量非空。
- 原有测试全部通过。

---

# 4. M1：数据库迁移

## 4.1 新增枚举

在 `apps/api/prisma/schema.prisma` 增加：

```prisma
enum TraceEventKind {
  USER_MESSAGE
  ASSISTANT_MESSAGE
  TOOL_EXECUTION
  SYSTEM
}

enum OperationKind {
  NONE
  SHELL
  FILE_READ
  FILE_WRITE
  FILE_PATCH
  FILE_DELETE
  SEARCH
  TEST
  BUILD
  TYPECHECK
  LINT
  GIT
  PACKAGE_CHANGE
  OTHER
}

enum EvidenceQuality {
  EXACT
  PARSED
  INFERRED
  UNKNOWN
}

enum ExperienceBuildStatus {
  PENDING
  PROCESSING
  READY
  FAILED
}

enum ExperienceOutcome {
  SUCCEEDED
  FAILED
  PARTIAL
  UNKNOWN
}

enum AttemptOutcome {
  SUCCEEDED
  FAILED
  PARTIAL
  UNVERIFIED
}

enum AttemptEvidenceRole {
  MUTATION
  VALIDATION
  OBSERVATION_BEFORE
  OBSERVATION_AFTER
  CONTEXT
}
```

## 4.2 扩展 `history_file`

增加：

```prisma
traceParserVersion       String? @map("trace_parser_version")
evidenceExtractorVersion String? @map("evidence_extractor_version")
```

扫描跳过条件以后必须同时比较：

```ts
sameFileHash
&& history.traceParserVersion === TRACE_PARSER_VERSION
&& history.evidenceExtractorVersion === EVIDENCE_EXTRACTOR_VERSION
```

## 4.3 扩展 `agent_session`

增加：

```prisma
traceRevision             Int                   @default(0) @map("trace_revision")
experienceBuildStatus     ExperienceBuildStatus @default(PENDING) @map("experience_build_status")
experienceBuilderVersion  String?               @map("experience_builder_version")
experienceBuildError      String?               @map("experience_build_error")
experienceRequestedAt     DateTime?              @map("experience_requested_at")
experienceReadyAt         DateTime?              @map("experience_ready_at")
experienceProcessingAt    DateTime?              @map("experience_processing_at")
```

`traceRevision` 用于防止 worker 在扫描并发更新时写回旧结果。

## 4.4 新增 `agent_trace_event`

```prisma
model AgentTraceEvent {
  id                  BigInt          @id @default(autoincrement())
  sessionId           BigInt          @map("session_id")
  sourceEventKey      String          @map("source_event_key")

  seqNo               Int             @map("seq_no")
  subSeqNo            Int             @default(0) @map("sub_seq_no")
  eventKind           TraceEventKind  @map("event_kind")
  operationKind       OperationKind   @map("operation_kind")

  occurredAt          DateTime?       @map("occurred_at")
  callId              String?         @map("call_id")
  toolName            String?         @map("tool_name")
  pairingQuality      EvidenceQuality @map("pairing_quality")

  facts               Json
  pathTokens          String[]        @default([]) @map("path_tokens")
  errorSignatures     String[]        @default([]) @map("error_signatures")
  errorCodes          String[]        @default([]) @map("error_codes")
  commandFamilies     String[]        @default([]) @map("command_families")

  redactedExcerpt     String?         @map("redacted_excerpt")
  rawPointer          Json?           @map("raw_pointer")
  rawContentSha256    String?         @map("raw_content_sha256")
  contentHash         String          @map("content_hash")

  extractorVersion    String          @map("extractor_version")
  createdAt           DateTime        @default(now()) @map("created_at")

  session AgentSession @relation(
    fields: [sessionId],
    references: [id],
    onDelete: Cascade
  )

  attemptLinks AgentAttemptEvidence[]

  @@unique([sessionId, sourceEventKey])
  @@index([sessionId, seqNo, subSeqNo])
  @@index([operationKind])
  @@index([errorCodes], type: Gin)
  @@index([pathTokens], type: Gin)
  @@map("agent_trace_event")
}
```

如果当前 Prisma 版本无法为 scalar list 生成 GIN，保留模型字段，在迁移 SQL 中手工创建索引。

## 4.5 新增 `agent_experience`

```prisma
model AgentExperience {
  id                     BigInt             @id @default(autoincrement())
  sessionId              BigInt             @map("session_id")
  episodeIndex           Int                @map("episode_index")
  sourceRevision         Int                @map("source_revision")

  startSeq               Int                @map("start_seq")
  endSeq                 Int                @map("end_seq")

  kind                   String
  title                  String
  taskText               String             @map("task_text")
  templateSummary        String             @map("template_summary")
  outcome                ExperienceOutcome
  evidenceScore          Float              @map("evidence_score")
  evidenceLevel          String             @map("evidence_level")
  evidenceReasonCodes    String[]           @default([]) @map("evidence_reason_codes")

  repoKey                String?            @map("repo_key")
  cwd                    String?

  pathTokens             String[]           @default([]) @map("path_tokens")
  symbolTokens           String[]           @default([]) @map("symbol_tokens")
  errorSignatures        String[]           @default([]) @map("error_signatures")
  errorCodes             String[]           @default([]) @map("error_codes")
  commandFamilies        String[]           @default([]) @map("command_families")

  failedAttemptCount     Int                @default(0) @map("failed_attempt_count")
  successfulAttemptCount Int                @default(0) @map("successful_attempt_count")
  unverifiedAttemptCount Int                @default(0) @map("unverified_attempt_count")

  searchText             String             @map("search_text")
  searchDocumentVersion  String             @map("search_document_version")

  embedding              Unsupported("vector(1024)")?
  embeddingModel         String?            @map("embedding_model")
  embeddingStatus        String             @default("pending") @map("embedding_status")
  embeddingError         String?            @map("embedding_error")
  embeddingReadyAt       DateTime?          @map("embedding_ready_at")

  builderVersion         String             @map("builder_version")
  createdAt              DateTime           @default(now()) @map("created_at")
  updatedAt              DateTime           @updatedAt @map("updated_at")

  session AgentSession @relation(
    fields: [sessionId],
    references: [id],
    onDelete: Cascade
  )

  attempts AgentAttempt[]

  @@unique([sessionId, episodeIndex, sourceRevision])
  @@index([sessionId, sourceRevision])
  @@index([outcome])
  @@index([repoKey])
  @@index([embeddingStatus])
  @@map("agent_experience")
}
```

## 4.6 新增 `agent_attempt`

```prisma
model AgentAttempt {
  id                 BigInt         @id @default(autoincrement())
  experienceId       BigInt         @map("experience_id")
  attemptIndex       Int            @map("attempt_index")

  startSeq           Int            @map("start_seq")
  endSeq             Int            @map("end_seq")
  outcome            AttemptOutcome
  outcomeConfidence  Float          @map("outcome_confidence")

  actionSignature    String         @map("action_signature")
  actionTokens       String[]       @default([]) @map("action_tokens")

  affectedPaths      String[]       @default([]) @map("affected_paths")
  affectedSymbols    String[]       @default([]) @map("affected_symbols")
  commandFamilies    String[]       @default([]) @map("command_families")

  errorBefore        String[]       @default([]) @map("error_before")
  errorAfter         String[]       @default([]) @map("error_after")
  reasonCodes        String[]       @default([]) @map("reason_codes")

  createdAt          DateTime       @default(now()) @map("created_at")

  experience AgentExperience @relation(
    fields: [experienceId],
    references: [id],
    onDelete: Cascade
  )

  evidenceLinks AgentAttemptEvidence[]

  @@unique([experienceId, attemptIndex])
  @@index([outcome])
  @@index([actionSignature])
  @@map("agent_attempt")
}
```

## 4.7 新增证据关联表

```prisma
model AgentAttemptEvidence {
  attemptId    BigInt              @map("attempt_id")
  traceEventId BigInt              @map("trace_event_id")
  role         AttemptEvidenceRole
  ordinal      Int

  attempt AgentAttempt @relation(
    fields: [attemptId],
    references: [id],
    onDelete: Cascade
  )

  traceEvent AgentTraceEvent @relation(
    fields: [traceEventId],
    references: [id],
    onDelete: Cascade
  )

  @@id([attemptId, traceEventId, role])
  @@index([traceEventId])
  @@map("agent_attempt_evidence")
}
```

## 4.8 手写迁移 SQL

迁移中增加：

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS agent_experience_embedding_hnsw
ON agent_experience
USING hnsw (embedding vector_cosine_ops)
WHERE embedding_status = 'ready' AND embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_experience_search_text_trgm
ON agent_experience
USING gin (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS agent_experience_paths_gin
ON agent_experience
USING gin (path_tokens);

CREATE INDEX IF NOT EXISTS agent_experience_errors_gin
ON agent_experience
USING gin (error_signatures);

CREATE INDEX IF NOT EXISTS agent_experience_error_codes_gin
ON agent_experience
USING gin (error_codes);

CREATE INDEX IF NOT EXISTS agent_attempt_action_tokens_gin
ON agent_attempt
USING gin (action_tokens);
```

注意：

- 先创建表，再创建 HNSW。
- 迁移必须在真实 PostgreSQL + pgvector 上跑 e2e。
- SQLite/Prisma test fake 不能替代迁移测试。
- 迁移前后执行 `pnpm typecheck` 和 Prisma generate。

## 4.9 M1 验收

- 新迁移能从空库执行。
- 新迁移能在已有数据的数据库执行。
- 已有 session 默认进入 `PENDING`，但开关关闭时不会自动构建。
- 删除 source/session 会级联删除 trace/experience/attempt。
- 原有 API 契约不变化。

---

# 5. M2：Parser 输出真实工具事件

## 5.1 扩展 parser 公共类型

修改：

```text
apps/api/src/parsers/parser.types.ts
```

新增：

```ts
export type ParsedTraceEvent =
  | ParsedUserMessageEvent
  | ParsedAssistantMessageEvent
  | ParsedToolCallEvent
  | ParsedToolResultEvent
  | ParsedSystemEvent;

export interface ParsedTraceEventBase {
  sourceEventKey: string;
  sequence: number;
  subSequence: number;
  occurredAt?: Date;
  rawPointer: {
    sourcePath: string;
    lineNumber?: number;
    sqliteTable?: string;
    sqliteRowId?: string;
    jsonPath?: string;
  };
}

export interface ParsedUserMessageEvent extends ParsedTraceEventBase {
  kind: "user_message";
  text: string;
}

export interface ParsedAssistantMessageEvent extends ParsedTraceEventBase {
  kind: "assistant_message";
  text: string;
}

export interface ParsedToolCallEvent extends ParsedTraceEventBase {
  kind: "tool_call";
  callId?: string;
  toolName: string;
  arguments: unknown;
}

export interface ParsedToolResultEvent extends ParsedTraceEventBase {
  kind: "tool_result";
  callId?: string;
  toolName?: string;
  result: {
    text?: string;
    structured?: unknown;
    exitCode?: number;
    status?: "success" | "failed" | "unknown";
  };
}

export interface ParsedSystemEvent extends ParsedTraceEventBase {
  kind: "system";
  text: string;
}
```

扩展 `ParsedSession`：

```ts
traceEvents: ParsedTraceEvent[];
```

所有 parser 必须返回该字段。尚未支持工具事件的 parser 返回由普通消息转换出的 user/assistant events，不能返回 `undefined`。

## 5.2 新增安全取值工具

新增：

```text
apps/api/src/parsers/record-access.ts
```

实现：

```ts
export function asRecord(value: unknown): Record<string, unknown> | null;
export function readPath(value: unknown, path: readonly string[]): unknown;
export function readString(
  value: unknown,
  candidates: readonly (readonly string[])[],
): string | undefined;
export function readNumber(...): number | undefined;
export function readArray(...): unknown[] | undefined;
export function flattenTextBlocks(
  value: unknown,
  maxChars: number,
): string | undefined;
```

要求：

- 不使用 `as any` 直接穿透未知 JSON。
- 不递归遍历无界对象；最大深度 8。
- `flattenTextBlocks` 只读取白名单键：
  `text`、`content`、`output`、`stdout`、`stderr`、`message`。
- 超过上限截断并返回 `truncated=true` 的辅助结果。
- 禁止将 unknown 对象直接 `JSON.stringify` 后作为工具输出，因为可能保存整个敏感结构。

## 5.3 稳定 `sourceEventKey`

JSONL：

```ts
function jsonlEventKey(input: {
  parser: string;
  lineNumber: number;
  blockIndex: number;
  kind: string;
  callId?: string;
}): string {
  const identity = input.callId ?? `${input.kind}-${input.blockIndex}`;
  return `${input.parser}:line:${input.lineNumber}:block:${input.blockIndex}:${identity}`;
}
```

SQLite：

```text
opencode:<table>:<row-id>:part:<part-id>:<kind>
```

同一文件重复扫描必须生成相同 key。

## 5.4 JSONL 逐行解析必须保留行号

如果当前 parser 使用 `split("\n")`，改为公共工具：

```text
apps/api/src/parsers/jsonl-reader.ts
```

```ts
export interface JsonlRecord {
  lineNumber: number;
  rawLine: string;
  value: unknown;
}

export function parseJsonlRecords(
  content: string,
): {
  records: JsonlRecord[];
  warnings: ParserWarning[];
};
```

规则：

- 空行忽略。
- 单行 JSON 失败记录 warning，继续下一行。
- warning 包含行号，不包含整行正文。
- 超大行可解析，但 warning 标记 `OVERSIZED_JSONL_LINE`。
- 原始行只在解析函数栈内存在，不持久化。

---

# 6. Claude Code 解析实现

## 6.1 识别消息记录

对每条 JSONL：

```ts
const message = readPath(record, ["message"]);
const role = readString(message, [[ "role" ]]);
const content = readPath(message, ["content"]);
```

如果 `content` 是字符串：

- role=user -> user_message
- role=assistant -> assistant_message

如果 `content` 是数组，逐 block 解析。

## 6.2 解析 `tool_use`

block 满足：

```ts
block.type === "tool_use"
```

映射：

```ts
{
  kind: "tool_call",
  callId: readString(block, [["id"]]),
  toolName: readString(block, [["name"]]) ?? "unknown",
  arguments: readPath(block, ["input"]) ?? {},
}
```

`sourceEventKey` 使用 `tool_use.id`；没有 id 时用 line + block index。

## 6.3 解析 `tool_result`

block 满足：

```ts
block.type === "tool_result"
```

映射：

```ts
{
  kind: "tool_result",
  callId: readString(block, [["tool_use_id"], ["id"]]),
  result: {
    text: flattenTextBlocks(readPath(block, ["content"]), limit),
    structured: pickStructuredToolResultFields(block),
    exitCode: readNumber(block, [
      ["exit_code"],
      ["exitCode"],
      ["metadata", "exit_code"],
      ["metadata", "exitCode"],
    ]),
    status: parseExplicitStatus(block),
  },
}
```

Claude 历史中承载 `tool_result` 的外层消息可能是 `role=user`。此类 block 不得再生成真正的 user_message。

## 6.4 assistant 文本 block

block 满足：

```text
type=text
type=thinking
```

MVP 中：

- `text` 生成 assistant_message。
- `thinking` 不进入 trace event，仅保留当前 message parts 逻辑。
- 不从 thinking 中提取事实。

## 6.5 Claude parser 测试

必须增加：

```text
sample-data/evidence/claude-tool-success.jsonl
sample-data/evidence/claude-tool-failed-retry.jsonl
sample-data/evidence/claude-missing-tool-result.jsonl
sample-data/evidence/claude-secret-output.jsonl
```

断言：

- `tool_use_id` 精确配对。
- tool_result 不成为用户任务。
- 缺失 result 不报 parser fatal error。
- secret fixture 后续持久化不存在明文。

---

# 7. Codex 解析实现

Codex 历史存在多代格式，因此不要把所有判断写在一个巨大 `if` 中。新增：

```text
apps/api/src/parsers/codex/codex-trace-adapter.ts
```

接口：

```ts
export interface CodexTraceAdapter {
  supports(record: unknown): boolean;
  extract(
    record: unknown,
    context: {
      lineNumber: number;
      sourcePath: string;
      nextSequence: () => number;
    },
  ): ParsedTraceEvent[];
}
```

实现两个 adapter：

```text
CodexResponseItemTraceAdapter
CodexLegacyTraceAdapter
```

## 7.1 新版 `response_item`

先取：

```ts
const outerType = readString(record, [["type"]]);
const item =
  readPath(record, ["payload"]) ??
  readPath(record, ["item"]) ??
  record;
const itemType = readString(item, [["type"]]);
```

工具调用候选类型由 fixture 清点后固化，初始支持：

```ts
const TOOL_CALL_TYPES = new Set([
  "function_call",
  "custom_tool_call",
  "local_shell_call",
  "tool_call",
]);
```

映射字段候选：

```ts
callId:
  ["call_id"], ["callId"], ["id"]

toolName:
  ["name"], ["tool_name"], ["toolName"]

arguments:
  ["arguments"], ["input"], ["args"], ["command"]
```

`arguments` 若是 JSON 字符串：

```ts
function parseArgumentsString(value: string): unknown {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return { command: value };
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return { raw: value };
  }
}
```

不要因参数 JSON 损坏丢弃整个事件。

## 7.2 新版工具结果

初始候选：

```ts
const TOOL_RESULT_TYPES = new Set([
  "function_call_output",
  "custom_tool_call_output",
  "local_shell_call_output",
  "tool_result",
]);
```

字段候选：

```ts
callId:
  ["call_id"], ["callId"], ["id"]

text:
  ["output"], ["content"], ["result"], ["stdout"], ["stderr"]

exitCode:
  ["exit_code"], ["exitCode"], ["status", "exit_code"]
```

如果 output 是对象，使用 `pickStructuredToolResultFields` 取白名单，不直接持久化整个对象。

## 7.3 旧版格式

旧版 adapter 只依赖 fixture inventory 中确认的 type。实现规则：

- 每种已确认 type 单独函数。
- 无法识别的工具相关记录写 warning：
  `CODEX_UNSUPPORTED_TOOL_RECORD_SHAPE`。
- warning 中仅记录 top-level keys 和 type，不记录正文。
- 普通 user/assistant 消息仍按当前 parser 行为生成 trace event。

## 7.4 Codex shell 结构化结果

如果 Codex 的 shell output 已包含：

```ts
{
  stdout,
  stderr,
  exit_code,
  duration_ms
}
```

只复制这些白名单字段到内存中的 `ParsedToolResultEvent.result.structured`：

```ts
{
  stdoutExcerptSource: stdout,
  stderrExcerptSource: stderr,
  exitCode,
  durationMs
}
```

进入 evidence pipeline 后立刻脱敏、提取、截断；数据库不保存完整 stdout/stderr。

---

# 8. Pi 与 OpenCode 的实现顺序

这两种来源不进入首个纵向 PR，避免阻塞 MVP。

## 8.1 Pi

按 M0 inventory 结果新增：

```text
apps/api/src/parsers/pi/pi-trace-adapter.ts
```

采用和 Claude 相同的 block adapter 结构。没有 call id 时由后面的 assembler 近邻配对，不在 parser 中猜测结果归属。

## 8.2 OpenCode SQLite

当前 reader 已只读打开 SQLite。解析前先做 schema introspection：

```sql
SELECT name
FROM sqlite_master
WHERE type = 'table';

PRAGMA table_info(session);
PRAGMA table_info(message);
PRAGMA table_info(part);
```

禁止假设所有版本表结构相同。

实现：

```text
OpenCodeCurrentSchemaTraceReader
OpenCodeLegacySchemaTraceReader
```

当前 schema 中：

1. 查询 session。
2. 按 message 创建顺序查询 message。
3. 按 part 顺序查询 part。
4. part 的 JSON 字段先安全解析。
5. 每个 part 生成一个 `ParsedTraceEvent`。
6. `sourceEventKey` 使用数据库 row id，不使用数组序号。

所有 SQL 参数化；数据库 URI 使用 read-only 模式；不执行迁移、VACUUM 或写操作。

---

# 9. 工具调用与结果配对

新增：

```text
apps/api/src/traces/tool-exchange-assembler.ts
apps/api/src/traces/tool-exchange.types.ts
```

## 9.1 输出类型

```ts
export interface ToolExchange {
  call: ParsedToolCallEvent;
  result?: ParsedToolResultEvent;
  pairingQuality: "exact" | "inferred" | "missing";
  warnings: string[];
}
```

## 9.2 精确配对

维护：

```ts
const resultsByCallId = new Map<string, ParsedToolResultEvent[]>();
```

规则：

- call id 相等。
- 结果必须位于调用之后。
- 一个 result 只能使用一次。
- 多个结果同 id 时取最近的一个，并记录 `DUPLICATE_TOOL_RESULT_ID`。
- 多个 call 同 id 时记录 `DUPLICATE_TOOL_CALL_ID`，不强行全配。

## 9.3 无 id 近邻配对

仅当 call 或 result 缺少 id 时执行：

```ts
const MAX_EVENT_DISTANCE = 20;
```

候选必须满足：

- 同 session。
- result sequence > call sequence。
- 之间没有新的真实 user_message。
- result 未使用。
- toolName 相同，或 result 没有 toolName。
- canonical tool kind 相同，或 result 无法识别 kind。

取距离最小者，标记 `inferred`。

禁止跨用户任务配对。

## 9.4 缺失结果

没有结果也输出 exchange：

```ts
{
  call,
  result: undefined,
  pairingQuality: "missing"
}
```

后续：

- 可提取命令和修改路径。
- outcome 必须 unknown/unverified。
- evidence score 扣分。

## 9.5 单元测试

覆盖：

- exact id
- id 重复
- result 早于 call
- result 跨 user message
- 无 id 最近邻
- result 不复用
- missing result
- tool name 不一致

---

# 10. M3：Evidence Pipeline

新增目录：

```text
apps/api/src/evidence/
├── evidence.module.ts
├── evidence-pipeline.service.ts
├── canonical-tool-classifier.ts
├── command/
├── errors/
├── paths/
├── patches/
├── validation/
├── redaction/
└── excerpt/
```

## 10.1 Pipeline 固定执行顺序

```ts
async process(exchange, context) {
  1. 计算原始结果 SHA-256
  2. 截取允许处理的最大字符范围
  3. ANSI 清理
  4. secret redaction
  5. canonical tool 分类
  6. 命令提取与归一化
  7. 显式 exit code 提取
  8. 测试/构建结果解析
  9. 错误提取与指纹
  10. 路径提取与规范化
  11. patch 提取
  12. 生成最小证据 excerpt
  13. 计算 contentHash
  14. 输出 NormalizedTraceEvent[]
}
```

先脱敏，再对将要持久化的文本做任何后续处理。结构化 exit code 等数值可在脱敏前读取。

## 10.2 Canonical tool 分类

定义：

```ts
export type CanonicalToolKind =
  | "shell"
  | "apply_patch"
  | "write_file"
  | "edit_file"
  | "read_file"
  | "search"
  | "unknown";
```

每个 parser 维护 tool name alias：

```ts
const SHELL_TOOL_NAMES = new Set([
  "shell",
  "bash",
  "terminal",
  "exec_command",
  "run_command",
  "local_shell",
]);

const PATCH_TOOL_NAMES = new Set([
  "apply_patch",
  "patch",
]);

const WRITE_TOOL_NAMES = new Set([
  "write_file",
  "create_file",
]);

const EDIT_TOOL_NAMES = new Set([
  "edit_file",
  "replace",
  "str_replace",
]);
```

匹配前：

```ts
toolName.trim().toLowerCase().replaceAll("-", "_")
```

不要用 `includes("run")` 这类宽泛规则。

---

# 11. Secret Redactor 具体实现

新增：

```text
apps/api/src/evidence/redaction/secret-redactor.ts
```

## 11.1 API

```ts
export interface RedactionResult {
  text: string;
  redactionCount: number;
  types: string[];
}

export class SecretRedactor {
  redact(text: string): RedactionResult;
}
```

## 11.2 初始规则

按顺序执行：

1. 私钥块。
2. URL 中用户名密码。
3. Authorization header。
4. GitHub token。
5. AWS access key。
6. 常见环境变量赋值。
7. JSON secret 字段。

示例：

```ts
const RULES: RedactionRule[] = [
  {
    type: "private-key",
    pattern:
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
  },
  {
    type: "authorization",
    pattern: /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+[^\s]+/gi,
  },
  {
    type: "github-token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  },
  {
    type: "github-pat",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    type: "aws-access-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    type: "env-secret",
    pattern:
      /\b([A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|PASSWD))\s*=\s*([^\s]+)/gi,
    replacement: "$1=<redacted:env-secret>",
  },
  {
    type: "url-credentials",
    pattern:
      /([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s/]+)@/gi,
    replacement: "$1<redacted:user>:<redacted:password>@",
  },
];
```

JSON 字段不能只用 regex；对 `structured` 对象递归复制白名单字段时，如果 key 命中：

```text
token
secret
password
authorization
apiKey
api_key
```

值直接替换，不继续递归。

## 11.3 测试

每类 secret 一条单测；再做 e2e：

1. fixture 中放 `ghp_test...`。
2. 扫描。
3. SQL 查询 `agent_trace_event`、`agent_experience`、`agent_chunk`。
4. 断言不存在原 secret。

注意：当前旧 `agent_message` 可能仍保存用户或 assistant 文本。测试 secret 应放在 tool result 中，验证新管线不会把它持久化。

---

# 12. 命令提取与非执行式 tokenizer

## 12.1 命令字段候选

新增：

```text
apps/api/src/evidence/command/command-extractor.ts
```

按 canonical tool adapter 提取，通用候选为：

```ts
const COMMAND_PATHS = [
  ["command"],
  ["cmd"],
  ["script"],
  ["shell_command"],
  ["input", "command"],
  ["arguments", "command"],
] as const;
```

如果是字符串，生成一个 command group。

如果是字符串数组：

- 每项生成一个 command segment。
- `sourceEventKey` 后追加 `:command:<index>`。
- 如果结果无法逐项对应，group outcome 只绑定到最后一项，同时前面项 status=unknown。
- 在 MVP fixture 中优先覆盖单命令场景。

## 12.2 自己实现 tokenizer，不执行 shell

新增：

```text
apps/api/src/evidence/command/shell-tokenizer.ts
```

功能：

- 识别单引号、双引号、反斜杠。
- 识别顶层 `&&`、`||`、`;`、`|`。
- 不做变量展开、命令替换、glob 展开。
- 遇到未闭合引号，返回 tokens + warning，不抛异常。
- 最大 token 1000，最大 command 20000 字符。

输出：

```ts
export interface ShellSegment {
  raw: string;
  tokens: string[];
  precedingOperator?: "&&" | "||" | ";" | "|";
}
```

核心扫描逻辑：

```ts
for each char:
  if inSingleQuote:
    quote only ends on "'"
  else if inDoubleQuote:
    handle \" and \\;
    quote ends on '"'
  else:
    "'" starts single quote
    '"' starts double quote
    '\' escapes next char
    whitespace flushes token
    && || ; | flush segment
    otherwise append
```

禁止调用 shell、`eval`、`exec` 验证 tokenizer。

## 12.3 去除前置环境与 `cd`

只用于归一化，不改变 raw：

```text
FOO=bar BAR=baz pnpm test
  -> pnpm test

cd /repo && pnpm test
  -> pnpm test
  -> cwdOverride=/repo
```

只去除简单 `NAME=value` token；包含 shell substitution 的值不解析。

## 12.4 命令分类

新增：

```text
apps/api/src/evidence/command/command-classifier.ts
```

先归一 package manager wrapper：

```text
pnpm --filter api test
npm run test
yarn test
bun test
```

输出：

```ts
{
  family: "test" | "build" | "typecheck" | "lint" |
          "git" | "package" | "run" | "other";
  operationKind: OperationKind;
  scope: "full" | "targeted" | "unknown";
  scriptName?: string;
}
```

判定顺序：

1. 测试命令。
2. build。
3. typecheck。
4. lint。
5. Git。
6. 包管理修改。
7. 通用运行。
8. other。

测试规则至少覆盖：

```text
jest
jest <file>
vitest
vitest run
pnpm test
pnpm run test
pnpm --filter <pkg> test
npm test
npm run test
yarn test
bun test
```

build：

```text
pnpm build
pnpm run build
npm run build
next build
tsc -b
```

typecheck：

```text
tsc --noEmit
pnpm typecheck
pnpm run typecheck
```

lint：

```text
eslint
biome check
pnpm lint
```

package change：

```text
pnpm add/remove/update/install
npm install/uninstall/update
yarn add/remove
bun add/remove
```

## 12.5 验证范围

```ts
function detectScope(tokens: string[], family: CommandFamily) {
  if (family !== "test") return "unknown";

  const hasPathLikeToken = tokens.some(isRepositoryPathToken);
  const hasTestNameFlag = tokens.some(
    token => token === "-t" || token === "--testNamePattern",
  );
  const hasFilter = tokens.some(
    token => token === "--filter" || token.startsWith("--filter="),
  );

  if (hasPathLikeToken || hasTestNameFlag || hasFilter) {
    return "targeted";
  }

  return "full";
}
```

`pnpm --filter api test` 对 monorepo 全局而言是 targeted。

---

# 13. Exit code 与过程结果

优先级：

1. adapter 提供的结构化数字 exit code。
2. structured result 白名单字段。
3. 工具结果文本的明确 footer。
4. explicit status。
5. unknown。

文本 footer 初始支持：

```text
Process exited with code 0
Command exited with code 1
exit code: 2
Exit status: 1
```

只在最后 50 行中匹配，避免把文档示例误当真实结果。

状态：

```ts
if exitCode === 0 => succeeded
if exitCode !== undefined && exitCode !== 0 => failed
else if explicitStatus === failed => failed
else if explicitStatus === success => succeeded
else unknown
```

assistant 消息里的“成功”“done”永远不能进入 process result。

---

# 14. Jest/Vitest 结果解析

新增：

```text
apps/api/src/evidence/validation/validation-output-parser.ts
apps/api/src/evidence/validation/jest-output-parser.ts
apps/api/src/evidence/validation/vitest-output-parser.ts
apps/api/src/evidence/validation/generic-process-parser.ts
```

接口：

```ts
export interface ValidationOutputParser {
  id: string;

  supports(input: {
    commandFamily?: string;
    normalizedCommand?: string;
    output: string;
  }): boolean;

  parse(input: {
    normalizedCommand?: string;
    output: string;
    exitCode?: number;
  }): TestSummary | null;
}
```

## 14.1 通用 count line

实现：

```ts
function parseStatusCounts(line: string): Partial<TestSummary> {
  const result = {};
  const pattern =
    /(\d+)\s+(passed|failed|skipped|todo|pending|errors?|tests?|suites?)/gi;

  for (const match of line.matchAll(pattern)) {
    // passed/failed/skipped 等累加
  }

  return result;
}
```

## 14.2 Vitest

定位：

```text
Test Files ...
Tests ...
```

优先使用 `Tests` 行作为测试数，`Test Files` 作为 suite 数。

示例兼容：

```text
Test Files  1 failed | 8 passed (9)
Tests       2 failed | 43 passed (45)
```

失败测试名：

- 匹配以 `FAIL` 开始的文件行。
- 匹配 `×`、`✕` 或 `FAIL` 标记后的测试名。
- 最多保存 20 个。
- 每个最多 300 字符。
- 脱敏后保存。

## 14.3 Jest

定位：

```text
Test Suites:
Tests:
Snapshots:
```

兼容：

```text
Test Suites: 1 failed, 8 passed, 9 total
Tests:       2 failed, 43 passed, 45 total
```

失败文件匹配 `FAIL <path>`。

## 14.4 结果冲突

保守规则：

```ts
if (summary.failed > 0) status = "failed";
else if (exitCode !== undefined && exitCode !== 0) status = "failed";
else if (summary.passed > 0 && exitCode === 0) status = "succeeded";
else if (exitCode === 0) status = "succeeded";
else status = "unknown";
```

如果 exit code 0 但 failed > 0：

```text
status=failed
reason=EXIT_CODE_SUMMARY_CONFLICT
```

如果 exit code 非 0 但所有测试通过：

```text
status=failed
reason=POST_TEST_COMMAND_FAILED
```

不能因“43 passed”忽略非零 exit code。

---

# 15. 错误提取与指纹

新增：

```text
apps/api/src/evidence/errors/error-extractor.ts
apps/api/src/evidence/errors/error-normalizer.ts
apps/api/src/evidence/errors/error-fingerprint.ts
```

## 15.1 按行扫描

先：

- strip ANSI
- 统一换行
- 限制扫描最大字符
- 对每行最大 4000 字符

初始识别：

```ts
const ERROR_PATTERNS = [
  /\b(TS\d{4})\b/,
  /\b([A-Z][A-Za-z]+Error)\s*:\s*(.+)/,
  /\b(PrismaClient[A-Za-z]+Error)\b/,
  /\b(ModuleNotFoundError|ImportError|SyntaxError|TypeError|ReferenceError)\b/,
  /\b(SQLSTATE\s*[0-9A-Z]{5})\b/i,
  /\bHTTP\/?\s*(4\d\d|5\d\d)\b/i,
];
```

栈帧：

```text
at symbol (path:line:column)
at path:line:column
```

## 15.2 归一化

顺序固定：

1. repo root -> `<repo>`
2. home -> `~`
3. Windows 反斜杠 -> `/`
4. `:line:column` -> `:<line>:<column>`
5. UUID -> `<uuid>`
6. 8 位以上十六进制 -> `<hash>`
7. ISO 时间 -> `<timestamp>`
8. 持续时间 -> `<duration>`
9. 端口 -> `<port>`，但不要替换 HTTP 状态码
10. 多空白 -> 单空格

## 15.3 两种指纹

```ts
strictInput = [
  errorType,
  errorCode,
  normalizedMessage,
  firstThreeNormalizedFrames,
].join("\n");

coarseInput = [
  errorType,
  errorCode,
  normalizeMessageWithoutIdentifiers(normalizedMessage),
].join("\n");
```

SHA-256：

```text
strictFingerprint
coarseFingerprint
```

`normalizeMessageWithoutIdentifiers` 只替换高熵值、数字和路径，不删除普通英文/中文单词。

## 15.4 去重和上限

同 event：

- strict 相同只保留一条。
- 最多 20 条。
- 优先有 code、有 stack、有明确 type 的错误。
- 其余计数放入 `omittedErrorCount`。

---

# 16. 文件路径提取

新增：

```text
apps/api/src/evidence/paths/path-extractor.ts
apps/api/src/evidence/paths/path-normalizer.ts
```

## 16.1 来源优先级

1. 工具参数明确字段：
   `path`、`file_path`、`filePath`、`target_file`
2. patch 头
3. stack frame
4. command token
5. 输出文本正则
6. assistant 文本仅作为 mention，不作为修改证据

## 16.2 路径规范化

输入：

```ts
{
  rawPath,
  cwd,
  repositoryRoot,
  sourceQuality,
}
```

步骤：

1. 去引号和尾部 `,.;:)`。
2. 解析 `file://`。
3. `\` 转平台规范路径。
4. 绝对路径用 `path.resolve`。
5. 相对路径相对于 command cwd 或 session cwd。
6. 有 repositoryRoot 时计算 `path.relative`。
7. `relative.startsWith("..")` 或绝对 relative -> external。
8. repo 内统一为 `/` 分隔相对路径。
9. 拒绝空路径、`.`、`..`。
10. 最大 500 字符。

默认过滤索引但可保留计数的目录：

```text
.git
node_modules
.next
dist
build
coverage
```

这些路径不进入 `pathTokens`，避免依赖栈污染检索。

## 16.3 文本路径正则

同时支持：

```text
src/foo.ts
apps/api/src/foo.ts:12:3
C:\repo\src\foo.ts:12
/home/user/repo/src/foo.ts
```

正则只作为候选，最终必须经过 normalizer。不要直接把所有 `/` 字符串当路径。

## 16.4 访问类型

```ts
type PathAccess =
  | "read"
  | "write"
  | "patch"
  | "create"
  | "delete"
  | "execute"
  | "mention";
```

由 canonical tool kind 决定。shell 中出现的路径默认 `mention`，除非命令属于明确白名单：

```text
rm -> delete
mv -> write
cp target -> write
sed -i -> write
```

未知 shell 不推断为修改。

---

# 17. Patch 解析

新增：

```text
apps/api/src/evidence/patches/patch-parser.ts
```

输入来源：

- `apply_patch` 工具参数
- edit 工具结构化参数
- Git diff 文本

## 17.1 apply_patch 格式

状态机识别：

```text
*** Add File:
*** Update File:
*** Delete File:
*** Move to:
@@
+ added
- removed
```

每遇到文件头结束上一文件。

忽略：

```text
*** Begin Patch
*** End Patch
```

`+++`/`---` 只在 Git diff 模式解释，避免与正文冲突。

## 17.2 Git diff 格式

识别：

```text
diff --git a/x b/y
rename from x
rename to y
--- a/x
+++ b/y
@@ -a,b +c,d @@
```

输出：

```ts
interface PatchFileSummary {
  path: string;
  previousPath?: string;
  operation: "add" | "update" | "delete" | "rename";
  addedLines: number;
  deletedLines: number;
  changedRanges: Array<{
    oldStart?: number;
    oldCount?: number;
    newStart?: number;
    newCount?: number;
  }>;
}
```

## 17.3 持久化原则

保存：

- 文件名
- 操作类型
- 行数统计
- hunk range
- patch SHA-256

不保存：

- 完整 patch
- 被删除/新增的正文
- 文件内容

---

# 18. 最小证据 excerpt

新增：

```text
apps/api/src/evidence/excerpt/evidence-excerpt-builder.ts
```

不要保存输出头 2000 字符，因为真正错误常在尾部。

构造方式：

1. 收集命中行：
   - 错误
   - Test Files/Tests/Test Suites
   - exit code footer
   - FAIL 文件
2. 每个命中保留前后 2 行。
3. 合并重叠窗口。
4. 最多 80 行。
5. 最多 2000 字符。
6. 再运行一次 redactor。
7. 无命中时只保存：
   - 第一行
   - 最后 10 行
   - 并标记 `EXCERPT_NO_SIGNAL_MATCH`

excerpt 必须带：

```text
[tool output excerpt; redacted; truncated]
```

前端明确提示不是完整输出。

---

# 19. 统一 TraceEvent 输出

`EvidencePipelineService.process` 可从一个 exchange 产生多个事件。

```ts
export interface NormalizedTraceEventDraft {
  sourceEventKey: string;
  seqNo: number;
  subSeqNo: number;
  eventKind: "TOOL_EXECUTION";
  operationKind: OperationKind;

  callId?: string;
  toolName?: string;
  pairingQuality: EvidenceQuality;

  facts: {
    canonicalToolKind: CanonicalToolKind;
    commands: CommandFact[];
    processResult?: ProcessResultFact;
    testSummary?: TestSummary;
    errors: ErrorEvidence[];
    paths: PathEvidence[];
    patch?: PatchSummary;
    warnings: string[];
  };

  pathTokens: string[];
  errorSignatures: string[];
  errorCodes: string[];
  commandFamilies: string[];

  redactedExcerpt?: string;
  rawPointer: unknown;
  rawContentSha256?: string;
  contentHash: string;
}
```

普通 user/assistant 消息也生成 trace event，但：

- user event 只保存和 `agent_message` 相同的文本引用或有限 task text。
- assistant event 不参与成功判定。
- 为减少重复，可在 `facts` 中保存 `messageSeqNo`，不复制全文。
- 经验构建时从 `agent_message` 读取任务文本。

---

# 20. Scanner Importer 集成

修改：

```text
apps/api/src/scanner/scanner-importer.ts
apps/api/src/scanner/scanner-file-runner.ts
```

## 20.1 导入事务

对每个 parsed session：

```ts
await tx.agentSession.upsert(...);

await tx.agentChunk.deleteMany(...);
await tx.agentMessage.deleteMany(...);
await tx.agentTraceEvent.deleteMany(...);

// 原有消息和 chunk 导入
await createMessages(...);
await createChunks(...);

// 新增 trace
const normalizedEvents =
  evidenceEnabled
    ? evidencePipeline.processSession(parsedSession)
    : buildMessageOnlyTrace(parsedSession);

await tx.agentTraceEvent.createMany({
  data: normalizedEvents.map(toPrismaTraceEvent),
});

await tx.agentSession.update({
  where: { id: session.id },
  data: {
    traceRevision: { increment: 1 },
    experienceBuildStatus: evidenceEnabled ? "PENDING" : "READY",
    experienceBuilderVersion: null,
    experienceBuildError: null,
    experienceRequestedAt: new Date(),
    experienceReadyAt: evidenceEnabled ? null : new Date(),
    experienceProcessingAt: null,
  },
});
```

## 20.2 旧 experience 处理

不要在 scanner 事务中先删旧 experience，再等待 worker。搜索只返回：

```text
experience.sourceRevision = session.traceRevision
AND session.experienceBuildStatus = READY
```

worker 成功写入新 revision 后，再删除旧 revision。

这样扫描与构建之间不会返回旧经验，也不会因 worker 失败破坏旧数据审计。

## 20.3 文件版本写回

成功导入后：

```ts
historyFile.traceParserVersion = TRACE_PARSER_VERSION;
historyFile.evidenceExtractorVersion = EVIDENCE_EXTRACTOR_VERSION;
```

失败不更新版本。

## 20.4 性能上限

单 session：

- trace events 最大 50,000。
- tool output 处理最大 2,000,000 字符。
- path 最大 100/event。
- error 最大 20/event。
- patch file 最大 500/exchange。

超限：

- 截断。
- 写 warning。
- 不使整个文件失败，除非数据库行数上限被突破。

---

# 21. M4：Experience Worker

新增：

```text
apps/api/src/experiences/
├── experiences.module.ts
├── experience-worker.ts
├── experience-claim-store.ts
├── episode-segmenter.ts
├── attempt-builder.ts
├── experience-builder.ts
├── experience-persistence.service.ts
└── experience.types.ts
```

沿用现有 embedding worker 风格，不引入 Redis/BullMQ。

## 21.1 Claim SQL

使用 `FOR UPDATE SKIP LOCKED`：

```sql
WITH candidate AS (
  SELECT id
  FROM agent_session
  WHERE experience_build_status IN ('PENDING', 'FAILED')
  ORDER BY experience_requested_at NULLS FIRST, id
  FOR UPDATE SKIP LOCKED
  LIMIT $1
)
UPDATE agent_session s
SET experience_build_status = 'PROCESSING',
    experience_processing_at = NOW(),
    experience_build_error = NULL
FROM candidate c
WHERE s.id = c.id
RETURNING s.id, s.trace_revision;
```

失败记录是否自动重试：

- parser/规则 bug：允许下次 tick 重试，但最多可通过 `experience_build_error` hash 限制频繁日志。
- 数据永久异常：状态 FAILED，管理员 rebuild 后再试。
- worker 每次最多 8 session。

## 21.2 stale processing 恢复

启动和每次 tick 前：

```sql
UPDATE agent_session
SET experience_build_status = 'PENDING',
    experience_processing_at = NULL
WHERE experience_build_status = 'PROCESSING'
  AND experience_processing_at < NOW() - INTERVAL '15 minutes';
```

---

# 22. Episode 切分

## 22.1 输入顺序

按：

```text
seqNo ASC, subSeqNo ASC, id ASC
```

## 22.2 真正 user_message

只有 parser 标记的 `user_message` 才可开始 episode。Claude 的 tool_result 已在 parser 层排除。

## 22.3 延续消息

只允许明确白名单：

```ts
const CONTINUATION_PATTERNS = [
  /^继续[。！!]?$/,
  /^接着[。！!]?$/,
  /^再试一次[。！!]?$/,
  /^重试[。！!]?$/,
  /^好的?[。！!]?$/,
  /^可以[。！!]?$/,
  /^ok[.!]?$/i,
  /^continue[.!]?$/i,
  /^try again[.!]?$/i,
];
```

如果上一 episode 不存在，仍创建新 episode。

不要用长度阈值推断延续。

## 22.4 算法

```ts
function segmentEpisodes(events) {
  const episodes = [];
  let current = null;

  for (const event of events) {
    if (event.kind === "USER_MESSAGE") {
      const text = loadMessageText(event);

      if (
        current &&
        isContinuation(text)
      ) {
        current.events.push(event);
        current.continuationTaskTexts.push(text);
        continue;
      }

      if (current) episodes.push(finalize(current));

      current = {
        taskEvent: event,
        taskText: text,
        events: [event],
      };
      continue;
    }

    if (!current) {
      current = createSyntheticEpisode(sessionTitle);
    }

    current.events.push(event);
  }

  if (current) episodes.push(finalize(current));
  return episodes;
}
```

## 22.5 任务文本

- trim。
- 最多 2000 字符。
- 保留中文和代码标识符。
- 运行 secret redactor。
- 不做生成式摘要。

---

# 23. Attempt 状态机

## 23.1 事件分类

Mutation：

```text
FILE_WRITE
FILE_PATCH
FILE_DELETE
PACKAGE_CHANGE
```

明确 shell mutation：

```text
sed -i
rm
mv
cp 到 repo 内
git apply（只代表历史发生过，不在本系统执行）
```

Validation：

```text
TEST
BUILD
TYPECHECK
LINT
```

Observation：

```text
失败测试
错误输出
文件读取
搜索
git diff/status
```

普通 shell `echo`、`ls` 不算 validation。

## 23.2 状态

```ts
type AttemptBuilderState =
  | { kind: "idle"; observations: Event[] }
  | { kind: "mutating"; attempt: DraftAttempt }
  | { kind: "validating"; attempt: DraftAttempt };
```

## 23.3 转移规则

### idle + observation

加入 episode 级 `observationsBeforeFirstAttempt`。

### idle + mutation

创建 attempt，记录最近错误作为 `errorsBefore`。

### mutating + mutation

继续同一 attempt。

### mutating + validation

加入 validation，状态变 validating。

### validating + validation

继续同一 attempt。用于“目标测试 -> 全量测试”。

### validating + mutation

先 finalize 当前 attempt，再创建下一 attempt。新 attempt 的 `errorsBefore` 使用前一次 validation 的错误。

### 任意状态 + user message

episode 已经在外层切分，不应出现跨 episode。

### episode 结束

- 有 attempt -> finalize。
- 无 mutation -> 生成 diagnostic experience，不生成 attempt。

## 23.4 Outcome 规则

收集 validation，按时间排序。

定义强度：

```ts
const VALIDATION_STRENGTH = {
  full_test: 1.0,
  targeted_test: 0.8,
  build: 0.65,
  typecheck: 0.65,
  lint: 0.45,
};
```

结果：

1. 无 validation -> UNVERIFIED。
2. 最后一个 validation failed：
   - 之前无 success -> FAILED。
   - 之前有 success 且失败强度 >= 成功强度 -> FAILED。
   - 之前有 success 且失败强度较低 -> PARTIAL。
3. 最后一个 validation success：
   - 后面无失败 -> SUCCEEDED。
   - 但存在更强失败且未被同强度成功覆盖 -> PARTIAL。
4. 所有 validation unknown -> UNVERIFIED。

典型：

```text
targeted test pass -> full test fail
=> PARTIAL
```

```text
lint fail -> full test pass
=> PARTIAL
```

```text
targeted test fail -> 修改 -> targeted test pass
=> 两个 attempt：FAILED、SUCCEEDED
```

## 23.5 只把修改后的验证归入 attempt

修改前的初始失败测试属于 `OBSERVATION_BEFORE`，不算 attempt 失败。否则会错误生成“没有修改的失败尝试”。

---

# 24. Attempt action signature

生成 token：

```text
op:file_patch
op:package_change
path:apps/api/src/foo.ts
basename:foo.ts
dir:apps/api/src
symbol:mapSourcePreset
command-family:package
```

排序去重后：

```ts
actionSignature = sha256(tokens.join("\n"));
```

失败尝试相似度使用 token，不直接比较 hash。

权重：

```ts
const ACTION_TOKEN_WEIGHTS = {
  operation: 0.30,
  fullPath: 0.30,
  basename: 0.15,
  symbol: 0.15,
  commandFamily: 0.10,
};
```

加权 Jaccard：

```ts
sum(weight of intersection tokens)
/
sum(weight of union tokens)
```

---

# 25. Experience 构建

## 25.1 Experience kind

```text
change：至少一个 mutation
diagnostic：无 mutation，但有命令/错误/文件证据
informational：只有对话，默认不进入经验搜索
```

MVP 搜索默认只查 change + diagnostic。

## 25.2 最终 outcome

按最后一个 attempt：

```text
last=SUCCEEDED -> SUCCEEDED
last=FAILED -> FAILED
last=PARTIAL -> PARTIAL
all=UNVERIFIED -> UNKNOWN
no attempt -> UNKNOWN
```

不要因较早 attempt 成功而忽略最后失败。

## 25.3 标题模板

按优先级：

```ts
if (errorCode && topFile)
  `${errorCode} · ${basename(topFile)}`

else if (errorType && topFile)
  `${errorType} · ${basename(topFile)}`

else if (failedTestName)
  `测试失败 · ${truncate(failedTestName, 60)}`

else if (topFile)
  `${outcomeLabel} · ${basename(topFile)}`

else
  firstSentence(taskText, 80)
```

## 25.4 摘要模板

成功：

```text
该任务包含 {attemptCount} 次修改尝试；最后一次涉及
{topPaths}，随后 {validationCommandLabel} 验证通过。
```

失败：

```text
该任务包含 {attemptCount} 次修改尝试；最后一次涉及
{topPaths}，随后验证失败，观察到 {topErrors}。
```

部分：

```text
该任务的部分验证通过，但仍存在更高范围或后续验证失败。
```

未验证：

```text
该任务包含文件修改，但未发现修改后的测试、构建、类型检查或 lint 结果。
```

diagnostic：

```text
该记录包含 {commandCount} 个命令和 {errorCount} 个错误证据，
未发现文件修改。
```

摘要不允许使用 assistant 自述填充“解决了”“根因”。

## 25.5 Evidence score

不要对“已有字段”重新归一，否则只有一个 exact 字段也会拿高分。

### change profile

```ts
const CHANGE_EVIDENCE_WEIGHTS = {
  toolPairing: 0.10,
  mutationPath: 0.15,
  command: 0.10,
  explicitExitCode: 0.15,
  testSummary: 0.20,
  errorEvidence: 0.10,
  postMutationValidation: 0.15,
  rawPointer: 0.05,
};
```

缺失为 0。

质量：

```ts
EXACT=1.0
PARSED=0.8
INFERRED=0.5
UNKNOWN=0
```

### diagnostic profile

```ts
const DIAGNOSTIC_EVIDENCE_WEIGHTS = {
  toolPairing: 0.15,
  command: 0.20,
  explicitExitCode: 0.20,
  testSummary: 0.15,
  errorEvidence: 0.20,
  rawPointer: 0.10,
};
```

等级：

```text
A >= 0.85
B >= 0.70
C >= 0.50
D < 0.50
```

A 级失败表示“能够高度确认它失败”，不是推荐。

## 25.6 Search text

固定模板：

```text
task:
{taskText}

outcome:
{succeeded|failed|partial|unknown}

errors:
{errorCodes}
{normalized error messages，最多 10}

files:
{paths}

symbols:
{symbols}

actions:
{operation kinds}

commands:
{normalized command templates}

failed attempts:
{count}

successful attempts:
{count}
```

最大 8000 字符；再次脱敏；保存版本。

---

# 26. Worker 写入与并发保护

worker 读取：

```text
session id
traceRevision
messages
trace events
```

构建完成后事务：

```ts
await prisma.$transaction(async tx => {
  const current = await tx.agentSession.findUnique(...);

  if (
    current.traceRevision !== claimedRevision ||
    current.experienceBuildStatus !== "PROCESSING"
  ) {
    throw new RevisionChangedError();
  }

  await tx.agentExperience.deleteMany({
    where: { sessionId },
  });

  for (const experience of builtExperiences) {
    const created = await tx.agentExperience.create(...);
    await createAttemptsAndLinks(tx, created.id, experience);
  }

  await tx.agentSession.update({
    data: {
      experienceBuildStatus: "READY",
      experienceBuilderVersion: EXPERIENCE_BUILDER_VERSION,
      experienceReadyAt: new Date(),
      experienceProcessingAt: null,
    },
  });
});
```

如果 revision 变化：

- 不写入。
- session 改回 PENDING。
- 下一轮重建。

构建失败：

- FAILED。
- 错误最多 2000 字符。
- 不记录原始日志内容。

---

# 27. Experience embedding

MVP 不单独引入队列。Experience worker 持久化后异步批处理 pending experience：

```ts
for (const experience of pending) {
  try {
    const vector = await provider.embed(experience.searchText);
    validateDimension(vector, 1024);
    await markReady(experience.id, vector, provider.modelName);
  } catch (error) {
    await markEmbeddingFailed(experience.id, safeError(error));
  }
}
```

要求：

- embedding 失败不影响结构化/字符检索。
- mock provider 只用于测试。
- 使用现有 provider 与维度校验逻辑，抽取公共 helper，避免复制。
- 不把 searchText 发送给生成式 API。
- UI 不声称 embedding 失败的记录不可搜索。

后续数据量增大再拆独立 worker。

---

# 28. M5：混合搜索

新增：

```text
apps/api/src/experience-search/
├── experience-search.module.ts
├── experience-search.controller.ts
├── experience-search.service.ts
├── query-feature-extractor.ts
├── experience-candidate-sql.ts
├── experience-ranker.ts
└── failed-attempt-search.service.ts
```

## 28.1 Query feature

输入：

```ts
{
  query,
  errorText?,
  files?,
  symbols?,
  mode,
  topK,
}
```

提取：

- query embedding
- lexical text
- error strict/coarse fingerprint
- error codes
- normalized paths
- symbols
- command family（若 planned command）
- repo key（M8）

`lexicalText` 不直接使用整段中文查询，而是组合：

```text
错误代码
错误类型
文件路径
basename
代码标识符
命令名
原 query 中 ASCII token
```

中文语义主要由 embedding 承担；trigram 重点找代码 token、路径和错误。

## 28.2 三路候选

### Dense

Top 80：

```sql
SELECT
  e.id,
  1 - (e.embedding <=> $1::vector) AS dense_score
FROM agent_experience e
JOIN agent_session s ON s.id = e.session_id
WHERE e.embedding_status = 'ready'
  AND e.embedding IS NOT NULL
  AND e.source_revision = s.trace_revision
  AND s.experience_build_status = 'READY'
ORDER BY e.embedding <=> $1::vector
LIMIT 80;
```

### Lexical

只有 lexicalText 非空时执行：

```sql
SELECT
  e.id,
  similarity(e.search_text, $1) AS lexical_score
FROM agent_experience e
JOIN agent_session s ON s.id = e.session_id
WHERE e.source_revision = s.trace_revision
  AND s.experience_build_status = 'READY'
  AND similarity(e.search_text, $1) > 0.03
ORDER BY lexical_score DESC, e.id
LIMIT 80;
```

### Structured

```sql
SELECT
  e.id,
  (
    CASE WHEN e.error_signatures && $1::text[] THEN 4 ELSE 0 END +
    CASE WHEN e.error_codes && $2::text[] THEN 3 ELSE 0 END +
    CASE WHEN e.path_tokens && $3::text[] THEN 3 ELSE 0 END +
    CASE WHEN e.symbol_tokens && $4::text[] THEN 2 ELSE 0 END +
    CASE WHEN e.command_families && $5::text[] THEN 1 ELSE 0 END
  ) AS structured_score
FROM agent_experience e
JOIN agent_session s ON s.id = e.session_id
WHERE e.source_revision = s.trace_revision
  AND s.experience_build_status = 'READY'
  AND (
    e.error_signatures && $1::text[]
    OR e.error_codes && $2::text[]
    OR e.path_tokens && $3::text[]
    OR e.symbol_tokens && $4::text[]
    OR e.command_families && $5::text[]
  )
ORDER BY structured_score DESC, e.id
LIMIT 80;
```

空数组要显式处理，避免所有条件 false 或 SQL cast 错误。

## 28.3 候选并集

在 TypeScript 合并最多 200 id，批量读取完整记录与 attempts，不做 N+1。

## 28.4 RRF

```ts
function rr(rank: number | undefined, k = 60) {
  return rank === undefined ? 0 : 1 / (k + rank);
}

rrf =
  rr(denseRank) +
  rr(lexicalRank) +
  rr(structuredRank);
```

RRF 只用于稳定候选顺序，不作为最终可解释分数。

## 28.5 最终打分

可用信号：

```ts
dense
lexical
errorMatch
pathMatch
symbolMatch
commandMatch
```

基础权重：

```ts
{
  dense: 0.35,
  lexical: 0.15,
  errorMatch: 0.20,
  pathMatch: 0.15,
  symbolMatch: 0.10,
  commandMatch: 0.05,
}
```

只有 query 明确提供该类特征时才纳入分母。例如用户未提供文件，不因 pathMatch=0 扣分。

```ts
relevance = weightedAverageAvailable(signals);
evidenceFactor = 0.55 + 0.45 * evidenceScore;
finalScore = relevance * evidenceFactor;
```

M8 后追加 compatibility factor。

## 28.6 匹配细则

Error：

```text
strict 指纹相同 = 1.0
coarse 指纹相同 = 0.8
error code 相同 = 0.55
error type 相同 = 0.35
```

Path：

```text
完整相对路径 = 1.0
末尾两段相同 = 0.85
basename 相同 = 0.65
目录 token Jaccard = 0~0.5
```

Symbol：

```text
path + symbol = 1.0
symbol 相同 = 0.7
```

Command：

```text
模板相同 = 1.0
family + script = 0.8
family = 0.5
```

## 28.7 结果分组

API 返回：

```ts
{
  successful: [],
  failedAttempts: [],
  partial: [],
  unverified: [],
}
```

不要只返回一列再让前端猜 outcome。

---

# 29. Shared Zod 契约

新增：

```text
packages/shared/src/evidence.ts
packages/shared/src/experiences.ts
```

请求：

```ts
export const experienceSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  errorText: z.string().max(10000).optional(),
  files: z.array(z.string().max(500)).max(50).default([]),
  symbols: z.array(z.string().max(300)).max(50).default([]),

  mode: z
    .enum(["all", "successful", "failed", "partial", "unverified"])
    .default("all"),

  topK: z.coerce.number().int().min(1).max(50).default(10),
});
```

输出必须包括：

- evidence level
- reason codes
- score breakdown
- attempts
- evidence event summary
- session id
- matched paths/errors
- 不返回完整 tool output

BigInt 转字符串。

---

# 30. API

实现：

```http
POST /api/experiences/search
GET  /api/experiences/:id
POST /api/experiences/rebuild
POST /api/experiences/check-failed-attempt
```

## 30.1 `POST /experiences/rebuild`

请求：

```ts
{
  sourceId?: string;
  sessionId?: string;
  includeReady?: boolean;
}
```

行为：

- 将目标 session 标 PENDING。
- 清除 build error。
- 不立即在 HTTP 请求中运行重建。
- 返回受影响 session 数。
- 默认不重建 READY，除非 `includeReady=true`。
- 路由只在本地安全边界内使用。

## 30.2 `GET /experiences/:id`

返回：

- experience
- attempts
- evidence events
- 对应 session metadata
- rawPointer
- excerpt
- 不返回 `facts` 中被明确标记内部的字段
- 不返回原始完整输出

## 30.3 错误 envelope

复用现有格式：

```text
experience_not_found
experience_search_disabled
experience_build_conflict
invalid_experience_request
```

---

# 31. 失败尝试检查

## 31.1 请求

```ts
{
  task: string;
  files: string[];
  symbols?: string[];
  operationKinds: string[];
  plannedCommand?: string;
  topK?: number;
}
```

## 31.2 查询

只查：

```text
agent_attempt.outcome = FAILED
```

候选：

- task embedding 使用所属 experience embedding。
- action token GIN overlap。
- path overlap。
- command family overlap。

## 31.3 相似度

```ts
score =
  0.35 * taskSemantic +
  0.30 * actionTokenWeightedJaccard +
  0.20 * pathMatch +
  0.10 * symbolMatch +
  0.05 * commandMatch;
```

风险：

```text
high >= 0.80
medium >= 0.60
low < 0.60
none = 无结果
```

输出措辞固定：

```text
“计划操作与一条历史失败尝试高度相似。”
```

禁止输出：

```text
“不要这样做”
“该方法必然失败”
```

---

# 32. M6：前端开发

新增路由：

```text
apps/web/app/experiences/page.tsx
apps/web/app/experiences/[id]/page.tsx
```

新增组件：

```text
apps/web/components/experience-search-workspace.tsx
apps/web/components/experience-search-form.tsx
apps/web/components/experience-result-section.tsx
apps/web/components/experience-result-card.tsx
apps/web/components/attempt-timeline.tsx
apps/web/components/evidence-badge.tsx
apps/web/components/outcome-badge.tsx
apps/web/components/score-breakdown.tsx
apps/web/components/evidence-event-list.tsx
```

## 32.1 Search form

字段：

- 查询文本
- 错误文本（高级）
- 文件路径，多值（高级）
- 模式
- 返回数量

不在 MVP 暴露大量权重参数。

## 32.2 结果区域

顺序：

1. 经过验证的历史操作
2. 历史失败尝试
3. 部分验证
4. 未充分验证

每组为空时显示简短说明，不隐藏整个组的含义。

## 32.3 卡片必显

```text
title
taskText
outcome
evidence level + score
matched errors
matched files
attempt count
最后验证命令
打开证据
打开原会话
```

## 32.4 Attempt timeline

每个 attempt：

```text
尝试 1
修改：
- patch foo.ts
- write bar.ts

验证：
- pnpm test <path>
- exit code 1
- 2 failed / 43 passed

结果：失败
证据：事件 #...
```

未验证：

```text
没有找到修改后的测试、构建、类型检查或 lint 结果。
```

不要显示“可能成功”。

## 32.5 Reason code 中文映射

新增：

```text
apps/web/lib/evidence-labels.ts
```

例如：

```ts
VALIDATION_EXIT_CODE_ZERO:
  "验证命令退出码为 0"

TEST_SUMMARY_ZERO_FAILURES:
  "测试摘要未发现失败项"

TOOL_RESULT_MISSING:
  "缺少工具结果"

ASSISTANT_CLAIM_IGNORED:
  "未将 Agent 自述视为验证证据"
```

未知 reason code 显示原代码，避免前后端版本不一致时空白。

## 32.6 隐私提示

详情页 excerpt 顶部：

```text
这是经过脱敏和截断的证据片段，不是完整工具输出。
```

不提供“查看完整原始输出”按钮。

---

# 33. M7：扩展解析器和测试框架

MVP 稳定后逐项加入，每加一种必须配 fixture 和 golden test。

## 33.1 Pytest

摘要行：

```text
2 failed, 43 passed, 1 skipped in 3.21s
```

识别：

```text
passed
failed
skipped
xfailed
xpassed
errors
```

## 33.2 Go test

识别：

```text
ok      package/path
FAIL    package/path
--- FAIL: TestName
```

只要任一 package FAIL 或 exit code 非 0 -> failed。

## 33.3 Cargo test

识别：

```text
test result: ok. 10 passed; 0 failed; ...
test result: FAILED. 9 passed; 1 failed; ...
```

## 33.4 Parser 扩展验收

每种 parser 至少四个 fixture：

- success
- failed retry
- missing result
- secret

---

# 34. M8：当前仓库状态兼容性

这一阶段仍不执行历史命令，只做只读静态检查。

新增：

```text
apps/api/src/repositories/
├── repository-path-policy.service.ts
├── repository-locator.service.ts
├── git-inspector.service.ts
├── repository-snapshot.service.ts
├── dependency-snapshot.service.ts
├── symbol-index.service.ts
└── compatibility.service.ts
```

## 34.1 Git 命令安全

使用 `execa(file, args[])`：

```ts
await execa("git", ["rev-parse", "--show-toplevel"], {
  cwd,
  timeout: 5000,
  maxBuffer: 1024 * 1024,
});
```

禁止拼接 shell 字符串。

允许的 Git 子命令白名单：

```text
rev-parse
status
diff
cat-file
remote
```

不允许：

```text
checkout
reset
clean
apply
commit
merge
rebase
```

## 34.2 repoKey

有 remote：

1. `git remote get-url origin`
2. 删除 credentials。
3. SSH/HTTPS 归一为 host/path。
4. 删除 `.git`。
5. lowercase host。
6. SHA-256。

无 remote：

```text
SHA-256(realpath + package.json name)
```

## 34.3 当前快照

保存或缓存：

```ts
{
  repoKey,
  gitHead,
  branch,
  dirtyHash,
  manifestHash,
  capturedAt,
}
```

`dirtyHash`：

- `git status --porcelain=v1 -z`
- 对输出 SHA-256
- 不持久化完整 status 路径列表，除非确有 UI 需求

## 34.4 历史 commit 质量

只在日志中存在明确 `git rev-parse HEAD` 结果时标记 EXACT。

扫描时读到的当前 HEAD：

- 距 session 结束 <= 2 分钟 -> NEAR_TIME
- 更久 -> LATE
- 无法取得 -> UNKNOWN

UI 必须展示质量。

## 34.5 文件状态

对 experience 的相关路径：

- 当前存在 -> present
- 不存在 -> missing
- 历史 HEAD exact 且 commit 存在时执行 rename detection：

```bash
git diff --name-status -M50% <historyHead> HEAD -- <paths...>
```

解析：

```text
R087 old.ts new.ts
D old.ts
M file.ts
```

大量路径分批，每批不超过 100。

## 34.6 依赖版本

Node 首批：

- package.json
- pnpm-lock.yaml
- package-lock.json
- yarn.lock

只比较 experience 涉及或错误中出现的包；无法确定相关包时比较 package.json 顶层依赖主版本摘要。

输出 warning，不直接判死：

```text
DEPENDENCY_MAJOR_CHANGED
LOCKFILE_CHANGED
DEPENDENCY_VERSION_UNKNOWN
```

## 34.7 Tree-sitter

加入依赖：

```bash
pnpm --filter ./apps/api add tree-sitter tree-sitter-typescript
```

首批解析：

```text
.ts
.tsx
.js
.jsx
```

Query：

```scm
(function_declaration
  name: (identifier) @name) @declaration

(class_declaration
  name: (type_identifier) @name) @declaration

(method_definition
  name: (property_identifier) @name) @declaration

(interface_declaration
  name: (type_identifier) @name) @declaration

(type_alias_declaration
  name: (type_identifier) @name) @declaration

(lexical_declaration
  (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function_expression)])
) @declaration
```

每个文件最大 2 MB；解析超时或语法错误返回 warning，不阻塞搜索。

历史 symbol 来源仅允许：

- stack frame 明确 symbol
- patch hunk header 明确 symbol
- 工具结构化参数明确 symbol

不要从 assistant 普通文本中随便猜 symbol。

## 34.8 Compatibility score

信号：

```ts
repoIdentity: 0.25
fileExistence: 0.30
renameContinuity: 0.15
symbolExistence: 0.15
dependencyCompatibility: 0.15
```

缺少信号时计算 coverage；coverage < 0.4 -> UNCERTAIN。

等级：

```text
COMPATIBLE >= 0.80
LIKELY_COMPATIBLE >= 0.65
UNCERTAIN：coverage 低
LIKELY_STALE >= 0.40
STALE < 0.40
```

硬 stale 仅限：

```text
同一 repo
所有相关文件均缺失
rename detection 未找到去向
```

最终搜索：

```ts
compatibilityFactor = {
  compatible: 1.00,
  likelyCompatible: 0.93,
  uncertain: 0.82,
  likelyStale: 0.68,
  stale: 0.50,
};
```

UI 文案必须是“当前状态匹配”，不是“方案有效性”。

---

# 35. M9：MCP 只读入口

MCP 不是核心算法，等 Web/API 稳定后再做。

建议新增：

```text
apps/mcp/
├── src/main.ts
├── src/api-client.ts
└── package.json
```

使用 stdio transport，调用本机 API，不直接操作数据库。

工具：

```text
search_engineering_history
check_failed_attempt
get_experience_evidence
```

明确不提供：

```text
execute_command
apply_patch
edit_file
resume_agent
```

每个 tool 的 schema 直接复用 shared Zod 转 JSON Schema。

输出中明确：

```text
历史执行结果不等于当前环境中的操作建议。
```

---

# 36. 测试体系

## 36.1 单元测试目录

```text
apps/api/src/evidence/**/*.spec.ts
apps/api/src/traces/**/*.spec.ts
apps/api/src/experiences/**/*.spec.ts
apps/api/src/experience-search/**/*.spec.ts
```

## 36.2 Golden fixture

```text
sample-data/evidence/
├── codex-success.jsonl
├── codex-failed-retry.jsonl
├── codex-missing-result.jsonl
├── claude-success.jsonl
├── claude-failed-retry.jsonl
├── claude-secret.jsonl
└── expected/
    ├── codex-failed-retry.expected.json
    └── claude-failed-retry.expected.json
```

expected 不保存数据库自增 id 和时间，只保存稳定字段。

## 36.3 必测状态机

```text
初始测试失败 -> 修改 -> 测试成功
修改 -> 测试失败
修改 -> 无测试
连续两次修改 -> 一次测试成功
修改 -> 目标测试成功 -> 全量测试失败
修改 -> lint 失败 -> 全量测试成功
修改 -> build 成功 -> test 失败
修改 -> unknown result
```

## 36.4 E2E

增加：

```text
experiences.e2e-spec.ts
experience-rebuild.e2e-spec.ts
experience-search.e2e-spec.ts
evidence-redaction.e2e-spec.ts
experience-worker-concurrency.e2e-spec.ts
```

重点：

- 重复扫描幂等。
- trace revision 更新。
- worker revision 竞争不会写旧结果。
- embedding 失败时结构化搜索仍可用。
- secret 不落库。
- source 删除级联。
- 原有 semantic search 不回归。

## 36.5 检索评测

人工标注至少 40 个 episode：

```text
正确 episode 边界
attempt 数
每个 attempt outcome
错误代码
相关文件
查询相关性
```

指标：

```text
Command Precision/Recall
Path Precision/Recall
Error Code Precision/Recall
Attempt Boundary F1
Outcome Accuracy
False Success Rate
MRR@10
nDCG@10
Failed Attempt Recall@5
```

第一安全指标：

```text
False Success Rate
```

遇到不确定结果应落到 UNVERIFIED，而不是 SUCCEEDED。

---

# 37. 可观测性

日志只记录：

```text
sessionId
historyFileId
sourceId
event count
experience count
warning codes
耗时
状态
```

禁止记录：

- 工具完整输出
- 用户完整任务文本
- patch 正文
- secret
- Authorization

建议指标：

```text
trace_events_extracted_total
tool_pair_exact_total
tool_pair_inferred_total
tool_pair_missing_total
experience_build_success_total
experience_build_failed_total
attempt_outcome_total{outcome}
experience_embedding_failed_total
experience_search_latency_ms
```

课程设计可先用 Nest logger + job 数据库状态，不必引入完整监控栈。

---

# 38. 安全检查清单

每个 PR 合并前检查：

- [ ] 没有执行日志中的 shell 命令
- [ ] 没有拼接用户输入执行 Git
- [ ] 没有保存完整 tool result
- [ ] 没有保存完整 patch
- [ ] excerpt 已二次脱敏
- [ ] rawPointer 不包含正文
- [ ] parser warning 不包含原始行
- [ ] 错误日志不包含 searchText 全文
- [ ] assistant 自述不参与 outcome
- [ ] embedding 只接受脱敏 searchText
- [ ] API 不返回内部 raw structured output
- [ ] 新增端点仍服从本地部署安全边界

---

# 39. 具体任务拆分

## M0

- `EVD-001`：配置开关和版本常量
- `EVD-002`：fixture shape inventory
- `EVD-003`：脱敏 fixture 规范

## M1

- `EVD-010`：Prisma 模型
- `EVD-011`：迁移 SQL 和索引
- `EVD-012`：迁移 e2e

## M2

- `EVD-020`：parser 公共 trace 类型
- `EVD-021`：JSONL line reader
- `EVD-022`：Claude tool block adapter
- `EVD-023`：Codex response_item adapter
- `EVD-024`：Codex legacy adapter
- `EVD-025`：tool exchange assembler

## M3

- `EVD-030`：secret redactor
- `EVD-031`：shell tokenizer
- `EVD-032`：command extractor/classifier
- `EVD-033`：process result extractor
- `EVD-034`：Jest parser
- `EVD-035`：Vitest parser
- `EVD-036`：error fingerprint
- `EVD-037`：path normalizer
- `EVD-038`：patch parser
- `EVD-039`：excerpt builder
- `EVD-040`：evidence pipeline integration
- `EVD-041`：trace persistence

## M4

- `EVD-050`：worker claim/reset
- `EVD-051`：episode segmenter
- `EVD-052`：attempt state machine
- `EVD-053`：outcome classifier
- `EVD-054`：evidence score
- `EVD-055`：experience template builder
- `EVD-056`：revision-safe persistence
- `EVD-057`：experience embedding

## M5

- `EVD-060`：shared schemas
- `EVD-061`：dense candidate SQL
- `EVD-062`：trigram candidate SQL
- `EVD-063`：structured candidate SQL
- `EVD-064`：ranker + score breakdown
- `EVD-065`：search controller
- `EVD-066`：failed attempt checker
- `EVD-067`：detail/rebuild endpoints

## M6

- `EVD-070`：API client
- `EVD-071`：experience search page
- `EVD-072`：result grouping
- `EVD-073`：attempt timeline
- `EVD-074`：evidence detail
- `EVD-075`：front-end tests

## M7-M9

- `EVD-080`：Pi
- `EVD-081`：OpenCode
- `EVD-082`：Pytest/Go/Cargo
- `EVD-090`：Git inspector
- `EVD-091`：dependency snapshot
- `EVD-092`：Tree-sitter symbols
- `EVD-093`：compatibility rank
- `EVD-100`：MCP stdio server

---

# 40. 推荐前十个提交

为了减少难以 review 的“大爆炸提交”，按此顺序：

```text
1. feat(evidence): add feature flags and pipeline versions
2. feat(db): add trace and experience schema
3. refactor(parsers): add stable trace event output
4. feat(claude): parse tool_use and tool_result blocks
5. feat(codex): parse tool calls and outputs
6. feat(evidence): pair calls and extract deterministic evidence
7. feat(scanner): persist trace events and mark experience pending
8. feat(experiences): build episodes, attempts and records
9. feat(search): add hybrid experience search endpoints
10. feat(web): add evidence-aware experience workspace
```

每个提交都应保持 `typecheck` 通过。

---

# 41. 开发完成定义

MVP 只有同时满足以下条件才算完成：

## 功能

- [ ] Codex 和 Claude fixture 能提取 tool call/result
- [ ] 命令、exit code、Jest/Vitest、错误、路径、patch 可提取
- [ ] 能构建 failed -> succeeded 两个 attempt
- [ ] 未验证修改不会显示成功
- [ ] Experience 可 embedding
- [ ] 混合搜索可返回分组结果
- [ ] 失败尝试可单独查询
- [ ] 证据能追溯到 trace event
- [ ] Web 能展示 timeline
- [ ] 原会话可跳转

## 数据与安全

- [ ] 工具完整输出未落库
- [ ] 完整 patch 未落库
- [ ] secret fixture 明文未落库
- [ ] 所有派生结论都有 reason code
- [ ] 重复扫描幂等
- [ ] worker 并发安全
- [ ] 版本升级可触发 rebuild

## 质量

- [ ] 原有测试全通过
- [ ] 新单元测试通过
- [ ] 新 e2e 通过
- [ ] False Success Rate 在标注集上为 0 或接近 0
- [ ] 搜索结果包含 score breakdown
- [ ] API Zod 契约前后端共享
- [ ] README 增加功能边界和隐私说明

---

# 42. 最终演示脚本

1. 展示原始脱敏日志：第一次修改失败，第二次修改成功。
2. 创建/选择 source，执行扫描。
3. 展示扫描 job 完成。
4. 打开经验页，查询错误代码或任务描述。
5. 展示“经过验证的历史操作”。
6. 展开 attempt timeline。
7. 展示第一次失败的 exit code 和错误。
8. 展示第二次成功的测试摘要。
9. 点击“查看证据”，说明 excerpt 已脱敏、截断。
10. 切换到“失败尝试”，展示失败操作可被单独检索。
11. 展示一条没有测试结果的修改，状态必须是“未验证”。
12. 打开原会话，证明 provenance 完整。
13. 搜索数据库或执行自动测试，证明测试 token 未落库。
14. 最后说明：系统没有执行任何历史命令，也没有用 LLM 推断根因。

---

# 43. 技术依据

实施时优先参考以下官方资料：

- Tree-sitter：解析器、语法树和 query 模式
- pgvector：HNSW、cosine distance、向量与文本混合检索
- PostgreSQL `pg_trgm`：trigram similarity 与 GIN/GiST 索引
- Git `git diff --find-renames`：rename detection
- MCP 官方 specification：只读 tool schema 与 server/tool 边界

---

# 44. 最重要的实现准则

把下面几句放在项目 README 和代码 review 模板中：

```text
embedding 只负责找候选；
parser 和规则负责提取事实；
状态机负责划分尝试；
明确的验证结果负责判断成功或失败；
Git 和语法树只负责判断当前对象是否仍存在；
模板负责展示；
系统不推断根因，不生成修复方案，不执行历史操作。
```

只要开发过程中始终守住这条边界，项目就会保持为一个可解释、可复现、固定程序主导的工程证据检索系统，而不会滑向不可控的 Agent 系统。
