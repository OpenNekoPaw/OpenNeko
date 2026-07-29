## ADDED Requirements

### Requirement: VS Code product uses one extension package
The VS Code product SHALL have exactly one extension manifest, one Extension Host entry point, one real `ExtensionContext`, and one final platform VSIX. Internal OpenNeko features MUST NOT expose independent extension manifests, activation entry points, extension identities, or build-only VSIX payloads.

#### Scenario: Inspect the VS Code application
- **WHEN** the VS Code product source and generated manifest are inspected
- **THEN** `apps/neko-vscode` SHALL be the only OpenNeko extension application
- **AND** Tools, Preview, Assets, Cut, Canvas, and Agent SHALL be application feature modules rather than embedded or separately activatable extensions

#### Scenario: Package a supported platform
- **WHEN** the platform packaging command succeeds
- **THEN** it SHALL create one `OpenNeko-<platform>-<version>.vsix`
- **AND** it SHALL NOT create, extract, stage, or publish an internal feature VSIX

### Requirement: Workspace packages have one physical level
The pnpm workspace SHALL discover applications from `apps/*` and reusable packages from `packages/*` only. It MUST NOT discover `packages/*/packages/*`, feature-local `test-utils` workspaces, or other second-level workspace packages.

#### Scenario: Inspect workspace configuration
- **WHEN** the canonical workspace globs and package manifests are inspected
- **THEN** every workspace package SHALL be an immediate child of `apps/` or `packages/`
- **AND** no parent feature package SHALL act as both an extension package and a container for child workspaces

#### Scenario: Classify a former nested package
- **WHEN** a former nested package is used by Desktop, TUI, multiple features, or multiple runtime adapters
- **THEN** it SHALL become a top-level reusable package or be merged into its owning top-level domain package
- **AND** a VS Code-only adapter SHALL instead become an internal module of `apps/neko-vscode`

### Requirement: Runtime boundaries remain explicit inside the single package
The single extension package SHALL preserve separate Extension Host, Webview browser, host-neutral domain/runtime, and Node/native boundaries. Combining extension ownership MUST NOT permit Webviews to import Node or VS Code APIs, reusable packages to import `apps/neko-vscode`, or Extension Host code to import React rendering implementations.

#### Scenario: Build Extension Host and Webview entries
- **WHEN** application bundles are built
- **THEN** Extension Host entries SHALL target Node and may import `vscode`
- **AND** Webview entries SHALL target the browser and MUST communicate with the Extension Host through owned message contracts

#### Scenario: Reuse a feature outside VS Code
- **WHEN** Desktop or TUI consumes Agent, Canvas, Cut, Preview, or another reusable capability
- **THEN** it SHALL import a top-level host-neutral domain/runtime/UI package
- **AND** it SHALL NOT import a VS Code feature module or application-internal adapter

### Requirement: Host Kernel owns composition without becoming a service locator
`apps/neko-vscode` SHALL contain a thin Host Kernel that owns registration order, lazy capability state, diagnostics, cancellation, and reverse-order disposal. Each feature SHALL receive only the `ExtensionContext` projection primitives and explicitly typed dependency ports it actually requires; features MUST NOT receive a universal Host services bag, query a global capability registry, or import sibling feature adapter implementations. Registration metadata and actual dependency injection MUST derive from one typed composition definition, or tests MUST prove their edges are identical in both directions.

#### Scenario: Register a feature
- **WHEN** the Host Kernel registers a feature
- **THEN** the application composition root SHALL pass the feature's declared typed dependencies directly
- **AND** the feature SHALL return its owned disposables and any explicitly exported typed port

#### Scenario: Detect an invalid feature graph
- **WHEN** feature identifiers are duplicated, a required dependency is absent, or the dependency graph contains a cycle
- **THEN** application activation SHALL fail with a diagnostic containing the invalid identities or dependency chain
- **AND** it SHALL NOT use registration order, active-feature state, or a fallback registry to conceal the contract violation

#### Scenario: Compare metadata with typed wiring
- **WHEN** architecture tests inspect the feature registration graph
- **THEN** every metadata dependency edge SHALL correspond to one actual typed injection edge and vice versa
- **AND** a manually maintained descriptor graph MUST NOT become a second dependency source

### Requirement: Host-neutral contracts stay narrow
`@neko/host` SHALL remain a host-neutral package and MUST NOT import VS Code, Electron, Node runtime implementations, React, or product domain packages. Feature-specific operations SHALL be represented by consumer-owned narrow ports or domain-owned contracts rather than adding unrelated methods to a shared Host interface.

#### Scenario: Add a VS Code capability
- **WHEN** a feature requires workspace IO, commands, dialogs, Webview creation, secrets, or another VS Code operation
- **THEN** its VS Code adapter SHALL implement the narrow port required by that feature
- **AND** the port SHALL expose only the lifecycle and error semantics needed by that consumer

#### Scenario: Inspect feature dependencies
- **WHEN** architecture checks inspect the single extension
- **THEN** no feature SHALL depend on the complete Host Kernel or a mutable application-wide services object
- **AND** cross-feature dependencies SHALL be visible in the composition root and tests

### Requirement: Registration and lazy capability failures have distinct semantics
Contract, graph, state-migration, manifest, required runtime-closure, or lightweight feature-registration failures MUST fail extension activation visibly and roll back acquired registration resources. Heavy AI, generation, metadata, media, and similar runtimes SHALL be represented by owner-scoped lazy capabilities. A recoverable lazy-capability initialization failure SHALL disable only that capability and its transitive capability dependents, expose an unavailable diagnostic, and leave registered independent surfaces operational.

#### Scenario: Feature registration fails
- **WHEN** a feature throws while registering its manifest-backed commands, views, editors, or providers
- **THEN** the Host Kernel SHALL dispose its and previously acquired registration resources in reverse order
- **AND** extension activation SHALL reject instead of reporting a partially registered product

#### Scenario: Lazy capability initialization fails
- **WHEN** a lazy capability throws a recoverable error during first-use initialization
- **THEN** the Host Kernel SHALL dispose that capability's partially acquired resources
- **AND** it SHALL mark that capability and its transitive capability dependents unavailable with the causal diagnostic
- **AND** registered surfaces that do not depend on the failed capability SHALL remain operational
- **AND** an invocation that requires the failed capability SHALL return an explicit unavailable diagnostic rather than an empty result, successful no-op, or legacy fallback

#### Scenario: Kernel contract is invalid
- **WHEN** the application detects an invalid graph, unsafe state migration, missing required runtime, or manifest/implementation mismatch
- **THEN** the extension SHALL fail activation visibly
- **AND** it SHALL NOT report a partially valid product as successfully initialized

#### Scenario: Failure escapes process isolation
- **WHEN** native code crashes, the Extension Host process terminates, or the event loop is irrecoverably blocked
- **THEN** the application SHALL NOT claim feature-level recovery
- **AND** release documentation and diagnostics SHALL distinguish process-fatal failures from catchable feature failures

### Requirement: Feature resource ownership is deterministic
Each feature SHALL own a stable resource namespace and disposable scope under the application. Webview, localization, media, native, and runtime dependency paths MUST be derived from the application extension root plus declared feature resource metadata, not from a simulated child `ExtensionContext` or extracted child extension root.

#### Scenario: Resolve a feature Webview asset
- **WHEN** a feature creates a Webview
- **THEN** it SHALL resolve its built assets through the feature resource metadata and `webview.asWebviewUri()`
- **AND** the resolved file SHALL exist within the final extension package

#### Scenario: Deactivate the application
- **WHEN** the extension deactivates or activation rolls back
- **THEN** acquired feature resources SHALL be disposed in reverse dependency order
- **AND** disposal failures SHALL be aggregated into visible diagnostics

### Requirement: Final packaging composes source outputs directly
The platform packager SHALL build the application entry, feature modules, Webview bundles, localization, media, Node runtime dependencies, and target-native closure directly into one deterministic staging tree. It MUST reject missing assets, duplicate contribution identities, cross-target binaries, unresolved internal imports, and files that resolve outside the staging root.

#### Scenario: Build a valid package
- **WHEN** all declared outputs and target-native dependencies are present
- **THEN** the packager SHALL generate the final manifest and VSIX from the direct staging tree
- **AND** package inspection SHALL map each retained contribution and asset to one owning feature

#### Scenario: Detect incomplete closure
- **WHEN** a required bundle, resource, localization key, native dependency, or declared runtime module is missing or resolves outside the staging root
- **THEN** packaging SHALL fail before VSIX creation with the owning feature and missing path or specifier

### Requirement: Existing user state is migrated without silent loss
The migration SHALL define a versioned mapping for every retained scoped memento key, secret key, workspace-storage path, global-storage path, cache, and persisted feature setting. Historical `neko.<feature>` values MAY be preserved as durable `StateNamespaceId` values, but they MUST be independent from installable extension identity and MUST NOT participate in extension discovery. The migration MUST reuse a stable identity or perform an explicit idempotent migration, and MUST NOT silently discard, overwrite, or ambiguously merge user data.

#### Scenario: Migrate legacy scoped state
- **WHEN** the single-context application first encounters a supported legacy state version
- **THEN** it SHALL migrate or reuse each mapped value exactly once
- **AND** it SHALL record the completed migration version only after all atomic steps succeed

#### Scenario: Preserve a historical namespace value
- **WHEN** an existing memento, secret, or storage path uses a historical internal extension ID string
- **THEN** the application MAY retain the exact string as a `StateNamespaceId`
- **AND** no feature SHALL use that state namespace to resolve, install, or discover an extension

#### Scenario: State migration cannot complete safely
- **WHEN** legacy data is malformed, the destination conflicts, or an atomic migration step fails
- **THEN** activation of the affected state owner SHALL fail with a recovery diagnostic
- **AND** the source data SHALL remain available for retry or explicit user-directed cleanup

### Requirement: Architecture and runtime tests prove the canonical path
Validation SHALL prove both the resulting behavior and the execution path. Repository checks MUST reject nested workspaces, embedded feature registries, simulated scoped contexts, internal feature activation entry points, temporary feature VSIX assembly, sibling feature adapter imports, and forbidden runtime-layer imports.

#### Scenario: Validate repository boundaries
- **WHEN** architecture and legacy-debt checks run
- **THEN** they SHALL pass only when all VS Code features use the single application composition path
- **AND** poisoned legacy registry, context, and packaging paths SHALL remain unreachable

#### Scenario: Validate installed VSIX
- **WHEN** the final VSIX is installed in an isolated Extension Development Host without repository `node_modules`
- **THEN** retained contributions SHALL activate through the Host Kernel
- **AND** Webview messaging, Node/FFmpeg and target-native runtime readiness, capability diagnostics, resource resolution, and reverse disposal SHALL be validated on the real VS Code host
