# Validation Plan

## Reported evidence

- Session: exact persisted DSH identity from the user-visible diagnostic.
- `21:09:45.475`: concurrent permission read returned `Unknown or inactive session`.
- `21:09:45.515`: the same Session began its turn 40 ms later.
- `21:26:39`: the same persisted Session recorded a completed turn and reopened with its history and configured model.

This timing classifies the defect as a transient bridge ownership gap, not missing persisted data or an invalid Conversation binding.

## Deterministic acceptance

- Concurrent model application and permission/input-catalog reads resolve against the same Session.
- Source/contract tests prove replacement does not delete the owner before resume succeeds.
- A failed replacement remains fail-visible and does not select another identity.
- Focused package tests, type checks and Q0 qualification pass.

## Visible Desktop acceptance

- Open the reported Conversation through normal navigation.
- Confirm transcript, terminal turn state and configured model are restored.
- Submit a concise continuation through the visible Composer when real provider authorization is available.
- Confirm no raw IPC error, changed Conversation/Session identity or fallback path.

## Visible Desktop result

- **Scope:** reported Conversation restore, DSH loading-to-ready transition, Composer/model projection and adjacent Workspace/Canvas availability.
- **Runtime:** visible development Electron Desktop using the rebuilt development DSH closure; this crosses the renderer, typed Desktop Host, ACP bridge, persisted DSH Session and local Workspace boundaries.
- **Inventory:**
  - Application restart → reported Conversation automatically selected → loading state remained local and visibly identified.
  - Loading settled → exact transcript and completed turn restored → Composer became editable and projected `GPT 5.6 Luna`.
  - Adjacent Workspace/Canvas and sibling Conversation catalog remained visible and usable.
  - New provider-backed continuation → not executed because explicit provider/model/cost authorization was unavailable.
- **Evidence:** direct Computer Use inspection of the visible Electron window on 2026-08-23; accessibility projection showed the exact Conversation title, historical transcript, `回合 1 已结束 · 用时 16分54秒 · completed`, enabled message input, `GPT 5.6 Luna`, Workspace Board, Canvas nodes and sibling Conversations. The settled pixels were reviewed separately after the loading state.
- **Visual findings:** the settled Conversation, Composer, Canvas and project browser were readable without clipping or overlap at the current window size. The raw IPC diagnostic from the user-provided reference capture and the transient `无可用模型` loading projection were absent after recovery.
- **Result:** `blocked` overall because the required provider-backed continuation was not authorized; the restart-and-restore, settled visual state and adjacent-workflow items passed.
- **Residual risk:** no assertion is made for a newly submitted paid turn. An unrelated stored Desktop settings diagnostic was locally reset by its owner, and pre-existing Canvas target-admission diagnostics remain visible in logs; neither was treated as evidence for this Session-owner fix.

## Evaluation matrix

| Cell                                             | Disposition                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| Basic and idle multi-turn continuation           | Reuse `conversation-idle-continuation`                                       |
| Application owner restart and transcript restore | Reuse `conversation-persistence-resume`                                      |
| Context compaction continuation                  | Unaffected; record as not rerun for focused fix                              |
| Generation records/artifacts                     | Unaffected                                                                   |
| Multiple Conversation switching/isolation        | Deterministic sibling isolation plus existing suite; record execution status |
| Permission/queue/config isolation                | Deterministic Q0 is required; provider-backed status recorded separately     |

Key-free or Q0 success is not real Agent behavior acceptance.
