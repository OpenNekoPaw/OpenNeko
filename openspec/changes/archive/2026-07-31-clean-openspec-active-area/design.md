## Context

The active OpenSpec directory has accumulated changes with different lifecycle states. Checkbox
completion alone is insufficient for archiving because a completed change can still carry unsynced
requirements or be linked by current documentation. Conversely, some incomplete changes contain
only obsolete conditional work whose owning runtime has since been retired. Seven directories are
empty and untracked, while several unrelated active changes currently have user modifications.

The documentation tree is fully indexed, so this cleanup does not need an orphan-document deletion
pass. Historical ADRs remain useful evidence, but three status labels disagree with the architecture
index and their own replacement notices.

## Goals / Non-Goals

**Goals:**

- Establish one explicit disposition for every change examined in this cleanup.
- Remove artifact-free residue and archive only changes with sufficient completion or successor
  evidence.
- Preserve current requirements by syncing relevant delta specs before archive.
- Preserve historical evidence while making superseded status visible at the document source.
- Keep the dated governance snapshot reproducible and internally consistent.
- Avoid all active user-owned implementation changes in the dirty worktree.

**Non-Goals:**

- Bulk-archive every change whose checkboxes are complete.
- Complete genuine product, provider, packaging, or runtime acceptance work.
- Delete historical ADRs or research solely because their implementation target was retired.
- Reorganize packages, rename subpackages, or change Desktop composition.

## Decisions

### Classify before moving

Each examined change receives one of four dispositions:

1. **Active**: open implementation or acceptance evidence remains.
2. **Archive with spec sync**: implementation is complete and its delta requirements remain current.
3. **Archive without spec sync**: the change is historical or superseded and its requirements must
   not become canonical.
4. **Delete empty residue**: the directory has no files, no tracked content, and no recoverable
   artifact.

This is preferred over checkbox-only automation because task completion and canonical requirement
status are separate facts.

### Use bounded archive batches

The first batch contains only changes whose artifacts, task state, references, and spec disposition
are individually checked. Changes overlapping dirty user work are excluded even if another signal
suggests completion.

### Preserve evidence at stable locations

Completed changes move under the date-prefixed archive path. Current Markdown references are updated
in the same change. Historical ADR bodies remain in place; only their status and replacement notice
are corrected when stable successor documents already exist.

### Treat status documents as reproducible snapshots

The audit document records the source commit, collection time, counting method, and post-cleanup
counts. It remains a dated observation rather than a live task tracker or architecture authority.

## Risks / Trade-offs

- **A delta spec is wrongly promoted** -> Compare it with current code, successor changes, and
  canonical specs before selecting sync; skip sync for retired requirements.
- **A live change is archived** -> Exclude changes with genuine unchecked work, external acceptance
  gates, or overlapping uncommitted edits.
- **Archive moves break documentation links** -> Search all Markdown references before and after
  each move and run the repository link checker.
- **Snapshot counts immediately drift** -> Record an exact source revision and timestamp, and label
  the values as a snapshot rather than current state.
- **Cleanup becomes an unbounded historical rewrite** -> Limit this implementation to the
  explicitly audited batch and leave remaining dispositions as follow-up work.
