import { describe, expect, it } from 'vitest';
import type { PiConversationCatalogReader } from '../pi/node-conversation-catalog-reader';
import { AgentConversationCharacterVersionReferenceReader } from './agent-conversation-character-version-reference-reader';

describe('Agent Conversation CharacterVersion reference reader', () => {
  it('returns only Conversations with the exact Character binding', async () => {
    const reader = new AgentConversationCharacterVersionReferenceReader(
      catalog([
        conversation('conversation-a', 'version-a'),
        conversation('conversation-b', 'version-b'),
        {
          ...conversation('conversation-workspace', 'version-a'),
          context: { kind: 'workspace', workspaceId: 'workspace-a', workspaceGrantId: 'grant-a' },
        },
      ]),
    );
    await expect(reader.readReferences(['version-a'])).resolves.toEqual([
      { conversationId: 'conversation-a', characterVersionId: 'version-a' },
    ]);
  });

  it('fails visibly when an invalid Conversation could hide a reference', async () => {
    const base = catalog([]);
    const reader = new AgentConversationCharacterVersionReferenceReader({
      ...base,
      listConversations: () => ({
        records: [],
        diagnostics: [{ code: 'invalid-conversation-record', message: 'Invalid context.' }],
      }),
    });
    await expect(reader.readReferences(['version-a'])).rejects.toThrow(
      'Agent Conversation reference inventory is incomplete',
    );
  });
});

function catalog(records: ReturnType<typeof conversation>[]): PiConversationCatalogReader {
  return {
    listConversations: () => ({ records, diagnostics: [] }),
    findConversation: (conversationId) =>
      records.find((record) => record.conversationId === conversationId),
    dispose: () => undefined,
  };
}

function conversation(conversationId: string, characterVersionId: string) {
  return {
    workspaceId: 'workspace-a',
    conversationId,
    title: conversationId,
    activeBranchId: 'branch-a',
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
    context: {
      kind: 'character' as const,
      characterId: 'character-a',
      characterVersionId,
      characterRunId: 'run-a',
      roleProfileId: 'role-a',
    },
  };
}
