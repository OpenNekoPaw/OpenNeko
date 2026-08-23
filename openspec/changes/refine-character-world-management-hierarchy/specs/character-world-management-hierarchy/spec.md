## ADDED Requirements

### Requirement: Character and World catalogs use a creation-oriented hierarchy

Character Management and World Management SHALL each present a domain introduction followed by a named user collection whose compact controls filter and order only that domain's catalog. Each catalog SHALL retain its package-owned Root, projection and operations.

#### Scenario: User opens Character Management

- **WHEN** the Development Character scene is visible
- **THEN** the page presents the Character introduction and My Characters collection in that order
- **AND** the existing Character package import remains the primary real operation

#### Scenario: User opens World Management

- **WHEN** the Development World scene is visible
- **THEN** the page presents the World introduction and My Worlds collection in that order
- **AND** the existing World package import remains the primary real operation

### Requirement: Domain collection controls remain compact and responsive

Character and World collection headers SHALL group a bounded search field with existing sort and refresh controls. The controls SHALL wrap without clipping when the package-owned container becomes narrow.

#### Scenario: Catalog width decreases

- **WHEN** the collection header cannot contain its title and controls on one row
- **THEN** the controls wrap below the title
- **AND** search occupies the available row while sort and refresh remain reachable

### Requirement: Character and World cards preserve domain density

Character cards SHALL retain identity-oriented content and World cards SHALL retain summary and runtime metadata. Sparse rows SHALL remain start-aligned and cards SHALL wrap before becoming unreadably narrow.

#### Scenario: User compares populated catalogs

- **WHEN** Character and World catalogs contain valid records
- **THEN** Character cards expose identity, summary and version count
- **AND** World cards expose title, summary, version count and runtime count
- **AND** selection and local diagnostics remain visible

### Requirement: Templates remain domain-owned and executable

Project, Character and World templates SHALL be treated as separate domain presets. Character Management SHALL expose a Character Kit built-in quick start and World Management SHALL expose a World Bible built-in quick start after the corresponding user collection. Each owning Webview package SHALL define its template presentation identity and MUST require an executable callback from its Desktop consumer.

#### Scenario: User starts from a Character template

- **WHEN** the user activates the `character-kit` template card
- **THEN** Character Management calls its required start-from-template callback
- **AND** Desktop enters the canonical Start Creating scene without creating a Character record or silently injecting prompt content

#### Scenario: User starts from a World template

- **WHEN** the user activates the `world-bible` template card
- **THEN** World Management calls its required start-from-template callback
- **AND** Desktop enters the canonical Start Creating scene without creating a World record or silently injecting prompt content

#### Scenario: User distinguishes template domains

- **WHEN** the Character and World management pages are compared
- **THEN** each page presents only its own template identity, title, description and domain visual
- **AND** no cross-domain template registry, mixed template catalog or durable template record is created

### Requirement: Presentation refinement preserves canonical operations

The hierarchy change SHALL NOT add, remove, duplicate or reroute Character or World import, search, sorting, refresh, selection, detail, version, authoring or runtime behavior.

#### Scenario: User activates an existing operation

- **WHEN** the user imports, searches, sorts, refreshes or selects a Character or World
- **THEN** the existing package-owned producer and exact identity path is used unchanged
- **AND** only disposable Renderer presentation state changes locally
