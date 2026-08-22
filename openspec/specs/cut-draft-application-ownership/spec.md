# cut-draft-application-ownership Specification

## Purpose
TBD - created by archiving change close-p1-domain-boundary-gaps. Update Purpose after archive.
## Requirements
### Requirement: Cut owns canonical draft planning

The Cut application owner SHALL derive a unique draft label, transient draft document identity, Cut view identity, and Cut session identity from an exact authorized owner and caller-provided identity source. Desktop SHALL NOT independently construct those business values.

#### Scenario: Duplicate draft labels

- **WHEN** a new draft is planned while the base label and numbered labels already exist
- **THEN** Cut selects the first available canonical numbered label and produces one exact transient draft document identity; only an explicit Save As later creates a durable relative `.otio` identity

### Requirement: Cut draft creation is one transaction

The Cut application service SHALL create the draft session before opening its presentation and SHALL discard that exact session if presentation opening fails. A failed transaction SHALL NOT leave a successful hidden session or presentation path.

#### Scenario: Presentation opening fails

- **WHEN** session creation succeeds and the Desktop presentation port rejects
- **THEN** Cut discards the exact created session and propagates the original failure

### Requirement: Cut owns Canvas handoff policy

The Cut application owner SHALL decide whether an authorized Canvas source targets a new Cut draft or an existing active Cut view, validate exact Project, Workspace, and View instance ownership, and own the typed handoff payload codec.

#### Scenario: No active Cut view

- **WHEN** an authorized Canvas source has no active Cut view in its exact Workbench
- **THEN** Cut returns a new-draft target for that Workbench

#### Scenario: Exact active Cut view

- **WHEN** the active Cut view matches the source Project, Workspace, and View instance and has the canonical session owner
- **THEN** Cut returns the exact existing target

#### Scenario: Stale or cross-owner active Cut view

- **WHEN** an active Cut candidate belongs to another Project, Workspace, View instance, document, or session owner
- **THEN** Cut rejects the handoff without creating or selecting another target
