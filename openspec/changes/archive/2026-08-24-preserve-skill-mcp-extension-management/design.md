## Context

The intended canonical path is:

```text
Desktop Extensions navigation
  -> Host extensions Window scene
  -> Agent Skill/MCP management Webview
  -> sender-bound Desktop preload/Main adapter
  -> Agent ACP application client
  -> OpenNeko DSH bridge read-only Skill/MCP projection
  -> exact running DSH profile authority
```

The removed OpenNeko Plugin manager, `plugin_states`, mutable Plugin package catalog and third-party
Plugin/Webview loading remain retired. DSH uses Plugin packages internally to compose first-party
Tools and MCP contributions, but that implementation detail is not a third user-visible extension
type.

## Decisions

### 1. The product surface has exactly Skill and MCP tabs

`AgentExtensionManagementProjection` contains `skills`, `mcp`, and bounded diagnostics. It contains
no `plugins`, package installation state, enablement state, Marketplace state, raw settings, or
executable location. Strict decoders reject extra Plugin-shaped fields.

### 2. DSH remains authoritative

The Desktop Host reads a snapshot from the exact running DSH client. Desktop and Agent Webview do not
discover packages, connect MCP servers, load Skills, write DSH storage, or infer readiness. Runtime
unavailability produces a local diagnostic for this surface and does not disable sibling scenes or
Agent Sessions.

### 3. Desktop owns only the trust and composition boundary

`apps/neko-desktop` validates sender-to-Window identity, exposes one typed IPC route and wires the
package-owned Root. This behavior requires Electron sender identity and therefore belongs in the app
adapter. Catalog projection and strict contracts remain package-owned and host-neutral.

### 4. Plugin management remains poisoned

Quality gates reject restoration of OpenNeko Plugin runtime/catalog/config authority, user-installable
Plugin UI, third-party executable Plugin/Webview loading, wildcard registration, and parallel Skill or
MCP runtimes. First-party `*-dsh-plugin` packages remain allowed only as locked internal DSH Tool
composition.

## Five-layer analysis

- Responsibility: DSH owns Skill/MCP facts; Agent packages own contracts/presentation; Host owns scene;
  Desktop owns sender-bound wiring.
- Dependency: L0 contracts do not depend on runtime; Webview stays browser-only; Electron code stays in
  Desktop Main/preload.
- Interface: one snapshot route and one strict canonical `skills`/`mcp` projection.
- Extension: adding a third visible type requires a new contract and OpenSpec rather than a generic
  catch-all catalog.
- Testing: producer/consumer contract tests, bridge tests, Host scene tests, Desktop composition tests,
  Plugin poison scans, and visible UI validation cover the full boundary.

## Evaluation and UI disposition

Agent Evaluation is excluded from real-provider execution because this change restores a read-only
management projection and does not alter Skill invocation, MCP Tool registration/routing, prompts,
models, Session workflow, or Agent output. Deterministic path and poison tests plus key-free suite
validation are required. UI validation is applicable because the navigation and catalog surface are
user-visible; authoritative validation requires the Desktop runtime.
