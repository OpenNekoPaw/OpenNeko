# W7 Current-Model Media Tool Routing Evidence

Date: 2026-08-25

## Canonical ownership and path

- The exact model selected for the current Agent Session is the only LLM authority for media understanding.
- Composer image attachments continue through the canonical sender-bound attachment admission and become native DSH image blocks for that model.
- Images discovered while a Tool is running are read only through the package-owned `openneko.read_image` Tool. The Tool returns the native image block to the same current model; it does not resolve or invoke another provider/model.
- A current model without image input fails the current submit or Tool call with an actionable diagnostic asking the user to select an image-capable Agent model. No external perception Tool, purpose binding, provider fallback or model fallback exists.
- Audio/video understanding is not advertised as an implicit capability. A future ASR, video analysis or safety operation must be owned by an explicit package Tool/service and its public contract; it must not reintroduce a Composer-level perception-model selector.

## Removed configuration surface

- `@neko/host/settings` no longer registers, resolves or projects `image.understand`, `video.understand`, `audio.understand` or `llm.vision` as configurable purposes.
- The Agent UI contract and Composer configuration menu no longer contain media-understanding status, selection callbacks, selector copy or selector styles. Image/video/audio sections retain generation-model configuration only.
- Retired TOML entries are discarded individually with a non-blocking `retiredDefaultModelPurpose` diagnostic. Valid sibling model-purpose bindings remain authoritative and are not reset.
- The public model capability contract and DSH admission now use only canonical native modality declarations. `llm.vision` and `*.understand` no longer advertise input support; a poison test proves `image.understand` alone produces a text-only DSH profile.
- The inactive `@neko/quality/model` entry, its direct LLM adapter, independently injected provider/model reference, response parser and external-perception materializer guard were deleted. Quality core retains only provider-neutral evaluator/evidence contracts.
- The disabled bundled Gemini label is now `Gemini 2.5 Flash Multimodal`, avoiding presentation as a dedicated understanding model.

## Evaluation disposition

- Updated owner: `agent-runtime.media-tool-routing`; the former suite identity and directory were deleted atomically.
- The suite now covers document image discovery followed by `openneko.read_image`, current-model native image consumption, and a text-only current model failing the image Tool locally.
- Poison assertions prohibit `perception.image.understand`, perception purpose bindings and provider/model switching.
- The suite has four cases. Key-free execution validates schema, workflow and path assertions only; it is not real model-quality or visible Desktop evidence.
- The product system Prompt now names native pixels and authorized package-owned media Tool blocks. Content Tool diagnostics use image-payload terminology rather than advertising a generic perception capability.

## Verification

- Host settings typecheck and focused/full tests passed: 40 files, 360 tests.
- Agent contracts typecheck and full tests passed: 19 files, 120 tests.
- Agent Webview typecheck and full tests passed: 9 files, 73 tests.
- Content DSH plugin typecheck and tests passed: 1 file, 5 tests. The text-only-model case proves capability rejection occurs before Host content bytes are read.
- Agent runtime typecheck and focused image-admission tests passed: 1 file, 6 tests.
- Desktop typecheck and focused provider/composer tests passed: 2 files, 15 tests.
- AI contracts typecheck and tests passed: 1 file, 2 tests. The public known-capability list rejects all four retired aliases.
- DSH bridge typecheck and tests passed: 5 files, 52 tests. Prompt poison asserts that no runtime-listed perception capability is advertised.
- Quality runtime tests passed: 4 files, 24 tests, including a source/export poison guard. Its package typecheck reaches an unrelated existing `ContentLocator.kind` assertion in `project-quality-orchestration.test.ts` and remains blocked there; the removed model adapter has no remaining import or export.
- `pnpm test:agent:eval` passed: 45 files, 315 tests; all-suite dry-run passed 27 suites and 82 cases, including four `agent-runtime.media-tool-routing` cases.
- `pnpm check:webview-boundaries`, `pnpm check:application-boundaries`, `pnpm check:strict-tsconfig`, `pnpm check:openspec` and `git diff --check` passed.
- Targeted Prettier and ESLint checks passed with no errors. ESLint retained only pre-existing non-null-assertion warnings in `config-manager.ts`.

## Quality review and residual evidence

- Risk classification: L3 because the change modifies Agent model routing, public settings/UI projections and user-visible failure behavior.
- Responsibilities remain separated: settings owns selectable model-purpose configuration, Agent/DSH owns the current Session model, Content owns image decoding and Tool results, and Webview owns presentation only.
- No new adapter, registry, cache, fallback, runtime owner or internal contract generation was introduced.
- Visible UI inventory: the removed perception selector had no authoritative runtime projection in the current composition, so its deletion has no canonical populated-state visual delta. A component test locks the remaining generation-only menu, and the Host contract test locks the `Multimodal` label. The bundled model is disabled in canonical defaults, so no authoritative enabled-state screenshot was available. The unsupported-model diagnostic and enabled-model label were not inspected in a visible Electron/provider run; UI validation is `blocked`, not passed.
- Repository-wide `check:agent-boundaries`, `check:legacy-debt`, `check:no-internal-versioning`, `check:package-boundaries` and `check:unused` remain red on unrelated pre-existing dirty-worktree Tool inventory/path, image-preview token, allowance, package-status and unused-code findings. Their self-tests and the package boundary scan itself passed where reported; none of the scoped media-routing files introduced the blocking findings. These failures were not hidden or repaired outside scope.
