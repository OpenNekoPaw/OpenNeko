## Evaluation Scope

- Change/feature: Media Library canonical search/read, direct Creative Entity representation binding, and removal of Asset catalog fallback.
- Authoring decision:
  - `create` `agent-runtime.media-library-content` for linked-library search/read, legacy Asset rejection, and generated-output binding because no indexed suite owned the combined capability path.
  - `reuse` `agent-runtime.stream-delivery/document-image-native-delivery` for stable document-entry reading and native image delivery.
- Why real Evaluation is required: Media Library search results, Content I/O tools, and Entity binding are model-selected Agent capabilities whose path cannot be accepted from schema or unit tests alone.
- Canonical paths:
  - TUI input queue -> Project Search Media Library projection -> workspace-file locator -> `ReadImage` -> direct ContentAccess provider -> native image turn.
  - TUI input queue -> generated-output identity -> Entity query -> confirmation-gated representation binding -> persisted direct locator.
  - TUI input queue -> `ReadDocument.imageInfo[].resourceRef` -> stable document-entry -> direct document entry provider -> `ReadImage` -> native image turn.
- Forbidden fallback: `node-assets-capability`, `AssetLibrary`, `AssetEntity`, `library.json`, `asset-library` Search partition, `project://assets/`, physical-path projection, cache/materialized identity for direct source reads, or fabricated document refs.

## Cases

- Created `linked-media-search-read`: searches a committed linked Media Library fixture, reads the returned workspace-file locator, and proves the Asset catalog path did not participate.
- Created `legacy-asset-reference-rejected`: submits a legacy Asset reference and proves it fails visibly without invoking an Asset adapter.
- Created `generated-output-entity-binding`: queries a Creative Entity, confirms `BindEntityRepresentation`, and persists a direct generated-output locator with source `agent` and status `confirmed`.
- Reused `document-image-native-delivery`: reads the committed synthetic EPUB, preserves `imageInfo[].resourceRef`, reads the exact entry directly, and delivers native pixels to the Pi turn.
- Fixture: `media-library-workspace`, digest `sha256:d28afb6074e7876857cee1093d0ea3f92386c9e72b0836cd27ddfac0a702edad`; controlled link `neko/assets/Reference -> media-source`.
- Document fixture digest: `sha256:7f279eafa51fb9e8ad567344708e6dd6c13afee014d6af896d24801a04e6409b`.

## Verification

- Key-free harness: `pnpm test:agent:eval` passed 39 files / 280 tests, 24 suites / 52 cases.
- Real provider/model: `nekoapi-chat` / `gpt-5.6-luna`.
- Media Library runtime profile: `canonical-default`; effective configuration digest `sha256:446c1217e38d27f1d7d2e837b6da3a2fa8e6ee1127453507e7a5d19bb264c0bb`.
- `agent-runtime.media-library-content/linked-media-search-read/retain-media-library-linked-image-direct`: pass, all 8 hard gates including search, direct read, order, no Asset fallback, and legacy catalog absence.
- `agent-runtime.media-library-content/legacy-asset-reference-rejected/retain-media-library-legacy-rejected`: pass, all 5 hard gates including fail-visible rejection and no Asset fallback.
- `agent-runtime.media-library-content/generated-output-entity-binding/retain-media-library-generated-binding`: pass, all 8 hard gates including Entity query, confirmed binding, order, no Asset fallback, and legacy catalog absence.
- `agent-runtime.stream-delivery/document-image-native-delivery/retain-media-library-document-entry-direct-ref`: content path validated. `ReadDocument`, `ReadImage`, process order, native visual answer, runtime-error, and idle gates passed. The report outcome remains `case-fail` because the independent Pi durability gate observed `volatile` instead of `durable`; the report is retained rather than rewritten or retried into success.
- Focused regression after the document failure: TUI direct document-entry requests, with and without an explicit variant, read entry bytes without creating a cache manifest entry. Derived page-image projection remains cache-backed.

## Interpretation

- The real linked Media Library, legacy rejection, and generated representation binding cases passed with canonical path and forbidden-fallback evidence.
- The initial document runs exposed cache interception of direct document-entry reads. The canonical ContentAccess provider selection now routes Agent document-entry bytes directly while preserving cache for thumbnails, proxies, page images, and previews.
- The final document run proves the required document-entry behavior. Its remaining durability failure belongs to TUI Pi persistence evidence and is not attributed to Media Library, document Content I/O, Prompt, or Skill behavior.
- Earlier failed reports remain diagnosis evidence for fixture search mismatch, missing FDX adaptor dependency, source cache interception, and document-entry cache interception.

## Residual Risk

- FDX reading in the TUI still fails when `fast-xml-parser` is unavailable. This is a document-format adaptor dependency issue, not a Media Library locator or cache-ownership failure.
- The reused document case observed a Pi durability evidence race (`volatile` at capture time) despite successful terminal content behavior and no runtime error. Persistence acceptance remains outside this change and must not be inferred from the document-path result.
- These runs used one real sample per case and hard gates only; no Judge content-quality score or stability distribution is available.

## VS Code Extension Host Acceptance

- Host: the already-open VS Code instance launched the isolated Extension Development Host through its visible Run and Debug controls. Final CDP targets were Host `FA4213562BEFB42643AE54E161DC65F8`, Agent Webview `3C5213D86EA62D4A924F171C23AB1E4F`, and Preview Webview `6177774A12AC43E280A9F05CC83EC1E3`.
- Fixture: dedicated non-Git synthetic workspace guarded by `.fixture-id = retain-media-library-acceptance-v1`; `source-a` and `source-b` were the only permitted physical targets. The Host was stopped and the sentinel-validated fixture was removed after evidence capture.
- Isolation guard: the acceptance extension refuses any workspace without the dedicated sentinel, any target other than the fixture-local `source-a` / `source-b`, and any pre-existing Media Library other than a recoverable test-owned `Books` link.
- Result: passed 27 assertions for add/list/open/search, real Preview probing, Agent canonical path projection, unauthorized and authorized copy, locator-preserving relink, target-preserving remove, Entity bind/orphan/explicit rebind, Canvas/Cut persistence, package dereference, broken-link diagnostics, and non-Git operation.
- Media evidence: the corrected fixture used a valid 16x16 H.264 MP4 rather than text bytes with an `.mp4` suffix. Both direct probes reported `duration=0.2`, `width=16`, `height=16`, `fps=25`, and `codec=h264`; the Host status bar displayed `linked.mp4 | H264 16x16 25fps`, and the Preview Webview DOM exposed the video controls without a Neko media/CSP/resource error.
- CDP evidence: `pnpm smoke:vscode:targets -- --skill vscode-extension-debugger --expect-title neko-media-library-acceptance-clean --expect-extension-id neko.neko-agent` and `pnpm smoke:webview:targets` passed. Preview console inspection reported only VS Code's known `Unrecognized feature: 'local-network-access'` warning. The gitignored screenshot is `reports/webview-functional/retain-media-library-debugger-host.png`.
- Canonical paths were limited to `neko/assets/Books/...`; the report recorded `physicalTargetDisclosed: false`.
- The first acceptance helper incorrectly wrote `linked-media-a` text bytes to `linked.mp4` and marked open success immediately after `vscode.open`; its resulting FFmpeg error was rejected as evidence. The helper was corrected to use real binary media, compare copy/relink/package bytes, and assert `neko-preview.probeMedia` through the linked workspace path. An earlier workspace containing a synthetic `Reference` link and a user-added `B` link was also rejected after test pollution was identified. Neither rejected run was used for the final result, and no real linked target was scanned by the corrected run.

## VS Code Git Compatibility Acceptance

- Lane: Host UI / black box through `vscode-extension-debugger` and Computer Use; no Webview DOM, CSP, or message claim required CDP evidence.
- Host: the already-open VS Code instance launched an isolated Extension Development Host with only `neko-assets` and its declared `neko-engine`, `neko-tools`, and `neko-preview` dependencies.
- Fixture: dedicated non-Git synthetic workspace guarded by `.fixture-id = workspace-linked-git-compatibility-acceptance-v1`; its only managed link was `neko/assets/Test -> ../../source`. The Host was stopped and the sentinel-validated fixture was removed after the run.
- Activation with the managed link present displayed the explicit warning and actions. Accepting `Disable Git for This Folder` wrote exactly `{ "git.enabled": false }` to the fixture folder's `.vscode/settings.json`; neither `git.git.enabled` nor `git.decorations.enabled` was present.
- Running `Neko: Remove Media Library` removed only `neko/assets/Test`, retained `source/demo.txt`, refreshed the Media Library to its unconfigured state, and removed the plugin-owned `git.enabled` value so the settings file returned to `{}`.
- Focused regression passed 11 service cases covering no-link no-op, confirmation, no repeated prompt, pre-disabled Git, inherited and explicit-value restoration, later user changes, concurrent final-link removal, multi-root isolation, unregistered configuration, and write failure. `neko-assets` passed 12 files / 81 tests and its production compile passed.

## Final Validation Record

Validation date: 2026-07-22.

- `pnpm build`: passed after the final production wiring and non-Git workspace fixes.
- `CI=1 pnpm test`: the root concurrent run reached `@neko-agent/webview` and failed four unrelated UI tests only by their 5-second timeout while two large Vitest packages competed for resources. `CI=1 pnpm --filter @neko-agent/webview test` then passed all 95 files / 782 tests. This is recorded as test-orchestration instability rather than rewritten as a successful root run.
- Focused migration command over the seven legacy catalog/link migration files: passed 7 files / 36 tests. Evidence covers inspection-only reads, content-addressed immutable archive, source/revision drift, archive failure, exact confirmation, atomic apply, rollback, recovery, tamper rejection, unknown versions, ambiguous identity, missing references, non-portable paths, generated/package ownership, and metadata non-contamination.
- `pnpm check`: passed; Knip reported no blocking unused residuals and dependency-cruiser found no violations across 1,553 modules / 5,581 dependencies.
- `pnpm check:legacy-debt`: passed with zero retired Asset catalog violations and no `delete-now`, `needs-review`, or blocking non-agent findings.
- `pnpm check:quality`: passed all release, brand, debt-ledger, content, application, Agent, Canvas, Webview, strict TypeScript, local-metadata, test-orchestration, and OpenSpec gates. The debt-ledger validator retained two non-blocking warnings: one obsolete required coverage pattern and missing path coverage for the high-volume workspace-link migration file.
- `pnpm test:agent:eval`: passed 39 files / 280 tests and dry-ran 24 suites / 52 cases. This is key-free harness evidence; the real provider/model cases remain recorded separately above as `nekoapi-chat` / `gpt-5.6-luna`.
- VS Code debugger target smoke, required-Webview smoke, Host UI acceptance, Preview DOM/console inspection, and H.264 probe passed as recorded above.
- `openspec validate retain-media-library-and-unified-entity --type change --strict --no-interactive --json`: passed 1/1 with no issues.
- `git diff --check`: passed.

## Migration And User-Data Boundary

- No real user project or real linked Media Library target was migrated, scanned, rewritten, or deleted during validation. Runtime acceptance used only the sentinel-guarded synthetic fixture and removed only its test-owned link/workspace.
- Existing `library.json`, Asset-backed project references, and old binding files remain inspection inputs. A real project requires explicit inspection, immutable archive creation, exact revision/digest preconditions, dry-run review, and confirmation before writes.
- Unknown versions block migration. Ambiguous Creative Entity intent, missing references, non-portable paths without an explicit replacement, and user-authored metadata without a valid owner remain visible unresolved archive/report entries; they are not discarded, inferred, or copied into Creative Entity facts.
- After confirmed migration, recovery is explicit and preconditioned. Normal runtime does not read the archive or re-enable Asset catalog resolution.

## Adjacent Change Boundary

Status snapshot: 2026-07-22.

- This change is complete at 39/39 tasks. Its completion covers the Media Library + Creative Entity product boundary and the locator/representation contracts consumed by that boundary.
- `internalize-derived-content-storage` remains at 3/16 tasks. The content-access boundary scan passes because remaining product ResourceCache composition is explicitly migration-allowlisted; 19 production paths still require Host composition, semantic generator migration, native document-entry separation, processor ownership migration, and allowlist removal.
- `simplify-workspace-content-io` remains at 3/15 tasks and executes after derived storage internalization. The narrow locator/read/writer scaffolding exists, but `HostContentAccessService`, `HostContentIngestService`, intent/materialization routing, broad ingest providers, and consumers in TUI/Canvas/Cut remain active and exported.
- These remaining paths do not reopen Asset Library, AssetSource, `library.json`, or `project://assets/` as successful runtime paths. They are follow-up infrastructure migrations owned by their existing OpenSpec changes.
- Canonical execution order is `internalize-derived-content-storage` -> `simplify-workspace-content-io`; each change must prove old-path removal and runtime acceptance before its tasks are marked complete.

## Remaining Risks

- Root `pnpm test` can exceed individual 5-second Webview test timeouts under package concurrency even though the affected package passes alone. This should be corrected in test orchestration rather than by weakening product assertions or inflating individual test timeouts without evidence.
- FDX reading in the TUI still depends on `fast-xml-parser`, and the reused document evaluation still contains the separately recorded Pi durability evidence race. Neither belongs to Media Library locator, Entity binding, or cache ownership.
- Runtime acceptance used one small valid H.264 sample and one non-Git macOS fixture. The contract/unit matrix covers other link and migration states, but no real cloud-synchronized provider or Windows junction was exercised in this Host run.
- The two non-blocking debt-ledger warnings from `pnpm check:quality` remain repository cleanup work; neither opens a legacy Asset runtime path.
