## Why

Desktop 已经加深浅色主题的 canonical 文字与按钮 token，但 Character、World 与 Agent Webview 的部分新增展示仍把 `--neko-accent` 当作主按钮背景，或在 package-local 浅色覆盖中再次稀释文字。结果是同一浅色主题下，Shell 的主要操作清晰，而管理页按钮、卡片说明和 Agent 辅助文案仍显得发灰发虚。

## What Changes

- 让 `@neko/ui` 的默认按钮原语和 Character、World 管理页主操作统一消费已有的 `--neko-button-background/foreground/hoverBackground` 语义。
- 保留 `--neko-accent` 与 `--neko-focusBorder` 用于选中、强调和焦点，不再作为这些主操作的成功背景路径。
- 让管理页可操作的次级控件消费已有的 secondary button foreground/background，并提高过小的说明与元数据字号。
- 移除 Agent 浅色展示对辅助文字的二次透明稀释，并让 Composer 可操作控件使用 canonical secondary button foreground。
- 增加样式契约测试，防止后续新增组件重新混用 accent、button 和 muted 语义。

## Capabilities

### New Capabilities

- `light-theme-semantic-contrast`: 定义浅色主题下跨 Webview 的主操作、次级操作与辅助文字语义消费规则。

### Modified Capabilities

- 无。

## Impact

- `@neko/ui` L2：默认 Button/IconButton 原语改为消费既有 canonical button token，不增加公共类型或新 token。
- `@neko/chara-webview`、`@neko/world-webview` L2：只调整 package-owned 管理页样式，不改变目录、版本或用户数据语义。
- `@neko/agent-webview` L2：只调整 Agent presentation CSS，不改变 Session、turn、queue 或 runtime ownership。
- `apps/neko-desktop`：无生产代码变化；继续是 theme preference、resolved theme 与根 token 投影 owner。
- 公共 contract / IPC / persistence：无变化；无迁移、无用户数据写入。
