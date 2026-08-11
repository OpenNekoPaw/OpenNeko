## Context

当前生产链路是：

```text
installed OpenNeko plugin
  -> plugin MCP config
  -> hand-written MCP client/manager
  -> ToolRegistry
  -> Pi Tool Call
```

它已经证明插件 Skill/MCP Tool 可以动态进入每个 Agent Workspace，但仍有四个阻塞：MCP contract 不
保留 annotations；混合文本/图片结果可能丢图；stdio command 必须已经位于插件目录；marketplace
只有随包目录复制，没有 runtime artifact 安装和 enablement。Computer Use 还额外需要 OS 权限、精确
目标绑定、用户接管和截图隐私边界。

### Upstream baseline

本设计在 2026-08-09 审计以下开源上游，不复制其控制实现：

| Dependency  | Audited source                                                                              | License                                              | Reused boundary                                             |
| ----------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Browser Use | `browser-use/browser-use` tag `0.13.7`, commit `f0aa3a8bb03779c71a5aa262d389e3bfe6b77cdc`   | MIT                                                  | `browser-use --mcp` direct browser tools                    |
| Cua Driver  | `trycua/cua` tag `cua-driver-rs-v0.19.2`, commit `20bb34b16ad7c6c56221c332e46b1875e9d8af8c` | MIT; optional dependencies retain their own licenses | `cua-driver mcp` bounded native desktop tools               |
| MCP SDK     | npm `@modelcontextprotocol/sdk@1.30.0`                                                      | MIT                                                  | stdio/Streamable HTTP client, negotiation and result codecs |

2026-08-10 的 release 资产核对结果：Browser Use `0.13.7` 没有 GitHub Release binary asset，不能把
GitHub 自动生成的 source archive 当作可安装 runtime；Cua Driver `0.19.2` 提供 GitHub Release platform
assets 和 checksum，但仍须满足 OpenNeko 的 contained provenance、license inventory、签名与平台资格门禁。
当前 managed runtime 交付线使用固定 GitHub Release asset URL；若上游资产不能满足完整 contract，则由
OpenNeko 从固定 source/dependency 可复现构建并发布到 OpenNeko GitHub Releases，而不是在用户机器安装依赖。
Exact upstream input lock 由 `scripts/automation-runtime-release-inputs.json` 拥有，记录 Browser Use、Cua Driver
六个完整平台归档和 MCP SDK 的 release、commit、license、URL、bytes、digest/integrity；检查器拒绝 `latest`、
平台缺项、重复 target、错误 host/path 与 poisoned local archive。Browser Use 仓库没有 resolver lock，因此固定
direct dependency 不等于完整 Python/native/browser closure。Cua `darwin-arm64` tar 的真实下载已通过 bytes/digest
复核，内部 CLI 为 Cua Developer ID 签名、App bundle 有 stapled notarization ticket；这些上游签名事实不能替代
OpenNeko 二次封装的 contained provenance、完整许可清单、artifact signature 或产品资格证据。

Cua macOS release 的 `cua-driver`、`cua-cursor-theme` 与 `libcua_driver_sdk.dylib` 来自仓库内 locked Rust
workspace 的 arm64/x86_64 build 后 lipo；`CuaDriver.app` 复用前两个 universal executable。独立的
`cua_driver_node_runtime.node` 则来自 npm-locked `uniffi-bindgen-react-native@0.31.0-3` 源码，但其 runtime
Cargo workspace 不携带 `Cargo.lock`，上游脚本也未对该 build 使用 `--locked`。Input lock 记录 exact workflow/hash、
main Cargo lock、npm integrity、payload owner，以及 release run `31217509888` 缓存未命中日志中的 31 个实际 crate/release；
该日志足以发现 resolver drift，却不能证明上游已发布二进制的完整 graph/checksum/features。OpenNeko 因此不再复用
该 `.node`：first-party release recipe 固定 npm runtime 的 53-file source tree、36-package Cargo lock、release 使用的
Rust `1.97.1`、两个 macOS targets、`SOURCE_DATE_EPOCH` 和 Electron RustBuffer patch boundary，并强制 `--locked`。
Release recipe 还固定 build root/path remap、外部 Cargo home 到 `/openneko/cargo-home` 的映射、Mach-O install name、单 build job/codegen unit、locale，并移除
Mach-O UUID；正式命令必须连续完成两个 independent build，只有产物 bytes 与完整 build receipt 均相同时才输出。
2026-08-10 使用隔离的官方 Rust `1.97.1` 工具链已得到两份相同的 1,569,136-byte universal binary，SHA-256 为
`c4e5b70fddbf6ffdd6477a90ea4da5fa3881d99796d9ded9f5faaf3e1039725a`。这些事实只建立 OpenNeko 自己的
canonical rebuild provenance，不把后来解析结果伪装成上游二进制 provenance。

Cua `darwin-arm64` first-party candidate 先由
`scripts/automation-runtime-cua-node-rebuilder.mjs` 生成锁定的 universal Node runtime，再由唯一 assembly recipe
`scripts/automation-runtime-artifact-builder.mjs` 产生。Assembly 只接受 input lock 中 exact filename/bytes/digest 的
上游 tar 和结构有效的 candidate SPDX 2.3 inventory；SPDX packages 必须与 macOS 三个 main root 加 first-party Node
runtime 计算出的 367-item production-only locked identity closure 完全一致，并拒绝重复 identity、仅由 dev edge 引入的 crate 与未断言 license。它安全解析
普通文件/目录，拒绝 link、unexpected root、case collision、
缺失 launcher/native/App payload、无效 Node rebuild receipt 和既有输出覆盖，并用 first-party `.node` 替换上游副本。
输出以稳定 USTAR order/mode/mtime 和规范化 GZIP header
封装 marketplace metadata、全部上游 CLI/App/native bytes、contained build inputs、artifact provenance 与 license
digest。Receipt 始终声明 `catalogReady=false`，并保留 transitive license 人工审核、signature 与 qualification
blockers；recipes 不持有发布 key，
不修改 catalog，也不启动任何 runtime。Browser Use 使用同一最终 artifact contract，但在 Python/native/Chromium
closure 与完整 license inventory 准备完成前没有可交给封装阶段的 payload。

同日真实 release-tooling 运行从 exact main/Node Cargo locks 以隔离 HOME、crates.io 预取缓存和
`cargo metadata --locked --offline` 生成两份逐字节一致的 367-package SPDX 2.3 候选（476,482 bytes，
SHA-256 `08756f9c17062202d0efeb8b149aece1a105486cbcb13ea80f9f1816d6725a51`），并组装两份逐字节一致的
`darwin-arm64` contained artifact（63,911,219 bytes，SHA-256
`9e3bae3b3358fe0d9ea44007916610e3c5b997360a2146a32349135df2ab63f6`）。SPDX document 与 artifact receipt
仍分别声明 `reviewed=false`、`catalogReady=false`，所以这些只是可复核候选，不是可安装发布。

2026-08-12 重新评估交付边界后，首期不再以 OpenNeko 托管 artifact 为 Browser/Cua 可用性的前置条件。
PyPI 的 `browser-use==0.13.7` wheel/sdist 可以作为用户安装或未来可复现构建的固定输入，但它不是包含
Python、native dependencies 与浏览器 executable 的自包含产品 artifact。Cua 上游官方安装器则把签名、公证的
`CuaDriver.app` 安装到 `/Applications`，以建立稳定的 macOS TCC responsibility chain。两者首期统一建模为
`user-managed-local-runtime`：用户/上游拥有安装、更新和卸载，OpenNeko 只拥有精确授权、资格检查与当前
Automation session 启动的子进程。上述 first-party candidate/release tooling 证据继续保留为未来 managed
artifact 交付准备，但不再阻塞该首期路径，也不得成为本地运行时失败后的回退。

[`injaneity/pi-computer-use`](https://github.com/injaneity/pi-computer-use) `v0.5.0`
（commit `c838d3a2ed6352fd7b4fb3ecd7a4ebd5692e1399`，MIT）也完成了候选审计。它是直接注册
`@earendil-works/pi-coding-agent` Tools 的 Pi extension，npm package 通过 `postinstall` 安装 native helper，
并拥有自身 config、permission、state/session 与 browser CDP surface。直接加载会绕过 OpenNeko 的
product-owned Automation wrapper、安装禁执行与 exact session authority，因此本变更不选择它作为直接
Computer Use 插件。未来只有在底层 bridge 能通过窄 Automation provider port 复用、且不加载其 Pi extension
entry、不执行 postinstall、不建立第二套状态/授权路径时，才可通过独立 spike 重新评估；当前仍使用 Cua Driver。

Browser Use 的 `--cli-mcp` 暴露任意 Python execution；`--mcp` 还包含可启动上游自治 Agent 的操作。
两者都不能原样全部注册。OpenNeko 只允许审核后的 direct browser Tool 集，并拒绝嵌套 Agent、任意代码、
任意文件和隐式 cloud browser。Cua Driver 使用 `bounded` permission mode；禁止
`--dangerously-bypass-approvals`。

## Goals / Non-Goals

**Goals:**

- 通过开源 upstream MCP runtime 交付 Browser Use 和 Computer Use，不开发替代控制引擎。
- 让 Tool traits、structured image result、permission、approval 和 evidence 进入唯一 Pi Tool Call path。
- 支持小 catalog 随应用打包；首期连接用户明确授权的已安装 runtime，未来可选 managed artifact 仍需显式
  安装。启动 Agent 或打开 Extensions 不触发任何安装。
- Browser Use 默认隔离 profile；Computer Use 绑定精确 app/process/window，且能 Pause、Stop、Take over。
- 每个插件、server、session、Tool Call 和目标 fail-local；无关 Agent/Workspace 保持可用。
- 逐 upstream release、OS/arch 和能力等级资格化，未验证组合保持 unavailable。

**Non-Goals:**

- 自研 Playwright/CDP browser controller、OCR/VLA、截图或键鼠注入引擎。
- 把 Browser Use 或 Computer Use 实现成第二套 Agent loop、TaskManager、conversation 或 transcript。
- 本变更不实现 Play-use、Game Activity、seat/control lease、VLA 或多人游戏。
- 自动登录、绕过验证码、密码管理器读取、后台隐蔽操作、任意 shell/code execution。
- 在 MCP/API 失败后自动尝试 Computer Use。
- 为 Windows/Linux 声明产品支持；平台支持只由真实 OpenNeko release 和 qualification evidence 决定。

## Five-layer analysis

| Layer          | Decision                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Upstream/user owns local runtime installation lifecycle; upstream owns browser/desktop mechanics; Automation owns session/target/action/evidence policy; Agent owns Tool Call; Extension service owns package/enablement and runtime-source reference; Desktop owns exact path/process/OS trust adapters. |
| Dependency     | Automation contracts are L0; Node application service depends on contracts and injected ports; Agent consumes Automation Tool contributions; Renderer and upstream packages never import each other. |
| Interface      | Exact extension, source kind, authorized runtime/browser executable, upstream release, session, target, action trait, approval and evidence are explicit; `PATH`, active browser/app/window and recent runtime are never implicit authorities. |
| Extension      | Another reviewed browser/desktop MCP can implement the same narrow provider port only through explicit user selection; registry lookup is exact and never first-compatible or try-next.              |
| Testing        | Codec/package policy uses deterministic tests; capability routing requires complete Desktop + real model; browser/desktop actions require real upstream runtime and platform fixtures.               |

## Decisions

### 1. Official MCP SDK replaces the hand-written transport

`@neko/agent-runtime/mcp` remains the product owner of server registration, connection lifecycle, Tool projection
and fail-local diagnostics, but delegates protocol mechanics to the official SDK. The current handwritten stdio/HTTP
JSON-RPC client is deleted atomically after all callers and tests move.

The canonical MCP projection preserves:

- Tool `name`, `description`, `inputSchema` and standard annotations;
- ordered text, image and supported embedded/resource content blocks;
- `isError`, cancellation, progress and safe server diagnostic;
- server-returned protocol negotiation and capabilities.

Annotations are untrusted upstream metadata, not permission authority. The effective action trait is the strict
intersection of reviewed extension policy, any present upstream annotation and runtime session mode. A missing hint
cannot widen the reviewed policy; an explicit contradiction makes the Tool unavailable or more restrictive. Browser
Use `0.13.7` supplies no Tool annotations, so its fixed OpenNeko profile remains the sole action-trait authority.

Mixed text/image results remain ordered. Screenshot bytes use an authorized transient content projection; Pi receives
the current observation, while persistent transcript stores a redacted receipt, target identity, digest, dimensions,
retention decision and diagnostic rather than raw screen pixels. A later turn cannot silently reuse expired bytes.

### 2. Extension install, trust and enablement are separate authorities

For the first delivery, extension package trust/enablement and Automation runtime source are separate authorities. The
reviewed Browser Use and Computer Use catalog entries ship as metadata and policy, while the user explicitly authorizes
an already-installed local runtime. OpenNeko stores a Host-owned reference to the exact provider/runtime identity and
validates its release, executable identity, platform signature where applicable, MCP server identity and reviewed Tool
schemas before readiness. It does not own installation, update or uninstall of those files.

```text
bundled reviewed catalog/profile
  -> UI shows upstream release, permissions, runtime requirements and official installation guide
  -> user installs or updates with the upstream-owned mechanism outside OpenNeko
  -> user selects/authorizes the exact local runtime (and exact browser executable for Browser Use)
  -> Host checks path/release/signature/MCP identity and Tool schema without PATH discovery
  -> extension remains separately disabled until the user accepts the exact capability set
  -> exact Automation session starts and terminates only its own child process
  -> qualified / missing / invalid / changed / needs-permission / unsupported
```

The catalog shipped inside the signed OpenNeko application is the only catalog authenticity
root. Every entry contains display metadata, supported platform coordinates, reviewed upstream release, permission
declaration and runtime-source requirements. A managed-artifact entry additionally contains an exact HTTPS artifact
location, byte size, digest, signature identity, provenance and license inventory; a user-managed-local-runtime entry
contains only reviewed installation-guide metadata and qualification requirements. The catalog does not contain large
Python/browser/native runtime payloads. Refresh only rereads this application-owned catalog and never replaces
catalog records from the network. Publishing new catalog entries or package releases therefore requires an OpenNeko
application release; a remotely mutable signed catalog requires a separate OpenSpec with publisher-key ownership,
rotation, revocation and rollback rules.

Display metadata keeps one canonical default description and may declare locale-keyed description localization inside
the plugin interface metadata. The extension service validates and projects that metadata through the existing catalog
contract; it does not resolve a Window locale or create a translated catalog authority. The Agent Webview selects the
exact current locale and otherwise displays the canonical default description. Invalid locale keys or localization
records invalidate only that plugin manifest. Search, grid/list rows and configuration details consume the same
resolved description.

The following managed-artifact lifecycle is retained for a future optional delivery source; it is not a prerequisite or
fallback for the first-delivery local-runtime path:

```text
bundled reviewed catalog
  -> UI shows publisher/release/platform/size/licenses/declared permissions
  -> user confirms Install
  -> Host checks space and downloads exact platform artifact to contained staging
  -> streaming size/digest, signature, SBOM, license and archive-containment validation
  -> static launcher/runtime inventory validation without executing package code
  -> atomic rename into OpenNeko install root
  -> installed but disabled
  -> user selects Enable and accepts the exact declared capability set
  -> Host queries applicable OS permission and starts the exact MCP runtime
  -> isolated runtime qualification, reviewed Tool discovery and policy wrapping
  -> ready / needs-permission / partial / error / unsupported
```

For managed artifacts, install, enable, disable, update and remove are explicit operations. Opening Agent, opening Extensions, refreshing the
catalog or selecting a Skill never installs dependencies. There is no post-install `curl`, shell, `pip`, `uv`, `npm`
or browser download on the user machine. Release tooling builds platform archives from pinned upstream dependencies;
the installed package contains the executable/runtime/browser payload required by its manifest.

Download and extraction remain inside a newly created operation-owned staging directory under the install root. The
installer enforces the catalog byte size, free-space check, streaming digest, decompressed size/file-count limits,
path containment, duplicate/case-colliding paths, symlink/hardlink rejection and platform-specific unsafe file forms.
HTTPS redirects cannot leave the reviewed artifact host. Cancellation, disk exhaustion, network failure, verification
failure or application restart removes only that operation's staging directory and leaves the installed package
unchanged. A bounded resume is permitted only for the same catalog artifact identity, digest and server validator; it
does not select a mirror, `latest` release or alternate package.

Only one plugin release is authoritative at a time. Update downloads and validates a staging candidate while the old
release remains authoritative. Candidate qualification runs in isolation, never registers Tools into Pi and terminates
before commit, but only after the exact update and any permission expansion have been accepted. The commit occurs only
when Agent turns, extension-owned MCP processes and automation sessions are all inactive. A failed pre-commit candidate
is deleted and does not create a fallback runtime path. On Windows, replacement also waits for the exact executable
process handles to close; failure is visible and never triggers elevation.

The extension application service invokes candidate qualification through one exact injected port. A successful
qualification returns an operation-owned close handle, and commit is impossible until that handle has terminated the
candidate runtime and the service has repeated the ownership-idle check. The generic plugin qualifier may build an
isolated, unregistered Agent plugin runtime for ordinary Skills/MCP contributions; it rejects `adapter-only`
Automation candidates without starting their MCP server. Browser Use and Cua Driver updates therefore require their
provider-owned qualifier rather than falling through to generic MCP qualification.

Production `AgentPluginRuntime` partitions ordinary plugin resources into extension-owned child runtimes, each with its
own MCP Manager and exact close handle. The aggregate is a read-only projection over those children: it flattens Skills,
Tools and readiness into the existing single Workspace Tool Registry/Pi path and does not introduce a second Tool
registration route. Reconciliation fingerprints each extension contribution, reuses unchanged children, preflights all
Workspace registries, swaps only changed Tools/Skill roots, then closes only replaced children. Initial MCP server-id
conflicts become local readiness errors without starting either conflicting child; a changed candidate that conflicts
with an authoritative sibling is rejected and its isolated resources are discarded.

Each queued/running Agent turn records the exact extension contribution set available at enqueue and unions the exact
set captured when execution begins. Execution also freezes one Tool and plugin-Skill snapshot before its first await.
Extension mutation ownership therefore queries `pluginId -> run identity` rather than a global active-turn boolean, and
the two reconciliation idle checks reject only changes whose child is owned by one of those turns. A sibling child added
after the turn snapshot can be reconciled without changing that turn's Tool/Skill path. The remaining task 3.8 process
gap is the repository transaction boundary: an authoritative extension-owned MCP process still needs an explicit
pre-commit quiesce/close handoff before replacement, in addition to provider-owned Browser/Cua candidate qualification.

An update confirmation is bound to the exact candidate package release. An identical or reduced declared permission
set may retain the existing enable grant after the explicit update; any added Tool, action class, environment secret,
network scope, OS capability or data access invalidates enablement for the candidate until the user separately accepts
the expanded set. The candidate cannot run to discover or request expanded permission before acceptance.

Enablement and permission acceptance use one strict canonical grant-state document with independent `enabled` and
`acceptedPermissions` facts. Disabling writes `enabled=false` without discarding an exact accepted permission set, and
never contributes a runtime descriptor. After update, a candidate whose declarations are a subset of the previously
accepted set stores exactly the candidate declarations; an expansion stores no accepted permissions and remains
disabled. The prelaunch shape that inferred enablement from document existence is rejected as `state_invalid`; the
installed record remains visible and non-runnable, with no dual-read or silent trust-state repair.

The extension application service owns durable installed artifact identity, package release, verified digest,
provenance, enablement and accepted declared permission set. Download progress and staging ownership are operation
facts. MCP connection, installed-byte integrity, OS permission and platform qualification are current queried facts,
not durable claims. `ready` is a projection of these independent facts and never becomes a second authority.
Install/update download is an extension-service-owned background operation with an exact operation identity, not a
React component lifecycle. Leaving Extensions does not cancel it or keep the scene mounted; reopening projects current
progress, and only explicit cancellation or application shutdown applies the recorded cleanup/resume policy.

Authorization is layered and non-substitutable:

| Layer                | Authority                                             | Scope and lifetime                                                                                 |
| -------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Install confirmation | Extension service + explicit user action              | Exact package release/platform/size/license; one operation                                         |
| Enable grant         | Extension service + explicit user action              | Exact declared capability set; durable until revoke or permission expansion                        |
| OS permission        | Operating system queried by Host                      | Current Screen Recording/Accessibility/Input fact; never inferred or persisted as truth            |
| Automation session   | Automation application service + explicit user action | Exact profile/domains or app/process/window/region/mode/budget; bounded lifetime                   |
| Mutation approval    | Canonical Pi Tool Call                                | Current target and effect; one action unless a reviewed bounded session policy says otherwise      |
| Hard block/takeover  | Reviewed Automation policy                            | Secrets, payment, secure OS surfaces and other non-delegable actions; not approvable by model text |

Observation is not treated as harmless: browser HTML and screenshots or a desktop-window screenshot require an initial
session authorization for their exact target. Repeated reviewed observations may run within that session scope without
per-frame confirmation. Initial `interact` delivery provides no permanent or cross-session allow; approval UI names the
current target, affected data/effect, mode and remaining budget. Target facts are validated before presenting approval
and again immediately before input, so approval cannot survive a target change.

Plugin/upstream release numbers are third-party/package facts and remain required. No `schemaVersion`,
`contractVersion`, internal generation field or version-dispatch registry is added.

Runtime 接入支持四种显式来源，但同一个 provider/profile 只选择其中一个，不按失败顺序试探。首期 Browser
Use 与 Cua Driver 只启用 `user-managed-local-runtime`；其他来源保持独立、可选且未经完成不得宣称可用：

| Delivery source             | OpenNeko responsibility                                                                                                                        | Runtime owner                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| user-managed local runtime  | 不安装、不更新、不卸载；保存 exact local authorization，检查路径/release/signature/MCP identity/schema，并只启动/终止 session-owned child      | 用户/上游拥有安装文件；OpenNeko Automation session 拥有其子进程   |
| fixed GitHub Release asset  | 下载 exact release asset，限制 `github.com` 与审核后的 release CDN redirect host，验证 size/digest/signature/provenance/license 后安装         | exact Automation session 启动安装包内 runtime                     |
| fixed official download     | 下载 exact vendor release asset，限制官方 origin/CDN，执行与 GitHub 相同的完整验证；“official” 不降低门禁                                      | exact Automation session 启动安装包内 runtime                     |
| user-managed endpoint       | 不下载、不安装、不更新、不启动；只保存 Host-owned endpoint authorization，检查 transport/auth、provider identity、Tool schema 与 qualification | 用户拥有服务进程；exact Automation session 只建立并关闭自己的连接 |

GitHub 与官方下载都属于 managed artifact，不是两套安装协议。Catalog 必须固定完整 HTTPS URL、最终允许主机、
byte size、digest 和 provenance，不允许 `latest`、源代码归档、在线 package manager 或 install script。用户自托管
endpoint 属于 connector；用户管理本地 runtime 属于 local authorization。两者都不得显示 managed artifact
install/update/remove 状态。OpenNeko 只可打开官方安装指南或复制说明，不得执行 `pip install`、`uv tool install`、
`curl | shell` 或上游 installer。任何来源不可用时都不得自动选择 managed runtime、recent/default endpoint、
`PATH` 命令或另一处本地安装。四种来源都必须经过同一 reviewed profile、session
grant、Tool schema/annotation intersection、target revalidation、approval 与 evidence 路径。

The canonical contract adds `{ kind: 'user-managed-local-runtime'; runtimeId: string }`. `runtimeId` is an opaque
Host-authorization identity, not a raw absolute path and not a release generation. The Desktop Host resolves that exact
authorization through the existing path/OS authority boundary and returns current executable, release, digest and
signature facts. Browser Use's authorization owns two required exact assets (the Python/MCP entrypoint and browser
executable); Cua's macOS adapter resolves the fixed system application location rather than persisting
`/Applications/CuaDriver.app` as package/domain data. A changed resolution invalidates only that runtime authorization.

### 3. Automation is a package-owned capability

New packages use the existing family pattern:

```text
@neko/automation-contracts (L0)
  -> profile/session/target/action/evidence/diagnostic

@neko/automation-node (L1)
  -> AutomationApplicationService
  -> BrowserAutomationProviderPort
  -> ComputerAutomationProviderPort
  -> ExtensionRuntimePort / SessionGrantPort / HostPermissionPort / TransientObservationPort
  -> AutomationMcpRuntimePort
```

`AutomationApplicationService` is the sole session and policy owner. It does not perform DOM queries, screenshots or
input itself. `apps/neko-desktop` supplies platform download/process/window/permission/resource adapters and wires the
first-party extension providers. Electron objects, paths, credentials and window handles never cross preload.

The session grant authority is an injected trust-boundary port. A grant is issued only from explicit user action and is
consumed once by Automation after extension and current OS-permission checks but before upstream launch. It binds the
exact session, provider/upstream release, browser profile/domain set or computer target, mode, timeout, step budget and
conversation/run/toolCall owner. Launch failure does not make the grant reusable.

Target routing is never a model-authored Tool argument. The package-owned authorization service discovers bounded exact
candidates from the selected provider, projects only redacted labels/origin/domain or window bounds to a Desktop
selection port, accepts one explicit user selection, and immediately revalidates the same target facts before issuing
the one-time grant. Cancellation, stale authorization identity, missing/duplicated target, changed bounds or changed
provider/profile fails the current Tool Call without choosing an active, recent, title-matched or alternate target.
Desktop owns only the user-interaction and trust-boundary adapter; it does not own selection or grant semantics.

Pending selection promises are owned by an Automation coordinator keyed by exact authorization identity and filtered by
Workspace plus Conversation. Desktop Main accepts list/resolve only after the sender-derived Window, current Agent
connection, current visible Agent Surface and session Conversation all agree. The generic changed event carries no
candidate or owner facts; an authorized Renderer re-queries through typed IPC. Leaving or replacing the exact Agent
Surface unmounts the selection Root, and no focused/active Window, recent Conversation or first candidate is inferred.

`AutomationMcpRuntimePort` owns the upstream process and connection per Automation session. Tool calls, target
revalidation and close use the opaque `providerSessionId`; there is no shared current Browser Use connection across
Agent sessions. Candidate Tool inspection uses an isolated qualification runtime and cannot register raw Tools into Pi.

The Agent adapter wraps approved upstream MCP operations as ordinary Pi Tools. It asks the Host authorization port to
resolve the explicitly selected target, then freezes session, target, mode,
step/time budget and permission policy at Tool Call start, revalidates mutable target facts before state-changing
actions, delegates exactly once to the selected upstream MCP server and returns structured evidence. It never tries a
second provider or raw MCP Tool after failure.

Automation contributions do not use generic raw MCP exposure. A Tool enters Pi only after exact provider ownership,
reviewed name/schema, action trait, session mode and upstream annotation have been resolved into the product-owned
wrapper. Unknown, contradictory or newly discovered Tools are unavailable even when the Agent is in `auto` mode; asking
the user cannot convert an unreviewed Tool into an allowed Tool.

### 4. Browser Use uses the upstream direct MCP surface

The first delivery accepts an exact user-authorized Browser Use Python environment/entrypoint and an independently
authorized browser executable. These are two exact Host authorities rather than one shared runtime root: a valid PyPI
package or virtual environment does not authorize an arbitrary installed browser, and a browser application does not
authorize a command found on `PATH`. Qualification freezes the reviewed Browser Use release, resolved entrypoint bytes,
browser executable identity and MCP server/Tool schema. Each Automation session starts only `browser-use --mcp` through
the session-owned lifecycle. The generic plugin runtime may validate its `adapter-only` descriptor but never registers,
connects or starts that server. A future managed Browser artifact may contain the pinned Python/native/browser closure,
but it is a separate delivery source and not a fallback.

Initial modes are explicit:

| Mode          | Allowed semantics                                                                                                | Disallowed semantics                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `observe`     | only `browser_get_state`, `browser_get_html`, `browser_screenshot`, `browser_list_tabs`, `browser_list_sessions` | navigation, model-backed extraction, click, type, close, autonomous agent |
| `browse-read` | observe plus navigation, back, scroll and tab switching inside allowed domains                                   | form/input mutation, click, close, download/upload                        |
| `interact`    | reviewed direct click/type/tab/session operations with action-level traits and approval                          | arbitrary code/files, autonomous retry agent, hidden provider fallback    |

The default session creates an isolated managed browser profile and an explicit domain allowlist. Connecting an existing
user profile is a separate user action with stronger privacy disclosure; it is not inferred from an installed Chrome or
active tab. New domains outside the approved set pause the Tool Call and request user action or fail visibly.

The upstream browser boundary must enforce authorized top-level navigation, redirects and newly opened tabs before page
content reaches Pi. `file:` and external application protocols are blocked; localhost/private-network targets require
an explicit session scope rather than being inferred from the current page. If the qualified upstream release cannot
enforce these constraints, the affected mode remains unavailable instead of adding an OpenNeko browser controller.

`browser-use --cli-mcp`, `browser_exec`, `browser_extract_content`, `retry_with_browser_use_agent`, implicit
cloud/browser-use API selection and any upstream Tool outside the reviewed allowlist are rejected during runtime
composition. The Browser Use process receives no model-provider or model API credential. OpenNeko's main Pi model
remains the only planning and page-understanding Agent and analyzes the returned state, HTML and screenshot itself.
Its real user `HOME`, general host `PATH`, browser profiles and configuration directories are not inherited. Host creates
extension/session-scoped home, temporary and browser-data directories and launches the exact authorized entrypoint with
the exact authorized browser executable. The process working directory is the newly created session directory rather than the runtime, so
Browser Use cannot load a runtime-adjacent `.env`; Host writes an explicit Browser Use config with an empty `llm` set,
the exact browser path and the authorized domain set. Existing user profiles remain unsupported in the first delivery;
downloads and uploads remain disabled in the first
delivery.

### 5. Computer Use uses Cua Driver with exact target binding

The first macOS delivery accepts only the user-installed `/Applications/CuaDriver.app` whose exact bundle identifier,
Developer ID/Team ID, notarization state, reviewed release and MCP Tool schemas pass qualification. OpenNeko starts the
upstream-supported `cua-driver mcp` daemon/proxy path in bounded mode through that stable application responsibility
chain. The current `mcp --direct` path attributes TCC to the spawning host and is not production-qualified unless a
separate test proves an equally stable OpenNeko-owned responsibility chain; raw `serve`, unsigned helpers and arbitrary
CLI paths are unavailable. On Windows,
the extension remains unavailable until the OpenNeko Windows product and signed Cua artifact pass real tests.

Selecting or qualifying the local runtime never requests OS automation permission. On macOS, an explicit Grant OS Permission action after
enablement requests Screen Recording for observe and only the Accessibility/Input permissions proven necessary by the
qualified driver for interact. The Host queries TCC state before each session and reacts to revocation locally. On
Windows, initial qualification uses a standard-user process without installing a service/driver or requesting
elevation; elevated applications, UAC secure desktop, lock screen and higher-integrity targets are unsupported. If a
future upstream release requires a privileged service or driver, that is a separate installation and trust-boundary
change.

Each session binds:

- extension and upstream release identity;
- owning conversation/run/toolCall identity;
- Desktop application instance;
- exact OS application/process/window identity;
- allowed capture window or region;
- `observe` or `interact` mode;
- action traits, timeout, step budget and evidence retention.

Observe permits only bounded app/window enumeration, target state and target-window screenshot. Interact adds reviewed
click/type/shortcut/scroll/drag operations. Before every input, Host revalidates process/window and user-activity state.
Window closure, process replacement, target mismatch, lock screen, permission loss or user takeover pauses the session.
Resume requires rebind; no active/recent window fallback exists.

Window discovery and revalidation reuse the fixed Cua Driver platform Tools rather than an Electron/CGWindow/active-window
implementation in OpenNeko. A short-lived target-discovery client admits only the reviewed `list_apps` and
`list_windows` schemas under a bounded metadata-enumeration policy. OpenNeko joins the exact running bundle/PID fact to
the exact visible current-Space window id and positive bounds, issues an opaque `targetKey`, and re-reads the same two
upstream facts for session revalidation. Schema drift, PID/bundle replacement, window disappearance and geometry change
fail visibly; the adapter never substitutes another title-matched, foreground or recent window. The broader Desktop
metadata scope exists only in the explicit selection client and does not widen the session client, Agent Tool allowlist
or screenshot scope.

Target-only capture is a qualification invariant. An upstream path that captures the full screen and crops it afterward
does not qualify, because unrelated pixels have already crossed the capture boundary.

Password entry, secrets, permission dialogs, installers, file overwrite/delete, publish/upload, payment and other
sensitive actions are blocked or require user takeover according to the reviewed policy. Upstream success text or input
injection is not mutation evidence; qualified write capability additionally requires target-specific observation or a
durable result.

### 6. UI exposes readiness and live control, not feature claims

Extensions displays separate facts for installed, enabled, dependency integrity, MCP connection, OS permission and
platform qualification. `ready` requires all facts applicable to the selected capability. Install success alone never
marks Browser Use or Computer Use ready.

Agent Timeline uses the existing Tool Call item and adds an automation session projection containing target label,
mode, budget, current observation/action phase, evidence status and `Pause`, `Stop`, `Take over`. It does not create a
global Activity catalog or retain a hidden React root. Closing the Agent UI does not transfer the Tool Call to another
conversation; a protected active Tool may continue only under its exact runtime owner.

The live projection is package-owned and contains only provider release, opaque target identity and label, mode,
remaining budget, phase, evidence status and exact conversation/run/toolCall owner. Browser profile/tab, process/window,
region and user-managed endpoint identity remain outside Renderer. Lists are filtered by exact Conversation; commands
also carry the exact Run and Tool Call owner. Desktop accepts list/control only after sender-derived Window, current
Agent connection, visible session Surface and Conversation agree. Changed events are data-free and require a fresh
authorized query. Pause and Take over revoke product execution authority and abort the in-flight provider signal before
late results can be projected as success; Agent-owned cleanup preserves an already terminal Take over state.

### 7. Failure and data boundaries

- Invalid catalog/artifact affects one extension record; installed siblings remain usable.
- An invalid installed package remains visible with its original package facts, an invalid diagnostic and explicit
  reinstall/remove actions; it is not hidden, auto-repaired or overwritten. A catalog outage never hides installed
  records.
- Invalid Tool schema/annotation affects one Tool; other Tools from the same connected server remain when independently
  valid.
- MCP process failure terminates owned sessions and returns a diagnostic; it does not fall back to another transport.
- Expired screenshot handles affect one observation; transcript/catalog remain accessible.
- Disable/remove is rejected while the exact extension owns active sessions; the user must Stop or Take over first.
- Removal uses trash and never deletes browser profiles, downloads or external application data without a separate,
  explicit data action. Runtime removal and extension-data removal have different confirmations and operation owners.
- Credentials required by an extension are resolved by Host secret owners and exposed only as allowlisted process
  environment values; the full Desktop environment and real user home are never inherited. Each runtime receives only
  scoped home/temp/data locations and exact authorized executable paths. Browser Use requires no model credential, so its
  process environment explicitly excludes model-provider and model API credentials.

## Evaluation plan

The Agent Evaluation skill requires a new suite because the coverage index has no owner for external browser/computer
automation. Authoring decision: `create` suite `agent-runtime.external-automation`; update the coverage index mapping for
`capability-tool-routing`, `tool-call-lifecycle`, `tool-result-delivery` and `desktop-event-projection` without routing
unrelated capabilities to this suite.

Minimum real cases:

| Case                       | Canonical evidence                                                                                       | Forbidden fallback                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Browser observe            | enabled extension, exact authorized local runtime/browser, MCP server/Tool receipt, allowed domain, structured text/image result | PATH discovery, managed fallback, internal browser controller, nested Browser Use Agent, arbitrary exec |
| Disabled/unknown Tool      | disabled extension or poisoned unreviewed Tool stays absent from Pi in ask and auto modes                | raw MCP exposure, user-confirmation bypass, annotation-only grant     |
| Browser interaction denied | mutating Tool reaches approval and denial terminal state, no page mutation                               | annotation-only permission, automatic retry or Computer Use           |
| Computer observe           | qualified signed CuaDriver.app/TCC chain, OS permission, exact pid/window, target screenshot receipt     | direct/raw helper, active-window inference, full-screen capture, mock image |
| Computer target mismatch   | revalidation pauses/fails exact session while sibling conversation remains usable                        | recent/foreground window fallback                                     |
| Cancel/takeover            | exact Tool/session reaches terminal cancellation and upstream resources release                          | generic Task cancellation or background input after takeover          |

Deterministic tests own marketplace codecs, checksums, allowlists, annotation intersection, result block preservation,
path containment and unsupported platform. Real Agent behavior requires hidden complete Desktop + real provider. The
Computer Use positive path additionally requires visible Desktop, real OS grants and a real fixture app; unavailable
platforms report `infrastructure-blocked` rather than passing with a mock. The foundational conversation matrix is
reviewed as unaffected except Tool result delivery, cancellation, projection and conversation isolation, which receive
focused regression coverage.

## Risks / Trade-offs

- **User-managed runtime drift**: bind exact path/release/signature/schema and invalidate qualification when any fact
  changes; never scan `PATH` or substitute another installation. This reduces packaging lead time but makes upstream/user
  installation health a visible prerequisite.
- **Large future managed runtime downloads**: keep artifacts out of the core application and download only on explicit
  install; show exact size before confirmation.
- **Upstream supply-chain drift**: pin release/source, checksum, license inventory and build recipe; no `latest` or
  install script execution.
- **Upstream signature is not product qualification**: for user-managed local runtime, preserve and inspect vendor
  signing/notarization but also require exact release/MCP/platform tests. A future managed source additionally requires a
  separately sealed OpenNeko artifact plus contained provenance, complete license inventory and packaged runtime tests.
- **Candidate is not a release**: deterministic sealing emits a non-installable receipt; catalog publication separately
  requires a reviewed complete SPDX inventory, OpenNeko artifact signature and packaged qualification evidence.
- **Annotations are incomplete**: reviewed OpenNeko policy can only restrict upstream traits, never relax them.
- **Browser GET requests can have side effects**: `browse-read` is separate from strict `observe`, and domain changes
  require explicit authorization.
- **Screenshot privacy**: target-only capture, transient bytes, redacted durable receipt and visible session indicator.
- **macOS TCC identity**: require a signed, stable upstream-supported app/embedded launch mode before readiness.
- **Windows uncertainty**: keep unavailable until packaged OpenNeko and Cua Driver pass exact Windows qualification.
- **Third-party release changes Tool names/schema**: artifact qualification freezes the reviewed release; unknown Tool
  or schema fails rather than dynamically entering Pi.

## Replacement plan

1. Replace the handwritten MCP client with the official SDK and delete the old transport path.
2. Add structured MCP result/annotation contracts and transient screenshot projection.
3. Add explicit enablement plus the user-managed-local-runtime authorization/qualification lifecycle; keep remote
   artifact install as an optional later source.
4. Add Automation contracts/application service and Desktop Host ports.
5. Qualify exact user-installed Browser Use entrypoint plus independently authorized browser on `darwin-arm64`.
6. Qualify `/Applications/CuaDriver.app` observe on `darwin-arm64`, then interaction actions individually.
7. Add Windows artifacts and qualification only after the Windows Desktop release path is real.

Rollback disables the affected extension and terminates its exact sessions. It does not restore the handwritten MCP
transport, activate an older runtime implementation or remove user-created browser/download/external application data.

## Open questions

- Confirm whether the reviewed Cua release's app-owned daemon/proxy mode preserves the required
  `/Applications/CuaDriver.app` TCC responsibility chain when launched from packaged OpenNeko; `mcp --direct` and raw
  `serve` remain unavailable until that evidence exists.
- Confirm the exact Browser Use installation guide and supported Python environment shape. PyPI availability alone does
  not qualify the Python/native/browser closure, and the browser executable remains a separate Host authorization.
- Browser Use existing-profile support should remain out of the first delivery unless profile copying, credential
  exposure and cleanup receive separate product/privacy acceptance.
- Computer Use write qualification is target-application-specific; the generic extension can be observe-ready while
  individual write integrations remain unavailable.
