## Why

Agent Entry Draft 与 Assistant/Workspace 会话目前使用不同的状态与提交路径，角色入口和未来 World 交互也缺少可消费的统一扩展边界，导致同一界面同时出现“目标已选择但没有读取 authority”“catalog 已加载但入口禁用命令”“领域身份固定但运行时仍读取 current Project”等冲突。现在需要先建立唯一的 Launch Draft、领域绑定、typed input 和配置策略，再由后续 Character 与 World change 接入各自 authoritative owner，否则每增加一个领域都会复制并放大这些冲突。

## What Changes

- 将入口界面定义为未绑定的 Agent Launch Draft，而不是提前创建的 Agent session；当前从 Assistant、Workspace 发起的新交互定义为携带精确 owner identity 的 bound Draft，Character 与 World 只保留后续 owner 可消费的 typed binding contract。
- 建立唯一的 Draft submit application path：验证目标、资源授权、typed input 与有效配置，原子创建 exact Conversation 或领域 Run attachment，再切换到对应 Scene；禁止根据文本、active/current/recent Project 或组件状态推断 owner。
- 统一 Entry 与 Session 的 `@`、`/`、`$` catalog 和 typed invocation；catalog 项声明 phase、scope、owner 与可用性诊断，launch-safe 项可用于 Draft，session-only 项不得退化为普通模型 prompt。
- 让 Workspace、Assistant 通过窄 domain binding/context port 提供精确身份、授权 read model 和 capability contribution；为 Character 与 World 定义相同的可选消费端口，未组合 authoritative provider 时只返回 owner-qualified unavailable。Agent 保持唯一 session/runtime owner，不复制领域事实或建立领域专用 Agent runtime。
- 在应用进程重启后，从持久化 Workspace Draft 的精确 Window、Workspace 与 grant identity 恢复 Desktop grant authority；恢复失败只投影当前 Agent Surface unavailable，不阻止 Window Shell、Workspace Main 或 sibling Surface 渲染。
- 将模型发现与模型可执行性分离；Draft 和 Conversation 投影逐字段配置策略、来源和不可用原因，运行中的 Turn 使用不可变配置快照，同一 Conversation 的合法修改只作用于未来 Turn。
- 让 Workspace 文本创作文件（包括 Fountain screenplay）通过 exact ContentLocator 进入 Conversation context；让授权图片在 exact selected model 支持 image input 时由 Agent workspace owner 有界物化为当前 Turn 的原生多模态输入，同时只在消息引用中保留 locator；其他二进制和未组合的结构化格式继续 fail-visible。terminal Conversation projection 收敛可见执行活动，避免有效引用被误判为未连接的预处理或最终回复后残留“正在处理”。
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
