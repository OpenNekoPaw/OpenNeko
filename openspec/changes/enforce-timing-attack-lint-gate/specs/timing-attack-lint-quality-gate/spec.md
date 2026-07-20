## ADDED Requirements

### Requirement: Public command arguments are not modeled as secrets

Character Dialogue slash-command parsing SHALL name and process tokenized public command input according to its command-argument role, without security suppressions or constant-time secret comparison mechanisms.

#### Scenario: Public slash flags are parsed

- **WHEN** a Character Dialogue command contains mode or enrichment flags
- **THEN** the parser SHALL project the same mode, enrichment, entity, and initial-message contract without timing-attack lint findings

### Requirement: Potential timing attacks block CI

The shared ESLint security configuration SHALL treat `security/detect-possible-timing-attacks` as an error after the repository reaches zero findings.

#### Scenario: A suspicious secret comparison is introduced

- **WHEN** lint detects a possible timing-sensitive comparison in package TypeScript source
- **THEN** lint SHALL report a CI-blocking error

### Requirement: Timing-attack gate is regression tested

Repository tests SHALL verify Character Dialogue parser behavior and the effective error severity of the timing-attack rule, and repository lint SHALL report zero findings for that rule.

#### Scenario: Security quality gate is validated

- **WHEN** focused parser tests, orchestration tests, and repository lint run
- **THEN** parsing behavior SHALL remain stable and the timing-attack warning count SHALL be zero
