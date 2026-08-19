# W1 Conversation-to-DSH Session Binding

## Implemented Scope

`packages/agent/runtime/src/application/conversation-dsh-session-binding.ts` provides the canonical OpenNeko-side Conversation-to-DSH-Session binding service. `packages/agent/runtime/src/application/conversation-dsh-session-client.ts` provides the ACP application consumer that resolves the exact binding before delegating to `DshAcpApplicationClient`.

The service:

- binds exactly one canonical Conversation identity to one DSH Session identity through a store-owned atomic `bind` operation, so concurrent binds cannot create duplicate Conversation/Session ownership;
- treats an exact same-pair rebind as idempotent (`ok: true`, `created: false`);
- validates a successful store `bind` result against the exact requested `conversationId` + `dshSessionId`; a mismatched store success fails with `STORE_BINDING_MISMATCH`;
- unbinds only through store-owned compare-and-delete `unbind(expected)`; a binding changed between read and delete is rejected with `CONVERSATION_BINDING_MISMATCH` and the replacement record is not deleted;
- resolves only through the exact stored binding; missing bindings fail with `CONVERSATION_BINDING_MISSING`;
- rejects DSH Session identities that are not currently resolvable through the ACP session list/load authority with `DSH_SESSION_STALE`;
- rejects a DSH Session already bound to another Conversation with `DSH_SESSION_ALREADY_BOUND`;
- rejects rebinding a Conversation to a different DSH Session without unbind with `CONVERSATION_BINDING_ALREADY_BOUND`;
- rejects non-canonical Conversation identities with `CONVERSATION_BINDING_INVALID`;
- rejects corrupted/cross-Conversation records returned by the store with `CONVERSATION_BINDING_CROSS_CONVERSATION`;
- never falls back to active/current/recent sessions and does not copy DSH Session storage or transcript authority;
- keeps sibling bindings usable when one bound DSH Session becomes unresolvable.

The bound client exposes `loadSession`, `resumeSession`, `closeSession`, `prompt`, `cancel`, `readInbox`, `replaceInboxMessage`, and `removeInboxMessage` as conversation-scoped operations. Each operation resolves the exact binding first and fails before transport on missing/stale/cross-Conversation identity. The bound client depends on a minimal structural `ConversationDshSessionAcpClient` port rather than the concrete ACP client class.

## Focused Verification

```bash
pnpm --dir packages/agent/runtime run typecheck
pnpm --dir packages/agent/runtime exec vitest run src/application/conversation-dsh-session-binding.test.ts src/application/conversation-dsh-session-client.test.ts
pnpm --dir packages/agent/runtime exec vitest run src/application src/acp
```

All passed.

This evidence supports OpenSpec task 4.10.
