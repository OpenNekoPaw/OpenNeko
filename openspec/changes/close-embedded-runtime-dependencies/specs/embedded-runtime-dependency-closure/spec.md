## ADDED Requirements

### Requirement: Embedded native modules use feature-scoped identities

An embedded feature MUST load its packaged native module through a path derived from its scoped Extension Context and MUST NOT resolve an internal workspace package by bare package name at runtime.

#### Scenario: Engine activates inside the unified VSIX

- **WHEN** the application activates the embedded Engine feature
- **THEN** Engine loads `packages/host-napi/loader.js` from its feature-scoped absolute path and validates `NativeEngine.create`

#### Scenario: Engine loader is absent or invalid

- **WHEN** the scoped loader path is missing or does not expose the required CommonJS binding
- **THEN** Engine activation or first Engine work fails with an explicit module/path diagnostic and does not search the workspace or a global package tree

#### Scenario: Package Engine for macOS

- **WHEN** the Engine payload is packaged on `darwin-arm64`
- **THEN** every non-system dependency reachable from the N-API binary and its FFmpeg libraries is copied into the feature payload, uses an `@loader_path` load command, and is ad-hoc signed

#### Scenario: Build-machine library would escape the payload

- **WHEN** a Mach-O dependency is missing, uses an unsupported unresolved load path, or collides by basename with a different source library
- **THEN** Engine packaging fails visibly and does not create a release-ready VSIX

#### Scenario: VSCE runs Engine prepublish

- **WHEN** the platform packager invokes VSCE after patching the native closure
- **THEN** prepublish compiles only TypeScript and does not rebuild or overwrite the patched N-API binary

### Requirement: Document runtime modules are statically closed

`@neko/content` MUST own an exhaustive literal loader map for `adm-zip`, `pdf-parse`, `mammoth`, `officeparser`, `epub2`, `node-unrar-js`, `node-fetch`, `cheerio`, `xlsx`, and `fast-xml-parser`, and embedded consumers MUST use that canonical loader rather than an arbitrary variable package import.

#### Scenario: Agent reads a supported document

- **WHEN** Agent requests a supported document, archive, comic, spreadsheet, or remote HTML resource from an installed OpenNeko VSIX
- **THEN** every required Content runtime module resolves from the Agent bundle without an external `node_modules` lookup

#### Scenario: Assets analyzes a supported document

- **WHEN** Assets semantic discovery reads a supported document, archive, comic, spreadsheet, or remote HTML resource
- **THEN** every required Content runtime module resolves from the Assets bundle through the same Content-owned loader

#### Scenario: Unknown parser name is requested

- **WHEN** a caller requests a document module outside the exhaustive supported set
- **THEN** the loader fails with an explicit unsupported-module diagnostic

### Requirement: Feature-owned runtime package manifests are target exact

A feature that retains external runtime packages MUST stage only the packages for the current supported target and MUST emit a versioned closure manifest containing exact module specifiers and target identity.

#### Scenario: Package Agent for macOS

- **WHEN** Agent is packaged for `darwin-arm64`
- **THEN** its payload contains the Darwin ARM64 Sharp binding and libvips package, declares both resolvable specifiers, and contains no Linux Sharp binding

#### Scenario: Package Agent for Linux

- **WHEN** Agent is packaged for `linux-x64`
- **THEN** its payload contains the Linux x64 Sharp binding and libvips package, declares both resolvable specifiers, and contains no macOS Sharp binding

#### Scenario: Native package is unavailable

- **WHEN** the package manager has not installed a required target package
- **THEN** Agent prepublish fails before creating a VSIX and names the missing package

### Requirement: Final assembly validates offline runtime closure

The OpenNeko assembler MUST reject an embedded payload containing an internal bare runtime import, a prohibited variable package import, an invalid closure manifest, a cross-target package, a missing declared module, or a module that resolves outside its owning feature root.

#### Scenario: Repository dependency masks a missing payload file

- **WHEN** a declared module is absent from the feature but can resolve from the checkout's root `node_modules`
- **THEN** assembly fails because the resolved real path is outside the staged feature root

#### Scenario: Every feature closure is complete

- **WHEN** all embedded bundles and closure manifests resolve entirely within their feature roots for the selected target
- **THEN** final VSIX creation may proceed

### Requirement: Installed product proves runtime closure

Release readiness MUST include installation and activation of the final platform VSIX in an isolated supported VS Code host with no repository `node_modules` available to the Extension Host.

#### Scenario: Validate macOS installed runtime

- **WHEN** the macOS VSIX is installed into the isolated Extension Development Host
- **THEN** all seven features activate, Engine becomes ready, and focused Agent Sharp and document parser operations complete without module-resolution diagnostics

#### Scenario: Runtime module resolution fails

- **WHEN** activation or a focused operation reports `MODULE_NOT_FOUND`, `ERR_MODULE_NOT_FOUND`, or an equivalent missing-package diagnostic
- **THEN** the platform artifact is rejected and MUST NOT be released
