## Context

Workspace Board 的 durable content 和 layout 已由 `.nkc` 拥有；LocalMetadata 只保存待投递、
claim 和终态 receipt。当前剩余风险集中在 Electron Main writer ownership、进程恢复、renderer
authoritative save 与后续 delivery 的竞态。

## Five-layer analysis

- **Responsibility:** Agent finalization owns typed result/provenance; the delivery coordinator owns
  ledger and target selection; Canvas owns document mutation/codec; Desktop Main owns file authority.
- **Dependency:** Agent depends on a narrow delivery port and never imports Canvas. Renderer consumes
  projections and sends typed save intents; it never writes workspace files or LocalMetadata. Stable
  content locators are read only by the owning content runtime and published through the Desktop exact-resource
  registry; Webviews never receive raw paths or bytes.
- **Interface:** every operation carries workspace, target document, delivery, exact writer claim,
  source content fingerprint, request and artifact identity. Missing or stale identity fails visibly.
- **Extension:** explicit Canvas authoring and default Workspace Board delivery share the coordinator
  but never mirror. New artifact kinds require a stable creator-visible representation and provenance.
- **Testing:** coordinator tests prove claim fencing, idempotence and authoritative document conflicts; Electron
  scenarios prove actual Main writer, package-owned Canvas root, locator-backed image pixels, lease release and
  renderer diagnostics.

## Decisions

### Default target without active selection

Creator-visible typed artifacts without an explicit Canvas target go to
`neko/boards/workspace.nkc`. An explicit `.nkc` authoring target receives the batch exclusively. The
coordinator never consults active/recent editor state or opens a second target after failure.

### Canvas remains authoritative

The delivery ledger records pending/claimed/projected/blocked state, not Canvas content or layout.
Every write reloads the current document, verifies the source content fingerprint, applies a deterministic mutation and
commits atomically. Completed receipts never reconstruct nodes that the user later deletes.

Desktop Main validates renderer save snapshots against the current authoritative document, exact writer
claim and source content fingerprint. Missing explicit removal evidence cannot erase Host-authored nodes.
A stale writer claim, source fingerprint or sender identity fails without modifying `.nkc`.

An opened Workspace Board remains a projection of that same authority rather than a second document owner.
Desktop Main coordinates the existing exact Board sessions around the coordinator operation. Every matching
session enters its existing serial operation tail before the coordinator loads or writes the document. A dirty
session rejects the delivery before mutation; a clean session receives the committed Canvas document and emits
one projection event after the atomic save. The refresh clears stale document undo/redo snapshots so an undo or
later save cannot remove newly authoritative Agent artifacts. No filesystem watcher, polling reload, active/recent
Canvas lookup or renderer merge becomes another successful path.

### Canvas keyboard ownership after asynchronous mount

Canvas initially renders loading state before its focus-owning editor Root exists. The shared focus hook therefore
must bind to the actual HTMLElement identity rather than assuming a stable Ref object implies a mounted element.
Canvas starts keyboard-disabled while hosted, becomes enabled when the delayed Root receives pointer/focus ownership,
and stops again on Window blur or editable boundaries. Shortcut labels and dispatcher registrations must describe the
same supported actions; Select, Hand, Group, Ungroup and advertised zoom operations cannot be presentation-only text.

### Recoverable single-writer delivery

Each target uses one exact fenced writer claim. A new Desktop process may atomically replace an eligible
expired claim with a new claim identity and the same delivery identity. Old holders cannot commit. Retry after a recoverable
block reuses the same identity and produces one Canvas effect or one current diagnostic.

### Bounded visible graph

Stable source and artifact identities deduplicate across deliveries. Proven dependencies produce
deterministic connections. Multi-item generated batches may create one editable display Group; user
movement and existing layout remain authoritative. Delivery/Job state never becomes a visual Group.

### Production composition and terminal ownership

Agent terminal finalization collects typed artifacts and calls one narrow Host delivery port. Agent does
not import Canvas and an ordinary file-write callback does not write the Board. Desktop Main composes a
Canvas-owned `WorkspaceBoardDeliveryCoordinator` per exact Workspace from the user-level
`LocalMetadataStore`, an exact Workspace Board mutation port, and one process holder identity. Both the
bound Draft/session controller and background Generation terminal owner submit through this composition;
missing Workspace authority blocks only that delivery and never selects an active or recent Workspace.

### Stable locator display projection

Agent Tool results may retain a transient representation handle for current-Surface display, but creator-visible
artifacts and Canvas nodes retain only `ContentLocator` as durable identity. The Agent workspace content runtime is
the canonical reader for Agent result projection; Canvas uses the same package-owned content read contract for its
exact Workspace. Desktop Main only adapts already authorized bytes or files into the exact-resource registry and
returns a sender-bound `openneko://resource` URL. It does not parse EPUB/CBZ/PDF/DOCX or reconstruct selectors.

The display URL is presentation state only. It is never written to transcript, Tool output, delivery ledger or
`.nkc`. Agent leases are owned by the exact projection attachment and connection. Canvas preview leases are owned by
the exact Window/View/session/renderer identity plus source and role, and are released when that Surface detaches or
is replaced. A failed locator is projected as a local diagnostic on its own card or node while valid siblings remain
available.

File-internal selectors preserve the addressable archive/document position. A transient representation handle is
read as the represented pixels for the current Surface and is never persisted or substituted as a durable source.
The resource registry remains the single authorization and transport boundary for direct files, selected document
content and computed representations; no data URL, temporary extraction file, raw absolute path or legacy media
scheme becomes a second successful display path.

Agent, Canvas, Resource Browser and Asset Center SHALL NOT construct `PreviewMediaDescriptor` records or choose
file-versus-bytes transport independently. A package-owned Preview resource projection service accepts the stable
locator, exact Surface owner and presentation metadata, asks one injected source resolver for the authorized source,
registers that source through one injected exact-resource port and owns the resulting descriptor/lease lifecycle.
The source resolver may return a seekable file source for ordinary image/audio/video files or an authorized byte
source for archive entries and computed representations; this is one locator-driven transport decision inside the
same service, not a Surface-specific preview path.

Lightweight and full Preview remain presentation modes over the same `PreviewMediaDescriptor` and viewer kernel.
Agent/Canvas/Resource Browser use lightweight chrome, while the main Preview panel uses full controls and a durable
presentation snapshot. Neither mode may fall back to raw `<img src>`, a separately created `<audio>`/`<video>`, a
local path or an independently authorized resource when descriptor projection fails. Per-resource failure stays
visible on that Surface and valid siblings continue through the same service.

## Acceptance

Use isolated Electron fixtures to prove process takeover, one Canvas effect, visible flat content graph,
user layout preservation, conflict diagnostics, authoritative save protection and a subsequent
Generation delivery. Browser-only and direct codec tests do not replace Main/renderer path evidence.

Agent Evaluation disposition is `update`: reuse `agent-runtime.workflow-controller` for the canonical Agent Turn ->
typed artifact -> exact Workspace Board path, and extend the visible Desktop case to prove an already-open clean Board
updates without reopen while a dirty Board blocks before durable mutation. Keyboard behavior is deterministic Canvas
UI coverage plus the same visible Desktop fixture; it does not alter Agent prompts, Skills, model selection or Tool
routing.
