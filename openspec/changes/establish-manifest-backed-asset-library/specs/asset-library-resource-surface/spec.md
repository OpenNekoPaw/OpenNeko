## ADDED Requirements

### Requirement: Resource Browser exposes Asset Library as a distinct source

Resource Browser SHALL expose Asset Library separately from workspace files, Media Library, and Project
Entities. Asset entries MUST present package identity, type, installed revision, local head state, and
availability without replacing their package identity with a file path.

#### Scenario: Browse installed Assets

- **WHEN** the user selects Asset Library
- **THEN** the browser lists managed package revisions and does not mix ordinary unimported files into the result

#### Scenario: Navigate from an Asset member

- **WHEN** the user inspects a package-owned representation
- **THEN** the UI identifies its owning Asset revision and package-relative role without exposing cache or physical paths

### Requirement: Asset operations express explicit lifecycle intent

The surface SHALL provide distinct typed intents for local import, install, update-head, remove-record,
uninstall, garbage collection, and inspect diagnostics. It MUST NOT infer package membership or destructive intent from file
selection, discovery, or removal from a view.

#### Scenario: Remove a library record

- **WHEN** the user activates the ordinary remove action on a local Asset item
- **THEN** the confirmation states that only the Asset Library record is removed and files are preserved
- **AND** the command does not present system-trash wording or invoke an uninstall/garbage-collection intent

#### Scenario: Import selected content

- **WHEN** the user chooses Import as Asset for selected content
- **THEN** the UI collects required package facts and submits an explicit validated import intent

### Requirement: Local package state is visible and actionable

The Asset Library surface SHALL distinguish active membership, removed membership, installed revision,
update available from an explicitly selected local package, dependency-blocked, project-pinned and invalid
package states and expose the relevant inspect, update, remove-record or uninstall operation.

#### Scenario: Local update collides with an installed revision

- **WHEN** a selected local package claims an installed `(assetId, revision)` with a different digest
- **THEN** the item shows an integrity diagnostic and does not report update success

#### Scenario: Open an installed Asset without network access

- **WHEN** the exact revision and dependency closure are installed
- **THEN** local open/use operations require no provider, account, or network state

### Requirement: Asset search preserves model boundaries

Asset search SHALL query managed Asset manifest projections only. Cross-source search MAY combine results
for presentation, but each result MUST retain its workspace, Media Library, Asset Library, or Project
Entity owner and owner-specific operations.

#### Scenario: Search returns a file and an Asset

- **WHEN** a query matches an ordinary linked file and a managed Asset package
- **THEN** the results retain distinct identities and do not promote the file or flatten the Asset into a locator

### Requirement: Resource source failure is isolated

Resources SHALL read each owner-preserving source independently. Failure to read Project Elements or
Character associations MUST NOT prevent the user from opening or searching Installed Assets, Project
Files, or Shared Media.

#### Scenario: Project composition is invalid while opening Installed Assets

- **WHEN** the current Project Elements source cannot parse its Project composition and the user selects Installed Assets
- **THEN** Resources reads Installed Assets directly without first requiring Project Elements to succeed

#### Scenario: Character association projection is unavailable

- **WHEN** Entity records are valid but the exact Project composition cannot produce Character associations
- **THEN** valid Entity items remain visible beside a Project Elements diagnostic and no empty composition is invented
