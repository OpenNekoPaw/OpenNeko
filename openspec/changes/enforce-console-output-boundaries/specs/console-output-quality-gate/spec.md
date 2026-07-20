## ADDED Requirements

### Requirement: Ordinary package source cannot write directly to console

The shared ESLint configuration SHALL treat `no-console` as an error for package TypeScript sources so production and test code use their owning logging or reporting contracts by default.

#### Scenario: Direct console usage is introduced in ordinary package source

- **WHEN** lint evaluates a package TypeScript source outside an approved output boundary that calls a console method
- **THEN** lint SHALL report a CI-blocking `no-console` error

### Requirement: Console output exceptions are explicit boundaries

The shared ESLint configuration SHALL allow direct console access only in the canonical shared console transport and the local manual export integration executable.

#### Scenario: Shared console transport delivers a log entry

- **WHEN** lint evaluates `packages/neko-types/src/logger/console-logger.ts`
- **THEN** the file SHALL be exempt from `no-console` because console delivery is the transport's owning responsibility

#### Scenario: Local manual export executable reports progress

- **WHEN** lint evaluates `packages/neko-engine/packages/extension/src/mediaEngine/export/ExportIntegrationTest.ts`
- **THEN** the file SHALL be exempt from `no-console` because terminal output is the local executable's reporting interface

### Requirement: Console exception scope is regression tested

Repository orchestration tests SHALL verify the global error severity and the exact approved exception paths, and repository lint SHALL contain zero unclassified `no-console` violations.

#### Scenario: Console quality gate is validated

- **WHEN** repository lint and orchestration tests run
- **THEN** ordinary package source SHALL enforce `no-console` as an error and only the two approved files SHALL disable the rule
