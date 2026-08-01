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
- 不允许 Evaluation 通过任意 Electron IPC、文件系统、secret、Host object 或 direct runtime API
  绕过 sender-bound 产品契约。
- 不把 key-free dry-run、mock output、最终文本匹配、单次 Judge score 或隐藏窗口本身描述为充分
  验收证据。
- 不在通用 CI 中运行 provider-backed matrix 或可见 Electron UI；CI 只运行 key-free、deterministic
  和明确允许的 headless infrastructure gates。
- 不保证模型输出确定性；系统只保证执行身份、路径、证据、预算、失败分类和统计过程可审计。

## Decisions

### 1. Desktop 是唯一真实行为执行目标

所有 provider-backed Prompt、Skill、Tool、model、workflow 和 configuration case 必须启动真实
Electron Desktop，并通过 Renderer/preload 的固定 Agent bridge 进入 sender-bound controller。
外部 runner 不能直接调用 `DesktopAgentWorkspaceRuntime.executeTurn()`、`PiConversationRuntime` 或
历史 `AgentSession`。

采用两个观察档位，而不是两个 Host：

- **Desktop Session Matrix**：真实 Electron、preload、renderer 和 AppHost 全部启动，但窗口保持
  隐藏，不执行视觉断言；用于大矩阵和重复采样。
- **Desktop Visible Acceptance**：同一 executable、driver 和事实契约，窗口可见并执行输入、审批、
  focus、reload、关闭和视觉投影断言；只覆盖受保护的代表性 case。

备选方案是恢复 TUI 或创建 Main-only runner。TUI 会重新引入第二套配置/Tool/Skill/session owner；
Main-only runner会跳过 preload、sender identity 和 renderer projection，二者都不能作为当前产品验收。

### 2. 控制与事实由 Desktop 拥有，实验语义由外部平台拥有

Desktop 定义版本化、最小化的 automation control/facts contract，并只在显式、路径受限的隔离
fixture launch 中启用。外部 Desktop driver 使用 CDP 驱动 renderer 中现有公开 Agent bridge；
submit、queue、cancel、confirm、resume、reload 和 close 必须映射到普通产品操作。automation contract
不得提供任意 channel、任意 command、文件路径或 direct turn execution。

Desktop facts 从各权威 owner 投影，至少覆盖：

- application/window/view/workspace/renderer epoch；
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

## Risks / Trade-offs

- **[Electron Worker 消耗明显高于 TUI]** → 使用预构建 executable、有界并发、资源分类、分片和
  key-free 预筛选；以基准数据决定默认并发，不硬编码不可信吞吐量。
- **[隐藏窗口与可见窗口行为可能漂移]** → 两种模式共享相同 executable、preload、bridge 和 facts；
  protected visible matrix 定期覆盖 approval、focus、reload 和 close。
- **[CDP 或 automation port 绕过安全边界]** → 仅在显式隔离 fixture 参数、受限路径和独立 userData
  下启用；固定 typed operations、sender binding、无任意 IPC/文件/secret，并由拓扑/安全测试 poison。
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

## Migration Plan

1. 在现有 Desktop Agent composition 上补齐中立 facts 与显式 terminal/disposal contract，并完成
   `integrate-desktop-agent-home` 的最终 qualification。
2. 扩展 Desktop functional launch 为可选择隐藏窗口的隔离 automation mode，验证并行
   `userData`、single-instance lock、端口、安全和清理。
3. 实现 Desktop complete-session driver 与 `runV2Case()` 单样本路径，先覆盖一个 canonical turn、
   一个 Tool approval 和一个 reload/resume case。
4. 恢复重复采样、artifact checks、Judge、baseline 和报告写入，再接入 matrix Worker Pool、预算、
   资源分类与 shard。
5. 增加产品有效配置快照/digest，迁移现有 runtime/model profiles；删除 ablation plan 中重复的自由
   文本 path 和 TUI/`AgentSession` 残留。
6. 接通 configuration 与 implementation ablation，建立新的 Desktop baseline；历史 TUI 数据只写入
   迁移 ledger，不参与 delta。
7. 运行 key-free 全套门禁、focused real Desktop cases、重复 matrix 和 protected visible Electron
   cases，记录不可用 provider/凭据/平台阻塞。

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
- provider-backed matrix 的受信任执行环境和凭据注入方式仍是本地优先；若未来进入受信任 CI，需要
  单独 OpenSpec 定义 secret、artifact retention、成本和审批边界。
