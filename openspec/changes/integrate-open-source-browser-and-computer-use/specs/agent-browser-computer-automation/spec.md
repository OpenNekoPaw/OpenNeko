## ADDED Requirements

### Requirement: Browser and Computer automation reuse open-source MCP runtimes

OpenNeko MUST use Browser Use and Cua Driver through their external MCP runtimes. It MUST NOT implement a parallel
browser controller, desktop input engine, screenshot engine, VLA, GUI Agent loop or generic Task runtime.

#### Scenario: Agent uses Browser Use

- **WHEN** a configured Browser Use source exposes the required compatible operation
- **THEN** Pi SHALL invoke it through the canonical Automation wrapper and Tool Call path
- **AND** Browser Use SHALL receive no model-provider credential
- **AND** arbitrary Python, nested Browser Use Agent, raw execution and internal browser-controller paths SHALL remain
  unavailable

#### Scenario: Agent uses Computer Use

- **WHEN** a configured Cua Driver source exposes the required compatible operation
- **THEN** Pi SHALL invoke it through one canonical Automation Tool Call
- **AND** the session SHALL bind and revalidate the exact application/process/window before observation or input
- **AND** no active-window inference or alternate provider SHALL participate

### Requirement: MCP transport preserves standard semantics

The Agent MCP boundary MUST use the official MCP SDK and preserve canonical Tool schema, standard annotations and
ordered supported result blocks. The handwritten JSON-RPC transport MUST NOT remain as another successful path.

#### Scenario: MCP Tool returns text and image

- **WHEN** a connected Tool returns ordered text and image content
- **THEN** OpenNeko SHALL preserve both blocks and order for the current result
- **AND** image bytes SHALL use an authorized transient observation projection
- **AND** persistent transcript SHALL retain only a redacted receipt

#### Scenario: Ordinary third-party MCP connects

- **WHEN** an enabled ordinary MCP server completes a supported handshake and returns parseable Tool definitions
- **THEN** its valid Tools SHALL enter the canonical Tool Registry according to existing Tool permission policy
- **AND** OpenNeko SHALL NOT require a fixed package release, complete schema digest or qualification record
- **AND** one malformed Tool SHALL fail locally without removing valid siblings

### Requirement: Automation adapter compatibility is minimal and structural

An Automation operation MUST enter the product-owned wrapper only when the exact configured server has the required
operation and the operation input schema is structurally compatible with fields used by the adapter. Full schema digest
equality and exact upstream/server version equality MUST NOT be required.

#### Scenario: Compatible upstream release changes version

- **WHEN** Browser Use or Cua Driver reports a different release string but retains the expected server identity,
  required operation and compatible required fields
- **THEN** the adapter MAY report the source ready
- **AND** the owning runtime MAY expose the release as optional display or diagnostic information
- **AND** the release SHALL NOT become provider, session, authorization or cache identity
- **AND** version difference alone SHALL NOT block the source

#### Scenario: Required operation is absent

- **WHEN** the configured runtime does not expose an operation required by the selected profile
- **THEN** that operation SHALL remain absent from Pi and the source SHALL report a local compatibility diagnostic
- **AND** user approval or Agent mode SHALL NOT make the missing operation executable

#### Scenario: Required input field is incompatible

- **WHEN** the adapter must inject or read a field that the operation schema does not accept compatibly
- **THEN** that operation SHALL remain unavailable
- **AND** OpenNeko SHALL NOT bypass the adapter with raw MCP exposure

#### Scenario: Upstream annotation conflicts with product policy

- **WHEN** upstream marks a known mutating operation as read-only or marks a product read-only operation destructive
- **THEN** the stricter product-owned action trait SHALL apply or the operation SHALL be rejected
- **AND** annotation SHALL NOT bypass session mode or approval

### Requirement: Browser automation uses explicit target and mode

Every Browser Use session MUST bind an isolated browser profile, allowed domains, exact mode, owner Tool Call and bounded
lifetime. Browser runtime and browser executable MUST be independently selected exact Host authorities.
The browser executable MUST be an external Chrome/Chromium-compatible browser process and MUST NOT be a Renderer WebView.
The initial delivery MUST bind one exclusive Browser Use MCP client and one isolated page to each Automation session.

#### Scenario: Browser observe session starts

- **WHEN** the user authorizes observe for a configured Browser Use source
- **THEN** only the profile's direct observe operations SHALL be available
- **AND** Pi SHALL analyze returned state, HTML and screenshot without another model
- **AND** navigation, arbitrary code/files, download/upload and nested Agent operations SHALL remain unavailable

#### Scenario: User confirms an isolated Browser origin

- **WHEN** a Browser observe Tool Call proposes one canonical HTTP(S) origin and the user selects that projected target
- **THEN** Host SHALL create one exclusive MCP client, one isolated browser profile and one page for that session
- **AND** Host MAY use the upstream navigation operation once to bootstrap the selected origin without registering navigation as an Agent Tool
- **AND** the observe operation SHALL run only after the sole page still resolves to the selected origin

#### Scenario: Browser session opens another page

- **WHEN** the isolated client contains a popup, second tab or any additional page before or after observation
- **THEN** the current session SHALL fail visibly and release its client and browser profile
- **AND** OpenNeko SHALL NOT choose an active/recent page, close a user-owned page or create another client

#### Scenario: User requests an existing browser tab

- **WHEN** the user wants to attach to a tab that was not created by the current isolated Automation session
- **THEN** the initial Browser profile SHALL remain unavailable for that target
- **AND** OpenNeko SHALL NOT infer the default browser, switch an active tab, share a mutable client or start a parallel CDP controller

#### Scenario: Runtime path changes

- **WHEN** an authorized provider entrypoint or browser executable resolves to a different path identity
- **THEN** only that resource/source SHALL require explicit reselection
- **AND** OpenNeko SHALL NOT scan `PATH`, choose a recent install or start a managed fallback

#### Scenario: User selects a uv tool entrypoint

- **WHEN** the selected Browser Use entrypoint or its Python shebang uses a symbolic link created by `uv tool install`
- **THEN** Host SHALL freeze and revalidate the entrypoint realpath and interpreter realpath before launch
- **AND** SHALL execute the exact entrypoint with the exact interpreter rather than reject standard uv layout or follow a changed link

### Requirement: Computer automation binds a visible target

Every Computer Use session MUST bind one exact Desktop application instance, process and window plus allowed region,
mode, timeout, step budget and evidence policy. Host MUST revalidate mutable target facts before state-changing input.

#### Scenario: Agent observes an authorized window

- **WHEN** the user starts observe for one window
- **THEN** Host SHALL capture only that window or authorized region
- **AND** other windows, notifications and full screen SHALL remain inaccessible

#### Scenario: Target changes before input

- **WHEN** process/window identity changes, permission is lost, screen locks or user takes over
- **THEN** the exact session SHALL pause or terminate before input
- **AND** no focused, active, recent or title-matched window SHALL replace the target

#### Scenario: Cua app version changes but publisher identity remains valid

- **WHEN** the selected Cua application retains the required bundle identifier, Developer ID/Team ID, notarization,
  compatible MCP identity and required operation shape while its short version changes
- **THEN** version difference alone SHALL NOT block the source
- **AND** bundle, signing, notarization or TCC responsibility-chain mismatch SHALL still block it

### Requirement: Permissions remain product-owned

Plugin enablement, current Host/OS permission, exact Automation session and applicable Tool Call approval MUST be
independent real authorities. Manifest permission strings, Skill text, upstream annotations, version strings and success
text MUST NOT establish execution permission or mutation success.

#### Scenario: User approves one mutation

- **WHEN** the user approves a reviewed click, type or other mutation
- **THEN** approval SHALL bind only the displayed target, effect and current Tool Call
- **AND** it SHALL NOT create permanent, cross-target or cross-session permission

#### Scenario: Target changes after approval

- **WHEN** target was valid when approval was shown but changes before input
- **THEN** Host SHALL reject or pause after immediate pre-input revalidation
- **AND** previous approval SHALL not transfer

#### Scenario: OS permission is revoked

- **WHEN** Screen Recording or applicable Accessibility/Input permission is revoked
- **THEN** only the affected session/operation SHALL pause or terminate
- **AND** persisted Plugin/local-runtime state SHALL NOT report that OS capability available

### Requirement: External runtime installation remains outside OpenNeko

Browser Use and Cua Driver MUST use one explicitly selected user-managed local runtime in the current delivery.
OpenNeko MAY expose official guidance and copyable commands but MUST NOT execute installation, update or uninstall.
OpenNeko MUST consume the upstream Browser Use distribution directly and MUST NOT maintain a product fork.
It MUST NOT retain a Browser/Cua-specific endpoint as a parallel successful provider path; ordinary remote MCP remains
owned by the generic MCP Manager.

#### Scenario: User requests installation help

- **WHEN** an external runtime is missing
- **THEN** OpenNeko MAY copy a persistent package-manager or upstream installer command and open its guide
- **AND** SHALL NOT execute the command or infer authorization from its presence
- **AND** any `uvx` execution or `uv tool install` lifecycle SHALL remain user-owned

#### Scenario: User selects an installed runtime

- **WHEN** the user selects the required assets
- **THEN** Host SHALL store opaque exact authorities rather than raw paths in package/domain contracts
- **AND** Automation SHALL start and terminate only its own session child process or connection
- **AND** external files and service lifecycle SHALL remain user-owned

### Requirement: Automation runtime resources are isolated

Browser Use and Cua processes MUST use session-scoped home, temporary and data locations plus exact selected executable
paths. They MUST NOT inherit the real user home, general Host environment, model credentials or undeclared secrets.

#### Scenario: External MCP process starts

- **WHEN** Host starts an Automation runtime
- **THEN** environment SHALL contain only explicitly owned values and scoped directories
- **AND** real `HOME`, general `PATH`, unrelated application secrets and model-provider credentials SHALL be absent

#### Scenario: Browser Tool Calls run concurrently

- **WHEN** separate Browser Automation sessions execute concurrently
- **THEN** each session SHALL own exactly one distinct MCP client, profile directory and page
- **AND** no client or page identity SHALL be shared across sessions

### Requirement: Failure remains local and no fallback is introduced

Failure of one runtime, operation, session or target MUST NOT select another provider/source/target or disable unrelated
extensions and conversations.

#### Scenario: Browser MCP fails

- **WHEN** the selected Browser Use connection or operation fails
- **THEN** the current Tool Call SHALL return a visible diagnostic
- **AND** OpenNeko SHALL NOT retry with Computer Use, raw MCP, another installation or another target

#### Scenario: User takes over

- **WHEN** user selects Take over
- **THEN** exact session SHALL release product execution authority and stop background input
- **AND** unrelated sessions, Tools and Workspaces SHALL remain available

### Requirement: Play-use remains outside Browser and Computer automation

Browser and Computer automation MUST remain transport capabilities and MUST NOT infer Character Play, Game Activity,
seat leases, VLA control or multiplayer coordination.

#### Scenario: Automation observes an application

- **WHEN** Browser or Computer automation observes an authorized target
- **THEN** it SHALL return only the bounded Automation result and evidence
- **AND** SHALL NOT create a Character Play session, Game Activity, seat lease or multiplayer state
