## ADDED Requirements

### Requirement: Resource Browser exposes Asset Library as a distinct source

Resource Browser SHALL expose Asset Library separately from workspace files, Media Library, and Project
Entities. Asset entries MUST present package identity, type, installed revision, remote/update state, and
availability without replacing their package identity with a file path.

#### Scenario: Browse installed Assets

- **WHEN** the user selects Asset Library
- **THEN** the browser lists managed package revisions and does not mix ordinary unimported files into the result

#### Scenario: Navigate from an Asset member

- **WHEN** the user inspects a package-owned representation
- **THEN** the UI identifies its owning Asset revision and package-relative role without exposing cache or physical paths

### Requirement: Asset operations express explicit lifecycle intent

The surface SHALL provide distinct typed intents for import, install, update, publish, synchronize,
uninstall, and inspect diagnostics. It MUST NOT infer package membership or destructive intent from file
selection, discovery, or removal from a view.

#### Scenario: Remove a library record

- **WHEN** the user activates the ordinary remove action on a local Asset item
- **THEN** the confirmation states that only the Asset Library record is removed and files are preserved
- **AND** the command does not present system-trash wording or invoke an uninstall/garbage-collection intent

#### Scenario: Import selected content

- **WHEN** the user chooses Import as Asset for selected content
- **THEN** the UI collects required package facts and submits an explicit validated import intent

#### Scenario: Remove a remote search result from view

- **WHEN** an item ceases to match a filter or remote discovery result
- **THEN** no local package bytes or remote revision are deleted

### Requirement: Synchronization state is visible and actionable

The Asset Library surface SHALL distinguish local-only, synchronized, update-available, transferring,
conflicted, tombstoned-remote, and unavailable-account states and expose the relevant retry, cancel,
inspect, update, or uninstall operation.

#### Scenario: Publication conflicts

- **WHEN** a publish operation fails because the expected remote head changed
- **THEN** the item shows a conflict diagnostic and offers refresh or explicit reconciliation without reporting success

#### Scenario: Work offline

- **WHEN** the account is unavailable but an Asset is installed
- **THEN** the UI marks remote state unavailable while retaining local open/use operations

### Requirement: Asset search preserves model boundaries

Asset search SHALL query managed Asset manifest projections only. Cross-source search MAY combine results
for presentation, but each result MUST retain its workspace, Media Library, Asset Library, or Project
Entity owner and owner-specific operations.

#### Scenario: Search returns a file and an Asset

- **WHEN** a query matches an ordinary linked file and a managed Asset package
- **THEN** the results retain distinct identities and do not promote the file or flatten the Asset into a locator
