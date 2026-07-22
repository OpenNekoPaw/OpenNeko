## Scope

This inventory records the current ContentAccess/ContentIngest matrix and its canonical migration
owner. It is an implementation aid, not a stable architecture contract.

## Shared Contracts And Composition

| Current surface                                                              | Current owner          | Target                                                                                  |
| ---------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `types/content-access.ts` intent/target/materialization matrix               | `@neko/shared`         | Delete after callers use `ContentReadService`, projection ports, and authorized writers |
| `vscode/extension/content-access-service.ts` first-supports orchestration    | Extension shared layer | Replace with closed locator dispatch; no provider competition                           |
| `vscode/extension/content-access-providers.ts` source/cache/ingest providers | Extension shared layer | Split into source handlers, projection adapters, or owning writer operations            |
| `vscode/extension/content-access-runtime.ts` broad runtime composition       | Host composition       | Compose capability-scoped read/projection/write instances                               |
| `types/content-representation.ts`                                            | `@neko/shared`         | Retain as the only derived representation contract                                      |
| `vscode/extension/content-representation-service.ts`                         | Host derived storage   | Retain; do not expose its ResourceCache implementation to products                      |
| `project-file-io/store.ts`                                                   | ProjectFileStore       | Retain schema/backup/save ownership; inject authorized atomic writer                    |

## Source Read And Projection Consumers

| Consumer                                                 | Current use                                            | Target port                                                      |
| -------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| `neko-content` DocumentAccess and ReadDocument/ReadImage | Document/source reads and entry materialization        | `ContentReadService`; document adapter retains archive semantics |
| `neko-agent` extension/runtime/TUI                       | bytes, local paths, generated sources, plugin transfer | bounded read or processor projection; no local path result       |
| `neko-canvas` editor                                     | Webview and media source projection                    | Webview/Engine projection ports                                  |
| `neko-cut` editor/export                                 | ingest, playback, export staging                       | read/Engine projection plus owner-specific writer                |
| `neko-client` Engine file access                         | Engine source token                                    | Engine projection port                                           |
| `neko-preview` and package/export helpers                | preview URI, archive/package bytes                     | Webview/read ports; package owner resolves members               |
| Media Library and Tools                                  | file bytes, thumbnail/preview, diagnostics             | read plus `ContentRepresentationService`                         |

## Existing Provider Classification

| Provider family                                               | Classification                      | Migration rule                                                                     |
| ------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| source file and linked workspace file                         | source read                         | workspace-file handler; OS link remains the mapping fact                           |
| document entry                                                | source read owned by DocumentAccess | document-entry handler delegates to document owner                                 |
| generated source                                              | durable owner read                  | generated-output handler delegates to generated owner                              |
| package member                                                | durable owner read                  | package-resource handler delegates to package owner                                |
| thumbnail, preview, proxy, waveform, raster, semantic sidecar | derived representation              | `ContentRepresentationService`, never transparent read fallback                    |
| Webview URI, Engine token, processor handle                   | runtime projection                  | separate capability-scoped projection ports                                        |
| import/register/generated/export/cache ingest providers       | mixed writer ownership              | delete broad routing; each domain owner calls an authorized writer/allocation port |

## Writer Owners

- ProjectFileStore retains project schema, validation, backup, conflict, and save-session policy.
- Media Library owns explicit copy/delete intent for an authorized linked destination.
- Generated output, package, and export services retain their own lifecycle and durable identity.
- The shared writer only performs bounded atomic writes below its pre-authorized workspace root.
- Output allocation is provided as an owner-scoped instance and does not accept an owner, mode,
  destination, absolute path, variable, cache root, or caller-supplied permission flag.

## Poison Boundary

New contracts reject or cannot express `media-library` source routing, `libraryId`, Asset IDs,
ResourceRef/cache fields, intent, materialization, quality mode, caller, local/absolute paths,
provider identity, raw errors, runtime refs, generic ingest mode, or generic destination policy.
Legacy APIs remain only until their listed callers migrate; no new locator request is adapted back
to the old matrix.
