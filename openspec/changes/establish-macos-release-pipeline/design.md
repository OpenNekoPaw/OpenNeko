## Context

OpenNeko currently produces an ad-hoc-signed `darwin-arm64` Forge package for local development.
There is no GitHub Release workflow, and the repository does not define how a tag, application
version, signing identity, notarization credentials, ZIP output, checksum, or published release
relate. The product is a local Electron Desktop application; release assembly belongs to the
Application composition root and GitHub workflow boundary rather than a domain package.

Ownership remains:

- producer: `apps/neko-desktop/package.json` and `forge.config.ts` produce versioned native output;
- consumer: the repository release workflow validates and publishes that output;
- canonical path: Electron Forge `make` for `darwin-arm64`, followed by repository-owned release
  assertions;
- runtime boundary: GitHub-hosted Apple Silicon macOS with an ephemeral signing keychain and Apple
  notarization service;
- replaced path: ad-hoc package directories or manually uploaded ZIPs cannot become release
  evidence;
- user data: no project, settings, credential-store, or workspace data is read or migrated.

## Goals / Non-Goals

**Goals:**

- Make macOS Apple Silicon the sole native package and public release target.
- Require source, version, signature, hardened-runtime, notarization, Gatekeeper, artifact, and
  checksum evidence before publication.
- Keep secrets outside repository state and logs.
- Keep development packaging usable with ad-hoc signing while making release mode fail on missing
  configuration.
- Keep Windows and Linux available only for deterministic tests.

**Non-Goals:**

- Package or publish Windows/Linux artifacts.
- Add Intel/universal macOS output, Mac App Store delivery, DMG/PKG installers, auto-update, or a
  release channel beyond GitHub Releases.
- Claim compatibility for untested macOS versions merely because Electron can start on them.
- Change application runtime behavior, domain contracts, project formats, or user data.

## Decisions

### 1. Version and source authority are exact and singular

`apps/neko-desktop/package.json` owns the application version. A release tag MUST be exactly
`v<version>` and the tagged commit MUST be reachable from `origin/main`. The workflow uses a full
checkout and validates both facts before installing dependencies or invoking Forge.

Alternative considered: use the tag as an independent version authority. Rejected because it
permits package metadata and artifact names to diverge.

### 2. Development and release signing are explicit modes

Default `package`/`make` keeps the current ad-hoc signature for local validation. The release
workflow sets one explicit release-mode environment value. Forge configuration then requires a
Developer ID Application identity, ephemeral keychain path, Apple ID, app-specific password, and
team ID; no value has a fallback. Release mode enables identity validation, hardened runtime, and
Electron Packager notarization.

The signing mode remains in `apps/neko-desktop` because it configures Electron application bytes
and macOS trust metadata. It does not decide a domain result and is not a reusable host-neutral
business service.

Alternative considered: silently fall back to ad-hoc signing when CI secrets are absent. Rejected
because an unsigned public artifact would be reported as a successful release.

### 3. The signing certificate exists only in an ephemeral keychain

The workflow decodes the base64 PKCS#12 certificate into the runner temporary directory, imports it
into a task-specific keychain, configures codesign access, and deletes the keychain in an `always()`
cleanup step. Notarization uses an Apple app-specific password passed only through masked secrets.

Alternative considered: commit a certificate/profile or use the login keychain. Rejected because it
widens secret lifetime and makes cleanup/ownership ambiguous.

### 4. Release output is one verified ZIP plus one checksum manifest

Forge `make` remains the sole distributable producer and the maker is restricted to `darwin`.
A repository-owned assertion resolves the exact versioned ZIP, rejects missing or ambiguous output,
computes SHA-256, and writes `SHASUMS256.txt`. The workflow separately verifies the packaged app
with `codesign`, `stapler`, and Gatekeeper before publishing.

Alternative considered: upload the unpacked Forge package directory. Rejected because it is not a
stable downloadable artifact and has no singular checksum identity.

### 5. Publication is the final side effect

The tag workflow runs source gates and every native release assertion before invoking `gh release
create`. It publishes only the exact ZIP and checksum manifest. GitHub contents write permission is
granted only to the publishing job; ordinary CI remains read-only.

Alternative considered: create a draft release before building. Rejected because failed signing or
notarization would leave an externally visible release object without accepted artifacts.

### 6. Platform tests remain separate from package support

Ubuntu and Windows runners execute deterministic source, Desktop typecheck, orchestration, and
local-metadata tests without Forge. Their success proves cross-platform test compatibility only.
The macOS native job is the only CI job allowed to package, make, or upload a Desktop artifact.

## Risks / Trade-offs

- [Apple credentials are not configured] → Release mode fails before Forge; repository code can be
  validated locally, but a real public release remains blocked until repository secrets are added.
- [Apple notarization service is unavailable] → The tag run fails and no GitHub Release is created;
  rerun the same immutable tag after service recovery.
- [ZIP maker output naming changes] → The exact artifact assertion fails visibly and must be updated
  with a regression test before publication resumes.
- [Only macOS 15 is exercised remotely] → Do not claim older-version compatibility without a
  separate real-host acceptance matrix.
- [No installer or updater] → The first release surface is a notarized ZIP; DMG/PKG and updates
  require a later capability change.

## Migration Plan

1. Restrict native product/runtime matrices to `darwin-arm64`; retain Windows/Linux test jobs.
2. Add release-mode Forge signing/notarization configuration and deterministic unit tests.
3. Add release metadata/artifact assertions and workflow-shape tests.
4. Add the tag-triggered release workflow and update release documentation.
5. Run local package/make verification in development mode and all repository gates.
6. Configure GitHub secrets, push an exact version tag from `main`, and record the first real
   signing/notarization/Gatekeeper/GitHub Release evidence.

Rollback removes the tag workflow and release-mode configuration together. Already-published
GitHub Releases are external records and must not be silently overwritten or deleted by rollback.

## Open Questions

- The first real tag run and Apple credential setup remain external repository-owner actions.
- DMG/PKG format, auto-update, stable/beta channels, and older-macOS qualification remain future
  decisions.
