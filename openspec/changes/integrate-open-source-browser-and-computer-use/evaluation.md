# Agent Evaluation Evidence

更新日期：2026-08-10

## Evaluation Scope

- 变更：审核固定的 Browser Use / Cua Driver MCP runtime、Automation session policy、Tool
  registration 与 result projection。
- Authoring decision：`create` `agent-runtime.external-automation`，但只能在真实 Desktop
  Automation Capability、用户授权 UI 和 session-owned process adapter 接通后创建并进入 coverage index。
- Artifact lifecycle decision：reviewed catalog/receipt validation 与 atomic commit 是 deterministic application
  service policy，由 unit/contract tests 验证；它本身不创建 Agent Evaluation case。只有 concrete Host artifact
  adapter 接入 production Capability 后，才进入下述真实 Agent 行为 Evaluation。
- Enable/update-state decision：`excluded`。installed-without-grant、exact `updatesFrom` package-release relation、
  candidate manifest validation 与 `canUpdate` producer/consumer consistency 均为 deterministic catalog/state
  projection；本次没有开放 update 执行或改变 Agent Tool registration。disabled/update 的真实 Agent case 仍由
  `agent-runtime.external-automation` 在 production update/qualification path 接通后创建。
- 需要真实 Evaluation 的原因：最终路径会改变 Capability/Tool 注册、permission、Tool Call lifecycle、
  cancellation 和 Desktop event projection。
- canonical path：reviewed extension/provider -> Automation session -> product-owned Capability Tool ->
  Tool Registry -> Pi Tool Call -> exact session MCP process。
- forbidden path：raw MCP Tool、共享 current browser session、nested Browser Use Agent、Computer Use fallback、
  direct turn runner、mock provider 或 fixture final text。

## Current Deterministic Evidence

- 官方 MCP SDK adapter 已覆盖 negotiation、cancellation、annotations、structured content、ordered mixed
  text/image result、malformed Tool isolation 和 sibling availability。
- Automation package 已覆盖 reviewed name/schema/annotation intersection、Browser Use observe allowlist、一次性
  exact session grant、extension enablement、当前 OS permission、target revalidation、single-action approval、
  replay rejection、step budget、sibling session isolation 和 transient image receipt。
- adapter-only MCP server 在 generic raw exposure 前被整体拒绝；debug exposure 选项不能绕过 server deny。
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
- Agent Capability adapter 已绑定 exact profile、opaque targetKey、mode、timeout、budget 与
  conversation/run/toolCall owner，执行后关闭 owned session，结果不返回 pid/window/tab；provider 失败不尝试
  raw MCP 或另一 provider。
- transient observation store 使用 byte limit、TTL、exact session/action owner 与 single-consume；可持久化 receipt
  不含 raw screenshot bytes、Host path 或窗口 handle。
- Desktop Cua Driver client factory 只允许 macOS observe，使用 `mcp --direct` 与 approved bounded policy，
  不继承 Host environment；Windows 和 interact 在 factory boundary 直接 unavailable。
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
- `plugin.update` 已贯通 package-owned manager、typed Main/preload/Renderer contract 与双语 Extensions UI。更新只允许
  对已 disable 的 extension 执行；候选在 operation-owned staging 中验证，下载前与 commit 前使用同一 operation
  identity 两次检查 idle，commit 失败会恢复旧 runtime/artifact state，权限集合变化会撤销旧 grant。该 deterministic
  闭环不等于 Browser/Cua upstream process qualification。
- Extension manager 现在以 Main-owned exact operation 记录 install/update 的 queued、download、verify、commit、
  cancel 与 terminal 状态；Host streaming callback 只回报该 operation 的字节进度。typed Main/preload/Renderer
  contract 可重新投影 operation，取消直接命中 AbortSignal 而不排在 mutation queue 后；首次 repository read 仅清理
  UUID-owned 遗留 staging，保留 authoritative installed sibling。React Root 卸载与重建测试证明 UI 不是任务 owner。
- enable/disable/update/remove 使用同一 operation identity 查询 Agent active-turn authority 与 canonical
  `AutomationApplicationService.listOwnedSessions(extensionId)`；Automation session gate 只阻止 exact extension，
  sibling extension 仍可操作。当前 production Automation service 尚无可启动 profile，因此这一 gate 不等于真实
  Browser/Cua session 已接通。
- 开发态真实 Electron 的 Extensions 页面已由 image-capable Computer Use 直接检查：Browser Use `0.13.7` 与
  Computer Use `0.19.2` 均显示审核范围、声明权限和 artifact unavailable diagnostic，没有安装入口。该检查
  只验证当前 UI 投影，不是 packaged runtime 或 Agent 行为证据。
- 本轮再次以当前源码启动开发态 Electron，直接检查 Extensions 的 Skill 空态与 Browser/Computer catalog 密集态：
  标题、搜索、分段控制、两条 extension facts 均无裁切或重叠。正式 catalog 不可安装，用户路径无法产生 active
  artifact operation，所以进度条/取消按钮的视觉态保持 `infrastructure-blocked`；功能状态由 Desktop IPC、contract、
  manager cancellation 与 Webview remount tests 覆盖，未冒充视觉通过。

## Real Cases

当前没有创建可执行 suite，也没有运行 provider-backed case。以下前置条件尚未满足：

- Desktop 用户首次 session 授权和 target/domain 选择 UI；
- 发布公钥、真实 signed artifact、installed artifact resolution、contained client factory 的 production composition
  与真实 process；
- 不借助隐藏 `browser_navigate` 的 exact page/session binding，以及 redirect/new-tab 在内容进入页面前阻断的
  固定 upstream 证据；
- production Agent Automation Capability registration、Host authorization target UI 与 Tool/Timeline projection；
- packaged Browser Use artifact 和真实 local fixture qualification；
- qualified Cua Driver macOS app/process/window observation path 与 OS permission fixture。

因此 Browser observe、mutation denial、Computer observe、wrong-target、cancel/takeover、visible Desktop 和
hidden complete-session cases 均为 `infrastructure-blocked`。Key-free harness 与现有全量 suite dry-run 已通过
（44 files / 294 tests；24 suites / 64 cases），只证明 Evaluation schema/discovery/runner readiness。当前不创建
`agent-runtime.external-automation`，因为没有可进入 canonical production path 的 case；用普通 submit case 等待
Tool 缺失只会制造行为失败，而不是对缺失 artifact/permission adapter 的正确 infrastructure block。

## Residual Risk

- 当前证据不证明 Browser Use 或 Computer Use 已在产品中可用。
- Browser Use `--mcp` 的单 browser session 语义要求每个 Automation session 独占进程；contained client
  factory 与 Capability adapter 已实现，但 exact origin/tab 尚未绑定，redirect/new-tab 又是事后处置。在
  verified artifact 发布输入、Host authorization、上游 target/domain 资格与 production composition 全部接通前
  不得注册 Agent Tool。
- Cua Driver 已完成 exact observe schema/profile、target argument injection 和 contained bounded client factory；
  macOS target-only capture、TCC responsibility chain 和输入动作仍未资格化，Windows 保持 unavailable。
- 完成 Capability/UI/Desktop wiring 后必须补一条 visible Desktop + real provider 路径和一条 hidden
  complete Desktop + real provider 路径；deterministic 或 mock 结果不能替代。
