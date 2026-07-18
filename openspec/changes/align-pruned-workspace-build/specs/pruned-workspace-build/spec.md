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

### Requirement: Native Engine builds have one sequential owner

The retained Engine native release build MUST be owned by `neko-engine#build` as one sequential workflow. Turbo MUST NOT schedule `@neko-engine/host-cli#build:native` or `@neko-engine/host-napi#build:native` as duplicate dependencies of that task, and the workflow MUST run host-cli before host-napi so the Cargo workspace, registry, and target locks are not contended by sibling tasks. Turbo caching MUST remain disabled for tasks whose native outputs are owned by Cargo and are not fully declared as Turbo outputs.

#### Scenario: Inspect the native release task graph

- **WHEN** the Turbo dry-run plan is generated for `neko-engine#build`
- **THEN** the task has no host-cli or host-napi native dependency edges, its package command contains one ordered CLI-then-N-API native sequence, and Turbo does not cache incomplete native outputs

#### Scenario: Run a direct N-API build with a cold registry

- **WHEN** the host-napi build starts before the Cargo registry metadata is current
- **THEN** the wrapper exposes the Cargo metadata/index progress and fails before N-API compilation if metadata cannot be resolved

#### Scenario: Validate test and scenario metadata

- **WHEN** test discovery, quality guardrails, and Webview functional scenario selection run
- **THEN** every declared package path resolves to a retained workspace package and no removed product directory is scanned or compiled

#### Scenario: Run coverage once per owner

- **WHEN** canonical coverage orchestration invokes retained test owners
- **THEN** each package owns its run mode exactly once and forwarded coverage flags do not duplicate single-value CLI options

#### Scenario: Check retained source formatting

- **WHEN** the canonical formatting gate checks retained TypeScript and JSON sources
- **THEN** every retained source passes the repository Prettier configuration

#### Scenario: Read stable architecture documentation

- **WHEN** a contributor follows the stable `docs/` navigation and architecture documents
- **THEN** the documents identify only the retained product roots, packages, and Media Engine capabilities as current, while superseded Home, Workbench Core, and Market designs are explicitly historical

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

### Requirement: Removed project data is rejected without mutation

The retained distribution MUST edit only `.nkv` and `.nkc` project formats. `.nka`, `.nks`, `.nkm`, and `.nkp` MUST NOT be registered as editable codecs, Canvas projects, previews, picker choices, delegated editor targets, or successful character-export inputs. Cut MUST reject `scene3d` and `puppet` timeline tracks/elements before they enter the retained project model. Rejection MUST happen before a write and MUST NOT replace the source with an empty or converted document.

#### Scenario: Open a removed project format

- **WHEN** a retained caller attempts to load or save `.nka`, `.nks`, `.nkm`, or `.nkp`
- **THEN** it receives an unsupported-format diagnostic, no removed editor/Engine path runs, and the source bytes remain unchanged

#### Scenario: Export a native puppet character binding

- **WHEN** Assets is asked to export a character whose requested representation depends on native `.nkp` data
- **THEN** export fails before creating output and does not omit, convert, or fall back to another representation

#### Scenario: Load a removed Cut timeline element

- **WHEN** an `.nkv` document contains a `scene3d` or `puppet` track or element
- **THEN** validation rejects the document and neither the Webview nor Engine reports a successful render path

### Requirement: Retained packages do not discover removed product extensions

Retained packages MUST NOT discover, activate, or invoke Story, Auth, Market, Sketch, Model, or Puppet extensions. A retained package-owned service MAY preserve domain behavior only when it has an explicit owner and no removed-product fallback.

#### Scenario: Parse a Fountain source

- **WHEN** Canvas or Agent needs screenplay structure
- **THEN** it reads the source through retained host IO and uses the host-neutral `@neko/content` Fountain projection without activating Story

#### Scenario: Inspect Agent transfer targets and account actions

- **WHEN** the Agent UI and plugin-transfer catalog are loaded
- **THEN** Sketch/Model targets and Auth SSO/account actions are absent, while local provider configuration remains available

#### Scenario: Activate retained Cut and Canvas

- **WHEN** retained editors initialize
- **THEN** they do not start Market shader discovery or issue Market installation commands
