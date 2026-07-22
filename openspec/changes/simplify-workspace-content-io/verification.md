## Verification (2026-07-22)

### Scope and architecture

- Risk: L4 cross-package content I/O contract and Extension Host runtime migration.
- Canonical path: stable content locators → bounded `ContentReadService` handlers → capability-scoped projection ports; domain owners write through `ProjectFileStore` and authorized workspace writers.
- Removed path: broad ContentAccess intent/materialization/provider routing and broad ContentIngest destination/provider competition. The content-access boundary gate now has an empty derived-storage migration allowlist.
- The Cut save composition installs the Node authorized writer only in production composition; tests and alternate hosts inject `ProjectFileOps` explicitly. New Node content capabilities use narrow module entry points instead of loading the complete VS Code Extension barrel.

### Automated evidence

Passed:

- focused Cut persistence/session/authoring regressions: 20 tests; complete Cut suite: 21 files, 246 tests
- complete Preview suite: 45 files, 340 tests
- complete shared suite during the repository run: 187 files, 1,497 tests
- complete Agent core suite during the repository run: 121 files passed, 1 skipped; 1,336 tests passed, 1 skipped
- focused Agent linear-stream regressions: 3 files, 33 tests
- `pnpm build`: 9/9 Turbo tasks
- `pnpm test`: 24/24 Turbo tasks on the final clean rerun
- `pnpm check`: Knip plus dependency-cruiser; 1,551 modules and 5,565 dependencies, no violations
- `pnpm check:legacy-debt`: passed with zero blocking non-Agent findings
- `pnpm check:content-access-boundaries`: 1,821 files, no findings, no derived-storage migration allowlist
- `pnpm smoke:webview:targets`: discovered the VS Code host pages and the Preview Webview
- `openspec validate simplify-workspace-content-io --strict`
- `git diff --check`

The first repository test attempt exposed three concurrent-worktree regressions and they were fixed at their owning boundaries: Cut had unconditionally composed a physical Node writer into in-memory tests, the Preview model test removed its global `ResizeObserver` while asynchronous cleanup was still active, and the local-resource guard rejected the real class-shaped `vscode.Uri` API. The final repository test rerun passed without changing production failure semantics or retaining a compatibility path.

### Isolated Extension Host evidence

- Launched the repository's `Debug Dev (All)` Extension Development Host against an isolated synthetic workspace with the dedicated VS Code debugging workflow.
- The Preview audio editor activated successfully after rebuilding the Extension Host composition.
- Opened a synthetic EPUB through the real Preview custom editor. The Webview reached ready state with one chapter and one spine item and no visible error.
- The active EPUB Webview document contained only opaque loopback document URLs. It did not contain the synthetic workspace path or source filename. Physical source paths remained restricted to Extension Host logs.
- Direct probes of the Host-owned container, OPF, XHTML, and image routes returned HTTP 200. The only observed 404 was the optional epub.js Apple display-options probe; document rendering remained successful.
- Legacy ContentAccess/ContentIngest symbols are blocked by the repository boundary gate, and focused tests poison retired runtime handles, path shapes, cache destinations, provider routing, and fallback behavior.
- Runtime screenshot: `reports/webview-functional/simplify-workspace-content-io-epub.png` (gitignored synthetic evidence).

### Residual risk

- The first full `pnpm test` run hit the existing five-second timeout of three Agent linear-stream tests under an unfavorable package scheduling order. The three tests immediately passed together in 2.33 seconds, and the unchanged final full repository rerun passed them in 2.68–4.87 seconds. This is test-load sensitivity rather than a content-I/O regression; no Agent timeout or performance contract was changed.
- Extension asset URLs naturally identify installed extension resources through VS Code's resource scheme. The acceptance criterion applies to protected source workspace paths, which were absent from the Webview document and consumer projections.
