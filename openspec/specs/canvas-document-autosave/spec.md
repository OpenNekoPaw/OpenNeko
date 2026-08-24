# canvas-document-autosave Specification

## Purpose
Define one Canvas-owned autosave path with coalescing, explicit flush, failure visibility and deletion safety.
## Requirements
### Requirement: Durable Canvas changes autosave after bounded idle

Canvas Host runtime SHALL mark durable document mutations dirty and SHALL save the latest authoritative Canvas after a bounded trailing idle interval. Repeated mutations inside the interval SHALL replace the pending candidate and SHALL NOT produce concurrent or per-event file writes.

#### Scenario: User continuously edits Markdown

- **WHEN** multiple node content changes reach the Host inside one autosave interval
- **THEN** the session remains immediately usable with the latest in-memory content
- **AND** no save occurs before the trailing interval expires
- **AND** one serialized save writes the latest Canvas after the interval

#### Scenario: User drags a node

- **WHEN** pointer movement updates only the drag preview
- **THEN** no durable Canvas mutation or save occurs
- **AND WHEN** the gesture ends with a changed final position
- **THEN** one document mutation is committed and scheduled for autosave

### Requirement: Explicit Save flushes the canonical pending state

The explicit Save intent SHALL cancel the pending autosave timer and immediately persist the current session Canvas through the same canonical save effect. A clean session SHALL NOT perform a redundant write.

#### Scenario: User saves before idle timeout

- **WHEN** the Canvas is dirty and the user invokes Save before autosave fires
- **THEN** the current Canvas is saved once immediately
- **AND** the scheduled timer cannot perform a duplicate save
- **AND** the resulting snapshot is clean

### Requirement: Deletion evidence remains attached until successful save

Each document replacement SHALL carry the current pending removed-node identities into the Host session. The session SHALL use that evidence for both automatic and explicit save and SHALL clear it only after successful persistence or explicit restoration in a later replacement.

#### Scenario: Deleted node is autosaved

- **WHEN** a replacement removes an authoritative node with matching removal evidence
- **THEN** autosave passes that evidence to the Desktop save effect
- **AND** the deletion is not rejected as an unproven external omission

#### Scenario: Save fails

- **WHEN** the save effect rejects the current Canvas
- **THEN** the session remains dirty
- **AND** removal evidence remains available for a later retry
- **AND** the failure is visible through the Host diagnostic path

### Requirement: Presentation changes do not save the Canvas document

Viewport, selection and other presentation-only changes SHALL remain outside the Canvas document autosave scheduler.

#### Scenario: User pans and zooms without editing nodes

- **WHEN** only Canvas presentation changes
- **THEN** the package-owned presentation snapshot may update
- **AND** no `.nkc` save effect is invoked
