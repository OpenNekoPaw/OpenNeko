## Why

Agent Entry Draft 与 Assistant/Workspace 会话目前使用不同的状态与提交路径，角色入口和未来 World 交互也缺少可消费的统一扩展边界，导致同一界面同时出现“目标已选择但没有读取 authority”“catalog 已加载但入口禁用命令”“领域身份固定但运行时仍读取 current Project”等冲突。现在需要先建立唯一的 Launch Draft、领域绑定、typed input 和配置策略，再由后续 Character 与 World change 接入各自 authoritative owner，否则每增加一个领域都会复制并放大这些冲突。

## What Changes

- 将入口界面定义为未绑定的 Agent Launch Draft，而不是提前创建的 Agent session；当前从 Assistant、Workspace 发起的新交互定义为携带精确 owner identity 的 bound Draft，Character 与 World 只保留后续 owner 可消费的 typed binding contract。
- 建立唯一的 Draft submit application path：验证目标、资源授权、typed input 与有效配置，原子创建 exact Conversation 或领域 Run attachment，再切换到对应 Scene；禁止根据文本、active/current/recent Project 或组件状态推断 owner。
- 统一 Entry 与 Session 的 `@`、`/`、`$` catalog 和 typed invocation；catalog 项声明 phase、scope、owner 与可用性诊断，launch-safe 项可用于 Draft，session-only 项不得退化为普通模型 prompt。
- 让 Workspace、Assistant 通过窄 domain binding/context port 提供精确身份、授权 read model 和 capability contribution；为 Character 与 World 定义相同的可选消费端口，未组合 authoritative provider 时只返回 owner-qualified unavailable。Agent 保持唯一 session/runtime owner，不复制领域事实或建立领域专用 Agent runtime。
- 在应用进程重启后，从持久化 Workspace Draft 的精确 Window、Workspace 与 grant identity 恢复 Desktop grant authority；恢复失败只投影当前 Agent Surface unavailable，不阻止 Window Shell、Workspace Main 或 sibling Surface 渲染。
- 当前 canonical Conversation lifecycle 无法解码的历史记录继续保留，并在精确 Conversation Agent Surface 返回 typed unavailable；禁止补写缺失字段、兼容读取旧 shape、删除记录或让单条失效冒泡为 bootstrap IPC 与整个界面失败。
- 将模型发现与模型可执行性分离；Draft 和 Conversation 投影逐字段配置策略、来源和不可用原因，运行中的 Turn 使用不可变配置快照，同一 Conversation 的合法修改只作用于未来 Turn。
- 让 Workspace 引用以 exact ContentLocator 进入唯一 Agent 内容处理路径：包括 Fountain、Markdown、JSON、YAML 和 HTML 在内的有界文本由 Agent workspace owner 原生读取，PDF、DOCX、EPUB、CBZ 等结构化文档由既有 `ReadDocument` 处理，文档图片继续通过 `ReadDocument -> ReadImage`，授权图片按预先确定的模型/感知能力计划处理；Desktop 不再维护格式白名单或结构化文件拒绝路径。未注册的音视频或通用转换能力只拒绝当前引用并给出明确诊断。terminal Conversation projection 收敛可见执行活动，避免有效引用被误判为未连接的预处理或最终回复后残留“正在处理”。
- 严格化 Pi 可见的 `ReadDocument` range 参数并由 Workspace Agent runtime 使用同一内容 authority 物化 `ReadImage` Tool result；禁止顶层 locator 别名、Desktop 私有图片 loader、缺失生产注入和结果成功后的 loader failure。
- 将 Pi 可见的内容 Tool 参数收敛为 Conversation-scoped 短引用：模型只传 `input_ref`、`unit_ref`、`cursor_ref` 和最多五个 `image_ref`，Agent application 在 exact Conversation/Turn 内解析为 canonical ContentLocator、DocumentLocator、cursor 与 representation locator。Tool result 对模型只投影短引用和有界内容，对持久 details 保留可重建绑定；不引入第二种持久内容 identity。
- 明确创作格式路由：纯文本继续使用基本 Read/Write，原生视觉模型消费 Pi `ImageContent`，非原生视觉模型只能使用 Turn policy 已绑定且实际注册的 `perception.image.understand` Tool；该 Tool 通过 Conversation 短引用读取图片并调用冻结的 `image.understand` purpose model，向主模型返回结构化证据。Tool 注册、`ReadImage` 可见性和路由 Prompt 必须由同一不可变 Turn 路由快照决定，禁止仅因配置模型不同而声称 Tool 存在。PDF、EPUB、DOCX、CBZ 使用 `ReadDocument` 取得 `image_ref`，原生视觉路径再调用 `ReadImage`，外部感知路径直接消费相同短引用；图片由 Host 筛选、缩放或拼接且单批不超过五张。音视频、乐谱、压缩包和未知二进制只走精确注册的处理 capability；可执行文件与原生未知二进制保持 unsupported，未来 Computer Use/隔离处理器由独立 change 设计。
- 将 Workspace 目录发现纳入同一内容协议：模型使用 Workspace-relative path 调用有界、单层 `ListDirectory`，Core Tool 在授权后返回结构化 locator-backed 条目，Agent application 再按内容类别投影文本 `workspace_path`、结构化/媒体 `input_ref` 或图片 `image_ref`。目录发现不调用 shell、不暴露绝对路径、不跟随 symlink，也不把非文本交给基本 `Read`。
- 将运行中后续输入统一交给 Conversation-owned 消息队列：Composer 在当前 Turn 活动时继续接受与普通消息相同的文本、附件、引用、上下文和 typed input，队列保存完整待执行请求并在前序 Turn 终止后串行启动。显式停止只中断当前 Turn并暂停待处理队列；用户可以删除、完整取回编辑或原子地立即发送指定队列项，立即发送通过提升该项并终止当前 Turn实现，不并发执行同一 Conversation。
- **BREAKING**：删除角色特殊文本启动、Entry 原始文本命令/Skill 首发、空 Workspace mention 结果以及所有 active/current Project fallback；同步替换 producer、consumer、fixture 与测试，不保留兼容路径。
- 明确 World 接入前置条件：World owner/runtime 未实现时返回 owner-qualified unavailable；接入后 World 保持状态/事件 commit authority，并通过现有 AgentSession role scopes 消费模型能力。
- 明确 Character 接入前置条件：本变更不实现 CharacterProject、published CharacterVersion、CharacterRun、Character Scene 或角色回复；这些产品行为由后续 Chara change 在独立分支实现并组合。

## Capabilities

### New Capabilities

- `agent-launch-domain-binding`: 定义 unbound/bound Draft、精确领域 owner binding、首次 typed submit、Conversation/World Run materialization 与 Scene handoff。
- `agent-input-capability-catalog`: 定义 Entry/Session 共享的 mention、command、Skill 与资源 catalog、phase/scope availability 以及 typed invocation contract。
- `agent-configuration-policy`: 定义可执行模型 catalog、字段级配置 editability/lock、effective configuration、未来 Turn 更新和运行中快照语义。

### Modified Capabilities

<!-- No canonical main-spec capability currently owns Agent Launch Draft or domain binding. -->

## Impact

- `packages/agent/contracts` 拥有 canonical Launch Draft、binding、input catalog、typed submit 和配置策略 contract；`packages/agent/runtime` 拥有解析、验证、Conversation lifecycle、catalog composition 与唯一 AgentSession application path。
- `packages/agent/webview` 继续拥有唯一 Agent Root/composer，只渲染 Host 投影并提交 typed intent；删除基于 presentation booleans、特殊文本和 renderer-local target 推断的成功路径。
- 后续 `packages/chara` 变更拥有 CharacterVersion/CharacterRun、角色上下文与角色行为策略，并通过本变更定义的 typed binding/context consumer contract 接入；本变更不修改或组合该产品 owner，也不把角色事实下沉 Agent 或 Desktop。
- 未来 `packages/world` 拥有 WorldExperience/WorldRun、participant view、事件和状态 authority，通过 public port 组合 Agent role scopes；本变更不在 Desktop 或 Agent 内伪造 World 数据与 runtime。
- `apps/neko-desktop` 仅保留 Electron sender/window/path/grant 信任边界、typed IPC、Scene composition 和 package public port wiring；Host-neutral binding resolution、catalog policy 与领域结果不得留在应用组合根。
- 影响 `compose-desktop-workbench-scenes`、`define-character-chatroom-play-use`、`define-ai-native-interactive-world`、`clarify-desktop-capability-catalog` 与 `add-desktop-agent-evaluation-matrix` 的重叠约束，实施前必须同步消除相互矛盾的 requirement 与 verification 声明。
- 不修改用户创作事实；现有 Conversation 记录无法满足新 canonical binding 时保留原记录并在该 Conversation 边界显示 diagnostic，不迁移、猜测或覆盖 owner。
