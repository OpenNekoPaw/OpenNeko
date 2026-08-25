## Product boundary

Cut provides a bounded local editing workflow around OTIO documents, package-owned editing state, Node/FFmpeg media preparation, browser-safe playback, and background export. Desktop supplies authorization and concrete adapters but does not own edit semantics.

## Core invariants

- OTIO document identity and revision remain authoritative across edit, save, reopen, playback, and export.
- Timeline, Inspector, playback, audio, and export consume one Cut document authority.
- Media preparation and playback failures remain local and never switch to another content or runtime path.
- Export binds an exact frozen document revision and does not rewrite the open edit session.
- UI unmounting releases presentation resources without deleting documents or protected Jobs.

## Product acceptance

The capability is complete when creators can perform the core multi-clip edit, preview, save/reopen, inspect, and export workflow in the authoritative Desktop runtime.

## Non-goals

This change does not recreate a full professional NLE or restore retired Engine/client hosts.
