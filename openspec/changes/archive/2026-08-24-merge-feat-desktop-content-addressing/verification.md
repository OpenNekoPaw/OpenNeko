## Verification

- `pnpm --filter @neko/content test && pnpm --filter @neko/content typecheck`: passed, 22 files and 148 tests.
- `pnpm --filter @neko/canvas-domain test && pnpm --filter @neko/canvas-domain typecheck`: passed, 38 files and 317 tests.
- Focused Desktop DSH content, Workspace Board delivery and Session Host tests: passed, 3 files and 53 tests.
- Strict OpenSpec validation passed after the active-change reconciliation.

The canonical `ContentLocator` remains owned by `@neko/content`; Canvas and Desktop consume that public
contract, while DSH continues to own Agent Session and Tool execution. Invalid authority, shape, path or
selector input fails at the owning content boundary and cannot select an active Workspace or retired runtime.

Residual risk is limited to broader product paths outside this focused contract migration. No real-provider
behavior claim is made by these deterministic tests.
