# Browser Use / Computer Use 闭环状态

日期：2026-08-10

> **状态说明（2026-08-20）：** 本文记录旧 OpenNeko Plugin/MCP/Pi 组合的审计快照，不再定义目标执行路径。`replace-pi-with-dsh-runtime-atomically` 接管 DSH MCP contribution、删除旧 runtime 与新 Evaluation；本文的 upstream compatibility、exact target、OS permission、approval 与 evidence 结论仍可作为输入。
>
> **后续处置（2026-08-22）：** canonical
> [`unreachable-automation-management-removal`](../../openspec/specs/unreachable-automation-management-removal/spec.md)
> 约束已删除本文记录的
> Plugin/Automation 专用管理 UI、IPC、preload bridge、Desktop adapter 与 Automation Webview。
> 通用 Extensions 入口只投影 DSH-owned Skill/MCP，不承载 Plugin 或 Automation 专用配置；
> contracts/node 安全规则仅作为 retained kernel 保留，当前没有 Desktop 产品消费者。

事实来源：2026-08-10 当前代码、已归档的 `integrate-open-source-browser-and-computer-use` OpenSpec、固定 upstream release 与本地 deterministic tests。

## 结论

以下结论描述 2026-08-10 的旧页面快照，不是当前 Extensions 行为。当前 Skill/MCP catalog 不伪造 Browser Use / Computer Use 条目；只有 DSH profile 中真实存在且可证明 readiness 的 MCP contribution 才能进入投影。当前状态仍不能表述为“Browser Use 或 Computer Use 已可用”。

```text
已完成：contracts -> policy service -> reviewed MCP provider -> Agent Capability adapter
       -> package-owned exact target authorization -> Conversation/Window-bound selection UI/IPC
       -> contained Browser/Cua launch factory -> transient receipt -> honest catalog state

仍阻塞：first-party reproducible artifact -> signed packaged install/update
       -> production provider/profile registration -> real process composition
       -> visible/hidden Desktop evaluation -> capability ready
```

## 已完成的仓库内闭环

| 层         | 当前事实                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP        | official SDK 是唯一 protocol adapter；保留 annotations、structured content、ordered mixed text/image、`isError` 与 cancellation                                                                                                                                                                                                                                                                                                                           |
| Policy     | exact provider/release/profile/target/mode/budget/session owner；每次 action 重查 OS permission 与 target；single-action approval 不可重放                                                                                                                                                                                                                                                                                                                |
| Provider   | provider session 冻结 exact target/mode；Cua `verify_state` 的 pid/window/session 由 Host-owned projector 注入，模型不能覆盖                                                                                                                                                                                                                                                                                                                              |
| Browser    | `0.13.7` observe 五 Tool reviewed allowlist；每 session 独立 HOME/TMP/config/cache/browser data；只启动 `browser-use --mcp`，无模型凭据和 host secret。direct MCP 尚未把授权 exact origin/tab 绑定到新建空白 session，因此这里只是受控启动骨架，不是可用 observe 证明                                                                                                                                                                                     |
| Computer   | `0.19.2` macOS observe profile 仅 `verify_state`；只启动 `cua-driver mcp --direct`，`bounded` policy 只允许 exact app window observation；独立 target-discovery client 仅允许固定 schema 的 `list_apps/list_windows`，组合 running bundle/PID 与当前 Space exact visible window/bounds，并用同一事实源重校验；disconnect 删除各自 HOME/TMP/policy；其他 mode/OS fail-visible                                                                              |
| Agent      | Capability adapter 不接受模型提交 targetKey；Automation 从 exact provider 发现候选，只投影脱敏选择信息，用户选择后立即重校验并签发 exact target/grant；pending selection 由 package coordinator 按 Workspace/Conversation 隔离，Desktop 以 sender Window + 当前 Agent connection + 可见 session Surface + Conversation 校验 typed list/resolve；绑定 conversation/run/toolCall，执行后关闭 owned session，无 provider fallback；结果不投影 pid/window/tab |
| Privacy    | screenshot bytes 复制进有 TTL、byte limit、exact session/action owner、single-consume 的 transient store；receipt 不含像素和 Host path                                                                                                                                                                                                                                                                                                                    |
| Extensions | bundled catalog source 列出两项，但 artifact 未满足时 `canInstall=false`、`artifact-unavailable`，刷新不会下载                                                                                                                                                                                                                                                                                                                                            |
| Endpoint   | 用户自管 Browser Use/Cua connector 已有独立的 safeStorage-backed authorization、HTTPS/loopback transport validation、MCP server identity、reviewed Tool schema qualification、typed IPC 与双语 UI；资格检查与 session-owned connection 复用 exact Host client factory，过期 endpoint/server identity 直接失败且不 fallback；OpenNeko 不管理用户服务进程，尚未注册 Agent provider                                                                          |
| Permission | production Desktop 已组合独立的 macOS permission management path：列表只查询 Screen Recording/Accessibility 当前事实且不弹窗；用户显式操作后才打开固定 Screen Recording 系统设置页或发起 Accessibility trust request；Input Control、Windows/Linux 与真实 OS fixture qualification 仍为 unavailable                                                                                                                                                       |

## Extensions 展示决策

- Browser Use 与 Computer Use 应展示：两者已有固定 upstream release、审核 profile、扩展包 identity 和明确的发布门禁。当前只能显示为不可安装的 `unsupported` / `artifact-unavailable`，不得出现安装、启用或“已支持”入口。
- 剪映/CapCut、Photoshop、ComfyUI、Blender、Unity 等目前不应作为支持项进入 Extensions：仓库只有 integration 架构方向，尚无对应扩展包、精确 operation contract、平台/应用 release qualification 和 round-trip 证据。
- 通用 Computer Use 是一种显式 transport，不等于对任意桌面应用的扩展支持。某个专业工具只有在贡献了具体 handoff、API/MCP 或逐应用资格化的 Computer Use operation 后，才能以自己的扩展 identity 展示。
- 如果未来要展示 roadmap，应使用与“可安装扩展”分离的产品面，不得复用 `unavailable` 伪造一个尚不存在的包。专业工具的长期边界见 [`../architecture/adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md`](../architecture/adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md)。

## Upstream 与下载来源决策

- Browser Use 使用 [`browser-use/browser-use`](https://github.com/browser-use/browser-use)，固定 `0.13.7` / commit
  `f0aa3a8bb03779c71a5aa262d389e3bfe6b77cdc`。2026-08-10 核对时该 GitHub Release 没有 binary asset；自动生成
  的 source tar/zip 不是自包含 runtime，不能直接写成 installable catalog artifact。该源码也没有 resolver lock；
  虽然 `pyproject.toml` 固定了直接依赖，OpenNeko 仍须生成并审核 Python、native wheel 与 Chromium 的完整闭包。
- Computer Use 当前使用 [`trycua/cua`](https://github.com/trycua/cua) Cua Driver，固定
  `cua-driver-rs-v0.19.2` / commit `20bb34b16ad7c6c56221c332e46b1875e9d8af8c`。上游 GitHub Release 有
  macOS/Windows/Linux platform assets 与 checksums。`darwin-arm64` tar 已按 64,208,172 bytes 和
  `sha256:c30a81f6b5cfd44d40653f7549d7d714b445e9cbd0ed012c4c524f1c43d2872b` 实际复核；其中 CLI 有 Cua
  Developer ID 签名、App bundle 有 stapled notarization ticket，但这不替代 OpenNeko contained provenance、完整
  license inventory、OpenNeko artifact signature 和真实 target-only 产品资格。
- Cua 的 main CLI、cursor CLI 与 UniFFI SDK 使用仓库内 `Cargo.lock`，但 `cua_driver_node_runtime.node` 由
  `uniffi-bindgen-react-native@0.31.0-3` npm 源码复制到临时 Cargo workspace 后以未锁定的 `cargo build` 生成；该 npm
  包不含 `Cargo.lock`。上游 release run `31217509888` 的 macOS job 缓存未命中，日志可证明实际编译了 31 个
  crate/release，但日志不是依赖 lock，无法提供完整 graph/checksum/feature provenance。2026-08-10 重新解析已出现
  `cc 1.4.1` 到 `1.4.2` 的漂移，因此不能用当前 resolver 输出替代已发布 payload 的 SBOM。
- Browser Use、Cua Driver 各平台资产与 MCP SDK 的 exact release/commit/license/integrity 已进入
  [`../../scripts/automation-runtime-release-inputs.json`](../../scripts/automation-runtime-release-inputs.json)。
  `pnpm check:automation-runtime-inputs` 只验证发布输入并 fail-visible 输出剩余门禁，不生成 catalog 可安装事实。
- Cua `darwin-arm64` 已有 deterministic first-party candidate 封装器：它验证 exact upstream bytes，拒绝 link、
  不完整/重复 SPDX package 与覆盖既有输出，保留全部 native/App 签名 payload，并内嵌 installer 要求的
  provenance/license digest。Node runtime rebuild 另有 first-party recipe，固定 npm 53-file source tree、36-package
  Cargo lock、release Rust `1.97.1`、双架构 target、`SOURCE_DATE_EPOCH` 和 patch boundary，并强制 `--locked`。
  Candidate assembly 现在必须校验该 rebuild receipt 并替换上游 `.node`。此前使用上游 `.node` 的约 63.9 MB
  smoke candidate 已被新 recipe digest 淘汰；它只曾证明 CLI/App signature 可穿过封装，不能发布。正式 Node
  rebuild 命令现强制两个 independent build 的 bytes/receipt 完全一致；真实 Rust `1.97.1` 双 target 构建已通过，
  输出 1,569,136 bytes，`sha256:c4e5b70fddbf6ffdd6477a90ea4da5fa3881d99796d9ded9f5faaf3e1039725a`。
  Main/Node Darwin production-only 依赖锁定为 367 个唯一 package identity；candidate SPDX 必须精确覆盖该集合，不能用单包
  placeholder 通过结构校验。
- [`injaneity/pi-computer-use`](https://github.com/injaneity/pi-computer-use) `v0.5.0` / commit
  `c838d3a2ed6352fd7b4fb3ecd7a4ebd5692e1399` 为 MIT 且与 OpenNeko 使用同一 Pi fork family，但其入口直接注册
  Pi Tools、npm `postinstall` 安装 helper，并拥有自身配置、权限和 state/session。当前不直接采用，避免第二套
  Tool/安装/授权路径；未来只能评估不加载 extension entry 的底层 provider adapter。
- 当前 managed artifact 下载线使用固定 GitHub Release URL；也允许未来使用固定官方下载 URL，但二者执行同一
  size/digest/signature/provenance/license/host redirect contract。用户自行安装和运行的服务属于第三种 connector
  路径：OpenNeko 只验证并连接 endpoint，不下载、安装、启动、更新或终止用户进程。三种来源不得互相 fallback。
- 用户自管 connector 当前固定核对 Browser Use MCP `serverInfo=browser-use/0.1.0` 与 Cua Driver MCP
  `serverInfo=cua-driver/0.19.2`，再使用对应 reviewed profile 的 Tool schema digest/annotation 规则资格化。URL、
  authorization header value 和 credential 留在 Desktop Main；资格检查与 session-owned connection 每次都按 exact
  connector/endpoint identity 从加密 Host store 解析配置，Renderer 只见脱敏 readiness。过期 identity 或 server mismatch
  不会尝试同名 endpoint、managed runtime 或其他 provider；移除授权不会停止外部服务。

## 仍未完成的发布门禁

1. Browser Use 缺少从固定 source/dependency/Chromium 构建并发布的 OpenNeko first-party 自包含 artifact、完整
   SBOM/license inventory 和发布签名；Host 侧签名/完整性/安全展开与 poison tests 已实现，但不能替代真实发布输入。
2. Browser Use direct MCP 首次调用创建空白 session，当前没有不借助隐藏 navigation Tool 的 exact origin/tab
   binding；上游 redirect/new-tab 又在加载完成/创建后才处置，`observe` 真实页面与 `browse-read` / `interact`
   domain gate 均未资格化。
3. Cua Driver 的 immutable first-party Node rebuild、双构建一致性门禁与 candidate replacement recipe 已实现，
   Rust `1.97.1` 双架构真实构建也已完成。仍缺审核完成的 license inventory、OpenNeko artifact signature、TCC
   responsibility chain、target-only capture 与真实 fixture qualification；可复现 compiler output 不能代替完整
   candidate、签名或 packaged qualification。
4. Extension remote artifact 的 streaming download、disk/archive limits、atomic update、Main-owned progress、exact
   cancel 与 restart staging cleanup 已实现并通过 deterministic tests；同 artifact bounded resume、candidate process
   qualification、runtime/profile/download/data 分离删除仍未完成，且缺少 signed release 输入时 production 保持
   `artifact-unavailable`。
5. Desktop 已组合用户自管 endpoint 的 authorization/health/schema 管理 UI、exact session-owned Host connection adapter，
   以及显式 macOS Screen Recording/Accessibility permission management action；列表与安装不请求权限，Screen Recording
   只打开固定系统设置页，Accessibility 只在用户点击后请求。Cua managed-runtime 已增加与 session 隔离的 exact
   app/window discovery/revalidation adapter，package-owned authorization 也已完成候选脱敏、显式选择、选择后 exact
   revalidation 与一次性 grant 语义；exact Conversation/Window-bound Renderer target selection adapter 与可见选择 UI
   也已组合。package-owned live control、takeover-safe provider abort、exact Conversation/Tool Call-bound IPC 与
   Pause/Resume/Stop/Take over 已通过 domain-neutral accessory slot 嵌入 exact Agent Tool Call Timeline item，原浮层
   success path 已删除。仍缺
   endpoint/managed-backed Agent Tool registration、真实 populated control UI 与 TCC/target-only fixture qualification。
6. `agent-runtime.external-automation` 的 visible Desktop 与 hidden complete-session real-provider evaluation 尚未执行；Windows/Linux 保持 unavailable。

本次完成了开发态真实 Electron Extensions 页面验收：受管 catalog 中 Browser Use `0.13.7` 与 Computer Use
`0.19.2` 均可见，展示审核范围、权限和“此构建尚未发布已审核的运行时制品”，且没有安装按钮；用户自管区域同时显示
Browser Use `0.13.7` 与 Cua Driver `0.19.2` 的未配置卡片，Browser Use 配置表单可展开/取消且没有外部服务生命周期
动作。独立的 Computer Use 系统权限区在标准与较小窗口中均显示 Screen Recording、Accessibility 与 Input Control
事实；本机前两项为已授予，Input Control 为当前构建不可用，进入页面和滚动检查均未触发系统提示。验收未保存
endpoint/credential、连接外部服务或改变系统权限。由于当前 TCC 状态已授予，真实 request button/denial/loss 路径
仍保持未执行；该证据只验证 fail-visible catalog/management UI，不替代 packaged artifact、真实 endpoint/provider
qualification、OS permission fixture 或 Agent Evaluation。

上述历史门禁记录见 [`integrate-open-source-browser-and-computer-use/tasks.md`](../../openspec/changes/archive/2026-08-21-integrate-open-source-browser-and-computer-use/tasks.md)。缺少外部 artifact、签名/notarization 身份、真实 OS grant 或 runner 时必须报告 `infrastructure-blocked`，不得用 mock、raw MCP 或开发机临时安装替代发布证据。
