# W1 Extension Management Public API Blocker

OpenSpec task 4.7 remains open.

The following exact public DSH packages were installed and audited during qualification:

- `@deepseek-ai/dsh-skill@0.1.0-rc.7`
- `@deepseek-ai/dsh-settings@0.1.0-rc.7`
- `@deepseek-ai/dsh-host-plugin-inventory@0.1.0-rc.7`

Workspace canonical installation completed with:

```bash
pnpm install --no-frozen-lockfile
```

No manual `node_modules` symlink and no dependency from `scripts/dsh-q0` was used. The audit found no
production implementation that can satisfy the frozen extension-management contract through these public
surfaces. The three audit-only packages were therefore removed from the production bridge manifest and
lockfile instead of being retained as unused runtime dependencies. The public API findings below remain the
qualification evidence; the core DSH Agent/Session/Tool bridge closure is unchanged. `@neko/dsh-bridge`
typecheck and its eight focused tests pass after this cleanup.

The remaining blocker is the public rc.7 capability surface rather than package installation:

- `@deepseek-ai/dsh-skill` exposes the authoritative `ctx.skills.snapshot()` catalog, but does not expose MCP or Plugin inventory.
- `@deepseek-ai/dsh-host-plugin-inventory` exposes only a point-in-time, read-only Cordis Loader entry projection. It has no provenance, mutation command, MCP contribution catalog, failure history, or subscription.
- `@deepseek-ai/dsh-settings` exposes namespace descriptors and writes, but its own public documentation states that `describe({ redactSecrets: true })` is not a proven fail-closed wire boundary for union, intersection, transform, or secret defaults. OpenNeko cannot forward that descriptor across ACP until DSH provides a wire-safe public method or every exposed namespace is independently proven safe.
- No public `@deepseek-ai/dsh-mcp` package exists in the registry, so an authoritative MCP inventory/readiness contract has not been identified.

No extension inventory/readiness/configuration/diagnostics implementation is claimed. Task 4.7 remains unchecked until the missing public surfaces are available or an OpenSpec-approved, public-API-only composition can satisfy the frozen contract without creating a second registry or leaking settings secrets.
