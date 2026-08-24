## Why

扩展页当前把 Skill / MCP / 专业应用切换嵌入搜索工具栏，选中状态弱；package Root 又重复显示 eyebrow、标题和说明。Skill 卡片继续展示 provider、调用权限、canonical invocation 等目录决策并不需要的信息，模式不突出而内容显得冗余。

## What Changes

- 将 Skill / MCP / 专业应用提升为独立、显著的图标+文字模式选择器，不再嵌入搜索工具栏。
- package-owned Roots 在 Desktop 组合中隐藏重复 eyebrow、标题和说明。
- Skill 与 ready MCP 卡片只保留名称与用途摘要；非 ready MCP 继续显示局部 fail-visible 诊断。
- 重构目录卡片视觉层级：类型图标与名称同列，摘要稳定为两行，弱化边框并保留清晰 hover/focus 反馈。
- 固定使用紧凑卡片目录，移除刷新、网格/列表切换以及占用过大的卡片高度。
- Skill 目录只展示当前 DSH 已加载能力，不把来源伪装为安装状态，也不提供缺少市场候选集时无意义的“全部 / 已添加”筛选。
- MCP 没有配置条目时展示准确的未配置空状态；专业应用继续以 readiness 表达真实可用性，不复用“已添加”语义。
- 点击 Skill、MCP 或专业应用卡片时打开 package-owned 详情 Overlay，并在背景目录中保持明确选中态。
- 专业应用的接口、工作流、启动偏好与操作从目录卡片原子迁移到详情 Overlay；目录卡片只保留识别、摘要、状态 tag 与详情入口。
- 保留搜索与自动加载；不再提供手动刷新或列表展示模式。
- 专业应用仍保留 readiness、配置、保存与启动信息，但只在当前详情 Overlay 中展示和操作。

## Capabilities

### New Capabilities

- `extension-management-responsive-presentation`: 定义扩展模式层级、非冗余目录信息、响应式密度和可访问视觉状态。

### Modified Capabilities

无。

## Impact

- `packages/agent/webview`（Agent 扩展目录 presentation owner）：支持 Desktop compact heading，并从卡片移除非行动 metadata；详情 Overlay 展示当前条目的完整只读事实。
- `apps/neko-desktop/src/renderer`（Desktop composition owner）：拥有唯一三模式选择器与场景轨道样式。
- `packages/professional-apps/webview` 支持 compact heading，并在 package-owned 详情 Overlay 中继续拥有专业应用表单、readiness 与 operation controls。
- canonical producer/runtime/IPC 不变；模式选择仍是可丢弃 Renderer state，不新增持久化或隐藏 Root。
- 不添加没有 Host authority 的“查找 / 上传 / 删除 / 停用”假操作；这些动作需要独立的 installed-library/import contract。现有 Agent `CreateSkill` 仍是唯一创建路径。
- 用户数据不迁移、不覆盖；被替代路径是弱 segmented control、重复 package headings 和冗余 metadata 展示。
