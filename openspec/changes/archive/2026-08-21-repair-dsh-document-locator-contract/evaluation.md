# Evaluation Scope

- Change/feature: strict ContentLocator-only `openneko.document` addressing and fail-visible DSH
  Tool result projection.
- Decision and owning suite: `create` `agent-runtime.perception-routing/content-locator-selected-document-content` for the exact selected-content argument contract and `content-locator-document-manifest` for whole-document manifest discovery without private fields, while retaining `content-locator-document-images` for image discovery and perception.
- Canonical path: visible Desktop submit -> flat exact `openneko.document` request -> strict Content decoder -> ACP `{ operation, input }` projection -> ACP Host -> authorized Content runtime -> failed or successful DSH Tool lifecycle -> transcript projection.
- Forbidden fallback: nested/hybrid model arguments, fuzzy filename repair, sibling search, alternate source/reader, successful JSON containing `status: "failed"`, or UI-side reinterpretation.

# Cases

- Created: `content-locator-selected-document-content` requires one successful Tool call whose recorded arguments contain the exact entry ContentLocator plus `mode: "content"`; `content-locator-document-manifest` requires one successful whole-document manifest call and poisons top-level `strategy`, `range`, and `next`. Reused: `content-locator-document-images` remains the positive real-provider scenario for image discovery and perception.
- Excluded from an additional locator-symbol-only case: deleting the retired TypeScript locator
  symbol is covered by production-source scans and package typechecks. The selected-content mode
  behavior is not excluded and has its own indexed real-provider case.
- Deterministic evidence: flat canonical arguments accepted and projected into ACP; nested and
  hybrid arguments rejected; EPUB/CBZ entry, PDF page, and DOCX text-range selectors reach the
  corresponding private reader coordinate; model-visible `range` and bare locator fields are
  rejected before runtime invocation; `content-missing` result becomes ACP failure; official DSH
  plugin throws the Host diagnostic; failed Tool projection renders the existing danger state.

# Verification

- Key-free validation: `pnpm test:agent:eval` passed with 45 files, 314 tests, 26 suites, and 69 dry-run cases, including the focused `agent-runtime.perception-routing/content-locator-selected-document-content` and `content-locator-document-manifest` cases.
- Deterministic validation: Content 148 tests, Agent Runtime 370 tests, Content DSH plugin 4 tests,
  and Desktop 611 tests passed. Relevant package/Desktop typechecks, Content/Agent/Application/Package
  boundary gates, strict OpenSpec validation, Desktop arm64 packaging, legacy-debt scan, and
  `git diff --check` passed.
- Locator-removal validation: production source contains no `DocumentLocator`,
  `parseDocumentLocator`, compatibility alias, or same-named variable. Search/Entity durable
  projections now validate complete ContentLocators; Search focused tests passed 29/29, Search local
  metadata passed 12/12, Entity passed 58/58, Preview functional tests passed 101/101, and Agent
  Webview passed 38/38. Preview viewer navigation uses a local non-address coordinate and no longer
  imports the Content reader coordinate.
- The complete Search and Preview package suites each retain one unrelated dirty-worktree
  architecture-test failure because their asserted retired Agent source files are absent. Their
  functional suites and all repository architecture boundary gates pass; this change did not alter
  those missing paths.
- The repository-wide internal-versioning audit remains red on the shared dirty-worktree baseline:
  78 existing occurrences and 16 stale allowances span unrelated Desktop, Agent, Project,
  Generation, scripts, and one pre-existing package-resource `revision` occurrence in the modified
  Content file. This change introduces no new internal version field or dispatch path; the focused
  no-version contract review confirms the new ContentLocator selectors, cursor, Tool schema, and
  Canvas artifacts contain none.
- Real before-fix evidence: DSH Session `2a71a01f-483b-419f-a72b-70d508f1716b` first emitted an incorrect EPUB locator and later emitted `range: {"start":10,"end":22}`. The exact locator had succeeded earlier in the same Session, proving the source was available. Both later failures were incorrectly projected as completed Tool calls.
- Additional before-fix evidence: a later visible Desktop run emitted `{ operation, source, input: { mode, ... } }` and DSH rejected it with `missing required property "input.source"`. This confirms that the nested model-visible shape, not the file authority, caused the call failure.
- Selected-content regression evidence: a visible Desktop run emitted the canonical flat source with
  an EPUB entry selector plus `mode: "content"`, but the Content decoder rejected it with
  `input.mode must be omitted when input.source.selector is present`. The deterministic decoder,
  ACP adapter, and official plugin tests now accept that exact argument relationship and still
  reject a selected manifest read.
- Real post-fix provider/UI evidence supplied by the user: one call that added top-level `strategy: "manifest-order"` failed visibly as unsupported input, and the immediate canonical retry without strategy succeeded and returned the EPUB manifest. This proves the live manifest parser and failure projection work, while also motivating the new no-private-field behavior case. This user-run evidence does not substitute for a repeated provider matrix.
- Direct source-level EPUB evidence: the exact workspace EPUB produced a 402-unit manifest and a targeted chapter result with text and one image through the canonical Content runtime. An isolated production Main Vite build also completed without writing the active development `.vite` directory.

# Interpretation

- The confirmed defect was a boundary mismatch, not a missing source: the public Tool exposed a
  second reader-oriented locating shape, and a non-ready content result was encoded as ACP success.
- The corrected path rejects malformed input locally and emits one failed Tool lifecycle state through ACP, DSH, transcript projection, and the existing Webview.
- No Prompt or Skill change is justified; model argument mistakes remain possible and must be handled as visible failures.

# Residual Risk

- A configured provider may still emit an incorrect locator or malformed arguments despite the richer schema. Those calls now fail visibly, but automatic model recovery has not been established.
- The post-fix red failure state has deterministic Webview coverage but no current real-provider Desktop screenshot; graphical validation remains advisory-blocked until an explicitly authorized visible run is performed.
