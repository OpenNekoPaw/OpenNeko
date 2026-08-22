# media-local-metadata-package-removal Specification

## Purpose
TBD - created by archiving change remove-media-local-metadata-package. Update Purpose after archive.
## Requirements
### Requirement: Zero-consumer media-local-metadata shell is removed

The system SHALL delete the `@neko/media-local-metadata` workspace package and every machine-readable
reference to it. The media metadata repository and SQLite schema SHALL remain owned by
`@neko/local-metadata`, and the active Node workspace metadata binding SHALL remain owned by
`@neko/search-local-metadata`.

#### Scenario: Package and ledger references are absent

- **WHEN** the repository runs package-roles and internal-versioning checks
- **THEN** no `@neko/media-local-metadata` entry or findings block remains
- **AND** `@neko/local-metadata` still exposes the media metadata repository

### Requirement: No repository ownership is relocated

Deleting the shell SHALL NOT move media metadata repository ownership, introduce a replacement binding or
facade, or change any persisted data shape.

#### Scenario: Media metadata remains readable through its owner

- **WHEN** a production consumer reads media metadata
- **THEN** it uses `@neko/local-metadata`'s repository (or `@neko/search-local-metadata`'s binding)
- **AND** no `@neko/media-local-metadata` path participates
