## Why

Several first-level packages have no manifest consumer, but package presence and passing unit tests
can be mistaken for shipped Desktop capability. Each package needs an evidence-based disposition
that distinguishes resource owners, unintegrated kernels, test support, and dead workspaces.

## What Changes

- Generate a current machine-readable consumer inventory and augment it with non-manifest resource,
  script, test, and runtime-loading evidence.
- Classify every zero-consumer package as Desktop-integrated, retained unintegrated kernel,
  resource/tooling owner, merge candidate, or deletion candidate, with an owner and acceptance path.
- Audit at least `@neko-agent/test-utils`, `@neko/chara`, `@neko/quality`, `@neko/search`,
  `@neko/skills`, `@neko-tools/contracts`, and `@neko-tools/webview`; do not assume the initial list
  remains current.
- Integrate, merge, or delete packages according to approved package-specific evidence. Mark retained
  kernels as unintegrated in package/product documentation.
- Add governance checks that fail when a new zero-consumer workspace lacks an explicit disposition.

## Capabilities

### New Capabilities

- `zero-consumer-package-governance`: Defines consumer evidence, allowed dispositions, documentation,
  and fail-visible repository enforcement for unconsumed packages.

### Modified Capabilities

None.

## Impact

- Affects workspace manifests, package READMEs, Desktop capability documentation, dependency/unused
  checks, package topology governance, and any package selected for integration, merge, or deletion.
- Deleting or merging code is a prelaunch breaking change, but project data, user settings, trust
  state, installed packages, and generated artifacts remain protected.
- Final dispositions must be known before package identity normalization.
