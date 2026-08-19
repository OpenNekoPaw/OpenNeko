## Evaluation Scope

- Change: `simplify-content-locator-addressing`
- Decision: update `agent-runtime.stream-delivery`, `agent-runtime.creative-media-workflow`
  and `agent-runtime.workflow-controller` cases.
- Canonical path: opaque Conversation refs resolve to one internal Content operation; durable results
  contain only canonical `ContentLocator` values. Representation handles remain runtime-only.
- Forbidden path: raw locator parameters in provider schemas, old locator kinds, representation
  locator/handle persistence, absolute paths and implicit representation materialization.

## Cases

- Updated `document-image-native-delivery`, `workspace-board-material-analysis`,
  `generated-output-workspace-board`, `generation-regenerate-result-projection` and
  `media-tool-terminal-result` assertions.
- Deterministic coverage proves PDF analysis retains the original PDF locator plus Markdown,
  representation-only raster evidence is omitted, malformed durable attachments fail locally, and
  explicit derivative commit requires a new canonical locator before Canvas persistence.

## Verification

- `pnpm --filter @neko/content test && pnpm --filter @neko/content typecheck`: passed,
  21 files / 134 tests.
- `pnpm --filter @neko/canvas-domain test && pnpm --filter @neko/canvas-domain typecheck`: passed,
  36 files / 296 tests.
- Preview domain and Webview: passed, 6 files / 39 tests and 19 files / 105 tests; Webview build passed.
- Agent artifact/content/model-protocol focused tests: passed, 3 files / 41 tests; Agent runtime
  typecheck passed.
- Agent Webview: passed, 105 files / 783 tests. The package has no `typecheck` script.
- Local Metadata: passed, 16 files / 106 tests; typecheck passed.
- `node scripts/agent-eval/all-suite-dry-run.mjs`: passed, 27 suites / 84 cases.
- `pnpm test:agent:eval`: 310/311 passed. The unrelated global count fixture expects 83 cases
  while the strict index contains 84.
- Agent runtime full suite: 1025/1028 passed. The three unrelated failures are two stale route-count
  assertions expecting 37 instead of 38 and one pre-existing Chinese schema-description mismatch.
- `pnpm check:openspec`, `pnpm check:content-access-boundaries` and
  `pnpm check:agent-boundaries`: passed.
- `pnpm check:quality`: blocked at `check:no-internal-versioning` only by three unrelated dirty-tree
  poison/retirement tests containing the word `legacy`; Content/package release allowances are clean.
- Production scan contains no `ContentRepresentationLocator`, `isContentRepresentationLocator` or
  `representationLocator`. Remaining old names occur only in rejection tests, Evaluation forbidden
  field assertions and this change's design history.

## Real Execution Blocker

No explicit provider identity, model identity or cost authorization was supplied. Complete-Desktop
visible and headless provider-backed PDF-analysis/Board cases were therefore not run. Key-free
validation is not provider, visual-byte or Board behavior acceptance.

## Residual Risk

- Real provider routing, provider-received raster bytes and visible Desktop Board delivery remain
  unverified until an authorized provider/model/cost run is available.
- The unrelated dirty-tree failures above prevent a green aggregate `check:quality` and
  `test:agent:eval` result even though their locator-focused sub-gates pass.
