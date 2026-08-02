## MODIFIED Requirements

### Requirement: Migration does not create a replacement catalog

Migration MUST NOT create an AssetSource registry, generic resource-ID mapping table, renamed
`library.json`, dual binding field, or Media Library membership database as a compatibility destination.
A manifest-backed Asset Library MAY receive an item only when migration explicitly classifies and validates
it as a reusable package with stable identity, owned or declared members, and user-confirmed package facts.
Ordinary workspace and linked media MUST remain locator-addressed without replacement Asset IDs.

#### Scenario: Migrate ordinary media files

- **WHEN** legacy records point to ordinary workspace or linked files
- **THEN** migration emits canonical locators and optional fingerprint preconditions without allocating replacement Asset IDs

#### Scenario: Migrate an explicitly reusable package

- **WHEN** legacy owned content has an unambiguous reusable package boundary and the required package facts are confirmed
- **THEN** migration may install a validated manifest-backed Asset while preserving the original migration archive

#### Scenario: Encounter ambiguous legacy grouping

- **WHEN** legacy files cannot be unambiguously classified as one or more reusable packages
- **THEN** migration preserves them outside the new Asset catalog and requires explicit user classification rather than inventing membership
