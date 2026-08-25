## Product boundary

Canvas owns generation authoring as a durable node workflow. A creator adds a typed generation node, edits its recipe, starts generation, and receives results back on that same node. Generation owns provider execution and Job lifecycle; Canvas does not become a provider or Job authority.

## Core invariants

- Text, image, audio, and video use one node lifecycle with type-specific recipes.
- Direct UI and Agent-assisted actions submit the same canonical Generation request.
- References remain owner-qualified; raw paths, credentials, and provider internals do not enter Canvas facts.
- Failure, cancellation, restart, and capability loss affect only the exact node or Job and never select another provider or product path.
- Existing Canvas documents remain authoritative and are not rewritten merely because generation capability changes.

## Product acceptance

The capability is complete when creators can author, execute, reopen, and inspect all supported generation-node kinds through the authoritative Desktop path, including explicit unavailable and failure states.

## Non-goals

This change does not define provider configuration, a second Agent generation mode, or a general workflow engine.
