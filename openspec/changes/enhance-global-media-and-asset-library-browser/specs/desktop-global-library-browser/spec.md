## ADDED Requirements

### Requirement: Global libraries support list and grid presentation

The Desktop global Media Library and Asset Library SHALL render through one Assets-owned browser
presentation that supports list and grid modes. Changing presentation MUST NOT change catalog
identity, search, sort, selection, directory context, or owning filesystem facts.

#### Scenario: Switch Media Library presentation

- **WHEN** the user switches a Media Library result from grid to list
- **THEN** the same projected items, active directory, search, sort, and selection are rendered as rows
- **AND** no new catalog, file scan owner, or duplicate item identity is created

#### Scenario: Switch Asset Library presentation

- **WHEN** the user switches an Asset Library result from list to grid
- **THEN** the same projected assets are rendered as fixed-size thumbnail tiles
- **AND** loading, missing thumbnails, labels, and actions do not resize or reorder the collection

#### Scenario: Restore the preferred presentation

- **WHEN** the global library browser is reopened
- **THEN** it uses the canonical Resource Browser view preference
- **AND** it does not create a second Home-only preference or storage path

### Requirement: Dot-prefixed content remains hidden

The global library browser SHALL exclude every file or directory whose basename starts with `.`
from root browsing, child browsing, bounded recursive search, thumbnail requests, and Asset Library
membership projection. The same visibility rule MUST run before content classification or metadata
projection.

#### Scenario: Browse a directory containing hidden entries

- **WHEN** a connected directory contains `.DS_Store`, `.cache`, visible files, and visible directories
- **THEN** only the visible entries are projected
- **AND** no hidden entry receives an item identity, thumbnail descriptor, or action

#### Scenario: Search below a hidden directory

- **WHEN** a bounded recursive search encounters a dot-prefixed directory
- **THEN** the search does not descend into that directory
- **AND** files below it cannot appear through a flattened search result

#### Scenario: Browse nested visible content

- **WHEN** a visible directory contains another visible directory or file
- **THEN** the entry remains available through the ordinary immediate-child browsing path
- **AND** the hidden-entry policy does not flatten or suppress visible hierarchy

### Requirement: Directories use canonical activation

Available Media Library roots and directories SHALL use single-click selection and double-click or
keyboard activation for navigation. The normal collection MUST NOT render a separate browse or open
directory button.

#### Scenario: Open a directory with the pointer

- **WHEN** the user double-clicks an available Media Library root or directory
- **THEN** the browser reads and displays that directory's immediate visible children
- **AND** the breadcrumb identifies the owning connection and relative directory

#### Scenario: Open a directory with the keyboard

- **WHEN** keyboard focus is on an available Media Library root or directory and the user presses Enter
- **THEN** the browser performs the same navigation as double-click
- **AND** focus moves to a deterministic location in the opened directory

#### Scenario: Select without opening

- **WHEN** the user single-clicks a root or directory
- **THEN** the browser changes only the selection
- **AND** it does not dispatch duplicate child reads or reveal the directory in the host file manager

#### Scenario: Manage a connection

- **WHEN** the user invokes reveal, relink, or remove for a Media Library connection
- **THEN** the browser uses an explicit menu command distinct from directory activation
- **AND** a double-click never performs a connection mutation

### Requirement: Supported content projects stable thumbnails

Image and video items in Media Library and Asset Library SHALL project revisioned thumbnail
descriptors and render resolved thumbnails in their list icon or grid tile. Directories, audio,
documents, models, unsupported formats, and thumbnail failures SHALL retain a stable typed icon
without being represented as successful thumbnails.

#### Scenario: Resolve an image thumbnail

- **WHEN** a visible image item enters the bounded thumbnail viewport
- **THEN** Renderer requests the exact item descriptor and a fixed icon-size variant
- **AND** Host resolves the current item within its owning root before returning browser-safe image data

#### Scenario: Resolve a video thumbnail

- **WHEN** a visible video item requests a thumbnail
- **THEN** the media runtime extracts a deterministic static frame for the exact current file revision
- **AND** Renderer does not receive a source path, FFmpeg command, process handle, or unrestricted URL

#### Scenario: Content revision changes

- **WHEN** the source modified time or byte length changes
- **THEN** the projected thumbnail revision changes
- **AND** a stale thumbnail result cannot replace the current item thumbnail

#### Scenario: Thumbnail is unsupported

- **WHEN** an item kind has no supported thumbnail representation or thumbnail generation fails
- **THEN** the browser keeps its typed icon and exposes a bounded unavailable state
- **AND** it does not fabricate a thumbnail, reuse another item, or turn the catalog request into an error

### Requirement: Hover preview is static and cancellable

Hovering or keyboard-focusing a thumbnail-capable global library item SHALL, after a bounded delay,
request a fixed larger static thumbnail variant. Hover preview MUST NOT autoplay audio or video,
open a Workbench Preview View, mutate selection, or persist playback state.

#### Scenario: Hover a thumbnail-capable item

- **WHEN** the pointer remains over an image or video item past the hover delay
- **THEN** the browser renders a larger anchored static preview without shifting collection layout
- **AND** the preview remains associated with that exact item and descriptor revision

#### Scenario: Leave before resolution

- **WHEN** the pointer leaves, focus moves, the facet changes, or the Root unmounts before preview resolution
- **THEN** pending work is cancelled or fenced and the hover surface is removed
- **AND** a late result cannot appear over another item

#### Scenario: Hover unsupported content

- **WHEN** the user hovers a directory, audio file, document, model, or unsupported format
- **THEN** no static hover thumbnail request is sent
- **AND** the stable item icon and normal actions remain available

### Requirement: Global library requests remain sender-bound

Global library search, children, thumbnail, import, remove, reveal, and connection mutations SHALL
use exact versioned contracts and the current Window endpoint identity. Renderer-facing projections
MUST NOT expose absolute paths, physical link targets, credentials, cache paths, trash paths,
Webview URLs, or media process details.

#### Scenario: Resolve the current item

- **WHEN** Renderer requests children, a thumbnail, or an item mutation
- **THEN** Main validates the sender, endpoint epoch, catalog revision, item identity, owner root, and containment
- **AND** it resolves the physical path only inside the Host boundary

#### Scenario: Submit a stale item

- **WHEN** a request uses an item identity, catalog revision, or thumbnail revision that is no longer current
- **THEN** Main rejects the request visibly before filesystem or preview effects
- **AND** it does not fall back to a same-named item, active Project, recent directory, or legacy Home payload

### Requirement: Desktop lifecycle and density remain stable

The package-owned global library Root SHALL remain active across React StrictMode effect replay and
SHALL release its instance controller exactly once after a real unmount. Within Desktop Home it SHALL
render as a compact, unframed, full-height workbench surface whose controls and collection do not
overlap at supported widths.

#### Scenario: StrictMode replays mount effects

- **WHEN** React performs setup, cleanup, and setup for the same development mount
- **THEN** the active Root completes its catalog read without a disposed-controller diagnostic
- **AND** the controller is retained only for that instance and disposed after the real unmount

#### Scenario: Render inside Desktop Home

- **WHEN** the global library occupies the Home main viewport
- **THEN** its title, toolbar, commands, diagnostics, and collection use the compact workbench density
- **AND** the Root does not introduce an outer floating card or excessive page-level whitespace

#### Scenario: Render at a narrow supported width

- **WHEN** the header and toolbar cannot remain on one line
- **THEN** command groups wrap while search retains a usable full row
- **AND** labels, controls, and collection content do not overlap
