## MODIFIED Requirements

### Requirement: Media Library is the single file-resource entry

The product SHALL expose Media Library as the single direct user-visible entry for browsing, searching,
opening, and diagnosing arbitrary accessible file resources. Ordinary workspace and linked files MUST NOT
require Asset membership, an Asset ID, or a catalog record. The product MAY expose a separate Asset Library
only for reusable packages explicitly imported or installed from local sources through a manifest-backed Asset
lifecycle; Asset Library MUST NOT become a prerequisite, fallback resolver, or discovery catalog for
ordinary files.

#### Scenario: Browse a linked media file

- **WHEN** a user browses a valid file below `neko/assets/<libraryName>/`
- **THEN** Media Library returns an entry keyed by the exact workspace-relative locator without requiring an Asset or catalog record

#### Scenario: Open a non-cataloged workspace file

- **WHEN** an authorized workflow selects a supported workspace file that has never been imported
- **THEN** the file can be read, previewed, or referenced directly through the normal content locator path

#### Scenario: Browse an explicitly managed Asset

- **WHEN** the user opens Asset Library for a package explicitly imported or installed as an Asset
- **THEN** the package is managed by its manifest identity without changing how ordinary files are resolved
