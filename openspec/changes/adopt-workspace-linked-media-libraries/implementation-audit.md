## Runtime Audit

### Retained owners

| Responsibility                                                               | Canonical owner                                               | Decision                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace-relative and non-media `${VAR}` expansion                          | `@neko/shared` `PathResolver` and `WorkspaceMediaPathContext` | Retain. Media libraries become ordinary `neko/assets/<libraryName>/...` inputs; `WORKSPACE`, `PROJECT`, `HOME`, `NEKO_HOME`, and unrelated custom variables remain supported. |
| Stable content reads, Engine projection, document entries, and package bytes | `ContentAccess` providers                                     | Retain public contracts. Replace only path authorization and remove media-library lookup inputs.                                                                              |
| Thumbnail, proxy, document-entry, and derived storage                        | `ResourceCache` and current cache providers                   | Retain unchanged in this change.                                                                                                                                              |
| Media-library UI, discovery, search, and semantic scopes                     | Assets Extension                                              | Retain domain ownership. Replace settings-backed roots with direct `neko/assets/` link enumeration and workspace-relative projections.                                        |
| Host filesystem trust decision                                               | Existing Host content path boundary                           | Retain and strengthen with direct-link/final-realpath checks. It must not return or persist physical targets.                                                                 |
| NKC/NKV validation and package byte collection                               | Shared project-file I/O and package service                   | Retain. New writes accept only portable workspace paths; package reads bytes through `ContentAccess`.                                                                         |

### Retired mapping paths

| Legacy path                                                                 | Producers                                              | Consumers                                                        | Required disposition                                                                                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `neko/settings.json.mediaLibraries[]` (`path`, `variable`, `enabled`)       | `MediaLibrarySettingsService.addLibrary/removeLibrary` | Assets, `@neko/host`, TUI                                        | Remove from normal runtime. Read only through explicit legacy inspection/migration.                                                                                                      |
| `.neko/settings.local.json.mediaLibraryOverrides`                           | `setLocalOverride`                                     | Assets, `@neko/host`, TUI                                        | Remove writer and normal reader. Delete only after confirmed migration.                                                                                                                  |
| `ResolvedMediaLibrary.resolvedPath/originalPath/variable/overridden`        | Assets and Host settings composition                   | tree, search, semantic discovery, path maps                      | Replace with link name, workspace-relative link path, and derived availability. No target field may cross the helper boundary.                                                           |
| `createMediaLibraryPathVariableMap` and injected media variables            | Assets, Host, TUI                                      | `PathResolver`, AssetLibrary, metadata/search projection         | Remove. Metadata/search keys use exact workspace-relative paths. Preserve only unrelated variables.                                                                                      |
| `NekoAssetsAPI.getMediaLibraryRoots/getPathVariables` and root-change event | Assets                                                 | Agent, Preview, Canvas, Cut, Tools, shared local-resource access | Remove media-library root exchange. Workspace authorization and ordinary linked paths are sufficient.                                                                                    |
| `ContentMediaLibrarySourceRef.libraryId` lookup semantics                   | Content callers                                        | source-file provider                                             | No runtime lookup or root map. Existing public ContentAccess shape is not redesigned here; path-backed requests must carry the ordinary workspace path and ID-only requests fail closed. |
| package `${VAR}` resolver and absolute/file-URI acceptance                  | package reference scanner                              | Host resolver                                                    | Reject for new project sources. Legacy forms are migration-only and cannot package successfully through runtime fallback.                                                                |

### Current call chain

```text
settings.json + settings.local.json
  -> MediaLibrarySettingsService / workspace-content-settings / TUI policy
  -> ResolvedMediaLibrary + media variable map + absolute roots
  -> Assets tree/search/semantic scopes
  -> NekoAssetsAPI roots/variables
  -> Agent and shared local-resource authorization
  -> WorkspaceMediaPathContext.allowedRoots
  -> ContentAccess / Engine / Preview / package
```

The replacement canonical path is:

```text
neko/assets/<libraryName> direct OS link
  -> readdir/lstat/stat derived library projection
  -> exact workspace-relative source string
  -> ordinary PathResolver candidate
  -> Host direct-link/final-realpath guard
  -> existing ContentAccess / Engine / Preview / package byte reader
```

### NK and Asset persistence findings

- NKC/NKV codecs delegate durable source handling to shared project-file I/O source policies.
- The current source policy accepts all `${VAR}` values and contracts absolute paths to custom variables; media-library variables therefore still succeed in normal authoring.
- `contractDurableSourcePath` also accepts contracted variables and must stop treating a media-library mapping as a portable result.
- Asset/Search projections currently persist keys by contracting absolute target paths through the media variable map. They must instead start from paths under the workspace link.
- Package scanning currently resolves `${VAR}`, absolute paths, and file URIs and records those shapes in provenance. The new path must accept `neko/assets/...`, read target bytes through `ContentAccess`, and reject retired forms before claiming inclusion.

### Guard findings

- Existing authorization is lexical `path.relative` containment against workspace plus externally supplied media roots.
- Lexical workspace containment permits any workspace symlink to escape physically; external-root authorization also exposes target paths as policy facts.
- The replacement guard must resolve the workspace and final requested path, permit physical escape only when the request crosses a direct `neko/assets/<libraryName>` link, resolve that link target dynamically, and require the final realpath to remain under that target.
- Diagnostics must identify the workspace-relative library path and stable error code only. Raw filesystem errors, absolute target paths, and realpaths are not projected.

### Git and package boundary

- Existing Git hygiene owns workspace-local ignore behavior but has no media-link rule.
- Linked libraries are machine-local, so exact `/neko/assets/<libraryName>` rules belong in the repository-local Git exclude file resolved by `git rev-parse --git-path info/exclude`; `.gitignore` remains unchanged.
- Package enumeration must never walk or serialize the link object itself. Only explicitly referenced descendant bytes are read after guard authorization.

## Verification

### Automated gates

| Command                                                                                                                                                                                                                                                     | Result                          | Coverage                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm --filter @neko-agent/extension test --run src/chat/__tests__/agentMessageTurnHandler.test.ts src/chat/__tests__/chatProvider.test.ts src/services/__tests__/externalProcessorHostAdapter.test.ts src/services/__tests__/projectMentionSearch.test.ts` | Passed: 89 tests, 6 skipped     | Agent/Webview roots, canonical mention projection, processor input, retired variable rejection |
| `pnpm --filter neko-cut test --run packages/extension/src/services/ExportService.test.ts packages/extension/src/services/ProjectSessionService.test.ts`                                                                                                     | Passed: 7 tests                 | Real workspace containment, export ContentAccess path, project save rejection                  |
| `pnpm build`                                                                                                                                                                                                                                                | Passed: 10/10 tasks             | Affected package and extension production builds                                               |
| `pnpm test`                                                                                                                                                                                                                                                 | Passed: 25/25 tasks             | Full repository test graph                                                                     |
| `pnpm check`                                                                                                                                                                                                                                                | Passed: 0 dependency violations | Knip and dependency-cruiser boundaries                                                         |
| `pnpm check:legacy-debt`                                                                                                                                                                                                                                    | Passed: 0 blocking findings     | Retired runtime mapping and fallback surfaces                                                  |
| `pnpm check:unused`                                                                                                                                                                                                                                         | Passed                          | No unused implementation; one pre-existing Knip configuration hint remains                     |

### Extension Development Host acceptance

- Scenario: `workspace-linked-media-library`
- Host: VS Code 1.129.1 Extension Development Host with an isolated synthetic Git workspace and synthetic external target.
- Evidence: gitignored `reports/webview-functional/workspace-linked-media-acceptance/result.json`.
- Result: passed all 12 path-level assertions. The Host created and enumerated `neko/assets/Books`, the OS followed the link, Assets and the Agent mention projector emitted only `neko/assets/Books/clips/linked.mp4`, package output contained the referenced bytes, and `${MEDIA}` remained an unsupported reference.
- Non-disclosure: Assets, Agent, package manifest, archive bytes, and the exact local Git exclude rule contained no physical target. The report recorded `physicalTargetDisclosed: false`.

## Quality Review

- Risk: L3 because the change crosses shared path authorization, NK source contracts, Agent projection, and package/export behavior.
- Responsibility: the OS owns link following; the bounded Host helper owns link mutation; the existing Host content boundary owns authorization and reads; feature packages consume ordinary workspace paths.
- Dependency/interface: no feature package gained a second path resolver or cache owner, and ContentAccess/ResourceCache public contracts remain unchanged.
- Extension/testing: platform differences stay inside the link helper; canonical and retired paths have unit, integration, full-repository, and Extension Host evidence.
- Residual risk: Windows junction behavior is covered by platform-branch tests but was not executed on this macOS host. Existing bundle-size, Browserslist, React `act(...)`, and Knip configuration warnings are unrelated and non-blocking.

## Post-Implementation Asset Tree Regression

- Root cause: managed Asset and recent-history TreeItems passed durable workspace-relative `AssetFile.path` values directly to `vscode.Uri.file()`. VS Code interpreted `neko/assets/<libraryName>/...` as root-absolute `/neko/assets/<libraryName>/...`, bypassing the existing AssetLibrary workspace projection and causing Preview to report `No existing local file matched the media path candidates.`
- Fix: both TreeView providers now resolve stored paths through `AssetLibrary.resolvePath()` only at the Extension Host resource/thumbnail boundary. Durable Asset facts remain unchanged and no media-library resolver, target mapping, variable, or compatibility branch was added.
- Path evidence: focused tests assert the canonical resolver is invoked for entity, variant, recent-history, and thumbnail paths and explicitly reject root-absolute `/neko/assets/...` projections.
- Automated verification: `pnpm --filter neko-assets test --run src/providers/AssetManagerTreeProvider.test.ts src/providers/AssetHistoryTreeProvider.test.ts` passed 3 tests; focused strict TypeScript validation passed with `strict`, `noUncheckedIndexedAccess`, and `noImplicitOverride`; `pnpm --filter neko-assets test` passed 70 tests; `pnpm build` passed 10/10 tasks.
- Extension Development Host: after reloading the already-running VS Code host, opening the imported EPUB from `Assets > Documents` rendered `Section 1` in the EPUB Preview. No missing-file diagnostic or Neko Preview error occurred. A separate built-in Git symlink-pathspec failure was later reproduced and is tracked below.

## Derived Search Projection Repair

- Root cause: the local metadata media-library partition still contained `${A}/...` file keys. `createLocalMetadataMediaLibrarySearchIndexStore().load()` applied the strict save assertion and threw, so warmup stopped before the existing rebuild path could replace the derived partition. Agent correctly rejected those non-linked candidates.
- Fix: load now treats any malformed, non-`neko/assets/...`, or internally inconsistent media-library document as an incompatible whole partition and returns `undefined`; `MediaLibrarySearchService` then uses its existing filesystem rebuild and `replaceSearchPartition` path. Save-time validation remains strict and no legacy resolver or per-entry fallback was added.
- Deterministic regression: `MediaLibrarySearchService.test.ts` drives `load -> filesystem rebuild -> replace partition` with a real temporary workspace, poisons the persisted partition with `${A}/...`, and asserts the replacement contains only `neko/assets/B/epub/book.epub`.
- Runtime evidence: after restarting the already-open Extension Development Host, the current workspace partition changed automatically from `146 total / 0 linked / 146 legacy` to `146 total / 146 linked / 0 legacy`; the database was not manually edited.
- Agent Evaluation disposition: `excluded`. The change is deterministic derived-index validation/rebuild and does not alter prompt composition, Skill/capability routing, tools, provider/model selection, AgentSession behavior, or event projection. The focused store/service regression plus runtime partition assertions cover the changed contract.

## VS Code Git Symlink Pathspec Boundary

- Exact reproduction: `git check-ignore -v --no-index <workspace>/neko/assets/B/.../book.epub` returns exit 128 with `fatal: pathspec ... is beyond a symbolic link`, matching the Extension Host rejected promise. The failure occurs before ignore matching.
- Source: VS Code built-in `vscode.git` file decorations call the same check-ignore path. Neko's `VscodeGitService` is only used by explicit Asset diff/history operations and is not the automatic producer.
- Bounded fix: media-library, managed Asset, and recent Asset TreeItems keep their open/preview command URI but no longer declare `resourceUri`; recent-Asset context commands use the item-owned `fileUri`. Focused tests assert command behavior and absence of decoration URI.
- Runtime evidence: expanding the media-library tree through a directory that materialized linked EPUB TreeItems added `0` new `beyond a symbolic link` messages. Clicking a different EPUB and opening its ordinary `file:` URI added `1` new message, proving the remaining trigger is the VS Code editor/Explorer resource rather than the Neko TreeItem.
- Prior decision point: exact link ignore, ignoring the whole parent, and nesting a link beneath an ignored real directory all fail at Git pathspec validation. The accepted resolution keeps direct links and ordinary `file:` URIs, and offers an explicit workspace-scoped Git decoration setting change. Physical target projection, swallowed rejected promises, and a second filesystem path remain rejected.

## Link Mutation And Host Compatibility Completion

- Git decoration compatibility is owned by `WorkspaceGitDecorationCompatibilityService`. When a linked library exists and workspace Git decorations remain enabled, Assets prompts at most once, explains the workspace-wide visual impact, and writes `git.decorations.enabled=false` only after explicit confirmation with `ConfigurationTarget.Workspace`. Declining or closing leaves the setting unchanged, and the contributed command remains available for a later explicit action.
- Every add/remove/relink event invalidates the in-memory media index and starts a revision-fenced whole-partition rebuild. The next `search()` waits for that rebuild; a focused test poisons the old persisted projection, mutates `old.epub` to `new.epub`, and proves the next result and save contain only the post-mutation path while `load()` remains single-shot.
- Relink UI now states before directory selection that all saved `neko/assets/<name>/...` references remain unchanged and the replacement must preserve internal structure. No project fact rewrite or similarity lookup occurs.
- Active EPUB preview entry reads map linked-source `ENOENT` and `ENOTDIR` failures to a target-free `404 document file not found` response. Other unknown failures still propagate to the existing classified 500 path instead of being silently hidden.
- Focused verification passed: Assets compatibility/search/link/tree tests (10 tests), Preview protocol/server tests (34 tests), `neko-assets` compile, `neko-preview` compile, and `git diff --check`.
- `vscode-extension-debugger` discovered the already-running Extension Development Host on port 9222. Its active `neko-test` workspace contains non-fixture user documents, so no new DOM, screenshot, console capture, or automatic workspace-setting mutation was performed; the earlier isolated 12-assertion link acceptance remains the runtime evidence for link/path/package non-disclosure. Git-setting prompt interaction retains a residual manual runtime check in a future isolated fixture Host.

### Follow-up verification

| Command                             | Result                                                                                                                        | Coverage                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm --filter neko-assets test`    | Passed: 72 tests                                                                                                              | stale projection rebuild, three TreeItem producers, existing Assets behavior                    |
| `pnpm --filter neko-assets compile` | Passed                                                                                                                        | Extension bundle                                                                                |
| `pnpm build`                        | Passed: 10/10 tasks                                                                                                           | repository production build graph                                                               |
| `pnpm test`                         | Passed: 25/25 tasks                                                                                                           | full repository test graph                                                                      |
| `pnpm check`                        | Passed: 0 dependency violations                                                                                               | unused and dependency boundaries; one existing Knip configuration hint                          |
| `git diff --check`                  | Passed                                                                                                                        | patch whitespace                                                                                |
| `pnpm check:legacy-debt`            | Blocked by 16 `migrate-now` matches in gitignored `reports/webview-functional/workspace-linked-media-acceptance/extension.ts` | generated acceptance fixture, not production source; no `delete-now` or `needs-review` findings |

- Strict TypeScript note: `neko-assets` has no package-level tsconfig. A temporary strict whole-package check also reaches existing extension/test typing debt outside this change; the directly exposed widened test literal and nullable post-warmup index were corrected. Production build, package tests, and full repository gates above pass.
