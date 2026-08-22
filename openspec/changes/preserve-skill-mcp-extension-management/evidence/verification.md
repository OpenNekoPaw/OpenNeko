# Verification evidence

Date: 2026-08-22

## Deterministic verification

- `pnpm exec openspec validate preserve-skill-mcp-extension-management --strict`: passed.
- `pnpm check:openspec`: passed, 145 active changes/specifications and successor dispositions.
- Agent contracts: typecheck passed; 17 files / 103 tests passed.
- Agent runtime: typecheck passed; 51 files / 350 tests passed.
- DSH bridge: typecheck passed; 4 files / 34 tests passed.
- Host: typecheck passed; 38 files / 327 tests passed.
- Agent Webview: typecheck passed; 5 files / 48 tests passed.
- Desktop Extension runtime/styles/Plugin poison: 3 files / 33 tests passed.
- Desktop application lifecycle: 1 file / 53 tests passed when run standalone. A concurrent high-load
  run first produced two unrelated timing failures; the standalone rerun passed.
- Desktop Shell Skill/MCP layout: focused test passed.
- `pnpm check:package-product-status`: passed; the Agent contracts/runtime/Webview, DSH bridge and Host
  packages are reachable from the Desktop product entries.
- `pnpm check:application-boundaries`: passed over 1,343 files.
- `node --test scripts/check-agent-extension-surface.test.mjs && node scripts/check-agent-extension-surface.mjs`:
  passed; 7 tests and 12 evidence paths prove the exact Skill/MCP surface and poison Plugin authority.
- `pnpm check:test-orchestration`: passed after removing the retired Automation Webview owner; 53
  source-bearing workspaces remain explicitly owned.
- `node --check scripts/desktop-functional/desktop-workbench-scenes.mjs`: passed. The functional
  scenario selects Extensions, verifies grid/list and Skill/MCP tabs, and rejects a Plugin tab.
- `git diff --check`: passed.

## Agent Evaluation disposition

This change does not alter Skill invocation, MCP Tool registration or routing, prompts, models,
Session workflow, or Agent output. Real-provider Evaluation is therefore excluded. The key-free
catalog validation `node scripts/agent-eval/all-suite-dry-run.mjs` passed for 26 suites / 69 cases.

## Explicit blockers and residual risk

- Full Desktop typecheck is blocked by three errors in concurrent document-Tool work:
  `executeWorkspaceDocumentTool` no longer matches `DshAcpApplicationClientHandlers`, and
  `NodeAuthorizedWorkspaceWriter` is unresolved twice. The Extension client stub now implements
  `readExtensions`; no remaining Desktop type error references this change.
- `pnpm check:legacy-debt` remains blocked by 26 `needs-review` occurrences in six unrelated DSH image
  preview files. The Extension surface's Suspense loading UI is classified as non-blocking
  `runtime-resilience`.
- `pnpm check:unused` remains blocked by the repository's broader unused inventory, including current
  Generation/Canvas work and pre-existing exports/dependencies. It reports no restored Extension
  management module as an unused file.

## UI validation

Acceptance inventory:

1. The primary navigation contains `Extensions` / `扩展`.
2. Opening it mounts one full-width management surface.
3. The catalog exposes exactly `Skill` and `MCP` tabs, supports grid/list presentation and has no
   Plugin tab, detail pane, install, enablement or configuration action.
4. Leaving the scene disposes the exact presentation runtime.

Authoritative visible Electron validation is explicitly blocked because the current checkout cannot
pass the Desktop build/typecheck prerequisite due to the unrelated document-Tool errors above.
Structural, lifecycle, renderer and functional-script evidence passed, but no screenshot or manual UI
claim is promoted to authoritative evidence for this run.
