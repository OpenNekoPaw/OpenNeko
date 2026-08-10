## 1. Canonical Canvas Generation Contract

- [x] 1.1 Add the strict `generation` node and `prompt | image | audio | video` Recipe/output unions to `@neko/canvas-domain`, including exact Workspace/document/session/node identities, stable submission identity, Recipe/input fingerprint, latest run binding, immutable output bindings and selected output identity without internal version fields or generic parameter bags.
- [x] 1.2 Update the single `.nkc` codec, validators, factories, authoring commands, connection endpoint rules and node sizing atomically; prove valid Generation Nodes round-trip and one invalid node fails locally while valid historical Markdown/Media/File/Job nodes and sibling records remain readable without dual-read or automatic migration.
- [x] 1.3 Implement host-neutral create, edit, run-intent persistence, JobRef binding, terminal result apply, output selection, authored-text derivation and local diagnostic transitions in the Canvas domain; test stale revisions, mismatched targets, concurrent active runs, Recipe edits during execution and failure/cancellation preserving the previous selected output.
- [x] 1.4 Add typed input resolution contracts that snapshot explicit text inputs and authorize media `ContentLocator`s; reject missing, mismatched, stale or unauthorized inputs and all runtime URL, blob/data URL, cache/raw path and active-selection inputs before Job submission.

## 2. Generation Job Extension

- [x] 2.1 Extend the canonical `@neko/generation` request, execution and committed-output unions with Prompt/Text generation, using a narrow Host-injected completion port and stable generated-text locator without importing Agent, Canvas, React or Electron.
- [x] 2.2 Add Workspace-scoped idempotent submission keyed by the caller submission identity; atomically return the existing JobRef for an equivalent request and reject a conflicting payload without provider execution, Job mutation or sibling Workspace impact.
- [x] 2.3 Extend persistence, recovery, observation, cancellation and artifact commit tests for Prompt/Text and idempotent submission, including crash recovery between Canvas run-intent persistence and JobRef binding, unsupported kind/model rejection and no provider/model/executor fallback.
- [x] 2.4 Replace the Agent-oriented `DirectGenerationOperationPort` consumer contract with the one canonical GenerationJob port consumed through the Canvas Generation application port and Agent Tools; add import/export and architecture poison tests proving no second submit contract, wildcard executor or direct-operation success handler remains.

## 3. Canvas Runtime And Recovery

- [x] 3.1 Replace `requestDraft`, Job-node projection and material-result regeneration in `@neko/canvas-node` with one Canvas Generation runtime that validates the exact target, resolves inputs, persists the run request, submits/reattaches to the exact Workspace Job and applies terminal outputs to the originating node.
- [x] 3.2 Implement snapshot-first monotonic Job observation, cancellation and reopen/restart reattachment without retaining a React Root; prove one non-terminal run per node, idempotent uncertain-outcome recovery and exact Workspace/document/node ownership.
- [x] 3.3 Apply successful committed outputs only to the originating Generation Node, preserving multiple outputs and selection; poison Job/Media/File/Group sibling creation, Workspace Board mirroring, active/recent Canvas fallback, deleted-node recreation and cross-document writes.
- [x] 3.4 Preserve historical generated Media/Job content and provenance as readable user data while removing its regenerate success action; test that regeneration requires an explicit new Generation Node and never mutates or converts the historical node automatically.

## 4. Canvas Webview Authoring

- [x] 4.1 Switch the package-owned add catalog so Text/Image/Video/Audio create their matching empty Generation Node, Table remains editable GFM Markdown, 3D Director remains unchanged and imported/dragged media still creates ordinary Media Nodes.
- [x] 4.2 Add one Generation Node renderer and selected-node Recipe editor with localized prompt/reference, purpose-qualified model, legal kind-specific parameter, run/cancel, progress, diagnostic, output-history and selection controls using the existing compact Canvas design tokens.
- [x] 4.3 Render Prompt/Text output and authorized Image/Audio/Video previews inside the original node; cover empty, configuring, running-with-prior-output, success, stale-Recipe, failure, cancellation, invalid binding and unavailable-input states without layout overlap or renderer fallback.
- [x] 4.4 Add Webview contract and interaction tests proving typed intents only, exact node updates, explicit-run-only behavior, no credentials/provider/file access in Renderer and no duplicate quick-generate dialog or app-owned menu/editor.
- [x] 4.5 Serialize whole-document Webview commits and narrow Host authoring intents through one per-session command queue; add a regression test proving delete-then-add keeps the deletion in returned and projected snapshots.
- [x] 4.6 Separate Generation presentation into the existing action toolbar, content-only node renderer and one selected-node input panel; cover ordinary referenced nodes, all Generation kinds, references, parameters, run/cancel, history and result fill without creating a second Canvas node.
- [x] 4.7 Refine the Canvas reference presentation: expose only Text/Image/Video/Audio in the add catalog, render empty and completed Generation Nodes with the corresponding referenced-content visual grammar, label the detached action toolbar with compact common actions, and use one wide viewport-bottom reference/prompt/model/parameter/run composer without duplicated node heading/phase.

## 5. Agent Direct-Mode Removal

- [x] 5.1 Remove Image/Video/Audio from Agent `SessionMode`, Draft/Conversation submit contracts and projections, updating all producers, consumers, fixtures and tests to one Agent conversation composer mode.
- [x] 5.2 Delete direct-generation context/provider, input projector, status UI, submit branches and related Desktop renderer/preload/Main wiring; add stale/forged renderer contract tests proving direct-mode requests fail before Conversation, Turn, Job or provider creation.
- [x] 5.3 Retain Agent Generation Tool registration, approval, purpose-qualified effective model receipt, GenerationJob/artifact projection and Workspace Board delivery; add delegation tests proving `Conversation -> Turn -> Tool Call -> exact Workspace GenerationJob -> artifact -> Board` remains the only Agent media path.
- [x] 5.4 Add deletion/poison tests for removed `DirectGenerationOperationPort`, generation SessionMode values, media-mode controls, direct provider invocation and fallback to Canvas, another provider/model or active/recent Workspace.
- [x] 5.5 Carry exact purpose-model selections through Draft first-submit persistence and normal Conversation turns, resolve generation bindings as domain models in the immutable Turn policy, and prove text-only main models retain generation Tool discovery without fallback.

## 6. Desktop Composition And Trust Boundary

- [x] 6.1 Compose the Canvas Generation application runtime in Desktop with exact sender, Workspace grant, document/session and authorized resource bindings while keeping Recipe mapping, input resolution, idempotency, result selection and recovery in their owning packages.
- [x] 6.2 Update typed Main/preload/Webview messages and sender-bound tests so stale sender, mismatched Workspace/root, invalid target and unauthorized locator fail only the current request without disabling sibling Workspaces, Canvases or Generation owners.
- [x] 6.3 Add Desktop functional recovery tests for renderer unmount, Canvas reopen, application-owner restart, in-flight Job reattachment, result apply after Recipe edits and deleted/invalid targets; prove no duplicate provider submission, active identity fallback or retained hidden Canvas Root.

## 7. Evaluation And Release Evidence

- [x] 7.1 Update and reuse `agent-runtime.workflow-controller` with one positive real Agent case that records effective provider/model, Conversation/Turn/ToolCall, exact Workspace GenerationJob terminal revision, durable artifact and Board target, plus zero direct-mode, alternate-provider/model and alternate-Workspace facts.
- [x] 7.2 Add or update the same suite's fail-visible case for a missing/stale generation binding; prove the Tool Call fails in its Conversation without Agent direct submit, Canvas routing, provider fallback or Job success, then run `pnpm test:agent:eval` as key-free authoring/harness evidence.
- [x] 7.3 Run focused package checks with `pnpm --filter @neko/canvas-domain test && pnpm --filter @neko/canvas-domain typecheck`, `pnpm --filter @neko/canvas-node test && pnpm --filter @neko/canvas-node typecheck`, `pnpm --filter @neko/canvas-webview test && pnpm --filter @neko/canvas-webview build`, `pnpm --filter @neko/generation test && pnpm --filter @neko/generation typecheck`, and the affected Agent package tests/typechecks.
- [x] 7.4 Run Desktop boundary and recovery coverage with `pnpm test:functional:headless`, `pnpm typecheck:desktop` and targeted historical-path poison tests; record canonical owner/contract/handler/adapter/authority evidence rather than result-only success.
- [x] 7.5 Use `neko-ui-validation` to run a visible real Electron acceptance inventory across desktop and compact window sizes for add menu, all four Generation Node kinds, editor states, output history, imported Media behavior and Agent composer control removal; retain screenshots and image-capable review with failures shown visibly.
- [ ] 7.6 With explicit provider/model and cost authorization, run one visible Desktop Agent natural-language media case through the actual composer and one visible Canvas Generation Node case through the actual Canvas controls; record reports, usage/cost availability and the foundational session/persistence/projection matrix cells covered, unaffected or blocked.
- [x] 7.7 Run `openspec validate add-canvas-generation-recipe-nodes --strict`, `pnpm check:openspec`, `pnpm check:package-boundaries`, `pnpm check:application-boundaries`, `pnpm check:agent-boundaries`, `pnpm check:webview-boundaries`, `pnpm check:no-internal-versioning`, `pnpm typecheck`, and `git diff --check`; document unexecuted provider/UI cases, rollback/fix-forward limits and residual risks before declaring implementation complete.
- [ ] 7.8 Re-run focused Canvas Webview/Domain tests, visible Electron desktop and compact UI acceptance for the four-item add catalog, kind-specific empty nodes, delete-then-add, labeled actions, shared viewport-bottom composer and result fill, then repeat strict OpenSpec, boundary, typecheck and diff checks for this follow-up.
