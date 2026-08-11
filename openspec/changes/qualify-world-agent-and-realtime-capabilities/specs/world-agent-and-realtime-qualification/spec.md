## ADDED Requirements

### Requirement: World AI uses the canonical Agent session path

Each World AI role SHALL use the existing AgentSession owner for turns, tools, approvals, streaming and cancellation. World SHALL provide only authorized context and SHALL accept only typed proposals through the exact owning boundary.

#### Scenario: Director proposes a state change

- **WHEN** a Director turn returns a proposed semantic change
- **THEN** the proposal remains untrusted until World runtime validates it against the exact Run and revision

### Requirement: Realtime capability failure cannot select another path

A missing, unqualified, interrupted or late realtime capability SHALL fail the affected request/profile visibly and MUST NOT switch provider, model, purpose, profile or semantic source.

#### Scenario: A cancelled stream emits a late chunk

- **WHEN** a provider emits output after the bound turn is cancelled
- **THEN** the chunk is rejected and cannot update presentation or commit facts
