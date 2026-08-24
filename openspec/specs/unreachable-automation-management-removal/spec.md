# unreachable-automation-management-removal Specification

## Purpose
Keep unreachable Automation management UI and Desktop wiring removed while retaining only the explicit safety kernel.
## Requirements
### Requirement: Unreachable Automation management is absent

The repository MUST NOT retain the unmounted Automation Webview workspace, local-runtime or permission
management Desktop bridges, IPC channels, contracts, services, tests, styles or translations.

#### Scenario: Dead management graph is scanned

- **WHEN** workspace manifests, application entries, package exports and source paths are inspected
- **THEN** no deleted Automation management path is reachable or present
- **AND** no placeholder, no-op handler or compatibility alias replaces it

### Requirement: Retained Automation kernel is not a product claim

The exact Automation target/session/grant/action/evidence safety kernel MUST remain explicitly
classified as `retained-kernel` and MUST be unreachable from supported Desktop application entries
until a real official DSH integration is implemented.

#### Scenario: Product reachability is checked

- **WHEN** package product status is derived from Desktop production entries
- **THEN** `@neko/automation-contracts` and `@neko/automation-node` are not active-product
- **AND** their focused unit tests continue to enforce exact identity and fail-visible safety behavior
