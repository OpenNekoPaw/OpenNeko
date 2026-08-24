## Context

Supported profiles are immutable product capabilities owned by `@neko/professional-apps-node`.
User-managed bindings are local durable facts owned by the Professional Applications binding
repository. The current projection conflates these two concepts and has no remove or enablement
command.

## Decisions

### 1. A profile is available; a binding is added

Every supported profile remains discoverable in the `all` catalog. Only profiles with a binding are
present in the `added` view. The projection always contains explicit `enabled` state. Enablement is a
separate repository-owned fact; no override row permanently means enabled, while a stored false value
disables execution without deleting the binding.

### 2. Delete means remove the binding

`removeBinding(integrationId)` deletes only the local metadata row after confirmation. It does not
invoke the OS uninstaller, delete an application bundle, remove external configuration, or change a
vendor installation.

### 3. Disabled integrations are unavailable to execution consumers

Management projections continue to show disabled bindings. Launch, handoff and Agent product
handlers reject a disabled binding visibly. Catalog and sibling integrations remain available.

### 4. Package ownership and path

The canonical path is:

```text
Professional Applications Webview
  -> ProfessionalApplicationManagementRuntime
  -> sender-bound Desktop Host adapter
  -> ProfessionalApplicationService
  -> ProfessionalApplicationBindingRepository
```

The package service owns lifecycle semantics. Desktop Main retains only sender identity and native
application selection because those require Electron.

## Five-layer analysis

- Responsibility: contracts describe lifecycle; the Node service owns mutation and execution gates;
  Desktop owns native selection; Webview owns confirmation/presentation.
- Dependency: contracts remain L0, Webview browser-only, Node host-neutral, Electron code stays in
  the application adapter.
- Interface: exact `binding.enablement.update` and `binding.remove` commands return the canonical
  projection; no generic patch or free-form mutation exists.
- Extension: new profiles reuse the same binding lifecycle without changing the repository schema or
  command family.
- Testing: strict contract, repository reopen, service execution rejection, sender-bound Host,
  Webview interaction and visible Desktop checks cover the full path.

## User-data impact

The repository keeps one binding row and an optional enablement row per integration. Existing valid
binding rows retain their bytes and use the canonical no-override enabled state. Invalid rows remain
locally diagnosed and do not affect sibling profiles. No external application data is changed.
