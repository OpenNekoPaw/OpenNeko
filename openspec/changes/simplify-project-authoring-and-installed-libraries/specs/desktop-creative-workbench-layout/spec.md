## MODIFIED Requirements

### Requirement: Desktop preserves existing navigation and composes package-owned Roots

Desktop SHALL preserve the existing primary sidebar, Project/history navigation and existing Character, World, Project, Asset, Extension and Settings management scenes. Conversation and Creation SHALL appear only in Agent Entry. Desktop SHALL mount only the package-owned Root required by the current visible scene and exact owner receipt, and SHALL unmount outgoing Roots that are not protected background runtimes. It MUST NOT add installed-library, adaptation, recovery or publication-plan management scenes.

#### Scenario: User opens Project Workspace

- **WHEN** Host authorizes one exact Project scene
- **THEN** Desktop mounts its mixed-domain Project Workspace Root in Main
- **AND** it does not retain the Agent Entry, another Workspace or a hidden Character/World management Root

#### Scenario: Agent Entry selects Project context

- **WHEN** Creation receives an exact Project selection
- **THEN** Desktop leaves Agent Entry visible and projects the Project through the Composer context bar
- **AND** it does not navigate to or mount the Project Workspace as a side effect

### Requirement: Desktop remains a thin trust and composition boundary

Desktop SHALL validate sender/window/path grants, delegate typed commands to package public ports and compose owner-issued receipts. It MUST NOT decide global object identity, version lineage, synchronization conflict, ZIP business intent, Project membership semantics, runtime eligibility or exact-reference update policy. A malformed command or failed owner receipt SHALL reject only the current operation without selecting another handler, source, Project or version.

#### Scenario: ZIP import is authorized

- **WHEN** Host grants one package path and the owning domain accepts the validated inventory
- **THEN** Desktop returns and projects the exact global object/version receipt
- **AND** it does not create an installation record, infer a Project or retain the package path

#### Scenario: Owner command fails

- **WHEN** a synchronization or runtime launch returns an owner-qualified failure
- **THEN** Desktop displays that operation's diagnostic and preserves unrelated visible scenes and runtimes
- **AND** it does not retry through an obsolete installed/adaptation handler or active-instance fallback
