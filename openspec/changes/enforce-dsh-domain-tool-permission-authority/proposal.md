## Why

DSH is already the product's sole Agent permission authority, but first-party OpenNeko domain Tools
cross the reverse ACP Host boundary without carrying the effective DSH Session sandbox mode. Native DSH
filesystem and Shell Tools therefore honor `read-only`, `workspace-write` and `danger-full-access`, while
Canvas, Generation, Cut, Character and World Host mutations can currently execute without consulting that
same per-call policy. Treating Symlinks or an OpenNeko-specific read/write table as the missing authority
would create a second permission model and still leave non-file domain mutations inconsistent.

## What Changes

- Extend the single canonical reverse ACP domain Tool request with the effective DSH sandbox mode resolved
  from the exact calling Session at dispatch time.
- Keep DSH `ctx.sandboxPolicy` as the only permission-mode owner. OpenNeko transports and enforces that
  fact but does not define another preset catalog, UI mode, approval policy or Symlink-specific permission.
- Let each owning domain Host adapter classify its decoded operation as read-only or mutating. A mutating
  operation under DSH `read-only` fails locally before resolving or invoking the owning service; read
  operations remain available.
- Preserve the exact Conversation/Workspace/authoring grant and existing Content/path authorization as
  independent resource authority. `workspace-write` and `danger-full-access` do not bypass domain
  contracts, protected project state or exact resource identity.
- Atomically update all request producers, consumers, fixtures and contract tests; missing, unknown or
  forged sandbox facts fail the exact Tool request instead of defaulting to a more permissive mode.

## Capabilities

### Added Capabilities

- `dsh-domain-tool-permission-authority`: Defines how the effective DSH Session sandbox mode travels over
  reverse ACP and gates first-party Host domain Tool effects without creating an OpenNeko permission model.

## Impact

- `@neko/agent-contracts` owns the canonical reverse ACP request shape and strict decoder.
- `@neko/dsh-bridge` is the trusted producer that reads `ctx.sandboxPolicy.resolve({ session })` for every
  Host Tool call.
- `@neko/agent-runtime` owns host-neutral effect enforcement and delegates only authorized operations to
  Canvas, Generation, Cut, Character and World application services.
- `apps/neko-desktop` remains a thin exact Session/Conversation/Workspace grant composer and receives no
  new permission policy or Renderer-controlled authorization input.
- No Agent Webview UI, user content or persisted business record changes. Existing Symlink and Content
  path rules remain resource-resolution constraints, not Agent permission modes.
