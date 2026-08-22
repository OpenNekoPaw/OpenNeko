## Context

OpenNeko 当前由 `@neko/agent-runtime` 直接组合 Pi Agent/Session，并自研 Tool registry、消息队列、Timeline/history projector、Skill Host、MCP client/bootstrap、Plugin contribution runtime。`apps/neko-desktop` 通过 package public entries 完成 Electron Main/preload/renderer wiring。本变更用独立 DSH 子进程 + ACP JSON-RPC stdio 替换内嵌 runtime，同时保持 OpenNeko 产品 authority 和 Electron 原生 UI。

DSH 官方 rc.8 profile 仍未完整覆盖 OpenNeko 所需的 session list/load/resume/history replay、tool/progress events、per-session close、inbox 管理、extension 管理面与 Host reverse tool 请求。因此保留一个 OpenNeko-owned、随产品发布的 DSH ACP bridge plugin/profile，在 DSH 内只复用公开 Agent/Session/Settings/Skill/MCP API 补齐这些语义；bridge 不得成为第二套 runtime。

用户要求整体迁移并一次性原子发布，同时要求先删除旧执行栈，让真实缺口直接暴露。迁移集成分支因此允许在 D0 删除后暂时无法编译或运行；这种不可运行状态不得进入普通主线或发布流程。并行开发只用于缩短实现时间，不产生可单独发布的中间产品状态。一个总 OpenSpec 拥有交付边界；隔离分支/worktree 中的工作流必须在同一集成分支汇合，并通过统一门禁后一次切换。

## Goals / Non-Goals

**Goals:**

- Desktop Main 启动独立 DSH 子进程，唯一生产通信路径为 ACP JSON-RPC stdio。
- DSH 子进程/profile 成为 Agent、Session/transcript、Inbox/queue、Tool lifecycle、Skill、MCP、Plugin 的唯一 runtime authority。
- 删除 OpenNeko 对内嵌 Cordis/`ctx.agents`、DSH Web/Client Runtime、TS SDK、Remote API、Pi 和自研 runtime fallback 的依赖。
- OpenNeko 保留 Electron 原生 UI、Conversation/Workspace binding、凭据、Host 权限/信任、extension 管理 UI/命令入口与短生命周期 projection、领域事实/Job、typed domain tool contracts 与 Host adapters；DSH 保留 extension catalog/config/readiness facts。
- 用户可见扩展面只保留 Skill 与 MCP；DSH Plugin 是官方 profile 的内部装配机制，不成为第三类用户扩展或通用第三方执行平台。
- 保留并接通内容创作所需的附件、多模态、感知模型与 Generation 参数，同时让每项配置与执行仍由其 canonical owner 管理。
- Agent UI 的既有最终视觉和交互是 retained product surface，不属于待删除的 Pi runtime。`@neko/agent-webview` 继续拥有纯 presentation component、既有 `agent-*` DOM/CSS 契约和最终版样式；Desktop Renderer 只拥有 DSH Host bridge 状态编排并向该 presentation 传入 canonical DSH Session/Permission projection。不得在 Desktop 私建平行 Agent 样式或复制消息、Tool、approval、composer 设计。Tool projection 必须保留 ACP 已提供且通过 bounded lossless JSON 校验的 `rawInput`/`rawOutput`，用于原 Tool activity 的可展开详情；单个非法 payload 只产生对应 diagnostic，不得清空 sibling event。不得恢复旧 Host runtime adapter、旧 message handler 或 Pi contract，也不得用 ACP 原始事件调试列表替代产品 UI。未绑定 Draft 的首条输入可以通过 sender-bound create operation 原子创建 Conversation 后提交，不能要求用户先进入协议空态再创建。
- 最终版 composer 中的模型选择、执行模式、Workspace/Canvas 上下文栏、附件入口和引用 token 是 OpenNeko 内容创作产品能力，不是 DSH Web 或 ACP 的调试控件。`@neko/host/settings` 继续拥有 secret-free 模型目录、用户选择和 execution mode；Shell/对应领域 owner 继续拥有 exact Workspace/Canvas/引用事实；`@neko/agent-webview` 只渲染 typed presentation。Desktop 只能从 sender-bound Agent Surface 和 exact Conversation context 解析这些 authority，禁止从 active/recent Workspace、DSH 默认模型或旧 Pi 状态猜测。没有 authoritative attachment/reference projection 时不得伪造 token 或把 `+` 显示成可成功的入口。
- Agent presentation 的用户可见文案由 `@neko/agent-webview` 的精简 package-owned locale bundle 负责，并跟随 Desktop locale；外层 Desktop i18n 只提供 locale，不得要求其复制 Agent `chat.*` keys，也不得让缺失 key 直接泄漏到 UI。该 bundle 只覆盖保留的 presentation component，不恢复已删除的 SkillHost、MCP、Plugin 或 Pi runtime 文案与注册面。
- 用薄的 OpenNeko-owned bridge plugin/profile 补齐 `dsh-acp` rc.8 automation-only 缺口，且不实现第二套 Agent loop、Session store、queue、tool registry、Skill/MCP/Plugin runtime。
- Generation+Canvas 作为首批纵向官方领域 Tool slice 迁移；Cut、Character、World 等随后迁移。Assets 通过 `@` 与显式 Workspace copy 接入，不注册 Tool。
- 精确清理已确认由退休 Pi runtime 拥有的表和目录；不读取或迁移旧内容，不扫描未知文件，不保留 unavailable projection、legacy reader 或 fallback。
- 通过 `scripts/dsh-q0` 非发布 fixture 验证子进程边界；真实 Provider 基线另由可见 Desktop UI 通过产品 Composer、DSH/ACP 和真实 API 验证，不能由 Q0 或 mock 替代。完整发布矩阵仍 fail-closed。

**Non-Goals:**

- 不引入通用多引擎 runtime port、feature flag、Pi/DSH runtime selection 或失败后 fallback。
- 不在 Electron Main 内嵌 Cordis Context，不使用 DSH Web/Client Runtime、TS SDK 或 Remote API 作为生产路径。
- 不实现 OpenNeko 自研第三方插件 runtime，不允许第三方 Webview JS 或任意第三方 JS 注入 Electron Main/DSH。
- 不保留 OpenNeko Skill Host、MCP Manager、Plugin runtime；Skill/MCP/Plugin 的实际发现/加载/启停/执行归 DSH profile。
- 不把 Generation、Canvas、Cut、Character、World 或感知能力包装成 MCP，也不把 Generation 参数并入通用 Agent/DSH settings；Assets 资源操作不进入 MCP 或 DSH Tool registry。
- 不把旧 Pi transcript 转换为 DSH Session，也不提供旧 transcript reader/repair/migration；已知退休存储原字节保留，正常启动不得读取、删除、改写、分类或投影这些数据。
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

首版只允许随 OpenNeko 发布、由官方维护并精确锁定的 DSH profile/plugins。不使用 dist-tag、caret、tilde 或混合 RC；lockfile 必须唯一解析到同一审核过的闭包。Plugin 是 DSH 内部 composition unit，不是用户可见扩展类型；产品扩展 UI 只展示 Skill 与 MCP。OpenNeko 不提供自研第三方插件 runtime，不加载第三方 Webview JS，不允许任意第三方 JS 注入 Electron Main/DSH。未来若引入隔离的第三方扩展，必须由独立 OpenSpec 重新定义执行边界、沙箱和信任模型。

产品 artifact 以只读 `resources/dsh-runtime/darwin-arm64` 作为唯一 executable/package authority，包含独立 Node、DSH CLI、完整 package closure、官方 OpenNeko profile template、tree fingerprint、关键文件 checksum 与第三方许可证清单。Desktop 不从系统 Node、全局 DSH、`PATH`、Electron `process.execPath`、普通 workspace `node_modules` 或 Q0 fixture 解析生产 runtime。DSH rc.8 启动会改写 profile `cordis.yml` 并维护 `$DSH_HOME/profiles/node_modules`，因此只读 template 不直接作为 `DSH_HOME`；Desktop 在 Electron `userData/dsh` 下维护唯一可写 DSH home，只将当前已验证 template 的 `package.json`、`cordis.patch.yml` 和指向只读 closure 中官方 OpenNeko package 的精确 links 重建到 `profiles/openneko`。当前 closure 包含 bridge、Generation、Canvas、Cut、Character 与 World DSH plugin；Assets 不进入 closure，官方 MCP contribution 只有完成对应 MCP slice 后才能加入同一生成清单。home-level `cordis.patch.yml` 固定为空，profile manifest 不声明 out-of-tree dependencies，普通本地包、Marketplace 与用户 patch 不得进入 production profile。

开发启动同样只消费 verified closure，但由 repository-owned development builder 在 Forge 启动前生成到被忽略且不受 Forge `.vite` 清理管理的 `apps/neko-desktop/.dsh-development-runtime/darwin-arm64`。builder 的第三方输入只能来自独立、精确锁定的 development runtime manifest/lock，Node 来自该 lock 中的 `node-bin-darwin-arm64` 分发包；当前七个 OpenNeko bundle 必须先从当前 source build，再把各包声明的发布文件复制进 closure。普通 workspace `node_modules` 只可提供 builder/toolchain，不能被 runtime 直接解析；系统 Node 只可执行 builder，不能被复制或引用为 runtime executable。builder 必须删除 install-time symlink、生成许可证清单与 canonical descriptor/tree fingerprint、完整 qualification 后原子替换旧 cache，并以输入内容 fingerprint 判断 cache freshness。Forge development Main watcher 必须把同一组 builder 输入加入 watch graph；任何官方 bridge/domain plugin 输入变化时，必须先完成 content-fresh closure 的构建与 qualification，再请求 Electron Main 重启，使新 Main contract 与新 DSH producer 在同一 generation 生效。构建或 qualification 失败必须阻止重启，不能让新 consumer 连接驻留内存的旧 producer，也不能增加旧 contract decoder。`scripts/dsh-q0` 的 manifest、lockfile、安装树和产物均不得成为任何 development/product closure 输入。

开发启动器对调用方显式提供的 `NEKO_DSH_RUNTIME_ROOT` 必须先执行完整 qualification 并原样使用；相对路径、损坏 closure 或版本不匹配必须在 Forge spawn 前失败，不能被自动生成结果覆盖。未配置时才允许调用 development builder，并只向该 Forge 子进程注入生成后的绝对路径。development builder 不参与 `build`/`package`/`make`，不能生成 release artifact、满足 release evidence 或绕过 integration-only release guard；发布 stage 仍只接受外部显式 `NEKO_DSH_RUNTIME_ROOT`。

### 3. Bridge 是协议适配器，不是 runtime

OpenNeko 随产品发布的 bridge plugin/profile 运行在 DSH 子进程内，负责：

- 复用 DSH 公开 Agent/Session API 补齐标准 ACP：session list/load/resume/history replay、tool/progress events、per-session close；
- 仅在标准 ACP 无法表达时提供最小 canonical extension：DSH inbox snapshot/edit/remove、官方 extension inventory/readiness/config/diagnostics、DSH→Host typed domain tool request/response。

Bridge 不得实现第二套 Agent loop、Session store、queue、tool registry、Skill/MCP/Plugin runtime；不得把 Host 侧状态写回 DSH authority 或把 DSH authority 复制到 Host。

官方 DSH `standard` agent preset 是 OpenNeko 通用 Agent 能力的唯一基座。OpenNeko profile 必须挂载 DSH 官方 `agent-presets` roster，并在 `session/new`、load/resume 以及同一 Session 的 Agent 重建路径中，通过公开 `agentPresets.mount()` 把 exact Agent 加入 `standard`。文件编辑、Shell、文件/网页检索、Skills、计划、目标、子代理与工作流均由该 preset 及其 Host-plane service 提供；OpenNeko bridge 不复制、改名或重新实现这些工具。`dsh-base` 中被 preset 接管的 process-global model-facing rows 必须在 profile layer 显式禁用，防止同一意图同时存在全局与 preset 两条注册路径；Generation、Canvas、Cut 等官方领域插件继续注册到 DSH 的 canonical layered Tool registry。

Preset 成功挂载只证明能力组成和注册可用，不等同于所有能力已完成产品验收。网页检索仍依赖 Host search provider/credential，真实 Shell/文件写入仍受 DSH sandbox 与 permission preset 约束，计划/目标/子代理/工作流仍需 ACP 事件、取消/恢复和 Electron presentation 的逐项验证。缺少依赖或投影时必须让当前能力 fail-visible，不得隐藏、伪造成功或切换到 OpenNeko 自研实现。

Bridge 的产品 lifecycle 只保留 `create -> list/revalidate -> load/resume -> prompt/live inbox enqueue -> cancel -> close/release -> restart 后按 exact binding load`。OpenNeko 不复制 DSH Agent handle、Session store 或 pending inbox。运行中的后续用户消息通过 DSH 公开 `Agent.followup()` 进入 exact live Session 的 `next-turn` inbox，并以 DSH Message identity 作为唯一待处理 identity；Host/Renderer 只持有 snapshot 和短生命周期 optimistic receipt。每条 queued message 携带其提交时已经由 Host 校验的 model-facing context 与 display content，DSH 在该消息被 claim 时切换 exact turn context，禁止从 active/recent Workspace 或 Renderer draft 重新推断。rc.8 的公开 `AgentHandle.dispose()` 仍会丢弃 pending inbox，因此首版只支持 live Session enqueue/edit/remove；close/restart 丢弃尚未执行的 inbox 是 canonical 行为，产品不广告离线 inbox 编辑。rc.8 仍无公开 durable Session delete；publication 失败保留精确 unavailable catalog/binding diagnostic，不把 `session/close` 冒充删除，也不建立 shadow queue 或读取 raw DSH 文件。

Agent Home 继续是 `@neko/agent-runtime` 从 Conversation catalog、exact binding 与 package-owned DSH event projection 计算出的轻量只读 read model。`currentTurn` 投影为 `running` attention；最新 `turn/end` 投影为 completed/cancelled/failed activity；单个 Session projection 失效只影响对应 Conversation。Shell 只消费该 read model 并复用既有侧栏状态 presentation，不订阅 raw DSH transport，也不持有后台 Agent runtime。

Composer 继续复用现有 OpenNeko `InputArea`。idle submit 走标准 ACP prompt；active-turn submit 只走 DSH live inbox enqueue，同一用户意图不得在 Host queue 与 DSH inbox 之间选择。运行中的模型配置保持冻结，因为 DSH `Agent.options` 在一个 driver drain 内不可安全替换；权限 preset 也在 active turn 期间锁定，避免当前 Tool permission 语义被中途改变。配置选择只有在 exact idle Session 成功应用后才提交 Host settings，失败不得留下“UI 报错但下一 turn 已换模型”的部分状态。

### 4. DSH Session/transcript 与 Host catalog 分离

DSH 子进程/profile 拥有 Session/transcript、实际 model context、turn/call lineage、Inbox/queue 与 qualified compaction。OpenNeko catalog 只拥有 Conversation metadata、Workspace binding、当前 Session reference、权限/信任、领域 Job reference 和可重建 projection。Host 不直接读写 DSH Session 文件；history replay 通过 bridge/ACP 从 DSH 获得。唯一 production `DSH_HOME` 是 Electron `userData/dsh`，官方 `dsh-base` 因而将 Session 写入 `userData/dsh/sessions`；profile materializer 只能替换 `profiles/openneko` 的官方配置/links 和 home-level empty patch，必须保留 `sessions/`、settings、credentials 与其他 DSH-owned durable files原样不动。DSH Session persistence 使用 Host 提供的稳定虚拟 cwd 配置，不把真实 Workspace 绝对路径写入模型上下文、日志或 Renderer。

Conversation title 是 OpenNeko catalog 拥有的用户可见 metadata，不属于 DSH transcript 或 Renderer presentation state。原生 Composer 在未绑定 Draft 的首提交中把同一条 strict-decoded input 一并交给 sender-bound create operation；`@neko/agent-runtime` 使用消息文本、资源/上下文标签、Command line 或 Skill display text，以 50 个 Unicode 字符为截断窗口生成 bounded 单行标题，并在 DSH Session 创建前随 catalog record 一次发布。Session projection 与 Agent Home projection 都从该 catalog record 读取同一 title；Webview 在 transcript 上方使用无明显分割线的固定居中标题栏，PrimarySidebar 不保存、不重算也不使用固定“新会话”作为已发布会话的成功标题。Character、Room 等显式领域标题仍由其 owning application service 提供，不经过首消息标题规则。

模型与模式的 canonical 路径是 `@neko/host/settings` selection → sender-bound Desktop Host projection/validation → exact Conversation-to-DSH-Session binding → 标准 ACP `session/set_config_option` / `session/set_mode` → DSH Agent。DSH bridge 必须在 `session/new`、`session/load` 和 `session/resume` 响应中广告真实支持的 mode/config state，并在 set operation 中拒绝未知值、运行中不可安全切换的状态和未绑定 Session。DSH `Agent.options` 创建后只读，因此 model/provider/maxTokens 变化必须在 exact idle Session 上释放并按同一 Session identity 从 authoritative log 恢复 Agent；失败后该 Session 局部不可用并返回 diagnostic，不得继续使用旧模型、DSH profile 默认值或另一 provider。Host 在每次 prompt 前重申当前 exact configuration，使 subprocess 重启后也不会以默认 Agent 配置形成隐藏成功路径。

Provider 的 canonical 可执行路径是 `@neko/host/settings` 的 enabled Provider/LLM Model 与 `ProviderCredentialAuthority` → Desktop 启动边界的一次性 DSH execution projection → DSH 官方 `llm-pi-ai` adapter route → exact Agent configuration。产品 Provider/Model identity 不改名；DSH route 使用同一 Provider identity，产品 Model identity 在投影目录中精确解析为唯一 API model name。Desktop 只把可由 DSH 官方 adapter 明确表达、具有唯一 API model name 且满足凭据要求的模型投影给 Composer；unsupported protocol、缺失凭据、重复 API model name 或无对应启动投影的选择必须 fail-local 且不可提交给 ACP。不得把 `deepseek-chat` 隐式改写为 `deepseek-official`，不得失败后切换 provider，也不得让 DSH 默认模型成为成功路径。

DSH provider 配置只写入每次启动重建的 product-owned profile patch；它不写入或覆盖 DSH durable `settings.yaml`。API key 不进入 patch、ACP、Session、日志、Renderer 或 Evaluation facts，而是由 Desktop 从 exact Provider credential owner 读取后，以仅对该 DSH 子进程可见的独立 credential reference 注入。普通父进程环境仍按 allowlist 隔离，任意未授权 secret 不得进入 DSH。当前运行中的 provider catalog 是启动快照；Provider/Model/credential authority 发生变化时必须显式重建同一 DSH runtime generation 后再广告新模型，不得在旧 generation 中假装配置已生效。

Composer 的权限选项直接来自 DSH `permissionPresets` authority，并通过标准 ACP `session/set_mode` 应用于 exact Session。当前 canonical 集合是 `read-only`、`workspace-write` 与 `danger-full-access`；DSH 运行时报告的 `custom` 只可作为当前状态展示，不能在没有可写 canonical preset 时被用户选择。OpenNeko 不再定义 `plan/ask/auto` execution mode；DSH Plan Mode 是 `standard` preset 拥有的独立能力，只有在其 ACP control、审批和产品 UI 投影完成后才能广告为可切换能力。

Composer 输入触发器保留原 `InputArea` 的单一 presentation 路径，不新增 DSH 专用菜单或复制组件。Bridge 在 exact loaded Session 上通过 DSH `ctx.commands.list(agent)` 和 `ctx.skills.snapshot({ cwd, scope: agent })` 生成 typed input catalog；Skill 只广告 `userInvocable` 项，incomplete Skill snapshot 必须返回明确 diagnostic，不能伪装为权威空目录。`/name args` 仅可在目录中 exact 命中后调用 `ctx.commands.execute(agent, line, signal)`，并把 DSH `command/run` / `command/done` 原生 lifecycle 投影成独立 Command activity；Command 不得进入模型 Prompt，也不得伪装成 Tool event。

产品随包发布的第一方 Skill 根由 Desktop 从开发源码或 packaged resource 精确解析，并只通过 DSH 官方 `DSH_BUNDLED_SKILL_DIR` 子进程环境交给 `standard` preset 内的 Skill provider。该目录是只读、受产品控制的发布资源；OpenNeko 不扫描、解析、注册或执行其中 Skill，也不得将普通 Workspace、个人或第三方目录混入该 bundled root。路径只存在于 Desktop-to-DSH 第三方运行边界，不进入 Renderer、ACP Session contract 或 transcript。

OpenNeko 产品使用 `$name args` 作为显式 Skill UI 手势；typed Session boundary 必须对 exact catalog hit 校验后把它转换为 DSH 官方 `tool-skill` 可识别的 `/name args` 用户消息。转换只改变发送给 DSH 的触发前缀，用户 transcript/presentation 仍保留原 `$` 输入；未知、过期或不再 `userInvocable` 的 Skill 必须拒绝当前提交，不得按普通消息发送。`@` 不读取 DSH extension registry，也不恢复旧 Pi file search；候选只能由 Host 对当前 exact Workspace grant、Canvas/Character/World context 和 canonical `ContentLocator` 生成。文件与媒体选择 receipt 必须携带 canonical `ContentLocator` 并作为 ACP resource link 提交；Asset、Canvas、Character、World 或其他非文件上下文必须携带严格校验的 package-owned `AgentContextPayload`，随当前消息注入 exact DSH turn context，禁止伪造 `ContentLocator`。Renderer 只持有可展示的 `MentionItem` 与选择 receipt。无授权目录时入口显示局部 diagnostic 或无候选状态，不能查询 raw path、猜测 active/recent Workspace 或伪造 reference token。

新 Conversation 的开发可用路径由 `@neko/agent-runtime` 的 publication service 拥有：先在 Host catalog 事务中保留 canonical Conversation metadata 与精确领域 context，再调用标准 ACP `session/new`，通过完整 `session/list` 精确复核返回的 DSH Session，最后发布唯一 Conversation-to-Session binding。Desktop Main 只能从 sender-bound 当前 Agent Surface 解析 Workspace/Assistant context，调用该 service，并在 durable publication 成功后调用 Desktop Shell 的 exact draft attach；Renderer 只提交当前 Surface identity，不能提交 Workspace、provider、model、cwd 或 DSH Session identity。Home projection 从 Host catalog、context 与 exact binding 计算，不能从 Renderer、active/recent Window 或 DSH transcript 猜测。

Entry 的项目选择只提交用户选择的稳定 `projectId`，不得把 Renderer 本地 token、Workspace identity 或
`workspaceGrantId` 当作 authority。首次 `create` 时 Desktop Main 必须同时校验 exact sender-bound
Window、Workbench、Agent Surface 与 Draft，通过稳定 Project catalog 解析 Workspace，并在同一创建链内签发
process-scoped grant、发布 Workspace Conversation、attach 原 Draft。未选择项目的普通对话只发布 Assistant
Conversation；不得因为 Entry UI token 未进入 Main authority 而静默创建 Assistant Conversation，也不得在选择
项目时提前切换 Workspace scene。

持久 Workspace Conversation 重开后，当前 Agent Surface 的 composer attach 是恢复 process-scoped grant 的
唯一边界。Desktop Main 必须用 exact `windowId + workspaceGrantId + workspaceId` 调用 canonical
`restore()`，再投影模型、上下文栏并允许 prompt；不得要求旧进程内 grant 仍存在，也不得生成替代 identity。
恢复失败只禁用当前 Conversation并返回 owner-qualified diagnostic。DSH `session/list` 不可解析的旧 preset
Session 同样保持可见但不可执行；不得把它改绑到另一 DSH Session、自动新建 Session 或兼容加载旧 preset。

当前 rc.8 没有公开 `session/delete` 或等价 persistence seam，因此 `session/new` 成功但 binding publication 失败时，Host 必须保留已创建的 Conversation catalog 记录并显示局部 diagnostic，不能删除 raw DSH 文件、调用私有模块、将 `session/close` 冒充删除或返回成功。首版以该 fail-visible 结果作为 canonical publication failure policy；未来若上游增加公开 delete seam，再通过独立 OpenSpec 判断是否引入精确 provisional cleanup，不为等待该 seam 保留平行路径。

原生会话删除入口同样必须始终注册完整的 typed preload/Main 路由，并在 Host projection 中逐项校验 sender-bound 的精确 Conversation identity，再委托唯一 DSH domain Conversation application service。当前 rc.8 缺少 durable delete seam 时，该 service 必须拒绝请求、保留 catalog/binding/Session，并返回 owner-qualified diagnostic；不得让漏注册的 Electron channel、Renderer 本地隐藏记录或直接清理 OpenNeko metadata 取代该失败语义。未来公开 delete seam 的接入必须原子更新 application workflow 与测试，而不是增加第二个 handler。

Window 的当前 scene/presentation snapshot 必须保存并恢复 exact Conversation identity。应用进程重开时，Host 只能用已持久化 scene 中的 `conversationId` 和 owner 对 Home catalog/context/binding 做资格校验；合法记录原样恢复，单条失效只把该 Surface 重置为新的 canonical Draft 并保留 catalog diagnostic。禁止在重开时无条件进入 Entry，也禁止选择 first/active/recent Conversation。Renderer reload 只重建当前 Root，不改变 durable scene selection。

### 4.1 附件、多模态与感知模型遵循能力协商

ACP Prompt content block 是 Desktop 到 DSH 的唯一消息输入协议。Bridge 必须按实际能力广告并严格接收 text、resource link、image、audio 与 embedded resource；不得把 resource link 降成模型可见的伪文本，也不得在广告 `false` 时让 UI 显示可成功的附件入口。

DSH rc.8 当前只为 PNG、JPEG、WebP 与 GIF 提供持久 image attachment 和 provider-neutral `ImageBlock`。图片通过 Host 资源授权、字节/MIME 校验和 DSH attachment admission 后进入 exact Session，并由当前模型的 modality 声明决定能否直接执行。音频、视频、文档和其他文件尚无 DSH 原生持久 block：在上游公开契约补齐前，owning media/content service 只能产生有界、带来源 identity 的文本或感知 evidence，再通过 exact turn context 注入；原始资源、路径和 bearer URL 不进入 DSH Session。

Composer 选择或粘贴的内联图片使用同一 canonical image path，不转换为 Workspace 文件、不恢复旧 Pi attachment projector，也不把 Renderer `MessageAttachment` 直接作为 IPC/Session contract。`@neko/agent-webview` 只把用户手势产生的 Data URL 投影为最小 `name`/`mimeType`/canonical base64 input；package-owned DSH Session Host contract 限定图片 MIME、数量与源字节，Desktop Main 在 exact sender-bound submit 边界重新解码、校验并与 `@` Workspace 图片一起交给同一 image admission/normalization owner。当前模型不声明 image input、任一图片非法或完整批次超限时，整个当前 submit 必须在 ACP Prompt 发布前失败并恢复 Composer 草稿；不得继续纯文本 Turn、丢弃单项或切换 provider/source。

Desktop 到 DSH 的普通 Prompt 和 live inbox 都携带 admission 后的同一有界 image blocks。Bridge 先通过 DSH `AttachmentStore` 原子持久化完整批次，再创建 user message；用户消息 source 只保存用于回放的图片名称与真实 DSH attachment identity，不复制 base64。Session replay 和 inbox projection 由该 metadata 重建图片 token，不能伪造 ContentLocator、暴露 attachment bytes 或用文本占位替代模型 image block。图片 payload 继续按图片数量/源字节/归一化总字节约束验证；非图片 JSON/context 仍受通用 ACP extension payload 上限约束，不能通过放宽全局 JSON limit 接纳任意大输入。

对话中的图片展示继续消费同一 DSH attachment identity，但不把 attachment bytes、Data URL、原始文件路径或长期 URL 写回 Session projection。`@neko/dsh-bridge` 只允许读取 exact Session 已引用的图片 attachment；Desktop Main 在校验 sender-bound Window、exact Conversation 与该 attachment 引用后，才将读取能力注册为当前 Renderer Session 拥有的短生命周期 `openneko://resource`。Webview 只接收 opaque resource URL 和受限的 MIME/宽高元数据，以 lazy thumbnail 展示，并在用户显式点击时复用同一资源打开完整预览。图片读取、授权或解码失败必须只在对应消息图片位置显示明确 unavailable diagnostic，保留名称 token 和 sibling 消息；不得回退到 raw path、旧缓存、另一 Conversation 或文本伪装。Surface 卸载或切换 Conversation 时必须释放对应 resource lease，Window teardown 仍作为最终安全释放边界。

感知模型由独立的 product perception configuration owner 选择。当前模型声明支持输入模态时直接处理；不支持时才由显式配置的感知模型处理资源并返回结构化 evidence。选择发生在提交前的单一 modality routing policy 中，必须记录 exact source/model/evidence identity；感知模型缺失或失败只拒绝当前附件，不得隐式切换 provider、伪造描述或把附件静默丢弃后继续普通文本 turn。Generation 模型与参数继续由 `@neko/generation` owning configuration/application service 管理，与 Agent LLM/感知模型目录分离。

### 5. 领域 Tools 是官方 DSH Tools，不是 MCP

Generation、Canvas、Cut、Character、World 等作为精选高层官方领域 Tools 注册到 DSH。DSH 拥有调用 lifecycle；owning packages 拥有 schema、semantic validation、authorization、exact resource identity、业务事务、领域事实与长任务 Job。领域能力不用 MCP 包装。UI 直接操作领域能力时不经过 Agent；只有 Agent 发起领域调用时走 DSH→Host typed domain tool request/response。Assets 只通过 `@` 资源发现和选择时的 Workspace copy 进入 Agent，不注册 Tool。

每个领域 Tool 必须有一个显式 package-owned DSH contribution 和一个精确 reverse Host adapter；不得用 generic Tool factory、wildcard dispatcher 或 MCP wrapper 批量恢复旧 Capability runtime。Generation、Canvas、Cut、Character 与 World 分别独立验收，缺少某个 Tool 只使该能力 unavailable，不得阻塞一般对话或 sibling domain Tool。Assets 由 Composer/Assets public ports 独立验收，任何 `openneko.assets` 注册都必须使边界门禁失败。

Cut media/export 的 durable owner 由 `@neko/cut-node` 的 `ExportJobCoordinator` 组合，按 exact
Workspace identity 使用 `LocalMetadataStore` 的持久化 Job store。Job request 只保存 workspace-relative
document/output locator、冻结后的 timeline facts、导出设置和用户领域 identity；不得保存物理 Workspace
绝对路径、UI runtime identity 或闭包回调。FFmpeg executor 在 Host 侧按已授权 Workspace owner 创建，
并通过持久化 execution identity 支持 submit/describe/cancel/reconcile。Cut UI 只订阅该 owner 的只读
projection；卸载、切换场景或 renderer 重开不得取消或删除仍受保护的 Export Job。无法恢复 executor
identity 时必须将单个 Job 标记为 `outcome-unknown`，不得回退到 UI runtime、内存 store 或重新导入旧任务。

W2 首批纵向 slice 冻结精确最小操作：Generation 只暴露 `openneko.generation` 的 `submit` 和 `describe`。`submit` 仍通过 `PurposeGenerationJobPort` 创建由 Generation 独立拥有、可恢复的异步 durable Job，但 Agent Host adapter 必须在同一 reverse Tool call 内订阅 exact Job 至终态；只有 `succeeded` 才返回 bounded durable Job facts 与 canonical `resultLocators`，`failed`、`cancelled`、`outcome-unknown` 或观察流在终态前结束都必须让当前 Tool call fail-visible。Tool request 被取消时只释放该 observer，不隐式取消已发布 Job；`describe` 保留为按 exact Job identity 的一次性诊断/重新附着入口。Direct UI submission 继续在创建 Job 后立即返回，不受 Agent 等待策略影响。Canvas 只暴露 `openneko.canvas` 的 `query` 和 `create-node`，通过 `CanvasProjectAuthoringService` 使用 normalized workspace-relative `.nkc` path 和 exact `expectedFingerprint` 返回 bounded facts。两个 owning package同时导出唯一 model-facing 参数 schema；该 schema 精确描述 operation envelope、必填字段、camelCase 名称和 generationType-specific request，并关闭嵌套 operation input 的未知字段。DSH plugin 将该 schema 原样交给 `defineTool`，不得降级为无约束 `json` 或在 description 中重新定义平行参数。DSH 侧 `ctx.tools.register` 只做注册与 `ctx.opennekoHostTools.execute` 转发，不做 domain validation；Host 侧在 `@neko/agent-runtime/acp` 使用两个显式 adapter 做 strict decode、domain semantic validation、Generation terminal observation 与 owning service 调用。无模型轮询、wildcard dispatch、generic Host tool registry、MCP wrapper、兼容字段或 Desktop business validation。

W6 Character slice 只注册一个官方 `openneko.character` Tool，并冻结为 `query` 与 `fill-draft` 两个 operation。两者都必须携带 exact `characterProjectId`，且只能用于 durable Conversation 中已绑定的 `authoring` context、exact `character-project` target、Workspace grant 和 Project authority；输入 identity 与绑定 target 不一致时在当前 Tool call fail-visible。`query` 只返回 bounded CharacterProject 状态和精确 CharacterVersion identity/lifecycle metadata，不返回 repository bytes、物理 Workspace path、Room/runtime/memory 或 active UI facts；`fill-draft` 接受当前 canonical `CharacterDefinition` shape，只调用 Chara owning service 的 fresh-target 事务，已有内容、evidence、candidate、publication 或非 fresh lifecycle 不得被覆盖。`@neko/chara` 拥有 schema、semantic validation、bounded projection、版本 identity 和事务，`@neko/agent-runtime/acp` 只拥有 exact Tool dispatch/Host adapter，Desktop 只解析 exact Conversation binding、Workspace grant 并组合已有 Chara repository/service。不得恢复旧 Character capability provider/Tool name、global Character creation、MCP wrapper、通用 registry、active/current/recent target fallback 或 Renderer authority。
W6 World slice 只注册一个官方 `openneko.world` Tool，并冻结为 `query` 与 `fill-draft` 两个 operation。两者必须携带 exact `worldProjectId`，只能用于 durable Conversation 中绑定的 `authoring` context、exact `world-project` target、Workspace grant 与 Project authority；输入 identity、Project scope 或 Workspace grant 不一致时当前 Tool call fail-visible。`query` 只返回 bounded WorldProject facts 和精确 WorldVersion publication identity/lifecycle metadata，不返回 workspace path、runtime/save/event state 或 active UI facts；`fill-draft` 复用 `WorldAuthoringService` 的 fresh-target transaction，已有 source、non-empty draft、publication 或非 fresh lifecycle 不得覆盖。`@neko/world` 拥有 schema、semantic validation、bounded projection 和业务事务，ACP 只做 exact dispatch/Host adapter，Desktop 只解析 exact Conversation binding、Workspace grant 并组合已有 World repository/service。World 不经 MCP、旧 Capability、global/active target 或 direct runtime。

DSH Conversation 的 durable context 使用单一 `AgentConversationContext` contract：普通 Workspace/Assistant binding 继续表达通用会话，`kind: 'authoring'` binding 同时保存 exact Workspace grant、Project authority 与可选的 exact `character-project`/`world-project` target。该 context 与 DSH Session/catalog 在同一 authority 中原子发布；Renderer 只能选择展示，不得提交或持有 authoring authority。Desktop 从 sender-bound Workbench 的精确 authoring surface 解析 target，若当前可见 authoring surface 不唯一则当前创建请求 fail-visible；无 authoring target 时 domain Tool 必须显式 unavailable，不得从 active/recent Project 推断。Shell/Composer 将 authoring context 只投影为其 exact Workspace surface，不建立第二 target store。

反向 Host Tool 的取消与载荷边界由 `evidence/w1-reverse-host-tool-cancellation-payload-freeze.md` 冻结。ACP SDK 只提供连接级取消，因此 bridge 使用精确 `execute`/`cancel` extension method pair；Host 只按完整 Session/turn/call identity 中止对应 handler，迟到响应不得重新结算或影响 sibling。完整请求与响应分别限制为 256 KiB UTF-8 lossless JSON 和 32 层容器深度，并在 DSH 发送前、Host dispatch 前、Host 返回前和 DSH 接收后使用同一 contract 校验。取消 Tool request 不隐式取消已经发布的 Generation durable Job。

反向 Host Tool 的产品上下文不进入 DSH request，也不从当前 Window、当前 Workspace 或最近 Conversation 推断。`@neko/agent-runtime` 必须用 request 的 exact DSH Session identity 反向读取唯一 Conversation binding，再读取该 Conversation 的 durable domain context；Desktop Host adapter 随后使用 context 中的 exact Workspace/grant 或 Assistant identity 解析 owning service。反向读取不得调用 `session/list`，避免处理 DSH→Host request 时产生 ACP 重入；missing、cross-Session、invalid context 与 unsupported domain 必须只拒绝当前 Tool call。

内容创作 Composer 的上下文栏与模型实际收到的动态上下文必须来自同一 authoritative product context。Canvas domain 通过一个 canonical `CanvasWorkspaceContextCatalog` 投影 logical Workspace Board 与当前 Workspace 下全部有效 exact Canvas；Renderer 只保存本次输入的选择，并在 message/Skill submit 中回传 Canvas-owned `CanvasWorkspaceTurnTarget`，不得提交路径、摘要或 Canvas authority。`@neko/agent-runtime` 读取 durable Conversation context，校验 target 的 exact `workspaceId`，并通过 Canvas-owned `CanvasWorkspaceTurnContext` 解析 Board 或 exact Canvas 的轻量上下文；Desktop Main 只注入 Workspace 授权与 Canvas index port。默认目标是 logical Board，已选择 exact Canvas 失效时当前提交必须 fail-visible，不得回退 Board、active/recent Canvas 或 Renderer 摘要。标准 ACP rc.8 未提供 embedded context，OpenNeko bridge 因此使用一个最小 `openneko/session/context/set` 扩展，在 exact DSH Session 的 idle 边界设置当前 turn context；active turn 的 queued message 保存提交时已经验证的 context text，并仅在 exact DSH message 被 claim 时应用，所以后续目录刷新不得改变已排队 turn 的 Canvas 目标。bridge 仅把已验证文本注册为 agent-scoped `systemPrompt.context`，不解释业务数据、不保存第二份 transcript，也不改变用户消息。模型切换重建同一 Agent 时必须保留该 scoped context owner；Session resume 后 Host 必须在下一次 prompt 前重新设置，缺失或 unsupported domain context 必须使当前 prompt fail-visible。

这条链路同时冻结本轮 artifact 的 exact Canvas target。Composer 提交时只创建短生命周期 admission；普通 prompt 在投影出真实 DSH turn 后绑定该 turn，queued inbox message 先绑定精确 message identity，并只在该 message 被 DSH claim 为真实 turn 时完成绑定。Tool 完成和 turn 终态投递只能读取这个已绑定 target，完成后立即释放；不得从 prompt text、Tool 参数、投递时的当前 UI selection、active/recent Canvas 或 Workspace Board fallback 猜测目标。该 owner 不保存 transcript、业务内容或持久 Canvas binding，只弥合 Host submit 与 DSH 异步 turn identity 的运行时边界。

终态 assistant Markdown 属于确定性长期产物时，Agent application service 先生成稳定 Workspace `ContentLocator`，Desktop 通过 authorized Workspace writer 原子写入 Markdown 文件，再把该文件 reference 投影到同一 exact Canvas。相同内容和 identity 的重试必须幂等；已有路径内容不同则 fail-visible。Content Tool 成功产生的章节、图片等 source artifacts 仍在 Tool 完成时立即投影，且不得把临时分析过程、日志或未完成草稿写入 Canvas。

ACP permission 由 `@neko/agent-runtime` 的短生命周期 pending approval owner 管理。它在 projection 已确定 exact turn 后，将 request 绑定到 Conversation/DSH Session/turn/toolCall 四元 identity，向 UI 只投影 ACP 广告的 option identity/name/kind，并只接受同一四元 identity 下仍被广告的 option。连接释放将未决请求结算为 ACP `cancelled`；不得 default allow/default deny、按 toolCallId 单独匹配、复用 Pi `runId/turnId` approval contract 或回退 active Window。

Desktop permission IPC 使用单一 `openneko:dsh:permission` request channel 和 changed notification；每个 list/decide/cancel request 均携带 sender-bound Window/renderer session 与 exact Conversation identity，decide/cancel 额外携带 DSH Session/turn/toolCall 四元 identity。Preload 只构造并严格解析该 canonical shape，Renderer 不得提交 ACP 未广告的 option，也不得复用旧 `confirmTool`、`runId` 或 active Conversation fallback。

#### Character/Room DSH Conversation、Prompt 与 SQLite 收口

Character/Room 交互中的 participant Agent 不是另一套 Character model runtime。`@neko/chara`
继续拥有 CharacterRun、DialogueRun、RoomRun、每回合冻结的角色/叙事/连续性上下文与
`CharacterAgentConversationPort`；`@neko/agent-runtime/application` 拥有一条通用的 DSH domain
Conversation publication/turn 链路，按 exact Conversation identity 发布 DSH Session/binding，在每次
prompt 前设置 exact product context，并从同一 DSH projection 提取本次终态 turn 与最后
assistant message。Desktop 只把 Chara 的窄 port 映射为该 application service，不持有角色
prompt 策略、turn 状态机或第二 transcript。CharacterRun 中已有的
`primaryAgentSessionId` 在本边界中保留为精确 OpenNeko Conversation identity；DSH Session identity
只存在 canonical binding 中，不改写 Chara 事实。

Character participant 创建在写入 Chara Run 前会先发布同一 exact Conversation/DSH Session，
因为 Chara durable record 需要引用该 Conversation identity。当后续 Chara 事务失败时，当前
DSH release 没有公开 Session delete 语义；因此 application 必须保留已发布记录并返回
明确 cleanup diagnostic，不得把 `session/close` 冒充删除、不得直接改写 DSH 文件或静默
报告回滚成功。Chara owner 同时保留原事务失败与 cleanup diagnostic。

OpenNeko 通用产品 system Prompt 由实际执行的 `@neko/dsh-bridge` 拥有，并作为一个
稳定 `systemPrompt.context` fragment 注入每个由 `standard` preset 创建/恢复的 Agent。
DSH `standard` preset 继续唯一拥有基础 Agent 人设、模式、AGENTS/environment instructions
与通用 Tool 协议；OpenNeko fragment 只表达产品跨领域输出、资源引用、感知、
Skill 选择和副作用证据约束，不得重新定义 `ask/plan/auto` 或复制 preset Tool 协议。
旧 `SystemPromptBuilder`、locale/mode prompt map、Host AGENTS file loader 和 composition projection 没有生产
consumer，应与其 public subpath 原子删除；Evaluation 必须改为验证真实 DSH fragment
身份/路径，不得再以旧 Builder unit test 作为 runtime prompt 证据。

OpenNeko SQLite 仅保留 DSH Conversation catalog metadata、exact domain context 与
Conversation↔DSH Session binding。旧 first-submit lifecycle 的 `agent_conversation_records` 表、repository、
service 和 domain Conversation service 没有 DSH consumer，必须从生产 initializer/public exports 删除。
已存在的表和字节保持原样，正常启动不执行 `DROP`、读取、转换、修复或删除。

### 6. OpenNeko 只拥有产品管理面与 Host adapters

DSH Session event 的 `time` 是回合时间的唯一事实来源。OpenNeko bridge 必须在
`openneko/session/event` extension 中原样传递该第三方事件时间；`@neko/agent-runtime` 在 exact
Session/turn scope 内校验并关联 `turn/start` 与 `turn/end`，再向 Desktop projection 提供
`startedAt`/`completedAt`。Desktop Main/preload 只传递 canonical shape，Renderer 的既有状态行只负责
格式化处理耗时。活动回合只允许从 `currentTurn` 精确关联同 turn 的 DSH `startedAt`，在 transcript 尾部
复用既有状态行显示“处理中”并以 Renderer 当前时钟刷新临时 elapsed presentation；该时钟不得进入
contract、projection、持久化或完成耗时。`turn/end` 到达后临时行消失，完成行与历史 replay 只使用 DSH
`completedAt - startedAt`。缺失 start、时间倒退或跨 turn 配对只拒绝受影响事件并返回 diagnostic，不得
使用 Renderer 时钟、ACP 收包时间、Tool duration 或相邻回合时间伪造 canonical timing 或回放结果。

DSH Session 的 `assistant/chunk` 与 `assistant/message` 是助手输出的唯一事实来源。Bridge 必须把
`text-delta` 和 `reasoning-delta` 投影为标准 ACP message/thought chunk，并在 metadata 中保留 exact
Session、turn、step 与 block index；不得读取 provider stream、生成本地 token 或建立第二套消息协议。
`@neko/agent-runtime` 只在该 exact identity 下维护有界、可丢弃的 live assembly，并以 DSH
`assistant/message` 的稳定 message identity 和最终 blocks 原子结算对应临时输出。最终事件必须替换同 step
的临时文本而不是追加重复消息；DSH replay 通过同一路径重建最终 presentation，但不重播历史 token 动画。
reasoning 与 text 分属独立 channel，交错 block 按 DSH block index 组装；`tool-call-delta` 不能成为 Tool
事实或向 UI 暴露未完成 JSON，正式 `tool/call` 仍是 Tool lifecycle 的唯一入口。非法 identity、越界 block、
重复或倒退 frame、超过 bounded assembly、final 与未知 step 不匹配时，只拒绝对应 frame 并发布 diagnostic；
sibling Session/Conversation 保持可用。取消、错误或连接释放不得由 Renderer 猜测完成文本，已收到的部分输出
只作为可丢弃 presentation，DSH 最终 message/turn terminal state 到达后按 canonical 事件收敛。

OpenNeko 继续拥有 Conversation/Workspace binding、凭据、Host 权限/信任、产品管理 UI/命令入口、短生命周期 projection、领域事实/Job、typed domain tool contracts 和 Host adapters。Skill/MCP 的 catalog、configuration、readiness、发现、加载、启停与执行均由 DSH profile 拥有；DSH Plugin lifecycle 只服务官方 profile composition，不作为产品 catalog。OpenNeko 管理面只通过 bridge 读取 Skill/MCP inventory/readiness/config/diagnostics 和提交精确命令，不保留 extension catalog authority、自研 Skill Host、MCP Manager 或 Plugin runtime。

`computer-use` 与 `browser-use` 是官方维护的 DSH MCP integration：DSH 内的官方 MCP contribution 拥有 connection、Tool discovery/registration、call 与 cancellation；OpenNeko Automation/Host 只提供 exact target、OS permission、sender-bound grant、action approval 与短生命周期 evidence。它们不能作为普通第三方 Plugin JS，也不能回到 Desktop Main 的 MCP Manager。rc.8 已公开 `@deepseek-ai/dsh-mcp-client`，可以在 DSH profile 内连接 stdio/Streamable HTTP MCP 并向 DSH Tool registry 注册 qualified Tools；但该 package 不提供独立的全局 server inventory/config mutation service。产品管理投影只能列出实际由官方 profile 完成组合且能够证明 readiness 的 contribution，不得把未组合的 Browser/Computer slice 硬编码成 `unsupported` catalog item。

Skill management 可以使用 `ctx.skills.snapshot/list/get` 与 invocation policy。Plugin inventory 的公开 snapshot 缺少 provenance/mutation/MCP catalog；Settings 的 redacted descriptor 也尚非 fail-closed wire contract。因此 bridge 只能暴露能够由公开 API 完整证明且不含 secret 的 exact Skill/MCP contract；没有实际 contribution 时返回空 inventory，不生成虚假的 catalog issue。已存在但无法连接或验证的 exact contribution 才返回局部 unavailable diagnostic；不得读取 DSH 私有模块、直接暴露 raw settings schema 或用 OpenNeko 旧 catalog 补齐。

Provider credential 的 host-neutral owner 是 `@neko/host/settings` public entry。它只接受精确 normalized provider identity，优先读取 `ProviderCredentialSource` 中的 config-owned API key；invalid config 必须在读取 SecretStorage 前失败。非 config-owned credential 只通过注入的 `HostSecretPort` 访问，Desktop concrete adapter 使用 Electron `safeStorage` 和独立 `provider-credentials.json`。新 authority 不读取、迁移、删除或重写旧 `agent-credentials.json` 与 `openneko.agent.pi.credential:*` keys。Desktop Main 只构造 authority；direct-UI Generation 继续使用 reader，DSH execution projection 则在 subprocess 启动前逐 Provider 读取同一 reader，并为 DSH 官方 `llm-pi-ai` route 生成独立、进程内 credential reference。profile patch 只保存 provider endpoint、protocol、bounded LLM catalog 与 reference name，不保存 secret；subprocess environment 只包含该 projection 明确生成的 credential values 和既有 shell allowlist。单个 credential 读取失败只排除对应 Provider 并产生 diagnostic，sibling Provider 保持可用；不得把 DSH base 默认 `deepseek-official`、父进程任意环境、DSH durable settings 或旧 Pi store 当作替代 credential/provider authority。

### 7. Q0 是子进程资格 fixture，不重复安装验证

已知 dsh CLI 可正常使用，因此不重复安装验证。`scripts/dsh-q0` 非发布 fixture 必须验证：subprocess lifecycle、stdout purity、handshake/capability、session recovery/history、progress、permission、cancel、inbox、Host tool reverse requests、extension management、crash/restart/fail-local。真实 Provider 基线已通过可见 Desktop UI、产品 Composer、DSH/ACP 和真实 API 验证，并保留 exact provider/model、turn terminal 与 no-fallback 证据；Q0 结果仍不得冒充该证据，也不得被提升为 Desktop 发布产物。完整发布矩阵仍 fail-closed。

Agent Evaluation 必须使用完整 Desktop Session owner 与公开 Composer input path，facts 以 `conversationId`、`dshSessionId`、DSH turn/step/toolCall、permission preset、model receipt、Skill/Command invocation、MCP/Tool provenance、attachment/perception evidence 和 domain Job/artifact identity 为准。Pi `runId/branchId/queue` assertions 与 direct runtime driver 必须原子删除；visible UI + real provider 负责产品验收，hidden full Desktop + real provider 负责批量回归。缺少 canonical driver 或 API 授权时返回 `infrastructure-blocked`，不能用 Q0、mock 或最终文本 fixture 冒充行为证据。

### 8. 删除优先、原子发布与并行工作流

一个总 OpenSpec 和一个迁移集成分支拥有最终发布事实。D0 首先删除 Pi runtime、自研 Tool registry/queue/projectors、Skill Host、MCP Manager、Plugin runtime、相关生产注册/public exports/direct dependencies 和平行 DSH client 路径。D0 后的编译与运行失败形成 authoritative replacement inventory；不得用 stub、no-op、兼容 adapter、旧代码恢复或临时 fallback 消除失败。随后 Q0/contract freeze 建立新边界，W1 建立 DSH ACP subprocess/bridge spine；W2 将 Generation+Canvas 作为首批纵向 Tool slice；W3 完成 DSH-owned extension 管理面；W4 切换产品 contract/Desktop consumer；W5 处理 Conversation catalog 与旧 Pi 数据保护；W6 迁移后续领域 Tools；W7 产出 Evaluation/non-release 证据；W8 证明删除完整并关闭 replacement inventory。任何子工作流不得单独发布、打包、打 tag 或宣称上线。

D0 只删除仓库代码和依赖，不得读取、修改或删除旧 Pi Session JSONL、数据库、用户目录内容或数据保护 fixture。删除前后对受保护 fixture 建立 hash 证据。因为 D0 明确制造 integration-only 不可运行状态，release guard 必须在 D0 开始前即关闭，并保持关闭直到所有新 consumer、确定性门禁和要求的真实 provider 证据完成。

### 9. 无内部 contract 版本、无双路径

所有内部 contract、IPC/message、ACP mapping、DTO、schema、event 与 command 保持单一 canonical shape；不添加 `version`、`schemaVersion`、`contractVersion`、内部 generation/epoch 或兼容别名。旧 Pi 数据保留原字节但不作为成功路径。DSH/ACP 协议中由第三方公开提供的版本号可以保留为第三方标识，但不能作为内部 schema 分发键。最终仓库必须只有一条可成功路径。

### 10. 统一集成门禁决定原子发布

发布门禁必须同时证明：DSH 子进程/profile 精确锁定；ACP stdio 是唯一生产通信路径；无 Pi/Cordis 内嵌/fallback；bridge 未实现第二套 runtime；Generation+Canvas 首批 Tools 已通过完整 Desktop 路径；所有 consumer 已切换；旧路径/导出/依赖已删除；旧 Pi 数据未改写；extension 管理面 fail-local；`scripts/dsh-q0` 确定性证据与本变更要求的真实 Desktop/provider 证据均存在。当前聚焦 Provider 基线不能替代尚未执行的完整 Provider/Model、approval、领域 Tool、恢复与发布矩阵。任一缺项时 release guard fail-closed。

## Risks / Trade-offs

- **[DSH ACP rc.8 能力缺口]** → 用薄的 OpenNeko-owned bridge 补齐标准 ACP 与最小 canonical extension；bridge 只做协议适配，不拥有 runtime 状态。
- **[子进程崩溃/重启导致会话状态丢失]** → DSH Session persistence 由 DSH profile 管理；Desktop supervisor 按 crash/restart 策略重启并 fail-local，Host 不伪造恢复成功。
- **[stdout 混入非协议日志]** → `scripts/dsh-q0` 必须验证 stdout purity；协议日志/诊断走 ACP 或 stderr/受控通道。
- **[双向 JSON-RPC 并发、背压或迟到响应污染其他请求]** → 每个请求携带精确 Session/turn/call/request identity，设置有界队列与 payload 上限；cancel/close/disconnect 后的迟到 frame 只结算或拒绝原请求，不能重开工作或阻塞 sibling Session。
- **[并行工作流修改共享 contract 导致冲突]** → W0 冻结单一 contract owner；其他工作流只消费，变更需集中协调并全量 rebase。
- **[旧 Pi Conversation 无法在新版本打开]** → 原字节保留、catalog 可见、局部 diagnostic 与显式删除入口；不伪造迁移成功。
- **[DSH Tool validation 比现有 contract 弱]** → owning domain adapter 在调用 owner 前复用 canonical semantic validator，并用负例测试证明无 bypass。
- **[官方 profile/plugin 闭包漂移]** → 精确锁定并作为独立升级变更重新验收。
- **[DSH extension/settings 公开 API 不足]** → 只交付可由公开 API 证明的 Skill/MCP read model；其余保持 fail-visible blocker，不恢复旧 catalog/runtime 或读取私有模块。
- **[DSH 非图片附件尚未实现]** → 图片先走 DSH 原生 attachment；音视频/文档只提交授权后的有界 evidence，并在上游公开 block 可用后再扩展 canonical contract。
- **[发布后回滚到 Pi 会无法读取新 DSH Session]** → 不提供 in-product Pi rollback；发布前可整体撤销集成分支，发布后只能提供 DSH-compatible 修复版本并保留所有 Session 数据。

## Migration Plan

1. 修订并接受本变更，关闭或取代 `adopt-pi-agent-runtime`；建立 integration-only release policy。
2. 关闭 release guard，记录旧用户数据 fixture hash，然后执行 D0：先删除 Pi runtime、Tool registry、queue、projectors、Skill Host、MCP Manager、Plugin runtime、生产注册/public exports/direct dependencies 与平行 client 路径；运行类型检查和边界扫描生成 replacement inventory，不增加 stub 或兼容路径。
3. 完成 Q0/contract freeze：用 `scripts/dsh-q0` 验证子进程/ACP 边界，并用可见 Desktop UI 单独验证真实 Provider 基线；两类证据不得互相替代。
4. 并行实现 W1–W6，按 W1 → W2/W3/W5/W6 → W4 顺序进入同一集成分支；每个新 producer 必须关闭对应 replacement inventory 项。
5. W7 在完整集成路径上更新 Evaluation/non-release 证据；W8 证明旧路径删除完整、无残留 consumer，并关闭全部 replacement inventory。
6. 运行 deterministic gates、package typecheck/build/test、Desktop hidden/visible 验证、Session reopen、Tool/Job、extension failure isolation 与旧数据保护矩阵；真实 provider 若跳过，必须在记录中明确不是发布证据。
7. 只有所有门禁通过后才允许执行发布型 Desktop package，并从集成分支生成一个发布候选；不存在按工作流发布的中间候选。

发布前回滚通过整体撤销集成分支完成，不保留兼容 adapter。发布后若发现缺陷，修复必须保持 DSH authority；不得恢复 Pi 作为 fallback。任何不可读 Session 原字节保持不变并局部标记失效。

## Open Questions

- `dsh-acp` rc.8 的 ACP method/event 精确集合与 bridge 需要补齐的最小 extension 最终 shape；由 Q0 证据和 contract freeze 确定。
- 虚拟 cwd 配置如何在不暴露真实 Workspace path 的情况下满足 DSH rc.8 absolute-cwd contract；由 W1 contract 与完整 Desktop fixture 冻结。`DSH_HOME=userData/dsh`、`sessions/` authority、只读 closure 与可写官方 profile materialization 已冻结，不再作为开放设计项。
- 首批纵向 Tool slice 之外的后续领域迁移顺序与每个 domain 的 typed tool contract 冻结范围；W6 按 inventory 逐项推进。
- DSH MCP 官方公开 package/management API 的交付时间，以及 browser/computer MCP contribution 的精确配置与 readiness contract。
- DSH audio/video/document attachment 的公开生命周期与 provider adapter 支持；在此之前产品只承诺图片原生附件和经授权的感知 evidence。
- 完整 Provider/Model、approval、领域 Tool、应用重开与恢复矩阵的执行范围和成本预算；当前仅完成 `nekoapi-chat / gpt-5.6-luna` 的可见 Desktop 双轮基线，不改变其余发布门禁。
