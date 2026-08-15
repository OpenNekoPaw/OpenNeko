## ADDED Requirements

### Requirement: Creative Workbench composes exact domain authoring targets

The controlled Desktop Workbench SHALL compose Content, Character, and World authoring through the existing owner-neutral slots using an exact Workspace authority, exact owner-qualified authoring target, and package-owned Surface references. Desktop MAY select the current visible composition and wire public ports, but it MUST NOT implement target discovery, domain mutation, publication, project-local placement, or tool policy.

#### Scenario: Project-local Character becomes the Main target

- **WHEN** the Host projects an authorized project-local CharacterProject target for the current Workspace and Main slot
- **THEN** Desktop mounts the exact Character Studio Root with the shared Agent and Resource slots permitted by that composition
- **AND** it does not wrap the Character Root in a Content editor, create a Desktop Character adapter with business state, or retain the previous Main Root

#### Scenario: Unsupported target is requested

- **WHEN** a scene projection references an unknown target kind, mismatched Workspace, missing owner identity, or unavailable package Root
- **THEN** the incompatible Surface is rejected with an owner-qualified diagnostic at that slot
- **AND** Desktop does not mount a generic editor, empty success Surface, first-compatible tool, or hidden fallback Root

### Requirement: Project authoring navigation retains references rather than Roots

A Project Workbench MAY display lightweight Content, project-local Character, project-local World, and external dependency rows or local tabs. Those presentation elements SHALL retain only exact navigation/reference identities and bounded package-owned presentation state. Activating a row SHALL replace the current domain Root in its slot unless the user explicitly requests a supported visible split, and closing a row MUST NOT delete its durable target or runtime.

#### Scenario: User alternates among project authoring targets

- **WHEN** the user moves from Content to Character to World authoring inside one Project Workspace
- **THEN** the Project navigation preserves exact rows while Main mounts only the currently selected owner Root
- **AND** no hidden Content, Character, or World React tree, subscription, provider, GPU resource, or runtime is retained as visit history

#### Scenario: User closes a local target tab

- **WHEN** the user closes a lightweight Character or World authoring tab
- **THEN** only that presentation reference and allowed snapshot are removed
- **AND** the CharacterProject, WorldProject, publications, Conversations, Runs, Saves, and project membership remain unchanged

#### Scenario: User closes a Text Editor tab after its file was deleted

- **GIVEN** a clean Text Editor session was released while its exact Workbench View remained visible and the underlying Workspace file was subsequently deleted
- **WHEN** the user closes that View
- **THEN** the Text Editor owner validates and removes only the exact presentation reference without reopening or reading the deleted file
- **AND** dirty sessions still require an explicit save, discard, or cancel decision before their View can close

#### Scenario: Fresh Workspace has no Main View

- **WHEN** an authorized Workspace opens before any Content, Canvas, Character, or World View exists
- **THEN** the Primary Main region remains available and visible by default with the canonical empty presentation
- **AND** Desktop does not fabricate a View, Board, authoring target, active identity, or durable record to represent that fresh state

#### Scenario: Secondary authoring preserves the empty Primary Main

- **GIVEN** an authorized Workspace has no Primary Main View
- **WHEN** an exact Character or World authoring target opens in Secondary Main
- **THEN** the Primary Main continues to show the canonical empty presentation while Secondary Main mounts the owner Root
- **AND** closing the authoring target restores the same empty Primary Main without inferring or creating a Board

### Requirement: Domain tools remain package-owned within shared slots

Character, World, Content/Text, Canvas, Cut, Assets, Generation, Preview, Voice, and Avatar packages SHALL provide their own editor, inspector, resource, preview, and timeline surfaces through public entries. Desktop Workbench SHALL compose only the surfaces required by the exact target and MUST NOT create a dynamic all-domain tool registry, duplicate a package tool, or expose unavailable tools as successful controls.

#### Scenario: Character authoring selects its tools

- **WHEN** a CharacterProject target is visible
- **THEN** the Chara composition may expose definition, lore, storyline, representation, voice, publication, and authoring-test surfaces through declared slots
- **AND** Content Cut and World Gameplay controls are absent unless an explicit owning integration supplies a valid Surface reference

#### Scenario: World authoring uses a Content artifact

- **WHEN** World Studio consumes a screenplay, Canvas graph, Cut timeline, or Asset as authoring evidence
- **THEN** the owning creative package retains artifact and UI ownership while World accepts only typed candidates or stable references through its application service
- **AND** Desktop does not copy the artifact into World facts or make the tool presentation authoritative

### Requirement: Project and installed-library surfaces use controlled Workbench geometry

Project management, installed Character/World library management, and Project-bound Content, Character, and World authoring SHALL use the controlled Workbench shell and closed slot contract. Management SHALL compose an owner catalog/list surface in Main and an exact owner detail surface in Secondary Main when a detail exists. Authoring SHALL compose the exact domain editor in a declared Project Workspace slot plus only the owner-declared Agent, resource, preview, inspector, timeline, or status components. A shared geometry MUST NOT merge catalog facts, editor state, commands, or runtime ownership.

#### Scenario: Installed World management selects a release

- **WHEN** the user selects one exact installed WorldVersion from the World-owned catalog
- **THEN** Secondary Main shows its immutable release detail and owner-qualified use, reference, adaptation, and removal actions
- **AND** the application sidebar, Window Shell, Project authoring Roots, and World runtime ownership remain unchanged

#### Scenario: Author switches Content, Character, and World targets

- **WHEN** an authorized Workspace alternates among exact Content, CharacterProject, and WorldProject authoring targets
- **THEN** the same Workbench slot geometry replaces the Main package Root and owner-provided auxiliary components
- **AND** no domain Root, toolbar, provider, or transient editor state is reused as another domain's authority
<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-14):** The successor owns removal of direct Character/World authoring destinations and standalone authoring Roots. Controlled slots, one visible Root per slot, exact receipts, and package ownership remain applicable.
