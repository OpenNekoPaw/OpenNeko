## ADDED Requirements

### Requirement: React Hook ordering has no report-only violations
The repository SHALL keep `react-hooks/rules-of-hooks` at zero violations across production and test TypeScript sources, and affected render paths SHALL execute Hooks only through stable React component or custom Hook boundaries.

#### Scenario: Preview renderer role is selected
- **WHEN** a Canvas preview role resolves to a renderer that owns Hook state
- **THEN** the registry SHALL instantiate a stable React component identity through JSX
- **AND** the renderer SHALL NOT be invoked as an ordinary function

#### Scenario: Component input is not applicable
- **WHEN** a component receives an input it does not render, such as a non-shot node or invisible shape
- **THEN** it SHALL return without changing Hook order across renders

#### Scenario: Hook test chooses controlled or uncontrolled input
- **WHEN** a test harness exercises alternate Hook option contracts
- **THEN** it SHALL call the Hook exactly once with an unconditionally selected input

### Requirement: Production code contains no explicit any escape
Production TypeScript sources SHALL contain zero `@typescript-eslint/no-explicit-any` violations and SHALL use the owning shared or package contract for messages, operations, keyframes, generic helpers, and Engine results.

#### Scenario: Typed project update is received
- **WHEN** the Cut Webview handles a project update message
- **THEN** media tracks and elements SHALL be traversed through the canonical project types without `any`

#### Scenario: Canvas operation snapshot is recorded
- **WHEN** a Canvas node mutation records before and after state
- **THEN** both snapshots SHALL use typed partial Canvas node contracts without an explicit-any cast

#### Scenario: Engine media probe returns
- **WHEN** the Tools Extension probes media through `EngineClient`
- **THEN** the service SHALL expose the canonical probe result type or a visible unavailable result

### Requirement: Critical ESLint rules block regressions
The shared ESLint configuration SHALL treat `react-hooks/rules-of-hooks` and production `@typescript-eslint/no-explicit-any` violations as errors after the repository reaches zero violations.

#### Scenario: A production explicit any is introduced
- **WHEN** lint evaluates a production TypeScript source containing explicit `any`
- **THEN** lint SHALL exit with an error

#### Scenario: A Hook is called conditionally or outside a component
- **WHEN** lint evaluates a React source with an invalid Hook call path
- **THEN** lint SHALL exit with an error

#### Scenario: A test uses explicit any for a mock
- **WHEN** lint evaluates an existing test-only explicit `any` allowed by the scoped test override
- **THEN** the production gate SHALL remain unchanged

### Requirement: Runtime behavior remains verifiable
The change SHALL preserve affected Canvas, Cut, Tools, and shared Hook behavior through focused tests and local VS Code Extension Development Host evidence.

#### Scenario: Focused verification runs
- **WHEN** the critical warnings are removed
- **THEN** affected package tests, typechecks, repository lint, and quality checks SHALL pass
- **AND** the local Webview runtime smoke SHALL record any remaining lifecycle or interaction risk
