# Automation 领域

Automation 负责把审核固定的浏览器或桌面控制 provider 收敛为 OpenNeko 唯一 Agent Tool Call 路径中的有界能力。它不实现浏览器控制、截图、OCR、键鼠注入、VLA 或第二套 Agent loop；具体机械能力由固定 release 的 Browser Use 与 Cua Driver MCP runtime 提供。

## Owner 与包

| Owner                         | 稳定职责                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `@neko/automation-contracts`  | provider/profile、exact target、session grant、mode/budget、action trait、approval、evidence 与 diagnostic 的 L0 canonical shape               |
| `@neko/automation-node`       | reviewed Tool/schema/annotation 交集、session 生命周期、step budget、目标与权限重校验、单动作 approval、MCP provider wrapper、瞬态 observation |
| `@neko/agent-runtime`         | 将 qualified Automation operation 适配为普通 Capability Tool，并绑定 conversation/run/toolCall owner；不暴露 raw MCP Tool                      |
| Extension application service | bundled catalog、制品安装/更新、enable grant、accepted permissions 和运行资格投影                                                              |
| Desktop Main                  | 下载/进程/窗口/TCC/资源的 concrete Host adapter 与 typed IPC；不拥有 Automation policy                                                         |
| Renderer                      | 展示扩展状态、授权选择和现有 Tool Call/Timeline 投影；不接收真实路径、secret、pid/window handle 或持久截图字节                                 |

## Canonical path

```text
signed first-party extension catalog
  -> explicit delivery source (managed artifact or user-managed endpoint)
  -> explicit install when managed, then enable grant
  -> qualified provider/profile
  -> Agent Capability Tool
  -> canonical Tool Registry / Pi Tool Call / Approval
  -> exact Automation session and target
  -> one session-owned upstream MCP process or external endpoint connection
  -> transcript-safe evidence projection
```

同一意图只有这条成功路径。Automation extension 的 MCP server 必须使用 `adapter-only` exposure；unknown Tool、changed schema、contradictory annotation、disabled extension、失效 target 或 OS permission 都使当前 operation/session fail-local，不得改走 generic MCP、另一 provider 或 Computer Use fallback。

通用插件 runtime 只允许静态校验 `adapter-only` descriptor，不得注册、连接、启动或投影其 raw Tool；进程或
endpoint connection 只能由 exact Automation session owner 创建和释放。普通 MCP 插件保持通用 lifecycle，
两者不共享 connection 或进程 owner。

## Runtime 交付方式

| 方式                    | 安装与启动职责                                                 | 约束                                                                                                             |
| ----------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| GitHub Release 固定资产 | OpenNeko 下载、验证、安装；Automation session 启动包内 runtime | 固定 release URL、允许的 GitHub/CDN host、size/digest/signature/provenance/license；禁止 `latest` 与在线安装脚本 |
| 官方固定下载            | 与 GitHub 使用同一 verified artifact contract                  | 只允许审核的官方 origin/CDN；“官方”不跳过签名、内容和平台资格校验                                                |
| 用户自托管 endpoint     | 用户安装并运行；OpenNeko 只检查并调用接口                      | Host 保存 endpoint authorization/credential；session 只拥有连接，不管理用户进程                                  |

三种方式由用户与 catalog/profile 精确选择，不形成 try-next。用户 endpoint 不可用时不自动下载或启动本地
runtime；managed runtime 失败时不连接 recent/default endpoint。Browser Use / Computer Use 当前 managed
交付线使用固定 GitHub Release 下载地址；在真实自包含资产、digest、签名、SBOM 与资格证据发布前，catalog
仍保持 `artifact-unavailable`。

Managed update 由 Extension application service 唯一编排。候选只在 operation-owned staging 中通过一个精确
qualifier port 检查；成功资格化返回必须在第二次 ownership-idle 检查和原子 commit 前关闭的 candidate runtime
handle。普通 Skill/MCP 插件可以使用隔离且不注册进 Agent 的 generic qualifier；`adapter-only` Automation 候选
必须由 Browser Use 或 Cua Driver provider qualifier 处理，generic qualifier 不启动其 MCP server 并直接拒绝。
资格、关闭或取消失败只 discard 当前 staging，不能替换 authoritative runtime 或尝试另一 delivery source。

Extension grant state 使用一个严格 canonical document 分别保存 `enabled` 与 `acceptedPermissions`。Disable
只撤销运行资格并保留用户已接受的精确集合；disabled extension 即使 grant 仍为 accepted 也不得贡献 runtime。
候选声明等于或缩减时，update 只保留候选仍声明的 accepted 集合；新增权限时清空 acceptance 并保持 disabled。
旧的“grant 文件存在即 enabled”内部 shape 不兼容读取，而是将当前记录局部投影为 `state-invalid`，保留安装事实
和修复入口。扩权候选在执行资格化前取得单独用户接受的交互顺序仍属于 3.8 未完成边界。

ordinary plugin 资源已拆成 extension-owned child runtime；reconcile 复用未变化 child、只替换目标 child，并继续
通过唯一 Workspace Tool Registry / Pi Tool Call 路径投影。Agent turn 冻结 exact Tool/Skill snapshot，并按
pluginId 暴露 run owner，不再用任意 active turn 阻止无关 extension mutation。更新事务仍需补 authoritative MCP
process 的 pre-commit quiesce/close handoff；不能把 commit 后的 child disposal 冒充该门禁。

`AutomationProviderIdentity.deliverySource` 将该选择冻结到 profile、session grant 与 provider registry key。
用户 endpoint 在该 identity 中只携带 Host 签发的 opaque `endpointId`；URL、authorization 和 credential
不得进入 Agent contract。来源不一致时 exact provider 视为 unavailable，不尝试同名 provider 的其他来源。

用户自管 endpoint 的管理闭环由 Automation package 单独拥有，不复用 installed extension facts：

- `@neko/automation-contracts/endpoint-management` 定义严格的配置输入、脱敏 readiness projection 与 typed
  Host request；URL 禁止 user-info、query 和 fragment，只允许 HTTPS 或 loopback HTTP。
- Desktop Main 将 Browser Use / Cua Driver connector 的配置逐项写入 safeStorage-backed `HostSecretPort`；Renderer
  只接收 normalized URL、是否已配置授权、health、MCP provider identity 和 Tool schema 资格状态，不接收 header value。
- 资格连接与 session-owned 连接复用同一个 official-SDK Streamable HTTP MCP client factory；每次连接都按 exact
  `connectorId + endpointId` 从 Main 的加密 secret store 读取配置，逐项核对握手 `serverInfo`、固定 upstream 对应的
  MCP server release、reviewed Tool schema digest 和 annotation policy。过期 endpoint identity、单个损坏记录、离线
  endpoint 或 schema drift 只拒绝当前连接，不尝试其他 endpoint、managed runtime 或 provider。
- 该 management service 只暴露 `list/configure/remove authorization`，没有 install/start/update/stop/terminate 接口。
  删除配置只移除 OpenNeko 保存的 endpoint authorization，不触碰用户拥有的服务进程。

当前该闭环建立了 connector 配置、资格事实和可由 exact Automation session 独占的 Host connection adapter；尚未把该
adapter 注册到 production Agent Capability/provider path。Browser Use/Cua 的真实 Agent session 调用仍须满足各自
target/domain、OS permission 与 packaged/real-provider qualification 任务，不能因 endpoint 可连接就标记 capability ready。

Release tooling 通过 `pnpm prepare:automation-runtime-artifact` 生成 Cua Driver `darwin-arm64` first-party
candidate。它只接受 input lock 中 exact bytes/digest 的上游 tar、结构有效的 candidate SPDX inventory，以及
`pnpm prepare:automation-runtime-cua-node` 产生且 receipt 完全匹配的 first-party Node runtime；上游归档内未锁定的
`.node` 会被替换。其余上游签名 CLI、
App 与 native payload，加入 contained plugin metadata、build inputs、provenance 和 license digest，并产生
deterministic tar.gz receipt。Input lock 也记录了上游 release workflow、Rust workspace lock、两种 macOS target、
payload owner、Node runtime npm integrity，以及缓存未命中的 release log 中 31 个实际编译的 crate/release。Node runtime
来自 `uniffi-bindgen-react-native@0.31.0-3` 的独立临时 Cargo 工程；上游 npm 包未发布 `Cargo.lock`，构建命令也未使用
`--locked`，因此 OpenNeko 固定 53-file source digest、36-package first-party Cargo lock、release Rust `1.97.1`、
双架构 target、`SOURCE_DATE_EPOCH` 与 patch boundary，只为自己的 `--locked` rebuild 建立 provenance，绝不归因于
上游旧二进制。正式 rebuild 命令固定 build identity/Mach-O metadata 并要求两个 independent build 的 bytes/receipt
完全一致；Rust `1.97.1` 双 target 真实执行已产出 1,569,136-byte binary，SHA-256 为
`c4e5b70fddbf6ffdd6477a90ea4da5fa3881d99796d9ded9f5faaf3e1039725a`。Assembly receipt 固定为
`catalogReady=false`，并保留完整 transitive inventory 人工审核、OpenNeko artifact signature 与 packaged
qualification 三项 blocker。Candidate SPDX 必须精确覆盖锁定的 367-package production-only Darwin main/Node identity closure，
但 identity 完整不替代 license expression/text 人工审核；全部门禁关闭后输出 facts 才能进入随应用发布的 catalog。Browser Use 必须先由独立 closure build 产出
固定 Python/native/Chromium payload，不能把 GitHub source archive 传给该封装器。

## 授权与数据边界

Install confirmation、enable grant、当前 OS permission、exact session grant 和 mutation approval 是不同 authority，互不替代。Session grant 绑定 provider/release、profile、target、mode、timeout、step budget 与 conversation/run/toolCall owner，消费一次后即使上游启动失败也不得重放。

Desktop production composition 已接入独立的 macOS permission management path。列表与运行前检查只查询当前事实：
Screen Recording 使用 media access status，Accessibility 固定调用 non-prompting trust query；两者都不会在安装扩展
或进入 Extensions 时弹出系统提示。只有用户显式操作对应权限项后，Screen Recording 才打开固定的 macOS 隐私设置
页面，Accessibility 才调用 prompting trust request；输入控制、Windows 和 Linux 仍返回 `unsupported`。该 path 由
Automation package 拥有状态、action 与 diagnostic contract，Desktop 只实现 TCC/System Settings adapter 和
sender/window/Extensions-scene 授权。它仍不替代 exact target/window 绑定、TCC responsibility chain 或真实 OS fixture
qualification。

Computer target 的窗口事实不由 Electron 或 OpenNeko 自建的 active-window/title matcher 产生。
`@neko/automation-node` 通过短生命周期 Cua target-discovery client 严格锁定固定 release 的 `list_apps` 与
`list_windows` schema，将 running bundle/PID 与当前 Space 的可见 exact window/bounds 组合为 Host target，
并用同一来源重校验。Desktop managed-runtime adapter 为该 client 创建独立 HOME/TMP 和 bounded policy，只允许
这两个 metadata Tool；session client 仍只允许 `verify_state`。零尺寸/非当前 Space 窗口不会成为候选，schema
变化、PID/bundle 替换或 exact window 消失会局部失败，不会改选前台、最近或同标题窗口。

目标选择由 `@neko/automation-node` pending-selection coordinator 持有，按 exact authorization identity 与
Workspace/Conversation 过滤。Desktop Main 只在 sender-derived Window、当前 Agent connection、当前可见 session
Surface 和 Conversation 全部匹配时允许 list/resolve；preload 的 generic changed event 不携带候选或 owner，Renderer
必须重新通过 typed IPC 查询。选择 Root 只随当前 ready Agent session 挂载，空状态不显示，取消只结束当前
authorization。该 UI/IPC 闭环本身不改变 capability readiness；production provider/profile 注册和真实资格化仍是独立门禁。

live session control 同样由 `AutomationApplicationService` 唯一拥有。package 只按 Conversation 投影仍为
`active/paused` 的 session，并把 command 再绑定到 exact Conversation/Run/Tool Call owner；Renderer 只能看到
provider release、opaque target key、target label、mode、remaining budget、observation/action phase、evidence status
与当前允许的 Pause/Resume/Stop/Take over，不接收 delivery endpoint、browser profile/tab、PID、window id 或 region。
Pause/Take over 会先撤销产品侧执行 authority 并中断当前 provider signal；迟到的 provider result 不得再成为 Tool
success 或 screenshot evidence。Main/preload 的 changed event 仍为空事件，且 list/control 必须通过 sender Window、当前
Agent connection、可见 session Surface 与 Conversation 校验。控制 Root 随该 Agent Surface 卸载，不建立第二个
session catalog 或隐藏 React Root。Agent Webview 只提供 domain-neutral Tool Call accessory slot；Desktop 把
Automation package-owned projection 按 exact Conversation + Tool Call identity 嵌入现有 Timeline item，且不再
挂载浮动控制卡。真实 populated provider-backed Desktop 验收仍属于发布资格与 Evaluation 门禁。

Agent 参数不得携带 `targetKey` 或任何 browser/app/window routing 字段。Automation authorization service 从
exact provider 获取有界候选，只向 Desktop selection port 投影脱敏的 label/origin/domain 或 region；用户显式选择后
立即用同一事实源重校验，成功才签发绑定 exact target 与 Tool Call owner 的一次性 grant。完整 target 只存在于
Main/Automation runtime。Tool result 和 transcript 可保留 Tool action/session identity、profile、opaque targetKey、
label、mode、budget、状态和 evidence，但不投影浏览器或 OS handle；截图像素进入一次性 owner-bound transient
receipt，过期、消费或 owning runtime 显式 release 后不可复用。Provider session 可以在 Tool 执行后关闭，receipt
必须保留到消费或 TTL 到期。

## Provider 基线

- Browser Use 固定 `0.13.7`，首个 `observe` reviewed profile 只允许 `browser_get_state`、`browser_get_html`、`browser_screenshot`、`browser_list_tabs`、`browser_list_sessions`。明确拒绝 `--cli-mcp`、`browser_exec`、`browser_extract_content`、nested upstream Agent、隐式 cloud、文件和未知操作。该 allowlist 不是 readiness：direct MCP 的空白 session 尚未与授权 exact origin/tab 绑定，redirect/new-tab 仍是事后处置，真实 observe、`browse-read` 与 `interact` 在资格化前保持 unavailable。
- Computer Use 固定 Cua Driver `0.19.2`。macOS 首个 profile 只审核 exact window `verify_state` observation，Host 注入 pid/window/session，bounded policy 只允许该 Tool，且要求当前 Screen Recording permission。Interact、Windows 和 Linux 在逐项资格化前保持 unavailable。

`injaneity/pi-computer-use v0.5.0` 已作为候选审计，但当前不直接采用：其 package 直接注册 Pi Tools、通过
`postinstall` 安装 helper，并拥有自己的 config/permission/state/session 与 browser surface。直接加载会形成
第二套 Tool、安装和授权路径。只有未来能把其底层 bridge 作为窄 provider adapter 复用、且不加载 extension
entry、不执行 postinstall 时，才重新评估；当前 Computer Use provider 仍为 Cua Driver。

平台/制品/实机资格状态不是稳定架构事实，见 [`../../status/browser-computer-automation-2026-08-10.md`](../../status/browser-computer-automation-2026-08-10.md)。实施约束与剩余任务见 [`../../../openspec/changes/integrate-open-source-browser-and-computer-use/`](../../../openspec/changes/integrate-open-source-browser-and-computer-use/)。
