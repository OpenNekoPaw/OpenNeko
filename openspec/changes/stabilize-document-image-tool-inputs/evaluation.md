## Evaluation Scope

- Change: `stabilize-document-image-tool-inputs`
- Decision: update `agent-runtime.stream-delivery` with the focused `document-image-native-delivery` regression case.
- Canonical path: TUI input queue -> Pi Tool schema -> `ReadDocument.imageInfo[].resourceRef` -> `ReadImage` document entry -> Host-loaded Pi image content -> terminal answer.
- Forbidden fallback: whole EPUB bytes, fabricated source/path identity, conflicting-path selection, cache/scratch paths, and metadata-only Tool imitation. Same-item top-level `entryPath` normalization is the bounded canonical input path when only the nested copy is omitted.

## Cases And Evidence

- The original committed fixture used by the first acceptance run contained one synthetic EPUB image with code `N7Q4`; its historical fixture digest was `sha256:7f279eafa51fb9e8ad567344708e6dd6c13afee014d6af896d24801a04e6409b`.
- Deterministic tests prove the Host loader output remains an `ImageContent` block in the next Pi `streamSimple()` context and becomes an OpenAI-compatible `image_url` block in the NewAPI request body.
- `pnpm test:agent:eval` passed 39 files / 278 tests and discovered 23 suites / 49 cases.
- Real run `agent-runtime.stream-delivery/document-image-native-delivery/run-mrureqrs` passed with `nekoapi-chat/gpt-5.6-luna` and effective configuration digest `sha256:bf0bd9c0f7f23a4a2dfa0e8af66fdefdb510388856d37ff13b3a87b4ce543b6c`.
- All seven hard gates passed: runtime, idle, Pi runtime identity, ReadDocument, ReadImage, Tool order, and final `N7Q4` answer. The run recorded two successful Tool calls, zero Tool failures, zero retries, and no dropped runtime facts.
- Raw reports remain gitignored under `reports/agent-eval/agent-runtime.stream-delivery/document-image-native-delivery/run-mrureqrs/`.

## Interpretation

The earlier run `run-mrur26br` reached the same canonical Tool path and accurately described the page colors but read the original 5x7 `N` glyph as `H`. Direct pixel inspection confirmed that fixture glyph was visually ambiguous. The fixture now uses a wider 7x7 diagonal `N`; the passing rerun demonstrates that the prior failure was fixture quality, not missing native image delivery.

## Verification

- Focused Content runtime/tool tests: 12 passed.
- Focused Agent schema, Tool projection, conversation context, and provider wire tests: 68 passed.
- Focused TUI Host content/perception loader tests: 19 passed; focused Extension bootstrap test: 1 passed.
- Assets linked-library compatibility/search/link/tree tests: 10 passed; Preview protocol/server tests: 34 passed.
- `pnpm test:agent:eval`: 39 files / 278 tests passed; 23 suites / 49 cases valid.
- `pnpm build`: 10/10 tasks passed.
- `CI=1 pnpm test`: 25/25 tasks passed. An earlier run executed concurrently with build/check and timed out in two existing ModelViewer tests; the isolated ModelViewer file (6 tests), full Preview package (44 files / 337 tests), and final non-concurrent repository run all passed.
- `pnpm check`, `pnpm check:unused`, `pnpm check:legacy-debt`, `pnpm check:legacy-debt:ledger`, and `pnpm check:quality`: passed. The debt scanner now excludes gitignored `reports/` runtime evidence, matching report governance; its 16-case self-test passed.
- Strict OpenSpec validation passed for both `stabilize-document-image-tool-inputs` and `adopt-workspace-linked-media-libraries`; repository quality validation passed all 34 OpenSpec items.

## Residual Risk

- This is one real provider/model sample. It proves the canonical delivery path but does not establish cross-model OCR stability.
- No Judge or baseline stage applies to this deterministic hard-gate regression case.

## 2026-07-22 Batch Omission Follow-up

- A reported 10-image call retained every top-level `entryPath` but omitted nested `resourceRef.entryPath` from images 5-10. Deterministic regressions now reproduce that shape and require all 10 native entries to load; conflicting paths and complete absence remain fail-visible before ContentAccess.
- The first focused run, `read-image-entry-normalization-20260722`, launched a stale `apps/neko-tui/dist/main.js` bundle and reproduced the old two-branch schema rejection. This is build freshness evidence, not target behavior evidence.
- After `pnpm --filter @neko/app-tui build`, run `read-image-entry-normalization-built-20260722` used `nekoapi-chat/gpt-5.6-luna`, observed two successful Tool calls, normalized the omitted nested path in the ReadImage result, delivered native image content, and passed runtime-error, idle, ReadDocument, ReadImage, Tool-order, and final-answer gates.
- The rebuilt run remains overall `case-fail` solely because the existing Pi identity assertion expects `turnDurability=durable` while the current virtual-workspace debug runtime reports `volatile`. That independent suite/runtime contract mismatch was not rewritten to manufacture a pass.
- `pnpm test:agent:eval` passed 39 files / 280 tests and validated 24 suites / 52 cases after the follow-up.

## 2026-07-22 Content Locator Delivery Follow-up

- The reported storyboard call supplied a valid `document-entry` `contentLocator`, but the native image attachment projected only a synthetic `content:[key]` URI. The TUI perception loader treated that display URI as a provider source and returned `Agent content source does not resolve to a stable content locator.` after the first direct content read had already succeeded.
- Deterministic red/green regressions now require ReadImage to retain `contentLocator` in `PerceptualAssetRef`; TUI and Extension loaders call `loadContentAsset` directly and assert that provider fallback is not invoked. Invalid explicitly supplied locators also fail at `images[n].contentLocator` before a sibling `resourceRef` can run.
- The first real run, `content-locator-no-fallback-20260722`, was infrastructure-fail because the TUI tsup banner and a bundled dependency both declared `createRequire`. The banner import now uses a private alias and `node --check apps/neko-tui/dist/main.js` passes.
- The intermediate run, `content-locator-no-fallback-built-20260722`, reproduced the attachment identity loss with two Tool calls: ReadDocument succeeded, ReadImage reached the content path but native projection failed with the reported diagnostic. The evidence also showed the existing case still asserted the retired `resourceRef` output.
- After rebinding the case to canonical `contentLocator`, `content-locator-delivery-fixed-20260722` passed all seven hard gates with `nekoapi-chat/gpt-5.6-luna`, configuration digest `sha256:bf0bd9c0f7f23a4a2dfa0e8af66fdefdb510388856d37ff13b3a87b4ce543b6c`, two successful Tool calls, zero Tool failures, and zero retries.
- Final gates passed: focused Content/TUI/Extension/Agent tests, `pnpm test:agent:eval` (39 files / 280 tests; 24 suites / 52 cases), `pnpm build` (9/9), `CI=1 pnpm test` (24/24), `pnpm check`, `pnpm check:unused`, `pnpm check:legacy-debt`, `pnpm check:content-access-boundaries`, strict OpenSpec validation, TUI bundle syntax validation, and `git diff --check`.

## 2026-07-22 Bounded Image Transport And Webview Preview Follow-up

- Authoring decision: `update` the existing `agent-runtime.stream-delivery/document-image-native-delivery` regression because it already owns ReadDocument -> ReadImage -> Host native multimodal delivery. The coverage delta replaces the one-image fixture with two ordered pages and adds bounded labeled contact-sheet delivery; no new suite owner is required.
- The current synthetic EPUB contains two image entries with codes `N7Q4` and `Q47N`. The EPUB file digest is `sha256:dff9a3918ef47c10af13a615064a052412878906cb5621c15b6bb372932b53ba`; the Evaluation fixture-directory digest is `sha256:0ee348f6099989e6810699fe4c13c34c37aeed6a6b3defda8958a639c36ec325`.
- Deterministic hard gates prove a maximum of 5 ReadImage sources per continuation, a maximum of 4 provider image payloads, 4 MiB per payload, 12 MiB total, shared VS Code/TUI contact-sheet composition, exact source-index coverage, single-image long-edge normalization, and fail-visible missing batch projection or oversized payloads. Provider-bound tests also prove that multi-image delivery calls the Host batch projector once instead of emitting one image part per source page.
- Extension/Webview projection tests prove locator-only ReadImage attachments receive runtime-only bounded WebP preview URIs, duplicate refs load once per projection, original refs are not mutated, and failed preview projection remains visible as an ordered diagnostic placeholder. This preview data is not a durable ResourceRef, conversation fact, or provider payload.
- `pnpm test:agent:eval` passed 39 files / 280 tests and validated 24 suites / 52 cases. The focused dry-run resolved the updated suite, case, and fixture digest before the real run.
- Real run `bounded-image-transport-20260722` reached the canonical two-Tool path and the model correctly returned both tile codes, but the case was retained as `case-fail` because its ReadImage assertion incorrectly required a retired top-level `entryPath` in addition to canonical `contentLocator`. This was an Evaluation authoring false negative, not a production behavior failure; both Tools, the Pi runtime, final answer, idle state, and runtime diagnostics gates passed.
- After correcting only that assertion to match the canonical ReadImage result contract, real run `bounded-image-transport-assertion-fixed-20260722` passed all seven hard gates with `nekoapi-chat/gpt-5.6-luna`, effective configuration digest `sha256:bf0bd9c0f7f23a4a2dfa0e8af66fdefdb510388856d37ff13b3a87b4ce543b6c`, two successful Tool calls, zero Tool failures, zero retries, 17,706 input tokens, and 167 output tokens. The final answer identified `N7Q4` and `Q47N` in tile order and described both page palettes.
- The current debug fact contract does not expose raw provider image-part count or encoded byte totals. Those transport invariants remain owned by deterministic Pi bridge and Host tests; the real sample proves observable two-tile behavior through the canonical TUI/provider path. Judge and baseline stages do not apply to this deterministic regression.
- Extension Development Host acceptance used the isolated `neko-test` workspace and the real `neko.neko-agent` Webview. Expanding a hydrated historical ReadImage result rendered 11 ordered `data:image/webp;base64` previews with a 240-pixel maximum edge and no Neko preview/CSP error. Historical results are not rewritten to the new limit; new ReadImage continuations select at most five source images.
- Final deterministic verification passed after the five-source limit: Content 17/17, Pi bridge 20/20, Extension projection 16/16, Webview presenter/component 12/12, TUI Host loader 7/7, and adjacent ContentAccess/derived-storage type regressions 6/6. `pnpm test:agent:eval` passed 39 files / 280 tests and validated 24 suites / 52 cases.
- Repository gates passed: `pnpm build` (9/9), `CI=1 pnpm test` (24/24), `pnpm check`, `pnpm check:quality`, strict OpenSpec validation, and `git diff --check`. `check:quality` also exposed and then verified canonical type narrowing/file-ops fixes in the already-active ContentAccess and derived-storage migrations; no compatibility fallback was added.
