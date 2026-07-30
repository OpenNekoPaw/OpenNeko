## Retained Package Moves

| Source                                     | Target                            | Package identity          | Desktop direct dependency |
| ------------------------------------------ | --------------------------------- | ------------------------- | ------------------------- |
| `packages/neko-agent/packages/agent`       | `packages/neko-agent-runtime`     | `@neko/agent`             | yes                       |
| `packages/neko-agent/packages/agent-types` | `packages/neko-agent-types`       | `@neko-agent/types`       | yes                       |
| `packages/neko-agent/packages/ai-sdk`      | `packages/neko-ai-sdk`            | `@neko/ai-sdk`            | transitive                |
| `packages/neko-agent/packages/platform`    | `packages/neko-platform`          | `@neko/platform`          | yes                       |
| `packages/neko-agent/packages/webview`     | `packages/neko-agent-webview`     | `@neko-agent/webview`     | yes                       |
| `packages/neko-agent/test-utils`           | `packages/neko-agent-test-utils`  | `@neko-agent/test-utils`  | test-only                 |
| `packages/neko-canvas/packages/domain`     | `packages/neko-canvas-domain`     | `@neko-canvas/domain`     | yes                       |
| `packages/neko-canvas/packages/webview`    | `packages/neko-canvas-webview`    | `@neko-canvas/webview`    | yes                       |
| `packages/neko-cut/packages/domain`        | `packages/neko-cut-domain`        | `@neko-cut/domain`        | yes                       |
| `packages/neko-cut/packages/node`          | `packages/neko-cut-node`          | `@neko-cut/node`          | yes                       |
| `packages/neko-cut/packages/webview`       | `packages/neko-cut-webview`       | `@neko/webview`           | yes                       |
| `packages/neko-preview/packages/contracts` | `packages/neko-preview-contracts` | `@neko-preview/contracts` | yes                       |
| `packages/neko-preview/packages/webview`   | `packages/neko-preview-webview`   | `@neko/preview-webview`   | yes                       |
| `packages/neko-tools/packages/contracts`   | `packages/neko-tools-contracts`   | `@neko-tools/contracts`   | transitive                |
| `packages/neko-tools/packages/webview`     | `packages/neko-tools-webview`     | `@neko-tools/webview`     | transitive                |

## Already First-Level Desktop Dependencies

`neko-assets`, `@neko/entity`, `@neko/generation`, `@neko/host`, `@neko/media`,
`@neko/shared` and `@neko/ui` already resolve from first-level packages. No second owner or target
package is required.

## Removed Package Owners

- `packages/neko-agent/packages/extension`
- `packages/neko-canvas/packages/extension`
- `packages/neko-cut/packages/extension`
- `packages/neko-tools/packages/extension`
- `packages/neko-preview/packages/extension`

The aggregate roots `packages/neko-agent`, `packages/neko-canvas`, `packages/neko-cut`,
`packages/neko-preview` and `packages/neko-tools` currently own VSIX manifests/build scripts rather
than a retained runtime identity. After their child packages and package documentation move, these
roots are deleted. They MUST NOT remain as empty packages, compatibility aliases or no-op build
targets.

## Documentation Ownership

- Agent, Canvas, Cut and Preview domain architecture belongs under the existing matching
  `docs/domains/<domain>/` entry.
- Package implementation notes move with the relevant first-level runtime or Webview package.
- VS Code Extension authoring/package notes are removed rather than copied into Desktop.
- Historical archived OpenSpec evidence remains historical and does not count as an executable host
  path.
