## Why

Desktop Home 当前把产品场景导航放进 Agent Entry Draft：点击 `助手 | 工作区 | 角色 | 世界` 会修改
Webview presentation，Workspace 还会在模式切换时调用 `bindTarget`。这把 Window 导航、Agent Draft binding
和领域入口混成一条隐式路径，既造成入口跳转复杂，也让“进入工作区”和“授权一个精确项目”难以区分。

顶部模式选择应表达当前 Window Scene，而不是 Agent 输入框的业务状态。Agent Draft 只负责输入、引用、
执行模式和首次提交；Project/Character/World 继续由各自 owner 提供入口与 authority。

## What Changes

- 在 Desktop 顶部使用 Codex 风格的中性 segmented selector 展示 `助手 | 工作区 | 角色 | 世界`，选中态
  直接由当前 authoritative Scene 投影，不新增 mode store、snapshot 或 Session。
- 助手进入唯一的 unbound Agent Entry Draft；有效输入与模型配置就绪后可直接首次提交，不要求 Workspace。
- 工作区进入 Project Management；用户必须显式选择已有 Project 或授权一个目录后，才进入精确
  Workspace Scene。identity 与 grant 继续由 Host authority 提供，模式按钮本身不调用 `bindTarget`。
- 角色进入 Character Management；具体 Character interaction 仍由 `@neko/chara` 的 typed intent 创建。
- 世界在尚无 World-owned Scene provider 时显示禁用且 owner-qualified 的说明，不伪造聊天室或 Agent Draft。
- 顶部 selector 只出现在入口/管理 Scene，不覆盖正在执行的 Conversation、Workspace 或 Character
  interaction。离开入口只切换当前 scene，不能取消后台任务或保留隐藏业务 Root。
- 删除 Agent Webview 的 experience-mode snapshot/presenter/selector、旧 `start-chat | roleplay` 入口分支，
  以及无生产调用方的 `bind-agent-assistant` Scene intent。
- 保留 canonical first-submit transaction：validation → Conversation commit → Scene handoff → provider
  execution；本变更不建立第二条提交或跳转路径。

## Capabilities

### New Capabilities

- `home-experience-entry-modes`: 定义 Desktop Window 顶部场景导航、Scene 到选中模式的唯一投影、
  Workspace/Character/World owner 边界和 Agent 首次提交隔离。

### Modified Capabilities

<!-- Related Agent launch, Workbench, Character and World requirements are active changes rather than canonical main specs. -->

## Impact

- `@neko/host`：复用现有 `open-agent-entry`、`open-project-management`、
  `open-character-management` intent；删除未使用的 `bind-agent-assistant` intent。
- `apps/neko-desktop`：拥有 Window 顶部导航 presenter 与组合；当前 Scene 是选中模式的唯一事实源。
- `@neko/ui`：为共享 segmented control 增加向后兼容的中性外观和可配置宽度。
- `@neko/agent-webview`：删除产品模式导航与持久化，只保留 canonical Agent Entry Draft、执行模式和提交。
- `@neko/agent-runtime`：首次提交事务保持不变；不得从 active/current/recent Workspace 推断 authority。
- `@neko/chara` 与未来 `@neko/world`：继续拥有各自 durable record 与 Run；World 未组合前 fail-visible。
