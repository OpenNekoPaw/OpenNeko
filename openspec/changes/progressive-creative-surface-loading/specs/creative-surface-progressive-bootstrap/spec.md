## ADDED Requirements

### Requirement: Visible Surface and domain bootstrap start independently

An active Canvas, Cut, Preview, Text Editor or Resource Browser View SHALL commit a stable,
owner-qualified loading Surface without waiting for its dynamic Root module or document Snapshot to
finish. After the exact View/session identity exists, module loading and the first domain Snapshot
request SHALL start independently and MUST NOT wait for one another.

#### Scenario: Cut opens with a cold module

- **WHEN** the user opens an exact Cut View whose Webview module is not resolved
- **THEN** the Cut slot immediately presents its stable loading Surface while the module import and exact Cut Snapshot request are both pending
- **AND** mounting the Cut Root reuses that pending or latest Snapshot instead of starting a second bootstrap

#### Scenario: Preview opens with a cold format module

- **WHEN** the user opens an exact Preview View whose Root or selected Viewer module is not resolved
- **THEN** the Preview slot presents its stable loading Surface while source preparation and module loading proceed
- **AND** no unrelated Viewer module or hidden Preview Root is required for the first ready presentation

#### Scenario: Canvas returns before Generation recovery

- **WHEN** an exact Canvas document contains persisted Generation runs whose Job state must be restored
- **THEN** the Canvas Surface receives its validated document Snapshot without waiting for every Job query or input preparation
- **AND** Generation recovery updates the same exact Session through subsequent projection events

#### Scenario: Editor or Resource Browser opens with a cold module

- **WHEN** the user opens an exact Text Editor or Resource Browser Surface whose Webview module is unresolved
- **THEN** the module import and first exact projection request start independently
- **AND** mounting the Root reuses the pending or latest projection instead of issuing a second bootstrap request

### Requirement: Preparation remains exact and disposable

Each Surface preparation SHALL belong to one View/session identity, SHALL be idempotent under StrictMode remount, and SHALL release subscriptions and transient resources when that Surface is replaced or unmounted. A stale completion MUST NOT update another View, active tab, recent session or sibling Surface. Pending work MUST settle as ready or an owner-qualified diagnostic; a Surface MUST NOT remain indefinitely in an undifferentiated loading state after failure.

#### Scenario: User switches Views during preparation

- **WHEN** View A is preparing and the user selects View B before A completes
- **THEN** A's completion is cancelled or ignored by exact identity and B starts its own preparation
- **AND** A cannot overwrite B or fall back to the active/recent View

#### Scenario: Preparation fails

- **WHEN** a module import, Snapshot request or authorized source preparation fails
- **THEN** the owning Surface displays a local visible diagnostic
- **AND** the Desktop Shell and sibling Roots remain mounted and operable

### Requirement: Warm modules do not require retained business Roots

The renderer MAY prefetch an ESM module from explicit user intent or bounded idle work, but MUST NOT mount an invisible Cut/Preview Root, retain a domain runtime, or read user document bytes solely to warm the module. A resolved module SHALL be reused through the canonical ESM import promise.

#### Scenario: User returns to a previously loaded format

- **WHEN** the selected Viewer module was already resolved but its previous Surface was unmounted
- **THEN** the new exact Surface reconstructs from its domain authority and presentation snapshot without a second module cold load
- **AND** no hidden historical Root or document-data cache supplies success

### Requirement: Restored Preview Views rebuild from durable content identity

A pinned or side Preview View SHALL persist its canonical `ContentLocator` as the only recoverable source identity.
After Renderer reload or Desktop restart, the Preview owner SHALL rebuild a fresh runtime source authorization and
opaque resource lease from that locator before returning the first exact Snapshot. A released `preview-session:*`,
absolute path, descriptor or opaque URL MUST NOT supply recovery success.

#### Scenario: Renderer reloads with a pinned Preview attached

- **WHEN** the old Preview runtime and sender-bound resource lease have been released but the pinned View remains in the restored Workbench
- **THEN** the first exact Snapshot resolves the persisted `ContentLocator` against the current Workspace authority and returns a newly authorized descriptor
- **AND** the View renders the same document without querying the released runtime session as its source

#### Scenario: Restored Preview source is invalid

- **WHEN** a restored Preview View has no valid `ContentLocator` or the current authority can no longer resolve it
- **THEN** only that Preview View is closed or reports an owner-qualified unavailable diagnostic
- **AND** no document path is inferred from `documentId`, no active/recent Workspace is used, and sibling Views remain available

### Requirement: Lightweight video SHALL fill the owning content box

Canvas and other lightweight video consumers SHALL use the Preview-owned canonical video element.
The video element SHALL occupy the full width and height of the owning preview content box while
preserving the source picture ratio through `object-fit: contain`. Native controls SHALL therefore
align to the same content-box boundary as the node or lightweight preview frame rather than an
intrinsic-size media element nested inside it.

#### Scenario: Video aspect ratio differs from the Canvas node

- **WHEN** a Canvas video node is wider or taller than the source video's intrinsic aspect ratio
- **THEN** the media field remains the exact size of the node content box and the picture is letterboxed without distortion
- **AND** the native control bar aligns with the bottom of that content box instead of floating above unused node space
