## Context

The Host already binds authorized document context to one deterministic Conversation-scoped short reference and injects `input_ref: input_*` into the model-visible user message. The failure shown in the Agent transcript occurs later: `READ_DOCUMENT_PARAMETERS` permits an object without `input_ref`, `prepareReadDocument` rejects it, and the Pi loop continues after the Tool error without a repeated-failure convergence rule.

Top-level `anyOf` is not an available correction. OpenAI-compatible providers used by the product reject top-level Tool combinators, and the canonical Pi projection intentionally strips them while retaining exact application validation.

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Agent runtime owns model-facing Tool arguments and turn convergence; Content owns document reading; Desktop only composes the runtime.                                                                                      |
| Dependency     | The convergence tracker consumes only Pi assistant/tool-result facts and has no Electron, UI, filesystem or content dependency.                                                                                             |
| Interface      | `ReadDocument` exposes one required `input_ref`; continuation adds `cursor_ref`. Pi exposes its existing `shouldStopAfterTurn` hook through the pinned wrapper.                                                             |
| Extension      | The repeated-failure tracker is Tool-neutral and applies the same exact rule to future Tools without Tool-specific retry policy.                                                                                            |
| Test           | Schema, source/cursor consistency, correction, repeated failure, terminal status, sibling isolation and dependency-patch presence are deterministic; the existing real-provider ReadDocument case covers positive behavior. |

## Goals / Non-Goals

**Goals:**

- Prevent missing document source references at the provider schema boundary.
- Preserve one explicit source identity across initial and continuation reads.
- Allow one model correction after a Tool failure, then stop an unchanged consecutive failure.
- Return one explicit failed-turn diagnostic without disabling unrelated runtime owners.

**Non-Goals:**

- Guessing an attachment, active Workspace, recent file or cursor when `input_ref` is missing.
- Automatically inserting a short reference into model-generated Tool arguments.
- Adding global Tool retry limits, provider fallback, hidden success or UI behavior.
- Restoring top-level schema combinators or changing `ContentLocator`.

## Decisions

### 1. Every ReadDocument call names its source

`READ_DOCUMENT_PARAMETERS.required` contains `input_ref`. For `mode: next`, runtime resolves both `input_ref` and `cursor_ref` and rejects a cursor issued for a different source. This keeps a flat provider-compatible schema and one canonical source identity. Missing, empty, unknown and cross-source references fail before content execution.

Alternative rejected: let `next` use only `cursor_ref`. It makes source identity conditional, weakens the provider schema for every call and caused the observed empty-source call shape to be accepted.

Alternative rejected: infer the sole attached document. That makes attachment order and current context a hidden success path.

### 2. Stop only an unchanged consecutive single-call failure

A turn-local tracker observes completed Pi turns. It records a signature only when one assistant response contains exactly one Tool call and exactly one error Tool result. The signature includes Tool name, canonicalized arguments and error text. A successful call, a changed call, a text-only response or a multi-call batch clears the candidate.

The first failure is returned to the provider as normal corrective evidence. If the immediately following turn produces the same signature, the tracker requests graceful termination before another provider call. The Conversation owner projects a failed terminal diagnostic and checkpoints the turn as failed. No synthetic successful Tool result, guessed arguments, alternate Tool or provider retry is introduced.

### 3. Reuse the Pi loop's owning hook

Pi's low-level loop in the pinned `0.80.7` package already implements `shouldStopAfterTurn`, but that release's `Agent` wrapper omits the option/property and does not forward it. Upstream `0.84.2` exposes the hook. A narrow pnpm patch ports only that wrapper plumbing to `0.80.7`; it does not change loop semantics.

Patch owner: root dependency composition. Consumer: `PiConversationRuntime`. Correctness invariant: the stop predicate runs after one complete assistant/Tool turn and before another provider request. A design without the hook would require aborting inside event projection or reimplementing the Agent loop, both of which violate lifecycle ownership. Removal condition: upgrade `@earendil-works/pi-agent-core` to a release whose `Agent` class natively exposes and forwards `shouldStopAfterTurn`, then delete the patch and keep the runtime tests.

### Ownership and runtime path

| Owner / role                | Canonical public path                | Producer                                  | Consumer                       | Runtime boundary             | Replaced path                | User-data impact                    |
| --------------------------- | ------------------------------------ | ----------------------------------------- | ------------------------------ | ---------------------------- | ---------------------------- | ----------------------------------- |
| `@neko/agent-runtime` L1    | `PiContentToolModelProtocol`         | attached `input_ref` plus returned cursor | `ReadDocument` preparation     | provider Tool boundary       | optional source reference    | none                                |
| `@neko/agent-runtime` L1    | `PiConversationRuntime` turn tracker | Pi turn Tool facts                        | terminal projection/checkpoint | Agent session owner          | unbounded identical failures | transcript retains emitted failures |
| root dependency composition | patched Pi `Agent` hook              | OpenNeko stop predicate                   | existing Pi low-level loop     | third-party adapter boundary | missing wrapper forwarding   | none                                |

## Risks / Trade-offs

- [A provider ignores the required field] -> Exact runtime validation still returns the first error; the second unchanged failure terminates locally.
- [A valid workflow intentionally repeats a failed call] -> Only an immediately consecutive identical single-call failure stops, after one correction opportunity; changed arguments or another action reset the tracker.
- [Dependency patch drifts] -> Pin it to `0.80.7`, validate the patch through install/typecheck/runtime tests, and delete it on an upstream upgrade.
- [Graceful termination's last assistant message has `toolUse`] -> The Conversation owner, not generic Pi stop-reason inference, projects and checkpoints the explicit convergence failure.

## Migration Plan

1. Add the pinned Pi wrapper patch and deterministic proof that the callback stops before a third provider request.
2. Require `ReadDocument.input_ref`, validate continuation source consistency and update all producers/tests atomically.
3. Add Conversation convergence tests for correction, identical repeat, failed checkpoint and unrelated subsequent turns.
4. Reuse the indexed ReadDocument Evaluation case and run provider-backed visible/hidden lanes only with explicit authorization.

No user-data migration or compatibility path is required.

## Open Questions

None.
