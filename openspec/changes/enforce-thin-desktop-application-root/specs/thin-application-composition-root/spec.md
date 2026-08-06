## ADDED Requirements

### Requirement: Desktop application remains a thin executable composition root

The repository SHALL keep `apps/neko-desktop` as the canonical executable Electron application
root, and that root SHALL own only Electron lifecycle and security boundaries, typed IPC and
preload projection, concrete Host adapters, product-shell composition, packaging, and real Desktop
acceptance fixtures.

#### Scenario: Electron-specific adapter remains in the application root

- **WHEN** a component directly owns BrowserWindow, webContents sender authorization, native dialog,
  Electron protocol, fuse, or application shutdown lifecycle
- **THEN** it remains in `apps/neko-desktop` behind the smallest package-owned port required by the
  product path

#### Scenario: Application directory is not moved into packages

- **WHEN** Desktop is the only current product Host
- **THEN** the repository retains `apps/neko-desktop` and does not reclassify the executable as a
  reusable `packages/*` capability

### Requirement: Business behavior is owned by a first-level package

The repository SHALL assign every domain rule, business state machine, business validation,
configuration resolution, data transformation, recovery plan, synchronization policy, authoring
transaction, and portable workflow to the applicable first-level `packages/*` workspace and expose
it through a public contract or application port. This requirement applies even when Desktop is the
only current consumer.

#### Scenario: Host-neutral business service is discovered under apps

- **WHEN** logic under `apps/neko-desktop` can execute against injected ports without Electron objects
  and determines a domain outcome
- **THEN** its contract, implementation, state, errors, and authoritative tests are assigned to the
  owning package, while Desktop retains only its concrete adapter and composition

#### Scenario: A feature has only one Desktop consumer

- **WHEN** a business responsibility has a stable owning domain but no TUI, VS Code, or second Host
  consumer
- **THEN** the responsibility is still placed in the owning package and no speculative multi-Host
  framework is introduced

### Requirement: Desktop adapters do not become parallel business owners

Desktop handlers and adapters SHALL limit their behavior to trust-boundary decoding and validation,
identity binding, native resource authorization, calling package public ports, projecting results,
and releasing resources. They MUST NOT duplicate package business contracts, select domain policy,
or maintain a second successful implementation path.

#### Scenario: IPC request reaches a domain operation

- **WHEN** Main receives a valid sender-bound request for a Canvas, Cut, Agent, Assets, Media, or other
  domain operation
- **THEN** the handler delegates to the owning package public application port and performs no domain
  calculation beyond boundary validation and result projection

#### Scenario: A business path is migrated from apps

- **WHEN** callers switch to the package-owned implementation
- **THEN** the former app-owned implementation is deleted, and import/export/registration assertions
  prove it cannot return success through compatibility, fallback, or dual-write behavior

### Requirement: Existing application-layer drift is explicitly governed

The repository SHALL treat existing business logic under `apps/neko-desktop` as architecture drift
rather than precedent. An active OpenSpec inventory MUST record each candidate responsibility,
current path, target owner, target public entry, lifecycle, migration boundary, old-path removal
condition, and verification evidence before migration.

#### Scenario: Existing mixed-responsibility runtime is touched

- **WHEN** a change materially modifies a Desktop runtime that mixes Electron adaptation with business
  state or policy
- **THEN** the change either separates the package-owned responsibility in scope or records an
  explicit owner, blocker, and migration task without expanding the app-owned business surface

#### Scenario: No clear package owner exists

- **WHEN** an app-owned business responsibility spans domains and has no accepted owner
- **THEN** an OpenSpec establishes the neutral responsibility and dependency direction before code is
  moved, and the implementation is not placed into a catch-all Desktop core package

### Requirement: Application-boundary verification covers ownership and execution path

Changes that add, modify, or migrate Desktop behavior SHALL verify dependency topology, owning
responsibility, package producer and Desktop consumer behavior, and the canonical execution path.
Electron IPC, window, security, focus, or user-resource behavior MUST additionally be validated in a
real Electron runtime.

#### Scenario: New Desktop production module is reviewed

- **WHEN** production code is added under `apps/neko-desktop`
- **THEN** review evidence explains why the responsibility requires the Application layer, which
  package contracts it composes, and why it is not a host-neutral business implementation

#### Scenario: Business behavior is extracted to a package

- **WHEN** a migration is proposed as complete
- **THEN** package tests prove the business behavior, Desktop tests prove adapter delegation, boundary
  checks prove dependency direction, and path assertions prove the legacy app-owned implementation did
  not participate
