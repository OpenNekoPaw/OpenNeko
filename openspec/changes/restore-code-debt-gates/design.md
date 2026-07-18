## Context

OpenNeko has two debt ownership systems: the repository-wide non-Agent ledger and the Agent-specific LCD register. The legacy scanner currently scans both scopes but validates only the non-Agent ledger, so explicit Agent rejection diagnostics and migration names can fail the repository gate even when the Agent boundary gate passes. Separately, workspace pruning left removed paths and broad stale regexes in the non-Agent ledger, while Knip ignores whole Cut feature directories containing both live and unreachable code.

The implementation must preserve explicit migration paths that protect valuable local data, keep Agent governance owned by the Agent boundary checker, and remove only code proven unreachable from current entries and runtime registration.

## Goals / Non-Goals

**Goals:**

- Make the non-Agent legacy gate evaluate only debt owned by the non-Agent ledger.
- Keep all-source reporting available while making the blocking scope explicit in machine output.
- Classify rejection diagnostics, UI defaults, and explicit migration boundaries without hiding successful old-path execution.
- Synchronize ledger paths and stale patterns with the retained workspace.
- Remove statically unreachable Cut Webview subsystems and reduce Knip ignores to the smallest justified set.
- Preserve canonical fail-visible behavior and user-data migration commands.

**Non-Goals:**

- Remove every occurrence of the words `legacy`, `fallback`, or `deprecated`.
- Delete explicit local-data migration or retention commands without a data strategy.
- Refactor active Cut Property Panel, rendering, subtitle parsing, or Engine behavior.
- Audit every Rust `allow(dead_code)` in this change; Rust suppression cleanup remains a later bounded change.

## Decisions

### Separate blocking ownership from reporting scope

The scanner will continue reporting all TypeScript source matches, but its quality gate and non-Agent ledger coverage will exclude Agent-governed paths. Agent debt remains validated by `check-neko-agent-boundaries.mjs` and `agent-code-debt-lcd-register.json`.

This is preferred over copying Agent entries into the non-Agent ledger because dual ownership would create conflicting removal criteria and duplicate facts.

### Classify semantic boundaries by path and behavior

Explicit migration modules, reject/forbid diagnostics, and one-time cleanup code will be classified as boundary canonicalizers or current bridges. Presentation-only default arguments will be renamed where practical. A successful dual-read path remains `migrate-now`; it will not be allowlisted merely to make the gate green.

This is preferred over a broad word allowlist because path-level classification remains reviewable and testable.

### Make stale checks exact

Removed-file stale checks will target deleted paths, import specifiers, or exact identifiers. Substring patterns such as `ImageViewer` that also match a current `ImageViewerOverlay` are not permitted.

### Delete unreachable code instead of preserving speculative Phase 2 implementations

Cut Webview files with no runtime import, manifest entry, dynamic registration, or current OpenSpec owner will be deleted. Live components reachable through `PropertyPanelInline`, `ShapeRenderer`, and the subtitle parser remain. Knip ignores will be removed for deleted surfaces and narrowed for retained active code.

### Preserve explicit user-data migration boundaries

Generated-output retention, workspace metadata migration, and one-time state cleanup remain explicit commands or startup migrations. They require ledger classification, diagnostics, focused tests, and a removal condition; they must not become silent runtime fallbacks.

## Risks / Trade-offs

- [Scanner exclusion hides Agent debt] → Agent paths remain covered by `pnpm check:agent-boundaries`; tests will assert scope partitioning.
- [Deleting dormant Cut files removes unfinished future work] → Only files with no current runtime entry or consumer are deleted; future work must be reintroduced through an active OpenSpec change.
- [Ledger cleanup accidentally erases useful history] → Removed entries remain recorded with `status: removed`, removal date, replacement, and validation.
- [Broad Knip ignore removal exposes unrelated findings] → Run Knip after each ignore reduction and address only newly revealed code in the same bounded surface.

## Migration Plan

1. Add scanner self-tests for Agent scope partitioning, rejection diagnostics, exact stale patterns, and presentation defaults.
2. Update scanner classification and non-Agent blocking scope.
3. Synchronize ledger entries and required coverage with current workspace paths.
4. Remove unreachable Cut Webview code and matching Knip ignores in a separate commit.
5. Run focused package tests, `check:unused`, legacy checks, quality checks, and `git diff --check`.

Rollback is commit-granular: scanner/ledger and dormant-code cleanup are separate commits so either can be reverted without restoring the other.

## Open Questions

- Rust module-wide `allow(dead_code)` cleanup is intentionally deferred; a follow-up change should decide feature-gating versus deletion for each Engine subsystem.
