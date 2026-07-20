## Why

OpenNeko still reports 140 `@typescript-eslint/no-unused-vars` warnings after recent product-surface and protocol simplification. They mix confirmed dead imports/functions and obsolete test fixtures with intentionally unused interface parameters, making real cleanup residue indistinguishable from explicit contract placeholders.

## What Changes

- Remove unused imports, types, locals, helpers, state, and functions that no longer participate in a canonical runtime or test path.
- Remove obsolete test fixtures and assertions left behind by protocol and product-surface contraction.
- Preserve required interface and callback signatures while naming intentionally unused parameters explicitly with the repository's `_` convention.
- Preserve intentional object-field omission and collection iteration semantics without lint suppression.
- Promote `@typescript-eslint/no-unused-vars` to a CI-blocking error after the repository reaches zero findings.

## Capabilities

### New Capabilities

- `unused-code-quality-gate`: Defines removal, preservation, and regression rules for unused source symbols and contract placeholders.

### Modified Capabilities

None.

## Impact

- Production and test TypeScript sources across retained packages containing current unused-symbol findings.
- Root ESLint severity and orchestration regression tests.
- No public API, user data, platform support, CI topology, or runtime feature behavior changes are intended.
