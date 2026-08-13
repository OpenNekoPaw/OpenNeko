## ADDED Requirements

### Requirement: Preview SHALL expose one lightweight entry and one Main Preview shell

`@neko/preview-webview` SHALL expose one `LightweightPreview` public component for Agent, Canvas and Assets. Main Preview SHALL retain its independent View/session and operation shell, but its content area SHALL compose the same package-owned Viewer kernel. Fullscreen SHALL be a caller-owned container concern and MUST NOT select a third Viewer presentation.

#### Scenario: Canvas opens fullscreen preview

- **WHEN** the user opens an exact generated image or media output inside Canvas
- **THEN** Canvas keeps the current document, selection and viewport mounted and places `LightweightPreview` in its fullscreen Overlay
- **AND** no alternate fullscreen Viewer or Main Preview View/session is created

#### Scenario: Resource list shows media

- **WHEN** an authorized image, video or audio item becomes visible in an Asset slot
- **THEN** the slot mounts `LightweightPreview` and only the required content-kind Viewer chunk
- **AND** virtualizing the slot releases its local presentation state

#### Scenario: Main Preview opens content

- **WHEN** the user explicitly opens supported content in Main Preview
- **THEN** Main Preview creates the exact View/session and composes the shared Viewer kernel with its package-owned persistent snapshot
- **AND** its additional chrome and actions do not replace the Viewer implementation

### Requirement: All Preview consumers SHALL consume only authorized descriptors

Every public Preview component SHALL accept a codec-validated `PreviewMediaDescriptor` whose stable source identity is `ContentLocator` and whose render URL is an opaque short-lived Host projection. A consumer MUST NOT accept or derive an absolute path, Workspace-relative path, active resource, arbitrary localhost URL or caller-owned raw URL as another successful input.

#### Scenario: Canvas requests a node output preview

- **WHEN** Canvas supplies exact Workspace, document, node, output and ContentLocator identity
- **THEN** Desktop authorizes that sender-bound resource and returns one Preview descriptor
- **AND** neither the node nor Overlay resolves an active Canvas, selected node or filesystem path

#### Scenario: Descriptor source is unavailable

- **WHEN** Host cannot authorize or project the exact ContentLocator
- **THEN** only the requesting preview shows an explicit unavailable diagnostic
- **AND** sibling cards, nodes, Preview Views and workspaces remain usable without fallback source selection

### Requirement: Lightweight and Main Preview SHALL share one content implementation

For each supported content kind, Lightweight Preview and Main Preview SHALL use the same Viewer component, resource descriptor, loading/error lifecycle and browser element. UI parameters MAY change control density, caller sizing, snapshot persistence or controlled playback intent; they MUST NOT select a different renderer, codec policy, source, transport or fallback player.

#### Scenario: The same WebM opens in Canvas and Main Preview

- **WHEN** both callers resolve the same authorized WebM ContentLocator
- **THEN** both pass equivalent descriptors through the same video Viewer and Host resource/Range path
- **AND** Canvas does not apply a separate extension whitelist, preparation rule or native-player implementation

#### Scenario: Main Preview renders additional controls

- **WHEN** Main Preview renders a media descriptor with full control density
- **THEN** the shared Viewer exposes the Main Preview operation UI and persistent snapshot integration
- **AND** the underlying element, source and error lifecycle remain identical to Lightweight Preview

### Requirement: Ordinary media SHALL use canonical native elements

The shared Viewer SHALL render ordinary image, video and audio content through HTML `<img>`, one native `<video>`, and one native `<audio>` respectively. Video and audio SHALL consume the descriptor's opaque resource URL with bounded metadata preload. Autoplay SHALL be disabled by default and MUST require an explicit caller policy backed by a user gesture; audible autoplay MUST NOT be inferred or silently enabled.

#### Scenario: Agent displays a generated video

- **WHEN** an Agent Tool result projects an authorized video descriptor into a visible message card
- **THEN** `LightweightPreview` assigns the opaque URL to the shared native `<video>` Viewer and exposes compact playback
- **AND** Agent does not create another native element renderer or consume a local output path

#### Scenario: Resource Browser hovers a video

- **WHEN** the pointer remains over a Resource Browser video item long enough to resolve its exact preview descriptor
- **THEN** the same shared native `<video>` is muted, starts directly, loops and omits the complete player control strip
- **AND** Resource Browser does not own a video element, codec check or alternate media lifecycle

#### Scenario: Resource Browser hovers audio

- **WHEN** the pointer remains over a Resource Browser audio item long enough to resolve its exact preview descriptor
- **THEN** the same shared native `<audio>` starts audible playback without rendering a waveform, thumbnail card or playback controls
- **AND** leaving the item pauses the element and releases that exact preview lease

#### Scenario: Canvas hover playback does not take manual ownership

- **WHEN** Canvas starts or stops inline audio/video by issuing a hover playback command
- **THEN** the shared media element consumes the resulting native `play` or `pause` event as command acknowledgement instead of reporting user interaction
- **AND** pointer leave stops only transient hover playback while genuine manual playback remains owned by the user
- **AND** a pending asynchronous play completion cannot restart media after a newer hover-leave pause command

#### Scenario: Canvas displays inline audio

- **WHEN** an authorized audio node is visible without a user playback gesture
- **THEN** `LightweightPreview` owns one paused native `<audio>` with metadata-only preload
- **AND** Canvas does not start PCM, infer autoplay or switch to another media transport

#### Scenario: Image is rendered

- **WHEN** a valid image descriptor reaches either Preview UI
- **THEN** the shared image Viewer renders HTML `<img>` with the descriptor display name as accessible alternative text
- **AND** no consumer-local image loader or filesystem path decoding is used

### Requirement: Preview state SHALL follow the caller lifetime

Lightweight Preview state SHALL belong to one exact card, node, Asset slot or Overlay owner and SHALL be ephemeral unless that caller explicitly supplies a snapshot. Main Preview state SHALL remain in its package-owned Preview View snapshot. Missing ownership MUST NOT fall back to a global mutable store, active View or recent consumer.

#### Scenario: Canvas switches generated outputs

- **WHEN** the user switches the active item inside one open multi-output Canvas Overlay
- **THEN** the previous element and descriptor lease are stopped and released before the new exact descriptor is shown
- **AND** Main Preview snapshot and Canvas durable output selection remain unchanged

#### Scenario: A lightweight preview unmounts

- **WHEN** a card, node, Asset slot or Overlay leaves the visible composition
- **THEN** its elements, subscriptions, ephemeral state and exact resource lease are released
- **AND** no hidden Root or media runtime is retained because the resource was previously previewed

#### Scenario: Canvas playback projection updates

- **WHEN** Canvas projects a new playback callback, time update or control owner for the same descriptor resource
- **THEN** the mounted shared media element remains mounted and its resource lifecycle cleanup does not run
- **AND** only descriptor replacement or actual Surface unmount snapshots, pauses and releases that resource

#### Scenario: Canvas detaches before descriptor cleanup

- **WHEN** a Canvas Lightweight Preview releases its descriptor after the Canvas View has left the active Workbench
- **THEN** Host releases the exact lease using its recorded Window, session and descriptor owner
- **AND** it does not require a new active-Workbench grant or release any sibling lease

### Requirement: Caller domains SHALL own context actions and collections

Agent, Canvas and Assets SHALL retain ownership of their cards, nodes, Tool/Job status, selection, result collections, navigation and context actions. Preview SHALL render only the supplied descriptor and Viewer-level state; it MUST NOT interpret arbitrary action registries, GenerationJob, Conversation, Canvas output group or Asset membership.

#### Scenario: Canvas shows node actions

- **WHEN** a media node is selected
- **THEN** Canvas renders its generation, editing, duplicate or handoff actions outside `LightweightPreview`
- **AND** Preview neither registers those actions nor writes Canvas facts

#### Scenario: Agent result contains multiple images

- **WHEN** one Tool result contains multiple exact output descriptors
- **THEN** Agent owns the result grid and selection and supplies each active descriptor to `LightweightPreview`
- **AND** Preview does not create an Agent result group or change transcript facts

#### Scenario: Asset Management selects a media item

- **WHEN** an Asset Center catalog item becomes the selected Main slot resource
- **THEN** the Asset-owned Main Preview shell composes the shared Viewer kernel for that exact authorized descriptor
- **AND** catalog entries keep only static icon thumbnails rather than a consumer-owned hover media renderer

### Requirement: Canvas SHALL expose distinct local and Main Preview actions

Canvas SHALL render a caller-owned local-preview action separately from the Preview-owned Main Preview action. The actions MUST use different stable action identity, label and icon. The local action mounts the same `LightweightPreview` used by ordinary Canvas nodes inside a caller-owned Overlay; the Main Preview action creates or focuses the exact Preview View/session.

#### Scenario: User selects a previewable Canvas image

- **WHEN** an authorized image node exposes both local and Main Preview capabilities
- **THEN** the selection toolbar shows a local fullscreen button and a distinct Main Preview button
- **AND** invoking either action only changes its declared owner lifecycle

#### Scenario: User selects a document-only file

- **WHEN** an authorized EPUB, PDF, DOCX or CBZ node is selected
- **THEN** Canvas does not offer an unsupported lightweight reader
- **AND** Main Preview remains the single complete-document viewing path

### Requirement: Canvas fullscreen Preview SHALL isolate input

While a Canvas fullscreen Preview Overlay is mounted, Canvas SHALL suspend viewport wheel/pan, marquee/connection gestures and editor shortcut dispatch. The Overlay SHALL own Escape and collection navigation keys and restore the unchanged Canvas viewport and previous focus when it closes.

#### Scenario: User interacts inside fullscreen preview

- **WHEN** the user wheels, plays media or presses an editor shortcut inside the Overlay
- **THEN** only Lightweight Preview and Overlay-local state respond
- **AND** Canvas viewport, selection, clipboard and tools remain unchanged

### Requirement: Text display and authoring SHALL have separate owners

Canvas SHALL provide lightweight Markdown node authoring through the shared rich-surface engine, while Text Editor SHALL own complete Workspace document authoring and persistence. Main Preview SHALL provide read-only plain-text and explicitly typed Markdown viewing. Agent SHALL use its streaming Markdown presentation only for transcript display. Lightweight cards MUST NOT fetch or edit a complete text document merely to render a summary.

#### Scenario: User edits a Canvas Markdown node

- **WHEN** the selected Canvas Markdown node enters edit mode
- **THEN** Canvas mounts its lightweight authoring surface and commits changes through Canvas authoring
- **AND** it does not create a Text Editor session or use Preview as an editor

#### Scenario: User previews a text file

- **WHEN** an authorized plain-text or Markdown file opens in Main Preview
- **THEN** Preview renders the complete content read-only using the canonical text Viewer
- **AND** no edit command or hidden Text Editor session is created

### Requirement: Preview styling and localization SHALL be isolated

Preview Viewer styles SHALL be scoped to Preview-owned classes and shared design tokens. The Viewer SHALL NOT select or override Agent, Canvas, Assets or Cut package classes. Callers SHALL own card borders, selection rings, Overlay backdrops and action bars. Locale SHALL be bound to the mounted Preview instance and MUST NOT be selected through mutable module-global state.

#### Scenario: Agent and Canvas render concurrently

- **WHEN** visible Agent and Canvas lightweight previews render authorized media in one Window
- **THEN** each retains its caller chrome and instance-bound locale while sharing Viewer internals
- **AND** neither changes the other's background, labels or loading state

#### Scenario: Lightweight media controls fit a compact card

- **WHEN** Canvas, Agent or Assets renders an authorized lightweight video or audio descriptor
- **THEN** video uses the shared native video element with native controls
- **AND** audio uses the shared native audio element with Preview-owned compact waveform controls instead of the browser's native audio strip
- **AND** a non-source `play()` rejection leaves the usable media element visible rather than showing a blocking source diagnostic

### Requirement: Cut monitoring SHALL remain outside Preview

Cut SHALL continue to own its timeline monitor, dual native video slots, Canvas composite, mixed PCM clock, seek and interval lifecycle. Cut MUST NOT import or mount `LightweightPreview` or Main Preview Root as the timeline playback path. It MAY consume shared `@neko/media` primitives through Cut-owned ports.

#### Scenario: Cut previews an audible interval

- **WHEN** Cut starts a timeline interval with video and audible inputs
- **THEN** its controller drives its muted video slots and authoritative mixed PCM clock
- **AND** no single-resource Preview owner is created

### Requirement: Replaced renderers SHALL not remain as parallel success paths

After Agent, Canvas or Assets migrates to `LightweightPreview`, its previous raw image/video/audio renderer, duplicate lifecycle state and alternate Host registration SHALL be removed in the same change. Tests SHALL assert the canonical Preview path and poison retired consumer-local paths while preserving caller-owned shells and diagnostics.

#### Scenario: One descriptor is invalid

- **WHEN** one card, node or Overlay receives a malformed or expired descriptor
- **THEN** only that instance rejects the resource with an explicit diagnostic
- **AND** sibling descriptors and unrelated package roots continue through their canonical paths
