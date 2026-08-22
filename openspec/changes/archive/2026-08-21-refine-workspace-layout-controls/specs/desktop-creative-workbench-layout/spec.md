## ADDED Requirements

### Requirement: Workspace layout controls reflect central panel containment

Desktop Workspace SHALL present exactly three top-level layout controls matching the visible left, central and right structure. The left control SHALL manage Agent with a left-sidebar icon, the central control SHALL use a combined Main-plus-Cut layout icon and expose Main and Cut as explicit child presentation choices, and the right control SHALL manage Workspace Resource management with a right-sidebar icon. Main and Cut SHALL continue to use the canonical Host-owned layout projection and update path rather than a second Renderer state source. The version-free Host layout contract SHALL expose one canonical `empty-main` display mode only for a docked Cut Panel so Agent, Main and Cut can be controlled without hidden Renderer state.

#### Scenario: Workspace renders structural layout controls

- **WHEN** an exact Workspace Scene is active
- **THEN** the native-aligned title chrome renders top-level Agent, combined Main-plus-Cut and Resource management controls in left-to-right order
- **AND** it does not render Main and Cut as separate top-level controls
- **AND** Agent uses the left-sidebar icon while the combined control uses the Main-above-Cut layout icon
- **AND** non-Workspace scenes do not render the Workspace control group

#### Scenario: User opens the combined creative panel control

- **WHEN** the user activates the combined Main-plus-Cut control
- **THEN** Desktop opens one keyboard-accessible Popover containing explicit Main and Cut checkable choices
- **AND** each choice reports selected state only from its exact Scene slot and current Host-owned presentation
- **AND** unavailable Main or Cut disables only its corresponding choice
- **AND** Cut is disabled when it is the last visible business region
- **AND** the Popover does not create a new layout registry, command path or Renderer-owned state source

#### Scenario: User toggles Main or Cut from the combined control

- **WHEN** the user changes Main or Cut in the combined Popover
- **THEN** Main uses the existing Workbench display update and Cut uses the existing Cut Panel presentation update or exact draft-creation path
- **AND** the sibling presentation, exact Main/Cut View refs, Agent session, Resources and user documents remain unchanged
- **AND** no retired top-level Main or Cut handler participates

#### Scenario: Cut expands when Main is not visible

- **WHEN** Main presentation is hidden while an exact Workspace Cut Panel is docked
- **THEN** Desktop keeps Cut in its existing bottom-panel Portal and expands that same panel across the central Main and bottom tracks
- **AND** Agent, when selected, remains docked at its configured side instead of mounting into the central Main track
- **AND** when Agent is also hidden Host projects the one canonical `empty-main` display mode
- **AND** no empty creative-document presentation is rendered above Cut
- **AND** existing Main View refs remain retained but unmounted until Main is shown again
- **AND** Cut keeps its active View and owning runtime while its stored bottom-panel height is retained for restoration

#### Scenario: Main restoration returns Cut below without replacing its Root

- **WHEN** Cut is expanded because Main is hidden and the user shows Main again
- **THEN** Desktop restores the retained Main View into the central Main track
- **AND** the same Cut Portal and owning runtime return to the bottom track using the retained height
- **AND** no alternate Cut renderer, slot identity or persisted placement state participates

#### Scenario: Invalid empty Main state fails visibly

- **WHEN** a producer requests `empty-main` without an exact docked Cut Panel or attempts to hide the last visible Cut region
- **THEN** the Host codec or canonical layout helper rejects that request visibly
- **AND** it does not persist an unexplained blank Workbench, default to Agent, or mutate Main View, Cut View, Agent or Resource facts

#### Scenario: Closing the final Cut document restores Agent

- **WHEN** the user closes the final Cut document while the canonical display mode is `empty-main`
- **THEN** Host removes that Cut View and atomically changes the canonical display mode to `chat-only`
- **AND** Agent becomes the remaining visible business region without retaining an invalid empty layout
