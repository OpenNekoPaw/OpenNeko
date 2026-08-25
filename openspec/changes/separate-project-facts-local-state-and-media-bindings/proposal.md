## Why

Project facts, device-local metadata, rebuildable projections, and Media Library bindings have different lifecycles. Mixing them can make disposable or invalid local state block durable user content.

## What Changes

- Separate synchronized Project facts, machine-local state, rebuildable projections, and Media Library connection/binding authorities.
- Make local metadata disposable and failures record-local while preserving exact user content and references.
- Remove dual-read, hidden repair, fallback identity, and active-Project inference paths.

## Capabilities

### New Capabilities

- `project-storage-partition`
- `project-composition-facts`
- `project-media-library-binding`

### Modified Capabilities

- `local-storage-authority-policy`
- `media-library-resource-entry`

## Impact

Project, local-state, projection, and Media Library owners receive distinct canonical boundaries. Existing Project content is preserved; machine-local links remain local.
