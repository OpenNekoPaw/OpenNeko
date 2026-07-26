## 1. Freeze contracts and ownership

- [x] 1.1 Inventory every producer and consumer of `PiProductAgentEvent`, `AgentEvent`, Timeline operations, mutable assistant `Message` / `ContentBlock`, legacy active-content Webview messages, projection attachments, TUI terminal rows and terminal Tool-result accumulation
- [x] 1.2 Add explicit `runId` to Timeline item, turn projection, update and patch contracts; define exact conversation/turn/run/message/projector/store ownership and lifecycle, including concurrent conversations, Tab attachment, cancellation, terminal freeze and disposal
- [x] 1.3 Finalize Timeline Tool progress/confirmation/result, provider-final content reconciliation, terminal completion and typed diagnostic contracts
- [x] 1.4 Define the one-time terminal history projection from frozen Timeline plus Pi Session checkpoint and remove `finalContentBlocks` as a new-turn fallback
- [x] 1.5 Define attachment-specific resource display projection that preserves stable `ResourceRef`, projection identity and version

## 2. Implement the host-neutral canonical projector

- [x] 2.1 Implement one `PiProductAgentEvent -> ConversationProjectionUpdate` projector under `@neko/agent` with explicit conversation/turn/run/message identity
- [x] 2.2 Add strict conversation/turn/run/message ownership, text/thinking source generation, sequence, item revision, Tool anchor, terminal and late-event validation
- [x] 2.3 Reconcile `assistant.message.completed` through typed replace/new-generation operations and reject unsupported final content visibly
- [x] 2.4 Project Tool start/update/confirmation/result into one Tool item and preserve attachments, artifacts, perception evidence and diagnostics
- [x] 2.5 Keep usage, durability, queue and Host status in their owning typed stores without allowing them to mutate conversation content
- [x] 2.6 Add focused projector/store contract tests for ordering, concurrency, duplicate/stale events, cancellation, failure, terminal freeze and immutable snapshots

## 3. Migrate the TUI canonical path

- [x] 3.1 Compose one conversation-scoped projection store/projector in each TUI hosted conversation
- [x] 3.2 Derive TUI assistant display, terminal rows and Tool states from Timeline projection instead of direct Pi conversation-store mutations
- [x] 3.3 Derive creator-visible Tool results/artifact delivery from the frozen terminal projection and delete the separate terminal Tool-result accumulator
- [x] 3.4 Remove the production Pi path through the legacy `AgentEvent` Terminal Timeline projector while retaining only pure Host presentation over canonical Timeline items
- [x] 3.5 Add/update evaluation-neutral debug facts for projection identity/version, item/terminal state and dropped/gap counts without suite/case concepts
- [x] 3.6 Add TUI instance-isolation, cancellation, terminal-idle, artifact and no-late-update regressions

## 4. Migrate Extension projection delivery

- [x] 4.1 Replace Extension-local Pi stream accumulation with the shared projector/store and remove active mutable conversation-message upserts
- [x] 4.2 Make projection attachment snapshot/ACK/patch the only active content delivery path
- [x] 4.3 Add per-attachment resource display projection without writing Webview URI or cache path into the canonical store
- [x] 4.4 Preserve exact confirmation response/cancel identities and derive Host phase/status without creating another conversation authority
- [x] 4.5 Migrate development stream acceptance to the canonical Pi projection path or delete it if it bypasses the real product owner
- [x] 4.6 Add Extension tests for attach-during-stream, queued patches before ACK, gap/fatal recovery, endpoint replacement, multi-Tab isolation, resource projection and disposal

## 5. Make Webview projection-only for active content

- [x] 5.1 Render active assistant text, thinking, Tool, confirmation, result, diagnostic and terminal state only from the Tab projection replica
- [x] 5.2 Keep Markdown registry commit atomic with projection publication and remove shared active-message/renderer-local fallback
- [x] 5.3 Remove legacy stream/tool handler registrations, message presenters and mutable streaming message state
- [x] 5.4 Keep queue, config, auth, navigation and outgoing user-operation contracts under their existing owners
- [x] 5.5 Add Webview tests for snapshot-first rendering, ordered patches, Tool item revisions, cancellation, stale attachment rejection, hidden/visible Tabs and no legacy fallback

## 6. Delete replaced surfaces

- [x] 6.1 Delete/poison legacy `streamText`, `streamThinking`, `toolCall`, `toolResult`, `toolResultBackfill`, `toolConfirmation` and `streamComplete` incoming contracts for new endpoints
- [x] 6.2 Delete Extension `activeStreams` / `activePiStreams` dual success paths, duplicate content accumulators and incremental assistant-message bridge updates
- [x] 6.3 Delete TUI direct Pi stream mutation and duplicate Tool/text projector state
- [x] 6.4 Delete `finalContentBlocks` and other active/terminal dual representation fallbacks after all supported content has a canonical projection
- [x] 6.5 Add architecture/source-absence tests proving retired handlers, routes, exports and compatibility branches cannot be rediscovered

## 7. Evaluation and runtime acceptance

- [x] 7.1 Update the `agent-runtime.stream-delivery` authoring decision, selector mapping, contract hash and evidence requirements
- [x] 7.2 Update `tool-text-order-final-answer`, `active-stream-cancellation` and `read-document-tool-result` with Timeline identity/version/terminal and no-fallback hard gates
- [x] 7.3 Add a projection gap/reattach boundary case only if the existing cases cannot prove it through the canonical TUI input path
- [x] 7.4 Run key-free harness and selected dry-runs, then the same focused real TUI cases with available provider credentials/models
- [x] 7.5 Add and run an owning Extension Development Host functional scenario using an isolated synthetic workspace for streaming Markdown, Tool confirmation/result, cancel and reattach; do not substitute browser/Vite
- [x] 7.6 Retain assertion-level reports, requested/effective model identity, projection facts, no-fallback evidence, usage/cost availability, blocked stages and residual risk

## 8. Repository verification

- [x] 8.1 Run affected Agent types/runtime, Extension, Webview and TUI tests plus producer/consumer typechecks and production builds
- [x] 8.2 Run `pnpm build`, `pnpm test`, `pnpm check`, Agent/Webview/application boundaries and strict TypeScript checks
- [x] 8.3 Run `pnpm check:legacy-debt`, `pnpm check:unused`, strict OpenSpec validation and `git diff --check`
- [x] 8.4 Update stable Agent/package architecture only if implementation reveals a contract change beyond the already accepted single-authority ADR
- [x] 8.5 Record actual validation results, blocked real cases and remaining transcript/render/Task migration risk before declaring the change complete
