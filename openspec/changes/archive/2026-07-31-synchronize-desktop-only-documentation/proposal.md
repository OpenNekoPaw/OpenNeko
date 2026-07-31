## Why

The repository has completed its Desktop-only topology migration, but several active development
rules, product documents, architecture documents, package READMEs, ADR statuses, and OpenSpec links
still describe removed VS Code, TUI, Engine, client, Proto, or Rust paths. These contradictions can
send contributors toward retired implementations and overstate which retained packages are already
integrated into the Desktop product.

## What Changes

- Align `AGENTS.md` with the current OpenSpec layout, TypeScript contracts, Desktop-only topology,
  and Node/FFmpeg validation commands.
- Separate currently integrated Desktop capabilities from retained-but-unintegrated package
  capabilities in the root READMEs, client target, roadmap, and domain index.
- Remove conflicting platform qualification claims and volatile task progress from the roadmap.
- Consolidate duplicated Character/World package-boundary sections and remove retired Engine/client
  terminology from active architecture and package documentation.
- Mark obsolete VS Code/TUI ADRs as superseded or historical and repair real local documentation
  links, including links whose targets moved into the OpenSpec archive.
- Add concise contributor entry documents without duplicating the repository rules in `AGENTS.md`.
- Record, but do not bulk-archive, the separate backlog of completed or structurally incomplete
  OpenSpec changes.

## Capabilities

### New Capabilities

- `repository-documentation-consistency`: Defines how current product facts, target architecture,
  historical decisions, implementation status, and contributor guidance remain distinguishable and
  link-valid.

### Modified Capabilities

None.

## Impact

This change updates documentation and OpenSpec artifacts only. It affects root contributor and
product entry documents, current architecture navigation and boundaries, selected package READMEs,
and a bounded set of stale ADR references. It does not rename packages, split `@neko/platform`,
integrate dormant packages, change runtime behavior, migrate user data, or bulk-archive unrelated
OpenSpec changes.
