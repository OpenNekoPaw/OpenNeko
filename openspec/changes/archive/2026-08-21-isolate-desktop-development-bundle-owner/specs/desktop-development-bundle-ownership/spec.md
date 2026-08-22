## ADDED Requirements

### Requirement: Desktop Vite output has one live writer

Every canonical Desktop Forge command SHALL acquire exclusive ownership for the current repository checkout before Electron Forge can delete or write the shared `.vite` output. A second canonical development or package build MUST fail visibly while the owner process is alive and MUST NOT start Forge or mutate the active output.

#### Scenario: Functional scenario starts while a developer app is running

- **WHEN** one canonical Desktop development command owns the checkout and a functional scenario requests another development launch
- **THEN** the second launch returns an explicit ownership conflict before Electron Forge starts
- **AND** the active process and its `.vite` files remain unchanged

#### Scenario: Separate checkout starts development

- **WHEN** Desktop development starts from a different canonical repository checkout
- **THEN** it uses a distinct owner identity
- **AND** the other checkout does not block or share its Vite output

#### Scenario: Package build starts while a developer app is running

- **WHEN** one canonical Desktop development command owns the checkout and `build`, `package`, or `make` is requested
- **THEN** the package construction fails before Electron Forge writes `.vite`
- **AND** the running Electron Main retains a coherent lazy-chunk graph

### Requirement: Ownership recovery is exact and fail-visible

The development launcher SHALL reclaim a well-formed owner record only after the recorded process is no longer alive. It SHALL reject malformed or unreadable ownership state, and release SHALL remove a record only when its ownership token matches the current launcher.

#### Scenario: Previous launcher terminated without cleanup

- **WHEN** a well-formed owner record names a process that no longer exists
- **THEN** the next canonical launch removes that stale record and acquires ownership
- **AND** it starts the same Electron Forge development path once

#### Scenario: Older launcher exits after ownership changed

- **WHEN** an older launcher attempts cleanup after the owner record contains another token
- **THEN** it leaves the newer owner record unchanged

#### Scenario: Owner record is malformed

- **WHEN** the launcher cannot validate the existing owner record
- **THEN** it reports a build-ownership diagnostic and does not start Forge
- **AND** it does not guess that the record is stale or delete `.vite`

### Requirement: Canonical Desktop commands preserve launch semantics

The `@neko/app-desktop dev`, `build`, `package`, and `make` commands SHALL remain the public entries used by root development, packaging, and functional scenarios. After ownership succeeds, the launcher SHALL invoke exactly the explicitly requested Forge command, forward arguments and environment, and propagate its terminal status. Execution of an already-built packaged Desktop artifact SHALL remain outside bundle ownership.

#### Scenario: Development launch acquires ownership

- **WHEN** no live owner exists and `@neko/app-desktop dev -- <args>` is invoked
- **THEN** the launcher invokes `electron-forge start <args>` exactly once with inherited environment and IO
- **AND** releases its token-fenced ownership when the child terminates

#### Scenario: Packaged functional scenario starts

- **WHEN** the Desktop functional runner selects a fingerprint-verified packaged executable
- **THEN** it starts that executable directly without acquiring the development bundle owner

#### Scenario: Package construction acquires ownership

- **WHEN** no live owner exists and `@neko/app-desktop package` is invoked
- **THEN** the launcher invokes `electron-forge package` exactly once
- **AND** it retains ownership until package construction terminates
