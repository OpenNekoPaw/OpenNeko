## Context

`@neko/automation-webview` contains React Roots but has no production value import. Desktop still
constructs local-runtime and permission services and exposes sender-bound channels with no Renderer
consumer. The remaining Automation kernel is documented but not yet integrated with an official DSH
MCP product path.

## Decisions

### 1. Remove only the closed dead management graph

The Webview workspace, Desktop renderer runtimes, preload/IPC handlers, Main adapters, and their
local-runtime/permission management contracts and services are deleted together. Target-selection and
session-control contracts remain because they belong to the safety kernel, not the dead management UI.

### 2. Retain the kernel without pretending it is active

Automation contracts/node become `retained-kernel`. They remain testable but cannot be imported from a
supported Desktop entry. No dummy registration, hidden IPC, placeholder UI or no-op adapter keeps them
product-reachable.

### 3. Do not reinterpret Extension identity

Existing Automation core fields that use `extensionId` are part of the retained, unintegrated contract
and are not migrated in this cleanup. Replacing that identity requires a separate Automation domain
design because it affects exact grants and user authorization semantics.

### 4. Verification and evaluation

Package/product-status and unused-code gates prove no production path remains. Focused Automation unit
tests prove the retained kernel still validates exact identity and fail-visible safety boundaries.
Agent Evaluation is excluded because no Agent Tool or supported Automation path changes from one
successful implementation to another; both before and after this cleanup, the kernel has no complete
Desktop Agent consumer.

## Five-layer analysis

- Responsibility: retain exact Automation safety rules; delete presentation/management with no caller.
- Dependency: remove React and Desktop IPC edges; retained kernel remains host-neutral/Node.
- Interface: delete only management DTOs/channels; keep target/session safety contracts.
- Extension: future official integration must add one explicit consumer and reclassify package status.
- Testing: absence/product-status gates plus retained contracts/node unit tests.

## Risks

- Historical docs and evaluation assertions may mention future Automation behavior. They remain valid as
  roadmap/evaluation authoring only when they do not claim a current product path.
- Removing dormant local-runtime configuration means future integration must design a fresh canonical
  authorization path rather than reviving the deleted bridge.
