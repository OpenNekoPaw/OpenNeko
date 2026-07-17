## ADDED Requirements

### Requirement: Workspace dependencies are closed

Every `workspace:*` dependency declared by a retained project MUST resolve to exactly one package, and the committed lockfile MUST match retained manifests.

#### Scenario: Clean frozen installation

- **WHEN** dependencies are installed from the repository root with the frozen lockfile enabled
- **THEN** pnpm completes without unresolved workspace packages or stale-lockfile diagnostics

### Requirement: Removed composition packages stay removed

The distribution SHALL NOT retain `@neko/workbench-core`, `@neko/market-core`, or a removed product merely to satisfy stale metadata. Retained feature Webviews SHALL expose their package-owned host adapters directly.

#### Scenario: Build retained Webviews without Workbench Core

- **WHEN** Canvas, Cut, Agent, and Preview Webviews build
- **THEN** no Workbench Core import, dependency, alias, stale adapter export, or quality owner is required

#### Scenario: Build Agent and TUI without Market

- **WHEN** Agent Platform and TUI build
- **THEN** no Market Core, Market Extension, Market Webview, or marketplace-only command is required

### Requirement: Build orchestration targets only retained products

Root build, compile, package, quality, and smoke orchestration MUST NOT invoke a removed product. Release compilation SHALL cover Engine, Tools, Preview, Assets, Agent, Cut, and Canvas.

#### Scenario: Retained release build

- **WHEN** the canonical release build runs
- **THEN** every retained extension compiles and no removed product filter or directory is invoked

#### Scenario: Retained Development Host build

- **WHEN** `Debug Dev (All)` invokes its pre-launch build with no dev-only packages configured
- **THEN** the build succeeds, forwards each retained Turbo filter as a separate argument, and opens the repository-owned synthetic debug workspace

#### Scenario: Validate test and scenario metadata

- **WHEN** test discovery, quality guardrails, and Webview functional scenario selection run
- **THEN** every declared package path resolves to a retained workspace package and no removed product directory is scanned or compiled

### Requirement: Installation metadata contains only retained extensions

The VS Code extension pack and release-channel metadata MUST contain exactly the retained product extensions, including the pruned Rust Media Engine, and no removed product identifier.

#### Scenario: Validate extension pack

- **WHEN** the VS Code pack manifest and release channels are validated
- **THEN** Engine, Tools, Preview, Assets, Agent, Cut, and Canvas are present and removed products are absent

### Requirement: Entity host ownership survives Dashboard removal

The Dashboard product surface MUST be absent. Assets SHALL activate the retained host-neutral Entity runtime and expose Entity Browser and Inspector surfaces without importing Dashboard package internals. Retained Canvas, Assets, and Agent callers MUST continue to resolve the canonical Entity facade commands.

#### Scenario: Activate retained Entity workflows

- **WHEN** Assets activates in a retained VS Code installation
- **THEN** it registers the canonical Entity facade and inspector through `@neko/entity/host-vscode`, and no Dashboard extension is required

#### Scenario: Inspect retained distribution surfaces

- **WHEN** extension manifests and release metadata are audited
- **THEN** no Dashboard Webview, Activity Bar container, command, package, build target, or extension-pack identifier remains

### Requirement: Removed Device UI is absent

Retained extensions MUST NOT contribute a Device Activity Bar container, view, command, menu, welcome page, localization entry, client export, or supported public type after the Device runtime is removed.

#### Scenario: Inspect Tools manifest

- **WHEN** the retained Tools extension manifest is loaded
- **THEN** it contains no `neko-devices` container, `neko.devices` view, `neko.devices.*` command, or Device/Live menu contribution

### Requirement: Cut uses one reachable control surface

The retained Cut editor MUST NOT render a package-specific left rail. Its timeline control bar MUST remain continuously reachable and MUST own the package-project action, right-property-panel visibility action, and the existing canonical export action.

#### Scenario: Render the retained Cut editor

- **WHEN** a Cut project Webview is opened
- **THEN** no Cut left-rail container or empty rail border is rendered, and the timeline header exposes package, property-panel visibility, and export controls

#### Scenario: Toggle Cut properties

- **WHEN** the property-panel button on the timeline control bar is activated
- **THEN** the right dock visibility changes and the button's accessible pressed/expanded state reflects the resulting visibility

### Requirement: Removed entry points fail visibly by absence

Obsolete scripts and commands dedicated to removed Home, Market, Auth, Live, Model, Puppet, Sketch, Story/Scene, Dashboard, and Device paths MUST be removed rather than redirected or implemented as successful no-ops. Canonical Rust, N-API, CLI, FFmpeg, and GPU scripts required by the retained Media Engine MUST remain.

#### Scenario: Inspect active scripts

- **WHEN** a caller inspects workspace and package scripts
- **THEN** only retained canonical commands exist and removed native/product entry points are absent
