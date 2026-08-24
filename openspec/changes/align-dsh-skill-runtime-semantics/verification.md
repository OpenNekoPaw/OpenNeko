# Verification snapshot

## Completed evidence

- Exact Workspace cwd now crosses the canonical Conversation publication, activation, ACP and Desktop authorization path; Renderer receives no physical root.
- Session input catalog and explicit invocation use one exact-Agent scoped DSH snapshot helper. Extension management is explicitly labeled as the global catalog.
- One ordered `skills` request carries every leading explicit Skill selection through Webview, Desktop, runtime and bridge, where DSH-native `/skill` gestures are submitted in one turn.
- The locked `FileSystemSkillProvider` contract fixture covers directory/flat discovery, all four model/user invocation combinations, selected body/resource-base loading, actual builtin reference links, non-preloading and malformed sibling isolation.
- The locked `SkillRegistry` contract fixture proves the full filesystem source rank order plus runtime rank without an OpenNeko selector.
- Strict management decoders reject physical path, resource base, Skill body and metadata before Renderer projection.
- Static boundary checks reject OpenNeko-owned Skill-count, primary-Skill, profile-first and private loader rules.

## Commands

- `pnpm --filter @neko/agent-contracts typecheck && pnpm --filter @neko/agent-contracts test` — passed, 114 tests.
- `pnpm --filter @neko/agent-runtime typecheck && pnpm --filter @neko/agent-runtime test` — passed, 375 tests in the implementation verification run.
- `pnpm --filter @neko/dsh-bridge typecheck && pnpm --filter @neko/dsh-bridge test` — passed, 47 tests.
- `pnpm --filter @neko/agent-webview typecheck` and focused Composer/management tests — passed, 31 tests.
- `pnpm --filter @neko/app-desktop typecheck` and focused Desktop tests — passed, 35 tests.
- `pnpm test:agent:eval` — passed 45 files / 314 tests and dry-run for 27 suites / 82 cases.
- `node --test scripts/check-agent-extension-surface.test.mjs` and `node scripts/check-agent-extension-surface.mjs` — passed.
- `pnpm check:openspec` — passed, 150 items.
- `pnpm check:legacy-debt` — repository-wide gate failed on 26 pre-existing `needs-review` substring matches such as `DshImage...` → `shim`; a changed-line scan found no newly added `legacy`, `fallback`, `deprecated`, `compat`, `shim` or `upgrade` term.

## Remaining evidence

- Real-provider model behavior and the visible Desktop multi-Skill path were not run because no provider/model/cost authorization was supplied for this implementation slice.
- Exact task-relevant guide selection still needs real resource-read receipts; deterministic evidence proves only DSH guidance and non-preloading.
- The isolated staged snapshot's full Q0 run remains blocked by the pre-existing committed-history replay assertion before its Skill scenario; focused contract, bridge, Webview and Desktop paths pass.
- UI functional behavior passed in the owning Webview runtime. Current pixel evidence was not captured, so visual acceptance is advisory `blocked`, not inferred as passed.
- Repository-wide gates remain independently red on the concurrent ComfyUI Tool inventory fixture, a missing inventory-test input, an Entity Webview `ContentLocator` type error, three pre-existing Agent→Chara dependency violations and pre-existing image-preview debt matches. Focused Skill/Prompt packages and the Skill extension-surface gate pass.
