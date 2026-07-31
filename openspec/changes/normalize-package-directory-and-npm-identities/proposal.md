## Why

The flattened workspace still mixes directory names and npm scopes, including
`packages/neko-agent-runtime` publishing `@neko/agent` and the Cut Webview publishing the ambiguous
`@neko/webview`. Without one complete source-to-target inventory, cleanup can collide with removed
aggregate roots or cause a second migration.

## What Changes

- **BREAKING** Freeze one complete mapping for the Desktop app and every retained package:
  current directory, current npm identity, final directory, final identity, owner, consumers, and
  disposition.
- Standardize retained package identities on `@neko/*` and make directory names match package
  responsibility.
- Define `packages/neko-agent` / `@neko/agent` as the final Agent runtime owner; this is a directory
  rename from `packages/neko-agent-runtime`, not restoration of the removed aggregate package.
- Rename ambiguous/mixed identities such as `@neko/webview`, `@neko-agent/*`, `@neko-canvas/*`,
  `@neko-cut/*`, `@neko-preview/*`, `@neko-tools/*`, and `neko-assets`.
- Update manifests, imports, exports, scripts, lockfile, tests, fixtures, quality guards, and active
  documentation atomically; do not provide package aliases, path fallbacks, or dual names.

## Capabilities

### New Capabilities

- `package-identity-normalization`: Defines the authoritative identity inventory, migration order,
  atomic rename behavior, and guards against aggregate-root restoration or compatibility aliases.

### Modified Capabilities

None.

## Impact

- Affects one app, all retained first-level packages, the pnpm lockfile, TypeScript/build/test
  configuration, root orchestration, CI/release tooling, OpenSpec/doc references, and ignored local
  build directories.
- Runs after Platform removal, Shared responsibility convergence, Host refinement, and zero-consumer
  dispositions to avoid repeated path churn.
- No user data migration is expected; rollback is commit-based.
