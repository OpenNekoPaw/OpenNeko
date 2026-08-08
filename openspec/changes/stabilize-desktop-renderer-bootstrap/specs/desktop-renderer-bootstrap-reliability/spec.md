## ADDED Requirements

### Requirement: Renderer workspace imports use canonical source identity

Desktop development SHALL derive internal public import identities from the canonical workspace package manifests and SHALL resolve every matching import to its real workspace source identity before Vite dependency classification. A live workspace source module MUST NOT be served through a consumer-local `node_modules` identity or an immutable dependency URL.

#### Scenario: Canvas domain export changes during development

- **WHEN** a Canvas Webview imports the `@neko/canvas-domain` public entry after its export surface changes
- **THEN** Vite resolves the import to the canonical `packages/canvas/domain` source identity without a dependency browser-hash query
- **AND** an application restart or normal reload cannot reuse an older immutable Canvas domain export surface

#### Scenario: Third-party dependency remains optimized

- **WHEN** Renderer code imports a configured third-party dependency
- **THEN** Vite retains its normal optimized dependency identity and cache behavior
- **AND** the workspace canonicalization path does not claim that dependency

#### Scenario: Undeclared internal subpath is imported

- **WHEN** Renderer code imports an `@neko/*` subpath that is absent from the owning package exports map
- **THEN** the canonical catalog does not manufacture an entry for it
- **AND** Vite resolution fails visibly instead of routing to a package internal file

### Requirement: Pre-React startup failures are visible and retryable

Desktop SHALL load the React application through a minimal bootstrap boundary that catches application module import and initialization rejection before React mounts. The bootstrap SHALL render a localized diagnostic in the existing root and SHALL offer an explicit retry of the same canonical application entry without clearing user data or selecting another source.

#### Scenario: Application module linking fails

- **WHEN** the canonical application module rejects during ESM import or linking
- **THEN** the Desktop window displays a startup failure title, diagnostic, and retry action instead of an empty document
- **AND** no React, domain Webview, preload replacement, or alternate application entry is reported as successfully mounted

#### Scenario: Renderer initialization rejects

- **WHEN** the application module loads but sender-bound bootstrap or settings initialization rejects
- **THEN** the same pre-React startup diagnostic displays the rejection
- **AND** retry reloads the same Desktop page and preserves durable user data

#### Scenario: Application starts normally

- **WHEN** the application module loads and its mount operation resolves
- **THEN** the canonical React Desktop Root renders exactly once
- **AND** the startup failure presentation is absent

### Requirement: Canvas module failures remain local to the Canvas Surface

Desktop SHALL load the Canvas Webview Root inside the Canvas Surface presentation boundary. A Canvas Webview import or render failure SHALL be handled by the owning workbench slot error boundary and MUST NOT prevent the Desktop Shell, Agent interaction, or sibling visible slots from rendering.

#### Scenario: Canvas Webview import rejects

- **WHEN** the active Canvas Surface cannot load `@neko/canvas-webview/root`
- **THEN** the Canvas workbench slot displays its localized Surface failure diagnostic and retry action
- **AND** the Desktop Shell, Agent interaction, and sibling resource slot remain visible and operable

#### Scenario: Canvas Webview loads asynchronously

- **WHEN** the active Canvas Surface is waiting for its canonical Webview Root
- **THEN** the slot displays a stable localized Canvas loading state
- **AND** loading content does not resize or overlap the surrounding workbench layout
