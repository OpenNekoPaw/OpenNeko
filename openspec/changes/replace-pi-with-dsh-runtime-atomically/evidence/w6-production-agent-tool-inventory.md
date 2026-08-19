# W6 Production Agent Tool Inventory

## Scope and method

The inventory follows real production registration from packaged DSH profile plugins through reverse ACP
Host dispatch and exact domain services. Documentation, old `TOOL_NAMES`, direct UI operations, DSH base
tools and Evaluation fixtures are not accepted as production OpenNeko Tool evidence.

`quality/agent-tool-inventory.json` is the machine-readable authority. The Agent boundary gate recursively
discovers every `dsh-plugin/src/index.ts` that calls `ctx.tools.register` and requires exact equality with
the inventory.

## Production tools

| Tool | Operations | Schema and validator owner | Permission and authorization | Application and durable owner |
| --- | --- | --- | --- | --- |
| `openneko.generation` | `submit`, `describe` | `@neko/generation` `dsh-tool.ts`; `decodeGenerationDshToolInput` delegates submit validation to the Generation Job codec | ACP permission is owned by `DshPermissionOwner`; reverse Host resolution requires exact DSH Session → Conversation → domain context and exact Workspace grant or configured Assistant Space | `PurposeGenerationJobPort`; durable `GenerationJobStore` and provider task/output facts |
| `openneko.canvas` | `query`, `create-node` | `@neko/canvas-domain` `dsh-tool.ts`; strict normalized `.nkc` path, fingerprint, node and bounded JSON validation | ACP permission is owned by `DshPermissionOwner`; reverse Host resolution requires an exact Workspace Conversation and exact Workspace grant | `CanvasProjectAuthoringService`; authoritative Canvas workspace document and content fingerprint |
| `openneko.cut` | `query`, `apply`, `export-submit`, `export-describe`, `export-cancel` | `@neko/cut-domain` `dsh-tool.ts`; strict normalized `.otio` path, exact fingerprint, bounded semantic command subset and container-matched Workspace-relative export target | ACP permission is owned by `DshPermissionOwner`; reverse Host resolution requires an exact Workspace Conversation and exact Workspace grant | `CutProjectAuthoringService + CutExportApplicationService`; authoritative Cut workspace document, content fingerprint and Workspace-scoped ExportJobStore |

All three tools follow the single path:

`DSH plugin registration → opennekoHostTools reverse request → ACP application client dispatch → package-owned Host adapter → exact context/grant resolver → owning domain service`.

Unknown Tool names fail at ACP dispatch. Neither tool is wrapped in MCP, and direct UI operations continue
to call the same owning domain runtime without creating an Agent turn.

## Explicit exclusions and deletion state

- DSH base tools are third-party runtime capabilities, not OpenNeko first-party domain Tools.
- Assets and media have no current production DSH registration. Their future operation sets must be
  designed from owning domain contracts, not inferred from deleted Pi code or documentation. Cut export is
  included above through the accepted Workspace-scoped Export Job owner; media execution and complete
  visible Desktop/reopen evidence remain open.
- Character and World `AgentCapabilityProvider` wrappers were not production-registered. Their remaining
  source files, tests, public exports, old tool-name constants and package dependencies were deleted in this
  work unit. Character/World application services and durable facts remain available for future typed DSH
  Tool design.
- Evaluation cases still naming `GenerateImage`, `ReadDocument`, `chara.character.fillDraft`,
  `world.world.fillDraft` or Pi runtime facts are W7 test-platform debt, not production registrations.

## Remaining W6 work

The Cut authoring and export Tool part of task 9.2 is recorded in `w6-cut-dsh-authoring-slice.md`; its
real media execution and complete visible Desktop/reopen evidence remain open. Tasks 9.3–9.6 require independent OpenSpec-constrained vertical slices. Character and World additionally
need an exact DSH authoring-target binding contract before their domain services can be exposed; no active
Workspace/Conversation fallback is allowed.

## Evaluation disposition

The original inventory/deletion unit remains `excluded` from real provider Evaluation. The later Cut slice
changes executable Tool behavior and is assigned to the existing `agent-runtime.creative-media-workflow`
suite with an `update` disposition; its real Desktop/provider case is infrastructure-blocked by the W7 DSH
Evaluation driver gap. Deterministic registration, contract and boundary tests are not real Agent behavior
acceptance.

## Verification

Passed on 2026-08-18:

- `pnpm --filter @neko/chara typecheck` and `pnpm --filter @neko/chara test` (43 files, 237 tests).
- `pnpm --filter @neko/world typecheck` and `pnpm --filter @neko/world test` (16 files, 61 tests).
- `pnpm --filter @neko/agent-contracts typecheck` and `pnpm --filter @neko/agent-contracts test`
  (41 files, 206 tests).
- `pnpm --filter @neko/agent-runtime typecheck` and `pnpm --filter @neko/agent-runtime test`
  (41 files, 340 tests).
- `pnpm check:agent-boundaries`, including exact inventory/registration equality and retired provider poison.
- `pnpm check:package-boundaries`, `pnpm check:application-boundaries`, `pnpm check:legacy-debt`,
  `openspec validate replace-pi-with-dsh-runtime-atomically --strict` and `git diff --check`.
- `pnpm test:agent:eval` key-free validation (45 files, 314 tests; 27 suites and 80 dry-run cases after
  adding Cut Tool coverage ownership to the Evaluation selector).

`pnpm check:unused` remains open for W8 task 11.13: after this unit's unlisted workspace dependencies, the
retired Agent runtime dependency and the unused InputArea barrel were corrected, the repository still reports six
unused files and 182 unused exports. None names this inventory, the deleted Character/World providers or their old
tool constants. Real provider/API and visible Desktop Evaluation were not run by explicit development-phase
direction and remain required before release.
