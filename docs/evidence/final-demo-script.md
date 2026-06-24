# Evidence Edition 最终演示脚本

本文是 Evidence Edition 各里程碑的本机可复现演示路径。演示只使用仓库中已提交的
`sample-data/` 合成 fixture，服务只绑定本机地址，不会让 AgentLogSearch 执行历史命令、
应用历史 patch 或修改当前工作区。

## 演示范围

本演示覆盖：

- 创建 source 并完成扫描；
- 使用 evidence-aware search/detail/check API；
- 通过 MCP 查询历史失败尝试；
- 验证 secret 脱敏结果；
- 明确说明历史执行结果只是上下文，不是当前环境中的操作建议。

当前最适合演示执行证据的 fixture 是
`sample-data/evidence/claude-tool-failed-retry.jsonl`。它包含一次失败的
`pnpm typecheck`，退出码为 `2`，随后又包含一次成功的 `pnpm typecheck`，退出码为 `0`。
`sample-data/evidence/claude-missing-tool-result.jsonl` 用于演示未验证路径，
`sample-data/evidence/claude-secret-output.jsonl` 用于演示 secret 脱敏。

## 启动服务

启动本机开发数据库，并显式开启 evidence 旁路：

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate
EVIDENCE_PIPELINE_ENABLED=true \
EXPERIENCE_WORKER_ENABLED=true \
EXPERIENCE_SEARCH_ENABLED=true \
pnpm dev
```

后续命令默认访问 Web 单入口代理：

```bash
API=http://127.0.0.1:3000/api
```

## 扫描 Evidence Fixture

创建一个只指向合成 evidence fixture 的 source：

```bash
SOURCE_ID=$(
  curl -sS "$API/sources" \
    -H 'content-type: application/json' \
    -d "{
      \"name\":\"Evidence final demo\",
      \"sourcePreset\":\"claude-code\",
      \"parserType\":\"claude-jsonl\",
      \"readerType\":\"file-glob\",
      \"rootPath\":\"$PWD/sample-data/evidence\",
      \"fileGlob\":\"*.jsonl\",
      \"resumeTemplate\":\"cd {quoted cwd} && claude --resume {quoted threadId}\",
      \"enabled\":true,
      \"scanIntervalSeconds\":300,
      \"maxFileSizeBytes\":5242880,
      \"maxFilesPerScan\":1000,
      \"followSymlinks\":false
    }" | node -pe 'JSON.parse(fs.readFileSync(0, "utf8")).id'
)

curl -sS -X POST "$API/scan/run/$SOURCE_ID"
```

等待 experience worker 把记录构建完成：

```bash
watch -n 1 "curl -sS $API/experiences/status | node -e '
const data = JSON.parse(fs.readFileSync(0, \"utf8\"));
console.log(JSON.stringify({
  pendingSessions: data.pendingSessions,
  processingSessions: data.processingSessions,
  readyExperiences: data.readyExperiences,
  currentRevisionExperiences: data.currentRevisionExperiences,
  latestWorkerError: data.latestWorkerError
}, null, 2));
'"
```

## 搜索成功与失败尝试

搜索失败重试 fixture：

```bash
curl -sS "$API/experiences/search" \
  -H 'content-type: application/json' \
  -d '{
    "query":"Fix the failing typecheck TS1005 pnpm typecheck",
    "errorText":"src/app.ts(1,1): error TS1005: expected ;",
    "files":["src/app.ts"],
    "symbols":[],
    "mode":"all",
    "topK":10
  }' | node -e '
const data = JSON.parse(fs.readFileSync(0, "utf8"));
console.log(JSON.stringify({
  successful: data.successful.map((item) => ({
    id: item.id,
    title: item.title,
    outcome: item.outcome,
    attempts: item.attempts.map((attempt) => ({
      index: attempt.attemptIndex,
      outcome: attempt.outcome,
      commandFamilies: attempt.commandFamilies,
      errorAfter: attempt.errorAfter,
      reasonCodes: attempt.reasonCodes
    }))
  })),
  failedAttempts: data.failedAttempts.map((item) => ({
    id: item.id,
    title: item.title,
    outcome: item.outcome,
    failedAttemptCount: item.failedAttemptCount
  })),
  unverified: data.unverified.map((item) => ({
    id: item.id,
    title: item.title,
    outcome: item.outcome,
    unverifiedAttemptCount: item.unverifiedAttemptCount
  }))
}, null, 2));
'
```

从响应中选择一个 `id`，打开对应证据详情：

```bash
EXPERIENCE_ID=<id-from-search>
curl -sS "$API/experiences/$EXPERIENCE_ID" | node -e '
const data = JSON.parse(fs.readFileSync(0, "utf8"));
console.log(JSON.stringify({
  id: data.id,
  title: data.title,
  session: data.session.externalThreadId,
  attempts: data.attempts.map((attempt) => ({
    index: attempt.attemptIndex,
    outcome: attempt.outcome,
    links: attempt.evidenceLinks
  })),
  evidenceEvents: data.evidenceEvents.map((event) => ({
    id: event.id,
    operationKind: event.operationKind,
    pairingQuality: event.pairingQuality,
    redactedExcerpt: event.redactedExcerpt,
    errorCodes: event.errorCodes,
    commandFamilies: event.commandFamilies,
    facts: event.facts
  }))
}, null, 2));
'
```

检查计划操作是否与历史失败尝试相似：

```bash
curl -sS "$API/experiences/check-failed-attempt" \
  -H 'content-type: application/json' \
  -d '{
    "task":"Fix the failing typecheck and rerun pnpm typecheck",
    "files":["src/app.ts"],
    "symbols":[],
    "operationKinds":["TEST"],
    "plannedCommand":"pnpm typecheck",
    "topK":5
  }'
```

## MCP 查询

构建并验证 stdio server：

```bash
pnpm --filter mcp build
pnpm --filter mcp smoke:stdio
```

在 MCP 客户端中配置构建后的入口：

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

调用 `check_failed_attempt`，payload 与上面的失败尝试检查一致。工具返回必须包含：

```text
历史执行结果不等于当前环境中的操作建议。
```

MCP server 只暴露：

- `search_engineering_history`
- `check_failed_attempt`
- `get_experience_evidence`

它不暴露 `execute_command`、`apply_patch`、`edit_file` 或 `resume_agent`。

## Secret 脱敏检查

已提交的 secret fixture 包含字面量
`SECRET_TOKEN_SHOULD_NOT_BE_PERSISTED=super-secret-value`。扫描并开启 evidence pipeline 后，
用 PostgreSQL 查询证明 secret 原文没有持久化：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U agent_log_search -d agent_log_search -Atc "
    select count(*)
    from agent_trace_event
    where redacted_excerpt like '%super-secret-value%'
       or facts::text like '%super-secret-value%';
  "
```

期望结果：

```text
0
```

`redacted_excerpt` 可以包含 `<redacted:env-secret>`，这是预期的安全标记。

## 结尾说明

演示最后强调项目边界：

```text
embedding 只负责找候选；
parser 和规则负责提取事实；
状态机负责划分尝试；
明确的验证结果负责判断成功或失败；
Git 和语法树只负责判断当前对象是否仍存在；
模板负责展示；
系统不推断根因，不生成修复方案，不执行历史操作。
```
