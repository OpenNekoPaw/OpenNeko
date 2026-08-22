# W7 Document Parent Source Projection

## Evaluation disposition

- Decision: `update` the existing Workspace Board projection coverage owned by
  `agent-runtime.workflow-controller`; no new suite, product Evaluation runtime or Agent prompt rule is
  introduced.
- User behavior: a successful document/image Tool call that reads content inside EPUB, PDF, DOCX or
  CBZ immediately shows one stable document node and the exact selected chapter/page/range/image under
  that parent on the Canvas chosen for the turn.
- Canonical path: completed DSH Tool event -> `@neko/agent-runtime` source collector -> exact
  `ContentLocator` root/detail artifacts -> Desktop typed delivery -> Canvas projection/deduplication.
- Forbidden paths: selector-only orphan nodes, image-only wrapper nodes, extracted or absolute path
  identity, fingerprint identity, active/recent Canvas fallback, terminal-turn-only delivery, or a
  second document locator contract.
- Expected evidence: deterministic collector tests prove root/detail identity and relations for entry,
  page and image locators; Desktop projection tests preserve the relation; Canvas tests continue to
  prove dependency ordering and content-identity reuse. Visible Electron acceptance must observe the
  parent and selected child without reopening the Canvas.

## Status

Implemented. The source collector now emits the selector-free root before each selected document
source, records the root artifact identity in `sourceArtifactIds`, merges relations while deduplicating
the canonical locator, and continues to replace image-only wrapper entries with their declared image
locators. Direct `openneko.read_image` calls use the same root/detail rule. The Canvas planner's existing
relation reconciliation also backfills the missing parent connection when a selector-only node was
created by an earlier delivery.

Verification completed on 2026-08-22:

- `pnpm --filter @neko/agent-runtime exec vitest run src/application/dsh-workspace-board-artifact-delivery.test.ts`
  — 34 tests passed, including EPUB, PDF, DOCX, CBZ and direct image reads.
- `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-dsh-workspace-board-delivery.test.ts`
  — 9 tests passed; incremental and terminal projection reuse one parent/detail graph, and an existing
  selector-only node gains the missing parent relation without duplication.
- `pnpm --filter @neko/canvas-domain exec vitest run src/utils/__tests__/canvasWorkspaceBoardProjection.test.ts`
  — 13 tests passed.
- `pnpm --filter @neko/agent-runtime typecheck`, `pnpm --filter @neko/app-desktop typecheck` and
  `pnpm --filter @neko/canvas-domain typecheck` passed.
- `pnpm exec openspec validate replace-pi-with-dsh-runtime-atomically --strict` passed.
- `node scripts/agent-eval/all-suite-dry-run.mjs --suite agent-runtime.workflow-controller --case workspace-board-delivery-resume`
  passed one indexed case. This is schema/harness evidence, not provider-backed Agent acceptance.

Visible Electron acceptance was not run in this change because the shared checkout contains another
active implementation. The remaining user-visible risk is limited to observing the new parent/child
nodes without reopening the Canvas; deterministic Desktop and Canvas projection paths pass.
