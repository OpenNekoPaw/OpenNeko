## ADDED Requirements

### Requirement: Dead local code is removed

Production and test TypeScript sources SHALL remove unused imports, types, locals, helpers, state, assignments, and obsolete fixtures that do not participate in a canonical path.

#### Scenario: A contraction leaves a local symbol without callers

- **WHEN** repository analysis proves a local symbol has no runtime, contract, or test role
- **THEN** the owning source SHALL delete the symbol rather than suppress or rename the warning

### Requirement: Required unused parameters remain explicit

Interface, callback, mock, and override implementations SHALL preserve required signatures while prefixing intentionally unused parameter names with `_`, and irrelevant catch bindings SHALL be omitted.

#### Scenario: An implementation must retain callback arity

- **WHEN** a parameter is required by the owning contract but unused by the implementation
- **THEN** the parameter position SHALL remain stable and its name SHALL explicitly use the allowed underscore convention

### Requirement: Intentional value omission preserves behavior

Code that destructures or iterates values solely to omit a field or ignore a key SHALL express that intent without changing the resulting data or collection behavior.

#### Scenario: A field is intentionally removed from a copied object

- **WHEN** destructuring excludes a field before constructing the result
- **THEN** the excluded binding SHALL be explicitly marked unused and the remaining object SHALL be unchanged

### Requirement: Unused symbols block CI

The shared ESLint configuration SHALL treat `@typescript-eslint/no-unused-vars` as an error after production and test sources reach zero findings.

#### Scenario: A new unused symbol is introduced

- **WHEN** lint detects an unused TypeScript symbol outside the documented underscore convention
- **THEN** lint SHALL report a CI-blocking error
