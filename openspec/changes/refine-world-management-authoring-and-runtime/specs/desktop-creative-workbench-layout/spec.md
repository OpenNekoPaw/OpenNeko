## ADDED Requirements

### Requirement: World Management uses controlled catalog and detail slots

Desktop SHALL compose World Management through the controlled Workbench with the World-owned card catalog in Main and the exact World-owned management detail in Secondary Main. Desktop MAY retain exact selection and bounded layout presentation state, but MUST NOT interpret World facts, expose a generic Foundation command, mount the complete Studio or Runtime Root inside detail, or retain a previously selected detail Root after the World destination is left.

#### Scenario: User selects a World card

- **WHEN** the World-owned catalog reports one exact selected WorldProject
- **THEN** Desktop keeps the catalog in Main and mounts only that record's World management detail in Secondary Main
- **AND** no authoring View, runtime scene, WorldRun or cross-domain manager is inferred

#### Scenario: User leaves World Management

- **WHEN** the user opens another application-sidebar destination
- **THEN** Desktop unmounts both World Management Roots and mounts the destination's exact scene composition
- **AND** durable World records and protected background runtime remain unchanged

### Requirement: Secondary World authoring preserves Primary Main identity

An authorized Workspace SHALL keep Primary Main visible as either its exact current Board/View or the canonical fresh empty presentation. Opening an exact WorldProject authoring target SHALL mount the World-owned authoring Surface in Secondary Main without creating, replacing, activating or deleting a Primary Main View. Closing or switching the World authoring target SHALL remove or replace only the Secondary Main Surface and MUST NOT infer a Board, reset the Workspace or restore a hidden Root.

#### Scenario: Existing Board remains visible

- **WHEN** Primary Main displays one exact Board and an exact WorldProject opens for authoring
- **THEN** the same Board identity remains in Primary Main while World Studio renders in Secondary Main
- **AND** Desktop does not change Board document facts, active View identity or Workspace authority

#### Scenario: Fresh Workspace remains empty

- **WHEN** a Workspace has zero Primary Main Views and an exact WorldProject opens for authoring
- **THEN** Primary Main continues to render the canonical empty presentation and Secondary Main renders World Studio
- **AND** no Board, placeholder View or durable Workspace record is fabricated

#### Scenario: World authoring closes

- **WHEN** the user closes the Secondary Main World authoring View
- **THEN** the prior Primary Main Board/empty presentation remains visible and unchanged
- **AND** Desktop releases the World authoring Root instead of retaining it as hidden visit history

### Requirement: Formal World runtime is not a Workspace authoring View

Desktop SHALL model formal World Runtime as a separate owner-qualified scene composition bound to exact WorldRun, WorldSave and branch identities. It MUST NOT register Runtime as a World authoring View, replace Workspace Primary Main facts, attach runtime ownership to the active Workspace, or render the Runtime Root inside World Management detail. Navigation back to a Workspace SHALL reconstruct that Workspace only from its authority and allowed presentation snapshot.

#### Scenario: User starts a Run from authoring

- **WHEN** the World owner returns a successful exact runtime launch result
- **THEN** Desktop transitions to the bound World Runtime scene and unmounts the visible authoring composition
- **AND** the source Workspace Board/empty state and WorldProject remain durable under their existing owners

#### Scenario: User returns to the source Workspace

- **WHEN** the user leaves World Runtime and reopens the exact Workspace
- **THEN** Desktop reconstructs its Primary Main and optional authoring Secondary Main from owning authority and presentation snapshot
- **AND** the Workspace does not inherit Runtime selection, event timeline, branch or Save state

### Requirement: World surfaces remain usable in bounded layouts

Desktop and `@neko/world-webview` SHALL define deterministic minimums and one owning scroll surface for World Management detail, Secondary Main authoring and Runtime panels. When the Window is too narrow for requested side-by-side slots, Desktop SHALL preserve a usable Primary/Main surface and apply the existing controlled compact presentation rather than infinitely shrinking, clipping top/bottom content, introducing nested full-height card scrollers or moving a package Root outside its declared slot.

#### Scenario: World Management opens in a narrow Window

- **WHEN** Main plus Secondary Main cannot satisfy their declared minimum widths
- **THEN** Desktop applies the controlled compact/overlay presentation while keeping catalog selection and detail identity intact
- **AND** the detail header, actions and final content remain reachable through one deterministic scroll owner

#### Scenario: World authoring opens beside an empty Primary Main

- **WHEN** a narrow Workspace opens World authoring in Secondary Main
- **THEN** the canonical empty Primary Main remains a valid visible presentation and authoring remains reachable through the supported compact layout
- **AND** Desktop does not solve the width constraint by deleting or replacing Primary Main state
<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-14):** Standalone World Studio entry and management quick-generation transition are superseded. Exact Project authoring receipts, World-owned Roots, controlled slots, and no hidden Root remain applicable.
