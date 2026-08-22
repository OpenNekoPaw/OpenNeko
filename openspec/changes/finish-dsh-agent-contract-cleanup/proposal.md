## Why

The Pi-to-DSH replacement removed OpenNeko-owned provider routing, generic Tool registries, profile
registries, perception pipelines and legacy conversation presentation paths, but
`@neko/agent-contracts` still exports their orphaned contracts and several unreachable
storyboard/comic/plugin-transfer artifact graphs. The stale public surface keeps retired ownership
models discoverable, preserves unnecessary cross-domain dependencies and makes DSH contracts appear
to coexist with an OpenNeko Tool/Platform runtime.

## What Changes

- Delete contract files, exports, fixtures and tests that have no current production consumer after
  the DSH migration.
- Delete only the old Agent runtime/Webview projection modules whose sole purpose is consuming those
  retired contracts.
- Preserve the canonical DSH ACP, session/runtime/permission Host contracts, Agent Entry and
  Conversation contracts, current composer/input contracts, attachment transport, Skill/MCP
  management and package-owned domain Tool contracts.
- Add path/public-surface gates proving the retired symbols and files cannot be reintroduced.
- Update the archived pre-Pi cleanup capability requirement so its canonical-path assertions describe
  DSH rather than the removed Pi runtime.
- Do not create `@neko/agent-domain`, migrate behavior, rename Skill/MCP management or change a live
  DSH Tool route in this change.

## Capabilities

### Modified Capabilities

- `agent-dead-public-surface-removal`: Extend dead-surface removal through the completed DSH migration
  and replace obsolete Pi preservation requirements with canonical DSH path requirements.

## Impact

- Owner: `@neko/agent-contracts` remains the L0 Agent/Main/preload/renderer wire and codec owner;
  `@neko/agent-runtime` retains only live DSH application and Host boundary consumers.
- Affected package roles: `packages/agent/contracts` public types/codecs, dead-only
  `packages/agent/runtime` projection modules and a dead-only `packages/agent/webview` presenter.
- Canonical public paths: `@neko/agent-contracts/dsh-acp`, `dsh-session-host`, `dsh-runtime-host`,
  `dsh-permission-host`, Agent Entry/Conversation contracts and current package-owned DSH Tool
  contributions remain unchanged.
- Replaced path: generic OpenNeko Tool/Platform/Profile/ProviderCard/Perception contracts, legacy
  message/composite/multimodal artifact projections and PluginTransfer contracts are removed without
  aliases or compatibility re-exports.
- User data: none. No persisted conversation, transcript, project, content, Canvas, Cut, Character or
  World bytes are read, rewritten or migrated.
