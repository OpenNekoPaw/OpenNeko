## Why

Agent capability guidance is currently composed before the exact Turn tool set is frozen, loses fragment provenance and priority, and inherits an upstream Skill path instruction that contradicts OpenNeko's opaque `read_skill` locator contract. This can instruct the model to use unavailable capabilities, misuse Skill locators, or produce verbose chat artifacts instead of a concise, truthfully completed result.

## What Changes

- Make the OpenNeko Skill catalog the single model-visible Skill locator contract: `/__neko_skills/` locators remain process-local and are accepted only by `read_skill`.
- Give capability prompt fragments explicit machine-readable tool requirements and select them against the same immutable Turn tool snapshot used for execution.
- Compose base system guidance, applicable capability fragments and user instructions in deterministic priority order while preserving section provenance.
- Tighten cross-domain output guidance so requested execution ends in a verified durable result or a concise fail-visible diagnostic; a chat artifact is never described as a saved file.
- Add deterministic path tests and update Agent Evaluation coverage for Skill loading, fragment selection and persistence truthfulness.

## Capabilities

### New Capabilities

- `agent-turn-prompt-composition`: Defines canonical Skill locator presentation and exact Turn-scoped prompt fragment composition.

### Modified Capabilities

None.

## Impact

- `@neko/agent-contracts` L0 owns the minimal prompt-fragment applicability contract.
- `@neko/agent-runtime` owns Skill catalog projection, immutable Turn tool selection, prompt composition and runtime evidence.
- Existing capability providers add declarative applicability metadata; they do not gain routing or tool authority.
- No Skill body, provider schema, user data or Desktop IPC contract is changed.
