## Why

Character 与 World 仍处于开发验证阶段，但当前 Desktop 导航、Project Workspace、Agent Entry、
bundled Skill 和 DSH Tool profile 在发行包中继续把它们展示为正式能力。仅删除界面按钮不能阻止
持久 presentation、直接 Scene transition 或 Agent capability catalog 继续进入这些路径；删除领域代码
又会破坏现有创作数据与后续开发。

## What Changes

- Desktop 组合根以 Electron 的明确发行事实区分 Development 与 Release composition；不得由 Renderer
  读取环境变量或维护独立开关。
- Development 保留 Character/World 导航、创作入口、Agent Entry 目标、bundled Skills 与 DSH Tools，
  继续支持领域开发和验证。
- Primary Sidebar 将稳定的 Start Creating、Projects、Works、Asset Library 与 Extensions 作为无分组一级入口；
  Development 把 Character/World 收入明确的实验分组，Project、Assistant 与可见实验角色历史统一投影在一个
  Conversation 分组中，不显示空 World history 分组。
- Release 从 Primary Sidebar、Project Workspace 可执行操作、Resource Browser 创建操作、Agent Entry
  上下文和 Extensions/Agent executable catalog 隐藏 Character/World 能力。
- Release Host 对 Character/World management、authoring、runtime、detail 和 conversation restore 的直接
  Scene transition 返回 owner-qualified unavailable；持久的 Character/World presentation 在恢复时局部
  重置到 Agent Entry。
- Release DSH profile 不装载 `@neko/chara-dsh-plugin` 与 `@neko/world-dsh-plugin`，发行资源不包含
  `character-creator` / `world-creator` builtin Skill；Development 继续使用同一领域实现与 canonical Tool path。
- Character、World、Project 和 Conversation durable records、领域 package、SQLite/filesystem authority 与
  protected background runtime 原样保留，不迁移、不删除、不伪造默认数据。

## Capabilities

### New Capabilities

- `desktop-release-capability-composition`: 定义 Development/Release 的单一组合事实、Character/World
  发行可达性、Home/Conversation presentation 与用户数据保护约束。

### Modified Capabilities

- `desktop-conversation-context-navigation`: Release 不恢复 Character/Room/World conversation Scene，
  Development 仍按 exact owner 恢复。

## Impact

- `packages/host`: 拥有 host-neutral capability projection、Scene transition fail-closed 与恢复期 presentation
  重置；不读取 Electron 或构建环境。
- `apps/neko-desktop/src/main`: 仅把 `app.isPackaged` 转换为明确的 Development/Release composition input，
  并选择对应 DSH profile 与 builtin Skill root。
- `apps/neko-desktop/src/renderer`: 只消费 Host capability projection 控制入口展示；不得自行推断运行模式。
- `packages/agent/webview`: Agent Entry 的 experimental creative context 变为可选；Project authoring 入口保持。
- `packages/project-webview`: Release 中现有 Character/World 项目事实继续只读投影，但创建、复制、同步、
  打开等能力入口不展示。
- Desktop/Host/Agent/Project producer-consumer tests、packaged resource closure、聚焦 Agent Evaluation 与真实
  Electron UI 验证需要覆盖 Development 与 Release 两种组合。
