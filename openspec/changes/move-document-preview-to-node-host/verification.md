## Verification (2026-07-16)

### Passed

- Preview server/provider regressions: the full Preview suite passed 202 tests, including real loopback GET/HEAD/CORS/PNA, Range variants, invalid ranges, MIME types, opaque/revoked tokens, EPUB entry safety, bounded DOCX registration, disposal, idempotent ready, and same-document multi-panel ownership.
- Content boundary: the full `@neko/content` suite passed 51 tests; `pnpm check:content-access-boundaries` inspected 1,093 files with no findings.
- Builds and architecture: `pnpm --filter neko-preview compile`, dependency-cruiser over 1,777 modules, focused ESLint, strict OpenSpec validation, fixture archive integrity, scenario contract dry-run, VS Code debug-config tests, focused P0 selection, and `git diff --check` passed.
- Runtime host: VS Code Debugger launched the dedicated Preview configuration against `${HOME}/Git/neko-test`. The controller identified VS Code 1.128.1 and active `neko.neko-preview`, then opened isolated synthetic PDF, EPUB, DOCX, and CBZ custom editors with the expected view types.
- Runtime boundary: `neko.neko-engine` was unavailable in that Debug Host; all four document editors still opened. The Extension Host owned a loopback document service whose root returned the expected document-route `404` plus CORS/PNA headers. No `ensureFrameServer`, Engine registration, legacy `/v1/preview/file`, or Engine fallback remains in the document provider path.

### Repository baseline blockers

- `pnpm check:legacy-debt` remains red with 198 existing blockers (191 `migrate-now`, 7 `needs-review`) concentrated outside Preview in TUI/Agent/shared code.
- `pnpm check:unused` remains red for existing removed/pruned workspace drift, test-only unlisted `@neko/skills` imports, unused exports, and one duplicate export. The new Preview fixture generator is declared as a root script and is no longer an unowned dependency path.
- The complete `pnpm check:test-orchestration` run remains red because the current worktree has removed Home/Audio/Auth/Live/Market/Model/Puppet/Sketch/Story packages while ownership and scenario inputs still reference them. The new Preview scenario schema, VS Code debug configuration, and focused all-P0 selection checks pass.
- A direct Preview extension `tsc --noEmit` is not a valid green gate in the current package configuration because it imports the browser-targeted `@neko/neko-client` graph and exposes pre-existing baseline errors. The production esbuild/Vite compile succeeds.

### Runtime residual risk

- The standard declarative Webview scenario was attempted and produced `reports/webview-functional/preview.pdf-node-host.p0/2026-07-16T09-37-23-018Z/result.json` with `infrastructure-fail`: the parent VS Code renderer had no CDP endpoint on port 9222, so the runner stopped before DOM assertions. VS Code's Webview Developer Tools also did not expose a separate attachable target in this session.
- Consequently, source/build/unit/integration and real Debug Host evidence cover server startup, route ownership, custom-editor activation, and Engine absence, but DOM-rendered content plus Webview console/network capture must be rerun from a parent VS Code instance that already exposes the dedicated renderer CDP endpoint.
