## Context

`@neko/app-desktop` mapped `build` to `electron-forge package`, while the root gate did not require
Desktop `tsc --noEmit`. Forge/Vite could therefore create native bytes while Desktop contracts were
invalid. Ubuntu also exposed an accidental Linux package path, and an intermediate implementation
added Windows packaging before product qualification existed.

The current product decision is narrower: `darwin-arm64` is the only package and release target.
Windows and Linux remain useful deterministic test environments, but neither may invoke Forge or
stage a release-native runtime. Native package evidence must come from an explicitly operated local
Apple Silicon host rather than GitHub Actions, and every unsupported host must fail before Forge.

## Goals / Non-Goals

**Goals:**

- Make Desktop `tsc --noEmit` an unavoidable build-gate dependency.
- Keep deterministic checks runnable on Ubuntu and Windows without packaging an application.
- Package only `darwin-arm64` on a matching local Apple Silicon host.
- Run deterministic unit/contract and headless Desktop functional paths in CI without a graphical
  Electron process or provider credentials.
- Define one closed release target and project it into Forge, runtime staging, metadata matrices,
  tests, and current documentation.
- Fail visibly for Windows, Linux, Intel macOS, and unknown package/runtime targets.

**Non-Goals:**

- Package Windows/Linux or retain either as a fallback.
- Cross-package macOS from Windows/Linux.
- Implement the formal Developer ID/notarized GitHub Release workflow in this change; that boundary
  is owned by `establish-macos-release-pipeline`.
- Run provider-backed Agent behavior Evaluation or graphical UI automation from GitHub Actions.

## Decisions

### 1. Separate deterministic validation from native packaging

The root exposes a host-neutral static gate containing format, lint, workspace typecheck, and
browser-safe builds. Ubuntu owns the full source/coverage/quality graph. A named platform-test job
runs on Windows and Linux for Desktop typecheck, orchestration, and local-metadata compatibility.
Neither path can invoke Forge.

Alternative considered: keep a generic package matrix and ignore non-macOS artifacts. Rejected
because it leaves unsupported product success paths reachable.

### 2. Make typecheck an explicit build-gate predecessor

The root `typecheck` command and host-neutral gate execute every existing explicit package
typecheck, including Desktop. Browser packages that already own build-time typechecking retain
their current scripts; no redundant compiler abstraction is introduced.

### 3. Validate the sole native host before Forge

A repository-owned Node entry maps only `darwin` + `arm64` to `darwin-arm64`. Desktop `build`,
`package`, `make`, and `dev` call it before Forge. Injected-platform tests prove Windows, Linux,
Intel macOS, and unknown targets fail without spawning Forge.

The guard belongs to repository/Desktop build orchestration. It has no user-data effect and does
not own domain behavior.

### 4. Keep the real native package path local

The native package path is explicit and local:

| Target         | Host                      | Command                |
| -------------- | ------------------------- | ---------------------- |
| `darwin-arm64` | Local Apple Silicon macOS | `pnpm package:desktop` |

The operator runs Desktop typecheck and the matching Sharp executable closure, then asserts the
canonical `.app` executable after Forge. GitHub Actions does not run Forge or upload the package.
Aggregate gates require deterministic source and Windows/Linux tests without representing native
package evidence.

### 5. Native release-runtime closures contain only macOS

Forge checksums/makers, Sharp staging, media descriptors/bundle preparation, local-metadata release
matrix, and package output assertions accept only `darwin-arm64`. The intermediate Windows
software media descriptor and Sharp staging path are removed rather than kept as unused release
compatibility code.

Windows/Linux tests can still exercise host-neutral media logic, runtime parsing, Node SQLite, path
semantics, and diagnostics. Typed runtime snapshots may retain `win32`, `linux`, `browser`, and
`unknown` observation vocabulary; observation does not imply package support.

### 6. Separate deterministic CI from local native and behavior acceptance

CI owns deterministic unit/contract coverage, Windows/Linux platform compatibility, and a
credential-free headless Desktop functional subset. Native macOS packaging, provider-backed Agent
Evaluation, and graphical Electron acceptance remain explicit local commands and are unreachable
from generic CI composition.

## Risks / Trade-offs

- [Windows/Linux code regresses despite no package] → Their test jobs remain required aggregate-gate
  evidence, but passing tests are never described as product qualification.
- [A green GitHub gate is mistaken for package evidence] → Gate documentation explicitly excludes
  native package, signing, DMG, installation, and release qualification.
- [Active historical designs mention Windows/Linux packages] → Current architecture and active
  delivery facts are rebased; archived dated evidence remains unchanged.
- [Formal release is mistaken for package CI] → Signing/notarization/tag/publication requirements
  live in the separate `establish-macos-release-pipeline` capability.
- [Headless tests are mistaken for graphical acceptance] → Job names and reachability guards keep
  graphical launchers out of CI.

## Migration Plan

1. Change orchestration tests to require local-only macOS packaging and Windows/Linux test-only jobs.
2. Restrict host/output guards, Forge, Sharp, media, and local-metadata release matrices to macOS.
3. Remove obsolete Windows/Linux native package/runtime paths and their positive tests.
4. Rebase current architecture, README, roadmap, and active OpenSpec facts.
5. Run focused orchestration/runtime tests, Desktop typecheck/package, and repository gates.
6. Run the local macOS package evidence and the GitHub Manual Gate deterministic source/platform
   evidence separately.

Rollback must restore one previous target matrix atomically; it must not retain simultaneous
macOS-only and multi-platform release success paths.

## Open Questions

None for the platform closure. Developer ID credentials, notarization, public artifacts, and first
tag evidence are tracked by `establish-macos-release-pipeline`.
