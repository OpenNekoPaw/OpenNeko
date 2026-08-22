# W6 Production Agent Tool Inventory

## Scope and method

The inventory follows real production registration from packaged DSH profile plugins through reverse ACP
Host dispatch and exact domain services. Documentation, old `TOOL_NAMES`, direct UI operations, DSH base
tools and Evaluation fixtures are not accepted as production OpenNeko Tool evidence.

`quality/agent-tool-inventory.json` is intended to be the machine-readable authority. The current Agent
boundary gate recursively discovers each `dsh-plugin/src/index.ts` containing `ctx.tools.register`, but counts
files rather than individual Tool identities. It therefore misses a second registration in the same file and
is not yet a complete release guard.

## Production tools

| Tool | Operations | Schema and validator owner | Permission and authorization | Application and durable owner |
| --- | --- | --- | --- | --- |
| `openneko.world` | `query`, `fill-draft` | `@neko/world/application` `world-dsh-tool.ts`; exact WorldProject target and canonical WorldDefinition validation | ACP permission is owned by `DshPermissionOwner`; reverse Host resolution requires exact Conversation authoring context, Workspace grant and WorldProject identity | `WorldDshAuthoringService + WorldAuthoringService`; authoritative World project facts |
| `openneko.character` | `query`, `fill-draft` | `@neko/chara/application` `character-dsh-tool.ts`; exact CharacterProject target and canonical CharacterDefinition validation | ACP permission is owned by `DshPermissionOwner`; reverse Host resolution requires exact Conversation authoring context, Workspace grant and CharacterProject identity | `CharacterDshAuthoringService + CharacterAuthoringService`; authoritative Character project/version lifecycle facts |
| `openneko.document` | `read`, `continue`, `read-images` | `@neko/content/document` `dsh-tool.ts`; strict ContentLocator, cursor/range and bounded document result validation | ACP permission is owned by `DshPermissionOwner`; reverse Host resolution requires the exact Conversation content authority | `AgentContentAccessRuntime + DocumentAccessService`; Content document authority |
| `openneko.read_image` | `read` | `@neko/content` `image-dsh-tool.ts`; exact ContentLocator, attachment and bounded image chunk validation | ACP permission is owned by `DshPermissionOwner`; reverse Host resolution requires the exact Conversation content authority and a model advertising image input | `ContentImageDshHostAdapter + AgentContentAccessRuntime`; DSH attachment identity and Content image authority |
| `openneko.generation` | `submit`, `describe` | `@neko/generation` `dsh-tool.ts`; `decodeGenerationDshToolInput` delegates submit validation to the Generation Job codec | ACP permission is owned by `DshPermissionOwner`; reverse Host resolution requires exact DSH Session → Conversation → domain context and exact Workspace grant or configured Assistant Space | `PurposeGenerationJobPort`; durable `GenerationJobStore` and provider task/output facts |
| `openneko.canvas` | `query`, `create-node` | `@neko/canvas-domain` `dsh-tool.ts`; strict normalized `.nkc` path, fingerprint, node and bounded JSON validation | ACP permission is owned by `DshPermissionOwner`; reverse Host resolution requires an exact Workspace Conversation and exact Workspace grant | `CanvasProjectAuthoringService`; authoritative Canvas workspace document and content fingerprint |
| `openneko.cut` | `query`, `apply`, `export-submit`, `export-describe`, `export-cancel` | `@neko/cut-domain` `dsh-tool.ts`; strict normalized `.otio` path, exact fingerprint, bounded semantic command subset and container-matched Workspace-relative export target | ACP permission is owned by `DshPermissionOwner`; reverse Host resolution requires an exact Workspace Conversation and exact Workspace grant | `CutProjectAuthoringService + CutExportApplicationService`; authoritative Cut workspace document, content fingerprint and Workspace-scoped ExportJobStore |

All seven tools follow the single path:

`DSH plugin registration → opennekoHostTools reverse request → ACP application client dispatch → package-owned Host adapter → exact context/grant resolver → owning domain service`.

Unknown Tool names fail at ACP dispatch. None is wrapped in MCP, and direct UI operations continue
to call the same owning domain runtime without creating an Agent turn.

## Explicit exclusions and deletion state

- DSH base tools are third-party runtime capabilities, not OpenNeko first-party domain Tools.
- Assets has no current production DSH registration. Its future operation set must be designed from the
  Assets owning contract rather than inferred from deleted Pi code or documentation. Cut export is included
  above through the accepted Workspace-scoped Export Job owner; media execution and complete visible
  Desktop/reopen evidence remain open.
- Retired Character and World `AgentCapabilityProvider` wrappers remain deleted. Their current production
  paths are the typed `openneko.character` and `openneko.world` registrations listed above.

## Remaining W6 work

The Cut authoring/export implementation, Character/World authoring target contracts and Content document/image
registrations now exist. Their remaining visible/provider acceptance stays in tasks 9.2, 9.4 and 9.5. Task 9.6
also remains open because the machine inventory omits `openneko.read_image`, while task 9.7 requires an
identity-level registration scan rather than one row per plugin file.

## Current inventory gate blocker

`packages/content/dsh-plugin/src/index.ts` registers both `openneko.document` and `openneko.read_image`.
`quality/agent-tool-inventory.json` records only the former, and `findDshToolRegistrations()` returns one path
per plugin file regardless of the number of registrations in that file. Consequently
`pnpm check:agent-boundaries` currently passes an incomplete inventory. Release closure requires adding the
missing Tool identity and changing the gate to compare every registered Tool identity and operation set,
including missing, duplicate and extra registration negative fixtures.

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
- `pnpm check:agent-boundaries`, including the then-current file-level inventory/registration equality and
  retired provider poison. The later `openneko.read_image` audit shows that this historical pass did not
  enumerate multiple Tool identities in one plugin file and is not final release evidence.
- `pnpm check:package-boundaries`, `pnpm check:application-boundaries`, `pnpm check:legacy-debt`,
  `openspec validate replace-pi-with-dsh-runtime-atomically --strict` and `git diff --check`.
- `pnpm test:agent:eval` key-free validation (45 files, 314 tests; 27 suites and 80 dry-run cases after
  adding Cut Tool coverage ownership to the Evaluation selector).

`pnpm check:unused` remains open for W8 task 11.13: after this unit's unlisted workspace dependencies, the
retired Agent runtime dependency and the unused InputArea barrel were corrected, the repository still reports six
unused files and 182 unused exports. None names this inventory, the deleted Character/World providers or their old
tool constants. Real provider/API and visible Desktop Evaluation were not run by explicit development-phase
direction and remain required before release.
