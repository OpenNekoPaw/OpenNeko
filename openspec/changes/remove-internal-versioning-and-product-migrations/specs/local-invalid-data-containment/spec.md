## ADDED Requirements

### Requirement: Invalid data fails at the smallest owning boundary

Contract and persisted-data validation SHALL reject only the smallest identifiable record, message, operation, component instance, sender, session, or workspace. A failure MUST produce an owning diagnostic and MUST NOT clear shared valid state or disable unrelated capabilities, projects, workspaces, or the Desktop application.

#### Scenario: One component record is invalid

- **WHEN** a component restores multiple independently owned records and one record is malformed
- **THEN** the component excludes only that record, reports its identity, and restores the remaining valid records

#### Scenario: One IPC request is invalid

- **WHEN** Main or preload receives a malformed request from one sender
- **THEN** only that request fails and other routes, senders, windows, and workspaces remain operational

### Requirement: Batch and registry loading isolate entries

Catalogs, registries, projections, and batch readers SHALL validate entries independently whenever an entry identity is available. An invalid entry MUST NOT cause a successful empty result that hides the failure and MUST NOT abort unrelated entries.

#### Scenario: One media projection entry is invalid

- **WHEN** Media Library reads a projection containing one malformed entry and valid sibling entries
- **THEN** it returns the valid siblings plus a diagnostic for the malformed identity and keeps the current workspace usable

#### Scenario: One package registration is invalid

- **WHEN** a registry loads one invalid package or capability beside valid registrations
- **THEN** it rejects only that registration and exposes the diagnostic without disabling the valid capabilities

### Requirement: Local failure containment is tested end to end

Every changed owner SHALL test both the rejecting boundary and an unaffected sibling path. Electron trust-boundary changes MUST additionally prove the failure stays within the current request, sender, or authorized resource.

#### Scenario: Component decoder regression test runs

- **WHEN** a test supplies one invalid component record beside a valid sibling surface
- **THEN** it asserts the diagnostic is visible, the sibling remains mounted, and no global unavailable state is entered

#### Scenario: Electron sender validation fails

- **WHEN** a real or integration Electron path rejects one sender-bound request
- **THEN** another authorized request and unrelated surface continue to succeed

### Requirement: Desktop render failures remain surface-local

Desktop SHALL protect the renderer root and every independently composed Workbench Surface with
the shared UI ErrorBoundary contract. A synchronous render failure in Preview, Resource Browser,
Asset Management, Extension Management, Project Management, Settings, or another slot-owned Root
MUST replace only the smallest protected Surface with an explicit retry diagnostic. It MUST NOT
unmount the PrimarySidebar, the window Workbench, sibling slots, or retained Surface instances.

#### Scenario: One Workbench Surface throws during render

- **WHEN** one active slot-owned Surface throws synchronously while a sibling Surface is mounted
- **THEN** the failing slot displays an accessible diagnostic and retry action
- **AND** the PrimarySidebar, Workbench, sibling Surface, and retained inactive instances remain mounted

#### Scenario: A failure escapes every Surface boundary

- **WHEN** an unexpected synchronous render error occurs above the Workbench Surface composition
- **THEN** the Desktop renderer root displays a visible fatal diagnostic and retry action
- **AND** the window does not become an unexplained blank renderer
