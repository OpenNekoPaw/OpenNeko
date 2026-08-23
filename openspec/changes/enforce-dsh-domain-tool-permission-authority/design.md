## Context

The DSH standard preset already owns the user-visible permission choices. Its sandbox-policy service folds
the exact Session's `sandbox/mode` events and exposes one per-call policy. OpenNeko domain Tools execute on
the Host side because they need owning-package services and exact Workspace grants; that reverse boundary
currently omits the DSH policy fact.

The former `feat-desktop` Symlink read/write changes are not a valid replacement path. A Symlink is a path
projection, not the authority that decides whether an Agent may mutate state. Static read/write separation
would duplicate DSH policy and would not cover Canvas, Generation, Cut or authoring mutations.

## Five-layer analysis

### Responsibilities

- DSH owns sandbox modes, preset selection and the effective per-Session policy.
- Each domain owns its operation schema and whether a decoded operation mutates durable state.
- `@neko/agent-runtime` owns the host-neutral gate that combines those two facts before service access.
- Desktop owns exact Session/Conversation/Workspace binding and concrete Host adapters only.
- Content/path owners continue validating locators, protected namespaces and managed mounts independently
  of Agent mode.

### Dependencies

`@neko/dsh-bridge` takes an explicit dependency on the public DSH sandbox-policy service and transports only
the resolved mode, never its virtual process path. Agent contracts remain independent of DSH implementation
classes. Runtime adapters depend on the canonical request and their owning domain decoders. Renderer and
Webview receive no enforcement role.

### Interface

The canonical `DshAcpDomainToolRequest` adds one required `sandboxMode` field with the three values exposed
by DSH. The bridge resolves it inside the trusted DSH process for every call. The Host decoder rejects
missing, unknown and extra request fields. No default is allowed because a missing permission fact cannot
be interpreted safely.

After each owning adapter validates the Tool name and decodes the exact operation, it calls one shared
effect guard with `read` or `write`. `read-only + write` returns `DSH_DOMAIN_TOOL_READ_ONLY`; every other
combination continues to the same existing service path. The guard does not inspect paths, Symlinks,
workspaces or UI state.

### Extension

New first-party domain operations must declare their effect at the owning adapter immediately after their
canonical decoder. The shared guard remains limited to DSH mode semantics and does not grow a centralized
inventory of domain operation strings. New DSH modes require an atomic dependency/contract update rather
than an OpenNeko fallback.

### Testing

- Contract tests prove the one canonical shape and reject absent/unknown/extra sandbox facts.
- Bridge tests prove the mode comes from `ctx.sandboxPolicy.resolve({ session: exactAgent.session })` on
  every dispatch and is not inferred from a Renderer value or cached preset name.
- Adapter tests prove read-only queries still execute, read-only mutations never resolve/invoke services,
  and workspace-write mutations retain the existing exact service path.
- Desktop delegation tests prove the same request and exact Workspace/authoring grant reach the package
  runtime without a Desktop permission table.
- Poison checks prove no merged Symlink permission path or permissive missing-mode fallback participates.

## Runtime boundary and canonical path

```text
user selects DSH preset
  -> exact DSH Session sandbox/mode event
  -> ctx.sandboxPolicy.resolve({ session }) per Host Tool call
  -> canonical reverse ACP request { sandboxMode }
  -> strict Host decode / exact Conversation binding
  -> owning domain decoder
  -> shared read-or-write effect guard
  -> exact owning application service
```

The replaced path is implicit unrestricted Host domain execution. There is no second successful path based
on Symlink type, Renderer state, active Workspace, cached preset name or a default mode.

## User-data and failure behavior

This change does not migrate or rewrite user data. A denied mutation returns an exact Tool diagnostic and
does not resolve the mutating service. Sibling Tool calls, Conversations and Workspaces remain usable.
Invalid permission transport data rejects only that reverse ACP request.

## Agent Evaluation disposition

- `dsh-standard-permission-presets`: **reuse / excluded**. DSH owns preset names and mode semantics; the
  existing coverage-index exclusion remains correct and must not be replaced by OpenNeko behavior tests.
- OpenNeko Host domain Tool enforcement: **excluded from provider-backed model evaluation** because the
  changed behavior is a deterministic trust-boundary rule after DSH has already selected a Tool call. It is
  validated by canonical producer/consumer tests with exact Session modes. A visible provider run may be
  recorded as supplementary evidence, but model selection variance cannot be the acceptance authority.

Behavior contract: read-only Host queries succeed; read-only Host mutations return the exact denial before
any domain effect; workspace-write mutations retain their exact owner/grant path. Forbidden fallbacks are
OpenNeko preset inference, Renderer permission input, missing-mode defaults, Symlink-owned permission and
retrying the mutation through another Tool or service.
