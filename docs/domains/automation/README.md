# Browser and Computer Automation

Browser/Computer Automation connects user-managed external runtimes to the existing OpenNeko Agent Tool path. It is
an adapter domain, not a package manager, extension certification service, or second Agent runtime.

## Ownership

| Owner | Responsibility |
| --- | --- |
| Agent Extension service | Discover Plugin contributions, persist enablement, load Skills/ordinary MCP/Apps, and expose local diagnostics |
| MCP Manager | Own standard MCP connection, Tool discovery, calls, cancellation, and fail-local protocol errors |
| Automation package | Own compatible operation selection, exact session/target/mode/budget, action approval, and observation projection |
| Desktop Main | Own file/app selection, realpath authority, process environment, OS permissions, window/process adapters, clipboard, and Cua signature/TCC checks |
| Renderer/Webview | Render opaque identity, commands, actions, current state, and safe diagnostics through typed ports |

The canonical Agent path remains:

```text
enabled Plugin
  -> MCP Manager / Automation adapter
  -> Tool Registry
  -> Pi Tool Call
  -> exact Automation session and target
```

Raw Browser/Cua MCP Tools never bypass the product-owned adapter when exact target, OS permission, or action semantics
are required.

## Open Plugin, Skill and MCP access

- OpenNeko, personal, workspace, and third-party Plugin/Skill sources use the public manifest and `SKILL.md` discovery
  contracts. Workspace Skills remain subject to Workspace Trust.
- Plugin enablement is the only durable loading consent. It is stored as `{ pluginId, enabled }`; OpenNeko does not
  maintain declared/accepted permission sets or qualification badges.
- Ordinary MCP servers use the standard MCP SDK and the single MCP Manager -> Tool Registry path. A malformed Tool or
  failed server affects only its owning contribution.
- Tool confirmation, external process authorization, OS permission, and Automation action approval remain independent
  real gates. Manifest text, Skill content, version strings, annotations, or a successful process exit cannot grant them.

## User-managed Browser Use and Cua

OpenNeko displays upstream guidance and a copyable command but never executes install/update/uninstall commands.

- Browser Use: `uvx --from 'browser-use[cli]' browser-use --mcp`
- Cua Driver on macOS/Linux: `/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"`

The user explicitly selects required assets. Package/domain contracts receive only opaque runtime identities; exact Host
paths remain in Desktop Main. Disconnect removes OpenNeko authority and never deletes external files.

Public runtime and endpoint state is intentionally small:

```text
not-configured | ready | error
```

Diagnostics explain the local cause, such as missing/changed resource, unreachable MCP server, wrong server identity,
missing required operation, incompatible required fields, or Cua signing/notarization failure. There is no
“qualified/unverified” public status matrix.

## Compatibility and security boundary

Compatibility checks only what the product adapter consumes:

1. the explicitly selected path or bundle authority remains exact;
2. MCP handshake succeeds and server name matches;
3. required operations exist;
4. the operation input schema is an object and contains adapter-required fields;
5. annotations do not contradict the product-owned effect classification;
6. Cua on macOS retains the expected bundle identifier, Developer ID/Team ID, notarization, and TCC responsibility chain.

Browser Use distribution releases, Cua short versions, MCP server versions, full directory digests, and full input-schema
digests are third-party facts, not default readiness gates. An upstream update is re-inspected through the same current
path and operation contract. Failure never selects another provider, installation, endpoint, or active/recent target.

## Session and evidence rules

- Browser runtime and browser executable authorities are selected separately. Session home/temp/data are isolated and
  do not inherit model credentials or general Host secrets.
- Computer sessions bind exact app/process/window/region identities. Target and applicable OS permission are checked
  again before approval and before input.
- Mutation approval is single-action and bound to the current Tool Call, target, and effect.
- Pause, Stop, and Take over affect only the exact Automation session.
- Screenshot bytes use short-lived authorization and are not persisted in transcript or exposed as Host paths.

## Current delivery status

The open Extension/local-runtime/endpoint management contracts and deterministic compatibility tests are implemented.
Production Browser/Cua provider/profile registration, real Browser domain binding, macOS permission fixtures, packaged
Desktop verification, and provider-backed visible Agent Evaluation remain explicit follow-up work in
[`../../../openspec/changes/integrate-open-source-browser-and-computer-use/`](../../../openspec/changes/integrate-open-source-browser-and-computer-use/).
