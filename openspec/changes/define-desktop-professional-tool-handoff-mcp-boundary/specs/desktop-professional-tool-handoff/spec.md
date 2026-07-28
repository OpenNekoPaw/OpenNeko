## ADDED Requirements

### Requirement: Built-in authoring MUST remain lightweight

Desktop MUST position Agent, Canvas, Cut, Preview, Assets and other internal
creative packages as AI-native lightweight generation, organization, preview,
editing and review surfaces. It MUST NOT claim to replace professional NLE,
DCC, image, character, game-engine or node-workflow software.

#### Scenario: User needs professional finishing

- **WHEN** a task requires advanced grading, layered image editing, character rigging,
  complex 3D authoring, game-engine authoring or a large node workflow
- **THEN** the owning Neko domain prepares an explicit professional handoff
- **AND** it does not add an unbounded built-in editor feature or report a lightweight projection as professional completion

### Requirement: Professional integrations MUST declare capability levels

Every supported professional tool integration MUST declare exact platform,
application version and capability levels from launch-only, export-and-open,
read-automation, write-automation and round-trip. Automation MUST additionally
declare its transport and verification level. Unsupported levels MUST return
diagnostics rather than silently falling back to Computer Use or private formats.

#### Scenario: An application has no qualified automation API

- **WHEN** the application is installed but no vendor MCP, qualified API adapter or qualified Computer Use profile exists
- **THEN** the integration MAY support launch-only or export-and-open
- **AND** read/write automation remains unavailable with an actionable diagnostic

### Requirement: Professional handoff MUST freeze and export durable inputs

The owning domain MUST freeze the source project/document revision and export
an authorized durable bundle before opening an external application. Runtime
URLs, cache locators and unpromoted processor outputs MUST NOT be handed to the
external application as durable inputs.

#### Scenario: Cut opens a timeline in a professional NLE

- **WHEN** the user selects Open in a qualified NLE
- **THEN** Cut freezes the explicit OTIO revision and invokes a verified exchange adapter
- **AND** the Desktop Host launches the selected application with the resulting durable bundle
- **AND** semantic loss and unsupported fields are reported before launch

### Requirement: UI and Agent automation MUST share one application service

Desktop UI Open-in commands MUST call a typed Professional Tool application
service directly. Agent operations MUST reach the same service through the
existing Tool Call path and an explicitly selected MCP, API or Computer Use
transport. Neither path may duplicate export, launch, permission or
session-binding logic.

#### Scenario: Agent opens an exported artifact

- **WHEN** an Agent invokes the integration's open operation through an automation transport
- **THEN** the adapter resolves the same integration catalog and handoff service used by the UI
- **AND** the operation records Tool Call, approval, target app, source revision and handoff result

### Requirement: Professional MCP mutation MUST target an explicit external identity

Every stateful MCP operation MUST carry a handoff-bound external session and
document/project identity. Active application, active document, focused window
or most recent project MUST NOT be used as an unverified mutation target.

#### Scenario: Third-party API only exposes the active document

- **WHEN** an adapter cannot directly address the requested external document
- **THEN** it verifies the active document against the handoff binding before mutation
- **AND** it rejects the operation if identity cannot be proven

### Requirement: Computer Use MUST reuse the canonical Agent control path

Computer Use MUST execute as an explicit Professional Tool automation transport
inside the existing Agent Tool Call, permission, approval, cancellation and
transcript path. It MUST NOT create a second GUI Agent loop, MCP manager or
unprojected background controller.

#### Scenario: Agent selects Computer Use for an application without a stable API

- **WHEN** a qualified integration explicitly selects Computer Use for an operation
- **THEN** the operation is represented by the owning Agent Tool Call and exact integration
- **AND** approvals, observations, actions, pause, cancellation and result evidence remain attached to that Tool Call

### Requirement: Computer Use MUST bind an authorized visible target

Every Computer Use session MUST bind an exact application instance, target
window and handoff-bound document or project when one exists. The Host MUST
revalidate that binding before each mutating action. Focused window, active
application, window title or most recent document alone MUST NOT establish identity.

#### Scenario: Focus changes during automated editing

- **WHEN** the target window loses identity, the user interacts with the desktop or another application becomes focused
- **THEN** the Computer Use session pauses before sending further input
- **AND** it requires a verified rebind or explicit user takeover before continuing

### Requirement: Computer Use MUST protect unrelated and sensitive surfaces

Computer Use observation MUST be limited to the authorized target window or an
explicitly approved screen region. It MUST NOT read unrelated applications,
notifications, password managers, secrets or unrestricted clipboard contents by
default. Sensitive actions and surfaces MUST be denied, redacted or separately approved.

#### Scenario: A native file picker exposes unrelated files

- **WHEN** an operation reaches a system file picker outside its pre-authorized path and action profile
- **THEN** the session pauses and presents the target and requested access for approval
- **AND** it does not inspect or select unrelated locations automatically

### Requirement: Computer Use success MUST be independently verified

A Computer Use action MUST NOT be reported as successful solely because input
was sent, focus changed or a screenshot appears plausible. Verification MUST
prefer API/MCP state, then durable artifact state, then qualified semantic UI
state. Screenshot-only outcomes MUST remain assisted or needs-review.

#### Scenario: An export button is clicked

- **WHEN** Computer Use invokes an application's export action
- **THEN** the integration verifies the expected output identity, file or application state
- **AND** if only visual evidence exists it requests review instead of reporting verified export completion

### Requirement: Computer Use plugins MUST contribute semantic profiles

Plugins that add Computer Use support MUST contribute machine-readable target
identities, allowed action traits, preconditions and verification rules. They MUST NOT contribute
unrestricted coordinate macros, arbitrary input scripts, hidden fallback loops
or Skill text containing runtime interaction protocols.

#### Scenario: A plugin adds assisted automation for a professional tool

- **WHEN** the plugin is installed and trusted
- **THEN** its Computer Use profile is normalized into the same integration catalog and policy pipeline
- **AND** unsupported app versions, UI profiles or host capabilities remain unavailable with diagnostics

### Requirement: Computer Use MUST be qualified per platform and UI profile

Computer Use availability MUST be qualified independently from application
launch support for an exact OS/architecture, app version, UI profile and required
screen-observation/input capabilities. Missing OS permission, headless or locked
sessions and unqualified window systems MUST be reported as unavailable.

#### Scenario: The application can launch but input permission is unavailable

- **WHEN** Desktop discovers the target application but cannot obtain the qualified Host observation or input capability
- **THEN** launch-only or export-and-open MAY remain available
- **AND** Computer Use operations remain unavailable with an actionable diagnostic

### Requirement: External changes MUST return through explicit round-trip review

External application output MUST return as an imported/relinked candidate,
representation, timeline revision or output owned by the corresponding Neko
domain. It MUST NOT silently overwrite project facts based on directory watches,
process exit or MCP success text.

#### Scenario: User finishes editing in a professional application

- **WHEN** changed output becomes available
- **THEN** the integration validates and presents the result with provenance and diagnostics
- **AND** the user or owning-domain policy explicitly accepts it into a new durable Neko revision

### Requirement: GUI applications MUST NOT be modeled as External Processors

Long-lived interactive applications MUST use Professional Tool launch,
exchange and automation facets. External Processor MUST remain limited to
headless atomic execution with fixed arguments and Host-owned outputs.

#### Scenario: Blender supports both GUI editing and a headless render

- **WHEN** OpenNeko opens a Blender project for interactive editing
- **THEN** it uses Professional Tool handoff and session binding
- **AND WHEN** OpenNeko runs a fixed headless render with Host-owned output
- **THEN** that separate atomic capability MAY use External Processor

### Requirement: Professional tool plugins MUST use controlled contributions

Built-in or plugin integrations MUST contribute machine-readable launch,
exchange and automation facets to the controlled capability catalog. They MUST
NOT add arbitrary Shell navigation, create a second MCP runtime, place tool
protocol instructions in Skill content or gain trust from their manifest alone.

#### Scenario: A plugin contributes a Photoshop adapter

- **WHEN** the plugin is installed and enabled
- **THEN** its integration is normalized into the shared catalog with source, version, trust and diagnostics
- **AND** its MCP tools enter the existing permission and approval pipeline
- **AND** the plugin cannot add unrestricted renderer, filesystem or process access
