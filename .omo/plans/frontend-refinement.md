# frontend-refinement - Work Plan

## TL;DR (For humans)

**What you'll get:** 前端将焕然一新 — 精致的毛玻璃风格界面、流畅的页面过渡动画、暗色模式切换、统一的现代组件库，搜索、会话详情、源管理、扫描任务四个页面全面升级视觉与交互体验。

**Why this approach:** 项目已安装 HeroUI 组件库和 framer-motion 动画库但几乎未使用，当前大量使用原生 HTML 和硬编码 CSS。通过全面迁移到已有的现代组件库并启用动画，在不引入新依赖（仅 next-themes 用于暗色模式）的前提下实现最大化的视觉提升。保留现有 teal+米色色彩基因确保品牌延续性。

**What it will NOT do:** 不改变后端 API 和数据契约；不改变现有测试的 DOM 合约（aria-label、按钮文本、状态文本等）；不引入除 next-themes 外的新依赖；不使用 innerHTML 等不安全渲染；不添加删除确认弹窗（测试约束要求单击删除直接执行）。

**Effort:** Large
**Risk:** Medium - 重构面广但测试红线已完全映射，有明确安全边界
**Decisions I made for you:**
- 设计风格: Modern Glassmorphism + 微交互动画（2025-2026 主流趋势）
- 暗色模式: next-themes + class 策略，默认 light 主题
- 色彩: 保留 teal #0f766e + 米色 #f5f4ef 为 light，新增 dark tokens
- 搜索交互: 搜索即输入 + 300ms 防抖（可选增强，保留手动 Search 按钮）
- 表格: 列精简 + 响应式隐藏低优先列
- 消息气泡: 5 种角色（user/assistant/tool/system/unknown）各有独立视觉样式
- 删除操作: 保留现有单击删除行为（测试约束），不加 Modal 确认
- ScanJobs 状态筛选: 客户端 Tabs 筛选（API 不支持 status 参数）
- 过滤器折叠: 使用 HeroUI Accordion（HeroUI 无 Collapse/Disclosure 组件）

Your next move: `$start-work` 开始执行。完整执行详情见下方。

---

> TL;DR (machine): Large effort, Medium risk — 6 个独立组件的 HeroUI+framer-motion+暗色模式全面迁移，3 层依赖（主题→导航→4 页面并行），10 个现有测试守护 DOM 合约红线

## Scope
### Must have
- HeroUI 主题配置系统 (`hero.ts`)：light + dark 双主题，保留 teal/米色基因
- next-themes 暗色模式集成：ThemeProvider + ThemeSwitch 组件（含 mounted guard 防 hydration mismatch）
- AppShell 重构：HeroUI 导航组件 + usePathname active 路由 + 移动端响应式 + `"use client"` 指令
- 页面过渡动画：`app/template.tsx` + framer-motion AnimatePresence
- 搜索页：HeroUI Input 替换原生 input + Accordion 可折叠过滤器 + Skeleton 骨架屏 + 结果卡片 stagger 动画
- 会话详情页：message-bubble 5 角色视觉区分 + metadata 分组 Card + ScrollShadow + Skeleton + resume-command-box HeroUI 化
- 源管理页：HeroUI Table 替换原生表格 + HeroUI 表单组件 + Switch 替换 checkbox（保留单击删除行为）
- 扫描任务页：HeroUI Table + 客户端 Tabs 状态筛选 + 列精简 + Skeleton
- 共享组件优化：page-header / state-block / status-badge 视觉升级（保持 DOM 合约）
- 所有 10 个现有测试文件通过（DOM 合约红线不变）

### Must NOT have (guardrails, anti-slop, scope boundaries)
- 不改变 9 个 API 路由 (`/api/sources`, `/api/sources/presets`, `/api/sources/:id`, `/api/scan/run/:sourceId`, `/api/scan-jobs`, `/api/search/semantic`, `/api/sessions/:id`)
- 不改变 packages/shared 类型定义
- 不引入除 next-themes 外的新依赖（HeroUI/framer-motion/lucide-react 已安装）
- 不改变 data-testid (`message-bubble-${role}`)、19 个 aria-label、4 个导航文本、12 个表单标签、14 个按钮文本、20+ 状态文本
- 不改变 `justify-end`(user)/`justify-start`(assistant)/`justify-center`(tool) class
- 不改变格式化逻辑（scan interval 900→"15 min", score `(score*100).toFixed(1)+"%"`, error 96 字符截断, 分页 `"Page {n} of {total}"`）
- 不使用 innerHTML/dangerouslySetInnerHTML（XSS 安全契约）
- 不改变 SearchBox 中的 aria-invalid + aria-describedby 无障碍契约（注意：SourceForm 当前无 aria-invalid，不需要添加）
- 不添加删除确认 Modal（`source-workspace.test.tsx:143` 期望单击 Delete 后直接行消失）
- 不做后端/API 修改
- 不做 E2E 测试（项目无 E2E 基础设施）
- 不改变 vitest 配置
- 不使用 HeroUI Collapse/Disclosure（不存在），用 Accordion 或 framer-motion AnimatePresence 替代
- 不改变 ScanJobs API 调用（API 只支持 page/pageSize，Tabs 筛选纯客户端过滤）
- 不改变 scan-jobs-workspace.tsx 的分页请求逻辑（PAGE_SIZE=20, latestRequestId 并发保护）

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after + 现有测试保持绿色（10 个测试文件是 DOM 合约红线守护者）
- Framework: Vitest + jsdom + @testing-library/react
- Evidence: .omo/evidence/task-<N>-frontend-refinement.<ext>
- 每个 todo 完成后运行 `pnpm --filter web test` 验证所有测试通过
- 视觉验证: `pnpm --filter web dev` 启动 dev server + Playwright MCP `browser_navigate` + `browser_take_screenshot`
- 类型验证: `pnpm --filter web exec tsc --noEmit`
- Lint 验证: `pnpm --filter web lint`

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- **Wave 1** (前置): Task 1 — DesignSystem 主题基础设施
- **Wave 2** (前置): Task 2 — AppShell & Navigation + 页面过渡
- **Wave 3** (并行 ×4): Task 3 (SearchPage) + Task 4 (SessionDetailPage) + Task 5 (SourcesPage) + Task 6 (ScanJobsPage)
- **Wave 4** (审查): Final verification wave (agent 自动化)

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1. DesignSystem | — | 2,3,4,5,6 | — |
| 2. AppShell | 1 | 3,4,5,6 | — |
| 3. SearchPage | 1,2 | — | 4,5,6 |
| 4. SessionDetailPage | 1,2 | — | 3,5,6 |
| 5. SourcesPage | 1,2 | — | 3,4,6 |
| 6. ScanJobsPage | 1,2 | — | 3,4,5 |

### 共享组件归属
- **page-header.tsx**: 归 Task 3（SearchPage 首先使用），视觉升级但不改 DOM 结构
- **state-block.tsx**: 归 Task 1（DesignSystem），因 LoadingState 需切换到 Skeleton，被所有页面共用
- **status-badge.tsx**: 归 Task 1（DesignSystem），视觉升级保持 Chip 用法
- **resume-command-box.tsx**: 归 Task 4（SessionDetailPage），因被 search-result-card 和 session-detail 共用，Task 3 不修改此组件，Task 4 统一升级
- **search-result-card.tsx**: 归 Task 3，如需引用 resume-command-box 只做 props 传递不改其内部

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. DesignSystem: HeroUI 主题配置 + 暗色模式 + ThemeSwitch + 共享组件升级
  What to do / Must NOT do:
  - 安装 next-themes: `pnpm --filter web add next-themes`
  - 创建 `apps/web/hero.ts`：导出 heroui() plugin 配置，包含 light + dark 双主题
    - light 主题: 保留现有色调 — primary #0f766e (teal), background #f5f4ef, foreground #1f2933, divider #d8d1c3, content1-4 渐进色阶
    - dark 主题: 深色背景 #0a0a0a / #1a1a1a, foreground #ededed, primary #14b8a6 (亮 teal), divider #2a2a2a
    - layout tokens: radius small=0.5rem/medium=0.75rem/large=1rem, borderWidth=1px
  - 重构 `apps/web/app/globals.css`：
    - 注意：globals.css 位于 `apps/web/app/` 下，hero.ts 位于 `apps/web/` 下，`@plugin` 路径必须为 `@plugin "../hero.ts"`（相对路径）
    - 当前 globals.css 已有 `@config "../tailwind.config.mjs"` 加载 heroui() plugin — 替换为 `@plugin "../hero.ts"` 方式，删除 `@config` 行，因为 hero.ts 中会调用 heroui() 并传入主题配置
    - 保留 `:root` CSS 变量作为 fallback，添加 `.dark` 选择器下的 dark 变量
    - 添加 `:root[class~="dark"]` 变量集
  - 创建 `apps/web/components/theme-switch.tsx`：
    - `"use client"` 指令
    - HeroUI Button isIconOnly + useTheme hook + Sun/Moon 图标 (lucide-react)
    - **mounted guard**: `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), []);` 未 mounted 时返回 null 或占位，防止 hydration mismatch
  - 更新 `apps/web/app/providers.tsx`（注意路径：`app/providers.tsx` 不是 `components/providers.tsx`）：
    - 包裹 NextThemesProvider, attribute="class", defaultTheme="light", enableSystem=false
    - 保留 HeroUIProvider locale="zh-CN", reducedMotion="user"
  - 更新 `apps/web/app/layout.tsx`：html 添加 `suppressHydrationWarning`
  - 升级 `apps/web/components/state-block.tsx`：LoadingState 用 HeroUI Skeleton 替换 Spinner（保持组件接口不变）
  - 升级 `apps/web/components/status-badge.tsx`：视觉微调保持 HeroUI Chip 用法
  - Must NOT do: 不删除现有 `--app-*` CSS 变量（其他组件还在用），不改变 providers.tsx 中 HeroUIProvider locale="zh-CN"
  Parallelization: Wave 1 | Blocked by: — | Blocks: 2,3,4,5,6
  References (executor has NO interview context - be exhaustive):
  - apps/web/package.json:2 — name="web"（不是 @clisearch/web，所有 pnpm filter 命令用 `web`）
  - apps/web/tailwind.config.mjs (15行, 当前 heroui() plugin 配置, content 含 heroui theme path)
  - apps/web/app/globals.css (45行, 当前 CSS 变量 + @config "../tailwind.config.mjs")
  - apps/web/app/providers.tsx (HeroUIProvider, locale="zh-CN", reducedMotion="user") — 路径在 app/ 下不是 components/
  - apps/web/app/layout.tsx:6 — import from "./providers" (确认 providers 在 app/ 下)
  - apps/web/components/state-block.tsx (63行, LoadingState 用 Spinner, EmptyState 用 Inbox, ErrorState 用 AlertTriangle+Retry)
  - apps/web/components/status-badge.tsx (27行, HeroUI Chip, 4 tone: neutral/success/warning/danger)
  - HeroUI 主题配置结构: themes: { light: { colors: { background, foreground, divider, focus, primary, secondary, success, warning, danger, default, content1-4 }, layout: { radius: { small, medium, large }, borderWidth, disabledOpacity, hoverOpacity, fontSize } }, dark: { ... } }
  - Tailwind v4 @plugin 语法: `@plugin "../hero.ts";`（globals.css 在 app/ 下，hero.ts 在 apps/web/ 根）
  - next-themes: ThemeProvider attribute="class" defaultTheme="light", useTheme() returns { theme, setTheme, resolvedTheme }
  - mounted guard 模式: useState(false) + useEffect setMounted(true), 未 mounted 返回 null
  Acceptance criteria (agent-executable):
  - `pnpm --filter web exec tsc --noEmit` 零错误
  - `pnpm --filter web test` 所有 10 个测试通过
  - `apps/web/hero.ts` 文件存在且导出 heroui 配置
  - `apps/web/components/theme-switch.tsx` 文件存在且含 mounted guard
  - `apps/web/package.json` 包含 next-themes 依赖
  - `apps/web/app/globals.css` 包含 `@plugin "../hero.ts"` 和 `.dark` 变量
  - `apps/web/app/providers.tsx` 包含 NextThemesProvider
  QA scenarios (name the exact tool + invocation):
  - happy: `pnpm --filter web test` → 10/10 pass; `pnpm --filter web exec tsc --noEmit` → 0 errors
  - failure: 验证 @plugin 路径正确性 — `grep '@plugin' apps/web/app/globals.css` 输出应为 `@plugin "../hero.ts"`（不是 `"./hero.ts"`）
  - Evidence .omo/evidence/task-1-frontend-refinement.txt
  Commit: Y | feat(web): 🎨 配置 HeroUI 双主题与暗色模式基础设施

- [x] 2. AppShell & Navigation: HeroUI 导航 + active 路由 + 移动端 + 页面过渡
  What to do / Must NOT do:
  - 重构 `apps/web/components/app-shell.tsx`：
    - **添加 `"use client"` 指令**（当前无此指令，引入 usePathname 必需）
    - 使用 usePathname() 获取当前路由，为 active 导航项添加视觉区分（HeroUI 样式或 accent 色背景+左侧指示条）
    - 桌面端：固定左侧垂直导航栏 (w-16 collapsed / w-56 expanded)，HeroUI Button variant={active ? "flat" : "light"} 配色
    - 移动端：底部固定 Tab Bar 或顶部水平导航，使用 HeroUI ButtonGroup 或 Tabs
    - 导航项: Search (Search icon), Sources (Database icon), Scan Jobs (ScanLine icon), Settings (Settings icon) — 4 个导航文本不变
    - 在导航栏底部放置 ThemeSwitch 组件
    - 保留 `aria-label="Primary navigation"` 在 nav 元素上
  - 创建 `apps/web/app/template.tsx`：
    - `"use client"` 指令
    - 使用 usePathname() 作为 key
    - framer-motion AnimatePresence mode="wait"
    - motion.div: initial={opacity:0, y:20} animate={opacity:1, y:0} exit={opacity:0, y:-20} transition={{duration: 0.2, ease: "easeOut"}}
  - Must NOT do: 不改变 4 个导航文本 ("Search", "Sources", "Scan Jobs", "Settings"), 不删除 `aria-label="Primary navigation"`, 不改变 app/page.tsx redirect 逻辑
  - **测试适配**: app-shell.test.tsx 直接渲染 AppShell 组件（不通过 Next.js 路由），引入 usePathname() 后需要 mock `next/navigation`。在 app-shell.test.tsx 中添加 `vi.mock("next/navigation", () => ({ usePathname: () => "/search" }))` 或在组件中添加 fallback 处理。**允许修改测试文件中的 mock 设置**，但不改变测试断言。
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 3,4,5,6
  References:
  - apps/web/components/app-shell.tsx (74行, 当前无 "use client", 硬编码 CSS, 无 active 路由)
  - apps/web/components/theme-switch.tsx (Task 1 创建, 含 mounted guard)
  - apps/web/app/page.tsx (redirect to /search)
  - 4 个导航路由: /search, /sources, /scan-jobs, /settings(当前无页面但导航项存在)
  - framer-motion template.tsx 模式: "use client" + usePathname + AnimatePresence mode="wait" + motion.div key={pathname}
  - 测试约束: app-shell.test.tsx (22行) 只验证导航壳渲染，4 个导航文本必须存在，直接渲染组件（需 mock next/navigation）
  Acceptance criteria (agent-executable):
  - `pnpm --filter web test` 所有 10 个测试通过（含 app-shell.test.tsx）
  - `pnpm --filter web exec tsc --noEmit` 零错误
  - `apps/web/app/template.tsx` 文件存在且含 "use client"
  - `apps/web/components/app-shell.tsx` 含 "use client" 和 usePathname() 且包含 aria-label="Primary navigation"
  - 导航文本 "Search", "Sources", "Scan Jobs", "Settings" 均存在
  QA scenarios:
  - happy: `pnpm --filter web test` → 10/10 pass; Playwright MCP: `browser_navigate` url="http://localhost:3000/search" → `browser_take_screenshot` → 截图显示 Search 导航项为 active 状态（accent 色高亮）
  - failure: `grep '"use client"' apps/web/components/app-shell.tsx` → 必须有输出（验证 client 指令存在）
  - Evidence .omo/evidence/task-2-frontend-refinement.png (Playwright 截图)
  Commit: Y | feat(web): 🧭 重构导航壳为 HeroUI 组件并添加页面过渡动画

- [x] 3. SearchPage: HeroUI Input + Accordion 过滤器 + 骨架屏 + 结果卡片动画
  What to do / Must NOT do:
  - 重构 `apps/web/components/search-box.tsx`：
    - 原生 input → HeroUI Input: isClearable, size="md", variant="bordered", radius="lg", startContent={Search icon}
    - **HeroUI Input 需设置 `validationBehavior="aria"`** 确保 aria-invalid 属性正确传递到 native input 元素
    - 5 个字段标签不变: "Semantic query", "Agent filter", "CWD keyword", "Top K", "Session limit"
    - 主行: Semantic query (大输入框, 占满) + Top K + Session limit (小输入框, w-24)
    - 过滤器行: Agent filter + CWD keyword，用 **HeroUI Accordion**（HeroUI 无 Collapse/Disclosure）包裹，默认折叠，点击展开
    - **搜索即输入（可选增强）**: Semantic query 输入时防抖 300ms 自动触发搜索。**注意：如果测试断言只有点击 Search 按钮才触发搜索，则保留手动搜索为主路径，搜索即输入仅在非空 query 时作为快捷方式**。保留手动 Search 按钮。
    - 验证逻辑和错误消息不变: "Semantic query不能为空", "Top K must be between 1 and 100.", "Session limit must be between 1 and 50."
    - **aria-invalid + aria-describedby 只在 SearchBox 中存在**（search-box.tsx:118-119），迁移到 HeroUI Input 时必须保留这些属性
  - 重构 `apps/web/components/search-result-card.tsx`：
    - 使用 HeroUI Card radius="lg" + glassmorphism 样式 (bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/20)
    - score badge: HeroUI Chip color="primary" variant="flat"
    - framer-motion stagger: container variants staggerChildren=0.06, item variants y:16→0 opacity:0→1
    - "Open detail for ${title}" aria-label 保留
    - **resume-command-box.tsx 不在此 Task 修改**（归 Task 4），只保持现有引用不变
  - 重构 `apps/web/components/search-workspace.tsx`：
    - loading 状态: 使用 Task 1 升级后的 state-block LoadingState（含 Skeleton）
    - AnimatePresence mode="wait": Skeleton exit={opacity:0} → content initial={opacity:0,y:10} animate={opacity:1,y:0}
    - "Search workspace" aria-label 保留, "Loading search results" / "Search unavailable" / "No matching sessions" / "No query submitted" 文本保留
  - 升级 `apps/web/components/page-header.tsx`：视觉微调（eyebrow + title + subtitle + actions 布局优化），保持组件接口不变
  - Must NOT do: 不改变 search-types.ts 验证逻辑, 不改变 5 个表单标签, 不改变错误消息文本, 不改变 aria-label, 不改变 resume-command-box.tsx, 不改变 aria-invalid + aria-describedby
  Parallelization: Wave 3 | Blocked by: 1,2 | Blocks: — | Can parallelize with: 4,5,6
  References:
  - apps/web/components/search-workspace.tsx (124行, 状态机 idle/loading/ready/error)
  - apps/web/components/search-box.tsx (136行, 原生 input + 自定义 TextField, **aria-invalid 在 118-119 行**)
  - apps/web/components/search-result-card.tsx (99行, title+badges+chunks+resume, 引用 resume-command-box)
  - apps/web/components/search-types.ts (72行, SearchFormState + parseSearchForm)
  - apps/web/components/page-header.tsx (24行, eyebrow + title + subtitle + actions)
  - 测试: search-workspace.test.tsx (218行), search-workspace-adversarial.test.tsx (208行, XSS + overlong query + copy fallback at line 127,151)
  - 测试约束: 5 表单标签, 按钮 "Search", "Open detail", 状态文本, **aria-invalid + aria-describedby (search-box.tsx:118-119)**, XSS 安全, overlong query 处理, copy fallback
  - HeroUI Accordion API: import {Accordion, AccordionItem} from @heroui/react; selectionMode="single" selectedKeys onSelectionChange
  Acceptance criteria (agent-executable):
  - `pnpm --filter web test` 所有 10 个测试通过（含 search-workspace + adversarial）
  - `pnpm --filter web exec tsc --noEmit` 零错误
  - search-box.tsx 使用 HeroUI Input 组件（含 validationBehavior="aria"）
  - 5 个表单标签 "Semantic query" "Agent filter" "CWD keyword" "Top K" "Session limit" 均存在
  - 错误消息 "Semantic query不能为空" "Top K must be between 1 and 100." "Session limit must be between 1 and 50." 均存在
  - aria-invalid 和 aria-describedby 在 search-box.tsx 中仍存在
  QA scenarios:
  - happy: `pnpm --filter web test` → 10/10 pass; Playwright MCP: `browser_navigate` url="http://localhost:3000/search" → `browser_snapshot` → 验证 HeroUI 输入框存在 → `browser_take_screenshot`
  - failure: `grep 'aria-invalid' apps/web/components/search-box.tsx` → 必须有输出（验证 aria-invalid 保留）
  - Evidence .omo/evidence/task-3-frontend-refinement.png
  Commit: Y | feat(web): 🔍 搜索页迁移 HeroUI 组件并添加骨架屏与动画

- [x] 4. SessionDetailPage: 消息气泡区分 + metadata 分组 + ScrollShadow + resume-command-box 升级
  What to do / Must NOT do:
  - 重构 `apps/web/components/message-bubble.tsx`：
    - 5 种 role 视觉区分:
      - user: 右对齐 (justify-end), accent/teal 背景气泡, rounded-2xl rounded-br-sm
      - assistant: 左对齐 (justify-start), 面板色背景气泡, rounded-2xl rounded-bl-sm, 最大宽度 85%
      - tool: 居中 (justify-center), 等宽字体, 浅灰背景, rounded-lg, Wrench 图标前缀
      - system: 居中 (justify-center), 警告色边框, 半透明背景, rounded-lg, Info 图标前缀
      - unknown: 居中 (justify-center), 虚线边框, 问号图标前缀
    - `data-testid="message-bubble-${role}"` 保留
    - `justify-end`(user) / `justify-start`(assistant) / `justify-center`(tool/system/unknown) class 保留
  - 重构 `apps/web/components/session-detail-workspace.tsx`：
    - 左侧消息列表: HeroUI ScrollShadow orientation="vertical" size=60 hideScrollBar, h-[calc(100vh-8rem)]
    - **测试适配**: ScrollShadow 会包裹内容添加 DOM 层级。如果 session-detail-workspace.test.tsx 用 getByRole/queryByText 查找消息内容，DOM 层级变化不影响这些查询。但如果用 container.querySelector 等结构化查询，需确保测试通过。**允许修改测试中的选择器**，但不改变断言。
    - 右侧 metadata: 用 HeroUI Card 分组 (基本信息卡片 + 时间线卡片 + 统计卡片)
    - loading 状态: HeroUI Skeleton (消息骨架 + metadata 骨架)
    - "Session detail workspace" aria-label 保留
    - "Loading session" / "Session unavailable" / "No messages" 文本保留
  - 重构 `apps/web/components/resume-command-box.tsx`（此组件被 search-result-card 和 session-detail 共用，在此 Task 统一升级）：
    - HeroUI Card 包裹, 使用 HeroUI Button 复制按钮
    - "Copy resume command for ${threadId}" / "Manual resume command for ${threadId}" aria-label 保留
    - "Copy" / "Copied" 按钮文本保留
    - "Clipboard unavailable. Select and copy the command manually." fallback 文本保留
    - **注意**: search-result-card.tsx (Task 3) 引用此组件，升级后接口必须保持兼容（props 不变）
  - Must NOT do: 不改变 data-testid, 不改变 justify-* class, 不改变 aria-label, 不改变按钮文本, 不改变状态文本, 不改变 resume-command-box 的 props 接口
  Parallelization: Wave 3 | Blocked by: 1,2 | Blocks: — | Can parallelize with: 3,5,6
  References:
  - apps/web/components/session-detail-workspace.tsx (164行, 左消息+右 metadata 22rem, 引用 resume-command-box at line 11,126)
  - apps/web/components/message-bubble.tsx (70行, 5 role 样式, tool/system/unknown 当前相同)
  - apps/web/components/resume-command-box.tsx (89行, clipboard + fallback, 也被 search-result-card.tsx:8,72 引用)
  - 测试: session-detail-workspace.test.tsx (233行, 气泡/复制/错误/XSS/stale request requestIdRef)
  - 测试约束: data-testid=message-bubble-${role}, justify-end/start/center, aria-label ("Copy resume command for ${threadId}", "Manual resume command for ${threadId}"), "Copy"/"Copied", "No messages", "Loading session", "Session unavailable", "Clipboard unavailable...", XSS 安全, stale request 保护
  Acceptance criteria (agent-executable):
  - `pnpm --filter web test` 所有 10 个测试通过（含 session-detail + search-workspace，因 resume-command-box 共用）
  - `pnpm --filter web exec tsc --noEmit` 零错误
  - message-bubble.tsx 中 5 种 role 有不同的 className/style
  - data-testid="message-bubble-${role}" 存在
  - justify-end(user)/justify-start(assistant)/justify-center(tool) class 存在
  - resume-command-box.tsx 的 props 接口与升级前兼容
  QA scenarios:
  - happy: `pnpm --filter web test` → 10/10 pass; Playwright MCP: `browser_navigate` url="http://localhost:3000/sessions/test-session-id" → `browser_take_screenshot` → 显示 5 种气泡样式
  - failure: `grep 'data-testid' apps/web/components/message-bubble.tsx` → 必须含 `message-bubble-${role}` 模板
  - Evidence .omo/evidence/task-4-frontend-refinement.png
  Commit: Y | feat(web): 💬 会话详情页气泡区分与 metadata 分组重构

- [x] 5. SourcesPage: HeroUI Table + 表单 + Switch（保留单击删除）
  What to do / Must NOT do:
  - 重构 `apps/web/components/source-table.tsx`：
    - 原生 table → HeroUI Table: isStriped, isHeaderSticky, isLoading, loadingContent={Skeleton}
    - **测试适配**: HeroUI Table 改变 DOM 层级（table → HeroUI Table 内部结构）。如果测试用 container.querySelector('table') 或遍历 tr/td，需适配选择器。**允许修改测试中的 DOM 选择器**，但不改变断言。
    - 列精简: 合并显示 Name + Preset 为一列, RootPath + FileGlob 用 Tooltip/展开显示, ScanInterval + LastScan 合并时间列
    - Enabled: 原生 checkbox → HeroUI Switch, 保留 `aria-label="Toggle ${source.name}"`
    - **测试适配**: HeroUI Switch 的 DOM 结构与原生 checkbox 不同。如果测试用 getByRole('checkbox') 查找，需改为 getByLabelText 或其他查询。**允许修改测试中的查询方式**，但不改变断言。
    - 操作: Scan/Edit/Delete → HeroUI ButtonGroup, 保留 aria-label
    - "Scan ${source.name}" / "Edit ${source.name}" / "Delete ${source.name}" aria-label 保留
    - **删除操作: 保留现有单击删除行为，不加 Modal 确认弹窗**。`source-workspace.test.tsx:143` 点击 Delete 后直接期望行消失，加 Modal 会破坏此测试。
    - 空状态: "No sources configured" 保留
  - 重构 `apps/web/components/source-form.tsx`：
    - 原生 input/select/checkbox → HeroUI Input/Select/Switch/Textarea
    - "Preset" aria-label 保留 (HeroUI Select)
    - 7 个字段标签不变: "Source name", "Root path", "File glob", "Parser type", "Reader type", "Scan interval seconds", "Resume template"
    - 验证错误消息不变: "Root path must be absolute or home-relative.", "Scan interval must be an integer from 60 to 86400 seconds."
    - **注意: SourceForm 当前无 aria-invalid**（已验证 grep 无结果），不需要添加。aria-invalid 约束只在 SearchBox 中。
  - 重构 `apps/web/components/source-workspace-view.tsx`：
    - xl:grid-cols-[minmax(0,1fr)_24rem] 布局保留
    - create/edit 模式切换保留
    - "Sources workspace" aria-label 保留
  - 重构 `apps/web/components/source-workspace.tsx`：
    - "Refresh sources" aria-label 保留
    - "Scan completed" 文本保留
    - CRUD 操作逻辑不变
  - Must NOT do: 不改变 source-types.ts, 不改变 aria-label, 不改变字段标签, 不改变错误消息, 不改变 API 调用, **不添加删除确认 Modal**, 不添加 aria-invalid（SourceForm 当前无此属性）
  Parallelization: Wave 3 | Blocked by: 1,2 | Blocks: — | Can parallelize with: 3,4,6
  References:
  - apps/web/components/source-workspace.tsx (196行, CRUD + scan/toggle/delete)
  - apps/web/components/source-workspace-view.tsx (153行, 视图分发)
  - apps/web/components/source-form.tsx (248行, 原生 input/select/checkbox, **无 aria-invalid**)
  - apps/web/components/source-table.tsx (192行, 10 列原生 table)
  - apps/web/components/source-types.ts (109行, 类型 + 转换函数)
  - 测试: source-workspace.test.tsx (282行, **line 143: 点击 Delete 直接期望行消失**), source-scan-interval.test.tsx (186行, scan interval edge cases: 空/59/86401/小数/负数/科学计数法/超大数)
  - 测试约束: "Preset" aria-label, "Toggle ${source.name}", "Scan/Edit/Delete ${source.name}", "Refresh sources", "No sources configured", "Scan completed", 7 表单标签, 验证消息, scan interval edge cases
  Acceptance criteria (agent-executable):
  - `pnpm --filter web test` 所有 10 个测试通过（含 source-workspace + scan-interval）
  - `pnpm --filter web exec tsc --noEmit` 零错误
  - source-table.tsx 使用 HeroUI Table 组件
  - source-form.tsx 使用 HeroUI Input/Select 组件
  - 7 个字段标签存在, 4 个操作 aria-label 存在
  - **无 Modal 确认弹窗**（`grep -r 'Modal' apps/web/components/source-table.tsx` 应无 Delete Modal 相关输出）
  QA scenarios:
  - happy: `pnpm --filter web test` → 10/10 pass; Playwright MCP: `browser_navigate` url="http://localhost:3000/sources" → `browser_take_screenshot` → 显示 HeroUI Table + Switch
  - failure: 在 source-form 输入 scan interval=30 → `grep 'Scan interval must be an integer from 60 to 86400 seconds.' apps/web/components/source-form.tsx` → 必须有输出（验证错误消息保留）
  - Evidence .omo/evidence/task-5-frontend-refinement.png
  Commit: Y | feat(web): 📋 源管理页迁移 HeroUI Table 与表单组件

- [x] 6. ScanJobsPage: HeroUI Table + 客户端 Tabs 筛选 + 列精简
  What to do / Must NOT do:
  - 重构 `apps/web/components/scan-jobs-table.tsx`：
    - 原生 table → HeroUI Table: isStriped, isHeaderSticky, isLoading, loadingContent={Skeleton}
    - **测试适配**: HeroUI Table 改变 DOM 层级。**允许修改测试中的 DOM 选择器**，但不改变断言。
    - 列精简: Status(Chip) + Source(name+preset) + 时间(Started→Finished 合并显示) + 统计(Seen/Parsed/Failed/Imported 合并为"处理概要") + Error(ErrorSummary) + Actions
    - "Scan jobs" table aria-label 保留
    - "View error details for scan job ${jobId}" aria-label 保留
    - "View details" / "Hide details" 按钮文本保留
    - **错误详情: 保留现有展开/折叠方式（不用 Modal）**，因为测试期望 "View details"/"Hide details" 按钮切换，Modal 会改变交互模式
    - 分页: "Previous scan jobs page" / "Next scan jobs page" aria-label 保留, "Previous" / "Next" 文本保留, "Page {n} of {total}" 格式保留
  - 重构 `apps/web/components/scan-jobs-workspace.tsx`：
    - **添加 HeroUI Tabs 状态筛选: All / Running / Completed / Failed (variant="underlined" color="primary")**
    - **Tabs 是纯客户端筛选**：API 只支持 page/pageSize 参数，不支持 status 筛选。Tabs 选中后在前端过滤已加载的 items，不改变 API 调用。
    - **测试适配**: Tabs 添加新 DOM 元素。如果测试快照或结构化查询受影响，需适配。**允许修改测试中的选择器**，但不改变现有断言。可以新增 Tabs 相关测试。
    - loading 状态: "Loading scan jobs" 文本保留 + Skeleton
    - error 状态: "Scan jobs unavailable" 文本保留
    - empty 状态: "No scan jobs yet" 文本保留
    - "Scan jobs workspace" aria-label 保留
    - "Refresh scan jobs" aria-label 保留
    - **不改变分页请求逻辑**: PAGE_SIZE=20, latestRequestId 并发保护机制保留
  - Must NOT do: 不改变分页逻辑(PAGE_SIZE=20), 不改变 API 调用（Tabs 纯客户端筛选）, 不改变 aria-label, 不改变按钮文本, 不改变状态文本, 不改变格式化逻辑, 不改变 latestRequestId 并发保护, 不用 Modal 替代错误详情展开
  Parallelization: Wave 3 | Blocked by: 1,2 | Blocks: — | Can parallelize with: 3,4,5
  References:
  - apps/web/components/scan-jobs-workspace.tsx (115行, 分页 PAGE_SIZE=20, latestRequestId 并发保护)
  - apps/web/components/scan-jobs-table.tsx (212行, 10 列原生 table, ErrorSummary 展开/折叠)
  - 测试: scan-jobs-workspace.test.tsx (240行, 分页/截断/错误), scan-jobs-workspace-concurrency.test.tsx (144行, latestRequestId 并发竞争)
  - 测试约束: "Scan jobs" table aria-label, "View error details for scan job ${jobId}", "Previous/Next scan jobs page", "View details"/"Hide details", "Loading scan jobs", "Scan jobs unavailable", "No scan jobs yet", "Refresh scan jobs", "Page {n} of {total}", error 96 字符截断, latestRequestId 并发保护
  Acceptance criteria (agent-executable):
  - `pnpm --filter web test` 所有 10 个测试通过（含 scan-jobs + concurrency）
  - `pnpm --filter web exec tsc --noEmit` 零错误
  - scan-jobs-table.tsx 使用 HeroUI Table 组件
  - Tabs 状态筛选存在（All/Running/Completed/Failed）
  - 分页 aria-label 和文本存在
  - `grep 'latestRequestId' apps/web/components/scan-jobs-workspace.tsx` → 必须有输出（验证并发保护保留）
  QA scenarios:
  - happy: `pnpm --filter web test` → 10/10 pass; Playwright MCP: `browser_navigate` url="http://localhost:3000/scan-jobs" → `browser_take_screenshot` → 显示 HeroUI Table + Tabs
  - failure: `grep 'latestRequestId' apps/web/components/scan-jobs-workspace.tsx` → 必须有输出（验证并发保护未被删除）
  - Evidence .omo/evidence/task-6-frontend-refinement.png
  Commit: Y | feat(web): 📊 扫描任务页迁移 HeroUI Table 并添加客户端 Tabs 筛选

## Final verification wave
> Runs in parallel after ALL todos. Agent 自动化执行，产出证据文件，不需用户确认。
- [x] F1. Plan compliance audit: 验证所有 6 个 todo 的 acceptance criteria 都满足，所有 Scope Must NOT have 约束未被违反。DOM 合约红线全部保持 (data-testid, 23 aria-label, 4 导航文本, 12 表单标签, justify-* class, 无 innerHTML/dangerouslySetInnerHTML, aria-invalid+validationBehavior)
- [x] F2. Code quality review: `pnpm --filter web exec tsc --noEmit` 零错误
- [x] F3. Test suite: `pnpm --filter web test` 10/10 test files, 67/67 tests pass (3 次连续验证)
- [x] F4. Scope fidelity: 无 API 路由改变, 无 packages/shared 改变, 唯一新依赖 next-themes ^0.4.6, DOM 合约红线全部保持
- [x] F5. Visual QA: `pnpm --filter web dev` + Playwright 截图 3 个页面 (/search, /sources, /scan-jobs) — 页面渲染正确, HeroUI 组件生效, 导航+主题切换器+表单+Accordion+Table+Tabs 全部正常

## Commit strategy
- 每个 todo 一个 commit (feat 类型 + gitmoji)
- commit message 格式: `feat(web): <gitmoji> <summary>`
- 包含 Co-authored-by: Wine Fox <fox@ling.plus>
- Final verification wave 通过后可选 squash merge

## Success criteria
1. `pnpm --filter web test` → 10/10 测试通过
2. `pnpm --filter web exec tsc --noEmit` → 零类型错误
3. `pnpm --filter web lint` → 零 lint 错误
4. 4 个页面 Playwright 截图视觉验证通过（HeroUI 组件 + Glassmorphism + dark mode）
5. ThemeSwitch 可切换 light/dark 主题（含 mounted guard）
6. 页面过渡动画流畅 (framer-motion)
7. 所有 DOM 合约红线不变（data-testid, aria-label, 按钮文本, 状态文本, 格式化逻辑）
8. 无新依赖（除 next-themes）
9. 无 API/packages/shared 改变
10. 无删除确认 Modal（保留单击删除行为）
11. ScanJobs Tabs 纯客户端筛选（API 调用不变）
12. resume-command-box props 接口兼容（search-result-card + session-detail 共用）
