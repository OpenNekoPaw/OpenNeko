## Context

The controller currently builds one string from the base prompt, every registered capability fragment and the custom prompt before the queued Turn freezes its actual Tool snapshot. `PromptFragment.priority` is documented but ignored, all appended sections are labeled `User Instructions`, and Pi's upstream Skill catalog teaches filesystem path resolution before OpenNeko adds the opposite opaque-locator rule.

This change follows `adr-agent-prompt-skill-validator-boundary.md`: the system prompt owns cross-domain protocol, capability providers own domain usage guidance, Skills own methods, and Tools own execution authority.

## Goals / Non-Goals

**Goals:**

- Produce one deterministic Turn prompt from the same immutable capability snapshot used for execution.
- Preserve fragment owner/provenance and honor priority.
- Ensure every injected capability fragment describes only Tools available to that exact Turn.
- Present one unambiguous Skill locator protocol.
- Make persistence and completion claims concise and evidence-bound.

**Non-Goals:**

- Rewriting Skill bodies or moving Tool schemas into prompts.
- Adding a generic prompt policy DSL, feature flag, fallback composer or second Agent controller.
- Changing provider/model selection, permission policy or artifact schemas.

## Decisions

### 1. Prompt fragments declare exact Tool applicability

`PromptFragment` gains a required non-empty `toolNames` set for capability-operation guidance. The registry retains provider identity with each fragment, localizes it and sorts by descending priority then stable id. A fragment is selected only when every declared Tool name is present in the exact filtered Turn tool set.

Fragments that teach no Tool protocol are removed or represented by an explicit empty applicability only when they describe a permanently registered capability whose availability is independently proven. Current providers all describe operations, so they declare exact Tool names.

Alternative rejected: infer ownership from prose or provider registration. Registration is broader than per-Turn visibility and prose parsing is not a contract.

### 2. Final composition occurs inside the owning Turn

The controller supplies separately identified base system content and user instructions. Host configuration keeps its existing `customSystemPrompt` setting name, but the controller maps that value once into the Turn-owned `userInstructions` field. `AgentTurnInput` does not expose a second custom system-prompt field. `AgentWorkspaceRuntime.executeTurnOwned` freezes Tools, applies image and authoring filters, selects applicable fragments from the same runtime snapshot, then composes deterministic sections before Pi execution and facts projection.

The package-level Turn configuration planner follows the same boundary: it accepts `userInstructions`, while `customSystemPrompt` remains only the persisted Host/Webview settings name. This prevents an exported helper contract from reintroducing a second system-prompt concept even when it currently has no production caller.

The ordering is base system policy, descending capability priority with provider-qualified headings, then user instructions. Duplicate fragment ids fail at registration; missing declared Tools omit only that fragment and remain observable in deterministic tests.

The final-Prompt observation callback is forwarded through the internal Conversation owner for both ordinary and explicit-Skill execution. Desktop facts bind only after Pi appends the Skill catalog and reports that exact provider-facing prompt; a missing callback remains a local contract failure rather than falling back to the controller-time base prompt.

A Desktop connection may detach after its Turn is accepted but before that final-Prompt observation occurs. Detach stops connection input and releases presentation attachments immediately, while the connection-owned facts and resource projectors drain only the Turn operations already accepted through that connection. This preserves the background Turn under its exact Conversation identity, records its final prompt and terminal evidence, and then releases the projectors without retaining the UI Root.

Turn snapshot creation, including fragment aggregation and strict validation, runs inside the owning Turn's canonical error boundary. An invalid fragment rejects and cleans up only that Turn, then allows the next queued Turn for the same Conversation to proceed.

Alternative rejected: filter in the controller. A queued Turn can wait while plugin/runtime registration changes, so controller-time filtering can diverge from actual execution.

### 3. OpenNeko formats the model-visible Skill catalog

OpenNeko stops using the upstream `formatSkillsForSystemPrompt` wording and formats the same catalog records itself. The catalog describes `/__neko_skills/` as an opaque locator accepted only by `read_skill`; relative Skill resources remain virtual child locators and never become host paths.

Alternative rejected: patch `node_modules`. The dependency is third-party and a local patch would not establish a package-owned contract.

### 4. Output truthfulness stays cross-domain and compact

The builtin prompt states that execution requests should return the requested deliverable plus minimal completion evidence, and that a chat/composite artifact is not a saved document. If no matching mutation capability is present, the Agent reports the exact missing target/capability rather than expanding a speculative plan.

This does not force every response into a file and does not override a Skill's domain output shape.

### 5. Ownership and runtime boundaries

| Owner / role                              | Canonical path                          | Producer                                                | Consumer                   | Runtime boundary        | Replaced path                                                   | User-data impact |
| ----------------------------------------- | --------------------------------------- | ------------------------------------------------------- | -------------------------- | ----------------------- | --------------------------------------------------------------- | ---------------- |
| `@neko/agent-contracts` L0                | package prompt-fragment contract        | capability providers                                    | Agent runtime              | cross-runtime type only | unscoped fragment shape                                         | none             |
| `@neko/agent-runtime` application/runtime | application public entry and Pi runtime | controller settings, capability registry, Turn snapshot | Pi provider turn and facts | host-neutral Node       | controller-time flat concatenation and upstream catalog wording | none             |

No production logic is added to `apps/*`.

## Risks / Trade-offs

- [A provider omits required Tool metadata] → strict provider tests require every operation-guidance fragment to declare canonical Tool names.
- [Queued Turn prompt differs from its initial UI catalog] → intentional: execution uses the later immutable Turn snapshot and records the effective prompt as evidence.
- [A Surface detaches before final Prompt composition] → drain only that connection's already accepted Turn operations before disposing its facts and resource projectors; do not cancel the background Turn, retry projection or keep presentation mounted.
- [Prompt ordering changes model behavior] → deterministic snapshots plus focused real Agent Evaluation; key-free tests do not count as real behavior acceptance.

## Migration Plan

Update all built-in fragment producers and consumers atomically, remove the old workspace fragment read API, and poison the old upstream catalog wording and flat `# User Instructions` composition in tests. No persisted data migration is required.

## Open Questions

None.
