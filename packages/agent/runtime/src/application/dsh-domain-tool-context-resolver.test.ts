import { describe, expect, it } from 'vitest';

import {
  createDshDomainToolContextResolver,
  DshDomainToolContextError,
} from './dsh-domain-tool-context-resolver';

describe('DSH domain Tool context resolver', () => {
  it('resolves the exact DSH Session through its Conversation to durable Workspace context', async () => {
    const resolver = createDshDomainToolContextResolver({
      bindings: {
        async getByDshSessionId(dshSessionId) {
          return {
            conversationId: '00000000-01ARZ3NDEKTSV4RRFFQ69G5FAV',
            dshSessionId,
          };
        },
      },
      contexts: {
        async readContext() {
          return {
            kind: 'workspace',
            workspaceId: 'workspace:one',
            workspaceGrantId: 'workspace-grant:one',
          };
        },
      },
    });

    await expect(resolver.resolve('dsh-session:one')).resolves.toEqual({
      conversationId: '00000000-01ARZ3NDEKTSV4RRFFQ69G5FAV',
      dshSessionId: 'dsh-session:one',
      binding: {
        kind: 'workspace',
        workspaceId: 'workspace:one',
        workspaceGrantId: 'workspace-grant:one',
      },
    });
  });

  it('rejects a missing exact Session binding without reading another Conversation context', async () => {
    let contextReads = 0;
    const resolver = createDshDomainToolContextResolver({
      bindings: { async getByDshSessionId() {} },
      contexts: {
        async readContext() {
          contextReads += 1;
          return { kind: 'assistant', assistantSpaceId: 'assistant:one', baseGrantIds: [] };
        },
      },
    });

    await expect(resolver.resolve('dsh-session:missing')).rejects.toMatchObject({
      code: 'DSH_DOMAIN_TOOL_CONVERSATION_MISSING',
    });
    expect(contextReads).toBe(0);
  });

  it('rejects missing context locally while a sibling Session remains resolvable', async () => {
    const resolver = createDshDomainToolContextResolver({
      bindings: {
        async getByDshSessionId(dshSessionId) {
          return {
            conversationId:
              dshSessionId === 'dsh-session:invalid'
                ? '00000000-01ARZ3NDEKTSV4RRFFQ69G5FAA'
                : '00000000-01ARZ3NDEKTSV4RRFFQ69G5FAB',
            dshSessionId,
          };
        },
      },
      contexts: {
        async readContext(conversationId) {
          return conversationId.endsWith('AA')
            ? undefined
            : { kind: 'assistant', assistantSpaceId: 'assistant:one', baseGrantIds: [] };
        },
      },
    });

    await expect(resolver.resolve('dsh-session:invalid')).rejects.toBeInstanceOf(
      DshDomainToolContextError,
    );
    await expect(resolver.resolve('dsh-session:sibling')).resolves.toMatchObject({
      dshSessionId: 'dsh-session:sibling',
      binding: { kind: 'assistant', assistantSpaceId: 'assistant:one' },
    });
  });

  it('rejects a store result for another Session', async () => {
    const resolver = createDshDomainToolContextResolver({
      bindings: {
        async getByDshSessionId() {
          return {
            conversationId: '00000000-01ARZ3NDEKTSV4RRFFQ69G5FAC',
            dshSessionId: 'dsh-session:other',
          };
        },
      },
      contexts: { async readContext() {} },
    });

    await expect(resolver.resolve('dsh-session:requested')).rejects.toMatchObject({
      code: 'DSH_DOMAIN_TOOL_SESSION_INVALID',
    });
  });
});
