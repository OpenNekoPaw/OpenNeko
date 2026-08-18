## Context

OpenNeko 当前由 `@neko/agent-runtime` 直接组合 Pi Agent/Session，并自研 Tool registry、消息队列、Timeline/history projector、Skill Host、MCP client/bootstrap、Plugin contribution runtime。`apps/neko-desktop` 通过 package public entries 完成 Electron Main/preload/renderer wiring。本变更用独立 DSH 子进程 + ACP JSON-RPC stdio 替换内嵌 runtime，同时保持 OpenNeko 产品 authority 和 Electron 原生 UI。

DSH 官方 `dsh-acp` rc.7 是 automation-only：它提供 ACP 自动化能力，但没有完整覆盖 OpenNeko 所需的 session list/load/resume/history replay、tool/progress events、per-session close、inbox 管理、extension 管理面与 Host reverse tool 请求。因此需要一个 OpenNeko-owned、随产品发布的 DSH ACP bridge plugin/profile，在 DSH 内复用公开 Agent/Session API 补齐这些语义；bridge 不得成为第二套 runtime。

用户要求整体迁移并一次性原子发布，同时要求先删除旧执行栈，让真实缺口直接暴露。迁移集成分支因此允许在 D0 删除后暂时无法编译或运行；这种不可运行状态不得进入普通主线或发布流程。并行开发只用于缩短实现时间，不产生可单独发布的中间产品状态。一个总 OpenSpec 拥有交付边界；隔离分支/worktree 中的工作流必须在同一集成分支汇合，并通过统一门禁后一次切换。

## Goals / Non-Goals

**Goals:**

- Desktop Main 启动独立 DSH 子进程，唯一生产通信路径为 ACP JSON-RPC stdio。
- DSH 子进程/profile 成为 Agent、Session/transcript、Inbox/queue、Tool lifecycle、Skill、MCP、Plugin 的唯一 runtime authority。
- 删除 OpenNeko 对内嵌 Cordis/`ctx.agents`、DSH Web/Client Runtime、TS SDK、Remote API、Pi 和自研 runtime fallback 的依赖。
- OpenNeko 保留 Electron 原生 UI、Conversation/Workspace binding、凭据、Host 权限/信任、extension 管理 UI/命令入口与短生命周期 projection、领域事实/Job、typed domain tool contracts 与 Host adapters；DSH 保留 extension catalog/config/readiness facts。
- Agent UI 的既有最终视觉和交互是 retained product surface，不属于待删除的 Pi runtime。`@neko/agent-webview` 继续拥有纯 presentation component、既有 `agent-*` DOM/CSS 契约和最终版样式；Desktop Renderer 只拥有 DSH Host bridge 状态编排并向该 presentation 传入 canonical DSH Session/Permission projection。不得在 Desktop 私建平行 Agent 样式或复制消息、Tool、approval、composer 设计。Tool projection 必须保留 ACP 已提供且通过 bounded lossless JSON 校验的 `rawInput`/`rawOutput`，用于原 Tool activity 的可展开详情；单个非法 payload 只产生对应 diagnostic，不得清空 sibling event。不得恢复旧 Host runtime adapter、旧 message handler 或 Pi contract，也不得用 ACP 原始事件调试列表替代产品 UI。未绑定 Draft 的首条输入可以通过 sender-bound create operation 原子创建 Conversation 后提交，不能要求用户先进入协议空态再创建。
- 最终版 composer 中的模型选择、执行模式、Workspace/Canvas 上下文栏、附件入口和引用 token 是 OpenNeko 内容创作产品能力，不是 DSH Web 或 ACP 的调试控件。`@neko/host/settings` 继续拥有 secret-free 模型目录、用户选择和 execution mode；Shell/对应领域 owner 继续拥有 exact Workspace/Canvas/引用事实；`@neko/agent-webview` 只渲染 typed presentation。Desktop 只能从 sender-bound Agent Surface 和 exact Conversation context 解析这些 authority，禁止从 active/recent Workspace、DSH 默认模型或旧 Pi 状态猜测。没有 authoritative attachment/reference projection 时不得伪造 token 或把 `+` 显示成可成功的入口。
- 用薄的 OpenNeko-owned bridge plugin/profile 补齐 `dsh-acp` rc.7 automation-only 缺口，且不实现第二套 Agent loop、Session store、queue、tool registry、Skill/MCP/Plugin runtime。
- Generation+Canvas 作为首批纵向官方领域 Tool slice 迁移；Cut、Assets、Character、World 等随后迁移。
- 保留旧 Pi 用户数据原始字节，局部显示不可执行状态，不增加 legacy reader、迁移器或 fallback。
- 通过待建立或重建的 `scripts/dsh-q0` 非发布 fixture 验证子进程边界；真实 provider/API 行为暂时跳过且不是发布证据，不阻塞 W1–W6 开发但阻塞发布。

**Non-Goals:**

- 不引入通用多引擎 runtime port、feature flag、Pi/DSH runtime selection 或失败后 fallback。
- 不在 Electron Main 内嵌 Cordis Context，不使用 DSH Web/Client Runtime、TS SDK 或 Remote API 作为生产路径。
- 不实现 OpenNeko 自研第三方插件 runtime，不允许第三方 Webview JS 或任意第三方 JS 注入 Electron Main/DSH。
- 不保留 OpenNeko Skill Host、MCP Manager、Plugin runtime；Skill/MCP/Plugin 的实际发现/加载/启停/执行归 DSH profile。
- 不在本变更中转换旧 Pi transcript 为 DSH Session，也不提供正常产品可达的旧 transcript reader/repair/migration。
- 不把 Evaluation 变成产品 Skill、第二个 Agent controller 或 direct runtime runner。
- 不把领域能力用 MCP 包装；领域 Tools 是注册到 DSH 的官方 typed domain tools，UI 直接操作不绕 Agent。

## Decisions

### 1. 独立 DSH 子进程是唯一 runtime boundary

Desktop Main 负责启动、配置、监督和按需重启 DSH 子进程。生产环境中的 Agent/Session/Inbox/Tool/Skill/MCP/Plugin 执行都发生在 DSH 子进程内；Desktop Main 与 DSH 之间只通过 ACP JSON-RPC stdio 通信。DSH 子进程 stdout 必须保持 ACP 协议纯净，非协议日志不得混入 stdout。任何内嵌 Cordis、DSH Web/Client Runtime、TS SDK、Remote API、Pi 或自研 runtime 路径都不得成为成功路径。

| Owner / package role                                   | Producer                                                                     | Consumer                                                               | Runtime boundary                                                | Replaced path                                                                        | User-data impact                                                                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `@neko/agent-runtime` host-neutral application adapter | 产品 use case、Conversation/Session binding、ACP 投影                        | Desktop controller、Agent Webview                                      | package public port ↔ Desktop concrete ACP transport            | Pi application/runtime、queue、projectors                                            | 不保存完整 transcript，只消费 replay/event 并持有精确 binding                                                       |
| `@neko/host/settings` provider credential authority    | exact provider identity、config credential source、`HostSecretPort`          | Generation provider resolver；后续 DSH Host reverse credential adapter | host-neutral authority ↔ Desktop SecretStorage concrete adapter | Pi credential runtime、Pi auth interaction                                           | 新凭据写入独立 `provider-credentials.json` 与非 Pi key namespace；旧 Pi credential 文件/keys 不读取、不迁移、不重写 |
| `apps/neko-desktop` application root                   | Electron sender、子进程 supervisor、SecretStorage、OS/领域 concrete adapters | package public ports、DSH ACP bridge                                   | Electron Main ↔ DSH subprocess stdio                            | Desktop 内 Pi/Cordis wiring                                                          | 不保存/不解析 transcript，只传 binding 与 Host adapter 请求                                                         |
| DSH subprocess/profile                                 | Agent/Session/Inbox/Tool/Skill/MCP/Plugin 执行                               | ACP events/extension responses                                         | DSH 官方 runtime boundary                                       | Pi runtime、ToolRegistry、queue、projectors、Skill Host、MCP Manager、Plugin runtime | 拥有 DSH Session/transcript 与 extension 执行数据                                                                   |
| OpenNeko bridge plugin/profile                         | ACP 语义补齐、最小 extension、Host reverse requests                          | Desktop ACP client                                                     | DSH 内插件边界                                                  | 原内嵌 runtime composition                                                           | 不复制 Session/queue/tool registry，只做协议适配                                                                    |
| owning domain packages                                 | schema、validation、授权、事务、事实、Job                                    | DSH Tool invocation via bridge                                         | Host ↔ DSH typed reverse request                                | Pi Tool bridge                                                                       | 领域 facts/Jobs 不变                                                                                                |
| `scripts/dsh-q0` external non-release fixture          | 子进程/协议/崩溃/重启验证                                                    | evidence                                                               | 待建立或重建的隔离 fixture                                      | 旧 qualification prototype                                                           | 不产生发布产物，不构成 Agent 行为或发布证据                                                                         |

### 2. DSH profile/plugins 只使用官方随产品发布集合

首版只允许随 OpenNeko 发布、由官方维护并精确锁定的 DSH profile/plugins。不使用 dist-tag、caret、tilde 或混合 RC；lockfile 必须唯一解析到同一审核过的闭包。OpenNeko 不提供自研第三方插件 runtime，不加载第三方 Webview JS，不允许任意第三方 JS 注入 Electron Main/DSH。未来若引入隔离的第三方扩展，必须由独立 OpenSpec 重新定义执行边界、沙箱和信任模型。

产品 artifact 以只读 `resources/dsh-runtime/darwin-arm64` 作为唯一 executable/package authority，包含独立 Node、DSH CLI、完整 package closure、官方 OpenNeko profile template、tree fingerprint、关键文件 checksum 与第三方许可证清单。Desktop 不从系统 Node、全局 DSH、`PATH`、Electron `process.execPath`、普通 workspace `node_modules` 或 Q0 fixture 解析生产 runtime。DSH rc.7 启动会改写 profile `cordis.yml` 并维护 `$DSH_HOME/profiles/node_modules`，因此只读 template 不直接作为 `DSH_HOME`；Desktop 在 Electron `userData/dsh` 下维护唯一可写 DSH home，只将当前已验证 template 的 `package.json`、`cordis.patch.yml` 和指向只读 closure 中四个 OpenNeko package 的精确 links 重建到 `profiles/openneko`。当前四个 package 是 bridge、Generation、Canvas 与 Cut DSH plugin；home-level `cordis.patch.yml` 固定为空，profile manifest 不声明 out-of-tree dependencies，普通本地包、Marketplace 与用户 patch 不得进入 production profile。

开发启动同样只消费 verified closure，但由 repository-owned development builder 在 Forge 启动前生成到被忽略且不受 Forge `.vite` 清理管理的 `apps/neko-desktop/.dsh-development-runtime/darwin-arm64`。builder 的第三方输入只能来自独立、精确锁定的 development runtime manifest/lock，Node 来自该 lock 中的 `node-bin-darwin-arm64` 分发包；四个 OpenNeko bundle 必须先从当前 source build，再把各包声明的发布文件复制进 closure。普通 workspace `node_modules` 只可提供 builder/toolchain，不能被 runtime 直接解析；系统 Node 只可执行 builder，不能被复制或引用为 runtime executable。builder 必须删除 install-time symlink、生成许可证清单与 canonical descriptor/tree fingerprint、完整 qualification 后原子替换旧 cache，并以输入内容 fingerprint 判断 cache freshness。`scripts/dsh-q0` 的 manifest、lockfile、安装树和产物均不得成为任何 development/product closure 输入。

开发启动器对调用方显式提供的 `NEKO_DSH_RUNTIME_ROOT` 必须先执行完整 qualification 并原样使用；相对路径、损坏 closure 或版本不匹配必须在 Forge spawn 前失败，不能被自动生成结果覆盖。未配置时才允许调用 development builder，并只向该 Forge 子进程注入生成后的绝对路径。development builder 不参与 `build`/`package`/`make`，不能生成 release artifact、满足 release evidence 或绕过 integration-only release guard；发布 stage 仍只接受外部显式 `NEKO_DSH_RUNTIME_ROOT`。

### 3. Bridge 是协议适配器，不是 runtime

OpenNeko 随产品发布的 bridge plugin/profile 运行在 DSH 子进程内，负责：

- 复用 DSH 公开 Agent/Session API 补齐标准 ACP：session list/load/resume/history replay、tool/progress events、per-session close；
- 仅在标准 ACP 无法表达时提供最小 canonical extension：DSH inbox snapshot/edit/remove、官方 extension inventory/readiness/config/diagnostics、DSH→Host typed domain tool request/response。

Bridge 不得实现第二套 Agent loop、Session store、queue、tool registry、Skill/MCP/Plugin runtime；不得把 Host 侧状态写回 DSH authority 或把 DSH authority 复制到 Host。

### 4. DSH Session/transcript 与 Host catalog 分离

DSH 子进程/profile 拥有 Session/transcript、实际 model context、turn/call lineage、Inbox/queue 与 qualified compaction。OpenNeko catalog 只拥有 Conversation metadata、Workspace binding、当前 Session reference、权限/信任、领域 Job reference 和可重建 projection。Host 不直接读写 DSH Session 文件；history replay 通过 bridge/ACP 从 DSH 获得。唯一 production `DSH_HOME` 是 Electron `userData/dsh`，官方 `dsh-base` 因而将 Session 写入 `userData/dsh/sessions`；profile materializer 只能替换 `profiles/openneko` 的官方配置/links 和 home-level empty patch，必须保留 `sessions/`、settings、credentials 与其他 DSH-owned durable files原样不动。DSH Session persistence 使用 Host 提供的稳定虚拟 cwd 配置，不把真实 Workspace 绝对路径写入模型上下文、日志或 Renderer。

模型与模式的 canonical 路径是 `@neko/host/settings` selection → sender-bound Desktop Host projection/validation → exact Conversation-to-DSH-Session binding → 标准 ACP `session/set_config_option` / `session/set_mode` → DSH Agent。DSH bridge 必须在 `session/new`、`session/load` 和 `session/resume` 响应中广告真实支持的 mode/config state，并在 set operation 中拒绝未知值、运行中不可安全切换的状态和未绑定 Session。DSH `Agent.options` 创建后只读，因此 model/provider/maxTokens 变化必须在 exact idle Session 上释放并按同一 Session identity 从 authoritative log 恢复 Agent；失败后该 Session 局部不可用并返回 diagnostic，不得继续使用旧模型、DSH profile 默认值或另一 provider。Host 在每次 prompt 前重申当前 exact configuration，使 subprocess 重启后也不会以默认 Agent 配置形成隐藏成功路径。

当前 execution mode 只广告能够由 DSH 真实执行的语义：`ask` 经 ACP permission request 投影到 OpenNeko approval UI，`auto` 只对 exact owned Session 的 approval request 返回一次性允许；未实现的 `plan` 可以作为禁用项保留在产品选择器中并显示明确 diagnostic，但不得广告为可用、不得只改标签或 prompt 文案来伪造执行语义。

新 Conversation 的开发可用路径由 `@neko/agent-runtime` 的 publication service 拥有：先在 Host catalog 事务中保留 canonical Conversation metadata 与精确领域 context，再调用标准 ACP `session/new`，通过完整 `session/list` 精确复核返回的 DSH Session，最后发布唯一 Conversation-to-Session binding。Desktop Main 只能从 sender-bound 当前 Agent Surface 解析 Workspace/Assistant context，调用该 service，并在 durable publication 成功后调用 Desktop Shell 的 exact draft attach；Renderer 只提交当前 Surface identity，不能提交 Workspace、provider、model、cwd 或 DSH Session identity。Home projection 从 Host catalog、context 与 exact binding 计算，不能从 Renderer、active/recent Window 或 DSH transcript 猜测。

当前 rc.7 没有公开 `session/delete` 或等价 persistence seam，因此 `session/new` 成功但 binding publication 失败时，Host 必须保留已创建的 Conversation catalog 记录并显示局部 diagnostic，不能删除 raw DSH 文件、调用私有模块、将 `session/close` 冒充删除或返回成功。该开发路径可以用于暴露和验证后续缺口，但不能完成 2.5、不能满足发布门禁；完整 provisional cleanup 与 provider/model publication 仍须等待公开 seam 或独立接受的边界变更。

Window 的当前 scene/presentation snapshot 必须保存并恢复 exact Conversation identity。应用进程重开时，Host 只能用已持久化 scene 中的 `conversationId` 和 owner 对 Home catalog/context/binding 做资格校验；合法记录原样恢复，单条失效只把该 Surface 重置为新的 canonical Draft 并保留 catalog diagnostic。禁止在重开时无条件进入 Entry，也禁止选择 first/active/recent Conversation。Renderer reload 只重建当前 Root，不改变 durable scene selection。

### 5. 领域 Tools 是官方 DSH Tools，不是 MCP

Generation、Canvas、Cut、Assets、Character、World 等作为精选高层官方领域 Tools 注册到 DSH。DSH 拥有调用 lifecycle；owning packages 拥有 schema、semantic validation、authorization、exact resource identity、业务事务、领域事实与长任务 Job。领域能力不用 MCP 包装。UI 直接操作领域能力时不经过 Agent；只有 Agent 发起领域调用时走 DSH→Host typed domain tool request/response。

Cut media/export 的 durable owner 由 `@neko/cut-node` 的 `ExportJobCoordinator` 组合，按 exact
Workspace identity 使用 `LocalMetadataStore` 的持久化 Job store。Job request 只保存 workspace-relative
document/output locator、冻结后的 timeline facts、导出设置和用户领域 identity；不得保存物理 Workspace
绝对路径、UI runtime identity 或闭包回调。FFmpeg executor 在 Host 侧按已授权 Workspace owner 创建，
并通过持久化 execution identity 支持 submit/describe/cancel/reconcile。Cut UI 只订阅该 owner 的只读
projection；卸载、切换场景或 renderer 重开不得取消或删除仍受保护的 Export Job。无法恢复 executor
identity 时必须将单个 Job 标记为 `outcome-unknown`，不得回退到 UI runtime、内存 store 或重新导入旧任务。

W2 首批纵向 slice 冻结精确最小操作：Generation 只暴露 `openneko.generation` 的 `submit` 和 `describe`，通过 `PurposeGenerationJobPort` 返回 bounded durable Job facts，不等待 provider result；Canvas 只暴露 `openneko.canvas` 的 `query` 和 `create-node`，通过 `CanvasProjectAuthoringService` 使用 normalized workspace-relative `.nkc` path 和 exact `expectedFingerprint` 返回 bounded facts。DSH 侧 `ctx.tools.register` 只做注册与 `ctx.opennekoHostTools.execute` 转发，不做 domain validation；Host 侧在 `@neko/agent-runtime/acp` 使用两个显式 adapter 做 strict decode、domain semantic validation 与 owning service 调用。无 wildcard dispatch、generic Host tool registry、MCP wrapper 或 Desktop business validation。

反向 Host Tool 的取消与载荷边界由 `evidence/w1-reverse-host-tool-cancellation-payload-freeze.md` 冻结。ACP SDK 只提供连接级取消，因此 bridge 使用精确 `execute`/`cancel` extension method pair；Host 只按完整 Session/turn/call identity 中止对应 handler，迟到响应不得重新结算或影响 sibling。完整请求与响应分别限制为 256 KiB UTF-8 lossless JSON 和 32 层容器深度，并在 DSH 发送前、Host dispatch 前、Host 返回前和 DSH 接收后使用同一 contract 校验。取消 Tool request 不隐式取消已经发布的 Generation durable Job。

反向 Host Tool 的产品上下文不进入 DSH request，也不从当前 Window、当前 Workspace 或最近 Conversation 推断。`@neko/agent-runtime` 必须用 request 的 exact DSH Session identity 反向读取唯一 Conversation binding，再读取该 Conversation 的 durable domain context；Desktop Host adapter 随后使用 context 中的 exact Workspace/grant 或 Assistant identity 解析 owning service。反向读取不得调用 `session/list`，避免处理 DSH→Host request 时产生 ACP 重入；missing、cross-Session、invalid context 与 unsupported domain 必须只拒绝当前 Tool call。

内容创作 Composer 的上下文栏与模型实际收到的动态上下文必须来自同一 authoritative product context。`@neko/agent-runtime` 读取 durable Conversation context，并通过 Canvas-owned `CanvasWorkspaceTurnContext` 解析 Workspace 的 canonical Board；Desktop Main 只注入 Workspace 授权与 Canvas index port。Renderer 只消费 Host 投影，不提交 Workspace、Canvas、Character 或 reference authority。标准 ACP rc.7 未提供 embedded context，OpenNeko bridge 因此使用一个最小 `openneko/session/context/set` 扩展，在 exact DSH Session 的 idle 边界设置当前 turn context；bridge 仅把已验证文本注册为 agent-scoped `systemPrompt.context`，不解释业务数据、不保存第二份 transcript，也不改变用户消息。模型切换重建同一 Agent 时必须保留该 scoped context owner；Session resume 后 Host 必须在下一次 prompt 前重新设置，缺失或 unsupported domain context 必须使当前 prompt fail-visible。

ACP permission 由 `@neko/agent-runtime` 的短生命周期 pending approval owner 管理。它在 projection 已确定 exact turn 后，将 request 绑定到 Conversation/DSH Session/turn/toolCall 四元 identity，向 UI 只投影 ACP 广告的 option identity/name/kind，并只接受同一四元 identity 下仍被广告的 option。连接释放将未决请求结算为 ACP `cancelled`；不得 default allow/default deny、按 toolCallId 单独匹配、复用 Pi `runId/turnId` approval contract 或回退 active Window。

Desktop permission IPC 使用单一 `openneko:dsh:permission` request channel 和 changed notification；每个 list/decide/cancel request 均携带 sender-bound Window/renderer session 与 exact Conversation identity，decide/cancel 额外携带 DSH Session/turn/toolCall 四元 identity。Preload 只构造并严格解析该 canonical shape，Renderer 不得提交 ACP 未广告的 option，也不得复用旧 `confirmTool`、`runId` 或 active Conversation fallback。

### 6. OpenNeko 只拥有产品管理面与 Host adapters

OpenNeko 继续拥有 Conversation/Workspace binding、凭据、Host 权限/信任、产品管理 UI/命令入口、短生命周期 projection、领域事实/Job、typed domain tool contracts 和 Host adapters。Skill/MCP/Plugin 的 catalog、configuration、readiness、发现、加载、启停与执行均由 DSH profile 拥有；OpenNeko 管理面只通过 bridge 读取 inventory/readiness/config/diagnostics 和提交精确命令，不保留 extension catalog authority、自研 Skill Host、MCP Manager 或 Plugin runtime。

Provider credential 的 host-neutral owner 是 `@neko/host/settings` public entry。它只接受精确 normalized provider identity，优先读取 `ProviderCredentialSource` 中的 config-owned API key；invalid config 必须在读取 SecretStorage 前失败。非 config-owned credential 只通过注入的 `HostSecretPort` 访问，Desktop concrete adapter 使用 Electron `safeStorage` 和独立 `provider-credentials.json`。新 authority 不读取、迁移、删除或重写旧 `agent-credentials.json` 与 `openneko.agent.pi.credential:*` keys。Desktop Main 只构造 authority 并把 reader 注入 direct-UI Generation。DSH rc.7 的公开 `CredentialProvider` seam 可由 OpenNeko bridge 实现，并允许 provider 在每次 operation 重新解析 credential；bridge bundle 必须禁用 base 中同一 `credentials` entry 后提供唯一 service，不得与 `@deepseek-ai/dsh-credentials-local` 并存。但 credential ref 本身不携带 OpenNeko provider identity，且当前生产没有 `session/new` consumer；因此 reverse credential 必须依赖 2.5 的 Conversation→DSH Session publication，先把 exact OpenNeko provider/model 绑定传给 Session 创建，再允许该 Session 的 provider resolve 单个 credential。不得把 DSH base 默认 `deepseek-official`、环境变量名或 credential ref 猜测为 OpenNeko provider identity，也不得在缺少 publication 时读取 environment、DSH settings 或旧 Pi store。

### 7. Q0 是子进程资格 fixture，不重复安装验证

已知 dsh CLI 可正常使用，因此不重复安装验证。待建立或重建的 `scripts/dsh-q0` 非发布 fixture 必须验证：subprocess lifecycle、stdout purity、handshake/capability、session recovery/history、progress、permission、cancel、inbox、Host tool reverse requests、extension management、crash/restart/fail-local。用户暂时要求跳过真实 provider/API 行为验证；对应任务保持未完成并清楚标注“不是发布证据”。这不阻塞通过确定性 Q0 后进入 W1–W6 开发，但统一发布门禁仍 fail-closed。Q0 fixture 的产物不得被提升为 Desktop 发布产物。

### 8. 删除优先、原子发布与并行工作流

一个总 OpenSpec 和一个迁移集成分支拥有最终发布事实。D0 首先删除 Pi runtime、自研 Tool registry/queue/projectors、Skill Host、MCP Manager、Plugin runtime、相关生产注册/public exports/direct dependencies 和平行 DSH client 路径。D0 后的编译与运行失败形成 authoritative replacement inventory；不得用 stub、no-op、兼容 adapter、旧代码恢复或临时 fallback 消除失败。随后 Q0/contract freeze 建立新边界，W1 建立 DSH ACP subprocess/bridge spine；W2 将 Generation+Canvas 作为首批纵向 Tool slice；W3 完成 DSH-owned extension 管理面；W4 切换产品 contract/Desktop consumer；W5 处理 Conversation catalog 与旧 Pi 数据保护；W6 迁移后续领域 Tools；W7 产出 Evaluation/non-release 证据；W8 证明删除完整并关闭 replacement inventory。任何子工作流不得单独发布、打包、打 tag 或宣称上线。

D0 只删除仓库代码和依赖，不得读取、修改或删除旧 Pi Session JSONL、数据库、用户目录内容或数据保护 fixture。删除前后对受保护 fixture 建立 hash 证据。因为 D0 明确制造 integration-only 不可运行状态，release guard 必须在 D0 开始前即关闭，并保持关闭直到所有新 consumer、确定性门禁和要求的真实 provider 证据完成。

### 9. 无内部 contract 版本、无双路径

所有内部 contract、IPC/message、ACP mapping、DTO、schema、event 与 command 保持单一 canonical shape；不添加 `version`、`schemaVersion`、`contractVersion`、内部 generation/epoch 或兼容别名。旧 Pi 数据保留原字节但不作为成功路径。DSH/ACP 协议中由第三方公开提供的版本号可以保留为第三方标识，但不能作为内部 schema 分发键。最终仓库必须只有一条可成功路径。

### 10. 统一集成门禁决定原子发布

发布门禁必须同时证明：DSH 子进程/profile 精确锁定；ACP stdio 是唯一生产通信路径；无 Pi/Cordis 内嵌/fallback；bridge 未实现第二套 runtime；Generation+Canvas 首批 Tools 已通过完整 Desktop 路径；所有 consumer 已切换；旧路径/导出/依赖已删除；旧 Pi 数据未改写；extension 管理面 fail-local；`scripts/dsh-q0` 确定性证据与本变更要求的真实 Desktop/provider 证据均存在。真实 provider 跳过项即使已明确标注也不能满足发布门禁。任一缺项时 release guard fail-closed。

## Risks / Trade-offs

- **[DSH ACP rc.7 能力缺口]** → 用薄的 OpenNeko-owned bridge 补齐标准 ACP 与最小 canonical extension；bridge 只做协议适配，不拥有 runtime 状态。
- **[子进程崩溃/重启导致会话状态丢失]** → DSH Session persistence 由 DSH profile 管理；Desktop supervisor 按 crash/restart 策略重启并 fail-local，Host 不伪造恢复成功。
- **[stdout 混入非协议日志]** → `scripts/dsh-q0` 必须验证 stdout purity；协议日志/诊断走 ACP 或 stderr/受控通道。
- **[双向 JSON-RPC 并发、背压或迟到响应污染其他请求]** → 每个请求携带精确 Session/turn/call/request identity，设置有界队列与 payload 上限；cancel/close/disconnect 后的迟到 frame 只结算或拒绝原请求，不能重开工作或阻塞 sibling Session。
- **[并行工作流修改共享 contract 导致冲突]** → W0 冻结单一 contract owner；其他工作流只消费，变更需集中协调并全量 rebase。
- **[旧 Pi Conversation 无法在新版本打开]** → 原字节保留、catalog 可见、局部 diagnostic 与显式删除入口；不伪造迁移成功。
- **[DSH Tool validation 比现有 contract 弱]** → owning domain adapter 在调用 owner 前复用 canonical semantic validator，并用负例测试证明无 bypass。
- **[官方 profile/plugin 闭包漂移]** → 精确锁定并作为独立升级变更重新验收。
- **[发布后回滚到 Pi 会无法读取新 DSH Session]** → 不提供 in-product Pi rollback；发布前可整体撤销集成分支，发布后只能提供 DSH-compatible 修复版本并保留所有 Session 数据。

## Migration Plan

1. 修订并接受本变更，关闭或取代 `adopt-pi-agent-runtime`；建立 integration-only release policy。
2. 关闭 release guard，记录旧用户数据 fixture hash，然后执行 D0：先删除 Pi runtime、Tool registry、queue、projectors、Skill Host、MCP Manager、Plugin runtime、生产注册/public exports/direct dependencies 与平行 client 路径；运行类型检查和边界扫描生成 replacement inventory，不增加 stub 或兼容路径。
3. 完成 Q0/contract freeze：建立或重建 `scripts/dsh-q0` 并验证子进程/ACP 边界；真实 provider 当前跳过并标注非发布证据。
4. 并行实现 W1–W6，按 W1 → W2/W3/W5/W6 → W4 顺序进入同一集成分支；每个新 producer 必须关闭对应 replacement inventory 项。
5. W7 在完整集成路径上更新 Evaluation/non-release 证据；W8 证明旧路径删除完整、无残留 consumer，并关闭全部 replacement inventory。
6. 运行 deterministic gates、package typecheck/build/test、Desktop hidden/visible 验证、Session reopen、Tool/Job、extension failure isolation 与旧数据保护矩阵；真实 provider 若跳过，必须在记录中明确不是发布证据。
7. 只有所有门禁通过后才允许执行发布型 Desktop package，并从集成分支生成一个发布候选；不存在按工作流发布的中间候选。

发布前回滚通过整体撤销集成分支完成，不保留兼容 adapter。发布后若发现缺陷，修复必须保持 DSH authority；不得恢复 Pi 作为 fallback。任何不可读 Session 原字节保持不变并局部标记失效。

## Open Questions

- `dsh-acp` rc.7 的 ACP method/event 精确集合与 bridge 需要补齐的最小 extension 最终 shape；由 Q0 证据和 contract freeze 确定。
- 虚拟 cwd 配置如何在不暴露真实 Workspace path 的情况下满足 DSH rc.7 absolute-cwd contract；由 W1 contract 与完整 Desktop fixture 冻结。`DSH_HOME=userData/dsh`、`sessions/` authority、只读 closure 与可写官方 profile materialization 已冻结，不再作为开放设计项。
- 首批纵向 Tool slice 之外的后续领域迁移顺序与每个 domain 的 typed tool contract 冻结范围；W6 按 inventory 逐项推进。
- 真实 provider/API 行为验证何时恢复执行；本轮暂跳过且不阻塞实现，但本变更发布前仍必须补齐，除非另一个被接受的 OpenSpec 明确重定义发布门禁。
