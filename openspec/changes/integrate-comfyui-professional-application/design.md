## Context

The current Extensions scene is intentionally a read-only projection of exactly two DSH-owned
contribution kinds: Skill and MCP. A professional application is instead an independently installed
OS application or local service with its own document/runtime authority. Treating it as another
extension field would make Desktop infer install state, mix DSH and OS authority, and leave no exact
owner for handoff, visual target binding or round-trip output.

ComfyUI provides a useful first consumer. Its local server exposes structured workflow submission,
queue, progress, interruption, history and output routes, while its visible graph and third-party
custom-node interfaces still contain useful information that an API adapter may not expose. The
integration therefore needs both API and Computer Use, but the two transports must remain explicit
operations with different evidence strength.

## Goals

- Establish one canonical, profile-gated professional application management boundary.
- Keep Skill, MCP and Professional applications distinct in authority while presenting them in one
  understandable management destination.
- Support explicit quick handoff from resource surfaces based on semantic resource facts.
- Prove discovery, configuration, API automation, Computer Use and output ingest with ComfyUI.
- Preserve one Agent Tool path, one Generation Job path and one exact-target Computer Use path.

## Non-goals

- A generic package manager, application store, arbitrary executable launcher or application plugin
  marketplace.
- Claiming that applications provide an OpenNeko Skill. Skill is a DSH contribution authored or
  installed independently of OS application discovery.
- Treating an unqualified community MCP server as vendor-supported application capability.
- Mirroring ComfyUI's workflow graph, model catalog, queue or output directory as OpenNeko project
  facts.
- Implementing the future professional application matrix in this change.

## Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Professional Apps owns supported profiles, local bindings and handoff orchestration; Generation owns ComfyUI workflow Jobs; Automation owns exact-target Computer Use safety; Assets owns accepted resources; DSH owns Agent Tool and MCP lifecycle; Desktop owns OS/Electron trust adapters. |
| Dependency     | L0 contracts have no runtime dependency; Node services consume narrow ports; Webview is browser-only; Electron discovery, launch, window enumeration and input stay in Desktop Main/preload.                                                                                                  |
| Interface      | Separate strict contracts represent profile, binding, readiness, semantic operation, handoff receipt and diagnostics. ComfyUI API and Computer Use operations never share a try-next transport selector.                                                                                      |
| Extension      | A future application adds a qualified profile and a tool-specific adapter. A new transport, exchange format or mutation must define its owner and evidence; it cannot inherit support from its category.                                                                                      |
| Testing        | Contract/path tests prove exact authority and forbidden fallbacks; real ComfyUI verifies API Jobs and outputs; visible Desktop verifies management, handoff, exact window binding and user takeover.                                                                                          |

## Decisions

### 1. One management destination, three separate authorities

The user-facing destination is renamed to “Capabilities and integrations” and presents Skill, MCP and
Professional applications as sibling choices. This is presentation composition, not a widened
extension schema:

```text
Host Capabilities and integrations scene
  -> Skill entry -> existing Agent Skill/MCP Webview -> DSH Skill authority
  -> MCP entry -> existing Agent Skill/MCP Webview -> DSH MCP authority
  -> Professional applications entry
       -> Professional Apps Webview
       -> sender-bound Desktop adapter
       -> Professional Apps application service
```

`AgentExtensionManagementProjection` remains exactly `skills`, `mcp` and bounded diagnostics. It does
not gain an application field. The new scene may compose the two package-owned Roots but cannot merge
their stores, install actions or readiness facts. Failure in one projection stays local and leaves the
other entries usable.

### 2. A small package family owns the new stable boundary

| Owner                                   | Package role                                           | Canonical public entry/path          | Producer                                                                                  | Consumer                                                           | Runtime boundary            |
| --------------------------------------- | ------------------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------- |
| Professional application contracts      | `@neko/professional-apps-contracts`, L0                | package root                         | qualified profile adapters and settings service                                           | Node service, Desktop adapters, Webview and domain handoff clients | serializable, host-neutral  |
| Catalog and handoff application service | `@neko/professional-apps-node`, L1                     | package root application service     | exact discovery/launch/config ports plus tool-specific contribution                       | Host scene adapter, resource actions and domain services           | Node, no Electron           |
| Management presentation                 | `@neko/professional-apps-webview`, L2                  | package Root and typed client port   | strict management projection                                                              | current visible Window scene                                       | browser-only                |
| ComfyUI run semantics                   | `@neko/generation`                                     | generation provider/job public entry | ComfyUI API adapter                                                                       | Generation UI and DSH generation Tool                              | Node, host-neutral          |
| Visual automation safety                | `@neko/automation-contracts` / `@neko/automation-node` | exact target/session public entries  | Desktop Computer Use provider                                                             | official DSH Computer Use contribution                             | L0/L1 plus Desktop provider |
| OS trust adapters                       | `apps/neko-desktop`                                    | typed Main/preload adapters only     | Electron sender, OS application identity, window/process and authorized file capabilities | package-owned application services                                 | Electron Main/preload       |

`apps/neko-desktop` retains only behavior that requires sender identity, Electron/OS application
identity, screen/input permission, window/process handles or native launch APIs. Discovery policy,
readiness state, routing, handoff semantics and success criteria remain host-neutral owners.

The new package family is justified by three real runtime consumers (management UI, resource handoff
and Agent/Generation) and two trust boundaries (browser/Node and Node/Electron). It prevents these
contracts from being placed in the broad Host package or duplicated by each creative domain.

### 3. Profiles qualify support; discovery does not invent it

A product-owned `ProfessionalApplicationProfile` contains:

- stable integration identity, display metadata and category;
- supported platforms and exact vendor application identities;
- qualified third-party application versions when the adapter requires them;
- supported semantic resource inputs/outputs;
- exact operations, their canonical owner/transport, risk traits and evidence requirement;
- discovery probes, launch requirements and user-editable binding fields.

Only registered, reviewed profiles are probed. Host adapters match bundle/application identity,
publisher identity, desktop entry identity or an explicitly approved user locator. They do not search
arbitrary `PATH`, execute candidates, accept a same-named binary or enumerate installed software into
the product catalog.

The catalog may display an unconfigured qualified profile as “Available to connect”. It reports exact
local states such as unconfigured, not installed, detected, incompatible, permission blocked and
ready. A failed profile is a diagnostic for that record, not an empty-success result and not a reason
to disable sibling integrations.

### 4. Users edit bindings, not product truth

Users may change:

- the approved application locator or OS application selection;
- a ComfyUI loopback endpoint;
- launch preference and whether an already running qualified instance should be selected;
- domain-owned defaults such as the selected workflow binding or output review preference;
- revocable permission grants.

Users may not rewrite vendor identity, qualified versions, operation transport, risk classification,
verification policy or resource compatibility. Those are reviewed product facts.

Persisted settings use stable application identity, OS-issued opaque locator/bookmark or
`PathResolver`-compatible variable-backed paths; they never persist raw absolute paths. Credentials,
if a later adapter requires them, remain in the Host credential owner and are referenced only by
opaque identity. Process, window and Computer Use session handles are transient.

Invalid local settings reset only that non-authoritative binding to its current unconfigured state and
show a repair action. They do not fabricate a detected application, rewrite user resources or prevent
other profiles from loading.

### 5. Installation and companion capabilities are explicit

The first release offers an official download/help link or opens an already downloaded installer. It
does not silently download, execute, update or remove a professional application. A future “Install”
operation requires a separate accepted change defining vendor source, signature/hash verification,
platform privilege, cancellation, partial-install cleanup and uninstall ownership.

Detecting ComfyUI does not install a Skill, MCP server, custom node, model or Python package. If a
future qualified companion Skill or MCP contribution exists, the application card may describe it
and link to the existing DSH-owned explicit installation/configuration flow. The user confirms the
operation there; DSH remains the sole Skill/MCP runtime authority. No application profile gains a
hidden Skill/MCP success path.

### 6. Resource actions are semantic and discoverable

The canonical action query is:

```text
exact resource identity + owning revision/candidate + resource kind/MIME
  -> owning resource service resolves durable authorized content
  -> Professional Apps service matches qualified exchange operation
  -> exact application binding/readiness
  -> semantic action projection
```

“Send to ComfyUI…” appears both in the resource detail actions and the context menu. The context menu
is a shortcut, not the only discoverable path. File extensions may help a tool-specific adapter
validate a format, but extension-only association never creates an action.

A handoff carries exact source identity, frozen revision/candidate, target integration, operation,
authorized content locator, expected semantic loss, approval state and a handoff receipt. Renderer
never receives a raw path. Desktop resolves an authorized locator only for the exact sender and
operation.

Launch/focus success means only that the external target was opened or selected. It does not mean the
resource was edited, a workflow ran or an output was produced. Each subsequent state requires its own
authoritative evidence.

### 7. ComfyUI uses an explicit composite workflow

Initial support is limited to:

- qualified ComfyUI Desktop discovery/launch on supported platforms; and
- a user-configured loopback local self-hosted endpoint.

Arbitrary LAN/public endpoints and Comfy Cloud are excluded. The loopback adapter rejects redirects
or resolved targets that leave the allowed local boundary and reports connection, compatibility,
missing-node/model and permission failures separately.

The canonical end-to-end path is:

```text
configure exact ComfyUI binding
  -> verify local API readiness and node/workflow requirements
  -> bind exact workflow and authorized input snapshot
  -> optional explicit Computer Use inspect/prepare operation on exact window
  -> freeze the workflow API payload and input identities
  -> Generation creates exact provider Job
  -> POST /prompt and record prompt_id
  -> /ws plus /queue or /history/{prompt_id} observe exact Job
  -> /interrupt or exact queue operation cancels when requested
  -> /history/{prompt_id} identifies outputs
  -> /view retrieves output bytes through the authorized adapter
  -> Generation verifies durable candidate and provenance
  -> user explicitly accepts/imports candidate into Assets
```

ComfyUI's workflow graph, queue and output files remain external facts. Generation persists only the
bound input/workflow snapshot required for the Job, exact provider/prompt identity, progress,
diagnostics, candidate output and provenance. Assets receives a new durable record only through the
existing explicit ingest owner.

### 8. API and Computer Use coexist without fallback

Each exposed operation has one canonical transport:

| Operation                                        | Canonical transport                      | Completion evidence                                                    |
| ------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------- |
| Discover or launch ComfyUI                       | Host application adapter                 | exact application/service identity and readiness receipt               |
| Inspect visible graph, preview or custom-node UI | Computer Use observation                 | exact target plus observation revision; advisory only                  |
| Perform a qualified UI-only edit                 | Computer Use action                      | exact target/action evidence plus required user review                 |
| Validate and submit bound workflow               | ComfyUI local API                        | validation response and `prompt_id`                                    |
| Observe queue/progress/error                     | ComfyUI local API/WebSocket              | events correlated to exact `prompt_id`                                 |
| Cancel a run                                     | ComfyUI local API                        | interruption/queue state for exact Job                                 |
| Retrieve and accept output                       | ComfyUI local API plus Generation/Assets | history record, retrieved bytes, durable candidate and explicit ingest |

Computer Use supplements missing visual/interaction semantics. It does not replace API execution or
output verification. An Agent may intentionally compose an inspect operation followed by a run
operation, but it must emit two exact Tool operations and preserve both evidence records. API timeout,
validation failure or unavailable endpoint returns a visible diagnostic; it never triggers automatic
clicking. Computer Use failure never causes an API mutation to be guessed or repeated.

A Computer Use session binds the exact Tool Call, integration, Desktop host instance, process,
window, allowed region, action traits, grant, timeout and evidence policy. Focus/title alone is not
identity. Process/window change, user input, target occlusion or permission loss pauses the session.
Pause, Stop and Take over are visible; resume requires a new observation and target validation.

### 9. Agent routing reuses existing authorities

Direct UI actions call the package-owned services without creating a hidden Conversation. Agent
actions flow through the official DSH Tool contribution, existing approval/cancellation/transcript
path and exact domain operation. The Generation contribution invokes the same Generation Job service
as direct UI. Computer Use remains the official DSH MCP contribution consuming the Automation safety
kernel and Desktop provider.

There is no Professional MCP Manager, GUI Agent loop, second Job store, transport-priority router or
active-window fallback. A future qualified MCP adapter can own a different exact operation only after
its server source, lifecycle, permission and verification are specified; it cannot silently replace
the ComfyUI API adapter.

## Future application taxonomy

The catalog category is for navigation only; it does not confer capability. Candidate follow-up
profiles are:

| Category             | Candidate applications                                        | Likely owning domain                   | Proposal priority                                                               |
| -------------------- | ------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| Image editing        | Photoshop, Krita, Affinity Photo, GIMP                        | Assets / Canvas / Generation           | after a layer-capable exchange profile is proven                                |
| Video and post       | DaVinci Resolve, CapCut/Jianying, Premiere Pro, After Effects | Cut / Assets                           | high, but each vendor needs a separate verified adapter                         |
| 3D creation          | Blender, Maya, Houdini                                        | Assets / Chara / World / Preview       | Blender first                                                                   |
| Game creation        | Godot, Unity, Unreal Engine                                   | World / Assets / Chara                 | project/package handoff before editor automation                                |
| Character production | Live2D Cubism                                                 | Chara / Assets                         | useful and supported as a future dedicated profile, not generic image editing   |
| Workflow platforms   | ComfyUI                                                       | Generation / Assets                    | this change's first implementation                                              |
| Audio production     | REAPER, Audition, Logic Pro                                   | Assets / media-related authoring owner | follow-up after audio exchange ownership is defined                             |
| Office               | Word, Excel, PowerPoint and compatible suites                 | document/sheet/presentation owners     | file handoff first; live automation only with a separately qualified API/add-in |

Office is not automatically a professional automation target merely because the OS can open its
files. Default-application opening may use a narrower generic file handoff, while live document
control requires exact document identity and application-specific evidence. Live2D has a clearer
creative round-trip need and should receive its own Chara/Assets proposal when its accepted exchange
formats and verified automation surface are known.

No candidate appears as “supported” until a tool-specific profile, adapter, test matrix and accepted
OpenSpec exist. In particular, application detection is not evidence that an official Skill or MCP
capability exists.

## Failure and user-data model

- A failed discovery/config/readiness record is isolated to that profile and remains visible with a
  repair action.
- An invalid workflow or missing model/node rejects only that run before submission when detectable.
- A disconnected WebSocket reconnects only to the same API authority and exact `prompt_id`; it does
  not submit again or switch transport. History is queried to resolve outcome; unresolved state stays
  unknown.
- Cancellation targets only the exact Generation Job/prompt. Global queue clearing is never used as a
  substitute for exact cancellation unless the user explicitly invokes a separately approved global
  operation.
- A Computer Use target or grant failure pauses/rejects only that session and does not cancel an
  independently running API Job.
- Failed output retrieval preserves the Job and diagnostic. It does not create an empty Asset or use
  an older file from the output directory.
- Removing a local binding does not uninstall ComfyUI, delete workflows/models/outputs or remove
  previously imported Assets.

## Replaced and preserved paths

- Preserved: the existing DSH Skill/MCP authority, strict Skill/MCP management projection, Agent Tool
  path, Generation Job authority, Asset ingest authority and retained Automation safety contracts.
- Activated with an explicit consumer: the Automation exact-target safety kernel currently marked as
  retained-kernel. The product consumer must be added atomically with its tests; no generic Automation
  management UI is restored.
- Replaced: no current production professional application path exists. New code must poison direct
  `shell.openPath`/raw executable launch, extension-only resource association, active-window routing,
  raw output-directory scanning and API-to-Computer-Use fallback for this capability.
- User-data impact: only new device-local application bindings and Generation Job/candidate facts are
  added. Existing Skill/MCP settings and user resources are not migrated or rewritten.

## Evaluation disposition

The behavior changes capability/tool routing and asynchronous Generation workflow, so Agent
Evaluation is required:

- Update `agent-runtime.external-automation` with an explicit ComfyUI API-plus-visual composition case
  and an API-failure-no-Computer-Use-fallback boundary case.
- Reuse `agent-runtime.creative-media-workflow` for recoverable Generation Job, candidate output and
  provenance behavior; update its provider fixture only if the existing canonical assertions cannot
  identify ComfyUI without weakening them.
- Reuse `agent-runtime.workflow-controller` for detached Job observation, cancellation and transcript
  projection.
- Add deterministic package/contract tests for direct UI paths; do not force non-Agent management
  behavior into an Agent suite.
- User-facing Agent acceptance requires a visible real Electron session, a real configured provider,
  a real local ComfyUI instance and direct image-capable review of target binding, progress, takeover,
  result and diagnostics. Key-free and hidden lanes are supporting evidence, not substitutes.

The canonical success path is DSH Tool -> exact Generation operation -> ComfyUI API Job -> verified
candidate -> explicit Asset ingest, with a separately recorded Computer Use observation when chosen.
Forbidden evidence includes final-text-only claims, screenshots as Job success, mock provider results,
raw output-directory discovery and any fallback transport.

## External facts

- ComfyUI local server routes and WebSocket messages:
  https://docs.comfy.org/development/comfyui-server/comms_routes
- ComfyUI server communication overview:
  https://docs.comfy.org/development/comfyui-server/comms_overview
- ComfyUI Desktop installation boundary:
  https://docs.comfy.org/installation/desktop/windows

These third-party routes and versions remain provider-specific adapter facts. They do not introduce an
internal OpenNeko contract or schema generation.
