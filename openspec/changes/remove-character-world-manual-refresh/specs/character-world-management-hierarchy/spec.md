## MODIFIED Requirements

### Requirement: Domain collection controls remain compact and responsive

Character and World collection headers SHALL group a bounded search field with the existing sort control. They SHALL NOT expose a manual refresh action in the ordinary catalog state. The controls SHALL wrap without clipping when the package-owned container becomes narrow.

#### Scenario: Catalog width decreases

- **WHEN** the collection header cannot contain its title and controls on one row
- **THEN** the controls wrap below the title
- **AND** search occupies the available row while sort remains reachable
- **AND** no manual refresh control is rendered

### Requirement: Presentation refinement preserves canonical operations

The hierarchy SHALL preserve Character and World import, search, sorting, selection, detail, version, authoring and runtime behavior. Removing the ordinary manual refresh action SHALL NOT remove initial catalog loading, query-driven reload or explicit retry after a visible load failure.

#### Scenario: User changes a catalog query

- **WHEN** the user searches or sorts Character or World records
- **THEN** the existing package-owned producer reloads the exact catalog query
- **AND** no alternate reader or cached success path is used

#### Scenario: Catalog loading fails

- **WHEN** Character or World catalog loading returns a visible failure
- **THEN** the failure diagnostic and explicit retry action remain reachable
- **AND** retry invokes the same package-owned runtime instead of a fallback source
