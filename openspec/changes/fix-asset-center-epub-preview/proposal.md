## Why

Asset Center currently publishes every selected file through the Desktop single-file resource path. EPUB Preview consumes an archive as a virtual directory and requires a base URL ending in `/`, so valid EPUB files selected from Media Library fail with `EPUB virtual directory URL must end with a slash.` The files and library records remain valid; the failure is in resource publication.

## What Changes

- Add a Preview-owned Node publication module for EPUB archives.
- Publish EPUB entries as one authorized virtual resource tree, preserving the required trailing-slash base URL.
- Make both Desktop Preview and Asset Center consume the same canonical EPUB publisher.
- Keep ordinary files on the existing single-file path and keep malformed EPUB failures local and visible.
- Release the archive reader when the owning Preview session is released or publication fails.

## Capabilities

### New Capabilities

- `authorized-epub-preview-publication`: defines canonical Node-side EPUB archive publication for authorized Preview consumers.

### Modified Capabilities

None.

## Impact

- `@neko/preview-node`: new Preview Node owner for EPUB archive indexing and virtual resource-tree publication.
- `@neko/assets-node`: selects the Preview-owned EPUB path only for `application/epub+zip`; ordinary files remain unchanged.
- `apps/neko-desktop`: wires the authorized Desktop resource-tree adapter and delegates its existing EPUB path to `@neko/preview-node`.
- `@neko/content`: remains the archive low-level access owner; no contract or implementation change.
- User files, library metadata and durable records are not changed, migrated, rewritten or replaced.
