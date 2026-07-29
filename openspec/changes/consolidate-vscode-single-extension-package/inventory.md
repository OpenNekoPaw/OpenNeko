# Migration Inventory

Status: implementation baseline

This inventory is the authoritative disposition input for the single-extension
cutover. Paths describe the pre-cutover tree.

## Application and feature delivery

| Owner | Current extension entry | Current contribution owner | Target disposition |
| --- | --- | --- | --- |
| App | `apps/neko-vscode/src/extension.ts` | generated from feature manifests | sole `activate` / `deactivate`, manifest and VSIX owner |
| Tools | `packages/neko-tools/src/extension.ts` | `packages/neko-tools/package.json` | `apps/neko-vscode/src/features/tools` |
| Preview | `apps/neko-vscode/src/features/preview/extension.ts` | `packages/neko-preview/package.json` | `apps/neko-vscode/src/features/preview` |
| Assets | `apps/neko-vscode/src/features/assets/extension.ts` | `packages/neko-assets/package.json` | `apps/neko-vscode/src/features/assets` |
| Cut | `apps/neko-vscode/src/features/cut/extension.ts` | `packages/neko-cut/package.json` | `apps/neko-vscode/src/features/cut` |
| Canvas | `apps/neko-vscode/src/features/canvas/extension.ts` | `packages/neko-canvas/package.json` | `apps/neko-vscode/src/features/canvas` |
| Agent | `apps/neko-vscode/src/features/agent/index.ts` | `packages/neko-agent/package.json` | `apps/neko-vscode/src/features/agent` |

The pre-cutover packager creates one temporary VSIX per feature, extracts it
under `dist/features/<package>`, dynamically requires each `extension.js`, and
installs `EmbeddedFeatureRegistry` plus a simulated scoped `ExtensionContext`.
All of those paths are removal targets.

External extension discovery such as `vscode.git` remains valid. Internal
`neko.*` extension discovery is a removal target and must be replaced by typed
composition dependencies.

## Nested workspace disposition

| Current package | Evidence-based disposition |
| --- | --- |
| `@neko/agent` | promote to top-level; consumed by TUI, VS Code and Agent platform |
| `@neko-agent/types` | promote to top-level; consumed by Agent packages, TUI and Character |
| `@neko/ai-sdk` | promote to top-level; consumed by TUI, Agent platform and Agent runtime |
| `@neko/platform` | promote to top-level; consumed by TUI and VS Code composition |
| `@neko-agent/extension` | move to VS Code App |
| `@neko-agent/webview` | promote to top-level UI package |
| `@neko-agent/test-utils` | promote to top-level test package while TUI remains a real consumer |
| `@neko-canvas/domain` | promote to top-level; consumed by TUI and Canvas runtimes |
| `@neko-canvas/extension` | move to VS Code App |
| `@neko-canvas/webview` | promote to top-level UI package |
| `@neko-cut/domain` | promote to top-level domain package |
| `@neko-cut/extension` | move to VS Code App |
| `@neko/webview` | promote and rename physical directory to Cut-owned UI package; npm identity is preserved during the move |
| `@neko/preview-webview` | promote to top-level UI package |
| `@neko-tools/contracts` | merge or promote according to final consumer check; it currently serves Tools host and Webview |
| `@neko-tools/extension` | move to VS Code App |
| `@neko-tools/webview` | promote to top-level UI package |

## Durable state identities

The current scoped context generates:

- memento and secret keys prefixed with `neko.<feature>:`;
- workspace/global storage children under `features/neko.<feature>`;
- log children under `features/neko.<feature>`.

The exact historical strings become durable `StateNamespaceId` values. They no
longer represent installable extension IDs and must not participate in
extension discovery. The preferred migration is identity reuse. Any owner that
changes a key or layout must add a versioned, idempotent mapping whose marker is
committed last.

State owners requiring focused fixtures include Preview reading/model staging,
Tools media comparison state, Agent chat/settings state, Canvas projected media
and board metadata, Cut media/export state, credentials, generated outputs and
workspace/global storage caches.

## Runtime and resource closure

The final application staging tree must own:

- the single Extension Host bundle;
- feature Webview bundles, localization, icons, themes, language configuration,
  schemas and builtin Agent Skills;
- exact-target FFmpeg, Sharp, document parser and other declared runtime
  dependencies;
- one versioned runtime-closure manifest.

Missing resources, duplicate contribution identities, cross-target binaries,
checkout-external resolution and undeclared runtime imports are packaging
failures.

## Follow-on boundary

`@neko/shared` decomposition is deliberately excluded from this cutover. Before
moving its domain, React, VS Code, local-metadata or project exports, create the
independent `decompose-neko-shared-ownership` OpenSpec with an export/consumer
inventory and no-fallback migration plan.
