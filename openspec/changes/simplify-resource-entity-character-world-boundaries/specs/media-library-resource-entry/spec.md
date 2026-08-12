## MODIFIED Requirements

### Requirement: Media Library is the single file-resource entry

The product SHALL expose one Resources presentation for browsing, searching, opening and diagnosing
accessible resources. Project Files, linked Media, installed Assets and Project Elements SHALL remain
owner-preserving sources or filters inside that experience. Media Library SHALL remain the direct entry
for linked ordinary files, while explicitly managed Asset packages retain Asset identity and lifecycle;
the presentation MUST NOT copy them into a common mutable catalog.

#### Scenario: Browse a linked media file

- **WHEN** a user browses a valid file below `neko/assets/<libraryName>/`
- **THEN** Resources returns an entry keyed by the exact workspace-relative locator without requiring an
Asset or Entity record

#### Scenario: Open a non-cataloged workspace file

- **WHEN** an authorized workflow selects a supported workspace file that has never been imported
- **THEN** the file can be read, previewed or referenced directly through the normal content locator path

#### Scenario: Switch resource sources

- **WHEN** a user filters Resources by Project Files, Shared Media, Installed Assets or Project Elements
- **THEN** the presentation queries the selected owner projection and retains exact owner identity,
  availability and supported actions without copying or converting the result

#### Scenario: Search linked Entity and Character results

- **WHEN** one query matches a ProjectEntity and its explicitly associated CharacterProject
- **THEN** the presentation MAY compose one Character card with owner-qualified project and interaction
  status while preserving both exact identities and mutation owners

### Requirement: Media entries are source-derived projections

Media Library tree, search, recent-use, technical metadata and availability entries SHALL be
source-derived projections keyed by canonical locator and content fingerprint without a schema generation
or migration marker. Ordinary discovery MAY create current entries from authorized filesystem state, but
it MUST NOT inspect, convert or automatically repair invalid persisted records. Discovery MUST NOT create
Project Entities, representation bindings, Asset IDs, CharacterProjects, WorldProjects or project
membership/association facts.

#### Scenario: Discover a new file

- **WHEN** a filesystem event or bounded reconciliation discovers a supported file
- **THEN** Media Library creates or refreshes the current file projection without writing a retired
  catalog or creating Asset, Entity, Character, binding or membership identity

#### Scenario: One projection entry is invalid

- **WHEN** a projection row fails the stable current entry contract
- **THEN** Media Library leaves that row unchanged, reports the exact entry diagnostic and continues
  serving valid sibling entries and workspaces without migration or automatic repair
