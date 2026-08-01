## ADDED Requirements

### Requirement: Cut Root consumes one injected owning runtime

The system MUST render the complete package-owned Cut Root through a versioned, browser-safe runtime
whose identity includes Project, Workspace, Window, View epoch, document, session and endpoint epoch.
The Cut Stage and Timeline MUST consume the same document/session projection and MUST NOT use a
global VS Code API, fixed demo timeline or renderer-owned OTIO store.

#### Scenario: Desktop opens a Cut document

- **WHEN** an authorized Cut document is opened in Desktop
- **THEN** the full Cut Root receives the owning OTIO snapshot, revision and session through the
  injected runtime
- **AND** the Cut Stage and bottom Timeline observe the same command and playback state
- **AND** no VS Code message adapter or fixed host-adapter surface returns success

#### Scenario: A stale Cut command arrives

- **WHEN** a command carries a stale View epoch, document session or expected OTIO revision
- **THEN** the owning runtime rejects it before Cut command, preview or file effects execute
- **AND** the current Cut document remains unchanged

### Requirement: Cut supports multiple open documents with one rendered session

The system MUST keep independent owner state for each open Cut document, MUST focus an existing View
when the same document is opened again, and MUST render at most one Cut Stage/Timeline session in
Phase 1.

#### Scenario: User switches between Cut documents

- **WHEN** two different Cut documents are open and the user selects the inactive document
- **THEN** Desktop pauses and releases the previously rendered preview resources
- **AND** it mounts the selected document's own session without copying OTIO or command state

#### Scenario: User closes a dirty Cut

- **WHEN** a dirty Cut View is closed
- **THEN** save/discard/cancel is handled by the owning document session
- **AND** closing or switching the View does not silently discard edits or retarget an ExportJob

### Requirement: Preview uses authorized package-owned viewers

The system MUST provide one package-owned Preview Root that selects existing image, video, audio,
document or model viewers from an explicit registry and consumes an injected Preview runtime.
Generic Preview MUST support temporary, pinned and explicit side View modes and MUST NOT replace
Canvas-node or Cut-clip embedded previews.

#### Scenario: User previews a resource

- **WHEN** the user single-clicks a previewable Resource Browser item
- **THEN** Desktop reuses the temporary Preview View with the authorized descriptor
- **AND** the Resource Dock that originated the selection remains available for subsequent
  selection and explicit Add-to-Cut actions
- **AND** pinning retains it while an explicit side-open uses the bounded Main split

#### Scenario: Viewer kind is unsupported

- **WHEN** no registered viewer accepts the projected content kind
- **THEN** Preview returns an explicit unsupported diagnostic
- **AND** it does not open the raw file through a renderer fallback

### Requirement: Media transport is opaque, scoped and releasable

The system MUST resolve thumbnails and preview media through Host-authorized descriptors scoped to
the real WebContents, Window/View/document session, endpoint epoch and content revision. Renderer
payloads MUST retain the source ContentLocator and MAY contain only the short-lived
`openneko://resource` URL issued by the Desktop exact-resource registry. They MUST NOT contain absolute
paths, `file://` URLs, arbitrary localhost URLs, cache paths, private media schemes, Engine/client
tokens or provider secrets.

#### Scenario: Image or video appears in the Resource Browser

- **WHEN** a visible Resource Browser item has an image/video thumbnail descriptor
- **THEN** Host validates the locator and revision and returns a bounded thumbnail projection
- **AND** the item displays that thumbnail while non-visual content retains a typed fallback

#### Scenario: Preview requests a byte range

- **WHEN** an authorized audio/video/document viewer requests a valid range from its opaque media
  descriptor
- **THEN** the owning media transport returns correct MIME, range and EOF semantics
- **AND** cancellation or View disposal releases the stream and decoder

#### Scenario: A descriptor is replayed across owners

- **WHEN** an unknown, stale, cross-Window or released descriptor is requested
- **THEN** Main rejects it fail-closed without reading the file or returning cached bytes

### Requirement: Resource handoff names an explicit Cut or Preview target

Resource Browser preview and add-to-Cut intents MUST carry stable resource identity and an explicit
target View/document/session/expected revision. Cut authoring MUST resolve the ContentLocator and
apply the owning command; it MUST NOT fall back to an active or recent Cut.

#### Scenario: User quick-opens a workspace resource

- **WHEN** the user single-clicks a previewable file, an OTIO document or a Canvas document
- **THEN** Resource Browser routes it respectively to temporary Preview, the package-owned Cut Root
  or the package-owned Canvas Root
- **AND** Desktop does not implement a parallel viewer or editor

#### Scenario: Media is added to a Cut

- **WHEN** the user selects a supported media item and chooses Add to Cut for an explicit target
- **THEN** Cut validates the resource and target revision, applies one owning command and returns the
  new authoritative snapshot
- **AND** Assets does not mutate OTIO or persist a second media record

#### Scenario: The target changed before handoff

- **WHEN** the target Cut session or revision changed after selection
- **THEN** the handoff is rejected with a stale-target diagnostic
- **AND** no other open Cut receives the resource

### Requirement: Export and lifecycle remain owned by Cut and media packages

Cut export actions MUST create and control the existing owning ExportJob, and preview playback MUST
remain owned by Cut/Preview and `@neko/media`. Desktop MUST project status and dispose subscriptions
without creating a generic renderer task or duplicate execution.

#### Scenario: Export continues while UI placement changes

- **WHEN** a Cut ExportJob is running and the user moves, hides or switches the Cut View
- **THEN** the Job remains associated with its originating Cut session and projects status
- **AND** presentation changes neither duplicate nor silently cancel the export

#### Scenario: Project closes

- **WHEN** the Project or AppHost closes
- **THEN** Cut/Preview runtimes release subscriptions, streams, decoders and cancellable work
  according to owning lifecycle policy
- **AND** a late event cannot mutate a reopened View with a new epoch

### Requirement: Cut and Preview retain current VS Code behavior

The VS Code Cut and Preview adapters MUST consume the same package-owned contracts used by Desktop
and MUST retain current save, undo/redo, preview, media, export, focus and cleanup behavior.

#### Scenario: Shared Root migration is qualified

- **WHEN** the Cut/Preview runtime migration is validated
- **THEN** producer-consumer tests and isolated Extension Development Host scenarios prove the shared
  Roots use the new runtime
- **AND** Electron fixture evidence proves VS Code adapters are not involved in Desktop
