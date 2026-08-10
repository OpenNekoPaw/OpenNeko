## Why

Workspace 顶部目前把 Agent、Main、Cut 与资源管理表现为四个平级开关，既使用了与空间结构不匹配的图标，也掩盖了 Cut 是 Main 下方子面板的真实布局关系。关闭 Main 而保留 Cut 时，现有 `chat-only` 投影还会让 Agent 占据 Cut 上方的 Main 区域，与用户选择和可见层级不一致。

## What Changes

- 将 Workspace 顶部布局控制收敛为三个顶层入口：左侧 Agent、中间 Main + Cut 组合入口、右侧资源管理。
- Agent 使用左侧栏图标；Main + Cut 组合入口使用同时表达上部 Main 与下部 Cut 的布局图标，并在一个轻量 Popover 内保留 Main、Cut 两个明确选项。
- 保持 Main 与 Cut 的独立 presentation 命令，但把 Cut 视觉与布局归入 Main 中央区域；增加唯一 canonical `empty-main` display mode，使真正的 Cut-only 能关闭 Agent 与 Main 内容。当没有可见 Main 且 Cut 已 docked 时，Cut 使用同一 Root 扩展占据完整中央区域；即使 Agent 仍开启也只允许停靠侧边，不得填充 Cut 上方。
- 删除旧的四个平级按钮成功路径及不再匹配布局语义的 Main/Cut 独立顶层图标。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `desktop-creative-workbench-layout`: 修改 Workspace 布局入口层级、图标语义，以及无可见 Main 时 Cut 扩展占据中央区域与 Agent 的可见组合规则。

## Impact

- Owning responsibility：`@neko/host` 继续拥有 version-free Workbench layout projection 与 Main/Cut presentation 事实；现有 `display.mode` enum 原子增加 `empty-main` canonical 值，不增加字段、内部版本或第二状态源。
- Affected package role：`@neko/app-desktop` Renderer 作为唯一 Electron 产品 composition root，负责把既有 Host layout 投影成 Workspace 顶部控件、Popover 与可见 slot 组合；`@neko/ui` 仅复用现有 `Popover`、`IconButton` 和 `ControlledWorkbenchShell` public primitives，不新增 Desktop 业务逻辑。
- Producer/consumer：现有 Desktop Renderer 控件仍通过唯一 `ShellActions.onUpdateWorkbench` / `onCreateCutDraft` producer 更新 Host-owned layout；`DesktopSceneWorkbench` 与 `DesktopWorkbenchRuntimePortals` 消费同一 projection。
- Runtime boundary：Host-neutral layout codec 与 Electron Renderer presentation composition 同步变化；不修改 Main/preload typed IPC shape、用户项目事实、Cut 文档或 Agent runtime 生命周期。
