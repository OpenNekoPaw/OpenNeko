# W1 Packaged Runtime And Profile Bootstrap

## Implemented Scope

Desktop Main now has one deterministic preparation chain for the DSH product runtime:

1. `scripts/dsh-runtime-closure.mjs` validates a darwin-arm64 descriptor, independent Node 24 executable, DSH `0.1.0-rc.7` entrypoint, exact OpenNeko profile, full payload tree fingerprint, critical file checksums, license inventory and no-symlink closure.
2. `scripts/prepare-dsh-runtime-stage.mjs` copies only a qualified external closure into Forge's `.vite/runtime-stage/dsh-runtime`; packaging fails without `NEKO_DSH_RUNTIME_ROOT` and never consumes `scripts/dsh-q0`.
3. `desktop-dsh-runtime-resource.ts` resolves either the packaged `resources/dsh-runtime/darwin-arm64` path or one explicit absolute development closure. It has no system Node, global DSH, `PATH` lookup or Electron-as-Node path.
4. `desktop-dsh-profile-materializer.ts` validates the official template and four OpenNeko bundle packages, then atomically restores `userData/dsh/profiles/openneko` and the canonical empty home patch. It preserves `userData/dsh/sessions`, settings and sibling DSH-owned durable files, and restores the previous profile/home patch when a materialization step fails.
5. `desktop-dsh-runtime-bootstrap.ts` creates the dedicated `userData/dsh/workspace` process cwd, admits only `PATH`, `TMPDIR`, `LANG` and `LC_ALL` from the parent environment, forces `DSH_HOME`, `HOME` and telemetry-disable values, constructs the explicit supervisor, and requires all ACP Host handlers from the product composition root.
6. The persistent Conversation/DSH binding store now supports exact reverse lookup. `@neko/agent-runtime` resolves `DSH Session -> Conversation -> durable domain context`; Desktop then validates the exact Workspace grant or Assistant identity before constructing Generation/Canvas/Cut owning services. Canonical domain input validation occurs before grant or resource access.
7. ACP permission now has a package-owned pending owner keyed by exact Conversation/DSH Session/turn/tool-call identity. It exposes only advertised ACP options, rejects stale/unadvertised decisions, and settles remaining requests as `cancelled` on handler/runtime disposal. No default decision or Pi approval contract is used.

The writable profile contains no dependency declarations or user executable patch. Its only package links point to the verified read-only closure's `@neko/dsh-bridge`, `@neko/generation-dsh-plugin`, `@neko/canvas-dsh-plugin` and `@neko/cut-dsh-plugin`. DSH rc.7 remains responsible for its installation fallback links and Session persistence under `DSH_HOME/sessions`.

## Focused Verification

```bash
node --test \
  scripts/test-orchestration/dsh-runtime-closure.test.mjs \
  scripts/test-orchestration/dsh-cutover-release-guard.test.mjs

pnpm --dir apps/neko-desktop exec vitest run \
  src/main/desktop-dsh-runtime-bootstrap.test.ts \
  src/main/desktop-dsh-profile-materializer.test.ts \
  src/main/desktop-dsh-runtime-resource.test.ts \
  src/main/desktop-dsh-agent-runtime.test.ts \
  src/main/desktop-dsh-subprocess-supervisor.test.ts
```

The script tests passed 5/5. The original Desktop DSH group passed 5 files / 24 tests. Subsequent focused suites passed 43 binding/context tests, 25 ACP/domain/permission tests, and 11 Desktop handler/bootstrap tests. `@neko/agent-runtime` strict typecheck and focused Desktop compilation for the new files passed. Application boundaries and internal-versioning checks passed.

## Remaining Product Blockers

- New Conversation publication requires cleanup of the exact provisional DSH Session when validation or binding publication fails. ACP SDK `0.25.1` defines standard `session/delete`, but the current bridge advertises only list/resume/close and DSH rc.7's public persistence service exposes no delete seam. `session/close` does not delete durable Session data and is not accepted as cleanup.
- Permission request ownership and exact decision semantics are implemented, but the new ACP permission projection/decision contract is not yet wired through Desktop IPC/preload/Renderer. The old Pi-era `confirmTool` contract is not compatible and must be deleted during consumer cutover rather than adapted as a fallback.
- Session update/event projection consumers are not yet wired to the Electron UI, so the complete handler assembly is intentionally not started from the product root.
- The full Desktop consumer cutover remains delete-first and does not typecheck; `main/index.ts` still references retired Agent compositions. The new bootstrap is therefore not invoked from the product root yet.

These blockers keep OpenSpec tasks 2.3, 2.5, 4.1-4.3 and 4.13 open. They are not reasons to restore Pi, add a stub handler or run a parallel Agent path.

## Evaluation Disposition

Runtime descriptor/profile parsing, atomic file materialization, environment selection and subprocess composition are deterministic boundary behavior and are covered by focused tests. Real Agent behavior, provider/API calls and visible Desktop execution were not run per the current instruction. They remain required release evidence and the release guard stays fail-closed.
