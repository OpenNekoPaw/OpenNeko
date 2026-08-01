## Context

`@neko/app-desktop` currently maps `build` to `electron-forge package`, while the root
`check:build` runs format, lint, and `turbo run build` without a typecheck dependency. Forge/Vite
transpilation therefore creates a native package even when Desktop contracts fail `tsc --noEmit`.
Because the remote build job runs on Ubuntu, the same command also creates an implicit Linux
Desktop package.

The completed `limit-supported-platforms` change still describes `darwin-arm64` and `linux-x64`,
but it was not archived into `openspec/specs/`. The current product decision replaces Linux with
Windows. Linux remains useful as a fast host-neutral CI environment, but it must not be a product
package or release-runtime target.

This is a local Electron product. Native package evidence must come from the target host, and an
unsupported host must fail before Forge can create an artifact.

## Goals / Non-Goals

**Goals:**

- Make Desktop `tsc --noEmit` an unavoidable build-gate dependency.
- Keep host-neutral checks runnable on Ubuntu without packaging a Linux application.
- Package `darwin-arm64` and `win32-x64` on real matching CI runners.
- Run deterministic unit/contract and headless Desktop functional paths in CI without starting a
  graphical Electron process or using provider credentials.
- Keep real API Agent Evaluation and graphical Electron UI acceptance local-only.
- Define one closed target set and project it into Forge, runtime staging, metadata matrices, tests,
  and long-lived documentation.
- Fail visibly for Linux, Intel macOS, Windows ARM/IA32, and unknown targets.

**Non-Goals:**

- Add Linux Desktop packaging or retain it as a fallback.
- Cross-package Windows artifacts from macOS or Linux.
- Implement signing, notarization, Windows installer/update channels, or hardware-accelerated
  Windows media in this P0 build change.
- Claim full Phase 2 user-flow qualification merely because a Windows package is constructed.
- Run provider-backed Agent behavior Evaluation or graphical UI automation from GitHub Actions.

## Decisions

### 1. Separate static validation from native packaging

The root exposes a host-neutral static build gate containing format, lint, workspace typecheck, and
browser-safe package builds. Native `pnpm build` continues to include the Desktop package, but it is
only valid on a supported host.

Alternative considered: keep running `pnpm build` on Ubuntu and ignore the Linux output. Rejected
because the command would continue to provide a reachable Linux product success path.

### 2. Make typecheck a Turbo task and an explicit build-gate predecessor

The root `typecheck` command runs `turbo run typecheck`. `check:build` and the host-neutral static
gate execute it before any package build. The orchestration regression test asserts the actual
root scripts and Desktop package script rather than trusting a successful Forge invocation.

This change does not create redundant package-local compiler configurations. Existing package
`build` scripts that already run `tsc --noEmit` remain build owners; the new gate closes the
specific Desktop omission and executes all existing explicit `typecheck` scripts.

Alternative considered: make Turbo `build` depend globally on `typecheck`. Rejected because many
browser packages intentionally use `build` as their typecheck, which would require an unrelated
workspace-wide script migration and could create duplicate compiler work.

### 3. Validate the native host before invoking Forge

A repository-owned Node entry point maps only:

- `darwin` + `arm64` to `darwin-arm64`
- `win32` + `x64` to `win32-x64`

Desktop `build`, `package`, and `make` call this assertion before Forge. The function is unit tested
with injected platform and architecture values so Linux and mismatched architectures are proven to
fail without spawning Forge.

Alternative considered: rely only on the GitHub Actions matrix. Rejected because local scripts and
future workflows could still create unsupported artifacts.

### 4. Use real host-native package jobs

The remote graph keeps host-neutral jobs on Ubuntu and adds one native Desktop package matrix:

| Target         | Runner              | Command                |
| -------------- | ------------------- | ---------------------- |
| `darwin-arm64` | Apple Silicon macOS | `pnpm package:desktop` |
| `win32-x64`    | Windows x64         | `pnpm package:desktop` |

Both jobs first run Desktop typecheck and upload their exact Forge output. Aggregate gates require
the matrix job, so a skipped or failed target blocks promotion.

Alternative considered: cross-package Windows from macOS. Rejected because it cannot establish the
native dependency, path, fuse, or packaged-startup boundary.

### 5. Windows media packaging uses a software baseline

The existing media descriptor contract requires VideoToolbox for macOS and VAAPI for Linux. The
Windows target replaces Linux with a portable software baseline: required decoders, H.264/AAC
encoders, and common audio filters; its required hardware-accelerator list is empty. Hardware
acceleration remains an explicit future capability and must not be simulated by VAAPI or a generic
fallback.

Sharp staging uses `@img/sharp-win32-x64`; unlike macOS/Linux Sharp distributions, the Windows
native package does not require a separate `@img/sharp-libvips-win32-x64` package.

### 6. Keep runtime platform vocabulary broader than release support

Typed renderer/host snapshots may still represent `linux`, `browser`, or `unknown` for diagnostics
and host-neutral tests. Release matrices, native package scripts, and staged runtime targets are
the canonical closed set. Removing diagnostic vocabulary would conflate observation with support.

### 7. Separate deterministic CI tests from local behavior and UI acceptance

CI owns three distinct evidence classes:

1. matching-host Desktop package construction for `darwin-arm64` and `win32-x64`;
2. deterministic workspace unit, contract, and coverage tests;
3. a named headless Desktop functional subset that exercises Main/preload/product composition
   paths without a graphical Electron process, real user data, credentials, or provider calls.

Agent Evaluation means provider-backed AI behavior evidence and remains an explicit local action.
The key-free Evaluation harness also remains local-only because it is authoring infrastructure, not
an ordinary product unit-test owner. Graphical Electron UI acceptance uses an isolated temporary
functional home and separate Electron user-data directory through a local launcher. Neither local
surface is reachable from GitHub workflows or generic CI script composition.

Alternative considered: call all Vitest coverage "functional testing." Rejected because it would
hide whether CI contains a bounded product-flow check. Alternative considered: launch Electron or
provider-backed cases in CI. Rejected because graphical lifecycle evidence and credential/cost
authorization require an explicit local owner.

## Risks / Trade-offs

- [Windows package compiles but complete product flows remain unqualified] → The CI artifact is
  build evidence only; Phase 2 still requires packaged startup, protected credential UI, media,
  GPU, filesystem, installer, signing, and end-to-end evidence on Windows.
- [Current parallel Desktop code already has TypeScript errors] → The new gate must expose these
  errors. Fixes are limited to the owning contracts and regression tests; no fallback or type
  suppression is allowed.
- [macOS package job duration increases] → Turbo caching remains enabled for static work, while
  native packaging stays uncached because host artifacts are correctness evidence.
- [Old active changes mention Linux] → Long-lived architecture and roadmap facts are updated here;
  historical/archive evidence remains unchanged. Conflicting active changes must be rebased when
  they next modify release qualification.
- [Windows FFmpeg bundle construction depends on a native toolchain] → The target contract and
  descriptor are implemented now, but a release bundle is not accepted until a Windows-native
  build/qualification job provides the executable closure.
- [Headless functional tests are mistaken for graphical acceptance] → The CI job and command are
  named headless, and static guards keep the graphical launcher unreachable from remote gates.
- [AI regressions are missed by deterministic CI] → Agent behavior changes still require explicit
  local real-API Evaluation evidence under the Evaluation policy; CI never fabricates that result.

## Migration Plan

1. Add regression tests for the build/typecheck chain, host-target rejection, CI runner matrix, and
   platform runtime matrices.
2. Add the root typecheck/static gate and the supported-host package assertion.
3. Update Forge checksums/makers and GitHub Actions aggregation.
4. Replace Linux with Windows in Sharp, media descriptor, and local metadata release matrices.
5. Update current architecture and roadmap documentation while preserving dated historical
   evidence.
6. Add explicit deterministic functional CI coverage and local-only guards for Evaluation and
   graphical UI acceptance.
7. Run focused orchestration/media tests, Desktop typecheck/test/package, and repository gates.
8. Obtain `win32-x64` CI artifact evidence on the real Windows runner before describing Windows as
   release-qualified.

Rollback restores the prior scripts and CI graph as one atomic change. It must not retain both
Linux and Windows success paths.

## Open Questions

- Windows installer format, code-signing identity, update channel, and protected provider-auth UI
  remain Phase 2 decisions; ZIP/package construction does not decide them.
- The Windows hardware-video backend remains unavailable until a separate capability change
  qualifies D3D11VA/DXVA2 decode and a matching encode/scale pipeline.
