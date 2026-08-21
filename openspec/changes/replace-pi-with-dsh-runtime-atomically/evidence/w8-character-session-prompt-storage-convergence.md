# W8 Character Session, Prompt And Storage Convergence

Date: 2026-08-21

## Scope And Ownership

- `@neko/chara` retains Character/Room Run facts, frozen turn context, presentation receipts and
  the narrow `CharacterAgentConversationPort`.
- `@neko/agent-runtime/application` owns exact Conversation publication, DSH context-before-prompt
  ordering and terminal assistant result projection.
- `@neko/dsh-bridge` owns the effective OpenNeko product-protocol prompt fragment alongside the
  shipped DSH `standard` preset.
- Desktop Main only composes the package public ports and the live DSH client/projection.
- OpenNeko SQLite retains only current DSH Conversation catalog metadata, exact domain context and
  Conversation-to-DSH Session binding. Existing retired first-submit bytes remain untouched.

The replaced paths are the never-composed `AgentDomainConversationService`, the
`agent_conversation_records` first-submit repository/service/table initializer, and the disconnected
`SystemPromptBuilder` graph. None may remain as a fallback or test-only success authority.

## Evaluation Decisions

### Character And Room participant lifecycle

- Disposition: `update` the existing session-workflow/Character coverage; do not create a direct
  runtime runner.
- User behavior: create an Agent-controlled Character/Room participant and submit a visible turn.
- Canonical path: visible Character controls -> sender-bound Desktop host -> Chara application
  service -> exact Conversation -> package-owned DSH application service -> ACP -> exact DSH
  Session -> terminal DSH projection -> Chara presentation receipt.
- Required evidence: exact CharacterRun/Conversation/DSH Session identities, context set before the
  prompt, one new terminal DSH turn, its final assistant message and the frozen Chara turn receipt.
- Forbidden fallback: retired first-submit row/service, Pi transcript/provider, active/recent
  Conversation, Assistant rebinding, direct DSH runner or final-text-only success.
- Expected failure: owner mismatch, missing context, missing terminal turn/final message or an
  unavailable public delete seam fails locally and preserves unrelated Conversations and user data.

Deterministic producer/delegation/poison tests are required for implementation readiness. Real
behavior acceptance requires the visible Desktop controls and a configured real provider. If the
current driver cannot operate the Character controls or collect the required facts, the case is
`infrastructure-blocked`; key-free tests do not replace it.

### Product Prompt composition

- Disposition: `update` `agent-runtime.prompt-composition` so its base fragment refers to the real
  DSH bridge product-protocol owner rather than the removed Builder.
- User behavior: an ordinary or explicit-Skill turn follows the OpenNeko product protocol while the
  DSH `standard` preset remains the sole general Agent capability composition.
- Canonical path: Desktop Session -> ACP -> DSH bridge -> `standard` preset plus exact
  `openneko:product-protocol` and per-Session `openneko:product-context` fragments.
- Required evidence: secret-free fragment identities/order from the effective DSH Session plus the
  existing Skill/output evidence.
- Forbidden fallback: SystemPromptBuilder unit tests, Pi catalog prompt claims, Host-defined
  ask/plan/auto modes or duplicated Tool instructions.
- Expected failure: missing/duplicate bridge fragment or an unavailable preset rejects the exact
  Session operation and cannot be reported as prompt-composition success.

Bridge injection and absence tests are deterministic readiness evidence. The provider-backed
prompt-composition case remains required for behavior acceptance.

## Foundational Matrix

- Basic and multi-turn Conversation: affected; requires focused deterministic coverage and real
  Desktop/provider acceptance.
- Context continuation: affected for Character/Room exact turn context; requires real acceptance.
- Owner/application reopen and transcript restoration: DSH binding path is reused; still requires
  the existing release matrix.
- Generation artifact restoration: unaffected.
- Conversation switching and transcript/config/context isolation: affected at the Character/Room
  boundary; exact identities and sibling isolation remain required.

## User Data

No existing Pi Session file or retired SQLite row is opened, migrated, repaired, dropped or deleted.
Stopping creation of the retired table affects only fresh/current startup schema. A database that
already contains it remains byte-preserved and product-unreachable.

## Verification

- `pnpm --dir packages/agent/runtime exec vitest run`: 48 files, 329 tests passed.
- `pnpm --dir packages/chara exec vitest run`: 44 files, 241 tests passed.
- `pnpm --dir packages/dsh-bridge typecheck && pnpm --dir packages/dsh-bridge test`: typecheck
  passed; 4 files, 28 tests passed.
- `pnpm --dir apps/neko-desktop typecheck`: passed.
- Focused Desktop DSH runtime, Character adapter and retired-composition tests: 3 files, 14 tests
  passed.
- `pnpm check:storage-authorities`, `pnpm check:agent-boundaries`,
  `pnpm check:application-boundaries` and `pnpm check:openspec`: passed.
- `pnpm test:agent:eval`: key-free authoring/runner validation passed (45 files, 314 tests; 26
  suites and 65 cases dry-ran).
- DSH bridge and six first-party DSH plugins now have explicit test/coverage ownership; ownership
  and shared coverage audits pass for all 54 source-bearing workspaces.

## Provider-backed Evaluation Status

Status: `infrastructure-blocked` for this worktree handoff. No provider/model/cost authorization was
supplied for this task, and the current visible provider scenario does not yet drive Character/Room
controls or collect the required exact CharacterRun/Conversation/DSH Session/frozen-receipt facts.
The key-free result is implementation readiness only. Task 10.8 remains open until the visible real
provider case and the focused prompt-composition case produce those facts without a direct runner or
mock path.

## Repository Baseline Residuals

The changed files pass targeted ESLint with no errors. Repository-wide lint, formatting,
internal-versioning and Knip gates still expose pre-existing branch baseline debt outside this slice:
unrelated production/test lint errors, one unrelated formatting file, stale internal-versioning
allowances plus other already-present occurrences, and the existing unused-file/dependency/export
inventory. This slice removed its own new internal-version false positive and reduced the unused
export count; it does not rewrite unrelated user changes or quality baselines.
