## Why

OpenNeko still reports 53 `no-console` warnings, but every current occurrence belongs to one of two intentional output boundaries: the shared console log transport or a local manual export test executable. Leaving the rule at warning severity hides future direct console usage in ordinary production code and makes intentional output paths indistinguishable from architectural violations.

## What Changes

- Promote `no-console` from report-only warning to a CI-blocking error for package TypeScript sources.
- Define narrow ESLint exceptions for the canonical shared console transport and the local manual export integration executable.
- Add regression coverage proving ordinary package source cannot use console while the two explicit output boundaries remain valid.
- Keep the manual export scenario local-only; do not add it to remote CI.

## Capabilities

### New Capabilities

- `console-output-quality-gate`: Defines the allowed console output boundaries and the lint regression gate for all other package TypeScript sources.

### Modified Capabilities

None.

## Impact

- Root ESLint configuration and lint validation tests.
- `packages/neko-types` console logging transport and `packages/neko-engine` local export integration executable are documented as the only package-source console boundaries.
- No runtime API, package dependency, supported platform, or remote CI workflow changes.
