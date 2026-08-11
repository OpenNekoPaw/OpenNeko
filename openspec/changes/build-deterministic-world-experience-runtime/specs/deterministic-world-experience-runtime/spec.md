## ADDED Requirements

### Requirement: Deterministic Experience runtime has one event authority

The runtime SHALL validate each owner-qualified intent and commit ordered events through the exact owning service. Renderer, adapter, projection, checkpoint and replay code MUST NOT commit semantic facts.

#### Scenario: Commit a World action

- **WHEN** an authorized participant submits an action against the current revision
- **THEN** World runtime validates it, commits one ordered event and rebuilds state/view projections from committed facts

### Requirement: Save and replay preserve exact identity

A Save SHALL bind an immutable Experience baseline, Run, branch and ordered committed history. Replay SHALL reproduce authoritative state without a model call or fallback data source.

#### Scenario: Provider is unavailable during replay

- **WHEN** a valid Save is replayed with no AI provider configured
- **THEN** committed state is reproduced and no provider request is attempted
