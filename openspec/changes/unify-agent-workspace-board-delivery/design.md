## Context

Workspace Board 的 durable content 和 layout 已由 `.nkc` 拥有；LocalMetadata 只保存待投递、
claim 和终态 receipt。当前剩余风险集中在 Electron Main writer ownership、进程恢复、renderer
authoritative save 与后续 delivery 的竞态。

## Five-layer analysis

- **Responsibility:** Agent finalization owns typed result/provenance; the delivery coordinator owns
  ledger and target selection; Canvas owns document mutation/codec; Desktop Main owns file authority.
- **Dependency:** Agent depends on a narrow delivery port and never imports Canvas. Renderer consumes
  projections and sends typed save intents; it never writes workspace files or LocalMetadata.
- **Interface:** every operation carries workspace, target document, delivery, exact writer claim,
  source content fingerprint, request and artifact identity. Missing or stale identity fails visibly.
- **Extension:** explicit Canvas authoring and default Workspace Board delivery share the coordinator
  but never mirror. New artifact kinds require a stable creator-visible representation and provenance.
- **Testing:** coordinator tests prove claim fencing, idempotence and authoritative document conflicts; Electron
  scenarios prove actual Main writer, package-owned Canvas root and renderer diagnostics.

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

## Acceptance

Use isolated Electron fixtures to prove process takeover, one Canvas effect, visible flat content graph,
user layout preservation, conflict diagnostics, authoritative save protection and a subsequent
Generation delivery. Browser-only and direct codec tests do not replace Main/renderer path evidence.
