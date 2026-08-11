# Agent Evaluation Evidence

更新日期：2026-08-12

## Evaluation Scope

- 变更：审核固定的 Browser Use / Cua Driver MCP runtime、Automation session policy、Tool
  registration 与 result projection。
- Authoring decision：已创建 `agent-runtime.external-automation` 并进入 coverage index，覆盖 capability Tool
  routing、Tool Call lifecycle、Tool result delivery 与 Desktop event projection。Suite 仅声明未来真实路径的严格
  行为契约；key-free dry-run 不等于 production provider 或用户授权闭环已通过。
- Artifact lifecycle decision：reviewed catalog/receipt validation 与 atomic commit 是 deterministic application
  service policy，由 unit/contract tests 验证；它本身不创建 Agent Evaluation case。只有 concrete Host artifact
  adapter 接入 production Capability 后，才进入下述真实 Agent 行为 Evaluation。
- User-managed local runtime decision：`update agent-runtime.external-automation`。首期 Browser Use/Cua Driver
  runtime source 从未来 managed artifact 收敛为用户明确授权的已安装 runtime。该 source contract、路径/release/
  signature/schema 资格与 changed-runtime invalidation 可由 deterministic tests 证明；但它最终改变 production
  provider registration、Tool routing 与真实进程边界，因此 Browser hidden complete Desktop lane 和 Computer
  visible Desktop lane 仍必须运行。官方安装指南、选择/复查/断开 UI 本身不构成 Agent 行为证据。
- Enable/update-state decision：`reuse agent-runtime.external-automation`。用户可见行为是 disabled extension 即使
  保留 exact accepted permissions 也不注册或执行 Tool，扩权 update 则投影为 disabled + grant required。
  Canonical path 仍是 extension service state -> enabled runtime descriptor filter -> product-owned Capability Tool；
  forbidden path 是把 accepted grant 当作 enabled、从旧 existence-implies-enabled shape 恢复成功或暴露 raw MCP。
  既有 `disabled-and-unknown-automation-tools` failure case 拥有真实 Agent absence 证据，无需新增 suite/case；strict
  state/contract、restart、equal/reduced/expanded update 与 runtime-descriptor absence 由 deterministic tests 补足。
  Production Automation provider 尚未接通，所以该 case 的真实 provider lane仍为 `infrastructure-blocked`。
- Generic adapter-only lifecycle decision：`excluded`。该边界只移除 generic MCP registration/connect/process
  ownership，不增加可进入 Agent 的 operation；launcher poison、sibling generic Tool 调用和 readiness projection
  是可拒绝错误实现的 deterministic path evidence。Automation production Capability 尚未接通，因此当前运行
  real Agent case 只会得到既有 `infrastructure-blocked`，不能证明额外行为。
- Target authorization decision：`excluded`。目标发现、脱敏候选、pending selection coordinator、用户选择、
  选择后 exact revalidation 与一次性 grant 已收敛到 Automation package；Agent Tool schema 不接受模型提交
  `targetKey`。production Desktop 已接通 exact Conversation/Window-bound Main/preload/Renderer selection adapter，
  但 reviewed provider/profile 尚未注册到 production Capability，因此 deterministic contract/poison/UI wiring tests
  能证明路由与信任边界，当前 real Agent case 仍只会验证缺失 provider 基础设施，不能证明真实上游闭环。
- Live Timeline decision：`reuse agent-runtime.external-automation`。现有 Browser/Computer canonical cases 已拥有
  Tool Call lifecycle、Timeline terminal projection 与 Desktop event projection；本轮只把既有 package-owned live
  projection 嵌入 exact Conversation + Tool Call item，不新增 Agent 行为或 Evaluation operation。Agent Webview
  domain-neutral accessory、Automation exact-owner provider 和 Desktop composition 由 deterministic path tests 证明；
  populated Pause/Take over 仍需同一 suite 的 visible Desktop real-provider lane，不能用组件测试冒充。
- Release-input lock decision：`excluded`。固定 release/commit/license、GitHub asset URL/bytes/digest 与本地
  poison 校验，以及 Cua workflow/Cargo/npm/release-log closure facts 属于 deterministic supply-chain evidence；
  first-party Node Cargo lock/source/toolchain facts 和未发布候选使检查器继续拒绝 catalog readiness，不注册 Tool、不启动
  provider，也不改变 Agent 行为。实际 first-party artifact 接入 production Capability 后仍须执行下述 real cases。
- First-party candidate builder decision：`excluded`。deterministic tar/provenance/SPDX validation、poison archive、
  symlink、locked Node receipt/replacement 和 output-overwrite tests 只验证离线 release tooling；receipt 固定
  `catalogReady=false` 并保留 license
  review/signature/qualification blockers，不修改 bundled
  catalog、不安装/启动 provider，也不改变 Tool registration。签名并进入 production qualification 后再由
  `agent-runtime.external-automation` 承担真实行为证据。
- 需要真实 Evaluation 的原因：最终路径会改变 Capability/Tool 注册、permission、Tool Call lifecycle、
  cancellation 和 Desktop event projection。
- canonical path：reviewed extension/provider -> Host-authorized exact user-managed local runtime -> qualification ->
  Automation session -> product-owned Capability Tool -> Tool Registry -> Pi Tool Call -> exact session-owned MCP
  process。Browser Use 还必须绑定独立授权的 exact browser executable；Cua macOS 必须绑定已资格化的
  `/Applications/CuaDriver.app` 与稳定 TCC responsibility chain。
- forbidden path：安装命令执行、`PATH`/recent/default runtime discovery、managed artifact 或 endpoint fallback、
  raw/direct MCP helper、共享 current browser/profile、nested Browser Use Agent、Computer Use fallback、direct turn
  runner、mock provider 或 fixture final text。

## Current Deterministic Evidence

- `scripts/automation-runtime-release-inputs.json` 锁定 Browser Use `0.13.7`、Cua Driver `0.19.2` 六个平台完整
  归档和 MCP SDK `1.30.0`；同时锁定 Cua release workflow/main Cargo lock、npm runtime integrity、payload owners 与
  缓存未命中日志中的 31 个实际 Node crate/release，以及 OpenNeko-owned 53-file source digest、36-package Cargo
  lock、Rust `1.97.1` 和双架构 rebuild inputs。检查器拒绝 moving URL、平台缺项与 poisoned local bytes，并在 provenance、transitive
  license inventory、OpenNeko signature 和 packaged qualification 齐备前持续返回 non-installable。
- Cua Node recipe 要求固定 toolchain、`--locked`、两个 macOS target、固定 patch boundary 与 matching receipt；
  candidate builder 用其输出替换上游 `.node` 后再逐字节确定性封装 exact upstream tar、marketplace metadata、
  SPDX inventory、build inputs 与 contained provenance。正式命令现在强制两个 independent build 的 bytes/receipt
  一致；隔离的 Rust `1.97.1` 双 target 真实运行得到相同 1,569,136-byte binary，SHA-256 为
  `c4e5b70fddbf6ffdd6477a90ea4da5fa3881d99796d9ded9f5faaf3e1039725a`，并把外部 Cargo home 映射到 canonical
  `/openneko/cargo-home`。该离线供应链证据不注册
  Tool；candidate builder 同时要求 SPDX 精确覆盖锁定的 367-package production-only darwin-arm64 identity closure，拒绝缺失、替换、
  重复或未断言 license。两次真实运行已分别产出逐字节一致的 476,482-byte SPDX candidate
  (`sha256:08756f9c17062202d0efeb8b149aece1a105486cbcb13ea80f9f1816d6725a51`) 与 63,911,219-byte contained
  candidate (`sha256:9e3bae3b3358fe0d9ea44007916610e3c5b997360a2146a32349135df2ab63f6`)；二者仍明确标记 unreviewed/not
  catalog-ready。完整 license expression/text 审核、签名和 packaged qualification 完成前仍不是发布或
  Agent readiness 证据。
- 官方 MCP SDK adapter 已覆盖 negotiation、cancellation、annotations、structured content、ordered mixed
  text/image result、malformed Tool isolation 和 sibling availability。
- Automation package 已覆盖 reviewed name/schema/annotation intersection、Browser Use observe allowlist、一次性
  exact session grant、extension enablement、当前 OS permission、target revalidation、single-action approval、
  replay rejection、step budget、sibling session isolation 和 transient image receipt。
- Automation session control 现在由同一 application service 投影 exact Conversation/Run/Tool Call owner、脱敏目标、
  mode/budget、observation/action phase 与 evidence status。Pause/Take over 会中断 session lifecycle signal；provider
  在接管后迟到返回时不会发布 transient receipt 或 Tool success，Agent finally cleanup 不会用 Stop 覆盖 taken-over
  终态。foreign owner command、terminal projection、原始 browser/PID/window/endpoint 字段和 sibling session 影响均有
  deterministic poison test。
- Agent Webview 现在只暴露 domain-neutral Tool Call accessory renderer，并在 canonical Tool Call card 内调用；Automation
  Webview 以单一 provider 订阅 exact Conversation scope，再按 Conversation + Tool Call identity 投影 live control。
  Desktop 已删除 composition-level 浮动卡成功路径。路径测试证明控制只进入 owning Tool Call、sibling/foreign
  Conversation 不渲染、Take over 后控制消失但 Tool Call item 保留，且 Draft -> Session 不重建 Agent Root DOM。
- adapter-only MCP descriptor 现在只由 generic plugin runtime 静态校验，绝不会注册、连接、启动或产生 raw
  Tool；poison launcher
  未产生启动 marker，同时同一 generation 的普通 MCP sibling 成功连接、贡献并执行 Tool。Automation session-owned
  process/endpoint adapter 因此是唯一可创建该连接的 owner。
- Browser Use MCP call 必须携带 opaque `providerSessionId`；两个 Agent session 的调用不会通过隐式共享
  connection identity 路由。
- Desktop Main 已提供 Browser Use contained client factory：复用 canonical official-SDK `StdioMCPClient`，
  qualification 与每个 session 使用独立 HOME/TMP/config/cache/browser-data，cwd 固定到 session directory，
  环境不继承 Host secret，显式 config 不含 LLM，且 realpath 越界/symlink poison 在启动前失败。
- 固定 upstream 审计确认 contained factory 尚未把授权 exact origin/tab 绑定到 direct MCP 新建的空白
  `BrowserSession`；redirect/new-tab policy 也是加载完成/创建后的处置。因此该 factory 证据只证明受控启动，
  不证明真实页面 observe、browse-read 或 interact，三个模式均不得据此注册为 production Capability。
- 每次 Automation action 现在都会重新查询 mode 所需 OS permission 并重校验 exact target；权限丢失或
  target mismatch 只暂停当前 session。一次性 mutation approval 在 Host 调用前消费，失败后不可重放。
- reviewed MCP provider 在 open 时冻结 exact target/mode；Cua Driver `verify_state` projector 拒绝模型声明
  pid/window/session，并从授权 target 注入这些字段。Computer observe 仅保留这一项 reviewed Tool。
- Agent Capability adapter 的参数只包含 reviewed operation arguments、timeout 与 budget；模型提交
  `targetKey` 会在调用 Host 前失败。Automation authorization service 从 exact provider 发现候选，只把脱敏的
  label/origin/domain 或 region 投影给 Host selection port，用户选择后立即重校验同一 target，再签发绑定 exact
  profile/target/mode/timeout/budget/conversation/run/toolCall owner 的一次性 grant。执行后关闭 owned session，
  结果不返回 pid/window/tab；provider 失败不尝试 raw MCP 或另一 provider。
- Automation pending-selection coordinator 以 exact authorization identity 持有 promise，只向匹配的
  Workspace/Conversation 投影候选；错误 owner、未知 target、重复 authorization、Abort 与 dispose 均 fail-local。
  Desktop Main 进一步核对 sender-derived Window、当前 Agent connection、可见 session Surface 与 Conversation；
  preload 的 changed event 不携带 candidate/owner，Renderer 只能重新走 typed list。选择 UI 仅挂载于当前 ready
  Agent session Root，空状态不保留可见 surface，取消只解析当前 authorization。
- transient observation store 使用 byte limit、TTL、exact session/action owner 与 single-consume；可持久化 receipt
  不含 raw screenshot bytes、Host path 或窗口 handle。
- Desktop Cua Driver contained client factory 只允许 macOS observe，当前使用 `mcp --direct` 与 approved bounded
  policy，不继承 Host environment；Windows 和 interact 在 factory boundary 直接 unavailable。新的
  user-managed-local-runtime 决策要求 app daemon/proxy TCC 路径，因此该 factory 只是历史受控启动证据，不能
  直接成为首期 Cua production source。
- bundled catalog source 现在可显示 Browser Use / Computer Use 的审核范围，但 artifact 未就绪时
  `canInstall=false`、`artifact-unavailable`，catalog refresh 不触发下载。
- `@neko/agent-runtime/extensions` 已删除 marketplace package-directory copy 安装路径；installable entry 必须为
  当前 Host platform 提供 reviewed HTTPS artifact。extension application service 向 injected Host port 传递 exact
  operation/package/artifact/staging identity，并在 atomic commit 前逐项核对下载最终 host、size、digest、Ed25519
  key verification、source provenance、build recipe digest、license inventory 与 contained staging realpath。任一项
  不一致只丢弃当前 staging，原安装和 sibling extension 不变。
- Desktop concrete artifact Host adapter 已实现 reviewed HTTPS redirect、streaming size/digest、disk budget、
  Ed25519、tar.gz/ZIP 安全展开、contained provenance/license inventory 校验、operation-owned staging、atomic commit
  与 discard；modified bytes、路径逃逸、大小写碰撞、链接、未知 key 和 provenance mismatch 均有 poison test。
  Production composition 仍显式注入 `available=false`，因为仓库尚无发布公钥和真实签名 artifact；因此 Browser Use /
  Computer Use 保持 `artifact-unavailable`，不会把 adapter readiness 伪装成 artifact availability。
- Extension application service 现在把 install、enable grant 与 reviewed update candidate 分开：既有安装若没有
  grant 始终投影为 disabled 且不贡献 runtime descriptor；catalog 只有显式列出 exact installed package release 的
  `updatesFrom`，当前平台 artifact 可用且 candidate metadata 验证成功时才投影 `canUpdate`。release 字符串仅不等
  不会触发升级或降级，污染候选只关闭该 update，当前 installed runtime 与 sibling 保持可用。
- 安装回执现在分别持久化 reviewed archive SHA-256 与确定性的 installed package-tree SHA-256；后者覆盖 package
  relative path、文件内容和可执行位。每次 catalog read 与 enable 都重新查询当前安装树并与回执核对；enable grant
  仍以独立文件只保存 exact plugin identity 与当时接受的完整 declared permission set。安装树篡改、回执缺字段、grant
  损坏或 accepted/declared set 不一致只让该 extension 保持可见但不贡献 runtime descriptor，已启用 sibling 继续可用。
  MCP connection、OS permission 与 platform qualification 仍由当前 runtime reconcile 查询，不写入 durable grant；重启后
  必须重新提供 readiness facts。旧 prelaunch install state 因缺少 package-tree digest 会原地显示 invalid，不删除、迁移、
  自动修复或伪造 ready。
- `plugin.update` 已贯通 package-owned manager、typed Main/preload/Renderer contract 与双语 Extensions UI。更新只允许
  对已 disable 的 extension 执行；候选在 operation-owned staging 中验证，下载前与 commit 前使用同一 operation
  identity 两次检查 idle。新增的 exact candidate qualification port 针对 staged descriptor 构造隔离且不注册进 Agent
  的 runtime；返回的 close handle 必须在第二次 idle 检查与 commit 前完成。资格失败、candidate close 失败或取消都会
  discard staging 并保留旧 runtime/artifact state；generic qualifier 对 `adapter-only` candidate 不启动 MCP 且显式拒绝。
  commit 失败仍恢复旧 runtime/artifact state，权限集合变化会撤销旧 grant。Ordinary plugin runtime 已按 extension
  identity 拆成独立 MCP Manager child；Agent turn 在执行前冻结 Tool/Skill snapshot，并按 pluginId 投影 exact run owner，
  reconcile 只替换/关闭 changed child。Provider-owned Browser/Cua qualification、authoritative MCP process 的
  pre-commit quiesce/close handoff 与 permission-expansion grant 接受顺序仍未闭环，因此 3.8 保持未完成。
- Extension manager 现在以 Main-owned exact operation 记录 install/update 的 queued、download、verify、commit、
  cancel 与 terminal 状态；Host streaming callback 只回报该 operation 的字节进度。typed Main/preload/Renderer
  contract 可重新投影 operation，取消直接命中 AbortSignal 而不排在 mutation queue 后；首次 repository read 仅清理
  UUID-owned 遗留 staging，保留 authoritative installed sibling。React Root 卸载与重建测试证明 UI 不是任务 owner。
- Desktop Artifact Host 现在对 ZIP/TAR 复用同一固定生产归档策略；磁盘预算包含 reviewed archive、最终展开文件，
  TAR 还额外包含同时存在的 expanded-TAR scratch，再约束 20,000 个 entry、累计展开字节、TAR 声明内容截断、
  跨平台 path/case/hierarchy/link、精确 reviewed HTTPS host 和最多 5 次 redirect。download 与 extraction pipeline
  均绑定 exact operation AbortSignal，拒绝后删除局部 staging。网络 body 中断只允许同一 operation 对同一 final URL
  发起一次 Range/If-Range 续传；续传以 partial file 实际落盘字节为 offset，重新流式哈希该前缀，并要求原 strong ETag
  或标准 Last-Modified、精确 Content-Length/Content-Range 和最终 catalog digest。缺失/变化 validator 或第二次中断
  直接失败，不切换 host/source 或重新完整下载。两文件 35 项聚焦测试已通过；真实 Windows 执行仍未覆盖，因此
  不构成 3.7 完成证据。
- enable/disable/update/remove 使用同一 operation identity 查询 Agent active-turn authority 与 canonical
  `AutomationApplicationService.listOwnedSessions(extensionId)`；Automation session gate 只阻止 exact extension，
  sibling extension 仍可操作。当前 production Automation service 尚无可启动 profile，因此这一 gate 不等于真实
  Browser/Cua session 已接通。
- 用户自管 endpoint 不复用 installed extension record：Automation endpoint management 逐 reviewed connector 保存
  safeStorage-backed authorization，只允许 HTTPS 或 loopback HTTP，并用 official MCP SDK 检查固定 `serverInfo`、
  Tool schema digest 与 annotations。typed UI 只显示脱敏 URL、authorization/health/provider/qualification facts；
  management interface 没有 install/start/update/stop/terminate，因此删除授权不会管理用户服务进程。资格检查与
  session-owned connection 现在复用 exact Host MCP client factory；每次连接都从加密 Host store 解析 exact
  connector/endpoint 配置，核对固定 server identity，过期 identity 或 mismatch 不尝试其他 endpoint、managed
  runtime 或 provider。该 adapter 尚未注册到 production Agent provider，因此不代表真实 Browser/Cua capability 已资格化。
- `user-managed-local-runtime` 当前只有设计决策，尚未实现或产生资格证据。必须新增 Host-owned exact local
  authorization，并分别验证 Browser Use entrypoint/browser executable 与 CuaDriver.app bundle/signature/TCC chain；
  路径、release、digest、signature、server identity 或 Tool schema 变化必须撤销资格。现有 contained client factory、
  endpoint connector、PyPI 包存在或 Cua candidate artifact 均不能冒充这条 source path 已接通。
- production Desktop 已组合独立的 macOS permission management path：list/runtime query 读取当前 Screen Recording
  media access status 与 non-prompting Accessibility trust；只有 exact user request 才为 Screen Recording 打开固定
  System Settings URI，或用 prompting trust query 请求 Accessibility。Input Control 与非 macOS 平台仍为
  `unsupported`。该 deterministic evidence 不绑定 app/window，也不替代真实 TCC fixture 或 target-only qualification。
- 当前源码开发态 Electron 已直接验收用户自管 endpoint 管理面：Browser Use `0.13.7`、Cua Driver `0.19.2`
  两张卡片及未检查/未资格化/未配置 facts 正常显示，Browser Use 配置表单可展开/取消，且没有外部服务 lifecycle
  动作。验收未提交 endpoint/credential 或连接外部服务；因此不构成真实 provider qualification 或 Agent 行为证据。
  首轮图像检查捕获 React StrictMode 提前 dispose runtime，修复后用 StrictMode regression test 与同一路径复验通过。
- 开发态真实 Electron 的 Extensions 页面已由 image-capable Computer Use 直接检查：Browser Use `0.13.7` 与
  Computer Use `0.19.2` 均显示审核范围、声明权限和 artifact unavailable diagnostic，没有安装入口。该检查
  只验证当前 UI 投影，不是 packaged runtime 或 Agent 行为证据。
- 本轮再次以当前源码启动开发态 Electron，直接检查 Extensions 的 Skill 空态与 Browser/Computer catalog 密集态：
  标题、搜索、分段控制、两条 extension facts 均无裁切或重叠。正式 catalog 不可安装，用户路径无法产生 active
  artifact operation，所以进度条/取消按钮的视觉态保持 `infrastructure-blocked`；功能状态由 Desktop IPC、contract、
  manager cancellation 与 Webview remount tests 覆盖，未冒充视觉通过。
- 本轮以同一当前源码的可见 Electron runtime 直接检查 Computer Use 系统权限区：标准窗口与较小窗口均无裁切、
  重叠或不可读状态；Screen Recording、Accessibility 显示本机已授予，Input Control 显示当前构建不可用。进入页面、
  查询状态与滚动均未弹出授权提示。因当前 TCC 已授予且不能在不改变安全状态的前提下重置，真实 request/denial/loss
  UI action 保持 `infrastructure-blocked`；Main/contract/Webview tests 只作为互补证据，不冒充真实 OS action 通过。

## Real Cases

已创建 `agent-runtime.external-automation`，包含 6 个 declarative case：Browser selected-tab observe、observe-only
mutation denial、disabled/unknown Tool、Computer selected-window observe、model-authored pid/window rejection 与 pending
request cancellation。`pnpm test:agent:eval` 已通过 45 files / 304 tests；全量 key-free dry-run 已通过 25 suites /
70 cases。它们验证 schema、suite discovery、coverage ownership、严格 Tool/result/absence assertion 和工作流 authoring，
不构成真实 Agent 行为证据。

`automation-tool-result` strict assertion 现在由 neutral runner 与 Desktop complete-session evaluator 共同消费：要求唯一
成功 Tool result、canonical action/session/evidence shape、精确 profile/目标 label/mode/status/remaining steps、声明的
text/structured/transient-image evidence，并拒绝 session 中额外 pid/window/tab 路由字段、raw image data URL、PNG/JPEG
base64、显式 binary key 和 byte array。Browser/Computer 正向 case 已改用该断言，不再以通用嵌套 subset 匹配冒充
transient receipt 与隐私边界证据。

尚未运行 provider-backed case。以下前置条件仍未满足：

- Desktop 用户首次 session 授权和 target/domain 选择 UI；
- Host-owned user-managed local runtime authorization、changed-runtime invalidation、production client factory
  composition 与真实 session-owned process；
- Browser Use exact Python/MCP entrypoint 与独立 browser executable 的资格证据，以及 CuaDriver.app exact bundle/
  Developer ID/notarization/TCC responsibility-chain 证据；
- 不借助隐藏 `browser_navigate` 的 exact page/session binding，以及 redirect/new-tab 在内容进入页面前阻断的
  固定 upstream 证据；
- production Agent Automation Capability registration 与 qualified provider-backed Tool/Timeline execution；
- user-managed Browser Use runtime/browser executable 和真实 local fixture qualification；
- qualified Cua Driver macOS app/process/window observation path、真实 permission denial/loss request fixture。

因此 5 个需要真实 provider 的 Browser/Computer cases 仍为 `infrastructure-blocked`；disabled/unknown Tool case 已有
可执行 declarative contract，但还未运行 ask/auto provider-backed matrix。当前 Evaluation DSL 只能证明 pending request
的 turn cancellation，不能投影 Automation session takeover 的 authoritative fact；takeover case 保持未完成，不能用
普通 cancellation assertion 冒充。真实运行必须在启动 Desktop 前检查 local-runtime/provider/domain-binding/TCC 资格，缺失时
记录 `infrastructure-blocked`，不得把 Tool 缺失或等待目标选择超时记为行为失败。

Desktop control contract 与 runtime 已具备真实 case 所需的 exact Conversation owner 和 data-free refresh 边界，但
production provider/profile 仍为空，且现有 Evaluation step/assertion 尚未通过用户可操作的 live control 生成 takeover
fact。因此本轮没有新增一个会在 key-free dry-run 中“通过”却不能执行真实接管的 declarative case。

## Residual Risk

- 当前证据不证明 Browser Use 或 Computer Use 已在产品中可用。
- Browser Use `--mcp` 的单 browser session 语义要求每个 Automation session 独占进程；contained client
  factory 与 Capability adapter 已实现，但尚未适配独立授权的本地 Python/MCP entrypoint 与 browser executable，
  exact origin/tab 也未绑定，redirect/new-tab 又是事后处置。在 Host local-runtime authorization、上游
  target/domain 资格与 production composition 全部接通前
  不得注册 Agent Tool。
- Cua Driver 已完成 exact observe schema/profile、target argument injection 和 contained bounded client factory；
  production composition 也已能 non-prompting 查询当前 macOS Screen Recording/Accessibility 状态，并仅在用户显式
  action 后打开 Screen Recording 设置或请求 Accessibility。用户安装 `/Applications/CuaDriver.app` 的 exact
  authorization、app daemon/proxy MCP composition、macOS target-only capture、TCC responsibility chain、
  denial/loss fixture 和输入动作仍未资格化，Windows 保持 unavailable。
- 完成 Capability/UI/Desktop wiring 后必须补一条 visible Desktop + real provider 路径和一条 hidden
  complete Desktop + real provider 路径；deterministic 或 mock 结果不能替代。
