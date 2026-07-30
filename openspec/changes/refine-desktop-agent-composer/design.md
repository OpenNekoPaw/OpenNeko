## Context

Desktop 通过 `presentation="desktop-dock"` 挂载 package-owned `AgentWebviewRoot`，与 VS Code 共用 Conversation、composer、model catalog 和 Tool approval UI。当前 `InputArea` 在输入框上方常驻 `ModeConfigBar`：Agent 模式同时展示 session mode、配置类别、主模型、媒体理解和可用 Agent 参数；执行模式位于发送按钮附近。该结构在宽 Webview 中可用，但在约 360–440px 的 Desktop Dock 中形成两层控制轨，并把内部 purpose 分类“对话”暴露为与“Agent”并列的用户模式。

底层 contract 已经正确分离：

- `SessionMode` 选择 Agent 协作或直接媒体生成；
- `agent.main`、`*.understand` 与 `*.generate` 以精确 purpose-model binding 进入 turn snapshot；
- `plan | ask | auto` 由 permission/runtime 执行，不由 Webview 文案定义；
- Skill catalog 由 Host 投影，Webview 只做显式选择和调用。

因此本变更只重组 projection，不创建新状态 owner 或路由。

## Goals / Non-Goals

**Goals:**

- 让默认 Agent composer 在窄 Dock 中保持一层主操作工具栏。
- 将主模型、媒体理解、媒体生成和受支持的 Agent 参数组织到一个模型配置弹层。
- 让模型选择继续形成精确单选 purpose binding，并清楚区分理解与生成。
- 让执行模式菜单解释真实的三档副作用语义。
- 用 Host 投影的已启用 Skill 为 Desktop 空状态提供少量显式入口。
- 保持 shared Root、conversation identity、tab render state 和 Host controller 不变。

**Non-Goals:**

- 不实现模型多选、全选、自动模型池或 provider fallback。
- 不改变模型目录、purpose capability 校验、provider credential 或 Pi turn composition。
- 不增加“完全访问”或绕过 approval/permission 的快捷方式。
- 不在本变更实现 Home Director Agent、Focus Mode、语音输入或 Skill 文件安装。
- 不把 Desktop 专属状态加入 Shell、IPC 或 workspace facts。

## Decisions

### 1. Agent 模式配置进入输入框底栏，直接媒体模式保留参数轨

`InputArea` 在 Agent 模式不再渲染输入框上方的完整 `ModeConfigBar`，而是在 composer toolbar 中组合：

```text
attachment -> session mode -> unified model -> command/Skill -> usage
                                                execution mode -> send
```

图片、视频、音频直接生成仍使用顶部 `ModeConfigBar`，因为画幅、分辨率、时长和音频类型是当前生成请求的主要参数，隐藏后会改变可用能力。

替代方案是仅用 CSS 压缩现有两层轨道。否决，因为“Agent / 对话”的语义重复仍存在，且感知模型依旧常驻。

### 2. 一个弹层投影全部 Agent purpose 配置

新增 package-local `AgentModelConfigMenu`，消费既有：

- `availableModels` / `selectedModel`;
- `mediaUnderstandingModels` / `mediaUnderstandingSelection`;
- `availableMediaModels` / `mediaModelSelection`;
- `AgentLlmConfig`.

弹层使用 `对话 | 图片 | 视频 | 音频` category：

- 对话：精确选择 `agent.main`，并显示该模型支持的 reasoning/verbosity/creativity presets；
- 媒体：分别显示理解模型与生成模型；理解支持 `auto` 或精确 LLM，生成支持 `none` 或精确同类模型。

类别只是展示状态，继续复用 composer menu realm；它不是 model-purpose owner。选项直接调用现有回调，最终 wire payload 与 turn resolver 不变。

替代方案是嵌套打开现有 `ModelSelector`、理解菜单和媒体菜单。否决，因为多层 popup 增加焦点、placement 和关闭语义复杂度。

### 3. 执行模式只改善说明，不改变 runtime policy

`ModeSelector` 保留 `plan | ask | auto`，使用标题、描述和选中状态说明：

- 规划：研究和规划，不执行副作用 Tool；
- 审批：读取可以继续，产生修改/外部副作用前确认；
- 自动：只自动执行允许的安全操作，拒绝规则与高风险边界仍生效。

Webview 不提供“完全访问”。默认值、快捷键和 Host persistence 继续使用既有 contract。

### 4. Desktop Skill 建议来自 catalog，点击只预填显式调用

`EmptyState` 接收只读 Skill summaries。仅 `desktop-dock` 展示最多四个 `enabled` Skill；点击将 `$<skill-name>` 写入 entry composer，不自动发送、不直接变更 Skill enablement，也不读取文件。

替代方案是硬编码“有声书、商品图”等入口。否决，因为会形成第二套 Skill catalog，并可能展示未安装或不可用能力。

### 5. Presentation 只改变布局

当前 Desktop 继续通过 `AgentWebviewRoot(presentation="desktop-dock")` 选择布局。未来 Home 或 Focus presentation 若加入，必须复用同一 Root、Host adapter、conversation identity 与 tab render state；本变更不创建新的 runtime contract。

## Risks / Trade-offs

- [统一弹层包含较多选项] → 使用 category 分段、限定高度、Provider 分组和能力标签；默认只打开当前相关类别。
- [把 Agent 控件移到底栏后宽度不足] → 使用可截断摘要、紧凑图标/文本和现有 overlay placement；工具栏允许最小宽度收缩。
- [Skill 名称过长或 catalog 很大] → 空状态最多展示四个、截断显示，完整目录仍由 `$` 菜单承担。
- [共享 Webview 回归] → Agent 模式的功能 contract 全部复用；直接媒体模式保留现有参数轨，并补充 default 与 desktop-dock React 测试。
- [模型选择时改变运行中 snapshot] → 继续使用既有 `isBusy` 禁用所有模型/参数控件，不增加新的 mutable runtime owner。

## Migration Plan

1. 先增加 failing React tests，锁定紧凑 Agent toolbar、统一模型弹层、媒体直接模式和 Skill 空状态行为。
2. 引入 `AgentModelConfigMenu` 并从 Agent 模式顶部轨道迁移控制入口。
3. 更新执行模式文案、样式和本地化。
4. 删除被统一弹层替代且无调用方的旧 Agent-only selector 组合；保留直接媒体复用部分。
5. 运行 Webview/Agent package 测试、typecheck/build 与 Desktop Electron 实际场景。

回退时恢复 Agent 模式的 `ModeConfigBar` 组合即可；不涉及持久数据、wire schema 或配置迁移。

## Open Questions

- Home Director Agent 与项目 Focus Agent 的具体 presentation 和导航动作留给后续独立变更；本次只确保同一 Root 可复用。
- 语音输入、Skill 文件导入和模型收藏没有当前 runtime owner，不纳入本次范围。
