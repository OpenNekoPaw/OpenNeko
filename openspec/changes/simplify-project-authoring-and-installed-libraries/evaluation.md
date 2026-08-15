## Agent Evaluation Disposition

- `character-creator`: update `skill.character-creator` only where Project-bound local Character creation or synchronization routing changes.
- `world-creator`: update `skill.world-creator` only where Project-bound local World creation or synchronization routing changes.
- Runtime selection evaluation covers exact global Character multi-select, World single-select and combined World participants.
- Forbidden paths: unbound persistent creation, workspace-local runtime launch, installed-release lookup, adaptation, recovery, Project publication planning and active/recent/name/current fallback.

## Focused Cases

- Unbound Character and World creator invocations are rejected with `binding-required`; no durable target or Conversation is created.
- Project-bound creation without the matching exact local target authority is rejected before owner writes.
- Workspace synchronization creates an exact global object/version receipt only after standard approval and owner validation.
- Conversation with one global Character launches Dialogue; multiple Characters launch Room; one World plus Characters launches World Experience with exact participants.
- A newer global version does not change an existing Project, Dialogue, Room, Run or Save reference.
- Adjacent ordinary roleplay remains non-authoring and does not call Character/World mutation.

## Deterministic Path Evidence

- Chara and World each register one owner-qualified mutation path for local creation and one synchronization path for global version creation.
- Desktop resolves sender-authorized Project or runtime selection receipts and delegates through package public ports without active/recent/default fallback.
- Owner tests prove wrong bindings, stale synchronization bases and rejected approval produce zero writes.
- Contract/path tests prove installed, adaptation, recovery and publication-plan handlers and registrations no longer exist.

## Runtime Acceptance Boundary

Key-free and deterministic tests prove contract, routing and zero-write rejection behavior only. Behavior acceptance requires the public Desktop Agent path with real provider configuration where Agent mutation is involved, plus visible Electron UI evidence for entry selection, Composer context, Workspace projection and interaction panels. Any unexecuted real-provider or visible-UI case remains an explicit residual risk rather than being replaced by mock or hidden-only evidence.
