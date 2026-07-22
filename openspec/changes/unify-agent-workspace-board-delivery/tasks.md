## 1. Shared Delivery Contract

- [x] 1.1 Audit current Agent artifact snapshots, task-result refs, ContentAccess evidence, Canvas projection DTOs, `@neko-canvas/domain` exports, LocalMetadata task repositories, and existing UI diagnostics; record the exact reused owners and the single owning surface for retry/discard.
- [x] 1.2 Define versioned batch delivery, artifact role, process provenance, destination, state, receipt, claim, and diagnostic contracts in the shared public boundary without adding Canvas target state to Agent core.
- [x] 1.3 Replace the single-artifact Workspace Board planning input with a batch-capable contract while retaining only the minimum migration fixture needed to poison and remove the old success path.
- [x] 1.4 Add strict validators for stable workspace/artifact identities, source/analysis/output roles, ResourceRef/document refs, Markdown artifacts, explicit targets, and forbidden runtime/local-secret values.
- [x] 1.5 Add contract tests proving valid Markdown/material/generated batches, whole-batch rejection, no active/recent target fields, stable idempotency identity, and no unsafe assertions or runtime path persistence.

## 2. Canvas Batch Projection

- [x] 2.1 Implement a pure batch planner that atomically creates or reuses top-level source, analysis, and output content nodes plus deterministic creative connections with portable provenance.
- [x] 2.2 Preserve `.nkc` layout authority by making replay no-op for an existing matching batch, conflict for mismatched identity/revision, and never rebuilding or restoring user-edited/deleted nodes from delivery history.
- [x] 2.3 Make batch application atomic and test invalid child data, occupied Group/node identities, runtime value rejection, deterministic initial layout, and crash replay after Canvas commit.
- [x] 2.4 Keep explicit ordinary `.nkc` authoring on its existing revision-bound path and add path tests proving it does not enqueue or mirror a Workspace Board batch.

## 3. Local Metadata Ledger And Fencing

- [x] 3.1 Implement a Canvas-owned `WorkspaceBoardDeliveryLedger` over injected `LocalMetadataStore` `tasks` / `task_checkpoints` repositories using reserved delivery and writer keys; do not add migrations, tables, workspace DB, JSON store, or raw SQL exposure.
- [x] 3.2 Implement strict parsers and state transitions for queued, claimed, projected, noop, blocked, conflict, discarded, holder epoch, expiry, attempt, target revision, and compact projected receipt payloads.
- [x] 3.3 Exclude Canvas delivery rows from Agent TaskManager listing, `/tasks`, work-item projection, task continuation, and generic completed-task cleanup while preserving workspace partition backup/integrity behavior.
- [x] 3.4 Implement transactional enqueue, target-scoped claim/takeover, fenced result commit, retry, discard, and pending scan with `BEGIN IMMEDIATE` semantics through the existing LocalMetadata transaction contract.
- [x] 3.5 Add Node and Bun SQLite contract tests for cross-Host visibility, duplicate enqueue, distinct concurrent deliveries, expired lease takeover, stale epoch rejection, corrupt/unsupported store diagnostics, and absence of fallback storage.

## 4. Host-Neutral Canvas Coordinator

- [x] 4.1 Add `WorkspaceBoardDeliveryCoordinator` and a minimal Canvas document mutation port to `@neko-canvas/domain`, with injected ledger, file/editor mutation, workspace identity, holder identity, clock, and diagnostics.
- [x] 4.2 Implement enqueue → fenced claim → latest revision load → batch plan → atomic Canvas commit → receipt ordering, ensuring receipt never precedes `.nkc` commit.
- [x] 4.3 Add fault-injection tests for crash before Canvas write, crash after Canvas write before receipt, duplicate recovery, stale revision re-plan, non-mergeable conflict, and lost-update prevention across two coordinator instances.
- [x] 4.4 Add an explicit missing-Board path that creates an empty `workspace.nkc` only for pending deliveries and tests that completed receipts are not replayed as automatic historical recovery.
- [x] 4.5 Export the Canvas domain coordinator through one public package boundary usable by VS Code and Node/Bun Hosts without exposing Extension/Webview internals to Agent packages.

## 5. TUI And Headless Host Integration

- [x] 5.1 Add the Node/Bun Canvas mutation adapter using the shared ProjectFileStore/codec and the TUI user-level LocalMetadata binding.
- [x] 5.2 Replace `NodeWorkspaceBoardProjector` and generated-asset-only direct writes in `NodeMediaTaskDeliveryHost` with the shared coordinator and batch delivery result contract.
- [x] 5.3 Wire TUI startup and workspace/Board open to resume eligible pending deliveries, keep delivery recovery separate from Pi transcript/checkpoint recovery, and fail visibly when workspace identity or LocalMetadata is unavailable.
- [x] 5.4 Add TUI tests proving generated output, Markdown/material batch, background resume, duplicate no-op, explicit target no-mirror, and legacy Node direct-writer poison.

## 6. VS Code Canvas And Agent Host Integration

- [x] 6.1 Add the VS Code Canvas mutation adapter using `createVSCodeProjectFileIoAdapter`, CanvasEditorProvider authoritative document state, and the same coordinator/ledger contracts.
- [x] 6.2 Make an opened Workspace Board document own/renew the target writer lease, apply projected data through the editor owner, and leave other Hosts pending until safe takeover; test dirty/stale revision conflicts without overwriting user edits.
- [x] 6.3 Replace Agent Extension `WorkspaceBoardProjectionHost.projectGeneratedAssets()` and media stream/turn call sites with generic batch enqueue/flush, preserving separate artifact-durable and Board-delivery diagnostics.
- [x] 6.4 Add Extension integration tests for no open Webview, Board open, Board dirty/stale, competing Host claim, Canvas extension unavailable, permission failure, restart resume, and removal of active/recent Canvas fallback.

## 7. Agent Typed Artifact Collection

- [x] 7.1 Implement a domain-neutral terminal artifact collector that composes existing artifact snapshots, Tool/task result refs, ContentAccess/Perception evidence, and generated-output lifecycle facts without importing Canvas implementation or destination state.
- [x] 7.2 Prove source usage from successful runtime evidence and exclude unconsumed attachments, open files, search candidates, mentions, ordinary replies, reasoning, logs, provider scratch, runtime handles, and non-reviewable failures.
- [x] 7.3 Produce stable named Markdown delivery artifacts with content digest/revision and safe provenance; ensure pending payload is retained only until Canvas projection and projected receipts no longer duplicate Markdown body.
- [x] 7.4 Integrate synchronous turn finalization, terminal background task delivery, TUI continuation, and VS Code media/artifact delivery so each terminal batch is submitted once with the original run/task identities.
- [x] 7.5 Add regression tests proving Agent core remains destination-neutral, generated files remain durable when Board delivery fails, and Board delivery success cannot be inferred from artifact success or final-answer text.

## 8. Presentation And Legacy Path Removal

- [x] 8.1 Project queued/claimed/projected/noop/blocked/conflict status and redacted diagnostics to existing TUI/VS Code result surfaces without exposing DB path/table, absolute paths, Markdown body, lease holder value, token, or raw SQLite error.
- [x] 8.2 Remove the generic current-result `Send to Canvas` success path while preserving explicit historical/external `requestCanvasAuthoringHandoff` and professional semantic authoring.
- [x] 8.3 Delete the generated-asset-only Host API, duplicated TUI direct projector, runtime generated-draft compatibility, and any default-success fallback; add architecture/debt guards proving removed paths cannot compile or return success.

## 9. Evaluation And Runtime Acceptance

- [x] 9.1 Update Evaluation coverage index/change selector with an explicit Workspace Board delivery behavior owner and update `agent-runtime.creative-media-workflow/generated-output-workspace-board` for ledger, coordinator, flat content identity, receipt, and no-legacy-writer evidence.
- [x] 9.2 Add `workspace-board-material-analysis` to `agent-runtime.creative-media-workflow` with an isolated fixture, actual selected-material evidence, unselected-material omission, named Markdown artifact, top-level content nodes/connection, and no Send-to-Canvas/active-target/visual-Group fallback assertions.
- [ ] 9.3 Add `workspace-board-delivery-resume` to `agent-runtime.workflow-controller` for first-Host termination, second-Host fenced takeover, identical delivery identity, single Canvas effect, and terminal idle evidence.
- [x] 9.4 Extend evaluation-neutral TUI facts with bounded/redacted delivery status, artifact role counts, target kind, writer epoch, Canvas revision/node IDs, diagnostics, dropped counts, and legacy fallback counters.
- [x] 9.5 Run `pnpm test:agent:eval` and focused dry-runs, then run the three real TUI cases when credentials/network/model access are available; record report paths, effective identities, blocked stages, no-fallback evidence, and residual risk without claiming dry-run as behavior acceptance.
- [ ] 9.6 Add a focused Extension Development Host functional scenario covering an opened Workspace Board, background/TUI pending delivery, writer ownership, visible flat content graph, user movement preservation, and safe conflict diagnostics; do not substitute a browser/Vite run.
- [x] 9.7 Restore canonical core ownership of the `group` Webview renderer, remove the Storyboard-only registration, add a no-subsystem regression test, and prove in `~/Git/neko-test` under `Debug Dev (All)` that an ordinary Group does not render as unsupported.
- [x] 9.8 Stabilize and localize the earlier processing-Group path and prove its non-overlap/i18n behavior in external `~/Git/neko-test` Debug Dev; section 11 subsequently replaces Group creation while retaining legacy Group rendering.

## 10. Documentation And Quality Gates

- [x] 10.1 Update Agent and Canvas architecture/README documentation with typed batch delivery, default-vs-explicit destination, LocalMetadata ledger, `.nkc` authority, fenced writer, historical handoff, and failure semantics.
- [x] 10.2 Update the local metadata SQLite ADR to document Canvas delivery tasks as an allowed use of existing `tasks/task_checkpoints`, explicitly excluding new tables, workspace DB, transcript outbox, Board reconstruction, secrets, and generic task UI ownership.
- [x] 10.3 Run focused shared/Canvas/Agent/TUI/Extension tests and typechecks, then `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, `pnpm check:unused`, and `git diff --check`; fix only regressions introduced by this change.
- [x] 10.4 Record all executed commands, producer/consumer and path-level coverage, real Evaluation/Extension Host results, unexecuted blockers, user-data migration disposition, and remaining concurrency/recovery risk in the change verification artifact before declaring completion.

## 11. Flat Creative Content Graph Replacement

- [x] 11.1 Replace the processing-record visual decision in proposal/design/spec with a flat creative content graph: delivery remains the atomic ledger boundary, while Inbox/Task/Run remain non-visual provenance; define canonical content and relation identities plus legacy Group preservation.
- [x] 11.2 Add failing contract/planner/Webview tests for no generated Group nodes, cross-delivery stable-reference deduplication, deterministic `derived-from` connection deduplication, unresolved dependency rejection, user layout preservation, and complete image contain rendering.
- [x] 11.3 Replace the Group planner with the single flat canonical path, remove `deliveryId` from content node identity, reuse matching legacy or flat nodes by canonical content identity, and atomically create deterministic relations without moving existing nodes.
- [x] 11.4 Make Workspace Board inline image previews use contain semantics while preserving uniform node cards and existing fullscreen behavior.
- [x] 11.5 Update Agent/Canvas documentation, Evaluation expectations/facts, and migration notes from processing Groups to flat deduplicated nodes and relations; poison new Inbox/Run Group creation in path tests.
- [x] 11.6 Run focused producer/consumer/typecheck/quality gates, then prove the real visual and interaction path only in external `~/Git/neko-test` under `Debug Dev (All)` with full-image visibility, no generated Groups, reference deduplication, visible relation, and preserved user movement. The replayed relation batch left the `.nkc` byte-identical, proving existing layout/content was not rewritten; unrelated dirty-worktree typecheck blockers are recorded in `verification.md`.
- [x] 11.7 Reproduce and fix duplicate source-file nodes when one portable file is observed through weak and hashed ResourceRefs; prefer the strongest durable observation, preserve existing user layout, and verify the real Board only in external `~/Git/neko-test` under `Debug Dev (All)`.
- [x] 11.8 Preserve portable intrinsic dimensions for generated and `ReadImage`-referenced images, size only newly projected image nodes to the source aspect ratio, preserve existing creator sizing on replay, and verify the real Board only in external `~/Git/neko-test` under `Debug Dev (All)`.

## 12. Native Image Analysis Board Finalization

- [x] 12.1 Add a red regression proving successful `ReadImage.analysis` currently leaves ordinary final Markdown outside the terminal delivery batch and misclassifies the image evidence.
- [x] 12.2 Finalize explicitly declared native image analysis as one stable named Markdown artifact with source image roles and deterministic `sourceArtifactIds`, while keeping unrelated final answers excluded.
- [x] 12.3 Cover Agent collector plus TUI and VS Code terminal-turn consumers, and update the owning real Agent Evaluation case with no-fallback evidence.
- [x] 12.4 Run focused tests/typechecks, key-free Evaluation gates, the focused real TUI case, and Extension Development Host Board acceptance; record blockers and residual risk.
