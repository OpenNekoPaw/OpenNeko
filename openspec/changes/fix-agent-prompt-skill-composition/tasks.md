## 1. Prompt Fragment Contract

- [x] 1.1 Add exact Tool applicability metadata and strict prompt fragment validation/localization tests in `@neko/agent-contracts`.
- [x] 1.2 Update every built-in capability fragment producer with canonical Tool names and remove fragments that cannot prove an execution capability.
- [x] 1.3 Make capability registry aggregation retain provider provenance, reject duplicate ids and sort deterministically.

## 2. Immutable Turn Composition

- [x] 2.1 Freeze capability fragments with Tools and plugin Skill roots in the owning queued Turn snapshot.
- [x] 2.2 Select fragments against the final image/authoring/capability-filtered Tool set and compose labeled base, capability and custom instruction sections.
- [x] 2.3 Remove controller-time flat fragment concatenation and its workspace public read entry.
- [x] 2.4 Replace upstream Skill catalog formatting with the OpenNeko opaque `read_skill`-only catalog contract.
- [x] 2.5 Tighten builtin completion/persistence truthfulness guidance without adding domain schemas or Tool tutorials.
- [x] 2.6 Forward final-Prompt observation through ordinary and explicit-Skill Conversation execution paths.
- [x] 2.7 Map Host `customSystemPrompt` once to Turn `userInstructions` and remove the misleading Turn-level second-system-prompt field.
- [x] 2.8 Keep fragment snapshot validation inside canonical Turn rejection/cleanup and cover same-Conversation recovery.
- [x] 2.9 Remove the remaining Turn configuration `customSystemPrompt` alias; retain that name only at the Host settings boundary and use `userInstructions` inside Turn composition.

## 3. Verification

- [x] 3.1 Add positive, wrong-target, tool-absent, duplicate-id, priority/provenance and opaque-locator poison tests.
- [x] 3.2 Record Evaluation disposition and cases for Skill loading, exact Turn fragment/tool parity and no false persistence claim.
- [x] 3.3 Run Agent Contracts/Runtime focused tests and typechecks, strict OpenSpec validation and Agent key-free Evaluation validation; record any real-provider blocker.
- [x] 3.4 Run Neko quality review and document remaining model-behavior risk.
- [x] 3.5 Add producer/consumer regression coverage for final-Prompt observation and Desktop facts binding.
- [x] 3.6 Verify the Host-to-Turn instruction mapping and record the exact-receipt Evaluation coverage gap without inventing an Evaluation-only path.
- [x] 3.7 Preserve final-Prompt facts across connection detach by draining accepted Turns before projector disposal.
