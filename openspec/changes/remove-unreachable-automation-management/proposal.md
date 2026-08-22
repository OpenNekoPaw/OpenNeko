## Why

Automation management UI and Desktop bridges are not mounted by any production Renderer path, yet
the repository retains a full Webview package, preload/IPC channels, Main services and local runtime /
permission management contracts. These hidden successful paths inflate Desktop and misclassify a
React package as `content-only`.

## What Changes

- Delete the unreachable `@neko/automation-webview` workspace and its Desktop-only styles/i18n.
- Delete the unconsumed local-runtime and permission-management contracts, Node services, Desktop
  adapters, renderer runtimes, preload/IPC handlers and composition.
- Retain the host-neutral Automation safety kernel: exact provider/target/session/grant/action/evidence
  contracts, target selection, session control and Node authorization/orchestration.
- Mark the retained Automation contracts/node packages `retained-kernel` until a real DSH/Desktop
  production consumer is implemented through a separate change.

## Capabilities

### Added Capabilities

- `unreachable-automation-management-removal`: Dormant Automation UI/management paths are absent while
  the explicitly retained safety kernel remains production-unreachable.

## Impact

- Owner: `@neko/automation-contracts` and `@neko/automation-node` retain only the reviewed safety kernel;
  the removed presentation/management capability has no owner or supported product entry.
- Affected package roles: Automation contracts/node/webview, Desktop Main/preload/renderer composition,
  package role/product-status catalogs and workspace lockfile.
- Canonical path: none is claimed for product Automation until official DSH MCP integration gains a
  complete Desktop consumer; retained kernel code cannot be reached from application entries.
- User data: none. The removed paths have no mounted UI and no production-created durable runtime or
  permission records.
