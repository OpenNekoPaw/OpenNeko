# ADR: 使用 DSH/Cordis 统一 Agent 与扩展运行时并退役 Pi 执行栈

- 状态：Proposed
- 日期：2026-08-17
- 范围：Agent、Session、Tool、Skill、MCP、Plugin runtime 与产品投影
- 上游依据：[deepseek-ai/deepseek-harness@47f9438](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a)
- 关联：`application-composition.md`、`agent.md`、`package-boundaries.md`、`adr-pi-agent-runtime.md`、`adr-agent-runtime-single-authority-and-simplification-boundary.md`

## 状态与取代关系

本 ADR 仍处于 Proposed。只有对应 OpenSpec 完成设计、实施和验收后，本决策才能成为当前架构事实。

本 ADR 接受后，取代 `adr-pi-agent-runtime.md` 中“由 OpenNeko 直接集成 Pi 作为 Agent、Session、Skill 与 Tool 执行内核”的具体实现选择；继续保留其中单一权威、精确身份、领域 ownership、用户数据保护和 fail-visible 等架构不变量。`adr-agent-runtime-single-authority-and-simplification-boundary.md` 中的单一 Timeline authority、后台任务生命周期和无 fallback 约束同样继续有效。

## 背景

OpenNeko 当前直接拥有 Pi conversation runtime，并自研 Tool registry、消息队列、Timeline/history projection、Skill activation、MCP client/bootstrap、Plugin contribution/runtime 以及 clear、rollback、compaction 等执行逻辑。这些组件共同复制了 Agent harness 应拥有的状态机和资源生命周期，增加了多处事实来源、跨层契约与产品验收成本。

DeepSeek Harness（下称 DSH）基于 Cordis 提供 Agent、Session、Agent loop、Tool、Skill、MCP 和 Plugin 生命周期，可承担同一运行边界。OpenNeko 的差异化价值在本地创作产品、领域能力、用户资产、信任与授权、媒体数据面和 Electron 产品体验，不在维护另一套通用 Agent harness。

上游目前仍是 developer preview。审计提交的 Session 磁盘格式为 `SESSION_FORMAT_VERSION = 0`，上游明确不承诺旧格式可读。因此采用 DSH 的前提是精确固定依赖、先完成真实运行资格验证，并把不可读 Session 作为单个 Conversation 的可见失效处理，而不是假设兼容或静默迁移。

## 决策

### 1. DSH 是唯一 Agent 与扩展 runtime authority

`@neko/agent-runtime` 拥有一个最小、显式的 Cordis composition，并以 DSH 作为以下能力的唯一 canonical runtime：

- Agent 创建、turn 执行、流式事件、取消与上下文管理；
- Session transcript、恢复与 harness 自身的压缩语义；
- Tool definition、调用、结果和错误传播；
- Skill runtime registry 与 Agent 注入；
- MCP server connection 与 MCP Tool projection；
- Plugin mount、unmount 和 Cordis effect disposal。

不得为 Pi、DSH 或未来引擎增加通用 `ConversationRuntimePort`，不得让 `AgentAppHost` 在多个 runtime adapter 之间路由。该抽象没有第二个合法成功实现，只会保留多引擎结构和重复状态机。OpenNeko package public port 应表达产品用例与领域结果，而不是抽象第三方 harness。

`apps/neko-desktop` 继续是薄 Electron 组合根，只负责创建 root Context、提供 Electron/OS concrete adapter、绑定 sender 与授权资源并完成 package wiring；不得拥有 DSH 业务策略、Session 状态机或扩展管理事实。

```text
Renderer product UI
        │ typed product contract
        ▼
@neko/agent-runtime
├── OpenNeko conversation/application services
├── minimal Cordis Context
│   ├── DSH Agent / Session / Agent loop
│   ├── DSH Tool / Skill / MCP runtime
│   └── Cordis Loader lifecycle
└── OpenNeko domain Tool adapters
        │ exact domain identity / ContentLocator
        ▼
Owning domain services and Jobs

apps/neko-desktop
└── Electron trust boundary + concrete ports + wiring only
```

### 2. 只组合有真实 consumer 的 DSH 能力

不得直接引入完整 `dsh-base`。OpenNeko 只显式组合产品当前需要且通过资格验证的 DSH package，避免随上游默认组合引入 Shell、Sandbox、Telemetry、Web、Subagent 等没有真实 consumer 的产品能力。

每个被组合的 DSH package 必须有明确 owner、调用方、配置来源、释放条件和验证用例。新增 DSH 能力仍需按 OpenSpec 证明真实产品需求；不能仅因其存在于上游默认集合而启用。

### 3. 单一 authority 分工

| 事实或生命周期                                            | 唯一 owner                          | DSH/OpenNeko 边界                                                |
| --------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| Agent turn、流式事件、Tool call、取消                     | DSH Session/Agent runtime           | OpenNeko 只投影产品 contract，不复制执行状态机                   |
| transcript 与 harness context                             | DSH Session                         | Conversation catalog 只保存产品记录与精确 Session 引用           |
| Conversation catalog、Workspace/Project binding           | OpenNeko Agent application service  | 不由 Cordis plugin inventory 或 Renderer store 反向决定          |
| provider/model 用户选择、凭据、成本授权                   | OpenNeko 产品配置与 CredentialStore | provider adapter 只接收当前请求已授权配置                        |
| 领域事实与长任务                                          | owning domain service / Job         | Tool call 通过精确 domain identity 发起，不接管领域 Job 生命周期 |
| Skill/Plugin 安装、信任、启停、fingerprint、用户 metadata | OpenNeko catalog authority          | DSH 只运行已授权且已启用的精确内容                               |
| Plugin mount/unmount/effect disposal                      | Cordis Loader                       | inventory 仅是可重建的只读 runtime projection                    |
| Workspace 文件、媒体与本地资源授权                        | OpenNeko Desktop/owning package     | DSH Tool 只接收授权 handle、descriptor 或 `ContentLocator`       |

Renderer 只选择 Conversation 并渲染只读投影。卸载 UI、切换 Workspace 或进入管理场景不得取消、转移或重绑定精确 Session 下仍受保护的任务。

### 4. 删除重复自研执行栈

完成对应边界的原子切换后，删除以下实现及其 producer、consumer、export、registration、fixture 和只绑定旧路径的测试：

- `PiConversationRuntime` 与 `NodePiConversationAuthority`；
- OpenNeko Tool registry、Pi Tool bridge 与 Pi 专用 Tool result mapping；
- `AgentConversationMessageQueue`；
- Pi Timeline/history/event projector；
- `PiSkillHost`、personal Skill runtime、activation 与 injection 执行链；
- `MCPManager`、自研 MCP client/bootstrap/tool wrapper；
- `extensions/plugin-runtime.ts` 与 contribution generation/reconcile 执行链；
- `PiContentToolModelProtocol`；
- 自研 clear、rollback 与 compaction engine。

保留行为不变量与产品验收测试，并基于 DSH canonical path 重写。禁止保留旧实现作为 feature flag、fallback、测试直连入口或失败后的 try-next path。

### 5. 保留 OpenNeko 产品与领域边界

以下能力不迁入 DSH，不得由 Plugin 或 Session 成为第二 authority：

- Conversation catalog、Workspace/Project 关联和用户可见记录生命周期；
- provider/model 选择、CredentialStore、成本授权和产品配置；
- Skill/Plugin 安装、信任、启停、fingerprint 和用户 metadata；
- Workspace trust、审批 UI、sender-bound IPC 和本地资源授权；
- FFmpeg、Range/PCM、exact-resource registry 与 `ContentLocator`；
- Canvas、Cut、Preview、Generation、Assets、Character、World 等领域事实、application service 与 Job；
- Renderer contract、错误展示、artifact delivery 和 package-owned presentation snapshot。

第一方领域能力以 DSH Tool definition 接入，但 adapter 只负责 schema/结果转换、授权和调用 owning-domain service，不得拥有领域事实、业务路由或失败后的替代实现。

### 6. Skill 必须经过 OpenNeko 信任边界

不得把普通 project、personal 或第三方 Plugin Skill 目录直接交给 `dsh-skill-filesystem`。上游 filesystem provider 将 Skill 视为 trusted local content，并可能向模型暴露绝对目录，这不满足 OpenNeko 的 Workspace trust、路径与用户内容保护约束。

`@neko/agent-runtime` 应实现薄的 OpenNeko DSH Skill provider：

1. 从 OpenNeko canonical catalog 接收已安装、已信任、已启用且 fingerprint 匹配的 Skill；
2. 只向 DSH registry 投影允许的 metadata 与 content；
3. 不暴露原始绝对路径，资源访问继续通过授权 locator/handle；
4. 单个 Skill 解析或注册失败时，仅拒绝该 Skill 并产生可见 diagnostic，其他 Skill、Conversation 和 Workspace 保持可用。

Builtin、受产品控制且无用户路径泄露风险的 Skill 是否使用 upstream filesystem provider，必须在实施 OpenSpec 中单独列出精确目录与信任依据，不能与普通用户 Skill 共用隐式扫描入口。

### 7. Plugin catalog 与 Cordis Loader 分工

OpenNeko Plugin catalog 继续拥有安装、卸载、信任、启用状态、来源和用户 metadata。Cordis Loader 只根据 catalog 的精确已授权 projection 执行 mount、unmount 与 effect disposal。

`dsh-host-plugin-inventory` 或等价 runtime inventory 只能作为 Loader 当前状态的只读 projection，不得写回 catalog、推断启用状态、自动安装或在加载失败时尝试其他 Plugin。单个 Plugin 加载失败必须 fail-local，并在该 Plugin 记录上显示 diagnostic；不得阻止其他 Plugin、Agent 或 Workspace 启动。

### 8. 身份与产品 contract 简化

Agent/Tool 执行身份先迁到 DSH 的精确 `SessionId + turn + CallId`。领域异步工作继续使用 owning-domain Job identity；Tool call 只记录对该 Job 的精确引用。完成生产者、消费者、持久化和 UI 的一次性切换后，再删除 OpenNeko 通用 `runId`，不得把它简单设为 nullable、折叠进 `turnId` 或长期保留为兼容字段。

普通 Conversation 不再维护只有 `'main'` 值的 `branchId`，也不保留自研 `forkBranch`/`rollbackBranch`。若未来出现真实用户可见分支需求，应单独通过 OpenSpec 基于 DSH Session fork 定义领域语义、身份、可见历史和删除/恢复规则。

clear 与 compact 只使用 DSH 当前 canonical Session 语义。不得通过创建隐藏平行 Session、读取旧 projection 或回退旧 transcript 来伪装成功。产品 contract 的删除必须与本次边界内全部 producer、consumer、fixture 和测试原子完成。

### 9. Session 持久化与用户数据保护

DSH Session 保存 harness transcript 与 context；OpenNeko 数据库继续保存 Conversation catalog、用户 metadata、Workspace binding、领域事实和 artifact 引用。两者通过稳定的 Conversation identity 与精确 DSH Session identity 关联，不互相复制 authoritative 内容。

DSH 依赖必须整族精确 pin，并固定资格验证所依据的上游提交与 npm artifact。升级必须显式执行 fixture 可读性、恢复和真实 provider 回归，禁止 semver 自动漂移。

Session 不可解析、格式不受支持或关联丢失时：

- 保留原始用户数据与 Conversation catalog 记录；
- 仅将该 Conversation 标记为不可执行并显示明确 diagnostic 与后续修复入口；
- 不得自动创建空 Session、覆盖原 transcript、回退旧 reader 或阻止其他 Conversation/Workspace 使用；
- 只有用户显式删除或独立设计的可验证恢复流程才能改变原记录。

### 10. Pi 退役的准确含义

OpenNeko 不再直接拥有、实例化或调用 Pi Agent、Session、Skill、Tool loop，也不保留 Pi-specific product contract、runtime adapter 或测试入口。

DSH 当前 provider adapter 可能内部依赖 `@earendil-works/pi-ai`。在 DSH native adapter 尚未覆盖 OpenNeko 所需 provider 时，允许通过 DSH 的 `dsh-llm-pi-ai` 间接使用该第三方依赖；该依赖必须封闭在 DSH provider-specific adapter 中，不得重新扩散为 OpenNeko runtime authority。满足 provider 覆盖后可独立移除，不影响产品 contract 和 Session owner。

## 实施边界与顺序

该迁移属于跨模块架构变更，实施前必须创建或更新边界清晰的 OpenSpec artifacts。不得按“先启用 DSH Extension，最后再替换 Pi Agent”的顺序实施，因为这会让 Tool、Skill、MCP 和 Plugin 同时服务两个 runtime。

| 阶段 | 内容                              | 完成标志                                                                                    |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| Q0   | DSH dependency qualification      | 精确 pin、许可证、Electron/Node/build、Session fixture、恢复与真实 provider 验证通过        |
| P1   | Agent/Session/Tool spine 原子切换 | DSH 成为唯一 turn/Tool authority；同批删除 Pi runtime、Tool registry、queue 与旧 projection |
| P2   | MCP runtime 切换                  | server 配置只进入 DSH MCP path；删除自研 client/bootstrap/wrapper                           |
| P3   | Skill runtime 切换                | OpenNeko trusted provider 投影到 DSH registry；删除 Pi Skill 执行链                         |
| P4   | Plugin runtime 切换               | catalog 驱动 Cordis Loader；删除自研 Plugin contribution/runtime 执行链                     |
| P5   | 产品 contract 简化                | 原子删除旧 `branchId`、通用 `runId`、Pi identity 与自研 clear/compact contract              |
| P6   | 全矩阵验收与文档收敛              | 真实 UI/真实 provider 通过；旧 ADR、活跃 Pi OpenSpec 和状态文档完成取代或归档               |

每个阶段只能有一条成功路径。阶段可拆分为独立 OpenSpec 以控制评审和交付边界，但不得以拆分为由保留同一能力的新旧 runtime 并行、fallback 或长期 compatibility adapter。

## 验证策略

### 依赖资格

- 验证整族精确版本、许可证、lockfile 唯一解析和打包产物；
- 在目标 Electron/Node 环境验证 Context 创建、释放、异常隔离和应用退出；
- 使用固定 Session fixtures 验证写入、重开、恢复、不可读格式的单 Conversation 隔离；
- 使用真实已授权 provider 验证流式输出、取消、Tool call、上下文压缩和错误传播。

### Contract 与路径级测试

- 断言 Agent、Session、Tool、Skill、MCP 和 Plugin 分别只有一个 canonical owner 与 registration path；
- 断言生产者与消费者使用同一 canonical shape，不存在 Pi/DSH 分发、旧字段、fallback provider/source 或 test-only direct runtime；
- 断言 Tool call 使用精确 `SessionId + turn + CallId`，领域长任务使用独立 Job identity；
- 断言单个非法 Skill、MCP server、Plugin 或 Session 失败时 sibling 能力、Conversation 与 Workspace 仍可用；
- 断言 Renderer 不能获得 Node/Electron API、绝对 Skill 路径或未经授权的本地资源。

### 产品验收

按 Agent Evaluation 边界使用可见真实 Electron UI、用户可操作 composer 和真实 API，至少覆盖：基础对话与终态收敛、Tool/领域 Job、取消、压缩后继续、完整应用重开恢复、artifact 恢复、多 Conversation 切换、Workspace 切换、审批、错误展示与 Session 隔离。

批量回归使用无可见 UI 的完整 Desktop session owner 和真实 API，通过公开 Agent input path 驱动；不得用 mock provider、最终文本 fixture 或 direct runtime runner 替代真实 Agent 行为证据。

## 后果与风险

### 正向后果

- OpenNeko 停止维护通用 Agent harness 的重复状态机，把工程投入集中到本地创作产品与领域能力；
- Agent、Tool、Skill、MCP 和 Plugin 共享同一个 Cordis 生命周期与错误传播模型；
- 删除 Pi-specific contract 和通用多引擎 adapter，减少 owner、registration 与投影路径；
- 产品 catalog、信任、资源授权与领域事实仍由 OpenNeko 精确拥有，不被第三方 runtime 反向接管。

### 风险与约束

- DSH 仍是 developer preview，API 与 Session 格式可能变化；必须精确 pin，升级不得自动发生；
- DSH Tool/Session 语义与现有产品 contract 不完全一致；必须原子更新边界，不能用兼容层长期保留旧 shape；
- Skill filesystem 的 trusted-content 与绝对路径行为不适合普通用户内容；必须经过 OpenNeko provider；
- Cordis Loader 不替代产品 Plugin catalog；混淆两者会造成安装事实和 runtime 状态双 authority；
- DSH 未提供的 OpenNeko 媒体与领域能力继续由 owning package 提供，不能为了统一 runtime 将业务事实塞进 Plugin 或 Tool adapter。

## 未决问题

- Q0 应选择的 DSH npm RC、与固定审计提交的差异及精确 package 清单；
- OpenNeko DSH Skill provider 所需的最小 upstream extension point，是否需要向上游贡献无路径泄露的 provider contract；
- DSH Session 存储 adapter 在现有本地目录和备份策略中的精确 owner、路径与原子写约束；
- `clear` 与 `compact` 在 DSH canonical Session 语义下的最终用户交互文案和可恢复边界；
- `dsh-llm-pi-ai` 的 provider 覆盖退出条件及替代 adapter 验证矩阵。
