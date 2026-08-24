## Why

The Professional Applications catalog currently exposes every supported profile as though it were
already added. It can create or update a binding, but it cannot distinguish an available profile
from a user-managed integration, disable an integration without losing configuration, or remove the
binding. The Extensions surface therefore cannot provide honest add, enable, disable and delete
actions.

## What Changes

- Model user-managed Professional Application integration state separately from the immutable
  supported-profile catalog.
- Treat add as creating an enabled binding to a known profile, enable/disable as changing whether
  that binding participates in launch and handoff, and delete as removing only the OpenNeko binding.
- Keep application installation, deletion and vendor lifecycle outside OpenNeko. Removing an
  integration never deletes or uninstalls the external application.
- Add sender-bound commands and management UI with explicit confirmation for binding removal.

## Capabilities

### New Capabilities

- `professional-application-binding-lifecycle`: Users can add, enable, disable and remove bindings
  for supported Professional Application profiles without mutating the external application.

## Impact

- `@neko/professional-apps-contracts`: binding lifecycle state and strict Host/runtime commands.
- `@neko/professional-apps-node`: canonical binding mutation and disabled-operation enforcement.
- `@neko/professional-apps-webview`: add, status, enablement and removal presentation.
- `apps/neko-desktop`: sender-bound native application selection and composition only; it does not
  own integration state.
- Local metadata stores the canonical binding and enablement. Existing rows are updated atomically
  to the new canonical shape; external application files are untouched.
