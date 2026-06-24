# AgentLogSearch Evidence Edition
## 项目总体开发说明书（自包含、可直接实施版）

- 文档版本：2.0
- 编写基线：`PROJECT_ANALYSIS.md` 所描述的 2026-06-23 当前工作树
- 目标读者：第一次接触本项目的开发者、课程设计指导教师、答辩成员、后续维护者
- 技术边界：允许使用 embedding、稀疏检索、重排模型等非生成式语义模型；核心流程不得依赖 LLM、聊天补全或文本生成模型
- 项目性质：本地优先的开发工具与信息基础设施，不是 Coding Agent，不自动修改代码，不自动执行历史命令
- 本文定位：同时说明“为什么做、要做成什么、用户怎么用、系统怎么工作、代码如何改、如何验收”

---

# 0. 五分钟读懂本项目

## 0.1 现在的 AgentLogSearch 是什么

AgentLogSearch 当前是一个本地优先的 Agent CLI 会话历史语义检索工作台。

它已经能够：

1. 读取 Codex、Claude Code、Pi Agent、OpenCode 等 Agent 的历史文件；
2. 将不同格式统一解析为会话、消息和检索片段；
3. 写入 PostgreSQL 与 pgvector；
4. 对历史会话进行语义搜索；
5. 在 Web 页面中查看命中片段、完整会话和恢复命令；
6. 保持原始历史只读，默认不执行任何恢复命令。

现有系统回答的是：

> “以前哪次会话谈到过这个问题？”

## 0.2 现有系统解决不了什么

真实开发者更常需要知道的是：

> “以前遇到类似问题时，究竟执行了什么操作？”
>
> “哪些尝试明确失败了？”
>
> “哪一次修改之后测试真的通过了？”
>
> “那条历史记录现在是否已经过期？”

普通会话语义搜索只能找到相似文本，无法可靠区分：

- Agent 提出的猜测；
- 实际执行过的命令；
- 修改过的文件；
- 明确失败的尝试；
- 未经验证的修改；
- 经过测试、构建或类型检查验证的操作。

当前导入流程还会丢弃独立 `tool` role 的工具结果，因此通常只能看到“Agent 打算运行什么”，看不到“运行之后发生了什么”。

## 0.3 本次要开发成什么

本次升级把 AgentLogSearch 从“会话搜索工具”扩展为：

# **面向 Coding Agent 历史的证据化工程轨迹检索系统**

系统不负责推断真实根因，也不负责推荐最佳修复。系统只负责把日志中能够被固定程序证明的事实组织起来：

```text
用户提出任务
  -> Agent 执行命令或读取文件
  -> Agent 修改文件
  -> Agent 运行测试/构建/类型检查
  -> 工具返回成功或失败结果
  -> 系统提取命令、退出码、测试摘要、错误、文件和 patch
  -> 系统划分每次“修改 -> 验证”尝试
  -> 系统生成模板化经验记录
  -> 用户或外部 Agent 检索这些记录
```

升级后系统回答的是：

> “历史上曾有两次相关修改。第一次修改 `schema.prisma` 后目标测试仍失败；第二次修改 `source-mapping.ts` 后 12 个测试通过。当前相关文件仍存在，但一个历史符号已经消失。”

这段结论全部来自日志、测试输出、Git 和代码结构，不依赖 LLM 生成。

## 0.4 最终交付物

完整课程设计版应交付以下能力：

1. **工具事件保留**：解析 Agent 的工具调用和工具结果，而不只保存聊天文本；
2. **确定性证据提取**：提取命令、退出码、测试统计、错误指纹、文件路径和 patch 摘要；
3. **任务与尝试重建**：按用户任务切分 episode，按“修改—验证”切分 attempt；
4. **经验记录生成**：使用固定模板生成“成功、失败、部分成功、未验证”记录；
5. **证据化混合检索**：结合 embedding、文本、错误、文件、符号和命令进行检索；
6. **失败尝试检索**：单独展示历史上明确失败的相似操作；
7. **当前仓库状态匹配**：检查相关文件、符号、依赖和 Git 状态是否仍兼容；
8. **可解释前端**：展示每条结论的证据、来源和评分原因；
9. **只读 MCP 接口**：供外部 Agent 查询经验，但不能通过本系统执行修改。

## 0.5 项目不是在开发什么

本项目明确不是：

- 新的 Coding Agent；
- 自动修复系统；
- 自动根因分析系统；
- 自动执行历史 patch 的系统；
- 依赖 LLM 总结会话的 RAG 应用；
- 对开发者工作区具有写权限的代理平台。

系统不得输出：

```text
“真正根因一定是……”
“最佳修复方案是……”
“请直接应用这段历史 patch……”
```

系统可以输出：

```text
“历史记录中观察到 TS2322。”
“修改 source-mapping.ts 后，目标测试退出码为 0。”
“该历史记录缺少修改后的验证结果，因此标记为未验证。”
“当前仓库中相关文件仍存在，但历史符号不存在。”
```

## 0.6 一次完整演示应该是什么样

准备一段脱敏日志：

```text
用户：修复 source preset enum 映射测试。

Agent：运行 pnpm test source-mapping
工具结果：exit code 1，TS2322

Agent：修改 schema.prisma
Agent：再次运行测试
工具结果：exit code 1，迁移测试失败

Agent：修改 source-mapping.ts
Agent：再次运行测试
工具结果：exit code 0，12 passed
```

扫描后，经验页面必须展示：

```text
任务：修复 source preset enum 映射测试
历史总体结果：存在已验证成功尝试

尝试 1
- 修改：schema.prisma
- 验证：pnpm test <path>
- 结果：失败，exit code 1

尝试 2
- 修改：source-mapping.ts
- 验证：pnpm test <path>
- 结果：成功，12 passed，0 failed

观察到的错误
- TS2322

证据等级
- A：工具调用与结果已配对，测试摘要可解析，退出码明确

当前仓库状态
- source-mapping.ts：存在
- schema.prisma：存在
- mapSourcePreset：不存在
- Prisma 主版本：未变化
- 兼容性：可能兼容，但不可直接复用旧修改
```

---

# 第一部分：为什么值得开发

# 1. 现实问题

## 1.1 Coding Agent 的历史目前是一堆“不可计算的聊天记录”

开发者使用 Coding Agent 时，真实过程通常包含：

- 提出任务；
- Agent 搜索代码；
- 执行命令；
- 观察错误；
- 修改文件；
- 再执行测试；
- 回滚或继续修改；
- 最终可能成功，也可能中断。

这些过程保存在各 Agent 私有格式的 JSONL、SQLite 或 Markdown 中。人类很难跨工具检索，普通向量搜索又只关注文本相似性。

因此，同一名开发者在几天后重新开始工作，或从 Codex 切换到 Claude Code 时，通常只能重新探索。

## 1.2 重复失败比“找不到聊天”更昂贵

一个失败尝试可能消耗：

- 多轮上下文；
- 多次工具调用；
- 大量 token；
- 开发者等待时间；
- 对代码库的额外修改和回滚成本。

而历史日志中常常已经保存了“这个办法试过并失败”的证据，只是没有被结构化。

## 1.3 普通语义相似度无法表示可信度

两条会话可能文本很相似，但实际状态完全不同：

- 一条只包含 Agent 的猜测；
- 一条执行过修改但未测试；
- 一条测试失败；
- 一条最终经过完整测试。

如果四条记录按同一种“语义相似度”展示，用户无法判断哪条值得参考。

## 1.4 本项目的现实价值

本项目的价值不是“让搜索更像聊天机器人”，而是：

1. 将 Agent 历史中的执行事实变成结构化数据；
2. 帮助开发者确认过去真实发生过什么；
3. 帮助后续 Agent 避免重复已验证失败的操作；
4. 保留每个结论的原始证据，降低错误记忆注入风险；
5. 在不授予写权限的情况下，提供跨 Agent 的只读工程记忆。

---

# 2. 目标用户

## 2.1 个人开发者

典型情况：

- 同时使用 Codex、Claude Code、OpenCode；
- 一周后重新接手自己的项目；
- 想知道某个报错以前是否遇到过；
- 想确认以前哪些方法已经失败；
- 不希望把私有代码和日志上传到云端。

## 2.2 软件工程课程项目团队

典型情况：

- 多个成员使用不同 Agent；
- 需要了解其他成员过去让 Agent 做过什么；
- 希望把“聊天历史”转化为可检查的工程记录；
- 需要量化展示课程设计的创新和效果。

## 2.3 后续接入的 Coding Agent

外部 Agent 可以通过只读 MCP 工具查询：

- 相似历史任务；
- 明确失败的历史尝试；
- 已验证成功的历史操作；
- 当前状态是否与历史记录相符。

外部 Agent是否采用这些信息，由外部 Agent自行决定。本项目不接管其决策和执行。

---

# 3. 典型用户场景

## 3.1 场景 A：恢复中断任务

用户输入：

```text
之前处理 Prisma enum 映射时做过什么？
```

系统返回：

- 相关任务记录；
- 按时间排列的尝试；
- 每次修改的文件；
- 每次验证命令和结果；
- 原会话链接；
- 当前文件是否仍存在。

用户不需要重新阅读数百条聊天消息。

## 3.2 场景 B：避免重复失败

用户或外部 Agent 计划修改：

```text
apps/api/prisma/schema.prisma
```

系统检查到：

- 同一仓库中过去有高度相似的修改；
- 该修改后目标测试退出码为 1；
- 随后换用另一个文件修改才通过。

系统只提示：

```text
发现一条高度相似的历史失败尝试。
```

系统不会阻止执行，也不会自动修改方案。

## 3.3 场景 C：区分“说修好了”和“真的验证过”

历史中 Agent 最后说：

```text
问题应该已经解决。
```

但没有测试结果。

系统展示：

```text
结果：未验证
原因：修改后没有发现测试、构建、类型检查或其他明确验证结果
```

## 3.4 场景 D：历史经验可能过期

历史记录涉及：

```text
src/auth/login.ts::validateToken
```

当前仓库中：

- 文件已重命名；
- 函数已删除；
- 认证依赖升级了主版本。

系统展示：

```text
当前状态：可能过期
原因：历史符号不存在；相关依赖主版本变化
```

## 3.5 场景 E：审查 Agent 的工程过程

教师或团队成员打开经验详情，可以看到：

- 用户原始任务；
- Agent 实际执行的工具调用；
- 修改和验证的顺序；
- 结果判定规则；
- 原始日志位置；
- 是否存在证据缺失。

这使项目不仅是检索工具，也成为一种轻量、可追溯的 Agent 工程过程分析工具。

---

# 4. 产品概念模型

开发前必须统一以下术语。

## 4.1 Session：会话

一个 Agent CLI 保存的完整会话。现有 `agent_session` 已表示该对象。

## 4.2 Message：聊天消息

用于人类阅读的用户、assistant、system 等消息。现有 `agent_message` 继续保留。

## 4.3 Raw Trace Event：原始执行事件

Parser 从原始历史中读取到的事件，例如：

- 用户消息；
- assistant 文本；
- tool call；
- tool result；
- 系统事件。

它仍保留 Agent 私有格式的部分结构，但已统一基本字段。

## 4.4 Tool Exchange：工具交换

一对工具调用和工具结果：

```text
tool call + tool result
```

如果找不到结果，仍然保留调用，并标记 `missing`。

## 4.5 Trace Event：标准化执行事件

经过工具适配和证据提取后得到的统一事件，例如：

```text
执行测试命令
修改文件
读取文件
测试结果失败
观察到错误
```

## 4.6 Evidence：证据

从日志中确定性提取出的事实，例如：

- 命令文本；
- 退出码；
- 测试通过/失败数量；
- 错误代码；
- 文件路径；
- patch 文件列表；
- 原始事件位置。

## 4.7 Episode：任务片段

一条非延续型用户消息开始，到下一条非延续型用户消息之前结束的一段执行过程。

Episode 代表“用户这次让 Agent 做的一件事”，不要求系统理解其真实主题。

## 4.8 Attempt：尝试

Episode 内的一组修改，以及修改后、下一次修改前的验证操作：

```text
一次或多次修改 -> 一次或多次验证
```

例如：

```text
修改 schema.prisma -> 测试失败
```

是一条 attempt；之后：

```text
修改 source-mapping.ts -> 测试成功
```

是另一条 attempt。

## 4.9 Experience：经验记录

由一个 episode 和其中的 attempts 构成的可检索记录。

这里的“经验”不是 LLM 总结出的抽象知识，而是：

> 对一段历史工程过程的结构化、模板化重建。

## 4.10 Compatibility：当前状态匹配度

表示历史经验涉及的文件、符号、依赖和仓库状态在当前项目中是否仍然存在或相似。

它不是“方案正确率”，也不保证旧 patch 可以应用。

---

# 5. 产品输出的语义

## 5.1 Attempt 结果

### `succeeded`

修改后存在明确验证，且最后一个有效验证成功。

有效验证包括：

- 测试命令 exit code 0；
- 测试摘要中失败数量为 0；
- build/typecheck/lint 等命令 exit code 0。

### `failed`

修改后最后一个有效验证失败，例如：

- exit code 非 0；
- 测试摘要 `failed > 0`。

### `partial`

出现相互不完全一致的验证结果，例如：

- 目标单测通过，但随后全量测试失败；
- build 通过，但测试失败。

### `unverified`

存在修改，但修改后没有发现可用验证。

## 5.2 Experience 总体结果

- `succeeded`：至少存在一条最终成功 attempt，且不存在更晚的失败 attempt；
- `failed`：存在修改尝试，但最后有效 attempt 失败；
- `partial`：存在成功和失败验证，无法归为完全成功；
- `unknown`：没有足够信息确定结果。

## 5.3 证据等级

证据等级描述“日志事实是否完整、解析是否可靠”，不是方案质量。

- A：工具调用与结果精确配对，退出码和测试摘要明确；
- B：主要证据完整，但部分来自文本解析；
- C：有修改和部分验证，但结果不完整；
- D：大量事件缺失，仅能确认少量事实。

一条失败记录也可以是 A 级，表示“可以高度确认它失败了”。

## 5.4 当前状态等级

- `compatible`：主要历史对象仍存在，且状态高度一致；
- `likely_compatible`：大部分对象仍存在，但有轻微变化；
- `uncertain`：可用检查信号不足；
- `likely_stale`：有明显变化，历史记录可能过期；
- `stale`：关键文件全部消失且未检测到 rename 等高确定性失效。

---

# 第二部分：用户最终会看到什么

# 6. 信息架构

在现有导航基础上增加：

```text
会话搜索
经验搜索
失败尝试
数据源
扫描任务
```

完整课程设计版可增加：

```text
索引状态
评测结果
```

## 6.1 会话搜索

保留现有能力，不做破坏性替换。

用途：

- 搜索原始历史对话；
- 找到完整会话；
- 复制恢复命令。

## 6.2 经验搜索

新页面，面向“做过什么、结果如何”。

搜索表单包含：

- 自然语言查询；
- 当前仓库路径，可选；
- 当前错误文本，可选；
- 当前相关文件，可选；
- 结果类型：全部、成功、失败、未验证；
- 是否计算当前状态匹配度；
- Top K。

## 6.3 失败尝试

可作为经验搜索的预设页，也可独立页面。

默认只展示：

- `attempt.outcome = failed`；
- 证据等级不低于 C；
- 与当前查询、文件或错误相关的记录。

## 6.4 经验详情

详情页必须分成以下区域：

1. 任务与总体结果；
2. Attempt 时间线；
3. 观察到的错误；
4. 涉及文件和符号；
5. 验证命令与结果；
6. 证据等级与原因；
7. 当前仓库状态；
8. 原始证据；
9. 原始会话入口。

---

# 7. 用户操作流程

## 7.1 首次配置

用户仍然通过现有数据源页面配置：

- Agent 类型；
- 历史根目录；
- glob；
- 扫描间隔；
- 是否启用。

MVP 不新增复杂配置。

## 7.2 扫描

用户点击扫描后，系统内部完成两条链路：

```text
链路 A：原有会话导入
历史文件 -> session/message/chunk -> 会话语义搜索

链路 B：新增证据导入
历史文件 -> raw trace -> evidence -> experience -> 经验检索
```

扫描任务页面增加计数：

- 解析会话数；
- 解析 trace event 数；
- 构建 experience 数；
- evidence 失败数；
- experience 构建失败数。

## 7.3 搜索

用户输入：

```text
登录接口 500，token 为空
```

系统并行完成：

1. 对查询生成 embedding；
2. 提取错误代码、路径和命令特征；
3. dense 召回；
4. trigram/词法召回；
5. 结构化字段召回；
6. 合并和重排；
7. 如提供仓库路径，计算当前状态；
8. 分组返回成功、失败和未验证记录。

## 7.4 查看详情

用户展开一条记录，系统必须明确区分：

```text
日志中直接存在的事实
固定规则解析出的事实
状态匹配计算结果
系统无法确认的内容
```

## 7.5 检查计划操作

在“失败尝试”页面或 MCP 中，用户可输入：

- 当前任务；
- 计划修改的文件；
- 计划运行的命令。

系统将其与历史失败 attempt 的 action signature 比较，并返回相似失败记录。

---

# 8. 经验卡片设计

一张卡片必须能在不打开详情的情况下回答：

```text
这是什么任务？
最后结果是什么？
有几次尝试？
哪些尝试失败？
哪些操作经过验证？
证据是否完整？
当前状态是否可能过期？
```

建议布局：

```text
┌─────────────────────────────────────────────┐
│ TS2322 · source-mapping.ts                  │
│ 历史结果：成功    证据：A    当前：可能兼容 │
├─────────────────────────────────────────────┤
│ 任务：修复 API 与 Prisma enum 映射          │
│ 错误：TS2322 / enum mismatch                │
│ 文件：source-mapping.ts、schema.prisma      │
├─────────────────────────────────────────────┤
│ 尝试：2 次                                   │
│ - 1 次失败：修改 schema.prisma              │
│ - 1 次成功：修改 source-mapping.ts          │
├─────────────────────────────────────────────┤
│ 匹配原因：错误代码相同、文件相同、语义相关   │
│ [查看证据] [打开原会话]                      │
└─────────────────────────────────────────────┘
```

禁止只展示一个模糊的“相似度 88%”。必须展示评分构成或匹配原因。

---

# 9. MVP 与完整课程设计版

## 9.1 MVP

MVP 首批支持：

- Codex JSONL；
- Claude Code JSONL；
- shell/terminal 工具；
- `apply_patch`、`write_file`、`edit_file`；
- Jest、Vitest；
- JS/TS 常见错误；
- 文件和 patch 路径提取；
- Episode/Attempt/Experience；
- Experience API；
- Web 经验搜索与详情；
- 成功、失败、未验证分组；
- Secret redaction。

MVP 完成后项目已经具有独立价值，并能完成核心答辩演示。

## 9.2 完整课程设计版

在 MVP 上增加：

- Pi Agent；
- OpenCode SQLite；
- Pytest、Go test、Cargo test；
- Git 历史状态；
- 文件 rename detection；
- package 依赖版本快照；
- Tree-sitter TS/TSX 符号索引；
- 当前状态匹配；
- 失败尝试预检查；
- 只读 MCP；
- 标注数据集和对比实验。

## 9.3 不应加入的范围

除非核心功能全部完成，否则不要优先开发：

- 多用户账户；
- 云端同步；
- 自动执行命令；
- 自动应用 patch；
- LLM 摘要；
- 复杂知识图谱；
- 多语言代码分析全覆盖；
- 团队权限管理；
- 对公网部署。

---

# 第三部分：系统总体设计

# 10. 设计原则

## 10.1 事实优先

所有结论必须来源于：

- 原始结构字段；
- 可确定解析的标准输出；
- Git 和文件系统检查；
- 代码语法树；
- 可解释评分规则。

## 10.2 保守判定

无法确认成功时，标记 `unverified`，不要猜测成功。

## 10.3 原始会话与证据索引分离

现有 message/chunk 用于人类阅读和旧语义搜索；新 trace/experience 用于工程事实。

## 10.4 语义模型只做召回

embedding 只表示“可能相关”，不能决定成功、失败或兼容性。

## 10.5 本地与只读

系统读取历史和当前仓库，不修改它们；MCP 也只提供查询工具。

## 10.6 所有派生数据可重建

Trace、Experience、Embedding、Compatibility 都必须记录版本，并能够从原历史重建。

---

# 11. 当前架构与新增架构

## 11.1 当前主链路

```text
Agent 历史目录
  -> SourceReader
  -> ParserRegistry
  -> ParsedSession / ParsedMessage
  -> ScannerImporter
  -> agent_session / agent_message / agent_chunk
  -> EmbeddingWorker
  -> pgvector semantic search
  -> Web 会话搜索
```

## 11.2 新增证据旁路

```text
Agent 历史目录
  -> Agent Parser 输出 RawTraceEvent
  -> ToolExchangeAssembler 配对调用与结果
  -> EvidencePipeline 提取事实
  -> agent_trace_event
  -> ExperienceWorker
      -> EpisodeSegmenter
      -> AttemptBuilder
      -> ExperienceBuilder
  -> agent_experience / agent_attempt
  -> ExperienceEmbeddingWorker
  -> HybridExperienceSearch
  -> Web 经验搜索 / 失败尝试 / MCP
```

## 11.3 为什么是旁路而不是重写

保留原链路可以：

- 避免破坏现有搜索和会话详情；
- 逐步上线新能力；
- 在解析失败时仍保留原会话；
- 方便做旧语义搜索与新经验搜索的实验对比；
- 将课程设计创新明确放在新增证据层，而不是重写已有工程。

---

# 12. 从原始日志到结果卡的完整数据流

```text
1. Scanner 发现历史文件
2. Reader 读取 JSONL 或 SQLite
3. Parser 生成：
   - ParsedSession
   - ParsedMessage[]
   - ParsedRawTraceEvent[]
4. ToolExchangeAssembler：
   - callId 精确配对
   - 无 callId 时邻近配对
   - 缺失结果时标记 missing
5. EvidencePipeline：
   - 脱敏
   - 命令提取与归一化
   - exit code 提取
   - 测试摘要解析
   - 错误指纹
   - 路径与 patch
   - 标准化事件分类
6. ScannerImporter 持久化 agent_trace_event
7. ExperienceWorker 领取待处理 session
8. EpisodeSegmenter 按用户任务切分
9. AttemptBuilder 按修改与验证切分
10. ExperienceBuilder 生成模板标题、摘要、结果和证据等级
11. Experience embedding 生成向量
12. 用户搜索时三路召回并重排
13. 如有 repositoryPath，计算当前状态
14. API 返回结构化结果和评分原因
15. Web 展示卡片、时间线和证据详情
```

---

# 13. 后端模块职责

建议新增模块：

```text
apps/api/src/
├── traces/
├── evidence/
├── experiences/
├── experience-search/
├── repositories/
└── mcp/                     # 完整版后期
```

## 13.1 `traces`

负责：

- 原始事件公共类型；
- tool call/result 配对；
- Agent 私有工具名称映射；
- 转成标准 TraceEvent。

不负责：

- 判断成功；
- 生成 experience；
- 查询数据库。

## 13.2 `evidence`

负责：

- Secret redaction；
- 命令解析；
- exit code；
- 测试输出；
- 错误指纹；
- 路径和 patch；
- 最小证据 excerpt。

每个 extractor 应独立可测。

## 13.3 `experiences`

负责：

- pending session worker；
- Episode 切分；
- Attempt 状态机；
- outcome；
- 证据等级；
- 模板标题和摘要；
- experience 写入。

## 13.4 `experience-search`

负责：

- 查询特征提取；
- dense/lexical/structured 候选；
- RRF；
- 确定性重排；
- 结果分组；
- score breakdown。

## 13.5 `repositories`

负责：

- repo root 和 repoKey；
- Git HEAD 与 dirty state；
- 文件状态；
- rename；
- package 依赖；
- Tree-sitter 符号；
- compatibility。

---

# 14. 前端模块职责

新增：

```text
apps/web/components/
├── experience-search-workspace.tsx
├── experience-search-form.tsx
├── experience-result-groups.tsx
├── experience-result-card.tsx
├── experience-detail-workspace.tsx
├── attempt-timeline.tsx
├── evidence-panel.tsx
├── evidence-level-badge.tsx
├── compatibility-badge.tsx
├── match-reasons.tsx
└── failed-attempt-checker.tsx
```

页面：

```text
apps/web/app/experiences/page.tsx
apps/web/app/experiences/[id]/page.tsx
apps/web/app/failed-attempts/page.tsx
```

前端只负责展示后端已经确定的结构化结果，不在浏览器中重新推导 outcome。

---

# 第四部分：具体实现设计

# 15. Parser 必须如何改

## 15.1 保留现有消息输出

现有 parser 仍返回：

```ts
ParsedSession.messages
```

用于旧会话详情和 chunk。

新增：

```ts
ParsedSession.traceEvents
```

用于证据链路。

## 15.2 公共类型

新增或扩展：

```ts
export interface ParsedSession {
  parserType: ParserType;
  sourcePath: string;
  threadId: string;
  cwd?: string;
  title?: string;
  model?: string;
  startedAt?: Date;
  updatedAt?: Date;
  messages: ParsedMessage[];
  traceEvents: ParsedRawTraceEvent[];
}

export type ParsedRawTraceEvent =
  | ParsedUserMessageEvent
  | ParsedAssistantMessageEvent
  | ParsedToolCallEvent
  | ParsedToolResultEvent
  | ParsedSystemEvent;

export interface ParsedRawTraceEventBase {
  sourceEventKey: string;
  sequence: number;
  occurredAt?: Date;
  rawPointer: {
    sourcePath: string;
    lineNumber?: number;
    sqliteTable?: string;
    sqliteRowId?: string;
    jsonPath?: string;
  };
}

export interface ParsedToolCallEvent
  extends ParsedRawTraceEventBase {
  kind: "tool_call";
  callId?: string;
  toolName: string;
  arguments: unknown;
}

export interface ParsedToolResultEvent
  extends ParsedRawTraceEventBase {
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
```

## 15.3 稳定事件 ID

JSONL：

```text
<relative-file-path>:<line-number>:<event-kind>:<block-index>
```

SQLite：

```text
sqlite:<table>:<row-id>:<part-id>:<event-kind>
```

同一历史文件重复扫描时必须得到相同 `sourceEventKey`。

## 15.4 JSONL 必须保留行号

不要先把所有行 `map(JSON.parse)` 后丢失行号。应使用：

```ts
for (const [zeroBasedIndex, line] of lines.entries()) {
  const lineNumber = zeroBasedIndex + 1;
  if (!line.trim()) continue;

  const record = safeParseJson(line);
  // 将 lineNumber 写入 rawPointer
}
```

## 15.5 Claude Code 解析

Claude assistant message 的 content 可能是 block 数组。

对每个 block：

- `type = text`：生成 assistant message event；
- `type = tool_use`：生成 tool call event；
- `id` 作为 callId；
- `name` 作为 toolName；
- `input` 原样放入 arguments，但在持久化前必须经过 redaction。

Claude 的 tool result 常出现在 user message 的 `tool_result` block 中：

- `tool_use_id` 对应 callId；
- `content` 作为结果文本或 block；
- `is_error` 可形成显式 failed 状态；
- 不应把这种记录当成真实用户任务消息。

伪代码：

```ts
for (const block of normalizeContentBlocks(message.content)) {
  if (block.type === "tool_use") {
    events.push({
      kind: "tool_call",
      callId: asString(block.id),
      toolName: asString(block.name) ?? "unknown",
      arguments: block.input,
      ...pointer,
    });
  }

  if (block.type === "tool_result") {
    events.push({
      kind: "tool_result",
      callId: asString(block.tool_use_id),
      result: {
        text: extractBlockText(block.content),
        status: block.is_error === true ? "failed" : "unknown",
      },
      ...pointer,
    });
  }
}
```

## 15.6 Codex 解析

优先支持新版 rollout 中的：

- `response_item`；
- `function_call`；
- `function_call_output`；
- shell command 类 item；
- structured output 中的 exit code。

处理规则：

- call id 优先 `call_id`、`id`；
- 工具名优先 `name`；
- arguments 可能是 JSON 字符串，使用安全解析；
- output 可能为字符串或对象；
- 若对象中存在 `exit_code`、`exitCode`，填入显式 exitCode；
- 旧格式继续保留 adapter，但不要和新版解析逻辑混在一个巨大函数中。

建议目录：

```text
apps/api/src/parsers/codex/
├── codex-jsonl.parser.ts
├── codex-new-format-adapter.ts
├── codex-legacy-format-adapter.ts
└── codex-tool-output.ts
```

## 15.7 Pi 与 OpenCode

放到 MVP 后。

原则相同：

- 先通过 fixture 确认真实字段；
- 不根据字段名猜测；
- SQLite 必须只读；
- rawPointer 包含表名、row id、part id；
- 每种格式都要有 golden fixture。

---

# 16. 工具调用与结果配对

新增：

```text
apps/api/src/traces/tool-exchange-assembler.ts
```

输出：

```ts
export interface ToolExchange {
  callEvent: ParsedToolCallEvent;
  resultEvent?: ParsedToolResultEvent;
  pairingQuality: "exact" | "inferred" | "missing";
}
```

## 16.1 精确配对

条件：

```ts
call.callId !== undefined
&& call.callId === result.callId
```

结果：

```text
pairingQuality = exact
```

一个 result 只能被使用一次。

## 16.2 邻近配对

仅当 callId 不可用时执行。

条件：

1. 同一 session；
2. result 在 call 之后；
3. 中间不超过 20 个事件；
4. 工具名相同，或 result 未提供工具名；
5. result 尚未被配对；
6. 在多个候选中选序号距离最小者。

结果：

```text
pairingQuality = inferred
```

## 16.3 缺失结果

找不到时仍生成 exchange：

```text
pairingQuality = missing
```

后续不得根据 assistant 文本补出 exit code 或成功状态。

## 16.4 核心测试

必须覆盖：

- exact；
- inferred；
- missing；
- 重复 callId；
- result 不能重复复用；
- 乱序事件；
- 不同工具名不得错误配对。

---

# 17. Evidence Pipeline 如何实现

新增目录：

```text
apps/api/src/evidence/
├── evidence-pipeline.service.ts
├── secret-redactor.ts
├── tool-kind-classifier.ts
├── command-extractor.ts
├── command-tokenizer.ts
├── command-normalizer.ts
├── command-classifier.ts
├── process-result-extractor.ts
├── error-extractor.ts
├── error-fingerprint.ts
├── path-extractor.ts
├── patch-extractor.ts
├── excerpt-builder.ts
└── validation-parsers/
    ├── validation-output-parser.ts
    ├── vitest-parser.ts
    ├── jest-parser.ts
    └── generic-exit-code-parser.ts
```

固定执行顺序：

```text
1. 对参数和输出做长度限制
2. Secret redaction
3. Canonical tool kind 分类
4. 命令提取
5. 命令 tokenizer 和归一化
6. 命令 family 分类
7. exit code / process status
8. Jest/Vitest 摘要
9. 错误提取和指纹
10. 路径提取
11. patch 摘要
12. 最小 excerpt
13. 输出 NormalizedTraceEvent
```

顺序不能随意改变，因为错误、路径和 excerpt 必须基于已经脱敏的文本。

---

# 18. Secret Redactor

## 18.1 目的

工具输出可能包含：

- API key；
- bearer token；
- GitHub token；
- AWS key；
- 数据库 URL；
- 私钥；
- `.env` 内容。

完整工具输出不会持久化，但即使只保存 excerpt，也必须先脱敏。

## 18.2 初始规则

至少处理：

```text
Authorization: Bearer ...
*_TOKEN=...
*_KEY=...
*_SECRET=...
*_PASSWORD=...
ghp_...
github_pat_...
AKIA...
postgres://user:password@host
https://user:password@host
-----BEGIN PRIVATE KEY----- ...
```

替换为：

```text
<redacted:bearer-token>
<redacted:secret>
<redacted:github-token>
<redacted:aws-key>
<redacted:credential>
<redacted:private-key>
```

## 18.3 API

```ts
export interface RedactionResult {
  value: string;
  redactionCount: number;
  redactionTypes: string[];
}

export class SecretRedactor {
  redact(value: string): RedactionResult;
  redactUnknown(value: unknown): unknown;
}
```

## 18.4 双重脱敏

执行两次：

1. extractor 处理原始参数和输出前；
2. excerpt 持久化前。

E2E fixture 必须植入假 token，并验证数据库和 API 均不存在原值。

---

# 19. 命令提取和归一化

## 19.1 命令字段优先级

从 tool arguments 中按顺序读取：

```text
command
cmd
script
shell_command
input.command
arguments.command
```

若是字符串数组，保留各项并按 Agent 语义决定是否拼接。

## 19.2 不执行 shell

禁止通过 shell 执行或 `eval` 解析命令。

自己实现轻量 tokenizer，仅识别：

- 空白分隔；
- 单引号；
- 双引号；
- 反斜杠转义；
- `&&`、`;`、`|` 等操作符。

Tokenizer 的目标只是结构提取，不要求完整兼容 Bash。

## 19.3 去除前缀

将：

```bash
FOO=bar cd /home/user/project && pnpm vitest run apps/api/foo.spec.ts
```

拆成：

```json
{
  "cwd": "/home/user/project",
  "normalized": "pnpm vitest run <path>",
  "paths": ["apps/api/foo.spec.ts"]
}
```

处理：

- 前置环境变量；
- `cd path &&`；
- repo 内绝对路径；
- 临时目录；
- UUID；
- 长哈希；
- 随机端口；
- 超长字符串参数。

## 19.4 命令 family

支持：

```text
test
build
typecheck
lint
git
package
run
other
```

示例：

```ts
const RULES = [
  { family: "test", pattern: /^(pnpm|npm|yarn|bun).*(test|jest|vitest)\b/ },
  { family: "test", pattern: /^(pytest|python\s+-m\s+pytest|go\s+test|cargo\s+test)\b/ },
  { family: "build", pattern: /^(pnpm|npm|yarn|bun).*(build)\b/ },
  { family: "typecheck", pattern: /^(tsc\b.*--noEmit|.*typecheck\b)/ },
  { family: "lint", pattern: /^(eslint|biome|ruff|pylint)\b/ },
  { family: "git", pattern: /^git\b/ },
  { family: "package", pattern: /^(pnpm|npm|yarn|bun)\s+(add|install|remove|update)\b/ },
];
```

## 19.5 验证范围

- 无目标参数的完整测试：`full`；
- 指定文件、目录、测试名：`targeted`；
- 无法识别：`unknown`。

该范围用于证据强度，不用于判断业务正确性。

---

# 20. Exit Code 与过程结果

优先级：

```text
工具结构化 exitCode
> 结构化 status
> 标准输出中的明确 exit code
> 测试摘要
> unknown
```

结构：

```ts
export interface ProcessResultEvidence {
  exitCode?: number;
  status: "succeeded" | "failed" | "unknown";
  quality: "exact" | "parsed" | "inferred" | "unknown";
  reasonCodes: string[];
}
```

规则：

- exitCode `0`：succeeded；
- exitCode 非 `0`：failed；
- 只有 `is_error=true`：failed，quality exact；
- 只有文字“成功”：不得作为 process success；
- exit code 与测试摘要冲突：保守判 failed，并记录冲突。

---

# 21. Jest 和 Vitest 解析

统一结构：

```ts
export interface TestSummary {
  framework: "jest" | "vitest" | "generic";
  passed?: number;
  failed?: number;
  skipped?: number;
  total?: number;
  failedTestNames: string[];
  status: "succeeded" | "failed" | "partial" | "unknown";
  quality: "exact" | "parsed" | "inferred" | "unknown";
}
```

## 21.1 Vitest

识别：

```text
Test Files  1 failed | 8 passed
Tests       2 failed | 43 passed
```

## 21.2 Jest

识别：

```text
Test Suites: 1 failed, 8 passed, 9 total
Tests:       2 failed, 43 passed, 45 total
```

## 21.3 解析策略

1. 去 ANSI；
2. 按行扫描；
3. 找到最后一个完整摘要块；
4. 解析数字；
5. `failed > 0` 则 failed；
6. `failed = 0` 且 passed 已知则 succeeded；
7. 摘要缺失时回退 exit code；
8. 不从 assistant 回复中解析测试结果。

---

# 22. 错误提取与指纹

## 22.1 提取对象

首批支持：

- JS/TS Error 名称；
- TypeScript `TSxxxx`；
- Prisma 错误名称；
- HTTP 4xx/5xx；
- assertion failure；
- stack frame。

## 22.2 两级指纹

### 严格指纹

```text
error type + code + normalized message + 前三个 stack frame
```

### 粗粒度指纹

```text
error type + code + message template
```

## 22.3 归一化

替换：

```text
repo root -> <repo>
home -> ~
行列号 -> <line>:<column>
UUID -> <uuid>
长哈希 -> <hash>
时间 -> <timestamp>
耗时 -> <duration>
随机端口 -> <port>
```

然后 SHA-256。

## 22.4 限制

每个事件最多保存：

- 20 个错误；
- 每条原始 excerpt 最多 500 字符；
- stack frame 最多 5 条。

---

# 23. 文件路径与 Patch

## 23.1 路径来源优先级

1. 工具结构参数；
2. apply_patch 文件头；
3. git diff 文件头；
4. stack trace；
5. 命令参数；
6. 普通文本。

## 23.2 只保留安全路径

持久化优先保存 repo 内相对路径。

repo 外绝对路径：

- 不参与 compatibility；
- 可只保存 basename；
- home 路径必须脱敏。

## 23.3 Patch 格式

支持：

```text
*** Update File:
*** Add File:
*** Delete File:
diff --git a/... b/...
--- a/...
+++ b/...
@@ -x,y +x,y @@
```

保存：

- path；
- add/update/delete/rename；
- addedLines；
- deletedLines；
- changedRanges。

默认不保存完整 patch 正文。

---

# 24. 标准 Trace Event

```ts
export type TraceEventKind =
  | "user_message"
  | "assistant_message"
  | "tool_execution"
  | "system";

export type OperationKind =
  | "none"
  | "shell"
  | "file_read"
  | "file_write"
  | "file_patch"
  | "file_delete"
  | "search"
  | "test"
  | "build"
  | "typecheck"
  | "lint"
  | "git"
  | "package_change"
  | "other";

export interface NormalizedTraceEvent {
  sourceEventKey: string;
  sequence: number;
  subSequence: number;
  kind: TraceEventKind;
  operationKind: OperationKind;
  occurredAt?: Date;
  toolName?: string;
  callId?: string;
  pairingQuality?: "exact" | "inferred" | "missing";
  facts: TraceFacts;
  pathTokens: string[];
  errorSignatures: string[];
  commandFamilies: string[];
  redactedExcerpt?: string;
  rawPointer: Record<string, unknown>;
  contentHash: string;
}
```

`facts` 使用 JSONB，以便首版快速演进；高频筛选字段同步放在普通列或数组列。

---

# 25. Episode 切分

## 25.1 规则

一条真实用户消息开始一个 episode，下一条真实用户消息结束当前 episode。

排除：

- Claude tool_result 伪装成 user role 的记录；
- 系统注入；
- 自动 continuation；
- 空消息。

## 25.2 延续消息

只对严格白名单做合并：

```text
继续
接着
再试一次
重试
好的
好
可以
ok
continue
try again
```

不要使用“长度较短就算延续”的规则。

## 25.3 无用户消息

创建 synthetic episode：

```text
taskText = session.title ?? "未记录用户任务"
```

并标记 task quality 为 unknown。

## 25.4 输出

```ts
export interface EpisodeDraft {
  sessionId: bigint;
  episodeIndex: number;
  taskMessageSeq?: number;
  taskText: string;
  taskQuality: "exact" | "synthetic" | "unknown";
  startSequence: number;
  endSequence: number;
  events: NormalizedTraceEvent[];
}
```

---

# 26. Attempt 状态机

## 26.1 Mutation

以下是确定修改：

```text
file_write
file_patch
file_delete
package_change
```

以下 shell 规则可保守识别为修改：

```text
sed -i
rm
mv
cp 到 repo 内
输出重定向到 repo 文件
```

未知 shell 默认不算 mutation。

## 26.2 Validation

以下是验证：

```text
test
build
typecheck
lint
```

其他命令只有在配置中显式标为 validation 才算。

## 26.3 状态

```text
idle
mutating
validating
```

## 26.4 转移

- `idle + mutation`：创建 attempt；
- `mutating + mutation`：追加修改；
- `mutating + validation`：进入 validating；
- `validating + validation`：追加验证；
- `validating + mutation`：结束旧 attempt，开始新 attempt；
- episode 结束：结束当前 attempt；
- observation 不结束 attempt。

## 26.5 重要约束

只有发生在 mutation 之后的 validation 才能证明该 attempt。

例如：

```text
测试失败 -> 修改文件 -> session 结束
```

该修改是 `unverified`，不能继承修改前的失败结果。

## 26.6 Outcome

取 attempt 中最后一个有效验证，并检查是否存在更高范围的后续验证：

- 最后全量测试成功：succeeded；
- 最后验证失败：failed；
- targeted 成功但 full 失败：partial；
- 无验证：unverified。

所有判定写入 `reasonCodes`。

---

# 27. Experience 生成

## 27.1 不使用自由文本生成

标题和摘要全部使用模板。

## 27.2 标题优先级

1. `错误代码 · 文件名`；
2. `错误类型 · 文件名`；
3. `测试失败 · 测试名`；
4. 用户任务第一句；
5. session title。

## 27.3 摘要模板

成功：

```text
该历史任务包含 {n} 次修改尝试。最后一次涉及 {files}，并由 {validation} 验证通过。
```

失败：

```text
该历史任务包含 {n} 次修改尝试。最后一次验证命令为 {command}，结果失败，并观察到 {errors}。
```

未验证：

```text
该历史记录包含对 {files} 的修改，但未发现修改后的测试、构建、类型检查或 lint 结果。
```

部分成功：

```text
该历史记录中部分验证通过，但后续或更高范围验证失败，因此标记为部分成功。
```

## 27.4 Search document

构造：

```text
task:
<task text>

errors:
<error code/type/normalized message>

files:
<paths>

symbols:
<symbols>

actions:
<operation kinds>

commands:
<normalized command templates>

outcome:
<succeeded/failed/partial/unknown>

failed_attempts:
<count>
```

对该文本生成 experience embedding，而不是对完整会话生成。

---

# 28. 证据评分

建议权重：

| 信号 | 权重 |
|---|---:|
| tool call/result 已配对 | 0.10 |
| 明确修改文件 | 0.15 |
| 明确命令 | 0.10 |
| 明确 exit code | 0.15 |
| 测试摘要 | 0.20 |
| 错误指纹 | 0.10 |
| 修改后存在验证 | 0.15 |
| Git 快照 | 0.05 |

质量：

```ts
const QUALITY_VALUE = {
  exact: 1.0,
  parsed: 0.8,
  inferred: 0.5,
  unknown: 0.0,
};
```

按可用信号重新归一，不因某个不适用信号缺失而固定扣分。

证据等级：

```text
A >= 0.85
B >= 0.70
C >= 0.50
D < 0.50
```

API 必须返回构成项和 reasonCodes。

---

# 29. 数据库改造

保留现有：

```text
agent_source
history_file
agent_session
agent_message
agent_chunk
scan_job
embedding_job
```

新增核心表：

```text
agent_trace_event
agent_experience
agent_attempt
agent_evidence_link
repository_snapshot
experience_compatibility
```

## 29.1 `agent_trace_event`

保存：

- sessionId；
- 稳定 sourceEventKey；
- seq/subSeq；
- eventKind；
- operationKind；
- callId/toolName；
- facts JSONB；
- paths/errors/commands 数组；
- redacted excerpt；
- raw pointer；
- extractor version。

唯一键：

```text
(session_id, source_event_key)
```

## 29.2 `agent_experience`

保存：

- sessionId；
- episodeIndex；
- taskText；
- title；
- templateSummary；
- outcome；
- evidenceScore；
- path/symbol/error/command 数组；
- failed/success attempt count；
- searchText；
- embedding；
- builderVersion；
- build status。

唯一键：

```text
(session_id, episode_index)
```

## 29.3 `agent_attempt`

保存：

- experienceId；
- attemptIndex；
- start/end seq；
- outcome；
- confidence；
- actionSignature；
- affected paths/symbols；
- error before/after；
- mutation event ids；
- validation event ids；
- reasonCodes。

## 29.4 `agent_evidence_link`

显式连接：

```text
experience/attempt 的某个结论
-> agent_trace_event
```

用途：

- 详情页跳转；
- 审计；
- 防止只有摘要没有证据。

## 29.5 Pipeline 版本

在 `history_file` 或单独状态表中保存：

```text
parserVersion
evidenceVersion
experienceVersion
```

文件 hash 相同但版本变化时必须重建。

---

# 30. Experience Worker

## 30.1 为什么用 Worker

Parser 和 evidence 导入应尽量快，Tree-sitter、experience 构建和 embedding 不应阻塞扫描事务。

## 30.2 状态

session 或 build job：

```text
pending -> processing -> ready/failed
```

## 30.3 领取

使用与现有 embedding worker 一致的：

```sql
FOR UPDATE SKIP LOCKED
```

避免多实例重复处理。

## 30.4 重建

处理一个 session：

```ts
async function processSession(sessionId: bigint) {
  const input = await loadTraceEvents(sessionId);
  const episodes = segmentEpisodes(input);
  const experiences = episodes.map((episode) => {
    const attempts = buildAttempts(episode.events);
    return buildExperience(episode, attempts);
  });

  await replaceExperiencesInTransaction(sessionId, experiences);
  await markExperienceEmbeddingsPending(sessionId);
}
```

## 30.5 失败恢复

超过配置时间仍为 processing：

- 重置 pending；
- 记录 retry count；
- 超过上限进入 failed；
- 不影响原会话搜索。

---

# 31. 混合检索

## 31.1 查询输入

```json
{
  "query": "之前修复 API enum 映射失败的记录",
  "repositoryPath": "/home/user/AgentLogSearch",
  "errorText": "TS2322: Type ...",
  "files": ["apps/api/src/sources/source-mapping.ts"],
  "symbols": ["mapSourcePreset"],
  "mode": "all",
  "compatibility": "static",
  "topK": 10
}
```

## 31.2 查询特征

使用与历史相同的固定 extractor：

- query embedding；
- error fingerprint；
- path tokens；
- symbol tokens；
- command family；
- repoKey。

## 31.3 三路候选

### Dense

pgvector Top 80。

### Lexical

`pg_trgm` 对 `search_text` Top 80。

### Structured

数组和字段：

- error signature overlap；
- path overlap；
- symbol overlap；
- command family overlap；
- repoKey。

Top 80。

## 31.4 融合

先使用 RRF 合并 rank：

```ts
1 / (60 + rank)
```

再计算可解释分数。

## 31.5 最终分数

基础权重：

```text
dense           0.35
trigram         0.15
error match     0.20
path match      0.15
symbol match    0.05
command match   0.05
repo match      0.05
```

只对可用信号重新归一。

修正：

```ts
finalScore = relevance
  * (0.55 + 0.45 * evidenceScore)
  * compatibilityFactor;
```

Compatibility 未请求时 factor 为 1。

## 31.6 结果分组

API 返回：

```json
{
  "successful": [],
  "failedAttempts": [],
  "unverified": []
}
```

失败 attempt 不应混在“推荐成功经验”列表中。

---

# 32. 当前仓库状态匹配

该模块是完整课程设计版功能，MVP 后实现。

## 32.1 输入

- repositoryPath；
- experience.repoKey；
- 历史相关 paths；
- 历史 symbols；
- 历史依赖；
- 历史 Git head，若可用。

## 32.2 安全执行 Git

使用参数数组：

```ts
execa("git", ["rev-parse", "HEAD"], { cwd });
```

禁止拼接 shell 字符串。

repositoryPath 必须：

- 绝对路径；
- 经过 realpath；
- 位于允许检查的 source cwd 或显式用户输入目录；
- 不跟随未授权 symlink。

## 32.3 repoKey

优先：

```text
SHA-256(规范化 remote origin)
```

无 remote：

```text
SHA-256(realpath + package name + workspace root)
```

不得保存 URL 中凭据。

## 32.4 历史快照质量

- exact：日志明确记录 commit；
- near_time：扫描时间非常接近 session 结束；
- late：扫描明显晚于 session；
- unknown：不可得。

不得把当前 HEAD 冒充为历史精确 HEAD。

## 32.5 检查信号

- repo identity；
- 文件存在比例；
- Git rename；
- symbol 存在比例；
- 依赖主版本；
- Git path continuity。

## 32.6 Tree-sitter

首批仅 TS/TSX/JS/JSX。

提取：

- function；
- class；
- method；
- interface；
- type alias；
- arrow function variable；
- import source。

Patch 行范围映射到包含它的最小声明节点。

## 32.7 Compatibility 不是 patch 验证

即使 `compatible`，UI 也必须显示：

```text
该结果只表示相关工程对象仍然存在或相似，不代表历史 patch 可以直接应用。
```

---

# 33. 失败尝试检查

## 33.1 Action Signature

对 attempt 生成：

```text
operation:file_patch
file:apps/api/prisma/schema.prisma
symbol:SourcePreset
command_family:test
error:TS2322
repo:<repoKey>
```

签名用于结构化匹配，不是 embedding 文本的替代。

## 33.2 请求

```json
{
  "repositoryPath": "/project",
  "task": "修复 enum 映射",
  "files": ["apps/api/prisma/schema.prisma"],
  "plannedCommand": "pnpm test source-mapping"
}
```

## 33.3 返回

```json
{
  "risk": "high",
  "matches": [
    {
      "attemptId": "321",
      "similarity": 0.88,
      "outcome": "failed",
      "reasonCodes": [
        "SAME_REPOSITORY",
        "SAME_FILE",
        "SAME_MUTATION_KIND",
        "SIMILAR_TASK",
        "VALIDATION_FAILED"
      ]
    }
  ]
}
```

系统只陈述“相似历史失败”，不作强制决策。

---

# 34. API 设计

新增 shared：

```text
packages/shared/src/evidence.ts
packages/shared/src/experiences.ts
packages/shared/src/repositories.ts
```

## 34.1 Experience Search

```http
POST /api/experiences/search
```

## 34.2 Experience Detail

```http
GET /api/experiences/:id
```

返回：

- experience；
- attempts；
- evidence links；
- trace excerpts；
- compatibility；
- source session metadata。

## 34.3 Rebuild

```http
POST /api/experiences/rebuild
```

支持：

- sourceId；
- sessionId；
- force；
- onlyFailed。

## 34.4 Check Attempt

```http
POST /api/experiences/check-attempt
```

## 34.5 Build Status

```http
GET /api/experiences/status
```

返回：

- pending sessions；
- processing；
- ready experiences；
- failed；
- embedding pending；
- latest worker error。

## 34.6 错误 envelope

继续使用现有 shared error envelope，不另造格式。

---

# 35. MCP 设计

完整课程设计后期增加三个只读工具：

## `search_engineering_history`

输入当前任务、错误、文件、仓库路径，返回分组经验。

## `check_failed_attempt`

输入计划操作，返回相似失败尝试。

## `explain_history_record`

输入 experience id，返回结构化证据和当前状态。

不得提供：

```text
execute_command
apply_patch
edit_file
resume_agent
```

MCP 是接入层，不是本项目创新本身。

---

# 36. 隐私与安全

## 36.1 默认不存完整工具输出

只保存：

- 结构化事实；
- 脱敏 excerpt；
- 原始内容 hash；
- 原始位置指针。

## 36.2 原始历史只读

继续维持现有边界：

- 不修改 Agent 历史；
- 不执行 resume command；
- 不自动运行历史命令；
- 不写入代码仓库。

## 36.3 网络边界

API 当前无认证，因此：

- 默认回环地址；
- Docker 只公开 Web；
- 不支持不可信公网部署；
- 课程演示使用本地数据。

## 36.4 路径安全

- rootPath 绝对化；
- 默认拒绝 symlink root；
- compatibility 检查只读；
- Git 命令参数数组；
- 不将用户输入拼入 shell。

---

# 第五部分：开发实施计划

# 37. 总体里程碑

| 里程碑 | 目标 | 完成后用户能看到什么 |
|---|---|---|
| M0 | 基线、开关、fixture | 无 UI 变化，项目具备安全开发入口 |
| M1 | Trace 数据模型与 parser 输出 | 后端能看到真实工具调用和结果 |
| M2 | Evidence Pipeline | 能提取命令、测试、错误、文件、patch |
| M3 | Episode/Attempt/Experience | 能生成成功、失败、未验证经验 |
| M4 | Experience Search API | 能按语义和证据检索经验 |
| M5 | Web UI | 用户可完整使用 MVP |
| M6 | 当前仓库状态 | 能提示历史记录是否可能过期 |
| M7 | 更多 Agent/框架 | 支持 Pi/OpenCode/Pytest 等 |
| M8 | MCP 与评测 | 完整课程设计交付 |

---

# 38. M0：建立开发基线

## 38.1 目标

在不改变现有功能的情况下，为新链路增加开关、版本和 fixture。

## 38.2 任务

### EVD-001 新增环境开关

```env
EVIDENCE_PIPELINE_ENABLED=false
EXPERIENCE_WORKER_ENABLED=false
EXPERIENCE_SEARCH_ENABLED=false
REPOSITORY_COMPATIBILITY_ENABLED=false
EVIDENCE_MAX_TOOL_OUTPUT_CHARS=2000000
EVIDENCE_MAX_EXCERPT_CHARS=2000
EXPERIENCE_WORKER_INTERVAL_MS=3000
EXPERIENCE_WORKER_BATCH_SIZE=8
```

文件：

```text
apps/api/src/evidence/evidence.config.ts
apps/api/src/experiences/experience.config.ts
```

### EVD-002 版本常量

```text
apps/api/src/pipeline-versions.ts
```

### EVD-003 Fixture 清点脚本

输出各 Agent fixture 中：

- event type；
- tool call 字段；
- result 字段；
- call id；
- exit code；
- content block 类型。

脚本只输出字段名和类型，不输出敏感正文。

## 38.3 验收

- 所有现有测试通过；
- 新功能默认关闭；
- fixture 清点结果已纳入 `docs/evidence-fixture-inventory.md`；
- 没有凭猜测写 parser。

---

# 39. M1：真实工具事件

## 39.1 目标

让 Codex 和 Claude parser 能输出工具调用与结果，并安全持久化标准 trace event。

## 39.2 任务

### EVD-101 Prisma 迁移

新增：

- `agent_trace_event`；
- session experience build status 字段；
- pipeline version 字段。

### EVD-102 Shared/Parser 类型

新增 `ParsedRawTraceEvent` 类型并扩展 `ParsedSession`。

### EVD-103 Claude adapter

按本说明第 15.5 节实现。

### EVD-104 Codex adapter

按本说明第 15.6 节实现。

### EVD-105 ToolExchangeAssembler

按 exact/inferred/missing 规则实现。

### EVD-106 Trace 持久化

ScannerImporter 在原有 message/chunk 事务中写入 trace events。

## 39.3 验收 Fixture

至少：

```text
claude-tool-success.jsonl
claude-tool-error.jsonl
claude-missing-result.jsonl
codex-shell-success.jsonl
codex-shell-failed.jsonl
codex-patch-and-test.jsonl
```

## 39.4 验收条件

- 工具结果不会进入 `agent_message` 搜索正文；
- trace event 能看到 call/result 配对质量；
- 重复扫描幂等；
- 原会话搜索不回归；
- 原始工具结果正文未完整持久化。

---

# 40. M2：Evidence Pipeline

## 40.1 目标

从 tool exchange 得到结构化命令、退出码、测试、错误、文件和 patch。

## 40.2 任务顺序

### EVD-201 SecretRedactor

先完成并测试，再开发其他 extractor。

### EVD-202 CommandTokenizer/Normalizer

支持 shell、cwd、环境前缀和路径占位。

### EVD-203 CommandClassifier

支持 test/build/typecheck/lint/git/package。

### EVD-204 ProcessResultExtractor

解析显式 exitCode、is_error、structured status。

### EVD-205 Jest/Vitest Parser

按标准摘要格式实现。

### EVD-206 ErrorFingerprint

实现严格和粗粒度指纹。

### EVD-207 Path/Patch Extractor

支持 tool 参数、apply_patch 和 git diff。

### EVD-208 EvidencePipelineService

按固定顺序串联 extractor。

### EVD-209 ScannerImporter 集成

将 facts、tokens、excerpt 写入 `agent_trace_event`。

## 40.3 验收条件

对一段 fixture，数据库能准确查询：

```text
执行命令
命令 family
exit code
测试 passed/failed
错误 TS code
相关文件
patch operation
脱敏 excerpt
```

假 token 不得出现在数据库和 API。

---

# 41. M3：Experience 构建

## 41.1 目标

将 trace event 变成用户可理解的任务、尝试和经验。

## 41.2 任务

### EVD-301 数据库

新增：

- `agent_experience`；
- `agent_attempt`；
- `agent_evidence_link`。

### EVD-302 EpisodeSegmenter

按真实用户消息与延续白名单切分。

### EVD-303 AttemptBuilder

实现 mutation/validation 状态机。

### EVD-304 OutcomeResolver

实现 succeeded/failed/partial/unverified 和 reasonCodes。

### EVD-305 ExperienceBuilder

实现：

- kind；
- 总体 outcome；
- 模板标题；
- 模板摘要；
- evidence score；
- searchText。

### EVD-306 ExperienceWorker

使用 claim、stale reset、retry。

### EVD-307 Evidence Links

每条 outcome 和核心字段必须连接到 trace event。

## 41.3 核心状态机测试

```text
修改 -> 测试成功
修改 -> 测试失败
修改 -> 无验证
修改 -> 目标测试成功 -> 全量失败
测试失败 -> 修改 -> 测试成功
连续修改 -> 测试成功
修改 -> 测试成功 -> 再修改 -> 无验证
```

## 41.4 验收条件

“失败后再修改成功”的 fixture 必须生成两个 attempts；未验证修改不得显示为成功。

---

# 42. M4：经验检索 API

## 42.1 目标

让用户按自然语言、错误和文件检索 Experience，而不是原始聊天 chunk。

## 42.2 任务

### EVD-401 Experience embedding

复用现有 provider 和 worker 基础设施，但使用独立 job/status。

### EVD-402 PostgreSQL 索引

- vector HNSW；
- `pg_trgm`；
- path/error/command GIN。

### EVD-403 QueryFeatureExtractor

对请求提取 embedding、错误、路径、符号和命令。

### EVD-404 Candidate SQL

三路候选 SQL。

### EVD-405 Ranker

RRF、确定性重排、score breakdown。

### EVD-406 Controller/Shared Schema

实现 search/detail/rebuild/status/check-attempt。

## 42.3 验收条件

同一个查询：

- 新系统能返回相关 experience；
- 成功、失败、未验证独立分组；
- 每条记录有 match reasons；
- 失败 attempt 能被单独查到；
- 无 ready embedding 时返回明确状态，不报 500。

---

# 43. M5：Web MVP

## 43.1 目标

形成普通用户可以完整操作的产品闭环。

## 43.2 页面

### `/experiences`

- 搜索表单；
- 三组结果；
- loading/empty/error；
- 兼容旧 API proxy。

### `/experiences/[id]`

- 标题、任务、总体结果；
- Attempt 时间线；
- 错误、文件、命令；
- 证据等级；
- trace evidence；
- 原会话链接。

### `/failed-attempts`

- 失败记录搜索；
- 计划操作检查表单。

## 43.3 UI 语言

使用：

```text
观察到
历史上执行过
验证结果
当前状态
证据不足
可能过期
```

避免：

```text
根因
最佳方案
保证可用
应当直接修改
```

## 43.4 验收条件

用户只通过 Web 能完成：

```text
扫描 -> 等待 experience ready -> 搜索 -> 查看失败/成功 attempts -> 打开证据 -> 打开原会话
```

---

# 44. M6：当前仓库状态

## 44.1 目标

提示历史经验涉及的工程对象在当前仓库中是否仍然存在。

## 44.2 任务

### EVD-601 RepositoryLocator

确定 repo root、repoKey。

### EVD-602 Snapshot

读取 HEAD、branch、dirty hash、manifest hash。

### EVD-603 File status

存在、删除、rename。

### EVD-604 Dependency adapter

首批 package.json 和 lockfile。

### EVD-605 Tree-sitter index

TS/TSX/JS/JSX symbols。

### EVD-606 CompatibilityService

计算 score、coverage、level、reasonCodes。

### EVD-607 UI

展示当前状态并添加免责声明。

## 44.3 验收条件

测试仓库中：

- 文件删除显示 stale/likely stale；
- rename 不误报删除；
- symbol 删除被识别；
- 依赖主版本变化产生 warning；
- coverage 不足时为 uncertain。

---

# 45. M7：扩展支持

按优先级：

1. Pi tool events；
2. OpenCode SQLite tool parts；
3. Pytest；
4. Go test；
5. Cargo test；
6. 更多错误类型；
7. Python symbol，可选。

每增加一个 Agent 或测试框架必须同时增加：

- 脱敏 fixture；
- parser/parser plugin；
- golden expected JSON；
- 单元测试；
- E2E 一条；
- 文档支持矩阵。

---

# 46. M8：MCP 与课程实验

## 46.1 MCP

实现三个只读工具，并用真实查询演示外部 Agent 获取记录。

## 46.2 标注集

人工标注 40 至 60 个 episode：

- episode 边界；
- attempt 边界；
- mutation；
- validation；
- outcome；
- errors；
- paths；
- relevant query；
- stale/compatible。

## 46.3 对比基线

- 现有 chunk semantic search；
- experience dense only；
- hybrid evidence search；
- hybrid + compatibility。

## 46.4 指标

证据提取：

- Command Precision/Recall；
- Path Precision/Recall；
- Error Precision/Recall；
- Test result accuracy。

过程重建：

- Episode boundary F1；
- Attempt boundary F1；
- Outcome accuracy；
- False Success Rate。

检索：

- MRR@10；
- nDCG@10；
- Top-3 Useful Hit Rate；
- Failed Attempt Recall@5；
- Stale Record Top-5 Rate。

最关键安全指标：

```text
False Success Rate
```

宁可将成功记录标为未验证，也不要把失败误判为成功。

---

# 第六部分：测试与质量保证

# 47. 测试分层

## 47.1 单元测试

- parser block；
- call/result pairing；
- redactor；
- tokenizer；
- command family；
- exit code；
- Jest/Vitest；
- error normalization；
- path/patch；
- episode；
- attempt；
- outcome；
- scoring；
- compatibility。

## 47.2 Golden Fixture

目录：

```text
sample-data/evidence/
├── claude/
├── codex/
├── pi/
├── opencode/
└── expected/
```

每个 fixture 对应一个 expected JSON，避免仅断言“数组非空”。

## 47.3 数据库集成测试

验证：

- 幂等 upsert；
- cascade；
- worker claim；
- stale processing；
- vector SQL；
- trigram SQL；
- GIN array overlap。

## 47.4 E2E

至少覆盖：

```text
创建 source
-> 扫描 fixture
-> trace ready
-> experience ready
-> embedding ready
-> 搜索
-> 获取详情
-> 查看原会话
```

## 47.5 前端测试

- 搜索状态；
- 三组结果；
- attempt timeline；
- reason code 中文；
- compatibility；
- API invalid response；
- 隐私免责声明。

---

# 48. Reason Code 设计

所有推导必须返回稳定 reason code，前端只负责映射中文。

示例：

```text
TOOL_CALL_RESULT_EXACT
TOOL_RESULT_MISSING
COMMAND_EXACT
EXIT_CODE_ZERO
EXIT_CODE_NON_ZERO
TEST_SUMMARY_PARSED
TEST_FAILURE_FOUND
MUTATION_WITHOUT_VALIDATION
TARGETED_TEST_PASSED
FULL_TEST_FAILED
PATH_EXACT_MATCH
ERROR_STRICT_MATCH
ERROR_COARSE_MATCH
REPOSITORY_MATCHED
FILE_STILL_EXISTS
FILE_RENAMED
FILE_MISSING
SYMBOL_STILL_EXISTS
SYMBOL_MISSING
DEPENDENCY_MAJOR_CHANGED
COMPATIBILITY_COVERAGE_LOW
```

不要把中文展示文案存入数据库。

---

# 49. 可观测性

日志字段：

```text
sourceId
historyFileId
sessionId
experienceId
workerJobId
parserVersion
evidenceVersion
experienceVersion
eventCount
episodeCount
attemptCount
durationMs
errorCode
```

不得记录：

- 原始 secret；
- 完整工具输出；
- 完整文件正文；
- 未脱敏命令参数。

状态 API 用于 UI 展示：

- 扫描完成但 experience 尚在处理；
- evidence 构建失败；
- embedding pending；
- 当前兼容性缓存时间。

---

# 50. 性能边界

首版限制：

- 单个工具输出最多读取 2 MB，超出时头尾采样；
- excerpt 最多 2,000 字符；
- 每事件最多 20 个错误；
- 每事件最多 100 个路径；
- 每 session experience worker 最多处理配置数量事件；
- 每次检索候选并集不超过 200；
- compatibility 结果按 snapshot 缓存；
- Tree-sitter 只解析经验相关文件，不扫描全仓库所有文件。

扫描 guard 中已有但尚未真正实现的 `maxFileSizeBytes`、`maxFilesPerScan` 也应在本阶段补齐，以防真实历史目录过大。

---

# 第七部分：项目管理与交付

# 51. 推荐提交顺序

1. `chore: add evidence pipeline feature flags and versions`
2. `feat(db): add trace event storage`
3. `feat(parser): emit claude tool call and result events`
4. `feat(parser): emit codex tool call and result events`
5. `feat(trace): pair tool calls and results`
6. `feat(evidence): redact secrets and extract commands`
7. `feat(evidence): parse process and test results`
8. `feat(evidence): extract errors paths and patches`
9. `feat(experience): build episodes and attempts`
10. `feat(experience): persist template-based records`
11. `feat(search): add hybrid experience retrieval`
12. `feat(web): add experience search and detail`
13. `feat(repo): add static compatibility checks`
14. `feat(mcp): expose read-only experience tools`
15. `test(eval): add annotated benchmark and report`

每个提交必须保持：

```text
pnpm lint
pnpm typecheck
pnpm test
```

通过。

---

# 52. 团队分工建议

## 后端 A：Parser/Trace

- Codex/Claude；
- tool pairing；
- trace storage；
- fixtures。

## 后端 B：Evidence/Experience

- extractors；
- episode/attempt；
- worker；
- database。

## 后端 C 或算法：Search/Compatibility

- embedding document；
- hybrid rank；
- Git/Tree-sitter；
- evaluation。

## 前端

- experience pages；
- attempt timeline；
- evidence drawer；
- status UX。

## 测试与文档

- golden fixture；
- E2E；
- benchmark labels；
- demo data；
- user manual。

人员少时按照 M0-M8 顺序串行完成，不要同时铺开所有模块。

---

# 53. Definition of Done

## 53.1 功能

- 至少 Codex、Claude 的工具调用和结果可解析；
- 命令、exit code、Jest/Vitest、错误、路径和 patch 可提取；
- 可生成 episode、attempt、experience；
- 成功、失败、未验证不会混淆；
- 可进行混合检索；
- 可查看证据和原会话；
- 当前状态功能完成后可显示文件/符号/依赖变化；
- MCP 只读。

## 53.2 正确性

- assistant 自述不能证明成功；
- 修改前验证不能证明修改后 outcome；
- 缺失 tool result 不得补造；
- 每条核心结论有 event link；
- outcome 有 reasonCodes；
- score 有 breakdown。

## 53.3 隐私

- 不保存完整工具输出；
- 不泄露 fixture secret；
- 不执行命令；
- 不修改仓库；
- 不开放不可信网络。

## 53.4 工程质量

- 所有新模块有单元测试；
- 每种 Agent 有 golden fixture；
- 核心链路有 E2E；
- worker 可恢复；
- pipeline 可按版本重建；
- 原会话搜索无回归。

## 53.5 课程设计质量

- 有明确现实问题；
- 有区别于普通 RAG 的核心机制；
- 有可解释算法；
- 有基线对比；
- 有消融实验；
- 有可复现演示；
- 不把 LLM 能力冒充系统能力。

---

# 54. 最终答辩表述

## 54.1 项目问题

> Coding Agent 的历史通常以私有会话日志存在。普通语义检索只能找到文本相似记录，无法区分 Agent 的猜测、实际操作、失败尝试和经过测试的结果，导致后续开发者或 Agent 可能重复已失败的工作，或者把未经验证的历史当作可靠经验。

## 54.2 解决方案

> 本项目在现有多 Agent 会话检索基础上，新增确定性的执行证据提取与工程过程重建：解析工具调用和结果，提取命令、退出码、测试摘要、错误、文件与 patch，按任务和修改—验证关系构建经验记录，并通过语义、错误、路径和状态特征进行混合检索。所有结论均可追溯到原始事件，系统不依赖 LLM 生成，也不自动执行代码修改。

## 54.3 核心创新

> 项目的核心创新不是让 Agent 拥有一个普通历史搜索框，而是把不可计算的聊天日志转换为“带执行结果、失败尝试、验证状态和当前适用性”的工程轨迹索引。

## 54.4 关键演示

1. 普通语义搜索只返回相似会话；
2. 新经验搜索准确还原两次修改与两次验证；
3. 明确展示第一次失败、第二次成功；
4. 删除或重命名相关文件后，状态提示发生变化；
5. 通过 MCP 查询失败尝试，但系统不执行任何动作。

---

# 55. 新开发者第一天应该做什么

按以下顺序：

1. 阅读 `PROJECT_ANALYSIS.md` 的项目定位、Scanner、Parser、Importer、Embedding、Search 部分；
2. 本地运行现有测试，确认基线；
3. 浏览 `sample-data` 中 Codex 与 Claude fixture；
4. 执行 fixture 清点脚本，确认工具事件真实字段；
5. 完成 M0 开关与版本；
6. 创建 `ParsedRawTraceEvent` 类型；
7. 只实现一个 Claude `tool_use -> tool_result` 精确配对 fixture；
8. 写测试确认重复扫描幂等；
9. 再扩展 Codex；
10. 在 Trace 稳定前不要开始 Experience UI。

第一周理想成果：

```text
一条 Claude 或 Codex 历史中的 shell 命令与结果，能够被安全解析、配对、脱敏，并作为 agent_trace_event 写入数据库。
```

第二周理想成果：

```text
一段“修改 -> 测试失败 -> 再修改 -> 测试成功”的 fixture，能够生成两个 attempt。
```

第三周理想成果：

```text
经验搜索 API 和前端能够展示成功、失败、未验证分组。
```

---

# 56. 最终一句话

本项目接下来要开发的不是一个会替开发者思考和修改代码的 Agent，而是一个能够从多种 Coding Agent 日志中，可靠还原“做了什么、验证结果如何、哪些尝试失败、当前是否可能过期”的本地证据化工程记忆系统。

开发主线必须始终保持：

```text
原始日志
-> 工具调用与结果
-> 确定性证据
-> 任务与尝试
-> 模板化经验
-> 混合检索
-> 当前状态
-> 可追溯展示
```

只要按照这条主线实施，第一次接触项目的开发者就能清楚知道：为什么开发、用户最终得到什么、每个模块承担什么，以及下一步应该从哪一个文件和测试开始。
