## Evaluation Scope

- Change: `stabilize-document-image-tool-inputs`
- Decision: update `agent-runtime.stream-delivery` with the focused `document-image-native-delivery` regression case.
- Canonical path: TUI input queue -> Pi Tool schema -> `ReadDocument.imageInfo[].resourceRef` -> `ReadImage` document entry -> Host-loaded Pi image content -> terminal answer.
- Forbidden fallback: whole EPUB bytes, fabricated source/path identity, conflicting-path selection, cache/scratch paths, and metadata-only Tool imitation. Same-item top-level `entryPath` normalization is the bounded canonical input path when only the nested copy is omitted.

## Cases And Evidence

- The committed fixture contains one synthetic EPUB image with code `N7Q4`; fixture digest is `sha256:7f279eafa51fb9e8ad567344708e6dd6c13afee014d6af896d24801a04e6409b`.
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
