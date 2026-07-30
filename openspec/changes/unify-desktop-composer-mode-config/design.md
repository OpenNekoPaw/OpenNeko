## Context

`InputArea` 已有正确的单一状态来源：聊天主模型、媒体理解模型、媒体生成模型和 LLM 参数由 Host catalog、conversation/tab render realm 与既有回调持有；直接生成的画幅、分辨率、时长和音频类型由同一个 tab-scoped `GenerationParams` 持有。当前 UI 却分成两条路径：

- Agent 模式使用 `AgentModelConfigMenu`，在对话、图片、视频、音频页签中配置全部模型 purpose；
- 图片、视频、音频模式使用 `ModeConfigBar` 内的独立 `MediaModelChip`，再并列展示请求参数下拉框。

这造成模型入口重复、标题错误地绑定 Agent 语义，并让用户误以为直接生成模式和 Agent 模式使用不同模型配置。Desktop 与 VS Code 共用 package-owned Agent Webview，本变更必须只收敛 presentation，不新增宿主状态。

## Goals / Non-Goals

**Goals:**

- 所有 session mode 共用一个创作配置面板和一套精确 purpose binding。
- 当前模式决定模型与参数触发器的摘要，并在打开时默认定位到对应内容类别和二级页面。
- 模型与参数共享展示容器，但继续由各自的 catalog/purpose binding 与 tab-scoped 参数状态持有事实。
- Agent composer 省略参数入口，不通过创作语义 preset 间接改变 Provider 请求；高级 LLM 原始参数继续由设置/配置 owner 管理。
- 媒体模型页把 `image|video|audio.understand` 明确呈现为“感知模型”，与同类别生成模型并列分区。
- 删除重复的媒体模型 dropdown 路径和过时的 Agent-only 命名。
- 保持 tab-scoped 状态、运行中锁定、overlay 互斥、键盘语义和窄 Dock 布局。

**Non-Goals:**

- 不改变 provider credential、purpose resolver 或媒体生成 request payload。
- 不把图片、视频、音频参数提升为全局设置。
- 不实现模型多选、收藏、搜索、全选或 fallback pool。
- 不新增 Desktop IPC、宿主专属组件或第二套 composer。

## Decisions

### 1. 将 Agent-only 菜单提升为模式无关的 `ComposerConfigMenu`

现有 `AgentModelConfigMenu` 已经展示全部四类模型，是最接近目标的 canonical 组件。将其重构为 `ComposerConfigMenu` 并增加 `activeMode`：

- `agent` 触发器摘要使用聊天主模型，默认打开 `llm`；
- `image | video | audio` 触发器摘要使用当前类别生成模型，默认打开同名媒体页签；
- 面板打开后仍允许切换全部内容类别，标题改为“创作配置”。

模型列表、理解/生成分区、Provider 分组、能力标签和精确选择回调继续复用，不复制为四个模式组件。

替代方案是每种模式各建一份配置弹层。否决，因为会产生四套焦点、placement、catalog filtering 和 purpose selection 路径。

### 2. 底栏提供三个快捷入口，模型和参数共用一个两级配置面板

删除常驻请求参数轨。session mode 继续由独立模式入口选择；模型和参数由统一 `ComposerConfigMenu` 的两个快捷触发器打开同一个配置面板：

```text
底栏： [+] [图片 ▾] [GPT Image 2 ▾] [16:9 · 1080p ▾] ... [发送]
面板： [对话] [图片] [视频] [音频]
             [模型] [参数]
```

三个底部入口分别拥有单一职责：

- 模式入口选择 Agent、图片、视频或音频；
- 模型摘要打开“当前类别 → 模型”；
- 参数摘要打开“当前类别 → 参数”。

配置面板一级导航是内容类别。对话类别只提供模型页；媒体类别提供模型/参数二级导航，模型页配置感知/生成 purpose，参数页配置当前 tab 的 `GenerationParams`。一级或二级切换只更新 tab-scoped presentation state，不改变 session mode；只有底部模式入口拥有 mode mutation。

参数事实仍与模型 purpose binding 分离：共享一个展示面板不代表共享状态 authority。替代方案是模型和参数各自拥有独立弹窗。否决，因为会重复一级类别导航、placement、焦点与扩展类别注册路径。

### 2.1 Agent composer 不拥有 LLM 参数

Agent 模式底栏只展示模式与模型入口；共享面板的对话类别只展示模型页。Webview 不提供 `reasoningPreset`、`verbosityPreset`、`creativityPreset` 或 advanced LLM 参数编辑，也不创建默认 preset。高级 Provider 参数继续由设置/配置文件及其既有 validator 持有。

旧 tab render state 中的 LLM preset 不再参与 Webview 发送路径，不保留 compatibility fallback。媒体类别的画幅、分辨率、时长和音频类型仍是当前生成请求的精确产出规格，因此继续保留参数入口。

### 2.2 感知模型属于媒体类别的模型页

图片、视频、音频一级类别的“模型”二级页固定按以下顺序展示：

1. 感知模型：绑定 `<category>.understand`，候选是声明相应媒体理解能力的 LLM；
2. 生成模型：绑定对应媒体生成 purpose，候选是该媒体类别生成模型。

“自动”感知选择必须展示当前解析到的确切模型；缺失时显示明确未配置。感知选择不得回退到主对话模型或生成模型。

### 3. 菜单 realm 使用统一配置命名并保持单一 overlay

将旧 Agent-only 字段与中间态的独立 model/params overlay 收敛为 `composer-config`、`configCategory`、`configSection`。这些状态只控制当前打开的 overlay、一级类别与二级页面，不拥有模型或参数事实。底部模型/参数触发器在打开前显式写入当前模式对应类别和目标二级页；用户在面板内切换后，该 tab-scoped UI 状态可继续保持。

旧字段只存在于未发布的可恢复 render state，不承载用户项目事实，因此直接替换，不保留 dual-read fallback。

### 4. 共享 Agent Webview 是唯一实现

Desktop 继续挂载同一 `AgentWebviewRoot`。新组件和 CSS 留在 `packages/neko-agent/packages/webview`，Desktop 只参与打包与真实运行态验收。不会在 `apps/neko-desktop` 增加模式配置 adapter 或模型 DTO。

## Risks / Trade-offs

- [全局面板在窄 Dock 中较高] → 复用现有限高滚动、Provider 分组和 category tabs，并用 Desktop 实机验证 placement。
- [切换 session mode 后页签仍停留在旧类别] → 仅在用户点击关闭状态的触发器时同步 active mode；打开后的手动页签选择不被 render 覆盖。
- [直接媒体模式误隐藏模型状态] → 模型触发器始终显示当前类别生成模型摘要；未配置时显示明确的“未配置”状态。
- [参数摘要过长] → 只显示当前类别最关键值，完整字段名和值在统一面板参数页展示。
- [用户仍需高级 LLM 参数] → 继续通过设置/配置文件管理；composer 不复制 provider-specific schema。
- [旧 tab 中仍有语义 preset] → Webview 发送前移除 composer LLM config，语义 preset 不参与新 canonical path。
- [运行中修改配置破坏 snapshot] → 所有模式继续由 `isBusy` 禁用模式、模型和参数触发器。
- [内部 render state 字段破坏性调整] → 该状态可恢复但非项目事实；预发布阶段直接使用新 canonical 字段并让未知旧结构 fail-visible。

## Migration Plan

1. 增加 presenter/component failing tests，覆盖各模式触发摘要、默认页签、全局页签切换和精确回调。
2. 将 `AgentModelConfigMenu` 重构为 `ComposerConfigMenu`，迁移菜单 realm 命名。
3. 将模式、模型和参数快捷入口放入 composer 底栏，把模型与参数收敛为一个两级 `ComposerConfigMenu`。
4. 更新 i18n、CSS、虚拟/窄 Dock 布局测试，删除独立模型/参数 overlay 与每字段菜单 ID。
5. 运行 Agent Webview 测试/typecheck/build、Desktop 打包，并在 Desktop 逐一验证 Agent、图片、视频、音频模式。

回退需要整体恢复旧 Agent-only 菜单和 `MediaModelChip`；不涉及持久项目数据迁移。

## Open Questions

- 模型搜索、收藏和 provider 折叠属于 catalog 规模优化，留给独立变更。

## Follow-up Boundaries

- Home 页后续应支持把用户选择的创作类别作为 mode-aware handoff 传入项目 Agent，但不应复制模型与参数配置；模型 catalog 和 tab-scoped 参数事实仍只由项目内 Agent composer 持有。
- 3D、骨骼与动作生成需要新的 artifact contract、参数 schema、预览/导入能力和 provider purpose；世界模型更适合作为组合式 workflow capability，而不是与图片、视频平铺的单一媒体类型。
- 当前 `ModelType`、`SessionMode` 与协议解析仍是显式 union。新增创作类型应通过独立 OpenSpec 先定义可注册 capability/category contract，再迁移 provider routing、请求 payload、renderer/import 与 evaluation；本次展示收敛不提前扩展运行时枚举。
