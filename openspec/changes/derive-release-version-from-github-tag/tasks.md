## 1. Version Projection Contract

- [x] 1.1 Implement a host-neutral projector that derives the numeric release version from the
      GitHub tag and updates exactly the canonical publishable manifests
- [x] 1.2 Keep release-source validation for SemVer, dereferenced main ancestry, package groups, and
      manifest shape while removing checked-in-version equality as a blocker

## 2. Release Workflow

- [x] 2.1 Project release versions before dependency installation and tests in `release-tests`
- [x] 2.2 Project release versions before native and VSIX packaging in every platform matrix job
- [x] 2.3 Preserve tag-derived final artifact allowlisting, prerelease classification, protected-tag
      immutability, and publication permission isolation

## 3. Regression Coverage

- [x] 3.1 Add stable/prerelease, mismatched-source, invalid-manifest, and field-preservation projector
      tests
- [x] 3.2 Add workflow ordering tests proving every Release consumer projects before tests or
      packaging and no source-version equality gate remains

## 4. Verification

- [x] 4.1 Run focused release-source, projector, artifact-contract, and workflow orchestration tests
- [x] 4.2 Run strict OpenSpec validation, release-channel checks, formatting, diff hygiene, and L4
      quality review; record the protected existing-tag migration constraint
