## ADDED Requirements

### Requirement: Asset Library owns creative materials independently

The Desktop Asset Library SHALL manage OpenNeko-owned creative materials independently from Media Library connections. Its search and lifecycle MUST NOT infer asset membership from a file appearing in a connected Media Library.

#### Scenario: Browse Asset Library content

- **WHEN** the user opens the Asset Library
- **THEN** the application lists only materials owned by the Asset Library source

#### Scenario: Add a Media Library

- **WHEN** a user connects an external directory as a Media Library
- **THEN** no file from that directory appears in the Asset Library unless a separate explicit asset-ingest operation succeeds

### Requirement: Asset distribution metadata has an Asset Library owner

Future sharing, distribution, version, license, and access metadata SHALL be owned by the Asset Library capability and MUST NOT be stored in Media Library links or inferred from directory structure.

#### Scenario: Prepare an asset for sharing

- **WHEN** a future workflow publishes or shares a creative material
- **THEN** it uses Asset Library identity and metadata rather than a Media Library path as the distribution record

### Requirement: Legacy Asset catalog runtime remains retired

The independent Asset Library SHALL NOT restore `library.json`, `project://assets/`, legacy AssetEntity membership, or legacy fallback resolution as its runtime model.

#### Scenario: Encounter a legacy Asset URI

- **WHEN** a normal Asset Library request contains a legacy Asset URI
- **THEN** it fails closed through the existing migration-required path rather than resolving it as a current asset
