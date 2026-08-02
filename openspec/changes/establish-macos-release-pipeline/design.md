## Context

OpenNeko produces an ad-hoc-signed `darwin-arm64` Forge package and has a tag-triggered workflow.
The workflow currently stops when paid Apple credentials are absent, while the present open-source
channel needs an explicitly unnotarized preview DMG. The product is a local Electron Desktop
application; release assembly belongs to the Application composition root and GitHub workflow
boundary rather than a domain package.

Ownership remains:

- producer: the release tag selects the public version, a repository script projects it into the
  ephemeral Desktop manifest, and `forge.config.ts` produces the versioned DMG;
- consumer: the repository release workflow validates and publishes that output;
- canonical path: Electron Forge `make` for `darwin-arm64`, followed by repository-owned release
  assertions;
- runtime boundary: GitHub-hosted Apple Silicon macOS using explicit ad-hoc signing and native DMG
  tooling without Apple credentials;
- replaced path: Developer ID-only publication and manually uploaded ZIPs cannot become current
  preview evidence;
- user data: no project, settings, credential-store, or workspace data is read or migrated.

## Goals / Non-Goals

**Goals:**

- Make macOS Apple Silicon the sole native package and public release target.
- Require source, version, ad-hoc signature, DMG integrity, disclosure, artifact, and checksum
  evidence before preview publication.
- Keep the current preview path free of Apple secrets.
- Keep development and preview packaging on one explicit ad-hoc Forge trust mode.
- Keep Windows and Linux available only for deterministic tests.

**Non-Goals:**

- Package or publish Windows/Linux artifacts.
- Add Intel/universal macOS output, Mac App Store delivery, PKG installers, auto-update, or a release
  channel beyond GitHub Releases.
- Claim Developer ID signing, notarization, or normal Gatekeeper acceptance; those require a future
  formal-release change and Apple Developer Program credentials.
- Claim compatibility for untested macOS versions merely because Electron can start on them.
- Change application runtime behavior, domain contracts, project formats, or user data.

## Decisions

### 1. The tag is the singular public version authority

A release tag MUST be an exact stable `v<major>.<minor>.<patch>` value and the tagged commit MUST be
reachable from `origin/main`. The local `apps/neko-desktop/package.json` version remains a
development/package default and does not restrict the public release version. After frozen-lockfile
installation, the macOS release job projects the tag-derived version into its ephemeral checkout
before Forge runs. Forge therefore writes one version into the application metadata and MakerDMG
name, while no repository version file is committed or required to match the tag.

Alternative considered: require developers to update and commit the Desktop manifest before every
tag. Rejected because it couples local development versioning to publication and caused valid tag
releases to fail before any native work began.

Alternative considered: rename only the final ZIP. Rejected because the archive name and the
application's embedded version would diverge.

### 2. Development and preview packaging share one explicit trust mode

Default `package`/`make` and the current tag workflow use the same explicit ad-hoc signature. The
workflow does not set a release-signing mode, import a keychain, or read Apple credentials. It
verifies the ad-hoc package and marks the GitHub Release as a prerelease with an unnotarized warning.

The signing mode remains in `apps/neko-desktop` because it configures Electron application bytes
and macOS trust metadata. It does not decide a domain result and is not a reusable host-neutral
business service.

Alternative considered: conditionally use Developer ID when secrets happen to exist and otherwise
fall back to ad-hoc signing. Rejected because one tag would have ambiguous trust semantics. A future
signed channel must be explicit and separately specified.

### 3. The current preview path owns no Apple credential lifecycle

The workflow does not decode a certificate, create a keychain, or call Apple's notarization service.
This removes secret ownership from the current preview boundary. Developer ID and notarization are
deferred until the project intentionally establishes a formal signed distribution channel.

Alternative considered: commit a certificate/profile or use the login keychain. Rejected because it
widens secret lifetime and makes cleanup/ownership ambiguous.

### 4. Preview output is one verified DMG plus one checksum manifest

Forge `make` remains the sole distributable producer and the maker is restricted to `darwin`.
A repository-owned assertion resolves the exact versioned DMG, rejects missing or ambiguous output,
computes SHA-256, and writes `SHASUMS256.txt`. The workflow verifies the packaged app's ad-hoc
signature and the DMG with native macOS tooling before publishing.

Alternative considered: retain ZIP as a second distributable. Rejected because it creates parallel
preview artifacts and weakens the canonical installation path.

### 5. Publication is the final side effect

The tag workflow runs source gates and every native preview assertion before invoking `gh release
create --prerelease`. It publishes only the exact DMG and checksum manifest together with explicit
unnotarized installation notes. GitHub contents write permission is granted only to the publishing
job; ordinary CI remains read-only.

Alternative considered: create a draft release before building. Rejected because failed signature
or DMG integrity checks would leave an externally visible release object without accepted artifacts.

### 6. Platform tests remain separate from package support

Ubuntu and Windows runners execute deterministic source, Desktop typecheck, orchestration, and
local-metadata tests without Forge. Their success proves cross-platform test compatibility only.
The macOS native job is the only CI job allowed to package, make, or upload a Desktop artifact.

## Risks / Trade-offs

- [Users expect normal Gatekeeper acceptance] → Release notes state that the preview is ad-hoc
  signed and unnotarized and explain the manual “Open Anyway” path.
- [DMG maker output naming changes] → The exact artifact assertion fails visibly and must be updated
  with a regression test before publication resumes.
- [Tag projection fails or Forge ignores it] → The exact tag-derived DMG assertion fails before
  trust verification or publication; the workflow never renames a mismatched artifact into success.
- [Only macOS 15 is exercised remotely] → Do not claim older-version compatibility without a
  separate real-host acceptance matrix.
- [No formal signed channel or updater] → Developer ID/notarization and updates require later
  capability changes.

## Migration Plan

1. Restrict native product/runtime matrices to `darwin-arm64`; retain Windows/Linux test jobs.
2. Keep Forge ad-hoc signing explicit and add the macOS DMG maker.
3. Add tag-owned DMG/checksum assertions and workflow-shape tests.
4. Remove Apple credential/notarization steps from the current preview workflow and add prerelease
   disclosure.
5. Run local DMG verification and all repository gates.
6. Push a new stable version tag from `main` and record the first DMG preview release evidence.

Rollback removes the tag workflow and DMG preview configuration together. Already-published
GitHub Releases are external records and must not be silently overwritten or deleted by rollback.

## Open Questions

- The first DMG preview tag run remains an external repository-owner action.
- Developer ID/notarization, PKG format, auto-update, stable channels, and older-macOS qualification
  remain future decisions.
