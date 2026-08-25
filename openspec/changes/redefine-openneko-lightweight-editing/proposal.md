## Why

OpenNeko needs a bounded, reliable Cut workflow for ordinary creative editing without becoming a full professional NLE or restoring retired hosts.

## What Changes

- Complete OTIO-backed edit, save, reopen, timeline, inspector, playback, audio, and background export behavior.
- Keep media preparation/execution under the canonical Node/FFmpeg runtime and browser presentation sandboxed.
- Preserve exact document revisions and fail-local behavior across playback, export, reload, and resource loss.

## Capabilities

### New Capabilities

- `lightweight-creative-editing`
- `desktop-cut-media-runtime`

### Modified Capabilities

<!-- None. -->

## Impact

Cut owns edit semantics and OTIO facts; Media owns execution; Desktop owns authorization/adapters. Existing Cut documents and user media remain preserved.
