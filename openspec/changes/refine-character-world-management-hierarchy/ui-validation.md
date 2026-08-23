## Scope

Character Management 与 World Management 的领域 hero、“我的角色/我的世界”集合、紧凑 controls、卡片目录、Character Kit / World Bible 模板快速起点及 Start Creating 跳转。该变更改变可见布局和交互，因此 `neko-ui-validation` 适用。

## Runtime

- 功能行为完全属于 browser-owned package Roots；`@neko/chara-webview` 与 `@neko/world-webview` focused component tests 是最窄 authoritative functional boundary。
- 可见表现通过当前 Development Electron 的普通侧边栏导航直接检查，覆盖真实 Desktop composition 与 package-owned Roots。
- 新增隔离场景 `character-world-management-hierarchy`，但本次执行在启动前被当前 checkout 已运行的 Desktop/Vite owner 阻塞，没有以非隔离路径替代其成功结果。

## Inventory

- Character populated：导航到角色，看到领域简介、一个导入主操作、“我的角色”、结果计数、搜索/排序/刷新和 bounded identity card。
- World populated/dense：导航到世界，看到相同页面层级、三个 start-aligned World cards、两行摘要和版本/运行 metadata。
- Character selected/detail：激活精确角色卡，卡片保留完整 selected boundary，既有 Character detail 在 Secondary Main 打开。
- Empty/search：package tests 覆盖 Character 无记录、搜索无结果和 World 无记录；World test 断言搜索仍以 canonical query 调用 reload。
- Character template：页面显示唯一 `character-kit` 卡片；点击后卸载 Character catalog 并进入 canonical Start Creating scene，不调用 Character foundation command。
- World template：页面显示唯一 `world-bible` 卡片；点击后卸载 World catalog 并进入 canonical Start Creating scene，不创建 World record。
- Narrow：focused CSS contract 断言 collection controls 换行、search 占完整行、内容轨道收窄且卡片不横向拉伸。

## Evidence

- `pnpm --dir packages/chara-webview test`：5 files / 27 tests passed。
- `pnpm --dir packages/world-webview test`：2 files / 10 tests passed。
- `pnpm --dir apps/neko-desktop exec vitest run src/renderer/DesktopApplication.test.tsx`：58 tests passed；两个 domain template cases 证明同一 `open-agent-entry` transition。
- `pnpm --dir apps/neko-desktop exec vitest run src/renderer-styles.test.ts -t "aligns Character and World catalogs"`：1 passed。
- Visible Development Electron direct review：Character wide populated + Character Kit、World wide populated/dense + World Bible；两个卡片分别通过普通点击进入 Start Creating。
- 隔离场景失败报告：`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-23T21-07-45.555Z-character-world-management-hierarchy-development/report.json`。

## Visual Findings

- Character wide：hero、导入按钮、装饰图形和 collection controls 共享稳定左右边界；单张 214px 角色卡与 280px Character Kit 卡均左对齐，没有被拉伸或互相混淆。
- World wide：三个 280px 世界卡保持一致高度节奏；长世界摘要被两行截断，没有覆盖 metadata；World Bible 位于独立模板分组并与记录卡保持足够垂直间隔。
- Character selected/detail：selected ring 未被滚动容器裁切；Secondary Main 挂载后 hero、搜索和卡片仍完整可见，没有横向溢出。
- 两个模板预览、标题、说明和“开始创作”操作层级清楚；未观察到文字溢出、控件重叠或卡片位移。

## Result

`blocked`。已检查的 Development 宽屏、两个模板卡与跳转状态通过，但隔离 Electron 的窄屏截图在启动前被 checkout 中 PID 70349 持有 Vite bundle 阻塞；按照 skill 规则不能把 focused CSS contract 当作窄屏像素证据并宣布完整 graphical pass。

## Residual Risk

- 窄窗口和深色主题未直接做像素检查；窄宽行为有 focused style contract，深色使用既有 theme tokens。
- Character/World invalid card 与加载/错误状态没有在当前 live catalog 中直接截图，但 package tests 保留其 fail-local DOM 与操作路径。
- 当前模板 callback 只进入通用 Start Creating，尚不预选创作标签、不携带 template identity，也不预填 Agent 内容；若产品需要这些语义，必须新增明确 consumer contract。
