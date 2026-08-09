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

Browser Use 的 `--cli-mcp` 暴露任意 Python execution；`--mcp` 还包含可启动上游自治 Agent 的操作。
两者都不能原样全部注册。OpenNeko 只允许审核后的 direct browser Tool 集，并拒绝嵌套 Agent、任意代码、
任意文件和隐式 cloud browser。Cua Driver 使用 `bounded` permission mode；禁止
`--dangerously-bypass-approvals`。

## Goals / Non-Goals

**Goals:**

- 通过开源 upstream MCP runtime 交付 Browser Use 和 Computer Use，不开发替代控制引擎。
- 让 Tool traits、structured image result、permission、approval 和 evidence 进入唯一 Pi Tool Call path。
- 支持小 catalog 随应用打包、大 runtime 在显式安装时下载；启动 Agent 或打开 Extensions 不触发安装。
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
| Responsibility | Upstream owns browser/desktop mechanics; Automation owns session/target/action/evidence policy; Agent owns Tool Call; Extension service owns package lifecycle; Desktop owns OS trust adapters.      |
| Dependency     | Automation contracts are L0; Node application service depends on contracts and injected ports; Agent consumes Automation Tool contributions; Renderer and upstream packages never import each other. |
| Interface      | Exact extension, upstream release, platform artifact, session, target, action trait, approval and evidence are explicit; active browser/app/window is never an implicit target.                      |
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

For the first delivery, the catalog shipped inside the signed OpenNeko application is the only catalog authenticity
root. It contains display metadata, supported platform coordinates, an exact HTTPS artifact location, byte size,
digest, signature identity, upstream provenance, permission declaration and license inventory. It does not contain
large Python/browser/native runtime payloads. Refresh only rereads this application-owned catalog and never replaces
catalog records from the network. Publishing new catalog entries or package releases therefore requires an OpenNeko
application release; a remotely mutable signed catalog requires a separate OpenSpec with publisher-key ownership,
rotation, revocation and rollback rules.

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

Install, enable, disable, update and remove are explicit operations. Opening Agent, opening Extensions, refreshing the
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

An update confirmation is bound to the exact candidate package release. An identical or reduced declared permission
set may retain the existing enable grant after the explicit update; any added Tool, action class, environment secret,
network scope, OS capability or data access invalidates enablement for the candidate until the user separately accepts
the expanded set. The candidate cannot run to discover or request expanded permission before acceptance.

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

`AutomationMcpRuntimePort` owns the upstream process and connection per Automation session. Tool calls, target
revalidation and close use the opaque `providerSessionId`; there is no shared current Browser Use connection across
Agent sessions. Candidate Tool inspection uses an isolated qualification runtime and cannot register raw Tools into Pi.

The Agent adapter wraps approved upstream MCP operations as ordinary Pi Tools. It freezes session, target, mode,
step/time budget and permission policy at Tool Call start, revalidates mutable target facts before state-changing
actions, delegates exactly once to the selected upstream MCP server and returns structured evidence. It never tries a
second provider or raw MCP Tool after failure.

Automation contributions do not use generic raw MCP exposure. A Tool enters Pi only after exact provider ownership,
reviewed name/schema, action trait, session mode and upstream annotation have been resolved into the product-owned
wrapper. Unknown, contradictory or newly discovered Tools are unavailable even when the Agent is in `auto` mode; asking
the user cannot convert an unreviewed Tool into an allowed Tool.

### 4. Browser Use uses the upstream direct MCP surface

The Browser Use artifact contains a pinned Python runtime, the upstream `browser-use` package and its qualified browser
runtime. Its contained launcher starts only `browser-use --mcp` through the existing plugin MCP lifecycle.

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
extension/session-scoped home, temporary and browser-data directories and launches the contained executable through an
exact path. The process working directory is the newly created session directory rather than the installed runtime, so
Browser Use cannot load a runtime-adjacent `.env`; Host writes an explicit Browser Use config with an empty `llm` set,
the exact contained Chromium path and the authorized domain set. Downloads and uploads remain disabled in the first
delivery.

### 5. Computer Use uses Cua Driver with exact target binding

The Computer Use artifact contains the reviewed Cua Driver platform release and starts `cua-driver mcp` in bounded mode.
On macOS, qualification must use an upstream-supported stable application/embedded responsibility chain for Screen
Recording and Accessibility attribution; a raw unsigned helper path is not accepted as production ready. On Windows,
the extension remains unavailable until the OpenNeko Windows product and signed Cua artifact pass real tests.

Installation never requests OS automation permission. On macOS, an explicit Grant OS Permission action after
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
  scoped home/temp/data locations and contained executable paths. Browser Use requires no model credential, so its
  process environment explicitly excludes model-provider and model API credentials.

## Evaluation plan

The Agent Evaluation skill requires a new suite because the coverage index has no owner for external browser/computer
automation. Authoring decision: `create` suite `agent-runtime.external-automation`; update the coverage index mapping for
`capability-tool-routing`, `tool-call-lifecycle`, `tool-result-delivery` and `desktop-event-projection` without routing
unrelated capabilities to this suite.

Minimum real cases:

| Case                       | Canonical evidence                                                                                       | Forbidden fallback                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Browser observe            | installed/enabled extension, exact MCP server/Tool receipt, allowed domain, structured text/image result | internal browser controller, nested Browser Use Agent, arbitrary exec |
| Disabled/unknown Tool      | disabled extension or poisoned unreviewed Tool stays absent from Pi in ask and auto modes                | raw MCP exposure, user-confirmation bypass, annotation-only grant     |
| Browser interaction denied | mutating Tool reaches approval and denial terminal state, no page mutation                               | annotation-only permission, automatic retry or Computer Use           |
| Computer observe           | qualified platform artifact, OS permission, exact pid/window, target screenshot receipt                  | active-window inference, full-screen capture, mock image              |
| Computer target mismatch   | revalidation pauses/fails exact session while sibling conversation remains usable                        | recent/foreground window fallback                                     |
| Cancel/takeover            | exact Tool/session reaches terminal cancellation and upstream resources release                          | generic Task cancellation or background input after takeover          |

Deterministic tests own marketplace codecs, checksums, allowlists, annotation intersection, result block preservation,
path containment and unsupported platform. Real Agent behavior requires hidden complete Desktop + real provider. The
Computer Use positive path additionally requires visible Desktop, real OS grants and a real fixture app; unavailable
platforms report `infrastructure-blocked` rather than passing with a mock. The foundational conversation matrix is
reviewed as unaffected except Tool result delivery, cancellation, projection and conversation isolation, which receive
focused regression coverage.

## Risks / Trade-offs

- **Large runtime downloads**: keep artifacts out of the core application and download only on explicit install; show
  exact size before confirmation.
- **Upstream supply-chain drift**: pin release/source, checksum, license inventory and build recipe; no `latest` or
  install script execution.
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
3. Extend extension catalog/install lifecycle with remote artifacts and explicit enablement/update.
4. Add Automation contracts/application service and Desktop Host ports.
5. Publish and qualify the Browser Use artifact; keep Computer Use unavailable.
6. Qualify Cua Driver observe on `darwin-arm64`, then interaction actions individually.
7. Add Windows artifacts and qualification only after the Windows Desktop release path is real.

Rollback disables the affected extension and terminates its exact sessions. It does not restore the handwritten MCP
transport, activate an older runtime implementation or remove user-created browser/download/external application data.

## Open questions

- Which stable Cua Driver release and macOS responsibility-chain mode will pass signing/notarization and TCC tests must
  be selected from release artifacts during implementation; source availability alone is insufficient.
- Browser Use existing-profile support should remain out of the first delivery unless profile copying, credential
  exposure and cleanup receive separate product/privacy acceptance.
- Computer Use write qualification is target-application-specific; the generic extension can be observe-ready while
  individual write integrations remain unavailable.
