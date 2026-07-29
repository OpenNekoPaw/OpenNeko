## ADDED Requirements

### Requirement: Chat and Main presentation are orthogonal

Desktop SHALL persist Chat/Main display mode and Chat position independently from Main View Groups
and Timeline presentation. Agent conversations and tabs MUST remain owned by Agent and MUST NOT be
encoded as Main creative Views.

#### Scenario: User chooses a Chat and Main layout

- **WHEN** the user selects Chat + Main with Chat on the left or right
- **THEN** Desktop SHALL update only the display presentation
- **AND** existing Main Tabs, Group membership, split orientation and Timeline owner SHALL remain
  attached

#### Scenario: User opens a resource while Chat and Main are visible

- **GIVEN** Chat + Main is selected
- **WHEN** Canvas, Cut or Preview opens or focuses a resource
- **THEN** Desktop SHALL keep Chat + Main and the selected Chat position
- **AND** the resource operation SHALL modify only the owning Main/Timeline presentation

### Requirement: Main creative Views use bounded Tab Groups

Desktop SHALL expose Canvas, Cut and Preview Views as tabs in one or two Window-owned Main Groups.
Each attached View MUST belong to exactly one Group, each non-empty Group MUST have one active View,
and Desktop MUST NOT create more than two Groups.

#### Scenario: User opens multiple creative documents

- **WHEN** the user opens different Canvas, Cut or pinned Preview documents normally
- **THEN** Desktop SHALL add or focus tabs in the active Main Group
- **AND** opening the same document again SHALL focus its existing Group and View identity
- **AND** no duplicate domain session SHALL be created

#### Scenario: User closes a Main Tab

- **WHEN** the user closes a Canvas, Cut or Preview Tab
- **THEN** Desktop SHALL detach that View without deleting its project document
- **AND** the owning runtime SHALL release the detached session through Workbench reconciliation
- **AND** closing the last Tab in the second Group SHALL collapse the layout to one Group

#### Scenario: User reorders Main Tabs

- **WHEN** the user drags one Tab before another Tab in the same Group
- **THEN** Desktop SHALL persist the new Window presentation order
- **AND** document facts and runtime identity SHALL remain unchanged

### Requirement: Main Groups support controlled rows and columns

Desktop SHALL support one bounded Main split with `columns` for left/right groups or `rows` for
upper/lower groups. The split ratio SHALL be resizable and persisted as Window presentation.

#### Scenario: User opens or moves a View to the side

- **WHEN** the user explicitly splits a Tab right or down
- **THEN** Desktop SHALL create or reuse the second Main Group with the requested axis
- **AND** the moved or opened View SHALL become active in the target Group
- **AND** the original View owner SHALL not be recreated

#### Scenario: User resizes a Main split

- **WHEN** the user drags the divider between two Main Groups
- **THEN** Desktop SHALL persist a bounded split ratio
- **AND** neither Group SHALL be resized below the supported minimum Main viewport

### Requirement: Main display configuration is owned by Tab surfaces

The Desktop display menu SHALL contain only Chat + Main, Chat position, Chat only and Main only.
Canvas, Timeline, Model and composite Main configuration MUST NOT remain in that menu.

#### Scenario: User opens the display menu

- **WHEN** the Workbench display menu is shown
- **THEN** it SHALL render only Chat/Main presentation choices
- **AND** Main document selection, closing, ordering and split actions SHALL be exposed by Main
  Group Tab surfaces

### Requirement: Timeline binds an owning Cut View

Desktop SHALL persist Timeline presentation with an explicit attached Cut View identity. Timeline
MUST NOT infer its owner from the current active Main View or use a stale active selection fallback.

#### Scenario: Canvas and Timeline are opened together

- **GIVEN** an attached Canvas View and Cut View
- **WHEN** Desktop presents Canvas with the Cut Timeline
- **THEN** Canvas SHALL remain in the upper Main region
- **AND** the owning Cut Timeline SHALL open below it by default
- **AND** one Cut runtime SHALL provide the Timeline without rendering a duplicate Cut Root

#### Scenario: Timeline owner is missing

- **WHEN** a Workbench mutation references a missing, non-Cut or stale Timeline owner View
- **THEN** the mutation SHALL fail visibly
- **AND** Desktop SHALL NOT bind Timeline to the current active View

### Requirement: Prelaunch Workbench state migrates to the grouped contract

Desktop SHALL read persisted Workbench v1 presentation through one deterministic migration to v2 and
SHALL write only v2 after migration. The migration MUST preserve valid attached non-Agent Views and
MUST NOT create a dual-read or dual-write runtime path.

#### Scenario: Existing split Workbench starts after upgrade

- **WHEN** Desktop reads a valid v1 Workbench with active and side creative Views
- **THEN** it SHALL place the Views into deterministic primary and secondary Groups
- **AND** it SHALL translate the split to columns or rows and preserve valid View identities
- **AND** subsequent persistence SHALL contain only Workbench v2

#### Scenario: Existing Workbench contains a dangling identity

- **WHEN** v1 state references a missing active or side View
- **THEN** migration SHALL fail visibly or rebuild only the explicitly transient presentation
- **AND** it SHALL NOT return a successful empty layout that hides the invalid state
