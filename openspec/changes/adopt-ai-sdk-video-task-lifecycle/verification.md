## Verification summary

### Passed

- `pnpm --filter @neko/ai-sdk typecheck`
- `pnpm --filter @neko/ai-sdk test -- --run`: 5 files, 16 tests
- `pnpm --filter @neko/ai-contracts typecheck`
- `pnpm --filter @neko/ai-contracts test -- --run`
- `pnpm --filter @neko/generation test -- --run`: 31 files, 183 tests
- `pnpm --filter @neko/host test -- --run`: 40 files, 351 tests
- `pnpm test:agent:eval`: 45 files, 314 tests; dry-run indexed 27 suites and 84 cases. This is harness readiness only.
- focused ESLint for AI contracts, AI SDK and Generation: 0 errors; pre-existing warnings remain.
- `pnpm check:application-boundaries`: passed.
- package-boundary dependency analysis and boundary fixtures: passed.
- `pnpm check:openspec`: 163 items passed.
- scoped `git diff --check`: passed.
- Internal versioning audit reports no new finding from this change after exact external allowances were recorded for AI SDK V4, MiniMax V2 and ByteDance V3 protocol identifiers.

### Repository-level blockers outside this change

- A final Generation/Desktop typecheck rerun is blocked by concurrent Character-avatar and Agent-surface edits: `CharacterAvatarResourceDescriptor` discriminant/media type mismatches and a removed `messageAuthorPresentation` prop. Generation typecheck had passed before those unrelated edits appeared.
- `pnpm check:package-boundaries` reaches the package-product-status sub-gate and fails because `@neko/agent-dsh-plugin` is declared active but is not reachable from an application entry.
- `pnpm check:deps` reports three existing Agent Runtime imports of `packages/chara/src/application/index.ts`.
- `pnpm check:legacy-debt` reports 26 existing `needs-review` findings in Desktop DSH surfaces; this change adds no replacement MiniMax path.
- `pnpm check:unused` reports the existing repository unused-export inventory; none of the added H3, Seedance, video-operation or canonical-input symbols appears in that inventory.
- The repository-wide internal-versioning gate remains blocked by unrelated new findings already present in the dirty worktree.

### Real provider evaluation

Status: `infrastructure-blocked`.

No explicit cost authorization or usable H3/Seedance credentials were supplied for this turn. Per the Agent Evaluation boundary, no paid Desktop provider call was made and deterministic mock evidence is not represented as real API acceptance.
