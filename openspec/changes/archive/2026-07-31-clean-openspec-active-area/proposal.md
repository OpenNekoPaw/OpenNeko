## Why

`openspec/changes/` currently mixes active implementation work, completed changes, superseded plans,
and empty untracked directories. The surrounding documentation also contains a few decision-status
and snapshot-count mismatches, so contributors cannot reliably distinguish current work from
historical evidence.

## What Changes

- Define a disposition-based governance rule for active OpenSpec changes.
- Remove empty change directories that contain no artifacts or tracked files.
- Archive a bounded set of completed or explicitly superseded changes only after checking task
  completion, delta-spec relevance, successor ownership, and external links.
- Keep incomplete changes with real implementation or external-evidence gates active.
- Align historical ADR status labels with architecture navigation without deleting their evidence.
- Make the dated active-change audit reproducible by recording its source revision and collection
  time, then refresh its counts after this cleanup.

## Capabilities

### New Capabilities

- `openspec-active-area-governance`: Defines how active, completed, superseded, empty, and blocked
  OpenSpec changes are classified and safely disposed.

### Modified Capabilities

None.

## Impact

This change affects OpenSpec artifacts, selected documentation metadata, and links to archived
changes. It does not change runtime code, package boundaries, user data, or the active Desktop,
Agent, Assets, and media changes already present in the worktree.
