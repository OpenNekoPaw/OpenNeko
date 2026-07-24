# Legacy Asset Catalog Inventory

Date: 2026-07-21

This inventory defines the replacement boundary for task 1.2. It covers production code, public contracts, manifests, tests, fixtures, documentation, and migration-only readers. Generated `coverage/`, `dist/`, `.turbo/`, and `node_modules/` output is excluded.

## Reproducible Surface Query

The complete live file set is the sorted union of these searches:

```bash
rg -l --glob '!**/coverage/**' --glob '!**/dist/**' --glob '!**/node_modules/**' \
  '\b(AssetEntity|AssetVariant|AssetFile|AssetSource|EntityAssetBinding)\b|project://assets/|neko/assets/library\.json|asset-library|ListAssets|GetAsset|ImportAsset|importFile|promote'

rg -n --glob 'package.json' --glob 'package.nls*.json' \
  'asset|Asset|mediaLibrary|Media Library' \
  packages/neko-assets packages/neko-canvas packages/neko-cut packages/neko-agent packages/neko-tools apps/neko-tui apps/neko-vscode
```

At inspection time the first query matched 125 production files and 88 test/fixture files under `packages/` and `apps/`. These counts are audit signals, not a fixed allowlist; final legacy-debt gates must reach only explicitly documented migration/archive references.

## Ownership Matrix

| Owner                                                                            | Current authority or consumer                                                             | Canonical replacement                                                               | Removal condition                                                 |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/neko-types/src/types/asset/`                                           | AssetEntity, Variant, File, Source, query, protocol, drag and diff contracts              | Media Library projection entry plus content locator; no catalog identity            | All producers and consumers compile against new contracts         |
| `packages/neko-types/src/types/extension-api.ts`                                 | `NekoAssetsAPI`, `getAllEntities`, `importFile`, thumbnail resolution through AssetEntity | Narrow Media Library file/query operations and Creative Entity binding facade       | VS Code and TUI hosts no longer expose Asset API                  |
| `packages/neko-types/src/types/project-cache-search.ts`                          | `asset-library` and `media-library` partitions                                            | Media Library file projection plus `creative-entities`                              | Legacy partition migration/rebuild is tested and poisoned         |
| `packages/neko-assets/packages/asset/`                                           | Required Asset catalog domain, storage, registry, CRUD, classifier, health and diff       | Delete package after migration-only readers move to neutral shared/node ownership   | No runtime or package dependency on `@neko/asset`                 |
| `packages/neko-assets/src/extension.ts`                                          | Composition root for Asset catalog, Media Library links, commands and APIs                | Media Library link/projection composition only                                      | Asset commands/API/registrations removed                          |
| `packages/neko-assets/src/providers/AssetManagerTreeProvider.ts`                 | AssetEntity/Variant/File tree                                                             | Media Library locator tree                                                          | Tree contains no catalog node kinds                               |
| `packages/neko-assets/src/providers/AssetHistoryTreeProvider.ts`                 | Entity usage/history projection                                                           | Media recent-use projection keyed by locator                                        | Entity catalog history commands removed                           |
| `packages/neko-assets/src/providers/AssetFileDecorationProvider.ts`              | AssetFile availability decoration                                                         | Locator availability projection, excluding linked descendants from Git decoration   | No AssetFile input remains                                        |
| `packages/neko-assets/src/services/AssetFileImportService.ts`                    | Copies/registers file into Asset catalog                                                  | Explicit copy-to-selected-library operation or direct locator use                   | Import membership path is poisoned                                |
| `packages/neko-assets/src/services/CharacterAssetExportService.ts`               | Resolves Entity binding through AssetEntity/Variant/File                                  | EntityRepresentationBinding plus package/content owner                              | Export no longer calls Asset service                              |
| `packages/neko-assets/src/services/EntityFacadeReaders.ts`                       | Resolves `project://assets/` for Entity facade                                            | Direct representation reference reader                                              | Project Asset URI parser removed                                  |
| `packages/neko-assets/src/agentHeadlessCapabilityProvider.mts`                   | List/Get/Import Asset Agent capability                                                    | Media Library file search/read and Entity query/bind                                | Tool schema and evaluation contain no Asset membership action     |
| `packages/neko-entity/src/core/`                                                 | `EntityAssetBinding`, string `assetRef`, Asset federation resolver                        | Closed `EntityRepresentationBinding` target union                                   | Binding file migration and all adapters complete                  |
| `packages/neko-entity/src/host-vscode/`                                          | Asset URI availability watcher and Inspector routing                                      | Locator/package/generated/document availability and explicit rebind                 | `project://assets/` cannot resolve successfully                   |
| `packages/neko-entity/src/projections/`                                          | Asset metadata and NPC representation projections                                         | Direct representation projections                                                   | No AssetEntity reader/provider remains                            |
| `packages/neko-search/src/`                                                      | Asset compatibility adapters and `asset-library` partition routing                        | Media file and Creative Entity partitions                                           | Asset partition is migration/rebuild-only then deleted            |
| `packages/neko-agent/packages/agent-types/`                                      | `asset-library` context source and Asset refs in messages                                 | Media Library locator or Creative Entity representation context                     | Protocol guards reject legacy source for new messages             |
| `packages/neko-agent/packages/extension/`                                        | Asset navigation, mention search, processor promotion and routing                         | Media locator navigation, generated ownership, Entity binding                       | Real evaluation proves forbidden Asset fallback                   |
| `packages/neko-agent/packages/webview/`                                          | Asset-library context presentation                                                        | Media Library and Entity presentation                                               | No Asset source branch remains in Webview protocol/presenters     |
| `packages/neko-canvas/packages/extension/`                                       | `neko.asset.import`, `neko.addToAssetLibrary`, promotion and Entity Asset routes          | Direct locator persistence, generated retention/copy, Entity representation binding | Canvas reopen/path tests poison import/promote                    |
| `packages/neko-canvas/packages/webview/`                                         | Add/save-to-Asset actions and Asset reference presentation                                | Retain/copy/bind actions                                                            | Message/action unions contain no catalog action                   |
| `packages/neko-cut/packages/extension/src/services/AssetService.ts`              | Independent Asset catalog facade                                                          | Content and Entity ports; delete service                                            | Timeline/export/entity flows no longer call AssetService          |
| `packages/neko-cut/packages/extension/src/handlers/assetHandlers.ts`             | Asset-specific host commands                                                              | Media file or Entity representation handlers                                        | Handler registration removed or renamed to exact surviving intent |
| `packages/neko-tools/packages/extension/src/asset-diff/`                         | AssetVariant diff editor/session                                                          | File/media/package diff where semantics survive; otherwise delete                   | No AssetEntity/Variant reader needed                              |
| `packages/neko-tools/packages/extension/src/contracts/IAssetEntityReader.ts`     | Cross-extension Asset API reader                                                          | Delete; use explicit file/package inputs                                            | Tool bootstrap compiles without reader service ID                 |
| `packages/neko-tools/packages/extension/src/services/VSCodeAssetEntityReader.ts` | Reads AssetEntity through VS Code command/API                                             | Delete                                                                              | No consumer or command remains                                    |
| `apps/neko-tui/src/tui/host/node-assets-capability.ts`                           | Instantiates `@neko/asset` and exposes Asset API                                          | Node Media Library locator/query capability plus Entity facade                      | `@neko/asset` dependency removed                                  |
| `apps/neko-tui/src/tui/components/Input/reference-suggestions.ts`                | Suggests AssetEntity and legacy Asset paths                                               | Media files and Creative Entities                                                   | Tests prove no legacy directory/catalog suggestion                |

## Persistence And Migration Inputs

| Legacy input                                             | Current readers                                                          | Required classification                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `neko/assets/library.json`                               | `JsonFileStorage`, Asset Library services, VS Code/TUI Asset composition | Immutable archive; file locators; entity proposals; provenance; rebuildable projection; unresolved metadata |
| `neko/entity-bindings.json` with string `assetRef`       | `neko-entity` fact stores and resolvers                                  | Direct representation reference or explicit unresolved diagnostic                                           |
| `project://assets/<id>` in Canvas/Cut/Agent/Entity facts | Asset URI parsers and facade readers                                     | Resolve only during inspection; rewrite to direct reference on confirmed migration                          |
| Local `asset-library` search documents                   | Project Search/local metadata repositories                               | Discard and rebuild; never migrate as project facts                                                         |
| Asset usage/history/health metadata                      | Asset services and tree providers                                        | Rebuild recent/availability where possible; archive non-rebuildable user-authored values                    |
| Generated Asset promotion provenance                     | Agent/Canvas/Asset import services                                       | Preserve under generated-output owner without Asset membership                                              |
| Asset package/character export data                      | Assets export services and Entity resolvers                              | Transfer only to existing package/Entity owners with explicit validation                                    |

## Commands, Views, And Public Entry Points

The VS Code manifest audit must remove or replace these catalog-only families while retaining Media Library link/file operations:

- `neko.assets.importFile`, `neko.assets.importFromLibrary`, Asset validation/health/relocation, Asset entity/variant CRUD, Asset history, and Asset membership actions;
- `neko.asset.import` and `neko.addToAssetLibrary` from Canvas;
- `neko.tools.compareAssetVariants` and `neko.assetVariantDiff` unless converted to explicit file/package comparison with no Asset reader;
- Asset Manager/Assets/History views, leaving one Media Library view plus the separately owned Creative Entity browser/Inspector;
- Asset Extension API methods and Agent/TUI `ListAssets`, `GetAsset`, and import/promote operations.

Retained families are Media Library add/relink/remove/refresh/search/open/reveal/copy-reference, direct Canvas/Cut/Agent file use, generated retention, package import, and Creative Entity bind/rebind/inspect operations.

## Test And Fixture Boundary

All tests under the owning modules are migration inputs. Tests that prove catalog success are not mechanically rewritten to new expectations; they are either:

- replaced by canonical locator/binding path tests;
- retained under explicit migration/inspection/rejection suites; or
- deleted with the removed feature.

Critical poison fixtures cover `library.json` runtime loading, `project://assets/` resolution, Asset API/command invocation, Asset search partition success, Asset import/promote, dual `assetRef` fields, and automatic fingerprint relocation.
