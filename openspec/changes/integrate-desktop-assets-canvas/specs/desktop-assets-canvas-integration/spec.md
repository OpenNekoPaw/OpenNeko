## ADDED Requirements

### Requirement: Canvas add-node catalog is identical across Desktop and VS Code

The package-owned Canvas Root SHALL render and route one add-node catalog for both Desktop and
VS Code. The catalog SHALL expose Text, Table, Image, Video, Audio and 3D Director in that order.
Text and Table SHALL create canonical Markdown nodes, media actions SHALL use their typed source
intent, and 3D Director SHALL use a model source intent that resolves to a canonical file reference.
The popover SHALL use compact Canvas control density and explicit Portal-safe global Neko surface,
border, foreground, hover and shadow tokens; neither Host may substitute host-local sizing, item
surfaces, colors or focus treatment.

#### Scenario: Both hosts consume the same real add-node intents

- **WHEN** a user opens the Canvas add-node menu in Desktop or VS Code
- **THEN** both hosts render the same package-owned ordered catalog and localized labels
- **AND** the popover uses neutral Portal-safe Neko foreground, hover, badge and elevated surface
  treatment at compact Canvas density without oversized card icons or a duplicate focus outline
- **AND** Table creates editable GFM table content without a legacy table node type
- **AND** every menu item reaches an implemented canonical node path rather than adding a label-only
  placeholder: Text/Table become Markdown, Image/Video/Audio become typed Media and 3D Director
  becomes a model-backed File reference
- **AND** 3D Director requests a model source and uses the package-owned model Preview path
- **AND** neither host renders a local duplicate menu, viewer, no-op item or compatibility fallback

### Requirement: Assets owns the Desktop Resource Browser

Assets SHALL provide a browser-safe Resource Browser Root and immutable projection over
workspace-linked Media Library, Search, Entity and metadata services. Desktop SHALL compose this Root
through public contracts and MUST NOT import VS Code TreeView providers, commands or Extension
implementation.

#### Scenario: Resource Dock opens

- **WHEN** a Content Project with complete Assets effects reveals the Resource Dock
- **THEN** the Assets Root obtains a snapshot containing stable resource and Entity identities
- **AND** no absolute path, VS Code object, Host handle or duplicate asset catalog enters renderer state

#### Scenario: Character resources are listed

- **WHEN** the Resource Browser selects its Character Entity facet
- **THEN** it projects Creative Entity identity and representation bindings from Entity authority
- **AND** it does not create a Chara asset category, CharacterProject, CharacterRun or inferred playable state

### Requirement: Resource operations use sender-bound Host effects

Desktop MUST route resource search, import/link, source selection, thumbnail/metadata projection,
reveal and write operations through fixed versioned Assets effects. Main SHALL derive Window, View,
Workspace and renderer epoch from the sender and SHALL validate locator containment, trust, owner and
request schema.

#### Scenario: User searches linked media

- **WHEN** the Resource Browser submits a query for its explicit Workspace
- **THEN** the owning search service returns stable ContentLocator-based results and authorized metadata
- **AND** renderer does not submit or receive a workspace root, source path, cache path or `file://` URL

#### Scenario: A locator escapes the workspace grant

- **WHEN** a forged, stale or symlink-escaping locator is requested
- **THEN** Main rejects the operation with a typed diagnostic
- **AND** it does not fall back to an active workspace, raw filesystem access or label-based identity

### Requirement: Hover media preview is transient and package-owned

Canvas and Assets SHALL own their hover interaction state while package-owned Media and Preview
components own playback and rendering. Desktop Main SHALL authorize the exact ContentLocator for a
short-lived preview session. Hover preview MUST NOT open or replace a Workbench Preview View, persist
playback state, mutate `.nkc` facts, expose an absolute path or introduce a Desktop-local media viewer.

#### Scenario: User hovers a Canvas audio or video node

- **WHEN** the pointer enters a previewable audio or video node
- **THEN** the Canvas package starts the node's authorized media session from the beginning
- **AND** leaving the node, hiding its View or unmounting its Root stops playback and releases the
  stream without changing the Canvas document

#### Scenario: User hovers a Resource Browser media item

- **WHEN** the pointer remains over an image, audio or video resource long enough to request quick
  preview
- **THEN** Resource Browser resolves that exact resource through its sender-bound Host runtime and
  renders it through the package-owned compact Preview surface
- **AND** leaving the item, switching to another item, changing facet or unmounting the browser
  cancels stale work, stops playback and releases the descriptor

#### Scenario: Hover target is stale or unsupported

- **WHEN** the resource identity becomes stale, its locator escapes authorization or the item is not
  an image, audio or video
- **THEN** the Host rejects or skips quick preview visibly according to the typed contract
- **AND** it does not fall back to a path, thumbnail-only fake playback or the currently active item

### Requirement: Canvas Root consumes one injected host runtime

The complete package-owned Canvas Root SHALL consume a versioned browser-safe Canvas runtime supplied
by its Host. VS Code and Electron SHALL adapt their effects to that runtime. Production Canvas code
MUST NOT require a module-global VS Code API, direct Extension command or Desktop demo surface.

#### Scenario: Desktop mounts a Canvas

- **WHEN** the startup audit confirms the complete Canvas runtime and an explicit document View
- **THEN** Desktop mounts the full Canvas Root and obtains its authoritative document snapshot
- **AND** `CanvasHostAdapterSurface`, fixed nodes, global VS Code API and active editor do not participate

#### Scenario: VS Code opens the same Canvas contract

- **WHEN** the VS Code Custom Editor opens an `.nkc`
- **THEN** its adapter supplies the same Canvas runtime semantics
- **AND** existing VS Code save, edit, preview and authoring behavior remains covered

### Requirement: Canvas authoring is explicit and revisioned

Every Canvas mutation SHALL carry explicit Project, document/session, command and expected revision
identity. The Canvas owner SHALL validate and apply the mutation, persist `.nkc` facts and publish the
new revision. Missing, stale or mismatched identity MUST fail visibly.

#### Scenario: Resource is added to Canvas

- **WHEN** the user adds a Resource Browser item to an explicit Canvas document
- **THEN** the Resource identity is projected and the Canvas authoring service applies the matching node
  mutation at the expected revision
- **AND** cancellation or failure leaves Canvas unchanged

#### Scenario: Resource is dragged onto Canvas

- **WHEN** the user drags a previewable Resource Browser item onto an explicit Canvas position
- **THEN** the drag payload contains only a validated portable ContentLocator and presentation name
- **AND** the Canvas Host applies `project-content` to that explicit document/session at the actual
  drop position
- **AND** the shared drop lifecycle releases the Canvas drag overlay immediately after drop without
  waiting for the asynchronous Host mutation to settle
- **AND** no absolute path, file URL, VS Code `project:addSource` route or active-Canvas fallback
  participates

#### Scenario: A stale Canvas View submits an edit

- **WHEN** the View sends a mutation with an old document revision or View epoch
- **THEN** Host rejects it and obtains a new authoritative snapshot
- **AND** it does not apply last-write-wins or mutate the currently active Canvas

### Requirement: Workspace Board and candidate ownership remain canonical

Agent Workspace Board delivery, generated candidates and acceptance SHALL continue through their
existing owning Canvas/domain operations. Desktop SHALL display owner projections and SHALL NOT create
a renderer-owned candidate list, delivery ledger or acceptance shortcut.

#### Scenario: A generated candidate is accepted

- **WHEN** the user accepts a candidate projected for an explicit Board
- **THEN** the owning acceptance operation commits the result and Canvas observes its stable provenance
- **AND** Desktop does not copy generated bytes, infer another Board or mark an optimistic local success

### Requirement: Assets and Canvas recover without duplicate work

Closing/reopening a View, renderer reload and application restart SHALL recover Resource Browser
projection, open Canvas Views and `.nkc` document facts from their owners. Recovery MUST NOT repeat
import, delivery, candidate acceptance or Canvas mutation.

#### Scenario: Application restarts after Canvas save

- **WHEN** Desktop restarts after a resource was placed and the Canvas was saved
- **THEN** the Project reattaches the exact workspace, Assets projection and Canvas document/session
- **AND** the resource placement appears once with no duplicate import or mutation

### Requirement: P1.4 qualification proves the canonical path

The change SHALL provide producer/consumer, authorization, identity, revision, persistence, lifecycle,
architecture and UI tests plus an isolated Electron fixture scenario. Existing VS Code Canvas behavior
SHALL be revalidated through Extension Development Host when Webview behavior changes.

#### Scenario: Desktop Assets and Canvas qualification runs

- **WHEN** the fixture opens a Project, searches/imports media, opens Canvas, places a resource,
  saves/reopens and explicitly opens a second Canvas to the side
- **THEN** visible state and durable facts succeed
- **AND** evidence proves Assets services/Root, Content/Entity owners, Canvas runtime/domain and fixed
  Desktop bridge were used while VS Code, active-object, demo/mock and path fallbacks remained poisoned
