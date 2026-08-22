## ADDED Requirements

### Requirement: Search runtime dependencies are explicit

Project Search coordination SHALL require its complete runtime dependency contract at construction and SHALL NOT synthesize empty workspace roots, mirrored context, no-op logging, or time defaults for missing production dependencies.

#### Scenario: Missing runtime dependency

- **WHEN** a caller attempts to construct Project Search coordination without the complete required port object
- **THEN** construction fails visibly before any query or index operation can report success

### Requirement: Search registrations have exact unique identities

Project Search SHALL map each partition and semantic provider identity to exactly one registration and SHALL reject duplicates without disposing, replacing, or mutating the existing registration.

#### Scenario: Duplicate partition adapter

- **WHEN** a second adapter registers an already registered partition identity
- **THEN** registration throws an exact duplicate diagnostic and the first adapter remains registered and undisposed

#### Scenario: Duplicate semantic provider

- **WHEN** a second provider registers an already registered provider identity
- **THEN** registration throws an exact duplicate diagnostic and the first provider remains registered and undisposed

### Requirement: Partition lifecycle failures remain visible

Project Search SHALL NOT mark initialization or refresh as successful or fresh when any selected partition operation fails. Query aggregation MAY preserve successful sibling results only when the returned partition projection and aggregate freshness explicitly expose every failed partition.

#### Scenario: Initialization partition fails

- **WHEN** one selected partition rejects initialization
- **THEN** the project is not marked initialized and the caller receives a diagnostic identifying the failed partition

#### Scenario: Refresh partition fails

- **WHEN** one selected partition rejects refresh
- **THEN** no fresh change event is emitted for that failed refresh and the caller receives a diagnostic identifying the failed partition

#### Scenario: Query partition fails beside a successful sibling

- **WHEN** one query partition succeeds and another rejects
- **THEN** any returned sibling items are accompanied by failed partition status and non-fresh aggregate state rather than a success hidden only in logs
