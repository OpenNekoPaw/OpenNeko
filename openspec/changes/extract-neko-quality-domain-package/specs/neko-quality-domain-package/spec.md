## ADDED Requirements

### Requirement: Canonical Quality runtime has one neutral package owner

The system MUST provide `@neko/quality` as the only owner of canonical Quality profile selection, evaluator/materializer ports, revision-bound evidence validation and Gate aggregation. Quality core MUST depend only on shared contracts and MUST NOT depend on Agent runtime, Platform, Extension, VS Code, React, Content or a concrete creative domain.

#### Scenario: Agent invokes canonical Quality Gate

- **WHEN** the Agent `QualityCheck` Tool receives a valid revision-bound `QualityTarget`
- **THEN** its thin Capability adapter delegates Gate execution to `@neko/quality/core`
- **AND** no Agent-owned Gate runtime or compatibility export participates

#### Scenario: Canonical target is invalid

- **WHEN** a request uses a path-only legacy target or lacks canonical resource/project identity
- **THEN** the Quality path fails visibly
- **AND** it does not invoke a deprecated MediaQuality runtime or silently convert the input

### Requirement: Model evaluator produces evidence without owning provider policy

The system MUST expose the reusable multimodal Quality evaluator through `@neko/quality/model`. The evaluator MUST receive an injected model service and explicit provider/model identity, MUST produce revision-bound `QualityEvidence`, and MUST NOT read provider configuration, credentials or project files.

#### Scenario: Image perception model is configured

- **WHEN** the Host supplies the `image.understand` purpose-model snapshot for an image review
- **THEN** the Agent adapter projects it into the Quality model port
- **AND** the resulting evidence records the supplied provider/model identity
- **AND** Gate aggregation uses that evidence

#### Scenario: Image perception model is unavailable

- **WHEN** no `image.understand` purpose model is available
- **THEN** the Gate reports missing perception evidence and requires manual review according to policy
- **AND** it does not substitute the chat model or fabricate perception success

### Requirement: Project Quality orchestration preserves domain ownership

The system MUST expose neutral ProjectQuality facade orchestration through `@neko/quality/project`. It MUST call the facade supplied by the owning package and MUST NOT import or duplicate a domain project parser, project IO implementation, repair writer or Extension implementation.

#### Scenario: Owning project facade is available

- **WHEN** a project-artifact target resolves to an owning `ProjectQualityFacade`
- **THEN** the orchestrator projects structural, runtime and export-readiness results into canonical evidence
- **AND** the owning facade remains authoritative for project facts

#### Scenario: Owning project facade is unavailable

- **WHEN** no owning facade resolves for a project-artifact target
- **THEN** orchestration fails visibly with an unavailable-facade diagnostic
- **AND** it does not parse the project or fall back to Agent content materialization

### Requirement: Retired Quality paths cannot remain successful

The system MUST remove the Agent-owned deprecated `MediaQualityRuntime`, Consistency runtime, Tool-name remediation planner, review validation adapter, old Quality barrel and project orchestration file. It MUST also remove the unused shared `types/quality/qa-types` score, path and Tool-name remediation DTO. No compatibility alias, re-export or fallback MAY keep those paths reachable.

#### Scenario: Repository boundary validation runs

- **WHEN** Quality package architecture tests inspect retired paths and public entries
- **THEN** every retired Agent runtime path is absent
- **AND** core, model and project behavior is reachable only through the explicit `@neko/quality` entries
