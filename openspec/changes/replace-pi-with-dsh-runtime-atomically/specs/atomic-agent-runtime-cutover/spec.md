## ADDED Requirements

### Requirement: Retired execution paths are deleted before replacement implementation

The migration integration branch SHALL begin with a destructive D0 code cut: remove the Pi runtime, self-developed Tool registry and queue/projectors, Skill Host, MCP Manager, Plugin runtime, their production registrations/public exports/direct dependencies, and any parallel DSH client path before ACP/DSH replacement implementation. The branch MAY be temporarily uncompilable or unrunnable. Every resulting failure SHALL be retained as an explicit replacement inventory item until the canonical ACP/DSH owner closes it. Stub success, no-op handlers, compatibility adapters, restored retired code and temporary fallback are prohibited. D0 MUST NOT read, modify or delete retired Pi Session files, databases, user-directory content or data-protection fixtures.

#### Scenario: D0 exposes an unresolved consumer

- **WHEN** removing a retired producer causes a production import, registration, fixture or test to fail
- **THEN** the exact failure is recorded in the replacement inventory and remains visible
- **AND** no retired implementation, placeholder success or compatibility adapter is introduced to make it pass

#### Scenario: D0 runs with retired user data present

- **WHEN** Pi JSONL, databases, unknown user files or byte-preservation fixtures exist
- **THEN** D0 deletes only repository execution code, registrations, exports and dependencies
- **AND** protected data hashes remain byte-equal before and after deletion

### Requirement: Deterministic Q0 qualification gates production implementation

Before production consumer switching, Q0 SHALL establish or rebuild a non-release `scripts/dsh-q0` fixture and verify the DSH subprocess lifecycle, ACP stdout purity, handshake/capability negotiation, Session list/load/resume/history, Tool/progress updates, permission, cancellation, inbox operations, typed Host Tool reverse requests, official extension management and crash/restart isolation. Existing global DSH CLI usability is accepted and SHALL NOT trigger another installation task. A missing required deterministic result SHALL stop production implementation rather than introduce a fallback.

#### Scenario: Deterministic Q0 passes

- **WHEN** every required key-free subprocess/ACP behavior has repeatable evidence
- **THEN** the integration owner freezes the exact DSH/profile closure and shared contracts
- **AND** W1–W6 may enter production development

#### Scenario: Required bridge behavior needs a second runtime

- **WHEN** qualification requires copying DSH Session, inbox, Tool or extension state machines
- **THEN** Q0 fails and consumer cutover stops
- **AND** the bridge scope is not expanded to bypass the failure

### Requirement: Development runtime generations remain atomic

The Desktop development watcher SHALL observe the complete official DSH bridge and domain Plugin input set owned by the development closure builder. When one of those inputs changes, it SHALL build and qualify the content-fresh closure before restarting Electron Main and its DSH subprocess. It MUST NOT allow a newly built Main contract consumer to continue against an older in-memory DSH producer, and it MUST NOT add a legacy decoder or compatibility path to accept that stale producer.

#### Scenario: Bridge contract changes during Desktop development

- **WHEN** an official bridge source or shared contract input changes while Forge development mode is running
- **THEN** the watcher rebuilds and qualifies the DSH closure before requesting the Main restart
- **AND** the restarted Main connects only to the new producer generation

#### Scenario: Development closure rebuild fails

- **WHEN** an observed DSH bundle input cannot build or qualify
- **THEN** the Main restart is not requested and the failure remains visible
- **AND** the current generation is not presented as compatible with the new consumer

### Requirement: Deferred real provider verification permits development but not release

Real provider/API validation MAY be temporarily skipped by explicit user direction. While skipped, its tasks SHALL remain unchecked and labelled “not release evidence”. Deterministic Q0 MAY still authorize W1–W6 implementation, but the unified release guard MUST remain closed until this change's required real Desktop/provider evidence is completed or another accepted OpenSpec explicitly redefines that gate.

#### Scenario: Real API validation is currently skipped

- **WHEN** deterministic Q0 passes without contacting a provider
- **THEN** production development may begin against the frozen contracts
- **AND** no release artifact or release candidate treats Q0 as Agent behavior evidence

#### Scenario: Release is requested before provider evidence exists

- **WHEN** the required real Desktop/provider matrix remains incomplete
- **THEN** packaging or release-candidate creation fails closed
- **AND** the missing evidence is reported rather than silently waived

### Requirement: Parallel workstreams share one integration authority

After the integration owner completes D0 and freezes shared contracts, subprocess/bridge, first domain Tool slice, extension management, product consumer, catalog/data, subsequent Tool migration, Evaluation and deletion-proof work MAY proceed in isolated worktrees. They SHALL share one total change, one integration owner and one integration branch. A file-owner manifest SHALL assign contract, bridge, projection, catalog, Evaluation and deletion-proof surfaces without overlap. No workstream SHALL independently add compatibility fields, restore retired paths or define release truth.

#### Scenario: A workstream discovers a contract gap

- **WHEN** its implementation cannot consume the frozen canonical shape
- **THEN** the integration owner updates the shared contract once and affected workstreams rebase
- **AND** no local alias, internal version discriminator or nullable legacy field is added

#### Scenario: A workstream completes early

- **WHEN** its focused tests pass before the other workstreams
- **THEN** it may merge only into the integration-only branch
- **AND** it cannot publish a product artifact or claim migration completion

### Requirement: Integration order establishes one future runtime

D0 SHALL delete retired execution paths before replacement implementation. Q0 and contract freeze SHALL establish the only new boundary. W1 SHALL establish the DSH subprocess and ACP bridge spine. W2 SHALL prove Generation and Canvas end-to-end as the first Tool slice. W3 SHALL establish DSH-owned official extension management. W4 SHALL switch contracts and Desktop consumers. W5 SHALL protect catalog and retired Pi data. W6 SHALL migrate remaining domain Tools. W7 SHALL collect Evaluation evidence. W8 SHALL prove that deletion is complete and close every replacement inventory item. No intermediate state SHALL be released.

#### Scenario: Retired producer still has a consumer

- **WHEN** source, fixture, test, built output or Evaluation evidence still references it
- **THEN** W8 deletion proof and the release gate fail
- **AND** the removed producer is not restored beside DSH as compatibility code

#### Scenario: First vertical Tool slice passes

- **WHEN** Generation and Canvas complete the native UI/ACP/DSH/Host/domain round trip
- **THEN** subsequent domain Tool migration may proceed using the same canonical bridge
- **AND** no alternate MCP or direct-runtime path is introduced for other domains

### Requirement: One unified gate authorizes the atomic release

Release SHALL require the exact packaged DSH closure, ACP-only transport, completed consumer cutover, bridge thinness proof, domain Tool evidence, official extension isolation, retired-data byte equality, old-path deletion, deterministic quality gates and required real Desktop/provider Evaluation together. The final repository SHALL contain one canonical runtime, contract, Tool registration and extension execution path. Q0 fixtures SHALL remain non-release artifacts.

#### Scenario: Atomic release candidate is produced

- **WHEN** every required gate passes on the integration branch
- **THEN** exactly one release candidate is produced
- **AND** its evidence records the DSH closure, validation commands, deletion inventory and residual risks

#### Scenario: Any required gate is missing

- **WHEN** qualification, provider evidence, data protection, deletion or canonical-path proof is incomplete
- **THEN** release packaging, tagging and candidate creation fail closed
- **AND** completed workstreams are not selectively published
