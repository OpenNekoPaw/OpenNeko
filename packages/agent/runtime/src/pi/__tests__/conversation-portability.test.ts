import { describe, expect, it } from 'vitest';
import {
  parsePortablePiConversationManifest,
  parsePortablePiConversationManifestJson,
  serializePortablePiConversationManifest,
} from '../conversation-portability';

describe('portable Pi Conversation manifest', () => {
  it('round-trips the one canonical shape without an internal version discriminator', () => {
    const manifest = parsePortablePiConversationManifest({
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      title: 'Portable conversation',
      activeBranchId: 'main',
      createdAt: '2026-08-06T10:00:00.000Z',
      updatedAt: '2026-08-06T10:01:00.000Z',
      branches: [
        {
          branchId: 'main',
          state: 'active',
          createdAt: '2026-08-06T10:00:00.000Z',
          updatedAt: '2026-08-06T10:01:00.000Z',
          entries: [
            {
              type: 'message',
              id: 'entry-1',
              parentId: null,
              timestamp: '2026-08-06T10:00:10.000Z',
              message: { role: 'user', content: 'hello', timestamp: 1_800_000_000_000 },
            },
          ],
        },
      ],
    });

    const json = serializePortablePiConversationManifest(manifest);
    expect(parsePortablePiConversationManifestJson(json)).toEqual(manifest);
    expect(JSON.parse(json)).not.toHaveProperty('version');
  });

  it('rejects invalid branch topology visibly', () => {
    const valid = {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      title: 'Portable conversation',
      activeBranchId: 'main',
      createdAt: '2026-08-06T10:00:00.000Z',
      updatedAt: '2026-08-06T10:01:00.000Z',
      branches: [
        {
          branchId: 'main',
          state: 'active',
          createdAt: '2026-08-06T10:00:00.000Z',
          updatedAt: '2026-08-06T10:01:00.000Z',
          entries: [],
        },
      ],
    };

    expect(() =>
      parsePortablePiConversationManifest({
        ...valid,
        activeBranchId: 'missing',
      }),
    ).toThrow('exactly one matching active branch');
  });
});
