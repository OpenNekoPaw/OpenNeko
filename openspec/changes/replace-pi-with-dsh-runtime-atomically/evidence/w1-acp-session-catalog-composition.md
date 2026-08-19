# W1 ACP Session Catalog Composition

## Implemented Scope

`@neko/agent-runtime/application` now owns the composition from ACP `session/list` to the Conversation-to-DSH-Session binding, persistent binding store, and Conversation-scoped ACP client. Desktop Main owns only the subprocess and transport lifecycle composition.

The adapter:

- scans every ACP catalog page before deciding resolvability, with a fixed 100-page external-boundary limit;
- accepts only the exact requested DSH Session identity and never substitutes an active, recent, first, or otherwise listed Session;
- rejects duplicate Session identities across pages, empty continuation cursors, repeated cursors, and overlong pagination fail-visibly;
- prevents a missing Session from reaching the binding store;
- revalidates the exact binding through the ACP catalog before each bound operation, so a stale binding fails before prompt/load/resume/close/cancel/inbox transport;
- persists only the exact Conversation and DSH Session identity pair in the canonical `LocalMetadataStore`, with database-enforced one-to-one uniqueness and compare-and-delete unbind;
- restores the exact binding after metadata-store reopen, while an invalid record fails only its read and leaves valid sibling bindings available;
- injects `DesktopDshSubprocessSupervisor.transport` into `DshAcpApplicationClient`, then injects the persistent store into the package-owned Conversation application;
- disposes the one subprocess when ACP connection fails and reports both connection and disposal failures when cleanup also fails;
- does not copy DSH Session or transcript authority into Host storage.

## Focused Verification

```bash
pnpm --dir packages/agent/runtime exec vitest run \
  src/application/conversation-dsh-session-application.test.ts \
  src/application/conversation-dsh-session-binding-repository.test.ts \
  src/application/conversation-dsh-session-binding.test.ts \
  src/application/conversation-dsh-session-client.test.ts
pnpm --dir packages/agent/runtime run typecheck
pnpm --dir apps/neko-desktop exec vitest run \
  src/main/desktop-dsh-agent-runtime.test.ts \
  src/main/desktop-dsh-subprocess-supervisor.test.ts
pnpm check:application-boundaries
pnpm check:package-boundaries
pnpm check:storage-authorities
pnpm check:no-internal-versioning
```

All passed. The full `@neko/agent-runtime` suite now covers 58 files / 498 tests; the focused ACP client/application/repository run covered 3 files / 22 tests, and the Desktop supervisor/composition run covered 2 files / 12 tests. Package typecheck and all listed architecture/storage/versioning gates passed.

This extends tasks 4.2, 4.3, 4.10, and 4.13. Tasks 4.2 and 4.3 remain open because the Desktop product composition root does not yet resolve and start a product-qualified packaged DSH/Node runtime closure. The tested Desktop composition is the canonical wiring component, not a second runtime or release-ready executable path.
