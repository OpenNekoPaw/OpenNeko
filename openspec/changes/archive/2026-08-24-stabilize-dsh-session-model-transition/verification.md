# Verification Record

Date: 2026-08-23

## Root-cause evidence

- Desktop log: at `21:09:45.475`, `openneko/session/permissions/read` received `Unknown or inactive session` for the reported exact DSH Session.
- Authoritative persisted DSH log: the same Session recorded `turn/start` at `21:09:45.515`, only 40 ms later, and `turn/end` with `completed` at `21:26:39`.
- The same Conversation subsequently reopened with its complete transcript, completed terminal state, Workspace context and configured `GPT 5.6 Luna` model.

This proves a transient active-owner gap during model replacement. It does not indicate missing persisted Session data, a changed Conversation binding or provider failure.

## Automated verification

| Check                                                                         | Result                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm --filter @neko/dsh-bridge test`                                         | Pass — 5 files, 44 tests                                                 |
| `pnpm --filter @neko/dsh-bridge typecheck`                                    | Pass                                                                     |
| `pnpm --filter @neko/dsh-bridge build`                                        | Pass                                                                     |
| `pnpm --dir scripts/dsh-q0 test`                                              | Pass — 4 tests                                                           |
| `pnpm --dir scripts/dsh-q0 qualify:model-transition`                          | Pass — 6 JSON-RPC messages; exact owner retained; provider not contacted |
| `pnpm test:agent:eval`                                                        | Pass — 45 files, 314 tests; 27 suites / 78 cases dry-run                 |
| `node scripts/agent-eval/all-suite-dry-run.mjs`                               | Pass — 27 suites / 78 cases                                              |
| `pnpm exec openspec validate stabilize-dsh-session-model-transition --strict` | Pass                                                                     |
| `pnpm check:openspec`                                                         | Pass — 152 items                                                         |
| `pnpm check:application-boundaries`                                           | Pass — 1,361 files                                                       |
| ESLint for changed bridge TypeScript                                          | Pass                                                                     |
| `git diff --check`                                                            | Pass                                                                     |

The focused Q0 profile sends standard model configuration plus permission and input-catalog extension reads concurrently against one DSH Session. The prior implementation exposed an absent owner during this interval; the new qualification completes all requests against the same exact owner without provider access.

## Visible Electron verification

Authoritative runtime: visible real Electron Desktop restarted with the rebuilt development DSH closure containing this change.

- Opened the reported `设计动画化方案` Conversation through the normal sidebar.
- The exact historical transcript and completed turn restored.
- Composer became enabled and projected `GPT 5.6 Luna`; the raw IPC error and `无可用模型` state were absent.
- Workspace/Canvas context and sibling Conversations remained available.
- The settled pixels were inspected directly: Conversation content, Composer, Canvas and project browser remained readable without clipping or overlap at the current window size.

A new paid provider continuation was not submitted because this turn did not contain explicit provider/model/cost authorization. The provider-backed `agent-runtime.workflow-controller` cases remain the release-level behavior evidence owner.

Advisory UI result: `blocked` overall because that provider-backed continuation was not authorized; restart/restore, settled visual state and adjacent Workspace/Canvas checks passed. The locally recovered legacy Desktop-settings diagnostic and existing Canvas target-admission log entries are separate findings and were not counted as successful evidence for this change.

## Broader gate findings outside this change

- Full Q0 progressed beyond the new model-transition check, then failed in its separate Prompt-admission section because queued test prompts timed out. The focused model-transition qualification is isolated from that existing timing failure.
- `check:agent-boundaries` passed its first 12 boundary tests, then failed on concurrent Tool inventory work: `submit-comfyui` inventory mismatch and a missing `packages/agent/contracts/src/tool-names.ts`.
- The core package-boundary analyzer passed 57 packages; its composed product-status check failed because the concurrently added `@neko/agent-dsh-plugin` is declared active-product without a reachable application import.

None of these findings originate from the bridge replacement owner or focused Q0 files changed by this proposal.

## Evaluation disposition

- Decision: `reuse`.
- Suite: `agent-runtime.workflow-controller`.
- Cases: `conversation-idle-continuation`, `conversation-persistence-resume`.
- Canonical path: visible/public Composer → sender-bound Desktop Host → exact Conversation binding → standard ACP → same DSH Session.
- Forbidden fallback: new Session or Conversation identity, provider switch, direct runner, mock output or legacy Agent runtime.
- Real provider run: not executed; explicit provider/model/cost authorization was unavailable for this turn.
