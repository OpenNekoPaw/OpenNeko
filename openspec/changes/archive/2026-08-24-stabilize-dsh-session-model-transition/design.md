## Context

The DSH bridge owns the live `AgentHandle` map. OpenNeko stores only the exact Conversation-to-DSH-Session binding and a disposable projection. Model configuration is applied through standard ACP and requires rebuilding the Agent because DSH Agent options are immutable after creation.

The current replacement sequence deletes the map entry before awaiting flush, disposal and resume. A concurrent permission or input-catalog request therefore fails as if the persisted Session were unknown. Runtime evidence from the reported case showed the read failure 40 ms before the same Session began a successful turn, proving a transient ownership gap.

## Goals / Non-Goals

**Goals**

- Preserve one exact active-owner record while its Agent handle is being replaced.
- Coalesce concurrent readers onto that exact replacement completion.
- Keep replacement failure local and visible.
- Prove there is no alternate Session, provider or runtime fallback.

**Non-Goals**

- Do not retry failed prompts or provider calls.
- Do not create a replacement DSH Session identity or rebind the Conversation.
- Do not add a second Session registry or persisted transition state.
- Do not change Skill, Tool, permission or model-selection semantics.

## Five-layer analysis

| Layer          | Decision                                                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | The DSH bridge remains the sole owner of active `AgentHandle` lifecycle; Host binding and Renderer projection remain unchanged.                                                        |
| Dependency     | The fix stays inside the existing DSH/ACP runtime boundary and adds no Electron or product-domain dependency.                                                                          |
| Interface      | Standard ACP methods and existing OpenNeko extensions retain their canonical shapes.                                                                                                   |
| Extension      | The existing owned record carries only its current replacement promise; no generic registry or lifecycle framework is introduced.                                                      |
| Testing        | Unit/source invariants reject early deletion; Q0 sends concurrent model and permission/catalog requests; existing real workflow scenarios cover same-Session continuation and restart. |

## Design

Each owned Session record exposes an optional, short-lived replacement promise. Model replacement keeps the current record in the map, publishes that promise before its first asynchronous boundary, then flushes and disposes the old handle and resumes the same persisted Session identity. On success the map atomically switches to the new record. On failure only that exact record is removed and the original error remains visible.

Async request handlers resolve an owned Session through one helper that waits for any published replacement and then re-reads the map. This ensures a concurrent request uses the new exact handle rather than a disposed handle. Event publication retains the current record path so replacement cannot deadlock while waiting for its existing output tail.

`cancel` remains synchronous. A model replacement is admitted only for an idle Session with no bridge-owned prompt, so a concurrent cancel does not acquire a substitute owner or report success for another Session.

## Failure behavior

- Missing Session outside a replacement remains `Unknown or inactive session`.
- Replacement failure removes only the affected live owner and returns the original diagnostic.
- Concurrent operations waiting on a failed replacement receive that failure; they do not create, load or select another Session.
- Sibling Sessions and the ACP connection remain available.

## Evaluation decision

- Disposition: `reuse`.
- Owning suite: `agent-runtime.workflow-controller`.
- Cases: `conversation-idle-continuation` and `conversation-persistence-resume`.
- Canonical path: visible/public Composer → sender-bound Session Host → exact binding → standard ACP Session operations → same DSH Session turn lineage.
- Forbidden fallback: new Session identity, another Conversation, provider switch, direct runtime runner, mock result or legacy Agent path.
- Deterministic Q0 proves the replacement/read concurrency contract without provider use. Provider-backed execution is still required before release claims about real Agent behavior.
