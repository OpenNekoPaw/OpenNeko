## Context

The accepted Desktop-only architecture is defined by `application-composition.md`,
`client-targets.md`, `package-boundaries.md`, and the executable workspace topology. Documentation
created during the earlier VS Code/TUI/Engine phases remains useful as history, but several files
still present that history as current development guidance or current product capability.

The synchronization must preserve three distinct facts:

1. current runtime topology and product integration;
2. retained package capabilities that are not yet integrated into Desktop;
3. proposed target changes, including package renaming and `@neko/platform` decomposition.

The working tree contains unrelated implementation and documentation changes, so edits must be
bounded and must preserve overlapping user changes.

## Goals / Non-Goals

**Goals:**

- Make all current entry documents consistent with the Desktop-only runtime and supported platform
  matrix.
- Prevent retained packages from being described as product-integrated without a real Desktop
  consumer.
- Keep historical ADR and status evidence discoverable while making its non-current status explicit.
- Make contributor and OpenSpec entry paths resolve to real files.
- Keep package-level implementation notes aligned with their current public paths.

**Non-Goals:**

- Renaming, moving, splitting, or deleting workspace packages.
- Integrating Chara, Search, Quality, or Tools into Desktop.
- Rewriting dated status snapshots to pretend old observations never existed.
- Bulk-archiving completed OpenSpec changes without a separate review of each change.
- Changing runtime behavior, tests, packaging, or user data.

## Decisions

### Current facts follow executable topology

Product capability statements require a Desktop manifest/source consumer and a real product path.
A retained package without that consumer is documented as retained, dormant, or planned. This is
stricter than inferring product availability from package existence.

### Target package changes remain proposed

The proposed Desktop package-granularity ADR can describe the intended decomposition of
`@neko/platform` and package naming convergence. Current architecture and contributor rules continue
to describe `@neko/platform` as an existing migration boundary until implementation is accepted and
verified.

### Roadmap and status are separated

Roadmaps own direction, ordering, and qualification gates. Task completion percentages, temporary
blockers, and implementation evidence remain in OpenSpec or dated status documents.

### Historical documents remain readable but non-authoritative

Obsolete ADRs receive explicit `Superseded` or historical status and point to their replacement.
Archived OpenSpec links are updated to their archive locations. Dated status documents retain their
historical claims; only broken navigation or missing retirement context is corrected.

### Contributor guidance has one detailed authority

`AGENTS.md` remains the detailed repository rule source. Concise Chinese and English CONTRIBUTING
documents provide the human entry workflow and link to `AGENTS.md` rather than duplicating its
architecture and quality rules.

## Risks / Trade-offs

- **[Concurrent implementation changes can alter product capability during this edit]** -> Base
  statements on current manifest/source evidence and avoid claiming completion for unverified paths.
- **[Editing many historical ADRs creates churn]** -> Update only misleading status headers and real
  broken links in this change; leave narrative history intact.
- **[Package README coverage remains incomplete]** -> Keep the central package-boundary document
  authoritative and update only existing README files with confirmed drift.
- **[OpenSpec active-area debt remains]** -> Record exact counts and require a separate archival audit
  instead of moving completed changes mechanically.
