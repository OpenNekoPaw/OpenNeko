# Desktop Agent release audit

## Current boundary

- Electron Main owns the program-level Pi conversation authority, CredentialStore and Pi Session root.
- Renderer consumes only typed sender-bound Agent projections through preload.
- Pi owns the generic Agent loop, provider protocol, Tool scheduling, Skill disclosure and transcript.
- OpenNeko owns product identities, permission, durable domain Jobs, stable resources and UI projection.
- Legacy AgentSession/Executor, Platform chat, duplicate transcript and retired Host composition paths
  are forbidden and must remain poisoned or absent.

## Required evidence

- Production Desktop Agent bundle size and cold-start/ready timing on a supported packaged target.
- Pi/provider dependency licenses and provenance.
- CredentialStore persistence/deletion/redaction and provider-scoped credential selection.
- OAuth callback binding, cancellation and shutdown cleanup where the configured provider uses OAuth.
- No secret, authorization header, absolute path, physical Skill locator or cache handle in renderer,
  logs, Pi Session, workspace facts or Evaluation facts.
- Deterministic no-fallback path checks plus applicable real-provider and packaged Electron evidence.

## Status

The audit remains open until task 1.1 records the measurements and any environment blockers. Key-free
Evaluation proves harness integrity only; browser, TUI, VS Code, direct-runtime or mock-provider runs do
not qualify the Electron Desktop release boundary.
