## Risk classification

- Risk: L3 for Provider/model routing and credential/configuration authority; L2 for the Settings UI and typed IPC.
- Review boundary: Host contract/service, ConfigManager lifecycle, Desktop Settings, Main refresh wiring and the
  provider/model functional scenario.

## Architecture review

- Responsibility: `@neko/host/settings` remains the only durable Provider/model/config authority; Renderer owns only
  selection and presentation.
- Dependency: the preset catalog is renderer-safe and does not import Electron, Node, DSH internals or generation
  runtime code.
- Interface: one strict canonical request carries exact Provider type, one family, optional DSH protocol and optional
  model template identity.
- Extension: a newly adapted generation API adds a catalog entry/template while execution capability remains owned
  by its provider adapter and GenerationJob.
- Testability: exact preset/type/family/protocol rules, collisions, model-template policy and multi-workspace reload
  are covered at the owning Host boundary.

## Findings and fixes

No open blocking finding remains in the scoped diff. Review found and fixed four issues before delivery:

- Model template IDs could collide across user Provider records; model IDs are now provider-qualified and Host
  rejects cross-provider ID reuse.
- ByteDance could bypass its builtin-template-only policy through a custom model request; Host now enforces the
  catalog policy for every matching native Provider type.
- Provider creation could overwrite an existing ID while carrying a preset; Host now rejects it explicitly.
- Provider type and DSH protocol could disagree; Host now validates canonical Anthropic, Ollama and NewAPI pairs.

Residual risk is limited to the blocked clean-process UI run and unexecuted paid provider calls documented in
`verification.md`; unrelated dirty-worktree failures were not modified.
