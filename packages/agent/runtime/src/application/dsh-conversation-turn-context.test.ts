import { describe, expect, it, vi } from 'vitest';

import { createCanvasWorkspaceBoardTarget } from '@neko/canvas-domain';

import { createDshConversationTurnContextResolver } from './dsh-conversation-turn-context';

describe('DSH Conversation turn context', () => {
  it('appends exact user-selected context as untrusted turn data', async () => {
    const resolver = createDshConversationTurnContextResolver({
      contexts: {
        readContext: async () => ({
          kind: 'assistant' as const,
          assistantSpaceId: 'assistant-1',
          baseGrantIds: [],
        }),
      },
      workspaceGrants: {
        resolveAuthorizedWorkspace: async () => {
          throw new Error('Workspace authority must not run.');
        },
      },
      canvas: {
        resolveTurnContext: async () => {
          throw new Error('Canvas authority must not run.');
        },
      },
    });

    await expect(
      resolver.resolve('conversation-1', [
        {
          type: 'asset',
          id: 'asset-lighting',
          label: 'Lighting',
          summary: 'Soft studio lighting',
          data: { assetRef: { assetId: 'asset-lighting' } },
        },
      ]),
    ).resolves.toContain(
      'Selected context: [{"type":"asset","id":"asset-lighting","label":"Lighting","summary":"Soft studio lighting","data":{"assetRef":{"assetId":"asset-lighting"}}}]',
    );
  });

  it('appends exact selected Workspace resources without exposing a host path', async () => {
    const resolver = createDshConversationTurnContextResolver({
      contexts: {
        readContext: async () => ({
          kind: 'assistant' as const,
          assistantSpaceId: 'assistant-1',
          baseGrantIds: [],
        }),
      },
      workspaceGrants: {
        resolveAuthorizedWorkspace: async () => {
          throw new Error('Workspace authority must not run.');
        },
      },
      canvas: {
        resolveTurnContext: async () => {
          throw new Error('Canvas authority must not run.');
        },
      },
    });

    await expect(
      resolver.resolve(
        'conversation-1',
        [],
        [
          {
            label: '卷01.epub',
            contentLocator: { file: { authority: 'workspace', path: 'books/卷01.epub' } },
          },
        ],
      ),
    ).resolves.toContain(
      'Selected resources: [{"label":"卷01.epub","contentLocator":{"file":{"authority":"workspace","path":"books/卷01.epub"}}}]',
    );
  });
  it('resolves the exact durable Workspace and canonical Board context', async () => {
    const resolveTurnContext = vi.fn(async (_workspaceId: string, target: unknown) => ({
      target: target as ReturnType<typeof createCanvasWorkspaceBoardTarget>,
    }));
    const resolver = createDshConversationTurnContextResolver({
      contexts: {
        readContext: vi.fn(async () => ({
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        })),
      },
      workspaceGrants: {
        resolveAuthorizedWorkspace: vi.fn(async () => ({
          workspace: { workspaceId: 'workspace-1' },
        })),
      },
      canvas: { resolveTurnContext },
    });

    await expect(resolver.resolve('conversation-1')).resolves.toContain('Workspace Board');
    expect(resolveTurnContext).toHaveBeenCalledWith(
      'workspace-1',
      createCanvasWorkspaceBoardTarget('workspace-1'),
    );
  });

  it('rejects unsupported domain context instead of emitting empty success', async () => {
    const resolver = createDshConversationTurnContextResolver({
      contexts: {
        readContext: vi.fn(async () => ({
          kind: 'character' as const,
          characterId: 'character-1',
          characterVersionId: 'version-1',
        })),
      },
      workspaceGrants: { resolveAuthorizedWorkspace: vi.fn() },
      canvas: { resolveTurnContext: vi.fn() },
    });

    await expect(resolver.resolve('conversation-character')).rejects.toThrow(
      /no canonical DSH product-context provider/u,
    );
  });
});
