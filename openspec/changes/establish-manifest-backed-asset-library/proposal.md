## Why

Reusable local Assets require stable package identity, immutable revisions, integrity, dependency closure, and safe lifecycle semantics that a flat path-derived catalog cannot provide.

## What Changes

- Add a manifest-backed local Asset package authority with atomic import, revision, dependency, update, uninstall, and garbage-collection semantics.
- Expose installed Assets in the Resources experience while keeping ordinary files and Media Library entries catalog-free.
- Preserve exact project pins and isolate invalid packages without creating Entity or remote-distribution authority.

## Capabilities

### New Capabilities

- `manifest-backed-asset-library`
- `asset-library-resource-surface`

### Modified Capabilities

- `media-library-resource-entry`

## Impact

Asset Library owns reusable packages and revisions; Projects own exact references; Media Library and Entity retain separate authorities. Existing user files are not implicitly imported or rewritten.
