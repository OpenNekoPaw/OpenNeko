## 1. Contracts And Regression Guards

- [x] 1.1 Add deterministic tests for the two final artifact names, exact feature membership, manifest composition, and rejection of separate public feature VSIX files
- [x] 1.2 Add registry and scoped-context tests covering lazy activation, activation order, duplicate/missing/cyclic identities, resource roots, storage namespaces, and reverse cleanup
- [x] 1.3 Update application manifest tests from pure extension-pack expectations to the single runtime extension contract

## 2. Application Composition Runtime

- [x] 2.1 Implement the shared embedded feature API registry at the VS Code host boundary
- [x] 2.2 Implement the application-owned scoped ExtensionContext projection and explicit legacy-extension conflict diagnostic
- [x] 2.3 Add the OpenNeko application activation/deactivation entry and register retained feature adapters in canonical dependency order
- [x] 2.4 Migrate internal Neko feature discovery callers to the registry while preserving VS Code discovery for external extensions

## 3. Deterministic Platform Assembly

- [x] 3.1 Implement manifest/localization merging with collision diagnostics and internal dependency removal
- [x] 3.2 Implement build-only feature VSIX extraction and final staging without exposing intermediate packages
- [x] 3.3 Assemble `OpenNeko-darwin-arm64-<version>.vsix` and `OpenNeko-linux-x64-<version>.vsix` with exact native closure and package-content validation
- [x] 3.4 Update package groups, root commands, application docs, and stable architecture docs for the single installed product

## 4. CI And Release Migration

- [x] 4.1 Replace separate TS/Engine CI artifacts with the shared OpenNeko platform matrix and require both outputs in Manual/Merge Gate
- [x] 4.2 Replace Release multi-package publication with the exact two-file OpenNeko allowlist plus `SHA256SUMS`
- [x] 4.3 Update release-source, release-channel, orchestration, and platform-matrix guards so internal feature VSIX files cannot reach publication

## 5. Verification And Migration Evidence

- [x] 5.1 Run focused assembler, registry, manifest, orchestration, release-channel, OpenSpec, formatting, debt, and unused-code checks
- [x] 5.2 Build and inspect the host-platform OpenNeko VSIX, proving complete feature payloads and single-target native closure
- [ ] 5.3 Run supported-platform GitHub packaging and install/activate each final VSIX in an isolated Extension Development Host fixture
- [x] 5.4 Record L4 quality review, legacy multi-extension migration behavior, unexecuted platform/runtime evidence, and residual risk
