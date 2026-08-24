## Risk classification

L3: the change affects Agent capability routing, an executable MCP trust boundary, persistent user
configuration, native directory selection and the packaged DSH dependency closure.

## Review findings

Two blocking findings from follow-up review were resolved:

- Skill add/enable/remove no longer calls unconditional runtime restart. It requests the existing
  active-work-aware configuration refresh, which preserves an active turn and blocks new work until
  canonical subprocess replacement completes.
- MCP add/enable/disable/remove now shares one DSH-owned mutation tail. Persistence and official
  Loader reconciliation complete before the next mutation or an already-enqueued read projection,
  preventing multi-window lost updates and memory/disk/Loader drift.

No remaining blocking finding was identified in this requested follow-up scope. The canonical owner
remains DSH; Desktop is a sender-bound adapter and no second catalog or mutation path was added.

The MCP queue preserves fail-visible behavior: the failing caller receives the original rejection,
while a later independent mutation remains executable. A read already ordered after a mutation waits
for its persistence and Loader result instead of projecting an intermediate snapshot.

## Verification

- DSH bridge: 5 files / 51 tests, typecheck and bundle build passed.
- Desktop focused runtime, lifecycle Host, native Skill import and profile materializer: 4 files / 23
  tests passed; Desktop typecheck passed.
- `check:application-boundaries` passed for 1,372 files with zero findings.
- Official MCP package resolves from the DSH bridge closure at precisely locked
  `@deepseek-ai/dsh-mcp-client@0.1.0-rc.8`.
- Key-free Agent Evaluation passed 45 files / 315 tests and 27 suites / 84 dry-run cases. It is not
  provider-backed behavior evidence.
- Strict OpenSpec validation passed 163 items; `git diff --check` passed.
- UI validation is not applicable to this follow-up because no Renderer/Webview contract, layout,
  interaction or presentation code changed.

## Repository-wide gate status

Repository-wide gates are not clean because of pre-existing/unrelated dirty-tree findings:

- `check:package-boundaries` reached the product-status stage, then failed because
  `@neko/agent-dsh-plugin` is declared active but unreachable.
- `check:agent-boundaries` failed on the existing Generation inventory mismatch and missing retired
  `packages/agent/contracts/src/tool-names.ts` fixture path.
- `smoke:webview` built Assets, then failed because Canvas declares only a typecheck build and emits
  no `dist` directory.
- `check:no-internal-versioning` and `check:legacy-debt` reported broad repository baseline/stale
  allowance findings outside this lifecycle path.

These failures were not hidden or repaired by modifying unrelated user changes.
