## ADDED Requirements

### Requirement: Canvas add-node catalog is owned by the Desktop Canvas surface

The package-owned Canvas Root SHALL render and route one add-node catalog in Desktop. The catalog
SHALL expose Text, Table, Image, Video, Audio and 3D Director in that order.
Text and Table SHALL create canonical Markdown nodes, media actions SHALL use their typed source
intent, and 3D Director SHALL use a model source intent that resolves to a canonical file reference.
The popover SHALL use compact Canvas control density and explicit Portal-safe global Neko surface,
border, foreground, hover and shadow tokens; the Desktop shell MUST NOT substitute app-local sizing,
item surfaces, colors or focus treatment.

#### Scenario: Desktop consumes the real add-node intents

- **WHEN** a user opens the Canvas add-node menu in Desktop
- **THEN** Desktop renders the package-owned ordered catalog and localized labels
- **AND** the popover uses neutral Portal-safe Neko foreground, hover, badge and elevated surface
  treatment at compact Canvas density without oversized card icons or a duplicate focus outline
- **AND** Table creates editable GFM table content without a legacy table node type
- **AND** every menu item reaches an implemented canonical node path rather than adding a label-only
  placeholder: Text/Table become Markdown, Image/Video/Audio become typed Media and 3D Director
  becomes a model-backed File reference
- **AND** 3D Director requests a model source and uses the package-owned model Preview path
- **AND** the Desktop shell does not render a local duplicate menu, viewer, no-op item or
  compatibility fallback

### Requirement: Assets owns the Desktop Resource Browser

Assets SHALL provide a browser-safe Resource Browser Root and immutable projection over
workspace-linked Media Library, Search, Entity and metadata services. Desktop SHALL compose this Root
through public contracts and MUST NOT import VS Code TreeView providers, commands or Extension
implementation.

#### Scenario: Project Resource Dock opens

- **WHEN** a Content Project with complete Assets effects reveals its right Resource Dock
- **THEN** the Assets Root obtains a snapshot containing stable resource and Entity identities
- **AND** no absolute path, VS Code object, Host handle or duplicate asset catalog enters renderer state
- **AND** no Resource Browser Main View or primary-navigation destination is created

#### Scenario: Workspace materials are listed

- **WHEN** the Resource Browser selects its Materials facet
- **THEN** it projects Creative Entity identity and representation bindings from Entity authority
- **AND** it does not create a duplicate Asset catalog, infer project usage from file extensions or
  create a CharacterProject, CharacterRun or inferred playable state

#### Scenario: Resource facets remain purposeful

- **WHEN** the Project Resource Dock opens or changes facet
- **THEN** it exposes exactly Files, Media and Materials and defaults to Files
- **AND** no All or Entity facet remains accepted by the contract or rendered by the Root

#### Scenario: User links a configured global Media Library

- **WHEN** the user chooses to link a configured global Media Library at the current Resource Browser revision
- **THEN** Desktop Main lists the global registry, selects one stable library identity and creates one
  workspace-linked Media Library entry for the explicit Project
- **AND** renderer receives no absolute target path or global Asset center projection
- **AND** cancellation leaves both registries and the Resource Browser revision unchanged

#### Scenario: User adds a directory as a Media Library

- **WHEN** the user chooses a directory through the sender-bound Project Resource Browser action
- **THEN** Desktop creates the canonical global Media Library connection and links that library into
  the explicit workspace
- **AND** the new library appears in the Project Media facet and remains independently configurable
  in the global Asset center
- **AND** a failed workspace link rolls back the newly created global connection instead of leaving a
  partial successful configuration

#### Scenario: Legacy generic source intent is submitted

- **WHEN** a renderer submits `source.add`, an `all` facet or an `entities` facet
- **THEN** the versioned Resource Browser contract rejects it visibly
- **AND** it does not dispatch a directory picker, mutate either registry or fall back to an active
  global Asset center

### Requirement: Desktop development keeps Home contract consumers coherent

Desktop development SHALL restart the Electron Main lifecycle after a successful Main watch build so
Main, preload and renderer consume one Desktop Home management contract version. A reloaded preload
MUST NOT send a newer Home management request to a stale Main parser. Desktop MUST NOT accept
multiple internal schema versions, downgrade requests, retry unsupported versions or hide the
diagnostic as compatibility behavior.

#### Scenario: Shared Home contract changes during development

- **WHEN** the Desktop Main watch build completes after a shared Home contract change
- **THEN** the development lifecycle requests one Electron Main restart
- **AND** the next Media Library search is parsed by the matching Main contract
- **AND** production builds do not emit a development restart request

### Requirement: Global Library package styles reach the renderer

The Assets-owned Global Library Root SHALL import its package-owned stylesheet into the lazy renderer
chunk. Desktop SHALL provide the complete Main viewport but MUST NOT duplicate Global Library
selectors. Runtime acceptance MUST verify computed styles and stable layout dimensions in real
Electron rather than only inspecting stylesheet source text.

#### Scenario: User opens Asset center

- **WHEN** the Global Library lazy Root is mounted in the Desktop Main viewport
- **THEN** its header, toolbar, view switcher and collection use the Assets-owned layout rules
- **AND** the controls do not collapse into an unstyled browser-default row
- **AND** the renderer exposes no unsupported Home contract diagnostic

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

#### Scenario: User takes manual control of hovered Canvas media

- **WHEN** a user presses the audio or video playback control while the node owns a transient hover preview
- **THEN** Canvas transfers that exact media session to explicit manual playback ownership
- **AND** pointer leave does not stop, restart or replace the manually controlled playback
- **AND** a later manual pause or resume is applied by one click without a competing hover command

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

### Requirement: Storyline transport commands are immediate

Canvas Storyline SHALL apply each play or pause request to the current preview unit in the same
interaction cycle. The request identity and requested state SHALL be the command authority for that
preview; separately projected session state MUST NOT delay, invert or require repetition of the
command.

#### Scenario: User starts and pauses Storyline media

- **WHEN** the current Storyline unit is an audio or video preview and the user presses Play or Pause
- **THEN** the exact current preview receives the corresponding command once on the first click
- **AND** the transport icon and session projection converge to that command
- **AND** no stale hover, previous request or delayed session state participates

### Requirement: Model thumbnails remain truthful projections

Canvas and Assets SHALL display a thumbnail for an imported 3D model after the package-owned Preview
renderer has successfully loaded and captured that exact model revision. Until such a capture exists,
the surface SHALL display an explicit model/file placeholder and MUST NOT claim that a generic icon or
unrelated image is the model thumbnail.

#### Scenario: Imported model has no captured thumbnail

- **WHEN** a model file is introduced before a revision-matched Preview capture is available
- **THEN** Canvas and Assets display the model placeholder without blocking import or model Preview
- **AND** a later thumbnail implementation uses a disposable revision-fenced image projection
- **AND** it does not expose a raw path or add another model renderer to Canvas or Desktop

### Requirement: Canvas Root consumes one injected host runtime

The complete package-owned Canvas Root SHALL consume a versioned browser-safe Canvas runtime
supplied by Desktop preload/Main composition. Production Canvas code MUST NOT require a
module-global host API, direct Electron IPC, app implementation import or Desktop demo surface.

#### Scenario: Desktop mounts a Canvas

- **WHEN** the startup audit confirms the complete Canvas runtime and an explicit document View
- **THEN** Desktop mounts the full Canvas Root and obtains its authoritative document snapshot
- **AND** `CanvasHostAdapterSurface`, fixed nodes, removed host APIs and active-view fallback do not
  participate

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

#### Scenario: Material actions resolve beside a local Canvas status update

- **WHEN** the package-owned Canvas Root requests material actions and queues a local Canvas status
  update in the same renderer scheduling turn
- **THEN** the Webview Host waits until its renderer-originated operation queue is stable before
  submitting the revisioned material-action request
- **AND** Main does not receive a predictably stale request from that local ordering race
- **AND** a genuinely stale View or concurrent external revision remains rejected visibly

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

The change SHALL provide producer/consumer, authorization, identity, revision, persistence,
lifecycle, architecture and UI tests plus an isolated Electron fixture scenario. Desktop Canvas
behavior SHALL be revalidated through the production package or controlled Electron runtime when
Webview behavior changes.

#### Scenario: Desktop Assets and Canvas qualification runs

- **WHEN** the fixture opens a Project, searches/imports media, opens Canvas, places a resource,
  saves/reopens and explicitly opens a second Canvas to the side
- **THEN** visible state and durable facts succeed
- **AND** evidence proves Assets services/Root, Content/Entity owners, Canvas runtime/domain and fixed
  Desktop bridge were used while VS Code, active-object, demo/mock and path fallbacks remained poisoned
