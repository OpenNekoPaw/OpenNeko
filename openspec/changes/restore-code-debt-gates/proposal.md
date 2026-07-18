## Why

Repository debt checks no longer provide a trustworthy cleanup baseline: the global legacy scanner mixes Agent and non-Agent governance, stale ledger paths survive workspace pruning, broad stale patterns report false positives, and Knip excludes several dormant Cut Webview surfaces. This keeps CI red while allowing real dead code and compatibility paths to remain hidden.

## What Changes

- Make legacy-debt classification scope-aware so Agent findings are governed by the Agent boundary register and non-Agent findings by the repository debt ledger.
- Replace broad stale-surface matching with exact identifiers, imports, or removed paths and synchronize ledger entries with the retained workspace.
- Classify explicit rejection diagnostics, presentation defaults, and user-data migration boundaries without treating them as successful legacy fallback paths.
- Remove high-confidence dormant Cut Webview code that has no runtime consumer, including the obsolete Webview tool executor and duplicated audio-effect definitions.
- Reduce broad Knip ignores so future unused files and exports fail visibly.
- Record remaining compatibility bridges with owner, replacement, validation, and removal conditions instead of silently exempting them.

## Capabilities

### New Capabilities

- `code-debt-governance`: Defines trustworthy, scope-aware legacy/dead-code classification, ledger validation, and dormant-code cleanup requirements.

### Modified Capabilities

None.

## Impact

- Quality tooling: `scripts/check-legacy-debt-surfaces.mjs`, `knip.config.ts`, and `quality/ledgers/`.
- Cut Webview: dormant Phase 2 components, duplicated types, and the obsolete Webview-side tool execution path.
- CI: `pnpm check:legacy-debt`, `pnpm check:legacy-debt:ledger`, `pnpm check:unused`, and `pnpm check:quality` become actionable gates again.
- No published API or valuable project data is removed; explicit migration commands and local-data cleanup boundaries remain available until their recorded removal conditions are met.
