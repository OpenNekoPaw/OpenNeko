## Why

> Successor boundary: `separate-companion-and-narrative-character-conversations` replaces the Character `Daily | Narrative` binding semantics introduced by this change. Narrative no longer depends on an external Composition owner; the successor owns exact Character/Storyline selection, mode validation and the still-closed Character product promotion gate. This change continues to own only Agent Entry Draft presentation and binding-context composition.

Desktop Home 需要在同一个对话入口中区分 `助手 | 工作区 | 角色 | 世界` 的运行语义。模式选择决定
Agent Entry Draft 将绑定到哪一种领域 authority、需要哪些前置配置以及首次提交如何校验；它不是项目或角色
管理页的 Window 导航。

当前实现把顶部 selector 投影为 Agent Entry、Project Management、Character Management 之间的场景切换。
这会把“为新对话选择工作区/角色上下文”误解为“打开管理面板”，输入框也因此无法在提交前展示并校验
精确 Project、目录、Character 或 World 配置。

## What Changes

- 顶部 Codex 风格 selector 只出现在 canonical Agent Entry Draft，选中项是该 Draft 的可恢复 presentation
  configuration；Project/Character 管理 Scene 不再显示或拥有这个 selector。
- 助手模式保持 unbound/Assistant 首次提交，不要求 Project 或目录。
- 工作区模式留在当前对话入口，显示 Project/目录选择器；只有 Host 返回精确 `workspaceId` 与
  `workspaceGrantId` 并完成 Draft binding 后才允许提交。
- 角色模式留在当前对话入口；在 Character-owned 精确目标选择尚未组合前明确阻止提交，不跳转管理页、
  不创建隐式 Character Run。
- 世界在 World-owned Entry configuration provider 尚未组合前保持禁用并显示 owner-qualified 说明。
- 切换模式不清空输入文本、不创建 Conversation/Run、不切换 Window Scene；authority 相关引用在 binding
  改变时清理，避免跨领域引用泄漏。
- 首次提交继续使用唯一事务：Draft validation → exact binding receipt → Conversation commit → Scene
  handoff → provider execution。

## Capabilities

### New Capabilities

- `home-experience-entry-modes`: 定义 Agent Entry Draft 的模式配置、精确领域 binding、入口校验、可恢复
  presentation state 与顶部 selector。

### Modified Capabilities

<!-- Related Agent launch, Character and World requirements are active changes rather than canonical main specs. -->

## Impact

- `@neko/agent-webview`：拥有入口模式 presenter、selector、可恢复 Draft presentation、Workspace chooser
  和提交前校验。
- `@neko/agent-contracts` / `@neko/agent-runtime`：复用 canonical `bind-target`、binding receipt 与
  `submit-draft`，不增加替代提交路径。
- `apps/neko-desktop`：仅向 Agent Entry 提供 Host 授权后的 Project/目录候选与 chooser port；移除将模式
  映射为管理 Scene intent 的 presenter。
- `@neko/ui`：继续提供无边框中性 segmented pill；共享组件不拥有模式状态。
- `@neko/chara` 与未来 `@neko/world`：拥有其精确目标、Run 和可用性；未组合时 fail-visible。
