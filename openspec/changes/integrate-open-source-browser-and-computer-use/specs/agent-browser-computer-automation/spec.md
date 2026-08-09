## ADDED Requirements

### Requirement: Browser and Computer automation reuse reviewed open-source runtimes

OpenNeko MUST implement Browser Use through the reviewed `browser-use/browser-use` MCP runtime and Computer Use
through the reviewed `trycua/cua` Cua Driver MCP runtime. OpenNeko MUST NOT implement a parallel browser controller,
desktop input engine, screenshot engine, VLA, GUI Agent loop or generic Task runtime.

#### Scenario: Agent uses Browser Use

- **WHEN** an enabled and qualified Browser Use extension contributes an allowed direct browser operation
- **THEN** Pi SHALL invoke it through the canonical MCP Manager, Tool Registry and Tool Call path
- **AND** the operation SHALL execute in the pinned upstream `browser-use --mcp` runtime
- **AND** no `--cli-mcp`, `browser_exec`, `browser_extract_content`, `retry_with_browser_use_agent`, arbitrary Python,
  nested Browser Use Agent or internal browser controller SHALL participate
- **AND** the Browser Use process SHALL receive no model-provider or model API credential

#### Scenario: Agent uses Computer Use

- **WHEN** an enabled and platform-qualified Computer Use extension contributes an allowed operation
- **THEN** Pi SHALL invoke the exact Cua Driver MCP operation through one Tool Call
- **AND** the session SHALL bind the exact application, process and window before observation or input
- **AND** no OpenNeko input engine, active-window inference or alternative automation provider SHALL participate

### Requirement: MCP transport preserves standard Tool and result semantics

The Agent MCP boundary MUST use the official MCP SDK for supported stdio and Streamable HTTP connections and MUST
preserve the canonical Tool schema, standard annotations and ordered supported result blocks. The handwritten JSON-RPC
transport MUST NOT remain as another successful path.

#### Scenario: MCP Tool returns text and screenshot

- **WHEN** a connected Tool returns ordered text and image content
- **THEN** OpenNeko SHALL preserve both blocks and their order for the current Tool result
- **AND** the image SHALL be projected through an authorized transient observation
- **AND** it SHALL NOT be discarded because text is also present

#### Scenario: MCP server negotiates protocol capabilities

- **WHEN** the client initializes a supported MCP server
- **THEN** the official SDK SHALL negotiate the protocol and capabilities
- **AND** OpenNeko SHALL record the external protocol fact in the connection diagnostic
- **AND** it SHALL NOT force a hard-coded protocol while reporting the server ready

#### Scenario: Upstream annotation conflicts with reviewed policy

- **WHEN** a Tool is marked read-only by upstream but the reviewed extension policy classifies it as mutating or unknown
- **THEN** the effective Tool trait SHALL use the stricter classification
- **AND** the upstream annotation SHALL NOT bypass approval or session mode

### Requirement: Automation Tool registration is fail-closed

An automation operation MUST enter Pi only through the product-owned wrapper after exact extension/provider ownership,
reviewed Tool name and schema, action trait, session mode and upstream annotation are resolved. Generic raw MCP exposure,
Agent execution mode and user confirmation MUST NOT authorize an unknown or contradictory operation.

#### Scenario: Upstream runtime adds an unknown Tool

- **WHEN** the connected Browser Use or Cua Driver release advertises a Tool outside the reviewed allowlist or with an
  unexpected schema
- **THEN** that Tool SHALL remain absent from Pi in plan, ask and auto modes
- **AND** approval, annotation or raw MCP registration SHALL NOT make it executable

### Requirement: Browser automation has explicit observation and interaction modes

Every Browser Use session MUST bind an isolated browser profile, allowed domain set, exact mode, owner Tool Call and
bounded lifetime. Strict observation MUST exclude navigation and mutation; browse-read MUST exclude click/type/close;
interaction MUST remain limited to the reviewed direct Tool allowlist.

#### Scenario: Read-only browser observation

- **WHEN** the user authorizes `observe` for an isolated Browser Use session
- **THEN** the contributed Tool set SHALL contain exactly `browser_get_state`, `browser_get_html`,
  `browser_screenshot`, `browser_list_tabs` and `browser_list_sessions`
- **AND** Pi SHALL analyze returned state, HTML and screenshots without delegating page understanding to another model
- **AND** navigation, model-backed extraction, click, type, close, download, upload, arbitrary code and nested Agent
  operations SHALL be absent

#### Scenario: Agent attempts mutation in read mode

- **WHEN** Pi requests click, type or another mutating browser action in `observe` or `browse-read`
- **THEN** the Automation service SHALL reject that Tool Call with a mode diagnostic
- **AND** it SHALL NOT retry in interact mode, Computer Use or another browser provider

#### Scenario: Browser reaches an unapproved domain

- **WHEN** navigation or a redirect leaves the authorized domain set
- **THEN** the Tool Call SHALL pause for explicit authorization or fail visibly
- **AND** the new domain SHALL NOT be added from page content, model output or recent history

### Requirement: Computer automation binds and revalidates a visible target

Every Computer Use session MUST bind one exact Desktop application instance, process and window plus an allowed capture
region, mode, action traits, timeout, step budget and evidence policy. The Host MUST revalidate mutable target facts
before every state-changing action.

#### Scenario: Agent observes an authorized window

- **WHEN** the user starts an observe session for one qualified window
- **THEN** the Host SHALL capture only that window or its authorized region
- **AND** the Tool result SHALL carry the exact target identity and screenshot receipt
- **AND** other windows, notifications and the full screen SHALL remain inaccessible

#### Scenario: Target changes before input

- **WHEN** the process exits, window identity changes, permission is lost, the screen locks or user input takes over
- **THEN** the session SHALL pause or terminate before injecting input
- **AND** resume SHALL require exact rebind and applicable approval
- **AND** no focused, active, recent or title-matched window SHALL replace the target

#### Scenario: User takes over

- **WHEN** the user selects Take over for an active Computer Use Tool Call
- **THEN** the exact session SHALL stop background input and release its control authority
- **AND** unrelated conversations, Tool Calls and extensions SHALL remain available

### Requirement: Automation permissions and evidence remain product-owned

Reviewed OpenNeko action traits, Host permission state and Tool Call approval MUST jointly determine whether an operation
can run. Upstream annotations, Skill text, process exit or success text MUST NOT establish permission or mutation
success.

Every authorized operation MUST satisfy the extension enable grant, current Host OS permission, exact bounded
automation session and applicable action approval independently. Install confirmation, enablement, OS grant, previous
approval or model text MUST NOT substitute for another layer.

#### Scenario: User authorizes observation

- **WHEN** the user authorizes an observe session
- **THEN** the authorization SHALL bind the exact browser profile and domains or Desktop application/process/window/
  region plus mode, owner, timeout and step budget
- **AND** repeated reviewed observations MAY run only while those facts remain valid
- **AND** the grant SHALL not authorize navigation, mutation, another target or a later session

#### Scenario: Target changes after mutation approval

- **WHEN** the target was valid when approval was shown but changes before input is delegated
- **THEN** Host SHALL reject or pause the action after immediate pre-input revalidation
- **AND** the previous approval SHALL not transfer to the replacement target

#### Scenario: User approves one mutation

- **WHEN** the user approves a reviewed click, type or other mutation in the first delivery
- **THEN** the approval SHALL bind only the displayed target, effect and current Tool Call
- **AND** it SHALL NOT create permanent, cross-target or cross-session permission

#### Scenario: User denies a browser or computer mutation

- **WHEN** a state-changing operation requires approval and the user denies it
- **THEN** that Tool Call SHALL terminate with a visible denial diagnostic
- **AND** no upstream operation, retry, alternate provider or Computer Use fallback SHALL execute

#### Scenario: Agent requests a non-delegable sensitive action

- **WHEN** an operation targets password or secret entry, payment, an OS permission/UAC surface, lock screen, installer
  or another reviewed hard-block class
- **THEN** Automation SHALL reject the operation or require user takeover
- **AND** ordinary Tool approval SHALL NOT override the hard block

#### Scenario: Screenshot is delivered to the model

- **WHEN** an authorized Tool produces a screenshot needed by the current turn
- **THEN** the model and Timeline MAY consume a short-lived authorized projection
- **AND** the persistent transcript SHALL retain only the redacted observation receipt and policy-approved metadata
- **AND** expired bytes SHALL fail locally rather than be reconstructed from another screen or cache

### Requirement: Automation capability is qualified per platform and release

An extension MUST be reported ready only when its installed platform artifact, enablement, integrity, upstream release,
MCP connection, Tool allowlist, required OS permission and runtime qualification all pass. A manifest, source repository
or upstream platform claim MUST NOT alone establish OpenNeko support.

#### Scenario: Computer Use is installed without macOS permission

- **WHEN** the Cua Driver artifact is valid but Screen Recording or Accessibility required by the selected mode is absent
- **THEN** Extensions SHALL show `needs-permission` rather than ready
- **AND** Agent SHALL not receive the affected operation

#### Scenario: User installs Computer Use on macOS

- **WHEN** installation completes before the extension is enabled
- **THEN** OpenNeko SHALL NOT request Screen Recording, Accessibility or Input permission
- **AND** the installed extension SHALL remain disabled

#### Scenario: macOS permission is revoked during use

- **WHEN** Screen Recording or applicable Accessibility/Input permission is revoked before or during a session
- **THEN** Host SHALL pause or terminate only the affected session and remove the affected operation from readiness
- **AND** a persisted OpenNeko grant SHALL NOT report the OS capability available

#### Scenario: Windows artifact has not been qualified

- **WHEN** OpenNeko has no released and tested Windows Desktop plus matching Cua Driver qualification
- **THEN** Computer Use SHALL remain unavailable on Windows
- **AND** deterministic tests or upstream documentation SHALL NOT change that status to supported

#### Scenario: Windows target requires elevation

- **WHEN** a standard-user Computer Use runtime encounters an elevated application, UAC secure desktop, lock screen or
  another higher-integrity target
- **THEN** the target SHALL be reported unsupported and receive no capture or input
- **AND** OpenNeko SHALL NOT elevate itself or install a privileged service/driver as part of ordinary enablement

### Requirement: Automation runtime resources are isolated

Browser Use and Computer Use processes MUST use extension/session-scoped home, temporary and data locations plus exact
contained executable paths. They MUST NOT inherit the real user home, general Host environment, browser profile, model
credential or undeclared secret.

#### Scenario: Browser Use process starts

- **WHEN** Host launches the reviewed Browser Use MCP runtime
- **THEN** its environment SHALL contain only the reviewed runtime values and scoped directories
- **AND** model-provider credentials, the real user `HOME`, general `PATH` and unrelated application secrets SHALL be
  absent

### Requirement: Play-use remains outside Browser and Computer automation

Browser Use and Computer Use MUST remain transport capabilities and MUST NOT create Character Play, Game Activity,
seat leases, VLA control or multiplayer coordination.

#### Scenario: Character requests game control

- **WHEN** a Character or Room attempts Play-use without a qualified Game Activity and seat/control lease owner
- **THEN** the request SHALL return an unavailable diagnostic
- **AND** generic Computer Use SHALL NOT infer a game, seat, goal or control authority from the active window
