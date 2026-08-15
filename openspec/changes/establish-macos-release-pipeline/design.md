## Context

OpenNeko produces an ad-hoc-signed `darwin-arm64` Forge DMG. The repository previously used a
tag-triggered GitHub workflow to build that DMG and publish it as a prerelease, while ordinary CI
also packaged and uploaded a native Desktop artifact. Repository owners now require all native
Desktop build bytes to originate from an explicitly operated local Apple Silicon host and do not
want GitHub prerelease metadata.

The product remains an Alpha and the DMG remains unnotarized. GitHub release lifecycle metadata and
Apple trust qualification are separate facts: removing the prerelease flag does not permit the
documentation or release notes to claim Developer ID signing, notarization, or normal Gatekeeper
acceptance.

Ownership becomes:

- producer: the stable tag selects the public version, an isolated local checkout projects that
  version, and `forge.config.ts` produces the versioned DMG;
- verifier: repository-owned scripts plus native macOS tools validate the exact app, signature, DMG,
  and checksum closure on the same local Apple Silicon host;
- publisher: a repository owner manually creates or edits the ordinary GitHub Release only after
  the local evidence passes;
- GitHub Actions boundary: deterministic source and test validation only, with no native Desktop
  package/make, artifact upload, tag release trigger, or publication permission;
- user data: no project, settings, credential-store, or workspace data is read or migrated.

## Goals / Non-Goals

**Goals:**

- Make local Apple Silicon the sole native package and release build host.
- Keep source/version, ad-hoc signature, DMG integrity, disclosure, artifact, and checksum evidence
  before publication.
- Publish ordinary GitHub Releases without prerelease metadata.
- Keep the release path free of Apple secrets while accurately disclosing the unnotarized trust
  state.
- Keep Windows and Linux available only for deterministic tests.

**Non-Goals:**

- Remove host-neutral builds, typechecks, unit/contract tests, dependency review, or quality gates
  from GitHub Actions.
- Package or publish Windows/Linux artifacts.
- Add Intel/universal macOS output, Mac App Store delivery, PKG installers, auto-update, or a release
  channel beyond GitHub Releases.
- Claim Developer ID signing, notarization, or normal Gatekeeper acceptance.
- Change application runtime behavior, domain contracts, project formats, or user data.

## Decisions

### 1. The tag is the singular public version authority

A release tag MUST be an exact stable `v<major>.<minor>.<patch>` value and the tagged commit MUST be
reachable from `origin/main`. The local `apps/neko-desktop/package.json` version remains a
development/package default. The release operator projects the tag-derived version only in an
isolated local checkout before Forge runs, so application metadata and MakerDMG output agree without
committing a manifest change.

Alternative considered: require developers to update and commit the Desktop manifest before every
tag. Rejected because it couples local development versioning to publication.

### 2. GitHub Actions owns no native Desktop build output

The tag-triggered release workflow is removed. The native `desktop-package` CI job and its artifact
upload are also removed from Manual/Merge Gate. GitHub Actions continues to run deterministic source,
typecheck, tests, OpenSpec, dependency review, and repository-quality checks. Native package and DMG
qualification are explicit local responsibilities and cannot be inferred from a green GitHub gate.

Alternative considered: retain a manually dispatched GitHub macOS build without publication.
Rejected because it would still create GitHub-built native bytes and conflict with the requested
ownership boundary.

### 3. Development and release packaging share one explicit trust mode

Default local `package`/`make` and release assembly use the same explicit ad-hoc signature. No path
sets a release-signing mode, imports a keychain, or reads Apple credentials. Native verification
still requires strict codesign inspection and DMG integrity checks before publication.

Alternative considered: conditionally use Developer ID when secrets happen to exist. Rejected
because one release identity would have ambiguous trust semantics.

### 4. Release output is one verified DMG plus one checksum manifest

Forge `make` remains the sole distributable producer and is restricted to `darwin-arm64`. A
repository-owned assertion resolves the exact versioned DMG, rejects missing or ambiguous output,
computes SHA-256, and writes `SHASUMS256.txt`. Only those two files may be uploaded.

### 5. GitHub release state is ordinary, while trust disclosure remains explicit

Publication does not pass a prerelease flag. The latest version may receive GitHub's Latest marker.
Release notes still state that the DMG is ad-hoc signed, not Developer ID signed, and not notarized,
including the manual “Open Anyway” path where needed. Existing `v0.1.4` through `v0.1.8` releases are
normalized to the same metadata policy, with `v0.1.8` made Latest.

This is a metadata policy change, not a claim that the Alpha product or macOS trust chain has reached
formal support qualification.

### 6. Publication is the final explicit side effect

The repository owner validates source ancestry, tag/version projection, package identity, ad-hoc
signature, DMG integrity, exact artifact closure, and checksum before manually publishing. A failed
or skipped gate must leave GitHub Release state unchanged.

### 7. Platform tests remain separate from package support

Ubuntu and Windows runners execute deterministic source, Desktop typecheck, orchestration, and
local-metadata tests without Forge. Their success proves cross-platform test compatibility only.
The sole native package evidence is produced locally on Apple Silicon.

## Risks / Trade-offs

- [A green GitHub gate no longer proves native packaging] → Release qualification records the local
  Apple Silicon package/make, signature, DMG, and checksum commands explicitly.
- [Users interpret an ordinary Release as notarized] → Release notes and product documentation keep
  the unnotarized warning visible.
- [Manual publication selects the wrong bytes] → Exact tag-derived naming, single-DMG closure, native
  verification, and checksum generation remain mandatory before upload.
- [DMG maker output naming changes] → The exact artifact assertion fails visibly.
- [No formal signed channel or updater] → Developer ID/notarization and updates require later
  capability changes.

## Migration Plan

1. Update tests and OpenSpec to prohibit GitHub native Desktop builds and prerelease metadata.
2. Remove the tag-triggered release workflow.
3. Remove the native Desktop package/upload job from CI aggregators while retaining deterministic
   GitHub checks.
4. Update release, quality-gate, platform, roadmap, and Desktop documentation.
5. Normalize existing prerelease metadata and set the newest version as Latest.
6. Run focused orchestration tests, strict OpenSpec validation, repository quality review, and diff
   checks.

Rollback may restore deterministic CI validation only. Restoring any GitHub native build or
prerelease publication path requires an explicit OpenSpec decision; it must not return as a hidden
fallback.

## Open Questions

- Developer ID/notarization, PKG format, auto-update, and older-macOS qualification remain future
  decisions.
