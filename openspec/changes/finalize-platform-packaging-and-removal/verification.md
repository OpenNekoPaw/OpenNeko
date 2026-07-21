## L4 Quality Review

Risk: L4. The change replaces the installed VS Code product boundary, package composition,
CI artifacts, and GitHub Release publication contract.

Architecture review found one canonical path: feature packages own implementations and
build-only payloads; `apps/neko-vscode` owns scoped activation and final manifest composition;
the shared L1 registry owns in-process feature API discovery; platform packaging owns the
native closure; Release publishes only the final product assets. No Webview imports VS Code,
no feature package imports the application, and dependency-cruiser reported no violations.

## Package Evidence

- `node scripts/package-openneko-platform.mjs --target darwin-arm64` produced
  `vsix-artifacts/OpenNeko-darwin-arm64-0.0.1.vsix` (23.17 MB, 327 files).
- Archive inspection found exactly the seven feature roots under `dist/features/` and exactly
  one `neko-engine.darwin-arm64.node` plus the darwin FFmpeg dylib closure.
- The final manifest contains `neko.neko-suite`, `./dist/extension.js`, 165 commands, 13 custom
  editors, no `extensionPack`, and no internal Neko `extensionDependencies`.
- Intermediate feature VSIX, extraction, and staging directories are removed after successful
  assembly. `vsix-artifacts/` contains only the final host-platform OpenNeko VSIX.

## Runtime Evidence

The first isolated Extension Development Host run exposed two deterministic defects: a Proxy
invariant failure when projecting `ExtensionContext`, and root-relative theme contributions that
did not exist in the composed package. Frozen-context and real-manifest regression tests reproduced
both failures. The scoped context now uses an explicit facade, and contribution resources are
rebased to their feature payload roots.

After rebuilding the same VSIX, an isolated Development Host with installed extensions disabled
loaded only `neko.neko-suite`. The OpenNeko Engine status item appeared and the Agent Webview exposed
its title, localized empty state, model controls, and composer controls through CDP. The console no
longer contained the OpenNeko activation failure or missing theme resource diagnostic. Remaining
messages were VS Code proposed-API, dependency deprecation, and known Webview sandbox noise.

Separately installed feature extensions now block unified activation and direct the user to the
Extensions view. The application does not continue with duplicate contribution owners and does not
delete workspace files, settings, credentials, or extension storage.

## Validation

Passed:

- OpenNeko assembler/manifest tests: 8 tests
- Embedded registry and deferred Agent capability registration: 9 tests
- Application manifest/scoped-context tests: 3 tests
- `pnpm check:test-orchestration`: 61 tests
- `pnpm check:release-channels`
- `pnpm check:openspec`
- `pnpm check:deps`
- `pnpm check:application-boundaries`
- `pnpm check:product-brand`
- `pnpm check:webview-boundaries`
- `pnpm check:strict-tsconfig`
- `pnpm test:local:vscode`
- focused ESLint and Prettier for all new registry/application files
- `git diff --check`

Repository-wide `pnpm ci:local` was attempted but the concurrent dirty worktree blocks unrelated
stages: Prettier reports ten Agent/Assets/Canvas files, ESLint reports two unrelated unused values,
build stops on an unrelated `CREATIVE_ENTITY_KINDS` unused import, and Agent Extension tests report
eight unrelated Canvas/content-access failures. `pnpm check:unused` has no finding from this change;
it still reports two pre-existing exports in `scripts/read-package-group.mjs` and one config hint.

After the unused import was removed and host packaging was rerun, `pnpm check:legacy-debt` became
blocked by 55 `migrate-now` occurrences in two concurrent workspace-linked media-library migration
files under `packages/neko-types/src/node/`. The release/package change has no new debt finding.

## Residual Risk

- `linux-x64` package construction and isolated Linux VS Code activation require the configured
  GitHub runner; local macOS evidence cannot substitute for that target.
- The exact two-artifact GitHub download/allowlist/checksum/publication path is covered by YAML and
  orchestration tests but has not run until the change is pushed and CI executes.
- Existing published multi-package releases are not overwritten. The first unified package must use
  a new version tag whose numeric manifest version matches every retained feature manifest.
