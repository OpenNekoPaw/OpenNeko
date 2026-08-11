## MODIFIED Requirements

### Requirement: Canvas ordinary playback SHALL use native elements

Ordinary Canvas audio SHALL use native `<audio>` and ordinary video SHALL use one native `<video>` including embedded audio through the Canvas-owned inline playback path. Host SHALL register the accepted source or explicitly prepared complete seekable representation. Ordinary playback MUST NOT create PCM, a Web Audio master clock or a native/PCM fallback. Canvas immersive read-only preview SHALL pass the exact authorized descriptor to `@neko/preview-webview` Embedded Preview Surface while Canvas retains Overlay, result-group, action and durable selection ownership.

#### Scenario: Existing node is path-only

- **WHEN** an otherwise valid Media/File node lacks `ContentLocator` and retains only a safe display path
- **THEN** the editor preserves the node, layout and connections and shows content unavailable
- **AND** no preview, playback, action, Agent handoff, registration, inference or migration occurs

#### Scenario: User moves an unavailable node

- **WHEN** an older material-action projection becomes stale after node movement
- **THEN** the Webview retries against the latest snapshot at most once and discards optional failure
- **AND** it does not emit `canvas.loadFailed` or replace the editor

#### Scenario: User plays Canvas media

- **WHEN** Host returns an accepted audio or video descriptor for ordinary inline playback
- **THEN** the Canvas package-owned native element consumes its transient resource URL
- **AND** controls use native play, pause, seek, volume and playback rate without routing through Main Preview

#### Scenario: User opens Canvas immersive preview

- **WHEN** the user requests full-size viewing for an exact authorized Canvas node or output
- **THEN** Canvas mounts the shared Embedded Preview Surface inside its scene and retains collection navigation and actions
- **AND** it does not create or navigate to a Main Preview View/session

### Requirement: Preview SHALL use its owning viewers

Preview SHALL keep one package-owned strict Viewer registry for image, audio, video, text, document and model content. Main Preview SHALL combine that registry with its independent View/session and persistent presentation snapshot. Agent, Canvas and Assets read-only quick or immersive presentations SHALL consume the same registry only through Preview's public embedded Surfaces, without importing raw internal players. Audio/video SHALL consume native resource URLs; PDF/document adapters SHALL consume Range or bounded bytes; GLB SHALL use one resource and glTF external dependencies SHALL use an exact resource set. `PreviewMediaDescriptor.contentLocator` SHALL remain source identity.

#### Scenario: Main Preview opens audio or video

- **WHEN** Main Preview resolves an accepted source
- **THEN** the owning Viewer consumes an `openneko://resource/...` URL and restores only that Preview View's presentation snapshot
- **AND** no Desktop-local viewer or PCM fallback replaces it

#### Scenario: Embedded consumer opens audio or video

- **WHEN** Agent, Canvas or Assets supplies an authorized descriptor to a public embedded Surface
- **THEN** the same Preview Viewer registry renders the content with the embedded owner's ephemeral state
- **AND** the consumer does not import the internal AudioPlayer/VideoPlayer or create a hidden Main Preview Root

#### Scenario: Preview opens external-resource glTF

- **WHEN** the model manifest declares relative buffers/textures
- **THEN** one entry URL resolves only the frozen allowlist
- **AND** unknown dependencies fail without directory authorization

### Requirement: Agent display and file authority SHALL remain separate

Agent/Pi messages, attachments, Tool results, Timeline/artifacts and provider materialization SHALL retain validated locator fields. Only the conversation display projector may add a transient authorized Preview descriptor or resource render URL. Agent media card and Generation Job result bodies SHALL use the shared Preview Quick Surface while Agent retains card, Tool status, collapse and result grouping. Agent file Tools and authorized processors SHALL use PathAccessPolicy and Host-resolved real filesystem paths; ordinary Agent sessions SHALL not gain Bash.

#### Scenario: Tool result contains video

- **WHEN** a Tool result has a valid displayable locator
- **THEN** Webview projection preserves it, adds a transient authorized Preview descriptor and renders it through the Preview Quick Surface
- **AND** Pi, provider and later Tools do not consume that descriptor URL or the local output path

#### Scenario: Agent media descriptor is invalid

- **WHEN** one projected media descriptor fails Preview codec or resource authorization
- **THEN** that message card shows an explicit local diagnostic and does not render a raw URL fallback
- **AND** the Conversation, sibling results and later turns remain usable

#### Scenario: Authorized processor invokes a command

- **WHEN** a typed processor receives an authorized media input
- **THEN** Host supplies the exact real input/output paths inside its execution scope
- **AND** no `openneko:`, `neko-media:` or loopback display URL is passed to the command

## ADDED Requirements

### Requirement: Embedded media consumers SHALL preserve independent domain ownership

Agent conversation cards, Canvas scenes, Asset Browser slots and Preview Views SHALL own independent presentation state, subscriptions and authorized resource leases. Shared Viewer implementation MUST NOT introduce a global active media owner, cross-domain playback store, retained hidden Root or fallback to the most recent consumer. Cut timeline runtime SHALL remain a separate owner and MUST NOT be registered in the embedded Preview Surface path.

#### Scenario: Agent and Canvas display media concurrently

- **WHEN** one Agent card and one Canvas Overlay display different authorized media in the same Window
- **THEN** each controls and releases only its exact descriptor, element and presentation state
- **AND** selecting or closing either consumer does not retarget, stop or mutate the other

#### Scenario: Embedded Surface unmounts

- **WHEN** a Quick or Embedded Surface leaves the visible composition
- **THEN** its elements, subscriptions, ephemeral snapshots and resource leases are released by exact owner identity
- **AND** no React Root or media runtime is retained solely because the resource was previously previewed
