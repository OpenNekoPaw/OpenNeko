## ADDED Requirements

### Requirement: Settings opens as a Window overlay without replacing the current Scene

Desktop Settings SHALL open as a modal Window overlay owned by Renderer presentation and SHALL NOT transition, replace or unmount the current Host-owned Scene.

#### Scenario: User opens and closes Settings from a working Scene

- **WHEN** the user opens Settings while a creative, management or Agent Scene is active
- **THEN** a focused dialog and backdrop appear above that exact Scene
- **AND** closing with the close button, Escape or backdrop returns to the unchanged Scene identity and presentation

### Requirement: Settings has one canonical overlay presentation path

Settings navigation SHALL NOT be represented by a Desktop Scene context, Workbench surface ref or Scene transition intent.

#### Scenario: User opens Settings from the application sidebar

- **WHEN** the Settings button is activated
- **THEN** Renderer opens the Settings overlay without sending a Scene transition
- **AND** no alternative Settings Scene Root is mounted or retained

### Requirement: Settings overlay omits an extra visual header

The overlay SHALL retain an accessible Dialog title and description without rendering a separate visible Settings header band. Visible content SHALL begin with Settings navigation and only the current section content, while the close action remains available at the overlay's top-right edge.

#### Scenario: User changes Settings section

- **WHEN** the user selects another Settings category
- **THEN** only overlay-local presentation changes
- **AND** no preference, application runtime, background Scene or user data is mutated

#### Scenario: User opens Settings

- **WHEN** the Settings overlay becomes visible
- **THEN** no additional “Settings” title or product description occupies a visual header row
- **AND** assistive technology still receives the Dialog name and description
- **AND** the navigation and current section consume the full usable overlay height

### Requirement: Settings rows remain readable and operable

Setting labels, descriptions, selects, buttons, authority notes and diagnostics SHALL provide stable readable typography, spacing and keyboard-visible control states across supported themes.

#### Scenario: Settings update fails

- **WHEN** the canonical settings update rejects the current request
- **THEN** a local visible diagnostic is rendered in the overlay
- **AND** sibling settings and the unchanged background Scene remain available

### Requirement: Settings overlay adapts without horizontal overflow

The overlay SHALL use a bounded Desktop size and adapt its internal navigation and rows to the available overlay width without clipping labels or controls.

#### Scenario: Settings opens in a wide Desktop Window

- **WHEN** the shared Dialog default would otherwise constrain Settings to a compact confirmation-dialog width
- **THEN** the Settings-specific overlay presents a bounded landscape two-column workspace
- **AND** the navigation, content controls and close action remain readable without depending on outer-page scrolling

#### Scenario: Settings overlay becomes narrow

- **WHEN** the overlay cannot support navigation and content side by side
- **THEN** its layout and setting rows stack within the same Dialog
- **AND** every control remains reachable without horizontal scrolling

### Requirement: Settings overlay fills the available Window safely

The overlay SHALL derive its width and height from the current Desktop Window instead of using a fixed dialog canvas. It SHALL retain a visible, responsive safety margin around every edge and SHALL apply a desktop-scale maximum width and height only when the Window is larger than the useful Settings workspace.

#### Scenario: Settings opens in a representative Desktop Window

- **WHEN** the Window has more space than the compact shared Dialog
- **THEN** the overlay expands in both axes to the Window safety margins
- **AND** the header, navigation and content composition fill that bounded overlay without unused outer vertical bands

#### Scenario: Settings opens in a very large Desktop Window

- **WHEN** the available Window exceeds the useful Settings workspace
- **THEN** the overlay stops growing at its desktop-scale maximum size
- **AND** remains centered with visible backdrop around every edge

#### Scenario: Settings opens at the supported minimum Window size

- **WHEN** the Window approaches the Desktop minimum width or height
- **THEN** the responsive safety margin contracts without disappearing
- **AND** navigation and content keep independent scrolling so every setting remains reachable

### Requirement: Settings overlay keeps compact navigation and content density

The overlay SHALL keep the search field, category navigation and current settings group aligned to the start of their respective columns. Reused catalog controls SHALL NOT inherit flex growth that stretches a search field along the Settings navigation axis, and settings groups SHALL use the same quiet border hierarchy as other Desktop management surfaces without an oversized floating-card shadow.

#### Scenario: Settings opens at a tall window size

- **WHEN** the Settings overlay has more vertical space than its navigation or current section requires
- **THEN** the search field keeps its compact control height and the category navigation remains directly below it
- **AND** the current settings group uses the available content width with a quiet bordered surface and compact rows

### Requirement: Agent Provider management uses two direct model-family directories

Agent model settings SHALL present dialogue Providers and generation Providers as two direct sibling directories. Each directory SHALL own its add action and SHALL NOT be wrapped by a generic Provider panel or accompanied by a pending/unconfigured Provider directory.

Provider directories, the expanded Provider editor and model cards SHALL use raised surfaces with quiet borders instead of broad control-gray fills. Muted or tinted fills SHALL remain limited to compact status, selection and interaction feedback so that form hierarchy does not depend on stacked gray panels.

#### Scenario: User opens Agent model settings

- **WHEN** the Host projection contains dialogue and generation Providers
- **THEN** the Agent section shows exactly the dialogue and generation Provider directories
- **AND** each directory heading includes its own add action and count
- **AND** no outer Provider heading, shared add action, mixed directory or unconfigured directory is rendered

#### Scenario: User adds a Provider from one directory

- **WHEN** the user activates the add action in the dialogue or generation directory
- **THEN** the Provider editor is initialized with that exact model family
- **AND** saving persists the family through the canonical Provider settings contract
- **AND** the refreshed projection keeps the Provider in the selected directory without Renderer-owned classification state

#### Scenario: User expands Provider configuration

- **WHEN** a Provider directory and its configuration editor are visible together
- **THEN** the directory, editor and model cards remain distinguishable through quiet borders and spacing
- **AND** large neutral-gray background blocks are not used to create hierarchy
- **AND** compact credential, default-model and destructive-confirmation states remain visually identifiable

### Requirement: Provider deletion is explicit and authority-owned

Every config-backed Provider SHALL expose a deletion action, while Host settings authority SHALL reject Providers that still own configured models. TOML metadata SHALL NOT hide the action or make a configured Provider undeletable. Credential removal SHALL remain owned by the existing credential authority.

The deletion action SHALL remain a compact card action instead of reserving a full-height segmented column. Entering the destructive confirmation state SHALL keep an explicit cancel action adjacent to confirmation without replacing the Provider's primary open/edit target.

#### Scenario: User deletes an empty configured Provider

- **WHEN** the user confirms deletion for a config-backed Provider with no configured models
- **THEN** the Host removes the exact Provider and its credential through the canonical operation
- **AND** both Provider directories refresh from the returned projection

#### Scenario: User cancels Provider deletion

- **WHEN** the user activates the compact delete action and then cancels the confirmation
- **THEN** no delete operation is sent
- **AND** the Provider card returns to its normal compact action state
- **AND** the Provider card remains available as the primary open/edit target

#### Scenario: Provider cannot be deleted safely

- **WHEN** the Provider still owns models or credential cleanup fails
- **THEN** deletion fails visibly in the Agent section
- **AND** unrelated Providers, models and Settings sections remain available
- **AND** no Renderer-side cascade or silent credential residue is reported as success
