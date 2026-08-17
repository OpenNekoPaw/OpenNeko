## ADDED Requirements

### Requirement: DSH qualification gates implementation cutover

The migration SHALL complete Q0 before final production consumer switching. Q0 MUST freeze the exact DSH package/version closure, license evidence, peer resolution, supported Electron/Node targets, Session persistence behavior, real provider path and shared Agent/Extension contracts. Failure of any required qualification MUST stop cutover rather than retain Pi or silently reduce acceptance.

#### Scenario: DSH package family is qualified

- **WHEN** every required package resolves to the reviewed RC family and passes the target runtime matrix
- **THEN** the integration owner records the immutable package list, lockfile resolution and qualification evidence
- **AND** parallel implementation work consumes that exact frozen contract

#### Scenario: One qualification blocker remains

- **WHEN** Session restore, production packaging, credentials, Tool execution or a required provider cannot pass Q0
- **THEN** the change remains not apply-complete and not releaseable
- **AND** no runtime flag or Pi fallback is introduced to bypass the blocker

### Requirement: Parallel workstreams share one integration authority

Agent spine, MCP, Skill, Plugin, product contract/consumer, catalog/data, Tool and Evaluation work MAY proceed in isolated branches or worktrees after contract freeze. They SHALL share one total change, one integration owner and one integration branch. A shared owner manifest SHALL assign contract, composition, projection, catalog, Evaluation and deletion surfaces without overlap. No workstream SHALL independently define shared contract fields, delete shared retired paths, add compatibility aliases or define release truth.

#### Scenario: Workstreams implement independent owners

- **WHEN** MCP, Skill, Plugin and Tool adapter work proceeds concurrently
- **THEN** each workstream changes only its assigned owner and consumes the frozen public contracts
- **AND** shared contract changes return to the integration owner for one coordinated update and rebase

#### Scenario: A workstream needs a compatibility field

- **WHEN** one implementation cannot consume the frozen canonical shape
- **THEN** integration stops and the shared contract is reconsidered for all consumers
- **AND** the workstream does not add a local legacy field, nullable alias, version discriminator or fallback path

### Requirement: Integration order preserves a single future runtime

The integration branch SHALL merge the DSH Agent/Session/Tool spine before MCP, Skill, Plugin and domain Tool consumers, and SHALL remove old product identity/contract fields only after every consumer has switched. Old producer deletion and final consumer switching MUST occur within the same integration change.

#### Scenario: Integrate prepared workstreams

- **WHEN** W1–W8 are ready for integration
- **THEN** W1 establishes the DSH spine, W2/W3/W4/W5b/W6 integrate against frozen boundaries, W5a switches product consumers, W7 verifies the complete path, and W8 performs final old-path deletion
- **AND** no intermediate integration state is tagged, packaged or described as a product release

#### Scenario: Old producer still has a consumer

- **WHEN** deletion evidence finds a production, fixture, test or Evaluation consumer of a retired path
- **THEN** the integration gate fails before deletion or release
- **AND** the old producer is not retained beside DSH as a compatibility implementation

### Requirement: Workstreams cannot publish intermediate product states

P1–P4 and W1–W8 SHALL be internal engineering milestones only. A branch that contains only a subset MUST be marked integration-only and MUST NOT enter normal release automation, publish a Desktop artifact, create a release tag or claim the DSH migration is available. A machine-verifiable release guard SHALL reject packaging, tagging and release-candidate creation when qualification, consumer cutover, deletion, data-protection or real Evaluation evidence is absent. Q0 MAY build only an isolated non-release qualification fixture.

#### Scenario: One parallel workstream completes early

- **WHEN** MCP or Skill migration passes its focused tests before the other workstreams
- **THEN** its result may be reviewed and merged only into the migration integration branch
- **AND** ordinary release workflows cannot consume that branch as a finished product

#### Scenario: A partial branch invokes release packaging

- **WHEN** a branch lacks any required workstream, deletion proof or real Evaluation evidence
- **THEN** the release guard rejects Desktop release packaging, tagging and candidate creation
- **AND** an isolated Q0 compatibility bundle cannot be promoted or mistaken for a product artifact

### Requirement: One unified gate authorizes atomic release

Release SHALL require all workstreams and all deterministic, data-protection, security, package, Desktop and Agent Evaluation gates to pass together. The final repository MUST contain one canonical runtime/contract/registration path and no Pi/DSH selection, fallback, old export or test-only direct runtime shortcut.

#### Scenario: Atomic release candidate is produced

- **WHEN** all producers and consumers use DSH, old Pi data remains protected, old paths are absent, and the real Desktop/provider matrix passes
- **THEN** one release candidate is produced from the integration branch
- **AND** its evidence identifies every qualified package, workstream, validation command and residual risk

#### Scenario: One required gate fails

- **WHEN** any no-fallback, user-data, Plugin trust, credential, Session recovery, visible UI or real provider gate fails
- **THEN** no release candidate is produced
- **AND** the system does not selectively publish completed workstreams
