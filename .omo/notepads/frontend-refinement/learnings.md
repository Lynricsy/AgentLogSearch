# Learnings — frontend-refinement

## 项目关键事实
- 包名: `web` (不是 @clisearch/web)，所有 pnpm filter 命令用 `pnpm --filter web`
- providers.tsx 路径: `apps/web/app/providers.tsx` (不是 components/)
- globals.css 路径: `apps/web/app/globals.css`，当前有 `@config "../tailwind.config.mjs"`
- hero.ts 将在 `apps/web/hero.ts`，@plugin 路径为 `@plugin "../hero.ts"` (相对 globals.css)
- app-shell.tsx 当前无 "use client" 指令
- search-box.tsx:118-119 有 aria-invalid + aria-describedby
- source-form.tsx 无 aria-invalid
- source-workspace.test.tsx:143 点击 Delete 直接期望行消失（不加 Modal）
- resume-command-box.tsx 被 search-result-card + session-detail-workspace 共用
- HeroUI 无 Collapse/Disclosure，只有 Accordion
- ScanJobs API 只支持 page/pageSize，Tabs 筛选纯客户端

## 测试约束红线
- 10 个测试文件: 8 组件 + 2 lib
- data-testid: message-bubble-${role}
- 19 aria-label, 4 导航文本, 12 表单标签, 14 按钮文本, 20+ 状态文本
- justify-end(user)/justify-start(assistant)/justify-center(tool) class
- 格式化: scan interval, score %, error 96 字符截断, 分页 "Page {n} of {total}"
- XSS 安全: 禁止 innerHTML/dangerouslySetInnerHTML
- 9 API 路由不变

## 允许的测试修改
- mock 设置 (如 vi.mock next/navigation)
- DOM 选择器适配 (HeroUI 组件层级变化)
- 不允许改变断言
- 可以新增测试

## Task 1: DesignSystem 完成记录 (2026-06-21)
- hero.ts 导出 `heroPlugin` (heroui() 返回值)，不是直接导出 heroui() 调用结果
- HeroUI ColorScale 可用 string (设为 DEFAULT) 或 { DEFAULT, foreground } 对象
- @plugin "../hero.ts" 从 globals.css 加载 HeroUI 主题 (Tailwind v4 @plugin 语法)
- globals.css 保留 @import "tailwindcss" 在最前，@plugin 紧跟其后
- next-themes ThemeProvider 包裹 HeroUIProvider (外层)，attribute="class" defaultTheme="light" enableSystem={false}
- html suppressHydrationWarning 必须加，否则 next-themes 注入 class 时 React 报 hydration mismatch
- ThemeSwitch mounted guard: useState(false) + useEffect setMounted(true)，未 mounted 返回 null
- LoadingState 用 Skeleton 替换 Spinner 时，title 必须保持可见 (h2 标签)，description 可放 sr-only
  - scan-jobs-workspace.test.tsx:30 用 findByText("Loading scan jobs").toBeVisible() 断言
  - sr-only 元素 toBeVisible() 会失败，因为 sr-only 把元素视觉隐藏了
- dark 模式 CSS 变量用 :root[class~="dark"] 选择器 (next-themes attribute="class" 注入 class="dark" 到 html)
- tailwind.config.mjs 保留不删除，globals.css 不再引用它 (改用 @plugin)
- next-themes 版本: ^0.4.6
- lucide-react 1.18.0 有 Sun 和 Moon 图标 (lucide-react/dist/esm/icons/sun.mjs, moon.mjs)

## Task 2: AppShell & Navigation 完成记录 (2026-06-21)
- app-shell.tsx 添加 "use client" 指令 (引入 usePathname 必需)
- usePathname() from next/navigation 获取当前路由，active 项用 HeroUI Button variant="flat" color="primary"
- HeroUI Button 支持 as={Link} 语法，配合 href 属性实现客户端导航
- ScanLine 图标替换 History 图标给 Scan Jobs (lucide-react 1.18.0 有 scan-line.mjs)
- ThemeSwitch 放在 aside 底部 (lg:mt-auto 推到桌面端侧边栏底部)
- 单 nav 元素 + 响应式 CSS: 移动端水平 overflow-x-auto，桌面端 lg:flex-col 垂直
- 测试 mock: vi.mock("next/navigation", () => ({ usePathname: () => "/search" })) 必须在 import AppShell 之前
- template.tsx: framer-motion AnimatePresence mode="wait" + motion.div key={pathname} 实现页面过渡
- template.tsx 与 layout.tsx 区别: template 在每次导航时重新挂载，layout 保持不变
- 10/10 测试通过 (67 tests)，tsc --noEmit 0 errors

## Task 3: SearchPage HeroUI 过滤器 + 骨架屏 + 动画 完成记录 (2026-06-21)
- HeroUI Input `label` prop 创建 `<label for>` 关联 native input，`getByLabelText` 可找到可见输入框
- HeroUI Accordion 折叠时内容 hidden，`getByLabelText` 默认找不到折叠区内的 input → 测试需先 `fireEvent.click(screen.getByRole("button", { name: "Filters" }))` 展开 Accordion
- `getByLabelText` 的 TypeScript 类型不含 `hidden` 选项（`SelectorMatcherOptions` 无此字段），不能传 `{ hidden: true }`
- HeroUI Input `validationBehavior="aria"` + `isInvalid={Boolean(err)}` + `errorMessage={err}` 正确设置 `aria-invalid="true"` 和 `aria-describedby` 到 native input
- framer-motion `initial={false}` 跳过入场动画，确保 jsdom 测试中 `toBeVisible()` 通过（`initial={{ opacity: 0 }}` 会让 `toBeVisible()` 检测到 `opacity:0` 而失败）
- framer-motion variants 定义 `hidden: { opacity: 0, y: 16 }` / `visible: { opacity: 1, y: 0 }` + `staggerChildren: 0.06`，配合 `initial={false}` 使用，变体已定义但不播放入场动画
- AnimatePresence `mode="wait"` + `key={state.kind}` 实现状态切换过渡：旧状态 `exit={{ opacity: 0 }}` → 新状态 `initial={false}` + `animate={{ opacity: 1, y: 0 }}`
- HeroUI Card `radius="lg"` + `className="border border-white/20 bg-white/40 backdrop-blur-xl dark:bg-black/40"` 实现 glassmorphism
- HeroUI Chip `color="primary" variant="flat"` 替换 StatusBadge 用于 score badge，其余 badge 保持 StatusBadge
- PageHeader 视觉微调: 底部 border-b 分隔、eyebrow 前加 accent 色小横线、uppercase tracking-wider、tracking-tight title
- 10/10 测试通过 (67 tests)，tsc --noEmit 0 errors

## Task 4: SessionDetailPage 消息气泡 + metadata 分组 + ScrollShadow + resume-command-box 升级 完成记录 (2026-06-21)
- message-bubble.tsx 5 种 role 视觉区分:
  - user: justify-end, accent 背景白字, rounded-2xl rounded-br-sm (右下角直角)
  - assistant: justify-start, 面板色背景, rounded-2xl rounded-bl-sm (左下角直角), max-w-[85%]
  - tool: justify-center, 浅灰背景, rounded-lg, Wrench 图标前缀, font-mono 等宽内容
  - system: justify-center, amber 警告色边框+半透明背景, rounded-lg, Info 图标前缀
  - unknown: justify-center, 虚线边框 slate-300, rounded-lg, HelpCircle 图标前缀
- BubbleStyle 类型新增 icon/mono/radius 字段, 用 Record<AgentRole, BubbleStyle> 替代 satisfies
- 图标在 header div 中作为 SVG 元素, 不影响 getByText 匹配 span 文本 (SVG 无 text content)
- ScrollShadow: import {ScrollShadow} from @heroui/react, orientation="vertical" size={60} hideScrollBar
  - className="h-[calc(100vh-8rem)] space-y-3 pr-2" 实现固定高度滚动
  - jsdom 中不实际滚动, 但子元素正常渲染, getByText/getByTestId 不受影响
- metadata 分组: 3 个 HeroUI Card (基本信息/时间线/统计), 每个 Card radius="lg" + p-4
  - Card 不改变文本查找: getByText 仍匹配 <code> 元素的精确 textContent
  - 新增 Started/Last Message 字段, 不同时间值不产生 getByText 重复匹配
- LoadingDetail 自定义骨架: h2 "Loading session" 可见 + sr-only 描述 + Skeleton 消息骨架 + Skeleton metadata 骨架
  - 保持 aria-busy="true" aria-live="polite" 无障碍属性
  - 不再用 LoadingState 组件, 但 "Loading session" 文本保留
- resume-command-box.tsx: HeroUI Card radius="sm" 包裹, 内部 div 保留原有结构
  - props 接口 {command: string|null, threadId: string} 不变, search-result-card.tsx 无需修改
  - Card 不影响 getByRole("button") 和 getByText 查找
- lucide-react 图标: Wrench, Info, HelpCircle, Clock, MessageSquare 均可用
- 10/10 测试通过 (67 tests), tsc --noEmit 0 errors

## Task 5: SourcesPage HeroUI Table + 表单 + Switch 完成记录 (2026-06-22)
- source-table.tsx: 原生 table → HeroUI Table (isStriped, isHeaderSticky)
  - 列精简: Name+Preset 合并为一列 (name bold + preset small), RootPath+FileGlob 合并为一列 (各用 HeroUI Tooltip 包裹 `<code>` trigger), ScanInterval+LastScan 合并为一列
  - HeroUI Switch 替换 checkbox: `isSelected={source.enabled}` + `onValueChange` + `aria-label={`Toggle ${source.name}`}` 保留, role 从 "checkbox" 变为 "switch"
  - HeroUI ButtonGroup 包裹 Scan/Edit/Delete 操作按钮, 各按钮保留 aria-label
  - 保留单击删除不加 Modal: `onPress={() => onDelete(source)}` 直接调用
  - "No sources configured" 在 source-workspace-view.tsx 的 EmptyState 中, 不在 Table 内
  - HeroUI Table classNames: base/th/td/tr 可分别定制样式, `removeWrapper` 默认 false (保留 wrapper 提供 overflow scroll)
- source-form.tsx: 原生 input/select/checkbox/textarea → HeroUI Input/Switch/Textarea + 原生 select (Preset)
  - HeroUI Input: `label` + `labelPlacement="outside"` + `variant="bordered"` + `size="sm"` + `radius="sm"`, 通过 label prop 创建 `<label htmlFor>` 关联, getByLabelText 可找到
  - HeroUI Textarea: 同 Input 参数, 替换 resume template 的 `<textarea>`
  - HeroUI Switch: `isSelected` + `onValueChange` 替换 Enabled checkbox, `classNames={{ label: "..." }}` 定制标签样式
  - **Preset 字段保留原生 `<select>`**: HeroUI Select 的 hidden native `<select>` 在 jsdom 中 `fireEvent.change` 无法触发 `onSelectionChange` (controlled `selectedKeys` 覆盖内部状态, `defaultSelectedKeys` 初始值为空), 改用原生 `<select>` + `aria-label="Preset"` + HeroUI 风格 className 保持视觉一致性
  - 错误消息: 不使用 HeroUI Input 的 `errorMessage`/`isInvalid` (会添加 `aria-invalid`), 改用独立 `<span>` 渲染错误文本, 保持 SourceForm 无 aria-invalid
  - 7 字段标签不变: Source name, Preset, Root path, File glob, Parser type, Reader type, Scan interval seconds, Resume template
- source-workspace.test.tsx: 更新选择器 checkbox → switch (line 164, 169)
  - `getByRole("checkbox", { name: "Toggle Demo source" })` → `getByRole("switch", { name: "Toggle Demo source" })`
  - `not.toBeChecked()` 断言不变: HeroUI Switch 使用 `aria-checked`, jest-dom `toBeChecked()` 支持 role="switch"
- source-workspace-view.tsx + source-workspace.tsx: 无需修改, 已满足要求
  - xl:grid-cols-[minmax(0,1fr)_24rem] 保留, aria-label="Sources workspace" 保留, aria-label="Refresh sources" 保留
  - "Scan completed" 来自 `Scan ${status}` 模板, CRUD 逻辑不变
- HeroUI Table 在 jsdom 中: text content 正常渲染在 TableCell 内, getByText/getByRole 不受影响
- HeroUI Tooltip 在 jsdom 中: trigger 元素 (如 `<code>`) 正常渲染, getByText 找到 trigger 文本, tooltip content 在 portal 中不影响查询
- 10/10 测试通过 (67 tests), tsc --noEmit 0 errors

## Task 6: ScanJobsPage HeroUI Table + Tabs 筛选 + 列精简 完成记录 (2026-06-22)
- scan-jobs-table.tsx: 原生 table → HeroUI Table (isStriped, isHeaderSticky)
  - 列精简 10 列 → 5 列: Status / Source (name+preset+parserType) / Time (startedAt+finishedAt) / Summary (5 个计数) / Error (ErrorSummary)
  - Summary 列: 每个数字在独立 span 中, 用 flex justify-between 布局配标签 (Seen/Parsed/Errors/Imported/Chunks)
  - "2 / 8" (sessionsImported/messagesImported) 在单个 span 中, getByText("2 / 8") 精确匹配, 不与 getByText("2") 冲突
  - Time 列: startedAt 和 finishedAt 各在独立 `<p>` 元素中, getByText 找到各自时间
  - TableBody 添加 isLoading={false}, loadingContent={Skeleton}, emptyContent="No matching scan jobs..."
  - **关键: TableRow 的 TableCell 必须是直接子元素, 不能用 Fragment 包裹或自定义组件包裹**
    - react-stately collection builder 通过 `type.getCollectionNode` 静态方法识别子元素类型
    - 自定义组件 (如 `<ScanJobsRow>`) 没有 `getCollectionNode` 方法 → "type.getCollectionNode is not a function"
    - Fragment 包裹 → "Cell count must match column count. Found 1 cells and 5 columns"
    - 正确做法: 在 map 中直接渲染 `<TableRow key={job.id}><TableCell>...</TableCell>...</TableRow>`
  - ErrorSummary 组件保留现有展开/折叠 (不用 Modal), aria-label 和按钮文本不变
  - PaginationControls 保留 (不改为 HeroUI 分页), "Page {n} of {total}" 格式保留
- scan-jobs-workspace.tsx: 添加 HeroUI Tabs 客户端状态筛选
  - Tabs: variant="underlined" color="primary", selectedKey + onSelectionChange
  - 4 个 Tab: All / Running / Completed / Failed (Tab 无 children, 只做筛选器, 表格在 Tabs 外渲染)
  - StatusFilter 类型: "all" | "running" | "completed" | "failed"
  - "running" tab 包含 status === "running" || status === "queued" (都是 warning tone)
  - 纯客户端筛选: filterByStatus 函数过滤 state.page.items, 不改变 API 调用 (PAGE_SIZE=20 不变)
  - filteredPage = { ...state.page, items: filteredItems } 保留原始分页信息
  - "No scan jobs yet" 检查基于原始 items.length (非 filtered), Tabs 仅在有 items 时渲染
  - latestRequestId 并发保护机制完全保留
  - Tab 标签 "Failed"/"Completed" 大写, getByText("failed") 小写, 默认大小写敏感不冲突
- **ResizeObserver mock**: HeroUI Tabs 内部使用 ResizeObserver, jsdom 未实现
  - 新建 `apps/web/vitest.setup.ts` 添加 `globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} }`
  - vitest.config.ts 添加 `setupFiles: ["./vitest.setup.ts"]`
  - 不加此 mock, Tabs 组件抛出 ReferenceError 导致整个组件树崩溃, 所有 scan-jobs 测试失败
- 10/10 测试通过 (67 tests), tsc --noEmit 0 errors
