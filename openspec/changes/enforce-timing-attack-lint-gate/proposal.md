## Why

OpenNeko reports six `security/detect-possible-timing-attacks` warnings because a Character Dialogue CLI parser names each public command-line argument `token`, which the security plugin mistakes for a secret. Keeping the rule report-only lets future genuine secret comparisons blend into known false positives.

## What Changes

- Rename the parser's local CLI argument variable to reflect that it contains public command syntax rather than authentication material.
- Preserve and verify Character Dialogue slash-argument parsing behavior.
- Promote `security/detect-possible-timing-attacks` to a CI-blocking error after the repository reaches zero findings.
- Add regression coverage for the rule severity and warning count.

## Capabilities

### New Capabilities

- `timing-attack-lint-quality-gate`: Defines semantic handling of timing-attack lint findings and blocks new potential secret comparisons.

### Modified Capabilities

None.

## Impact

- Character Dialogue slash-argument parser local naming and its existing focused tests.
- Root ESLint security-rule severity and orchestration regression tests.
- No runtime API, command syntax, persisted data, dependency, platform, or CI topology changes.
