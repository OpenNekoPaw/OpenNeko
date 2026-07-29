## State, storage and runtime-closure inventory

Date: 2026-07-29

### Stable feature identities

| Feature | `StateNamespaceId`  | Resource namespace           |
| ------- | ------------------- | ---------------------------- |
| Tools   | `neko.neko-tools`   | `dist/features/neko-tools`   |
| Preview | `neko.neko-preview` | `dist/features/neko-preview` |
| Assets  | `neko.neko-assets`  | `dist/features/neko-assets`  |
| Cut     | `neko.neko-cut`     | `dist/features/neko-cut`     |
| Canvas  | `neko.neko-canvas`  | `dist/features/neko-canvas`  |
| Agent   | `neko.neko-agent`   | `dist/features/neko-agent`   |

For the prior single-VSIX scoped context and the current feature context:

- workspace memento keys are exactly
  `<StateNamespaceId>:<feature-key>`;
- global-storage roots are exactly
  `<application-global-storage>/features/<StateNamespaceId>`.

These are identity reuse, not extension discovery and not a copy migration.

`apps/neko-vscode/src/state-layout.ts` is the executable versioned mapping for
these six identities. Activation validates the complete layout before recording
the root application `globalState` marker `openneko.state-layout` with schema
`openneko.state-layout.v1`. The marker is the final write. A malformed,
conflicting or future marker fails activation without changing feature mementos,
storage, project files, settings, credentials or caches; an interrupted marker
write is safe to retry.

### Retained memento keys

| Owner   | Feature-local key                                                               | Durable application key                          | Disposition                                                             |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| Tools   | `mediaDiff.localCompareFiles`                                                   | `neko.neko-tools:mediaDiff.localCompareFiles`    | exact identity reuse                                                    |
| Preview | `preview:state:<document-uri>`                                                  | `neko.neko-preview:preview:state:<document-uri>` | exact identity reuse; recoverable reading progress                      |
| Preview | `neko.preview.3d-reference.staging.v<schema>:<subject>`                         | prefixed by `neko.neko-preview:`                 | exact identity reuse; schema validator rejects malformed values         |
| Assets  | `neko.mediaLibrary.recentLocators`                                              | prefixed by `neko.neko-assets:`                  | exact identity reuse                                                    |
| Assets  | `workspace-linked-media-libraries.git-integration-prompted.v2:<workspace-uri>`  | prefixed by `neko.neko-assets:`                  | exact identity reuse                                                    |
| Assets  | `workspace-linked-media-libraries.git-integration-ownership.v1:<workspace-uri>` | prefixed by `neko.neko-assets:`                  | exact identity reuse; pending/owned transaction is validated            |
| Agent   | `neko.tabState`                                                                 | `neko.neko-agent:neko.tabState`                  | exact identity reuse                                                    |
| Agent   | `neko.tabState.writeMetadata`                                                   | `neko.neko-agent:neko.tabState.writeMetadata`    | exact identity reuse                                                    |
| Agent   | `neko.agent.conversationSettings.v1.<conversation-id>`                          | prefixed by `neko.neko-agent:`                   | exact identity reuse and versioned payload                              |
| Agent   | legacy `conversations`                                                          | prefixed by `neko.neko-agent:`                   | explicit obsolete-state cleanup; no transcript fallback                 |
| Agent   | legacy `neko.agent.canvasBoardBindings.v1`                                      | prefixed by `neko.neko-agent:`                   | explicit obsolete-state cleanup; SQLite/board contract is authoritative |

No production feature currently consumes the former scoped `globalState`,
`SecretStorage`, `storageUri` or `logUri` projections. They must not be restored
to the minimum feature context without a real consumer and a separate identity
entry.

The application derives each feature scope from the one real
`ExtensionContext` and exposes only `resourceUri`, namespaced `workspaceState`,
namespaced `globalStorageUri`, `extensionMode`, the feature registration
`AbortSignal`, and the feature-owned disposable collection. Logger and
diagnostic adapters are created by their owning feature or capability
contribution; secrets and workspace IO are not implicit members of this
projection.

### Filesystem and database state

| Owner            | Identity                                                                        | Disposition and protection                                                              |
| ---------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Tools            | `<feature-global-storage>/temp/media-diff`                                      | rebuildable temporary data; remove only through owner cleanup                           |
| Preview          | `<feature-global-storage>/...` model/3D-reference materialization               | rebuildable cache; source assets remain untouched                                       |
| Cut              | `<feature-global-storage>/cut-media-runtime`                                    | rebuildable FFmpeg preview/thumbnail cache                                              |
| Canvas           | `<workspace>/.neko/.cache` or `<feature-global-storage>/projected-canvas-cache` | rebuildable projection cache; project `.nkc` files are authoritative                    |
| Agent/Canvas/Cut | user LocalMetadata database from `resolveGlobalStorageLayout(<home>)`           | persistent product fact store; existing namespace migrations are transactional          |
| Agent            | `<home>/.neko` credential/config/process registry                               | stable user-level identity shared with TUI; never copied into feature storage or logged |
| Agent            | `<workspace>/.neko/semantic-index`, processors and cache roots                  | project/user data boundary; project files and source metadata are preserved on failure  |
| Generation       | workspace generated-output directories and durable ResourceRefs                 | authoritative generated files are preserved when projection/index migration fails       |

Standalone legacy extensions have separate VS Code-owned memento databases that
the application cannot access through the public API. The application must not
read VS Code's internal state database. Conflict diagnostics therefore require
the user to remove standalone extensions, disclose that ephemeral package-local
UI state may reset, and preserve workspace files, settings, user credentials
and product LocalMetadata.

### Settings and credentials

- VS Code settings retain their public keys listed in
  `contribution-inventory.md`; consolidation does not rename or delete them.
- Agent provider credentials are owned by the user-level SQLite credential
  store under `<home>/.neko`, not by feature `SecretStorage`.
- Secret values, API keys and credential metadata must never appear in migration
  diagnostics, logs or evaluation facts.
- State-layout verification does not read or write SecretStorage. There are no
  retained scoped secret keys, and user-level credentials remain under
  `<home>/.neko`.

### Verification fixtures

`apps/neko-vscode/src/state-layout.test.ts` covers clean install, exact identity
reuse, marker commit, already-current idempotence, destination marker conflict,
malformed/duplicate mappings, interrupted marker commit, retry, source-state
preservation and secret-safe diagnostics. Because this cutover performs no file
copy/rename and no setting or credential writes, a state-layout failure cannot
modify project files, public VS Code settings, `<home>/.neko`, LocalMetadata or
the rebuildable caches listed below.

### Runtime closure and native payloads

| Artifact                 | Canonical identity                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| application Node closure | `apps/neko-vscode/dist/runtime-closure.json`, schema `openneko.application-runtime-closure.v1` |
| packaged media runtime   | verified target bundle supplied through `NEKO_MEDIA_RUNTIME_ROOT`                              |
| supported targets        | `darwin-arm64`, `linux-x64`                                                                    |
| Sharp closure            | application-owned target-specific `dist/node_modules` entries declared by the runtime closure  |
| Webview/resource roots   | the six application feature resource namespaces listed above                                   |

The final archive must contain one target closure and no internal VSIX,
standalone feature manifest, cross-target binary or checkout-resolved module.
