## Context

The package-source ESLint scope currently reports 53 `no-console` warnings. Fifty are emitted by `ExportIntegrationTest.ts`, a manually invoked local export scenario whose terminal output is its user interface, and three are emitted by `ConsoleTransport`, the Layer 0 logging adapter that intentionally delegates structured log entries to the host console. No other package source contains direct console calls.

Responsibility analysis: ordinary package code owns domain behavior and must use the project logger; `ConsoleTransport` alone owns console delivery; the manual export executable owns human-readable terminal progress. Dependency analysis: the exceptions do not add imports or reverse shared-layer direction. Interface analysis: `ILogger` and `ILogTransport` remain the canonical production logging contracts. Extension analysis: adding another console-producing boundary requires an explicit reviewed ESLint override rather than silently inheriting warning tolerance. Testing analysis: orchestration tests inspect the effective rule severity and exception scopes, while repository lint proves the current source tree is clean for the rule.

## Goals / Non-Goals

**Goals:**

- Make direct console usage in ordinary package TypeScript a CI-blocking violation.
- Preserve the two current output boundaries without inline disable comments.
- Keep exceptions path-specific, reviewable, and covered by regression tests.
- Keep the manual export scenario local-only.

**Non-Goals:**

- Replace the console transport with a different logging backend.
- Move or redesign the manual export integration executable.
- Clean unrelated ESLint warning classes in this batch.
- Add VS Code, GUI, FFmpeg, or real-media execution to remote CI.

## Decisions

### 1. Enforce `no-console` as an error in the shared package-source config

The base TypeScript rule changes from `warn` to `error`. This gives ordinary production code a fail-visible contract and prevents new direct console calls from being hidden among deferred warnings.

Keeping the rule at warning was rejected because it cannot prevent regression. Replacing every console call with a logger was rejected because `ConsoleTransport` is the terminal adapter for that logger and the manual executable intentionally writes to a terminal.

### 2. Model intentional output as narrow file overrides

The rule is disabled only for `packages/neko-types/src/logger/console-logger.ts` and `packages/neko-engine/packages/extension/src/mediaEngine/export/ExportIntegrationTest.ts`. Exact file paths are preferred over broad script, logger, package, or test globs so newly added output code remains blocked by default.

Inline disable comments were rejected because dozens of local suppressions obscure the architectural boundary and weaken reviewability. A package-wide exception was rejected because it would permit unrelated direct console usage.

### 3. Validate configuration behavior at the orchestration boundary

The existing ESLint critical-rules orchestration test will assert the production error severity and the exact two allowed exception paths. Repository lint remains the end-to-end proof that no unclassified `no-console` violations exist.

Production module tests are not added because runtime behavior and public contracts do not change.

## Risks / Trade-offs

- [An intentional future terminal executable initially fails lint] → Require an explicit narrow override and review its ownership instead of broadening the current exceptions.
- [A file rename invalidates an override] → The orchestration regression test references the canonical paths and repository lint fails visibly.
- [Exceptions could be mistaken for general console permission] → Keep the override list exact and document the two responsibilities in the quality-gate spec.

## Migration Plan

1. Add regression assertions for the global rule and both exact exceptions.
2. Promote the base rule to `error` and add the two narrow overrides.
3. Run the focused orchestration test and repository lint, then run local quality gates.
4. Roll back the configuration and test together if an unexpected package boundary is discovered.

## Open Questions

None.
