## ADDED Requirements

### Requirement: Analysis claims follow observed scope

The Agent SHALL base analysis claims only on inputs and Tool/runtime observations actually available in the current Turn. It MUST NOT describe inferred, planned, named, or merely referenced content as observed evidence.

#### Scenario: Requested source is not observable

- **WHEN** an analysis request names a source or segment that the current Turn cannot observe
- **THEN** the Agent identifies that source or segment as unobserved or unavailable
- **AND** it does not invent findings for that source or treat its name, path, label, or expected content as evidence

### Requirement: Broad analysis discloses material coverage limits

When the user requests complete or comprehensive analysis, or actual observation results show truncation, sampling, missing portions, or failed reads, the Agent SHALL concisely distinguish covered, sampled, missing, and failed scope as applicable. The Agent MUST claim complete coverage only when the requested scope is determinable and actual observations account for it completely.

#### Scenario: Comprehensive request has a missing segment

- **WHEN** the user requests analysis of a complete bounded collection but one requested segment is unavailable
- **THEN** the Agent analyzes only the observed segments and identifies the missing segment as a coverage limit
- **AND** it describes the result as partial rather than complete

#### Scenario: Observation is sampled or truncated

- **WHEN** a capability result states that the observed content was sampled or truncated
- **THEN** the Agent identifies the analysis as sampled or partial and explains only the material limitation needed to qualify its conclusions
- **AND** it does not infer complete coverage from the amount of returned content

#### Scenario: Complete bounded scope is observed

- **WHEN** the requested bounded scope is determinable and every requested segment has been observed successfully
- **THEN** the Agent MAY state that the requested scope was covered completely
- **AND** the statement remains grounded in the actual current-Turn observations

### Requirement: Coverage discipline is triggered by task semantics

The Agent SHALL decide whether coverage disclosure is required from the requested scope and actual observation results. It MUST NOT activate or suppress the discipline solely from a file extension, MIME type, asset category, domain name, or Skill identity.

#### Scenario: Different source types have the same incomplete scope

- **WHEN** a document, media asset, code repository, or other source has an equivalent material gap relative to a comprehensive request
- **THEN** the Agent applies the same truthful partial-coverage behavior
- **AND** no source-type-specific fallback or alternate completeness rule participates

### Requirement: Ordinary responses remain concise

The Agent SHALL answer ordinary conversation, narrow questions, and single execution results directly when no material coverage limitation applies. It MUST NOT require a fixed `Scope → Evidence → Claim → Completeness` template, repeat an existing plan after results exist, or duplicate Tool Result and Domain Job completion facts.

#### Scenario: User asks a narrow ordinary question

- **WHEN** the user asks a narrow question that can be answered from the available current-Turn context
- **THEN** the Agent returns the answer without a coverage checklist, audit preamble, or irrelevant missing-scope section

#### Scenario: Execution result already proves completion

- **WHEN** an authorized Tool Result or Domain Job terminal result already identifies the completed output
- **THEN** the Agent reports the requested result and only the minimum evidence needed to verify it
- **AND** it does not create a second execution receipt or restate the analysis plan

### Requirement: Coverage remains a turn-local presentation

The system SHALL keep analysis coverage as a reconstructable presentation of current authoritative observations unless a future owning domain introduces a separately specified durable consumer. The change MUST NOT create a global Coverage store, Claim graph, ExecutionReceipt registry, validator registry, workflow, or session authority.

#### Scenario: Analysis response is produced

- **WHEN** the Agent qualifies an answer with covered, sampled, missing, or failed scope
- **THEN** the qualification is derived from current input and existing Tool/runtime facts
- **AND** no parallel persistent coverage or execution authority is written
