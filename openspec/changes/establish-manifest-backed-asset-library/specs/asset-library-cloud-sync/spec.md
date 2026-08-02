## ADDED Requirements

### Requirement: Cloud synchronization replicates managed Asset revisions only

Cloud synchronization SHALL publish and retrieve only explicitly managed manifest-backed Asset packages.
It MUST NOT scan, upload, catalog, or synchronize arbitrary workspace directories, Media Library linked
directories, or mutable Project Entity documents.

#### Scenario: Synchronize the Asset Library

- **WHEN** a user synchronizes an account with workspace and Media Library files present
- **THEN** only eligible managed Asset revisions enter the transfer plan

#### Scenario: Use a provider-synchronized media directory

- **WHEN** a cloud provider synchronizes files into a local directory linked by Media Library
- **THEN** those files remain ordinary locator-addressed files and are not registered by Asset cloud sync

### Requirement: Installed local revisions remain the offline authority

Verified installed manifests and package bytes SHALL remain usable without network access or remote catalog
availability. Remote heads, discovery results, reconciliation cursors, and transfer checkpoints MUST be
treated as rebuildable local state rather than prerequisites for opening installed Assets.

#### Scenario: Open an Asset while offline

- **WHEN** the requested revision and dependency closure are installed and the remote is unavailable
- **THEN** the consumer resolves the local verified package without network fallback

#### Scenario: Lose remote projection state

- **WHEN** rebuildable remote catalog and cursor rows are deleted
- **THEN** installed Assets remain usable and a later synchronization can rebuild remote projections

### Requirement: Downloads install atomically after verification

The synchronization runtime SHALL stage downloaded manifests and content outside the installed namespace,
verify schema, identity, dependency closure, size policy, and digests, and atomically expose only the fully
valid closure. Cancellation, interruption, or verification failure MUST NOT expose a partial installed
revision.

#### Scenario: Complete a verified download

- **WHEN** every manifest and blob in the requested dependency closure passes validation
- **THEN** the runtime atomically commits the revisions and emits installed completion

#### Scenario: Download is interrupted

- **WHEN** the process, network, or user cancels before commit
- **THEN** no partial revision becomes installed and verified staging data may be resumed by digest

#### Scenario: Download contains corrupt content

- **WHEN** a downloaded blob does not match its declared digest
- **THEN** the runtime rejects and quarantines or removes that staging content with an integrity diagnostic

### Requirement: Publication commits immutable revisions with conflict detection

Publication SHALL validate and snapshot the local package, upload missing content-addressed blobs, and
commit the immutable manifest only when the expected remote head still matches. A partial upload MUST NOT
be discoverable as a published revision, and a head mismatch MUST NOT be resolved by silent overwrite.

#### Scenario: Publish a new revision

- **WHEN** package validation succeeds and the expected remote head matches
- **THEN** the remote atomically exposes the new manifest revision after all referenced blobs are available

#### Scenario: Remote head changed concurrently

- **WHEN** another publication changes the head after local planning
- **THEN** commit fails with a conflict that requires refresh or publication of an explicitly reconciled revision

### Requirement: Dependencies transfer by exact identity

Cloud synchronization SHALL transfer and verify required dependencies using exact Asset identity, revision,
and digest. It MUST NOT substitute a latest revision, filename match, or local path when the declared
dependency is unavailable.

#### Scenario: Pull a package dependency closure

- **WHEN** the requested revision declares dependencies absent locally
- **THEN** the transfer plan includes their exact manifests and missing blobs before installation

#### Scenario: Exact dependency is unavailable

- **WHEN** the remote cannot provide a declared dependency revision and digest
- **THEN** synchronization fails visibly without installing the dependent revision

### Requirement: Remote deletion is non-destructive locally

A remote tombstone or loss of remote access SHALL remove the item from normal remote discovery but MUST
NOT uninstall a verified local revision, delete a project-pinned package, or mutate a project instantiated
from that Asset. Local uninstall remains a separate explicit operation.

#### Scenario: Remote revision is deleted

- **WHEN** reconciliation observes a tombstone for a locally installed revision
- **THEN** the UI reports remote unavailability while the local revision and project references remain intact

### Requirement: Credentials stay outside manifests and SQLite sync state

Remote credentials and refresh secrets SHALL be stored by the operating-system credential authority and
referenced through an opaque account identity. Asset manifests, project files, logs, reports, and SQLite
sync rows MUST NOT contain credential material.

#### Scenario: Persist synchronization state

- **WHEN** the runtime checkpoints a transfer or reconciliation cursor
- **THEN** it stores only non-secret provider/account references and operational state

#### Scenario: Credential is unavailable

- **WHEN** synchronization requires an absent or expired credential
- **THEN** it fails with an authentication diagnostic while installed Assets remain usable

### Requirement: Runtime repository binding is local and explicit

The synchronization runtime SHALL select its remote through an explicit machine-local account and
repository binding. Manifest `remote` or `registry` source metadata MUST remain non-secret provenance and
MUST NOT be invoked as a path resolver, credential source, signed download URL, or implicit sync target.

#### Scenario: Synchronize an Asset with origin provenance

- **WHEN** an installed manifest records an origin but no local repository binding exists
- **THEN** synchronization reports that account/repository selection is required and does not contact the origin as an implicit fallback

#### Scenario: Change the local account binding

- **WHEN** the user explicitly selects another authorized repository for an Asset
- **THEN** the runtime updates only local sync state and does not rewrite the immutable installed manifest

### Requirement: Synchronization exposes resumable instance-scoped progress

Every synchronization operation SHALL carry explicit operation and account identity, expose bounded
progress and typed diagnostics, and support cancellation. Stale events MUST NOT update another operation,
and verified content-addressed staging data MAY be reused by a later matching transfer.

#### Scenario: Cancel one of multiple transfers

- **WHEN** the user cancels one operation while another account or package transfer is active
- **THEN** only the matching operation stops and each operation retains independent state and events

#### Scenario: Resume a matching download

- **WHEN** a later operation requests blobs already verified in staging
- **THEN** it reuses those blobs by digest and revalidates the final closure before commit
