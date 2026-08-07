## Context

OpenNeko 只有一个产品组合根 `apps/neko-desktop`。Desktop Main 已组合 sender-bound Agent
controller、Pi conversation authority、Pi Session、CredentialStore、permission、Tool/Skill 和
Conversation/Timeline projection；`integrate-desktop-agent-home` 仍负责补齐该产品路径本身的最终
facts 与 Electron 验收。

外部 `scripts/agent-eval` 已拥有 22 个 Suite、51 个 Case，以及 strict schema、fixture、硬门禁、
artifact validator、baseline、Judge、optimization 和配置/实现消融契约，但真实 `runV2Case()`
已在 TUI Host 退役后变成 `infrastructure-blocked` 桩。现有消融计划只完成了部分名词迁移，仍把
`session.create runtimeConfig`、legacy `AgentSession` 和自由文本 `expectedPath` 当作 Desktop 路径。

`scripts/desktop-functional` 已提供隔离临时目录、独立 Electron `userData`、动态 CDP 端口、
development/packaged launch、控制台/异常观测和可恢复进程清理。它可以作为通用 Electron 进程与
fixture 基础，但 Webview functional runner 不应拥有 Agent suite、配置变体、评分或报告语义。

本变更跨越 Desktop Main/preload/renderer、Agent runtime contract、Electron functional
infrastructure 与外部 Evaluation platform。设计必须同时保证唯一产品路径、批量吞吐、样本隔离、
凭据安全、配置可比性、失败可见性和可审计报告。

## Goals / Non-Goals

**Goals:**

- 让真实 Agent case 通过 Desktop complete-session owner 和公开 Agent 输入路径执行，而不是恢复
  TUI、直接导入 turn runner 或创建第二套 session assembly。
- 支持隐藏窗口的大批量 Desktop Session Matrix，并用少量可见窗口场景保护真实 UI、IPC、reload
  和窗口生命周期；两者共享同一 runtime 与事实契约。
- 为 suite/case/config/model/build/repetition 提供严格展开、隔离 Worker、有界并发、分片、预算、
  outcome 和逐样本报告。
- 让配置消融只改变产品真实支持的配置，并以实际生效配置 facts/digest 证明；让实现消融通过隔离
  revision/build 改变 Prompt、Skill 或代码，而不是留下运行时实验分支。
- 复用现有 suite、硬门禁、validator、Judge、comparison 和 optimization 资产，同时建立全新的
  Desktop baseline。

**Non-Goals:**

- 不恢复 `apps/neko-tui`、VS Code Host、TUI debug protocol 或任何别名/兼容 runner。
- 不把 Evaluation 注册成 Agent Skill、产品 capability、普通用户入口或第二个 Agent controller。
- 不让 Skill 持有运行时操作协议、step schema、handler 注册、pass/fail 或 CI 策略；Skill 只负责
  authoring 方法、覆盖判断、草案生成和证据解释。
- 不允许 Evaluation 通过任意 Electron IPC、文件系统、secret、Host object 或 direct runtime API
  绕过 sender-bound 产品契约。
- 不把 key-free dry-run、mock output、最终文本匹配、单次 Judge score 或隐藏窗口本身描述为充分
  验收证据。
- 不在通用 CI 中运行 Agent Evaluation harness、provider-backed matrix、消融计划或可见 Electron UI；
  本变更只保留开发者显式本地入口，CI 运行普通 deterministic unit/contract/headless gate 和本地入口
  不可达的编排检查。
- 不创建独立 compiler service/workspace、动态测试插件系统或统一 UI/Agent DSL；当前只补齐现有
  schema validation、case resolution 与 execution 之间的薄连接。
- 不保证模型输出确定性；系统只保证执行身份、路径、证据、预算、失败分类和统计过程可审计。

## Decisions

### 1. Desktop 是唯一真实行为执行目标

所有 provider-backed Prompt、Skill、Tool、model、workflow 和 configuration case 必须启动真实
Electron Desktop，并通过 Renderer/preload 的固定 Agent bridge 进入 sender-bound controller。
外部 runner 不能直接调用 `DesktopAgentWorkspaceRuntime.executeTurn()`、`PiConversationRuntime` 或
历史 `AgentSession`。

采用两个观察档位，而不是两个 Host：

- **Desktop Session Matrix**：真实 Electron、preload、renderer 和 AppHost 全部启动，但窗口保持
  隐藏，不执行视觉断言；用于大矩阵和重复采样。它通过公开 Agent input path 操作完整 session，
  不等于 Main-only/headless turn runner。
- **Desktop Visible Acceptance**：同一 executable、runtime 和事实契约，窗口可见，并通过实际
  composer、PrimarySidebar、审批和领域 UI 控件执行输入、切换、focus、reload、关闭和视觉投影断言。
  Automation 可以定位/操作/观察控件，但不得通过 bridge 直接创建会话或提交目标功能的成功状态。

备选方案是恢复 TUI 或创建 Main-only runner。TUI 会重新引入第二套配置/Tool/Skill/session owner；
Main-only runner会跳过 preload、sender identity 和 renderer projection，二者都不能作为当前产品验收。

### 2. 控制与事实由 Desktop 拥有，实验语义由外部平台拥有

Desktop 定义版本化、最小化的 automation control/facts contract，并只在显式、路径受限的隔离
fixture launch 中启用。外部 Desktop driver 使用 CDP 驱动 renderer 中现有公开 Agent bridge；
submit、queue、cancel、confirm、resume、reload 和 close 必须映射到普通产品操作。automation contract
不得提供任意 channel、任意 command、文件路径或 direct turn execution。

Desktop facts 从各权威 owner 投影，至少覆盖：

- application/window/view/workspace instance and renderer session identity；
- conversation/branch/Pi session/turn/run/tool-call identity；
- controller、Pi runtime、transcript、catalog 与 projection path；
- requested/effective provider、model、runtime configuration、Prompt fragment、Skill 和 Tool catalog
  identity/digest；
- permission decision、queue/continuation/Tool/Job terminal state、Timeline revision、checkpoint 与
  persistence/reload outcome；
- runtime error、diagnostic、dropped/truncated fact count 和 disposal result。

facts 只包含中立身份、hash、状态、计数、usage 和脱敏 diagnostic，不包含 suite、case、variant、
baseline、score 或 pass/fail。`scripts/agent-eval` 负责把 facts 与 scenario assertions 关联并决定结果。

备选方案是让 Evaluation runner 从日志或 DOM 文本推断路径。该方案无法可靠证明实际配置、权限、
持久化和 no-fallback，因此拒绝。

### 3. 一个样本拥有一个隔离 Desktop application lifecycle

每个 repetition 使用独立 fixture home、Electron `userData`、Workspace、global storage、Pi Session、
SQLite catalog、Conversation、CDP/control port 和报告目录。Worker 不跨样本复用可变 Desktop 状态；
同一 case 内的多 turn、reload、resume 和 restart 仍属于同一个样本生命周期。

矩阵 runner 预先验证并展开任务，再以有界 Worker Pool 调度。并发限制按资源类别区分普通文本、
外部 Tool、媒体/FFmpeg/GPU 与可见 UI；可见 UI 默认串行。分片使用稳定 sample identity，重复执行
同一 shard 不得覆盖既有报告。

批量运行优先使用预构建、带 fingerprint 的 Desktop executable。development/Vite target 只用于
聚焦调试，不能为每个并行样本启动一套共享端口不明确的 dev server。实现消融可缓存不可变构建，
但每个样本仍启动新的应用生命周期。

备选方案是在一个 Desktop 进程中连续执行多个不相关 case。它会共享 Config、CredentialStore、
SQLite、plugin catalog、cache 和 renderer 状态，降低可比性，因此不作为默认或 release 证据。

### 4. 动态配置是产品配置投影，不是 Evaluation flag

Desktop/Agent owner 定义可组合的有效运行配置快照。每个支持的维度必须声明 key、类型、合法范围、
owner、scope、默认值、来源和是否需要重启；当前至少映射 execution mode、temperature、max tokens、
thinking budget、output format 和 model/purpose binding。Skill/Tool/permission 等开关只有成为真实、
稳定的产品 session setting 后才可进入配置消融。

每个 turn 冻结 requested 与 effective configuration，并输出：profile identity、逐维度值与来源、
model/prompt/skill/tool fingerprints 以及稳定 digest。声明值缺失、漂移、被默认值替代或未改变时，
样本必须 `configuration-invalid` 或 `non-comparable`，不能继续报告提升。

Prompt fragment、Skill content、router 或 runtime hook 若不是产品支持的配置，则必须走 implementation
ablation：外部平台准备隔离 revision/patch/build，验证 source/build/executable fingerprint，并用同一
Desktop driver 执行。

备选方案是增加 `__ablation`、环境变量 feature flag 或隐藏 fallback。它会污染产品 canonical path，
也无法证明普通用户会命中相同行为，因此禁止。

### 5. Scenario 唯一拥有 canonical path 和 forbidden fallback

消融 plan 不再复制自由文本 `expectedPath`。Scenario 的 evidence contract 与可执行 assertions 是
canonical path、required facts 和 forbidden fallback 的唯一 owner；variant 只声明允许发生的配置或
构建差异，以及必要的附加 no-fallback 条件。

Runner 在执行前生成 comparability contract，冻结 scenario、fixture、model、runtime policy、Judge、
artifact validator、budget 和 executable/config identity。未声明差异、facts 缺失、相同 digest、
policy drift 或历史 TUI Host identity 都产生 `non-comparable`，而不是 pass。

这样可以删除当前把 `TUI App session owner` 机械替换为 `Desktop App session owner` 后仍保留
`AgentSession` 的漂移路径。

### 6. 正确性优先于效率和主观质量

每个样本按固定顺序处理：

1. fixture、launch、identity 和 effective configuration preflight；
2. complete-session execution 与 terminal-idle/disposal；
3. canonical path、no-fallback、permission、process、format 和 artifact 硬门禁；
4. owning-domain artifact validator；
5. 仅在硬门禁通过后运行 allowlisted Judge；
6. 写入逐样本结果，再聚合 pass rate、latency、tokens、cost、iterations、Tool success、retries 和
   quality distribution。

行为失败不会被自动重试成成功。只有在 turn 尚未开始且 execution identity 未产生时，明确的启动、
网络或 provider infrastructure failure 才能在预算内重试；所有尝试均保留。硬门禁、holdout 或受保护
回归失败优先于平均分、延迟、Token 和成本改善。

### 7. 历史 TUI 证据只归档，不迁移 baseline

历史 TUI report、baseline 和 executable fingerprint 保留原 Host identity，并永久与 Desktop
outcome `non-comparable`。可以迁移用户行为、fixture、scenario steps、hard gates、validator 和 rubric；
必须重写 Desktop path/facts 并生成新的 baseline。TUI terminal resize、Ink Markdown、StatusBar、
CLIConfig 和 AppPort case 退役；若对应用户行为仍有价值，应建立新的 Desktop renderer case。

### 8. 与现有变更的依赖采用 fail-visible gate

本变更不复制 `integrate-desktop-agent-home` 的 controller/session/permission/projection 实现。Driver
启动时验证所需 Desktop facts 和 route capability；依赖未完成时真实 case 保持
`infrastructure-blocked`，并指出缺失 contract。不得通过 mock、direct runtime 或旧 Host 暂时通过。

### 9. Skill 负责 authoring，声明式 artifact 负责测试意图

Evaluation Skill 读取变更、suite coverage、能力目录、facts 与 validator catalog，辅助形成
`reuse`、`update`、`create` 或 `excluded` 决策，以及 suite/scenario/assertion/ablation plan 草案。
生成结果必须进入现有严格 schema、index 和普通代码评审；Skill 不直接执行测试、不注册 handler、
不修改 schema 真相，也不依据上下文动态补全缺失步骤。

普通新 UI 或 Agent case 只增加声明式场景、fixture 引用和 assertion 引用。只有出现 schema 尚未表达的
真实产品操作或新的领域证据边界时，才由 owning package 增加 typed operation、neutral fact 或
domain validator；生成的未实现骨架必须 fail-visible，不能默认成功。中央 runner 不得按
`scenario.id`、Skill 名称或产品功能名称选择专用成功路径。

备选方案是让 Skill 直接生成并执行 JavaScript。该方案不可严格校验、不可稳定复现，也会把凭据、
进程生命周期、pass/fail 和产品协议混入 prompt content，因此拒绝。

### 10. 确定性解析留在现有 Runner，不单独建设编译平台

现有 `validateScenarioForExecution()` 已拥有 strict schema、引用、supported-kind 和 workflow 状态机
校验，dry-run 已解析 fixture、runtime/model profile 与 report policy。本变更只在既有 runner 内增加
纯、无副作用的薄解析步骤，将已验证 selection 冻结为内部 `ResolvedExecutionCase`，随后交给通用
workflow interpreter、Desktop driver 和既有 assertion/artifact/Judge/report 阶段。

`ResolvedExecutionCase` 当前不持久化、不单独版本化、不跨进程传输，也不引入新的 workspace、服务、
factory/registry/provider 层。步骤分发优先使用对现有 union 的穷尽处理；未知 kind、缺失 evaluator、
非法 identity 或 unsupported evidence 必须在启动 Desktop 前失败。只有 matrix/shard 实现证明需要稳定
跨进程计划、多个真实执行后端或不可变缓存时，才在同一 change 中评估最小提取，不能预先建设平台。

### 11. 执行 lane 由仓库策略决定且保持本地

Scenario 可以声明所需 evidence level 和资源，但不能自行选择 CI。Agent Evaluation key-free harness、
hidden/visible Desktop、真实 provider API、重复 matrix 和 configuration/implementation ablation 都通过
显式本地入口运行；GitHub Actions 与通用 CI script graph 不得直接或间接引用这些入口。普通
unit/contract/headless 测试仍可在 CI 验证产品与编排边界，但不能据此宣称 Agent 行为、UI 或消融结果。

本地入口隔离 fixture、userData、凭据和报告，原始报告保持 gitignored。任何未来把 Evaluation 引入
受信任 CI 的需求都必须创建独立 OpenSpec，不能在本变更中预留自动启用分支。

### 12. 基础 Agent 行为使用固定覆盖矩阵

AgentSession、持久化、生成 workflow 和 Desktop projection 的基础矩阵固定覆盖：正常首轮/多轮
对话与 terminal UI；canonical context compaction 后 continuation；销毁并重建完整 owner/应用后的
transcript 顺序和内容；生成 Tool/Job/progress/terminal/artifact 记录恢复；两个以上会话的目标 transcript
和 owner-qualified Scene 切换；以及 transcript、queue、configuration、context、artifact、cancel 和
异步状态隔离。

每个 cell 记录 visible、hidden batch、deterministic 或不适用 disposition。受影响开发可以运行最小
子集，但必须解释其余 cell；AgentSession/持久化/projection 的发布验收必须关闭全部适用 cell。最终
文本只能证明输出，不能替代 provider/model identity、conversation/turn/run identity、canonical path、
terminal、restore 和 no-fallback 证据。

## Risks / Trade-offs

- **[Electron Worker 消耗明显高于 TUI]** → 使用预构建 executable、有界并发、资源分类、分片和
  key-free 预筛选；以基准数据决定默认并发，不硬编码不可信吞吐量。
- **[隐藏窗口与可见窗口行为可能漂移]** → 两种模式共享相同 executable、preload、bridge 和 facts；
  protected visible matrix 定期覆盖 approval、focus、reload 和 close。
- **[CDP 或 automation port 绕过安全边界]** → 仅在显式隔离 fixture 参数、受限路径和独立 userData
  下启用；固定 typed operations、sender binding、无任意 IPC/文件/secret，并由拓扑/安全测试证明越界入口不可达。
- **[并行样本争用 provider、GPU、FFmpeg 或端口]** → provider/resource semaphore、动态端口、启动
  重试边界和独立资源类别；行为执行开始后不重试。
- **[凭据被复制到 fixture 或报告]** → credential preflight 只通过 Desktop credential owner，报告
  allowlist 与 fixture-root redaction；Renderer、facts 和 artifacts 不包含 secret。
- **[模型随机性导致误判]** → 重复采样、随机 variant 顺序、全样本保留、置信区间和盲化 Judge；
  correctness gates 不接受平均值覆盖失败。
- **[事实过多泄漏内部实现或被截断]** → facts 以稳定 owner contract、bounded collections 和 dropped
  count 管理；必需事实被截断时 case blocked，不增加通用 debug dump。
- **[实现消融构建成本过高]** → 按 source/build recipe fingerprint 缓存不可变 build；baseline 与
  candidate 仍使用独立 target 和新的 sample lifecycle。
- **[声明式场景演化成万能 DSL]** → 只表达已存在的产品操作、证据和 assertion 引用；领域 UI 与产物
  语义留在 owning package，新增跨域抽象前要求两个以上同生命周期、同错误模型的真实复用点。
- **[薄解析重新膨胀成编译平台]** → 当前不新增 package、持久计划、动态插件或独立版本；先以纯函数、
  穷尽步骤解释和既有 schema/hard-gate 组合完成，达到明确提取条件后再设计。

## Migration Plan

1. 在现有 Desktop Agent composition 上补齐中立 facts 与显式 terminal/disposal contract，并完成
   `integrate-desktop-agent-home` 的最终 qualification。
2. 扩展 Desktop functional launch 为可选择隐藏窗口的隔离 automation mode，验证并行
   `userData`、single-instance lock、端口、安全和清理。
3. 在现有 schema/runner 内实现薄 `resolveExecutionCase` 与通用 workflow interpreter，删除具体
   `scenario.id` 白名单、单次 submit/idle 限制和按 case 选择 assertion 的分支；先覆盖一个 canonical
   turn、一个 Tool approval、一个 cancellation 和一个 reload/resume case。
4. 让 Skill/authoring 只生成或更新声明式 artifact，恢复 assertion-driven hard gates、artifact checks、
   Judge、baseline 和报告写入，再接入 matrix Worker Pool、预算、资源分类与 shard。
5. 增加产品有效配置快照/digest，迁移现有 runtime/model profiles；删除 ablation plan 中重复的自由
   文本 path 和 TUI/`AgentSession` 残留。
6. 接通 configuration 与 implementation ablation，建立新的 Desktop baseline；历史 TUI 数据只写入
   迁移 ledger，不参与 delta。
7. 通过显式本地入口运行 key-free 全套门禁、focused real Desktop cases、重复 matrix、消融和
   protected visible Electron cases，记录不可用 provider/凭据/平台阻塞；用通用 CI 编排测试证明这些
   入口不可达。

回滚时可以禁用新的外部 matrix entrypoint，并让真实 case 回到明确的 `infrastructure-blocked`；不得
回滚到 TUI、direct runtime 或 mock 成功路径。所有临时 fixture 和报告可重建，用户项目、设置、凭据
和已接受 Desktop baseline 不得被自动删除或覆盖。

## Open Questions

- Desktop automation facts 最终通过 fixture-only typed preload projection 还是独立受限控制 transport
  读取，需要在实现前以 sender binding、安全测试和批量吞吐基准选择；两者都不得暴露任意 IPC。
- 默认 Worker 并发、provider semaphore 和媒体资源级别需要在 packaged Desktop 上建立 CPU、内存、
  GPU、启动时间和 API rate-limit 基线后确定。
- 哪些 Skill/Tool/permission 开关属于长期产品 session settings，哪些必须保持 implementation ablation，
  需要按 owning package 逐项审计后加入配置 catalog。
- 是否需要在 matrix/shard 阶段持久化 `ResolvedExecutionCase`，必须由跨进程传输、缓存和多个真实
  执行后端的实现证据决定；在此之前保持 runner 内部对象。
