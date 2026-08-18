## Context

Portable content files already use the canonical Agent core `Write` path. `AgentAppHost` admits that Tool only when the current Turn owns an exact validated `content-document` receipt, and the Tool retains approval, create-if-absent or fingerprint-checked replacement, and Workspace-relative result semantics.

The missing behavior is prompt-level authoring handoff and exact final-Prompt observability. It is not a target creation, navigation or UI problem.

## Goals / Non-Goals

**Goals:**

- Tell the model when an ordinary plan, copy draft or document must use the existing receipt-bound `Write` path.
- Make saved-completion claims conditional on approval and an exact successful mutation result.
- Preserve exact-target Tool admission and project the actual final composed system prompt into Desktop Agent facts.

**Non-Goals:**

- Adding or changing Authoring Entry cards, target selection, Renderer/Webview behavior or other UI.
- Creating Project documents, targets, sessions, IPC, adapters or another writer.
- Giving `Write` to unbound conversations or inferring active/current/recent authority.
- Moving runtime Tool protocol into Skill content.

## Decisions

### 1. Base Prompt owns truthful Tool handoff

The bilingual base Prompt states the conditional protocol without duplicating Tool schema: when the user requests a durable ordinary document and `Write` is present in the immutable current Tool list, the Agent uses the exact authorized target, waits for approval and a successful mutation result, then reports only the Workspace-relative document identity needed for verification. When `Write` is absent, the Agent reports missing mutation authority and does not claim chat or composite content was saved.

Skill content remains responsible for domain method and output quality, not runtime Tool names, parameters, target selection or authoring lifecycle.

### 2. Existing exact receipt remains the only authority

No new target is created. `AgentAppHost` continues to derive the available mutation Tools from the current immutable Turn snapshot and exact receipt. For core `Write`, the receipt-bound proxy projects the exact content-document identity as the only model-visible `file_path` and rejects any different path before calling the canonical writer. Character, World and unbound Turns remain unable to call `Write`; mentions of active/current/recent projects do not create authority.

### 3. Desktop facts bind only the effective Prompt

The Pi runtime reports its actual final composed system prompt before provider execution. Desktop begins the facts record from that callback and buffers early product events until binding. Completion requires that binding to have occurred; a runtime fixture or implementation that never composes the prompt fails with a specific diagnostic instead of falling through to a generic missing-facts-owner error. The controller never substitutes its earlier base prompt.

### 4. Ownership and runtime boundaries

| Owner / role | Responsibility | Unchanged boundary |
| --- | --- | --- |
| Agent base Prompt | Conditional durable-document Tool protocol | No Skill or UI protocol |
| `AgentAppHost` | Immutable tools, fragments, receipt and final prompt composition | Existing exact-target `Write` admission |
| Pi conversation runtime | Reports final provider-facing prompt | No Desktop fallback prompt |
| Desktop facts projector | Records exact Turn facts after prompt binding | No authoring or navigation authority |

## Risks / Trade-offs

- [Real model ignores the conditional handoff] → focused real-provider Evaluation remains required; deterministic tests prove composition and routing, not compliance.
- [A runtime fails to invoke final-prompt callback] → completion fails visibly and locally for that Turn; tests must invoke the production callback contract.
- [Prompt guidance appears on unbound Turns] → wording is explicitly conditional on current Tool availability and forbids inferred authority.
- [A model supplies another Workspace path despite the receipt] → the receipt-bound `Write` schema exposes only the exact document id and execution rejects a mismatched path before authorization or mutation.

## Migration Plan

Update the base Prompt and focused runtime/Desktop tests atomically. No UI, persisted data, Project contract or authoring receipt is migrated.

## Open Questions

None.
