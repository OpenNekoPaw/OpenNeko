## Context

Desktop 已有 canonical unbound Agent Entry Draft、Host-owned Workspace grants、Agent `bind-target` 与
first-submit transaction。模式 selector 当前却被组合成 Window Scene navigation，使 Workspace/Character
模式离开输入入口进入管理页，违背“先配置新对话，再提交”的产品语义。

本变更把模式收敛为 Agent Entry Draft presentation configuration。Draft binding 与 binding receipt 是可执行
authority 的事实源；mode 只决定入口呈现和所需配置，不替代领域 identity。

### 五层分析

| 层   | 结论                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Agent Webview 负责 Draft 模式呈现与提交校验；Workspace/Chara/World owner 负责精确 authority；Desktop 只提供授权 adapter。     |
| 依赖 | selector 读取 launch catalog 与 Draft binding；不读取 active/current/recent Project，不直接访问文件系统。                     |
| 接口 | 复用 `bindTarget`、Workspace grant chooser、binding receipt 和 `submitDraft`；不增加第二条提交或 Scene intent。               |
| 扩展 | Character/World 由 owner 提供 exact target configuration 后原子启用；未提供时显示不可用，不编码 prompt fallback。             |
| 测试 | presenter、snapshot codec、Agent Webview、Desktop chooser wiring、launch adapter 与真实 Electron 共同证明唯一配置和提交路径。 |

## Goals / Non-Goals

**Goals:**

- 在 canonical Agent Entry 顶部提供 `助手 | 工作区 | 角色 | 世界` 无边框药丸 selector。
- 切换模式只修改当前 Draft 的入口配置，不导航管理 Scene、不创建业务实例。
- Workspace 要求用户显式选择 Project 或目录，并以 exact binding receipt 校验首次提交。
- 输入文本在模式切换和目标选择期间保持可编辑；只有提交和 authority 选择本身使用局部 pending 状态。
- Character/World 缺少 owner provider 时 fail-visible、fail-local。
- 保持唯一 first-submit transaction 与精确 Scene handoff。

**Non-Goals:**

- 不实现新的 Character Run、RoomRun、World Scene 或 WorldRun。
- 不把 Project/Character/World identity 存入全局 mode store 或 Window Scene。
- 不从管理页、最近项或 active Workspace 推断 Draft authority。
- 不恢复旧 `start-chat | roleplay` action 或 `bind-agent-assistant` Scene intent。

## Decisions

### 1. Mode 是 Draft presentation configuration，不是 Window navigation

selector 只在 `phase: draft` 的 canonical Agent Entry 中显示。Project Management、Character Management、
Conversation、Project Workspace 与 Character Interaction 不显示 selector。点击 enabled mode 不发出 Scene
intent；它更新当前 Draft 的 presentation mode，并通过 launch adapter 绑定或解除精确 target。

mode 可进入 package-owned entry Draft snapshot，以恢复未提交输入体验。它不是业务事实：snapshot 无效时只将
该 Draft 的 mode 重置为 Assistant 并返回 diagnostic，不改写 Conversation、Project 或 Character 数据。

### 2. Draft binding 是执行 authority 的事实源

| 模式   | 入口 binding                                 | 提交条件                           |
| ------ | -------------------------------------------- | ---------------------------------- |
| 助手   | `unbound` 或精确 Assistant binding           | 有效模型配置                       |
| 工作区 | 精确 `workspaceId + workspaceGrantId`        | target 与 binding receipt 完全匹配 |
| 角色   | 未来由 Chara owner 提供精确 Character target | provider 未组合时阻止提交          |
| 世界   | 未来由 World owner 提供精确 World target     | 当前禁用                           |

mode 与 binding 不匹配时 presenter 必须阻止提交并给出明确 diagnostic，不能把 presentation choice 当作
authority，也不能回退到 active/recent Workspace。

### 3. Workspace 在 composer 内显式配置

进入 Workspace 模式后，composer 展示 Project/目录选择器。Project 选择调用 Host `selectProject`，目录选择
调用 Host `chooseDirectory`；两者只返回 opaque Workspace identity 与 grant。Agent Webview 再调用
`bindTarget`，获得属于当前 Draft 与 connection 的 binding receipt。

取消选择使 Draft 回到 unbound；切换离开 Workspace 同样解除 Workspace binding。binding 改变时清除只对旧
authority 有效的引用、mention results 和 Character launch chips，但保留用户输入与模型/执行配置。

### 4. Character 与 World 必须由 owner-qualified provider 启用

Character mode 可以被选择以展示入口语义，但在没有 Chara-owned exact target configuration port 时显示
不可用并阻止提交；不得因此跳转 Character Management。World 没有 provider 时保持 disabled。未来启用必须
同一次更新 owner contract、target chooser、binding receipt、producer、consumer 和测试。

### 5. selector 属于 Agent Entry composition

selector 使用共享 `SegmentedControl` neutral appearance，位于 Agent Entry 内容顶部并保持 top-centered。
Desktop title region 不再渲染 Home mode selector，因此管理 Scene 不会伪装成对话模式。窄窗口时容器收缩，
label 保持可辨识和键盘可访问。

### 6. 提交与 pending 保持局部

首次提交仍按 validation → binding receipt → Conversation commit → Scene handoff → provider execution 执行。
模式/target pending 只禁用 selector 与 chooser；输入框、Window navigation 和布局控制继续可用。切换模式不取消
其他 Conversation 或后台 task，也不保留隐藏 Root。

### 7. Entry 模型目录按模型类型判定可用性

Agent Launch catalog 继续作为 Entry 唯一的模型目录。LLM 只有在 provider、purpose capability、
`contextWindow` 与 `maxOutputTokens` 完整时才可用于对话；image、video、audio 生成模型不使用 LLM token
metadata，因此只按 provider 与对应 purpose capability 判定可用性。不得因媒体模型没有 LLM token metadata
而从 Entry 配置中隐藏。

Host 已从 canonical `config.toml` 解析的 image/audio/video understanding model status 作为只读安全投影进入
同一个 launch catalog，再由 Draft adapter 发送给 composer。Renderer 不重读配置文件、不推断 provider，且不以
首个可用模型替代显式 `default_models` 或 `default_model_purposes`。

## Replaced Paths

- 删除 Desktop `Scene → selected mode` 与 `mode → management Scene intent` presenter。
- 删除在 Project/Character Management title region 渲染模式 selector 的路径。
- 保留已删除的旧 Home `start-chat | roleplay` action 与 `bind-agent-assistant` Scene intent 为不可达。
- 不引入 feature flag、dual renderer、active Workspace fallback 或管理页跳转兼容分支。

## Risks / Trade-offs

- **Character 暂不可提交：** 精确显示 owner 缺口优于导航管理页或生成无 authority Conversation。
- **Workspace chooser 增加入口状态：** 状态限定在当前 Draft presentation，并由 exact binding receipt 防止陈旧选择提交。
- **模式切换清理旧 authority 引用：** 避免引用跨 Workspace/Character 泄漏；输入正文保持不变。

## User Data And Runtime Boundaries

变更只恢复可丢弃的 Agent Entry presentation snapshot，不迁移或重写 durable data。非法 snapshot 只隔离到当前
Draft；无效 Project/授权失败只显示于 chooser 操作，其他项目和 Shell 保持可用。UI 卸载不会取消已提交
Conversation 或受保护后台 task。
