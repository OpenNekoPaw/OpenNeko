## ADDED Requirements

### Requirement: Preview SHALL expose distinct lightweight, embedded, and main presentations

The system SHALL provide a lightweight Quick Preview Surface, an immersive Embedded Preview Surface, and an independent Main Preview Root from `@neko/preview-webview`. The three presentations SHALL reuse one package-owned strict Viewer registry while retaining separate presentation owners and lifecycle. Quick and Embedded Surfaces MUST NOT create, retain, navigate to, or hide a Main Preview View/session.

#### Scenario: Canvas opens immersive preview

- **WHEN** the user opens a generated image or media node inside Canvas
- **THEN** Canvas keeps the current document, selection and viewport mounted and opens an Embedded Preview Surface owned by that Canvas scene
- **AND** no Main Preview View/session or Desktop navigation is created

#### Scenario: Resource list shows a thumbnail

- **WHEN** an authorized image, video or audio item becomes visible in a Resource Browser quick-preview slot
- **THEN** the slot mounts the Quick Preview Surface and only the required content-kind Viewer chunk
- **AND** closing or virtualizing the slot releases its ephemeral presentation state

#### Scenario: Main Preview opens a document

- **WHEN** the user explicitly opens a supported document in Main Preview
- **THEN** Preview creates the exact View/session and uses the shared Viewer registry with its package-owned persistent presentation snapshot
- **AND** the operation is not represented by a retained Quick or Embedded Surface

### Requirement: Embedded Surfaces SHALL consume only authorized preview descriptors

Every public Preview Surface SHALL accept a codec-validated `PreviewMediaDescriptor` whose stable source identity is `ContentLocator` and whose render URL is an opaque short-lived Host projection. A Surface MUST NOT accept or derive an absolute path, Workspace-relative path, active resource, arbitrary localhost URL or caller-owned raw URL as an alternate successful input.

#### Scenario: Canvas requests a node output preview

- **WHEN** Canvas supplies exact Workspace, document, node, output and ContentLocator identity
- **THEN** Desktop authorizes that sender-bound resource and returns one Preview descriptor to the Embedded Surface
- **AND** the Surface does not resolve an active Canvas, selected node or filesystem path

#### Scenario: Descriptor source is unavailable

- **WHEN** Host cannot authorize or project the exact ContentLocator
- **THEN** only the requesting Surface shows an explicit unavailable diagnostic
- **AND** sibling cards, nodes, Preview Views and workspaces remain usable without fallback source selection

### Requirement: Ordinary embedded media SHALL use canonical native elements

The shared Viewer SHALL render ordinary image, video and audio content through HTML `<img>`, one native `<video>`, and one native `<audio>` respectively. Video and audio SHALL consume the descriptor's opaque resource URL with bounded metadata preload. Autoplay SHALL be disabled by default and MUST require an explicit entry policy backed by a user gesture; autoplay with audible media MUST NOT be inferred or silently enabled.

#### Scenario: Agent displays a generated video

- **WHEN** an Agent Tool result projects an authorized video descriptor into a visible message card
- **THEN** the Quick Surface assigns the opaque URL to its package-owned native `<video>` and exposes compact playback
- **AND** Agent does not create a second native element renderer or consume the local output path

#### Scenario: Quick audio card becomes visible

- **WHEN** an authorized audio descriptor is rendered without a user playback gesture
- **THEN** the native `<audio>` remains paused with metadata-only preload
- **AND** the system does not start PCM, infer autoplay, or switch to another media transport

#### Scenario: Image is rendered

- **WHEN** a valid image descriptor reaches any Preview Surface
- **THEN** the Viewer renders HTML `<img>` with the descriptor display name as accessible alternative text
- **AND** it does not use HTML `<image>` or decode the filesystem path in Renderer

### Requirement: Preview state SHALL follow the owning presentation lifetime

Quick Surface state SHALL be ephemeral to one mounted card or slot. Embedded Surface state SHALL be ephemeral to one visible Overlay/scene and MAY retain per-descriptor zoom or playback state only while that owner remains mounted. Main Preview state SHALL remain in its package-owned Preview View snapshot. Missing state ownership MUST fail visibly during development and MUST NOT fall back to a global mutable store or active View.

#### Scenario: Canvas switches between generated outputs

- **WHEN** the user switches the active item inside one open multi-output Canvas Overlay
- **THEN** the Embedded Surface stops the previous media element and restores only Overlay-local state associated with the newly active descriptor
- **AND** it does not change the Canvas durable current-output selection unless Canvas issues that separate authoring command

#### Scenario: Canvas closes the overlay

- **WHEN** the immersive Overlay closes
- **THEN** all Overlay-local Viewer state, subscriptions and authorized resource leases are released
- **AND** reopening starts a fresh embedded presentation without changing the Main Preview snapshot

### Requirement: Caller domains SHALL own context actions and result collections

Agent, Canvas and Assets SHALL retain ownership of their cards, nodes, Tool/Job status, selection, result collections, navigation and context actions. A Preview Surface SHALL render only the currently supplied descriptor and Viewer-level interaction state; it MUST NOT interpret arbitrary action registries, GenerationJob, Conversation, Canvas output group or Asset membership.

#### Scenario: Canvas shows image actions

- **WHEN** an image node is selected while Embedded Preview is available
- **THEN** Canvas renders its crop, redraw, duplicate or reference actions outside the Viewer and invokes package-owned commands
- **AND** the Preview Surface neither registers those actions nor writes Canvas facts

#### Scenario: Agent result contains multiple images

- **WHEN** one Tool result contains multiple exact output descriptors
- **THEN** Agent owns the result grid/selection and passes one active descriptor to a Quick or Embedded Surface as required
- **AND** Preview does not create an Agent result group or change transcript facts

### Requirement: Canvas SHALL expose distinct embedded and Main Preview actions

Canvas SHALL render a caller-owned embedded-preview action separately from the Preview-owned Main Preview action. The actions MUST use different stable action identity, label and icon, and invoking either action MUST execute only its declared presentation lifecycle.

#### Scenario: User selects an embeddable Canvas image

- **WHEN** an authorized image node exposes both embedded and Main Preview capabilities
- **THEN** the selection toolbar shows a Canvas preview button and a distinct Main Preview button
- **AND** the Canvas button mounts the Overlay while the Main Preview button executes the Host Preview action

#### Scenario: User selects an EPUB file

- **WHEN** an authorized EPUB/PDF/DOCX/CBZ file node is selected
- **THEN** Canvas does not offer an embedded preview action
- **AND** Main Preview remains available as the single full-document viewing path

### Requirement: Canvas embedded Preview SHALL isolate viewport and shortcut input

While a Canvas Embedded Preview Overlay is mounted, Canvas SHALL suspend viewport wheel/pan, marquee/connection gestures and editor shortcut dispatch. The Overlay SHALL own Escape and collection navigation keys and SHALL restore the unchanged Canvas viewport and previous focus when it closes.

#### Scenario: User zooms an embedded image

- **WHEN** the user wheels or uses zoom controls inside the Canvas Overlay
- **THEN** only the embedded image presentation changes
- **AND** the Canvas viewport pan and zoom remain unchanged

#### Scenario: User presses an editor shortcut in the Overlay

- **WHEN** the Overlay owns keyboard focus and the user presses Delete, Copy or a Canvas tool shortcut
- **THEN** no Canvas selection, clipboard or tool action executes
- **AND** Escape and gallery arrow keys continue to be handled by the Overlay

### Requirement: Canvas embedded resource projection SHALL preserve exact content kind

The Desktop Canvas adapter SHALL distinguish inline variant registration from embedded source registration. An embedded descriptor SHALL point to the exact authorized image, video, audio or bounded text resource expected by the Preview Viewer; it MUST NOT project an image thumbnail for a non-image embedded Viewer.

#### Scenario: Canvas opens embedded video

- **WHEN** Canvas authorizes an exact video locator for Embedded Preview
- **THEN** the descriptor media type and opaque resource URL identify the video source
- **AND** no thumbnail PNG, alternate provider or Main Preview session becomes the successful source

### Requirement: Text display and authoring SHALL have separate canonical owners

Canvas SHALL provide lightweight Markdown node authoring through the shared Milkdown rich-surface engine, while Text Editor SHALL own complete Workspace document authoring and persistence. Main Preview SHALL provide read-only plain-text and explicitly typed Markdown viewing. Agent SHALL use its streaming Markdown presentation only for transcript display. Quick Preview MUST NOT fetch or edit a complete text document merely to render a card summary.

#### Scenario: User edits a Canvas Markdown node

- **WHEN** the selected Canvas Markdown node enters edit mode
- **THEN** Canvas mounts the lightweight shared Milkdown surface and commits changes through Canvas authoring
- **AND** it does not create a Text Editor document session or use Agent Streamdown as an editor

#### Scenario: User opens a Workspace Markdown document

- **WHEN** the user explicitly opens the file for authoring
- **THEN** Text Editor owns the document session, save lifecycle and full authoring modes
- **AND** Preview and Canvas do not become alternate file-writing authorities

#### Scenario: User previews a text file

- **WHEN** an authorized plain-text or Markdown file opens in Main Preview
- **THEN** Preview renders the complete authorized content read-only using the correct plain-text or Markdown viewer
- **AND** no edit command or hidden Text Editor session is created

### Requirement: Embedded Preview styling and localization SHALL be isolated

Preview Viewer styles SHALL be scoped to Preview-owned classes and shared design tokens. The Viewer SHALL NOT select or override Agent, Canvas, Assets or Cut package classes, and callers SHALL own card borders, selection rings, Overlay backdrops and action bars. Locale SHALL be bound to the mounted Surface and MUST NOT be selected through a mutable module-global locale that another concurrent Surface can overwrite.

#### Scenario: Agent and Canvas render previews concurrently

- **WHEN** visible Agent and Canvas Surfaces render authorized media in the same Window
- **THEN** each uses its caller-owned chrome and Surface-bound locale while sharing only Viewer internals
- **AND** neither Surface changes the other's background, typography, labels or loading state

#### Scenario: Canvas opens an embedded text document

- **WHEN** an authorized Markdown, JSON or plain-text descriptor reaches the Embedded Preview Surface
- **THEN** Preview renders a solid high-contrast reading page with bounded line length, independent scrolling and selectable text
- **AND** the document does not inherit the translucent Overlay foreground, expose the Canvas beneath its body or reserve an empty single-item gallery footer

#### Scenario: Embedded text transport fails

- **WHEN** the exact authorized text resource cannot be fetched
- **THEN** the reading page shows an explicit local error diagnostic with readable contrast
- **AND** the failure does not become faint unscoped text or disable sibling Canvas resources

#### Scenario: Canvas remounts the same embedded source

- **WHEN** a stale Embedded Preview effect cleans up after a newer request has mounted the same Canvas output
- **THEN** each request owns a distinct descriptor and resource lease
- **AND** releasing the stale descriptor does not invalidate the newer Surface's authorized URL

### Requirement: Cut timeline monitoring SHALL remain outside embedded Preview Surfaces

Cut SHALL continue to own its timeline monitor, dual native video slots, Canvas composite, mixed PCM clock, seek and interval lifecycle. Cut MUST NOT import or mount Quick Preview, Embedded Preview or Main Preview Root as the successful timeline playback path. It MAY continue to consume shared `@neko/media` descriptors and browser runtime primitives through Cut-owned ports.

#### Scenario: Cut previews an audible timeline interval

- **WHEN** Cut starts an interval containing video and audible timeline inputs
- **THEN** the Cut controller drives muted video slots and the authoritative mixed PCM clock through its package-owned monitor
- **AND** no Preview Surface, Preview session or single-resource playback owner is created

### Requirement: Replaced media renderers SHALL not remain as parallel success paths

After a consumer migrates to the shared Surface, its previous raw image/video/audio success renderer, duplicate lifecycle state and alternate registration SHALL be removed in the same change. Tests SHALL assert the canonical Preview Viewer path and poison retired consumer-local paths while preserving caller-owned shells and diagnostics.

#### Scenario: Agent renders authorized media after migration

- **WHEN** a visible Agent message contains a valid authorized image, video or audio descriptor
- **THEN** evidence records the shared Quick Surface and matching Preview Viewer as the only media body renderer
- **AND** retired Agent media elements, try-next renderers and fallback URLs are absent or poisoned

#### Scenario: One embedded descriptor is invalid

- **WHEN** one card or Canvas Overlay receives a malformed or expired descriptor
- **THEN** only that Surface rejects the resource with an explicit diagnostic
- **AND** sibling descriptors and unrelated package roots continue through their canonical paths
