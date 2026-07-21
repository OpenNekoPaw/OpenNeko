## Context

The Engine build has two FFmpeg dependency consumers. Native compilation needs development headers and shared libraries, while platform VSIX packaging bundles runtime shared libraries. `packages/neko-engine/scripts/package-config.json` describes both consumers. Supported BtbN entries must use immutable releases and verified digests. Windows support is deferred, so Windows archives and installer paths are outside the current package contract.

This is an L4 release-path correction across Engine package scripts and GitHub workflows. The external archive boundary requires explicit integrity validation and fail-visible diagnostics.

Five-layer analysis:

- **Responsibility:** `neko-engine` owns FFmpeg build-artifact identity, acquisition, verification, extraction, and packaging. Workflows own runner selection and invocation only.
- **Dependency:** GitHub workflows depend on the Engine package command; Engine scripts depend on Node built-ins plus runner-provided `curl` and archive tools. No Webview, Extension, Proto, or Rust runtime contract changes.
- **Interface:** Each BtbN artifact descriptor contains an immutable release tag, exact archive filename, and lowercase SHA256. Callers receive the descriptor rather than reconstructing names from floating templates.
- **Extension:** Updating FFmpeg requires replacing explicit descriptors in one configuration file; adding a supported platform follows the same descriptor contract without another installer path.
- **Testing:** Unit tests cover descriptor validity and checksum match/mismatch. Package script tests and workflow shape checks prove unsupported Windows targets cannot enter acquisition or packaging.

Feasibility is established by the pinned BtbN release publishing the required Linux shared development/runtime archives and `checksums.sha256`.

## Goals / Non-Goals

**Goals:**

- Make supported BtbN archive selection deterministic and reviewable.
- Verify downloaded archives before any extraction or bundle copy.
- Keep deferred Windows artifacts and acquisition paths out of the current release contract.
- Reject mutable tags, missing integrity metadata, and checksum mismatches visibly.

**Non-Goals:**

- Pin GitHub Actions to commit SHAs; that is a separate workflow supply-chain policy.
- Build FFmpeg from source or separately configure the upstream FFmpeg source commit; the selected BtbN artifact already identifies its source revision in the filename.
- Change the FFmpeg runtime API, codec policy, or Rust media behavior.
- Add fallback installers, checksum bypasses, retries beyond the existing bounded network retry, or compatibility paths for Chocolatey.

## Decisions

### Store exact artifact descriptors in Engine package configuration

`package-config.json` will replace `archiveTemplate` plus the mutable `latest` tag with exact `archive` and `sha256` values under each BtbN runtime/development entry, and one immutable release tag shared by those descriptors. `package-config.js` will project these values without synthesizing filenames.

Alternatives rejected:

- Pinning only the Chocolatey package version does not stabilize its mutable download URL.
- Passing Chocolatey the newly observed checksum couples CI to the same mutable URL and recreates the failure on the next upstream replacement.
- Pinning only FFmpeg `8.1.2` does not distinguish rebuilt binary archives.

### Verify bytes through one package-owned helper

A small Node helper will calculate SHA256 for a downloaded file and throw an explicit expected/actual diagnostic on mismatch. Both development download and runtime bundle paths will call it immediately after `curl` and before extraction.

This is a real shared boundary inside the owning package: two existing consumers verify the same external-provider contract. It avoids duplicated crypto logic without introducing a cross-package abstraction.

### Keep deferred platforms out of FFmpeg acquisition

The Engine package configuration contains only supported targets. `ffmpeg-env.js`, development setup, and runtime bundling reject Windows before probing package managers, local installations, or workspace artifacts. A later Windows qualification change must add verified descriptors and a single repository-owned setup path together with the platform target.

### Keep update operations explicit

An FFmpeg refresh must update the immutable BtbN release tag, exact archive names, and SHA256 values together. Tests will reject `latest` and malformed/missing digests so partial updates fail before packaging.

## Risks / Trade-offs

- **Pinned archives become stale** → Updates are intentional reviewed maintenance changes instead of silent daily drift.
- **Pinned release assets could be removed upstream** → Downloads fail visibly with the exact release/archive identity; a maintainer can advance the descriptor in one place.
- **Windows-specific source remains in Rust packages** → Source presence does not create an FFmpeg or packaging success path; restoring support requires real Windows qualification under the platform contract.

## Migration Plan

1. Add descriptor and checksum validation tests so the mutable/unverified configuration is red-capable.
2. Replace floating BtbN templates with pinned descriptors and add the shared verifier.
3. Route both download consumers through verification before extraction.
4. Remove deferred Windows descriptors, ZIP/DLL acquisition branches, and workflow consumers.
5. Run focused package tests, OpenSpec validation, workflow checks, and applicable repository quality gates.

Rollback reverts the repository change as a unit. No user project data, settings, or published contract migration is involved.

## Open Questions

None.
