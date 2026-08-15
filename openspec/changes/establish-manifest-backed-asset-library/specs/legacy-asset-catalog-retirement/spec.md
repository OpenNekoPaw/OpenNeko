## MODIFIED Requirements

### Requirement: Retired Asset data is outside product runtime

Product startup, ordinary readers, package public entries and Asset Library discovery MUST NOT inspect,
classify, migrate or repair `library.json`, flat path-derived Asset records or other retired catalog data.
Existing bytes remain untouched. A manifest-backed Asset Library receives an item only through a new,
explicit user import/install intent that validates a reusable local package with stable identity,
owned or declared members, and user-confirmed package facts. Ordinary workspace and linked media remain
locator-addressed without replacement Asset IDs.

#### Scenario: Retired catalog points to ordinary media files

- **WHEN** retired records point to ordinary workspace or linked files
- **THEN** product runtime leaves those records untouched and continues using canonical locators from current owners
- **AND** it allocates no replacement Asset IDs

#### Scenario: User imports an explicitly reusable package

- **WHEN** the user explicitly selects owned content and confirms the required package facts
- **THEN** the canonical import workflow may install a validated manifest-backed Asset
- **AND** it does not read or modify retired catalog data

#### Scenario: Encounter ambiguous legacy grouping

- **WHEN** legacy files cannot be unambiguously classified as one or more reusable packages
- **THEN** product runtime leaves them outside the new Asset catalog and requires an explicit new import choice rather than inventing membership
