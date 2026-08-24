## Context

DSH is the sole Skill/MCP runtime authority. The current bridge exposes only `extensions/read`; its MCP
array is always empty. The official DSH MCP client is available as a Loader contribution, while the
DSH Skill filesystem provider discovers personal Skills from `$DSH_HOME/skills`.

## Decisions

### 1. Commands execute inside the DSH authority

Enablement and MCP Loader mutation are performed through the OpenNeko DSH bridge using public DSH
registry/Loader APIs. Desktop never infers effective state, writes Cordis entries directly, or runs a
second MCP client.

### 2. Skill lifecycle is source-aware

Personal Skills may be imported, disabled, enabled and removed. Bundled Skills may be disabled only
when the DSH runtime can enforce the same state for discovery, explicit invocation and model prompt
injection. Project Skills are managed in their owning Workspace, not from the global surface.

### 3. MCP addition is an explicit trust boundary

The add flow accepts a qualified stdio or streamable-HTTP server configuration. Stdio commands and
network endpoints require explicit confirmation. This initial contract accepts no credential or
environment fields; projections contain identity, description, transport and status only, never
executable arguments or endpoints.

### 4. Plugin remains internal

MCP uses one first-party, precisely locked `@deepseek-ai/dsh-mcp-client` Loader entry per server.
Neither the contract nor the UI exposes generic Plugin inventory, arbitrary JavaScript packages or
third-party Webviews.

### 5. Skill discovery refresh preserves active Agent work

Personal Skill filesystem mutation requests one canonical DSH configuration refresh. When any turn
or tracked DSH work is active, Desktop blocks new work and defers subprocess replacement until the
active work reaches its terminal boundary. Extension Management never calls the unconditional
runtime restart operation, resets session projections, or disposes the subprocess underneath an
active sibling Agent Session. Skill validation and Skill/MCP management writes participate in the
same tracked-work boundary so a concurrent window cannot dispose their owning generation mid-call;
read-only Extension projection remains available while refresh is pending.

### 6. MCP mutation is linearized by the DSH owner

The DSH extension lifecycle serializes every valid MCP add, enable, disable and remove operation
through one owner-local mutation tail. Persistence and Loader reconciliation complete before the
next mutation observes state. Read projection waits for any already-enqueued mutation, so the
in-memory catalog, persisted file and official Loader cannot expose different successful snapshots
because two Desktop windows submitted operations concurrently.

## Canonical paths

```text
Skill import picker -> Desktop staging/containment -> DSH validation -> personal Skill root
Skill mutation -> sender-bound Host -> ACP bridge -> DSH Skill management owner
MCP mutation -> sender-bound Host -> ACP bridge -> DSH Loader -> official MCP client
```

## Five-layer analysis

- Responsibility: DSH owns effective catalog and runtime; Host owns native selection and path
  containment; Webview owns intent and confirmation.
- Dependency: Agent contracts remain L0; DSH package code depends only on public DSH APIs; Renderer
  receives no paths, commands or credentials.
- Interface: exact add/enable/disable/remove commands use stable capability identity and return a new
  canonical snapshot.
- Extension: another MCP transport requires an explicit contract addition; it cannot enter through a
  free-form Plugin config.
- Testing: producer/consumer shape, effective Tool/Skill path, loader persistence, disable/re-enable,
  concurrent mutation ordering, active-turn preservation, secret redaction, sender binding and
  sibling failure isolation are all required.

## Risks

- Stdio MCP is executable-code authority. The official client receives an empty explicit environment
  overlay on top of its scrubbed ambient environment, and OpenNeko exposes no credential input yet.
- Current OpenNeko DSH dependencies do not include the official MCP client. Packaging and release
  closure must be verified before the MCP add button becomes enabled.
- Skill filesystem mutation must not overwrite a same-name package or follow symlinks outside the
  selected source.
