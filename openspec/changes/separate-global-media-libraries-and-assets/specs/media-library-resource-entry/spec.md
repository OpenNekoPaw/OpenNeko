## MODIFIED Requirements

### Requirement: Media Library is the single file-resource entry

The product SHALL expose Media Library as the user-visible entry for browsing, searching, opening, and diagnosing connected file resources. File discovery MUST NOT require an AssetEntity or Asset Library membership record. A separate Asset Library MAY manage OpenNeko-owned creative materials, distribution, and sharing, but MUST NOT become a fallback path resolver for Media Library files.

#### Scenario: Browse a linked media file

- **WHEN** a user browses a valid file below a connected Media Library root
- **THEN** Media Library returns an entry keyed by the exact library-relative locator without requiring an AssetEntity or catalog record

#### Scenario: Open a non-cataloged workspace file

- **WHEN** an authorized workflow selects a supported workspace file that has never been added to the Asset Library
- **THEN** the file can be read, previewed, or referenced directly through the normal content locator path

#### Scenario: Connect files without creating assets

- **WHEN** a user connects an external directory as a Media Library
- **THEN** Media Library exposes its directory tree and no Asset Library membership is created
