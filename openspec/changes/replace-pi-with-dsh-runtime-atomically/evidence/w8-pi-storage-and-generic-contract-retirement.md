# W8 Pi Storage And Generic Contract Retirement

Date: 2026-08-21

## Decision

DSH owns Session transcript JSONL under Electron `userData/dsh/sessions`. OpenNeko SQLite remains necessary for local product records, including the canonical OpenNeko Conversation catalog, exact Conversation-to-DSH-Session binding, domain context, checkpoints, jobs, projections, and other package-owned metadata. It must not duplicate the DSH transcript.

The old `@neko/local-metadata` generic `conversations` table and `ConversationCatalogRepository` encoded the retired Pi-era `journal_id` projection path. Production initialization, repository contracts, transaction wiring, cache maintenance, and decode logic have been deleted. The current OpenNeko DSH Conversation catalog/binding tables and repositories remain unchanged.

Fresh database initialization no longer creates `conversations`. The accepted boundary requires an existing retired table or unknown row to remain byte-preserved with no `DROP`, migration, import, repair, rewrite or compatibility reader. Current code has drifted from this evidence: Desktop startup invokes `removeRetiredPiStorage` and deletes four tables plus two directories. That path is a release blocker, not canonical behavior.

The unused `.neko/journals` and `.neko/conversations` layout fields plus the Pi-era `conversation-journals` classification were also deleted. The generic admission policy still classifies journals as file-owned and prohibits SQLite. Existing user directories must not be scanned, opened, renamed or removed; the current cleanup file port must be deleted before release.

The same producer/consumer audit found no production consumer for the old generic runtime scope/config/work-item graph or its Tool ownership helpers. Those files, self-tests, the unused transcript queue projectors, and their now-unreachable context-reference presenter were deleted. The Webview keeps only `isOptimisticQueuedMessageItem`, which is consumed by the current DSH inbox presentation; no component, layout, style, or interaction was changed.

## No-return proof

- `check-storage-authorities.mts` rejects restoration of `ConversationCatalogRepository`, `ConversationCatalogSource`, a production `CREATE TABLE ... conversations` statement, or the retired `.neko` conversation/journal layout while accepting the current DSH binding table.
- `check-neko-agent-boundaries.mjs` rejects restoration of each deleted runtime scope/config/work-item path and the retired Tool/queue projector identifiers.
- SQLite initialization tests prove both the fresh canonical table set and preservation of a pre-existing retired `conversations` row.
- The Pi ADR is marked superseded; current architecture points to DSH Session JSONL plus OpenNeko SQLite catalog/binding responsibilities.

## Agent Evaluation disposition

- Decision: `update` for positive fixture wording; `excluded` for real provider behavior.
- Updated fixtures: optimization state machine, isolated evaluator, ablation contracts, and the test-case catalog now describe `Desktop renderer bridge -> sender-bound Desktop Session Host -> DSH Session through ACP` and the OpenNeko Conversation catalog.
- Reason for excluding real provider/API execution: this slice removes unreachable contracts/storage wiring and changes deterministic fixture text. It does not change prompts, Skills, Tool routing, provider/model selection, DSH Session operations, or Desktop event projection.
- Required deterministic evidence: complete key-free Evaluation harness and all-suite dry-run.

## Verification

Passed:

```text
pnpm --dir packages/local-metadata run typecheck
pnpm --dir packages/local-metadata run test                 # 15 files / 104 tests
pnpm --dir packages/agent/contracts run typecheck
pnpm --dir packages/agent/contracts run test                # 32 files / 177 tests
pnpm --dir packages/agent/webview run typecheck
pnpm --dir packages/agent/webview run test                  # 3 files / 34 tests
node --test scripts/check-neko-agent-boundaries.test.mjs    # 4 tests
pnpm exec tsx --test scripts/check-storage-authorities.test.mts # 3 tests
pnpm --dir packages/agent/runtime run typecheck
pnpm --dir packages/agent/runtime run test                  # 51 files / 382 tests
pnpm --dir apps/neko-desktop run typecheck
pnpm test:functional:headless                               # 7 files / 95 tests
pnpm check:agent-boundaries                                 # 342 source/Evaluation files, 0 findings
pnpm check:storage-authorities                              # 13 classifications; 1380 production sources, 0 findings
pnpm test:agent:eval                                        # 45 files / 314 tests; 26 suites / 65 cases
```

## Residual risk

- Existing ignored Desktop build/package outputs still contain retired markers. Task 12.6 prohibits rebuilding or packaging until the release guard passes, so `check:agent-retired-output` remains an expected release blocker rather than being hidden by deleting generated output.
- The upstream DSH rc.8 public Session delete seam remains absent; task 8.2 now records the accepted fail-visible retention policy rather than waiting on a private cleanup path.
- Current startup destructive cleanup conflicts with the byte-preservation contract and keeps tasks 0.7, 8.4–8.6 and 11.14 open.
- This slice does not claim the full Provider/Model, approval, domain Tool, visible/hidden Desktop, reopen, or release matrices complete.
