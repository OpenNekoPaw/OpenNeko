# Proposal: Expose the canonical document locator to DSH

The `openneko.document` Host path already authorizes workspace-linked media libraries, but its DSH parameter metadata describes `input` as opaque JSON. Models can therefore emit retired `kind: "workspace-file"` objects or unrelated top-level `locator`/`pageRange` fields. The tool must expose the existing canonical `ContentLocator` shape so linked media-library files are read through the same workspace-file contract as ordinary workspace files.

## Scope

- Make the official Content DSH plugin publish the canonical document input shape, including the workspace `file.authority` and relative `file.path` fields.
- Document that `neko/assets/<library>/...` paths are ordinary workspace paths when the managed link is present.
- Add path-level tests proving a managed media-library link reaches the document runtime through `workspace-file` authorization.

## Non-goals

- Do not add a `kind: "workspace-file"` compatibility shape, top-level `locator`, `pageRange`, or another legacy alias.
- Do not add a second media-library reader or bypass Host authorization.
- Do not expose absolute paths or media-library-specific locators to DSH.
