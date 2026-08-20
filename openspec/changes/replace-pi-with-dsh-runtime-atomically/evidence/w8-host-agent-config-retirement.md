# W8 Host Agent Configuration Retirement

Date: 2026-08-20

## Decision

The old Host `mcp_servers` and `external_research` configuration formed a closed loop inside
`@neko/host/settings`: TOML parsing, normalization, effective snapshot projection and CRUD APIs had no
production execution consumer. Retaining the loop would preserve an OpenNeko MCP/config authority beside
DSH without providing a valid DSH management seam.

The slice therefore deletes rather than adapts:

- `MCPServerConfig`, `MCPServerPreset` and Host MCP CRUD/public config APIs;
- the Agent `external-research` contract and its root export;
- TOML decode/encode and effective Agent snapshot fields for both old configuration sections;
- workspace-path substitution that existed only for Host-owned MCP process arguments;
- stale Browser/Computer Plugin manifest version allowances for already deleted package resources.

Standard ACP/DSH lifecycle requests still carry `mcpServers: []`. That is a third-party protocol field used
to assert no per-request MCP override; it is not restored Host configuration or a second MCP manager.

## Failure And Data Boundary

An existing `mcp_servers` or `external_research` TOML field is ignored only within that retired field and
produces an `invalidConfigField` diagnostic naming the exact key. Valid provider/model/default siblings are
still projected. The parser does not reinterpret the old value, start a process, write DSH storage, select a
fallback provider or make the whole configuration unreadable.

Future saves serialize only the canonical configuration shape and do not write the retired fields back.
This is the canonical reset behavior for non-authoritative retired settings, not a migration or compatibility
reader.

## Architecture Review

- Responsibility: DSH owns MCP discovery/config/execution; Host owns provider/model credentials and product
  settings only.
- Dependency: removing the dead Agent contract types narrows Host-to-Agent coupling and does not cross the
  Electron renderer/Main boundary.
- Interface: `UnifiedConfig`, `NormalizedConfig`, `ConfigManager`, `IUserConfigManager` and the effective
  Agent snapshot now expose one canonical provider/model shape.
- Extension: a future DSH management surface must enter through the frozen secret-safe DSH bridge contract;
  the old Host keys cannot be reused as a shortcut.
- Testing: exact retired-field diagnostics, sibling preservation, non-serialization, public path poison and
  package/Desktop type checks cover the deletion boundary.

No Webview, React component, DOM/CSS contract or product UI file was modified.

## Evaluation Disposition

`excluded`: this removes an unreachable configuration loop and adds deterministic rejection. It does not
change a prompt, DSH Session operation, provider/model selection, Tool registration or Desktop event
projection. Host tests, package type checks, Agent boundary poison and the key-free Evaluation dry-run are
the applicable evidence. No mock or dry-run result is claimed as real Agent behavior acceptance.

## Verification

```text
pnpm --dir packages/host exec tsc --noEmit
PASS

pnpm --dir packages/host test
PASS: 38 files / 320 tests

pnpm --dir packages/agent/contracts run typecheck
PASS

pnpm --dir packages/agent/contracts run test
PASS: 40 files / 210 tests

pnpm --dir packages/agent/runtime run typecheck
PASS

pnpm --dir packages/agent/runtime run test
PASS: 50 files / 379 tests

pnpm --dir apps/neko-desktop run typecheck
PASS

pnpm check:agent-boundaries
PASS: 12 tests; 360 source/Evaluation files; 14 extension evidence inputs

pnpm test:agent:eval
PASS: 45 files / 314 tests; 26 suites / 65 cases

pnpm check:legacy-debt
PASS: 0 blocking production findings

pnpm check:application-boundaries
PASS: 1392 files

pnpm check:package-boundaries
PASS: 54 packages

pnpm check:storage-authorities
PASS: 1397 sources; 0 non-canonical database paths

pnpm check:openspec
PASS: 112 items
```

The boundary scanner now rejects restoration of the deleted Agent/Host files and any file below the old
`resources/extensions/plugins` directory. Its fixture proves an empty retired directory is harmless while a
restored Plugin resource fails.

## Residual Risk

- Public DSH Skill/MCP inventory/config/readiness remains blocked on the rc.7 public seam under tasks 4.7 and
  6.9; this deletion does not claim that feature complete.
- `check:unused` remains blocked by 6 existing unused files, 1 existing unused dependency, 2 unrelated
  unlisted test dependencies and 180 existing unused exports. The newly introduced direct `@electron/asar`
  scanner dependency is now declared and no longer appears as unlisted.
- `check:no-internal-versioning` remains blocked by 74 wider-worktree new occurrences and 14 stale
  allowances. No baseline or unrelated allowance was regenerated to hide those failures.
- Task 11.15 stays open until the remaining Prompt/Input/Capability/Plugin/Perception public contracts and
  retained extension-management consumers are audited against their current owners.
