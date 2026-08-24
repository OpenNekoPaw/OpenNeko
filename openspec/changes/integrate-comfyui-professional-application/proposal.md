## Why

OpenNeko currently manages DSH-owned Skill and MCP contributions, but it has no canonical product
boundary for installed professional applications. Adding application discovery, file associations,
launching, API automation or visual operation directly to the existing Extensions projection would
mix unrelated authorities and encourage one-off Desktop paths. ComfyUI is the smallest useful
vertical slice for defining that boundary because it needs local discovery, structured asynchronous
execution, visual inspection and durable output ingest at the same time.

## What Changes

- Add a unified “Capabilities and integrations” presentation with three sibling entries: Skill, MCP
  and Professional applications. Skill and MCP continue to use the exact DSH-owned projection;
  Professional applications use a separate contract and authority.
- Add a profile-gated professional application catalog. Only product-qualified profiles can be
  discovered. The catalog reports configured, installed, compatible and ready states without
  scanning arbitrary executables or claiming unsupported applications.
- Let users edit local bindings such as an approved application locator, loopback service endpoint,
  launch preference and domain-owned defaults. Vendor identity, supported operations, qualified
  third-party versions, permission policy and verification rules remain product-owned.
- Add semantic resource actions such as “Send to ComfyUI…” to the resource details surface and its
  context menu when the exact resource kind, application profile and readiness permit the handoff.
- Implement ComfyUI as the first qualified integration. Its official local HTTP/WebSocket interface
  owns workflow validation/submission, queue state, progress, cancellation, history and output
  retrieval. Computer Use remains an explicit complementary operation for visible graph, preview,
  custom-node error and UI-only interaction.
- Require explicit operation routing. API failure never silently retries through Computer Use, and a
  Computer Use observation never proves an API job or durable output succeeded.
- Keep application installation and companion Skill/MCP installation user-confirmed. Detection does
  not install or enable applications, Skills, MCP servers, custom nodes, models or Python packages.
- Add deterministic, real-runtime and visible Desktop acceptance requirements for the ComfyUI path.

## Capabilities

### New Capabilities

- `professional-application-management`: A profile-gated catalog presents and configures supported
  local professional applications without becoming Skill, MCP or arbitrary executable authority.
- `professional-resource-handoff`: Resource surfaces expose exact, semantic application handoffs and
  report launch/transfer outcomes without claiming external editing completion.
- `comfyui-professional-workflow`: ComfyUI combines authoritative local API execution with explicit,
  exact-target Computer Use observation and returns verified outputs to Generation and Assets.

## Impact

- New `@neko/professional-apps-contracts` (L0): owns canonical application profile, local binding,
  readiness, operation, handoff and presentation contracts. It contains no Electron, Node or React.
- New `@neko/professional-apps-node` (L1): owns the host-neutral catalog/application service and
  consumes exact discovery, launch and endpoint ports. It does not execute Electron or OS APIs.
- New `@neko/professional-apps-webview` (L2): owns the browser-only Professional applications catalog
  and configuration presentation.
- `@neko/generation`: owns ComfyUI workflow binding, asynchronous Generation Job lifecycle, official
  API adapter semantics and candidate output provenance.
- `@neko/generation-dsh-plugin`: contributes exact ComfyUI operations to the official DSH Tool path;
  it does not create another Agent, MCP manager or workflow runtime.
- `@neko/automation-contracts` and `@neko/automation-node`: gain the first production consumer for the
  retained exact-target Computer Use safety kernel. They continue to own target, grant, action and
  evidence policy rather than ComfyUI business facts.
- `@neko/assets-domain`, `@neko/assets-node` and resource presentation consumers: resolve semantic
  handoff actions and explicitly ingest a verified output as a new Asset/candidate.
- `@neko/host`: owns the Window scene/navigation composition and application settings integration; it
  does not own professional application catalog facts or execution.
- `apps/neko-desktop`: adds only Electron sender/path/window/permission/process adapters, preload IPC
  and product wiring that require the Desktop trust boundary.
- Existing DSH Skill/MCP storage, discovery, connection and `AgentExtensionManagementProjection` are
  unchanged. No user content is migrated. New device-local bindings are created only after explicit
  user configuration and never persist raw absolute paths, secrets or OS window handles.

## Out of Scope

- Automatic installation or updating of ComfyUI or any other professional application.
- Automatic installation/enabling of a Skill, MCP server, custom node, model or Python dependency.
- Arbitrary LAN/public ComfyUI endpoints, Comfy Cloud and unqualified community MCP servers.
- Production adapters for Photoshop, Krita, DaVinci Resolve, CapCut, Blender, Godot, Unity, Unreal,
  Live2D or Office. They require separate tool-specific OpenSpec changes after this contract is
  proven by ComfyUI.
