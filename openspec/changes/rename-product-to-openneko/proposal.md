## Why

The repository still presents the product as `Neko Suite` and uses several `Neko *` client labels even though the intended project name is `OpenNeko`. This leaves the public product identity inconsistent with the repository name and newer runtime terminology.

## What Changes

- Establish `OpenNeko` as the canonical top-level product name in user-visible copy, documentation, package metadata, UI labels, and diagnostics.
- Rename client-facing product labels to the `OpenNeko *` family, including `OpenNeko Home`, `OpenNeko TUI`, `OpenNeko for VSCode`, and `OpenNeko AI` where those products are referenced.
- Rename the private root workspace aggregator to `openneko-monorepo` while keeping published/workspace package names and scope stable.
- Keep stable technical identities such as workspace paths, published/workspace npm package names and scope, VS Code publisher/extension IDs, command IDs, configuration keys, file formats, Rust crate names, protocol fields, and existing exported TypeScript identifiers unchanged.
- Add an automated brand-consistency check that fails when the retired top-level or client-facing product labels are reintroduced outside explicitly documented historical/compatibility allowlists.

## Capabilities

### New Capabilities

- `product-brand-identity`: Defines the canonical OpenNeko product family names, protected technical identifiers, and repository consistency checks.

### Modified Capabilities

None.

## Impact

Affected surfaces include root and package documentation, application manifests, user-visible Webview/TUI/extension copy, package descriptions, source comments and diagnostics that identify the product, and repository quality scripts. Runtime APIs, persisted data, package resolution, command routing, extension identity, and wire contracts remain unchanged.
