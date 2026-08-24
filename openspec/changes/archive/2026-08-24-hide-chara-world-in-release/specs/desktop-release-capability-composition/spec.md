## ADDED Requirements

### Requirement: Home exposes distribution-qualified management surfaces

Desktop Home MUST expose Start Creating, Projects, Works, Asset Library and Extensions through one collapsible primary sidebar.
Development MAY additionally expose Character and World management for explicit product development. Release MUST NOT expose
Character or World management entries or empty recent sections. Each visible entry MUST select a real Host-owned Scene and
MUST NOT render a no-op or unavailable placeholder as a successful page.

Stable destinations MUST remain ungrouped primary actions. Development Character and World entries MUST appear under one
explicit experimental presentation group. Conversation history MUST use one Conversation section containing exact
owner-qualified Project, Assistant and, when Development has real records, Character/Room groups; it MUST NOT create empty
Character or World history sections or a shared durable history owner.

#### Scenario: Release user views Home navigation

- **GIVEN** Desktop runs in Release composition
- **WHEN** Home and recent navigation render
- **THEN** Start Creating, Projects, Works, Asset Library and Extensions SHALL remain available
- **AND** Character and World top-level entries and recent sections SHALL be absent
- **AND** hidden durable domain records SHALL NOT be deleted

#### Scenario: Development user views grouped experimental navigation

- **GIVEN** Desktop runs in Development composition
- **WHEN** Primary Sidebar renders stable destinations, experimental capabilities and history
- **THEN** Start Creating, Projects, Works, Asset Library and Extensions SHALL remain direct primary actions
- **AND** Character and World SHALL appear under one experimental presentation group
- **AND** Project, Assistant and existing Character/Room history SHALL appear under one Conversation section with exact owner identity
- **AND** no empty World history section SHALL be rendered

### Requirement: Desktop composes experimental creative capabilities by distribution mode

Desktop MUST use one Main-owned distribution fact to compose Character and World capabilities. Development MUST retain their
canonical product paths. Release MUST omit their user and Agent executable entries without deleting domain code or user data.

#### Scenario: Development composes Character and World

- **GIVEN** Desktop runs as an unbundled Development application
- **WHEN** Main composes Host, Renderer and DSH runtime inputs
- **THEN** Character and World capability projections SHALL be ready
- **AND** their existing navigation, Project, Agent Entry, builtin Skill and DSH Tool paths SHALL remain available
- **AND** all operations SHALL use the same owning package and canonical handler used before this change

#### Scenario: Release hides Character and World entries

- **GIVEN** Desktop runs as a packaged Release application
- **WHEN** the user views Primary Sidebar, Agent Entry, Project Workspace, Resource Browser or Extensions
- **THEN** Character and World capability entries SHALL NOT be rendered as available operations
- **AND** Assistant, Project, Asset and Extension sibling entries SHALL remain available
- **AND** Renderer SHALL derive this only from Host capability projection

#### Scenario: Release rejects a direct hidden Scene transition

- **GIVEN** Character and World capabilities are unavailable in Release
- **WHEN** a typed caller submits a Character/World management, detail, authoring, runtime or conversation restore intent
- **THEN** Host SHALL return `desktop-scene-owner-unavailable` for the exact owner
- **AND** no Workspace resolution, authoring/runtime creation or Scene mutation SHALL occur
- **AND** sibling capabilities and the current Scene SHALL remain available

#### Scenario: Release restores a hidden presentation

- **GIVEN** durable Window state contains a Character or World presentation from Development
- **WHEN** Release claims that Window
- **THEN** Host SHALL reset only the Window presentation to a fresh Agent Entry
- **AND** it SHALL emit a local `desktop-presentation-reset` diagnostic
- **AND** Character, World, Project, Conversation, transcript and protected task records SHALL remain unchanged

#### Scenario: Release executable Agent catalog excludes hidden capabilities

- **GIVEN** Desktop materializes a Release DSH profile and builtin Skill resource root
- **WHEN** DSH loads Tool bundles and discovers bundled Skills
- **THEN** `@neko/chara-dsh-plugin`, `@neko/world-dsh-plugin`, `character-creator` and `world-creator` SHALL be absent
- **AND** no empty, fallback or same-name contribution SHALL replace them
- **AND** Development source packages SHALL remain intact

#### Scenario: Existing Project records remain read-only in Release

- **GIVEN** a Project contains Character or World records or exact global references
- **WHEN** the Project Workspace is viewed in Release
- **THEN** the records MAY remain visible as project facts
- **AND** create, add, copy, update, synchronize and open capability controls SHALL be absent
- **AND** viewing the Project SHALL NOT mutate or delete those records
