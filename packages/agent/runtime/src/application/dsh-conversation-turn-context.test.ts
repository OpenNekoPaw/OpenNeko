import { describe, expect, it, vi } from 'vitest';

import {
  createDefaultCanvasWorkspaceTarget,
  createCanvasWorkspaceTarget,
} from '@neko/canvas-domain';

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
      target: target as ReturnType<typeof createDefaultCanvasWorkspaceTarget>,
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

    const prompt = await resolver.resolve('conversation-1');
    expect(prompt).toContain('default Workspace Canvas');
    expect(prompt).toContain('Workspace reviewable Markdown admission');
    expect(prompt).toContain('reviewable-markdown');
    expect(prompt).toContain('active Skill may require a stricter creative structure');
    expect(resolveTurnContext).toHaveBeenCalledWith(
      'workspace-1',
      createDefaultCanvasWorkspaceTarget('workspace-1'),
    );
  });

  it('does not admit durable Markdown artifacts outside Workspace context', async () => {
    const resolver = createDshConversationTurnContextResolver({
      contexts: {
        readContext: async () => ({
          kind: 'assistant' as const,
          assistantSpaceId: 'assistant-1',
          baseGrantIds: [],
        }),
      },
      workspaceGrants: { resolveAuthorizedWorkspace: vi.fn() },
      canvas: { resolveTurnContext: vi.fn() },
    });

    const prompt = await resolver.resolve('conversation-assistant');
    expect(prompt).not.toContain('Workspace reviewable Markdown admission');
    expect(prompt).not.toContain('reviewable-markdown');
  });

  it('resolves the selected exact Canvas and rejects a cross-Workspace target', async () => {
    const resolveTurnContext = vi.fn(async (_workspaceId: string, target: unknown) => ({
      target: target as ReturnType<typeof createCanvasWorkspaceTarget>,
      summary: {
        canvasId: 'neko/boards/story.nkc',
        name: 'story.nkc',
        nodeTypeSummary: { text: 2 },
      },
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
    const target = createCanvasWorkspaceTarget('workspace-1', 'neko/boards/story.nkc');

    await expect(resolver.resolve('conversation-1', [], [], target)).resolves.toContain(
      'story.nkc',
    );
    expect(resolveTurnContext).toHaveBeenCalledWith('workspace-1', target);

    await expect(
      resolver.resolve(
        'conversation-1',
        [],
        [],
        createCanvasWorkspaceTarget('workspace-2', 'neko/boards/other.nkc'),
      ),
    ).rejects.toThrow(/does not match Conversation Workspace/u);
    expect(resolveTurnContext).toHaveBeenCalledTimes(1);
  });

  it('resolves an exact Character Run only with its matching frozen turn context', async () => {
    const resolver = createDshConversationTurnContextResolver({
      contexts: {
        readContext: vi.fn(async () => ({
          kind: 'character' as const,
          characterId: 'character-1',
          characterVersionId: 'version-1',
          characterRunId: 'character-run-1',
        })),
      },
      workspaceGrants: { resolveAuthorizedWorkspace: vi.fn() },
      canvas: { resolveTurnContext: vi.fn() },
    });

    await expect(
      resolver.resolve('conversation-character', [
        {
          type: 'character',
          id: 'character-run-1',
          label: 'Neko',
          summary: 'Frozen Character context.',
          data: { text: '{}' },
        },
      ]),
    ).resolves.toContain('CharacterRun "character-run-1"');
    await expect(resolver.resolve('conversation-character')).rejects.toThrow(
      /exactly one frozen Character context/u,
    );
  });

  it('resolves an exact Room participant without falling back to another Character', async () => {
    const resolver = createDshConversationTurnContextResolver({
      contexts: {
        readContext: vi.fn(async () => ({
          kind: 'room' as const,
          scope: 'participant' as const,
          roomId: 'room-1',
          roomRunId: 'room-run-1',
          participantId: 'participant-1',
          characterRunId: 'character-run-1',
        })),
      },
      workspaceGrants: { resolveAuthorizedWorkspace: vi.fn() },
      canvas: { resolveTurnContext: vi.fn() },
    });

    await expect(
      resolver.resolve('conversation-room-participant', [
        {
          type: 'character',
          id: 'character-run-2',
          label: 'Wrong participant',
          summary: 'Wrong frozen context.',
          data: { text: '{}' },
        },
      ]),
    ).rejects.toThrow(/CharacterRun 'character-run-1'/u);
  });
});
