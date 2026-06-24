---
slug: frontend-refinement
status: plan-complete
intent: unclear
pending-action: none (awaiting $start-work)
approach: Modern Glassmorphism + Dark Mode + HeroUI 全面迁移 + framer-motion 动画，6 个独立组件分 3 层依赖
review-status: revised-after-high-accuracy-review (Metis + 2 Momus, 15 issues fixed)
---

# Draft: frontend-refinement

## Components (topology ledger)

| id | outcome | status | evidence path |
|----|---------|--------|---------------|
| C1-DesignSystem | hero.ts 主题 + globals.css dark mode + next-themes + ThemeSwitch | active | .omo/evidence/task-1-frontend-refinement.* |
| C2-AppShell | HeroUI 导航 + active 路由 + 移动端 + template.tsx 页面过渡 | active | .omo/evidence/task-2-frontend-refinement.* |
| C3-SearchPage | HeroUI Input + 可折叠过滤器 + 骨架屏 + 搜索即输入 + 结果卡片动画 | active | .omo/evidence/task-3-frontend-refinement.* |
| C4-SessionDetailPage | 消息气泡 5 角色区分 + metadata 分组卡片 + ScrollShadow + 骨架屏 | active | .omo/evidence/task-4-frontend-refinement.* |
| C5-SourcesPage | HeroUI Table + HeroUI 表单 + Modal 删除确认 + Switch toggle | active | .omo/evidence/task-5-frontend-refinement.* |
| C6-ScanJobsPage | HeroUI Table + Tabs 状态筛选 + 列精简 + 骨架屏 + 错误详情 Modal | active | .omo/evidence/task-6-frontend-refinement.* |

依赖链: C1 → C2 → (C3, C4, C5, C6 并行)

## Open assumptions (announced defaults)

| assumption | adopted default | rationale | reversible? |
|------------|----------------|-----------|-------------|
| 设计风格 | Modern Glassmorphism + 微交互 | 2025-2026 主流趋势，精致现代 | 是 |
| 暗色模式 | next-themes + class 策略，defaultTheme=light | HeroUI 官方推荐 | 是 |
| 色彩系统 | 保留 teal #0f766e + 米色 #f5f4ef 为 light，新增 dark tokens | 保持品牌基因 | 是 |
| 组件库 | 全面迁移到已安装 HeroUI | 零新依赖 | 是 |
| 动画 | framer-motion 页面/列表/Skeleton | 零新依赖 | 是 |
| 新依赖 | 仅 next-themes | 暗色模式必需 | 是 |
| 搜索交互 | 搜索即输入 + 防抖 300ms | 现代搜索 UX 标配 | 是 |
| 表格策略 | HeroUI Table + 列精简 + 响应式隐藏低优先列 | 信息过载缓解 | 是 |
| 删除确认 | HeroUI Modal 确认弹窗 | 防误操作 | 是 |
| 页面过渡 | template.tsx + AnimatePresence + fade+slide | 流畅体验 | 是 |

## Findings (cited - path:lines)

### 项目结构
- apps/web/ Next.js 16.2.9 + React 19.2.7
- Tailwind v4.3.1 + @tailwindcss/postcss (postcss.config.mjs)
- HeroUI 2.8.10 (@heroui/react) - 已安装大部分未用
- framer-motion 12.40.0 - 已安装完全未用
- lucide-react 1.18.0 - 图标库
- pnpm monorepo: apps/web, apps/api, packages/shared

### 页面结构 (4 页面 + redirect)
- `/` → redirect to `/search` (app/page.tsx)
- `/search` → search-workspace.tsx (124行)
- `/sources` → source-workspace.tsx (196行) + source-workspace-view.tsx (153行) + source-form.tsx (248行) + source-table.tsx (192行)
- `/scan-jobs` → scan-jobs-workspace.tsx (115行) + scan-jobs-table.tsx (212行)
- `/sessions/[id]` → session-detail-workspace.tsx (164行) + message-bubble.tsx (70行) + resume-command-box.tsx (89行)

### 组件清单 (26 文件)
- 布局: app-shell.tsx, page-header.tsx, providers.tsx, layout.tsx
- 状态: state-block.tsx, status-badge.tsx
- 搜索: search-workspace.tsx, search-box.tsx, search-result-card.tsx, search-types.ts
- 会话: session-detail-workspace.tsx, message-bubble.tsx, resume-command-box.tsx
- 源: source-workspace.tsx, source-workspace-view.tsx, source-form.tsx, source-table.tsx, source-types.ts
- 扫描: scan-jobs-workspace.tsx, scan-jobs-table.tsx

### CSS 现状 (globals.css, 45行)
- :root 变量: --app-bg #f5f4ef, --app-panel #fffdf8, --app-panel-muted #ebe7dd, --app-border #d8d1c3, --app-ink #1f2933, --app-muted #667085, --app-accent #0f766e, --app-accent-soft #d9f3ef, --app-warn #a16207
- body 渐变背景, 无暗色模式
- 字体: ui-sans-serif, system-ui, ...

### Tailwind 配置 (tailwind.config.mjs, 15行)
- content: app/**, components/**, heroui theme path
- plugins: [heroui()]
- theme.extend: {} (无自定义)

### 测试约束 (10 文件, Vitest + jsdom)
- 8 组件测试 + 2 lib 测试
- 红线: data-testid, 19 aria-label, 4 导航文本, 12 表单标签, 14 按钮文本, 20+ 状态文本, 格式化逻辑, aria-invalid, XSS 安全, 9 API 路由
- 详见压缩块 b2

### HeroUI 最佳实践 (librarian 研究)
- Tailwind v4 方式: hero.ts + @plugin "./hero.ts" in globals.css
- 暗色模式: next-themes + ThemeProvider + suppressHydrationWarning
- 组件用法: Input isClearable, Table isStriped/isHeaderSticky, Card glassmorphism, Skeleton, ScrollShadow, Tabs, Modal useDisclosure
- framer-motion: template.tsx 页面过渡, staggerChildren 列表, AnimatePresence Skeleton 转内容

## Decisions (with rationale)

1. **保留现有色彩基因**: light 主题保留 teal+米色，用户无陌生感
2. **新增 dark 主题**: 暗色模式是现代应用标配，next-themes 是 HeroUI 官方推荐
3. **全面迁移 HeroUI**: 已安装未用是浪费，统一组件库保证一致性
4. **启用 framer-motion**: 已安装未用，页面过渡+列表动画提升质感
5. **搜索即输入+防抖**: 现代搜索 UX 标配，减少点击
6. **表格列精简**: 10 列太多，精简到 5-6 列 + 响应式隐藏
7. **Modal 删除确认**: 防误操作，UX 最佳实践
8. **message-bubble 5 角色区分**: tool/system/unknown 当前样式相同需区分
9. **metadata 分组卡片**: 当前扁平无分组，用 Card 分组
10. **Tabs 状态筛选**: ScanJobs 无筛选，加 Tabs 按 status 筛选

## Scope IN

- HeroUI 主题配置 (hero.ts) + dark mode CSS 变量
- next-themes 集成 + ThemeSwitch 组件
- AppShell 重构: HeroUI 导航 + active 路由 + 移动端
- 页面过渡动画 (template.tsx)
- 搜索页: HeroUI Input + 可折叠过滤器 + 骨架屏 + 结果卡片动画
- 会话详情: 消息气泡区分 + metadata 分组 + ScrollShadow + 骨架屏
- 源管理: HeroUI Table + 表单 + Modal 确认 + Switch
- 扫描任务: HeroUI Table + Tabs 筛选 + 列精简 + 骨架屏 + 错误详情 Modal
- 所有现有测试通过

## Scope OUT (Must NOT have)

- 不改变 API 路由和契约
- 不改变 packages/shared 类型定义
- 不引入除 next-themes 外的新依赖
- 不改变 data-testid、aria-label、按钮文本、状态文本等 DOM 合约
- 不改变格式化逻辑（scan interval, score %, error 截断, 分页文本）
- 不使用 innerHTML/dangerouslySetInnerHTML
- 不改变 9 个 API 端点
- 不做后端/API 修改
- 不做 E2E 测试（项目无 E2E 基础设施）
- 不改变 vitest 配置

## Open questions

无（UNCLEAR 路径，所有模糊性通过研究解决）

## Approval gate
status: approved
用户已批准（"可以,开始写计划"）
