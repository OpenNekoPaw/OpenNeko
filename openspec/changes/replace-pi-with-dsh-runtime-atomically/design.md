## Context

OpenNeko 当前由 `@neko/agent-runtime` 直接组合 Pi Agent/Session，并自研 Tool registry、消息队列、Timeline/history projector、Skill Host、MCP client/bootstrap、Plugin contribution runtime、clear/rollback/compaction。`apps/neko-desktop` 通过 package public entries 完成 Electron Main/preload/renderer wiring，`scripts/agent-eval` 已能通过完整 Desktop session owner 和公开 Agent input path执行真实 provider 验收。

本变更用 DeepSeek Harness（DSH）与 Cordis 统一通用 Agent/Extension runtime，但 OpenNeko 仍拥有产品 catalog、信任、凭据、授权、领域事实、领域 Job、媒体数据面和 UI 投影。DSH 仍是 developer preview；审计基线为 `deepseek-ai/deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`，npm RC 的 dist-tag 与完整 package closure 不同步，Session format 也不承诺跨版本可读。

用户要求整体迁移并一次性原子发布。并行开发只用于缩短实现时间，不产生可以单独发布的 P1–P4 中间产品状态。一个总 OpenSpec 拥有交付边界；隔离分支/worktree 中的工作流必须在同一集成分支汇合，并通过统一门禁后一次切换。

## Goals / Non-Goals

**Goals:**

- 让 DSH/Cordis 成为 Agent、Session、Tool、Skill、MCP 与 Plugin lifecycle 的唯一 runtime authority。
- 删除 OpenNeko 对 Pi Agent/Session/Skill/Tool loop 的直接依赖和重复自研执行路径。
- 保持 Desktop 薄组合根、Renderer sandbox、产品 catalog、信任、凭据、资源授权和领域 ownership。
- 允许按 owner 拆分并行工作流，同时冻结共享 contract、控制集成顺序并禁止分阶段发布。
- 保留旧 Pi 用户数据原始字节，局部显示不可执行状态，不增加 legacy reader、迁移器或 fallback。
- 通过 deterministic path gates、完整 Desktop session、真实 provider、可见 UI 与恢复矩阵证明唯一新路径。

**Non-Goals:**

- 不引入通用多引擎 `ConversationRuntimePort`、feature flag、Pi/DSH runtime selection 或失败后 fallback。
- 不直接引入 `dsh-base`，不启用没有真实 OpenNeko consumer 的 Shell、Sandbox、Telemetry、Web 或 Subagent 默认能力。
- 不让 Cordis Loader、Session、Tool adapter 或 Renderer 成为 Plugin catalog、Conversation catalog、领域事实或 Job authority。
- 不在本变更中转换旧 Pi transcript 为 DSH Session，也不提供正常产品可达的旧 transcript reader/repair/migration。
- 不允许第三方 Extension 在 Electron Main 中执行任意 JavaScript；未来代码插件隔离必须由独立 OpenSpec 定义。
- 不把 Evaluation 变成产品 Skill、第二个 Agent controller 或 direct runtime runner。

## Decisions

### 1. Q0 是实现准入门，不是可跳过的安装步骤

Q0 必须在生产实现工作流合入前固定并验证完整 DSH package closure。不得使用 `latest`、caret、tilde 或混合 RC；lockfile 必须唯一解析到同一经审计的 RC family。资格记录至少包含 package 名称/版本/许可证、peer closure、目标 Electron/Node ABI、生产 bundle、Context create/dispose、应用退出、Session write/resume/fork/compaction fixture、真实已授权 provider、Tool call/cancel/error 和 unsupported Session fail-local 结果。

Q0 同时冻结共享 contract：Conversation 到 DSH Session 的映射、DSH turn/call identity、Tool schema/validation、queue/inbox、Skill/Plugin projection、Credential provider、Session cwd/path、clear/compact 和旧 Pi 数据处置。集成 owner 必须维护共享文件/owner manifest；叶子工作流只能消费被冻结的 public contract。任一项无可验证实现时 Q0 失败，W1–W7 只能继续原型或测试夹具，不能进入最终 consumer 切换。

Q0 的 bundle 验证只允许构建隔离的 DSH qualification fixture，用于证明 Electron/Node 兼容性和测量 bundle/startup；它不是 Desktop 发布产物。普通 Desktop package/release/tag 入口必须增加机器门禁，负例证明任一工作流、删除证明或真实 Evaluation 未完成时无法生成发布候选。

备选方案是先安装 `dsh-base` 再按编译错误调整。该方案会带入无 consumer 的默认能力，并让版本/contract 在并行工作中持续漂移，因此拒绝。

### 2. `@neko/agent-runtime` 拥有最小 Cordis composition

Canonical public path 保持为 `@neko/agent-runtime/application` 与收敛后的产品 use-case entries。`@neko/agent-runtime` 负责创建最小 Cordis Context、组合经 Q0 允许的 DSH packages、建立 Conversation/DSH Session binding、注册 OpenNeko Tool/Skill/MCP/Plugin projection并投影产品事件。它不暴露 `./pi`、`./tool-registry`、Pi history projector 或旧消息队列 public entry。

`apps/neko-desktop` 只保留 Electron app/window/webContents 生命周期、sender-bound typed IPC、CSP、Credential/keychain、文件/进程/资源授权 concrete adapter、Context 创建与 dispose wiring。以上逻辑必须留在 Application boundary，因为它依赖真实 Electron sender、window、OS secret 和授权资源；Session 状态机、Tool 路由、Plugin catalog reconciliation 和领域结果不依赖 Electron object，必须留在 owning package。

| Owner / package role | Producer | Consumer | Runtime boundary | Replaced path | User-data impact |
| --- | --- | --- | --- | --- | --- |
| `@neko/agent-runtime` host-neutral application/runtime | Desktop composition、Agent input use cases | Desktop controller、Agent Webview projection | Node/Electron Main 内的 package boundary | Pi runtime、ToolRegistry、queue、projectors | 创建/读取 DSH Session；不读取旧 Pi transcript |
| `apps/neko-desktop` application root | Electron sender、OS adapters | package public ports | Electron trust boundary | Desktop 内 Pi-specific wiring | 只传递 opaque handle/descriptor，不保存 transcript |
| owning domain packages | validated domain snapshots/services | DSH Tool adapters | host-neutral domain/application boundary | Pi Tool bridge | 领域 facts/Jobs 不变 |
| `scripts/agent-eval` external test platform | Scenario/driver | reports/assertions | isolated complete Desktop process | Pi-specific facts/paths | 只读脱敏 evidence，不成为 authority |

### 3. DSH Session 是新 transcript/context authority

每个新可执行 Conversation 精确关联一个当前 DSH Session identity。DSH Session 拥有 user/assistant/tool events、实际模型 context、turn/call lineage 和经资格验证的 compaction event；OpenNeko catalog 只拥有 Conversation metadata、owner/workspace binding、当前 Session reference、permission/checkpoint、领域 Job reference 和可重建 projection。

Session metadata 使用 Host 生成的虚拟 cwd，不写入真实 Workspace 绝对路径。DSH persistence root 由 `@neko/agent-runtime` 的 Node adapter 通过 Desktop 提供的 user-data root 组合；路径不进入 Renderer、Workspace facts、Tool arguments、Skill content 或 logs。

DSH Session decode、关联或恢复失败只使对应 Conversation 不可执行，并产生 identity-scoped diagnostic。不得创建空 Session、读取旧 projection、打开 Pi transcript 或阻止 sibling Conversation/Workspace。

### 4. clear 创建显式新 Conversation，不改写原 transcript

DSH 当前没有可执行的 canonical Session clear emitter。产品 `clear` 因此改为“开始新的 Conversation”：创建新的 Conversation identity 与空 DSH Session，保留并继续列出源 Conversation，提交成功后把当前 Window 导航到新记录。失败时不得产生部分 catalog/session binding。

跨文件 Session store 与 SQLite catalog 不伪装成单一存储事务。Application service 先生成全新 identity，并在 catalog 不可见的 provisional scope 创建、flush 和重新打开空 Session；随后用一个 catalog transaction 发布完整 Conversation/Session binding。catalog commit 前失败时，只能清理本次尚未发布且 identity 精确匹配的 provisional Session；不得扫描或清理其他孤儿。catalog commit 后该记录已经是完整可恢复事实，Window selection 仅是 presentation 更新；selection 失败返回包含新 Conversation identity 的局部 diagnostic，保留有效新记录并保持源 Conversation 当前可见，不回滚、隐藏或改写任一 transcript。

该行为不是隐藏平行 Session，也不在同一 Conversation 下替换 authority。源 Conversation 的 transcript、metadata 和引用保持不变；用户可通过普通 catalog 导航返回。`compact` 只在 Q0 验证的 DSH compaction package/event 上执行，缺失或失败时当前操作 fail-visible，不回退自研 compaction。

备选方案是在同一 Conversation 上清空消息或 rebind 新 Session。前者违背 append-only authority，后者隐藏旧 transcript 并制造同一 Conversation 的多 Session 成功语义，因此拒绝。

### 5. 旧 Pi 数据保留但不进入正常 runtime

旧 Pi Session JSONL、`pi_*` SQLite columns/rows 和未知字段保持原字节，不删除、不覆盖、不转换。新的 canonical catalog reader 继续使用稳定 Conversation identity/table，并逐记录验证当前 DSH-required fields；旧记录缺少合法 DSH Session reference 时，保留可识别 metadata 并显示 `conversation-runtime-unavailable` diagnostic，打开、执行、clear、compact 等依赖 transcript authority 的操作被禁用。

正常启动不得打开 Pi Session 文件、调用 Pi codec、尝试导入或自动修复。用户可以显式删除 catalog 记录；原始 transcript 文件的导出/修复/删除若未来需要，必须由独立、product-unreachable 的 OpenSpec/工具定义 exact target、备份和确认。

这不是内部版本分发：没有 runtime/schema version 字段，没有根据旧 shape 选择 reader，也没有成功兼容路径；当前 codec 只接受一个 DSH canonical shape，旧记录在最小 owning scope 失效。

### 6. Tool registry 被 DSH runtime 替换，业务校验继续由 canonical contract 拥有

OpenNeko Tool/Capability producer 继续定义 canonical schema、semantic validation、permission、workspace trust、ContentLocator、短引用协议和领域调用。DSH ToolDefinition 只承载模型可见 schema、调用 identity 和 adapter invocation。由于 DSH schema DSL/执行校验不覆盖现有全部 `anyOf`、range、array length 和 locator 约束，adapter 必须在调用 owning domain service 前复用同一 package-owned validator；不得把参数视为可信，也不得为 DSH 建第二份弱化 schema 真相。

`PiContentToolModelProtocol` 的 Pi-specific class 被删除，但其模型可见短引用、无绝对路径、bounded media/document result 和 `ContentLocator` 行为进入 DSH Tool adapter 的明确验收清单。领域长任务仍返回 owning-domain Job identity；DSH call identity不替代 Job identity。

### 7. DSH inbox 取代独立 Agent 消息队列

产品 queue/edit/remove/continuation/cancel projection 映射到经 Q0 验证的 DSH inbox `MessageId`、append/replace/remove/clear 与 cancel `keepInbox` 语义。`AgentConversationMessageQueue`、独立 pending map 和 pause state 被删除；Renderer queue snapshot 从 DSH Session/Agent inbox authority 投影，不成为第二状态源。

在 contract freeze 中逐项映射 enqueue、promote、edit、remove、discard continuation、active-turn cancel 和 resume。DSH 无对应 canonical 语义的操作必须从产品 contract 原子删除或在 owning product service 中重新定义为纯 UI draft 行为，不能保留旧 runtime queue。

### 8. Skill、MCP 与 Plugin 使用产品 authority 的受控投影

OpenNeko Skill catalog 继续拥有 install/source/trust/enablement/fingerprint。薄 DSH Skill provider 只注册当前精确、可信、启用记录，不把普通 project/personal/plugin roots 交给 `dsh-skill-filesystem`，不向模型暴露绝对路径；单条解析失败只影响该 Skill。

MCP server configuration 和用户授权继续由产品 owner 提供，DSH MCP client 负责 connection 与 Tool projection。Server identity、transport、environment、process、timeout 和取消必须逐项 fail-local；不得 fallback 到自研 MCP client。

Plugin catalog 继续拥有安装、信任、启停和来源。第一版 Cordis Loader 只能 mount OpenNeko 代码库内受信任的 host adapter/plugin factory；第三方 Extension 仍是 data-only descriptor，只能贡献经过验证的 Skill、MCP 或显式 automation adapter projection，不能导入/执行其任意 JavaScript。`dsh-host-plugin-inventory` 仅投影当前 mount 状态，不写回 catalog。

### 9. OpenNeko CredentialStore 是唯一 DSH credentials provider

`@neko/agent-runtime` 提供 DSH credentials service implementation，将 DSH provider 请求的 credential identity 精确映射到 OpenNeko program-owned CredentialStore。Desktop Main 只实现 SecretStorage/keychain concrete persistence 和交互式认证窗口；secret 不进入 Cordis settings、环境变量、Session、SQLite、logs、Renderer 或 Evaluation facts。

生产 composition 禁止 DSH environment credential provider、默认 in-memory store 和失败后环境变量 fallback。缺失、拒绝、刷新或持久化失败只拒绝当前 provider request并返回 owner-qualified diagnostic。

### 10. 并行工作流共享一个 release authority

一个总 OpenSpec 和一个迁移集成分支拥有最终发布事实。并行工作流可在隔离分支/worktree 中准备：

- W0：DSH qualification、contract freeze 与 release isolation；
- W1：Agent/Session/Tool spine；
- W2：MCP runtime；
- W3：trusted Skill provider；
- W4：Plugin catalog/Cordis Loader boundary；
- W5a：产品 contract、Desktop IPC 与 Webview projection consumer；
- W5b：Conversation catalog、clear/compact 与旧 Pi 数据保护；
- W6：领域 Tool adapters；
- W7：外部 Evaluation facts 与真实 Desktop evidence；
- W8：全部 consumer 切换后的原子旧路径删除。

W0 是所有最终实现的前置。W1 先进入集成分支；W2/W3/W4/W5b/W6 可在冻结 contract 与 W1 public boundary 上并行准备；W5a 由 consumer owner 统一切换 contract、IPC、projection 和 UI；W7 只在完整集成路径上更新 Evaluation；W8 由 integration owner 在全部 consumer 切换后统一删除旧 producer、exports、registrations、fixtures、Evaluation facts 和 dependencies。工作流可以独立评审和测试，但不得自行删除共享旧路径，也不得独立进入可发布主线、生成发布 artifact、打 tag 或宣称上线。

共享 contract、composition、projection、catalog、Evaluation 和 deletion 文件必须在 owner manifest 中互斥分配；工作流不得各自修改同一 owner surface。发现 contract 缺口时回到 W0 freeze 统一更新，所有受影响工作流 rebase 后继续，禁止局部 compatibility field。

### 11. 统一集成门禁决定原子切换

发布门禁必须同时证明：完整 DSH closure 精确 pin；Pi/DSH 无双 registration；所有 producer/consumer/fixture/test 使用同一 canonical shape；旧 imports/exports/files/registrations 被删除；旧 Pi 数据未改写；Skill/Plugin/path/credential trust 边界 fail-closed；单个 invalid Session/Skill/MCP/Plugin fail-local；完整 Desktop hidden/visible真实 provider矩阵通过。

集成分支允许在开发过程中暂时不可发布，但每次共享分支更新必须标记 `integration-only`，不得被普通 release workflow 消费。release guard 必须从仓库事实验证 Q0 closure、全部 consumer、旧路径删除、数据保护和 Evaluation evidence，而不是依赖人工声明；任一缺项时 `package:desktop`、tag 和发布候选流程 fail-closed。最终切换是一次 repository-level producer/consumer replacement，不使用 runtime feature flag。

## Risks / Trade-offs

- **[DSH RC API、dist-tag 或 Session format 漂移]** → 固定整族 artifact，Q0 验证 peer closure/fixtures；升级作为独立变更重新验收。
- **[并行工作流修改共享 contract 导致反复冲突]** → W0 冻结单一 contract owner；其他工作流只消费，变更需集中协调并全量 rebase。
- **[整体切换使集成分支长期不可发布]** → 保持工作流小而可验证，持续运行 integration gate，但禁止用双 runtime 提前恢复可发布性。
- **[旧 Pi Conversation 无法在新版本打开]** → 原字节保留、catalog 可见、局部 diagnostic 与显式删除入口；不伪造迁移成功。
- **[DSH Tool validation 比现有 contract 弱]** → adapter 在调用 owner 前复用 canonical semantic validator，并用负例测试证明无 bypass。
- **[Cordis same-process plugin 扩大 Electron Main 攻击面]** → 第一版仅加载仓库内受信任 factory；第三方 Extension 保持 data-only。
- **[发布后回滚到 Pi 会无法读取新 DSH Session]** → 不提供 in-product Pi rollback；发布前可整体撤销集成分支，发布后只能提供 DSH-compatible 修复版本并保留所有 Session 数据。

## Migration Plan

1. 修订并接受 DSH ADR，关闭或取代 `adopt-pi-agent-runtime`，建立本变更的 integration-only release policy。
2. 完成 W0 Q0 与 contract freeze；任一 blocker 失败则停止生产切换。
3. 并行实现 W1–W6 的 producer、consumer、tests 和 poison proof，按 W1 → W2/W3/W4/W5b/W6 → W5a 顺序进入同一集成分支。
4. W7 在完整集成路径上更新 Evaluation facts；W8 由 integration owner 原子删除 Pi runtime、Tool registry、queue、projectors、Skill/MCP/Plugin runtime、public exports、dependencies 和 test-only direct paths。
5. 运行 deterministic gates、package typecheck/build/test、Desktop hidden/visible真实 provider Evaluation、Session reopen/compaction、Tool/Job、Skill/MCP/Plugin failure isolation 与旧数据保护矩阵。
6. 只有所有门禁通过后才允许执行发布型 Desktop package，并从集成分支生成一个发布候选；不存在按工作流发布的中间候选。

发布前回滚通过整体撤销集成分支完成，不保留兼容 adapter。发布后若发现缺陷，修复必须保持 DSH authority；不得恢复 Pi 作为 fallback。任何不可读 Session 原字节保持不变并局部标记失效。

## Open Questions

- Q0 最终精确 package/version closure、目标 Electron/Node 组合和量化 bundle/startup 阈值；这些结果必须在 W1–W6 最终实现合入前写入 implementation evidence。
- DSH RC 的 compaction package 是否满足完整 continuation/reopen 矩阵；不满足时 Q0 失败，而不是保留自研 compaction。
- 经 Q0 验证后最终采用的 DSH turn/call public identity 类型名称；product contract 只冻结真实公开 identity，不发明内部 generation/version 字段。
