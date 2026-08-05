import { describe, expect, it } from 'vitest';
import {
  AgentHomeContractError,
  isSameAgentConversationOwner,
  parseAgentHomeProjection,
} from '../agent-home';

describe('Agent Home contract', () => {
  it('parses every closed Conversation owner without synthetic Project identity', () => {
    const projection = parseAgentHomeProjection({
      conversations: [
        summary('assistant-1', { kind: 'assistant', assistantSpaceId: 'assistant-space:1' }),
        summary('workspace-1', { kind: 'workspace', workspaceId: 'workspace:1' }),
        summary('character-1', {
          kind: 'character',
          characterId: 'character:1',
          characterRunId: 'character-run:1',
        }),
        summary('room-1', { kind: 'room', roomId: 'room:1', roomRunId: 'room-run:1' }),
      ],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    });

    expect(projection.conversations.map((entry) => entry.navigation.owner.kind)).toEqual([
      'assistant',
      'workspace',
      'character',
      'room',
    ]);
    expect(JSON.stringify(projection)).not.toContain('projectId');
  });

  it('keeps optional Project grouping separate from the owner', () => {
    const projection = parseAgentHomeProjection({
      conversations: [
        {
          ...summary('assistant-1', {
            kind: 'assistant',
            assistantSpaceId: 'assistant-space:1',
          }),
          groupedProjectId: 'project:1',
        },
      ],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    });

    expect(projection.conversations[0]).toMatchObject({
      groupedProjectId: 'project:1',
      navigation: { owner: { kind: 'assistant', assistantSpaceId: 'assistant-space:1' } },
    });
  });

  it('rejects unknown and incomplete owners plus duplicate conversations', () => {
    expect(() =>
      parseAgentHomeProjection({
        conversations: [summary('unknown-1', { kind: 'project', projectId: 'project:1' })],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
    ).toThrowError(AgentHomeContractError);
    expect(() =>
      parseAgentHomeProjection({
        conversations: [summary('character-1', { kind: 'character', characterId: 'character:1' })],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
    ).toThrowError(AgentHomeContractError);
    expect(() =>
      parseAgentHomeProjection({
        conversations: [
          summary('duplicate', { kind: 'workspace', workspaceId: 'workspace:1' }),
          summary('duplicate', { kind: 'workspace', workspaceId: 'workspace:1' }),
        ],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
    ).toThrowError(AgentHomeContractError);
  });

  it('rejects removed version fields without disabling a valid sibling projection', () => {
    const removedSchemaField = ['schema', 'Ver', 'sion'].join('');
    const removedRevisionField = ['revi', 'sion'].join('');
    expect(() =>
      parseAgentHomeProjection({
        [removedSchemaField]: 1,
        conversations: [],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
    ).toThrow(`unknown field '${removedSchemaField}'`);
    expect(() =>
      parseAgentHomeProjection({
        [removedRevisionField]: 2,
        conversations: [],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
    ).toThrow(`unknown field '${removedRevisionField}'`);
    expect(
      parseAgentHomeProjection({
        conversations: [],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }).conversations,
    ).toEqual([]);
  });

  it('preserves entry-local catalog diagnostics beside valid conversations', () => {
    const projection = parseAgentHomeProjection({
      conversations: [summary('valid', { kind: 'workspace', workspaceId: 'workspace:1' })],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
      diagnostics: [
        {
          code: 'invalid-conversation-record',
          workspaceId: 'workspace:1',
          conversationId: 'invalid',
          message: 'Conversation context contains an unsupported field.',
        },
      ],
    });

    expect(projection.conversations).toHaveLength(1);
    expect(projection.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-conversation-record',
        conversationId: 'invalid',
      }),
    ]);
  });

  it('compares exact owner identity', () => {
    expect(
      isSameAgentConversationOwner(
        { kind: 'room', roomId: 'room:1', roomRunId: 'run:1' },
        { kind: 'room', roomId: 'room:1', roomRunId: 'run:1' },
      ),
    ).toBe(true);
    expect(
      isSameAgentConversationOwner(
        { kind: 'room', roomId: 'room:1', roomRunId: 'run:1' },
        { kind: 'room', roomId: 'room:1', roomRunId: 'run:2' },
      ),
    ).toBe(false);
  });
});

function summary(conversationId: string, owner: unknown) {
  return {
    navigation: { conversationId, owner },
    title: conversationId,
    updatedAt: '2026-08-04T00:00:00.000Z',
    attention: 'none',
    lastActivity: {
      kind: 'conversation-updated',
      occurredAt: '2026-08-04T00:00:00.000Z',
    },
  };
}
