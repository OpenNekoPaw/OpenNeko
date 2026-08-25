# desktop-works-template-navigation Specification

## Purpose
Define the package-owned Works and Project template navigation hierarchy without creating alternate catalog authority.
## Requirements
### Requirement: Stable primary navigation exposes five canonical destinations

Desktop SHALL expose Start Creating, Projects, Works, Asset Library, and Extensions as ungrouped stable primary navigation destinations in that order. Chinese copy SHALL use “开始创作、项目、作品、资产库、扩展”. Character and World SHALL remain inside a Development-only Experiments group.

#### Scenario: Development navigation renders

- **WHEN** Desktop runs with Development creative capabilities
- **THEN** the five stable destinations appear in canonical order
- **AND** Character and World appear only inside the Experiments group

#### Scenario: Release navigation renders

- **WHEN** Desktop runs without Development creative capabilities
- **THEN** all five stable destinations remain available
- **AND** the Experiments group, Character and World are absent

### Requirement: Works uses a canonical management Scene without a Templates sibling Scene

Works SHALL be an exact `creative-management` Scene catalog owned by the Host Window navigation contract. The contract SHALL NOT expose a `templates` catalog after templates merge into Project management. Renderer SHALL NOT retain a private Templates active-page owner or management Session.

#### Scenario: User opens Works

- **WHEN** the user activates Works
- **THEN** Renderer emits `open-creative-management` with the exact `works` catalog
- **AND** Host projects one matching context and Main Surface

#### Scenario: Removed Templates Scene input is decoded

- **WHEN** an input requests `open-creative-management` with a `templates` catalog
- **THEN** the canonical Host codec rejects that input
- **AND** no alternate Templates Scene or Renderer-private page succeeds

### Requirement: Works remains truthful before a publication catalog exists

Until a global Works publication owner is defined, the Works page SHALL show a localized empty catalog state. It MUST NOT reinterpret Projects, Workspace files, open Views, Assets, conversations, or caches as Works.

#### Scenario: No Works authority is available

- **WHEN** the Works management Scene renders in the current product boundary
- **THEN** it displays the Works title and empty-state explanation
- **AND** it performs no Workspace scan, Project aliasing, Asset fallback, or durable mutation

### Requirement: Project management reuses Project quick-start content

Project management SHALL display the existing Storyboard and Video Plan localized quick-start titles and descriptions after the Project catalog. It SHALL NOT display Character Kit as a Project template. Activating a Project template SHALL return to the canonical Start Creating Scene without creating a Project, starting a turn, creating a Conversation, or silently injecting prompt content.

#### Scenario: User selects a template card

- **WHEN** the user activates one of the two Project template cards
- **THEN** Desktop transitions through `open-agent-entry`
- **AND** no Agent turn or alternate composer state is created by the Templates page

### Requirement: Works and Project templates use the centered management layout

Works and Project management SHALL use the centered management content width and spacing. Project templates SHALL use a responsive grid of bounded-width visual cards with a preview region, title, description and one Start Creating action. The cards SHALL retain their own visual presentation rather than copying Extension capability rows. Before a Works publication catalog exists, Works SHALL present a domain Hero and a separate My Works section whose lightweight empty state stays near the content start rather than floating in the full viewport or displaying a full-width framed placeholder, sample or aliased records.

#### Scenario: User views Project management

- **WHEN** Project management contains the two built-in Project templates
- **THEN** both appear after the Project catalog as equal-structure, bounded-width visual cards
- **AND** Character Kit and an independent Templates page are absent
- **AND** no list view, view switch or masonry column owner exists

#### Scenario: User views an empty Works catalog

- **WHEN** no authoritative Works records exist
- **THEN** the page displays its localized Hero and a My Works section containing a lightweight empty state without a full-width frame
- **AND** it does not display sample cards, Project aliases or a list-view control
- **AND** it does not expose create, import, search or mode controls before their canonical owners exist

#### Scenario: Works Hero uses the management illustration language

- **WHEN** the Works management Scene is visible at a wide supported viewport
- **THEN** its decorative illustration uses the same primary card, overlap card, connector and tile geometry as Project, Character and World management
- **AND** its icons remain specific to Works
- **AND** the illustration is hidden at the established narrow responsive breakpoint

### Requirement: Real catalog modes use the Extension switching pattern

Works and Project management SHALL omit a mode switch while only one presentation mode exists. If a future independently specified change adds multiple real domain modes, its switch SHALL follow the centered segmented-tab interaction and placement used by Extension management rather than introducing a page-specific switching pattern.

#### Scenario: Current single-mode catalog opens

- **WHEN** the user opens Works or Project management in the current product
- **THEN** no mode-switch control is rendered
