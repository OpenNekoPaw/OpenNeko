import { describe, expect, it } from 'vitest';
import {
  AGENT_HOME_PROJECTION_VERSION,
  AgentHomeContractError,
  isSameAgentConversationOwner,
  parseAgentHomeProjection,
} from '../agent-home';

describe('Agent Home contract', () => {
  it('parses every closed Conversation owner without synthetic Project identity', () => {
    const projection = parseAgentHomeProjection({
      schemaVersion: AGENT_HOME_PROJECTION_VERSION,
      revision: 4,
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
      schemaVersion: AGENT_HOME_PROJECTION_VERSION,
      revision: 1,
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
        schemaVersion: AGENT_HOME_PROJECTION_VERSION,
        revision: 1,
        conversations: [summary('unknown-1', { kind: 'project', projectId: 'project:1' })],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
    ).toThrowError(AgentHomeContractError);
    expect(() =>
      parseAgentHomeProjection({
        schemaVersion: AGENT_HOME_PROJECTION_VERSION,
        revision: 1,
        conversations: [summary('character-1', { kind: 'character', characterId: 'character:1' })],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
    ).toThrowError(AgentHomeContractError);
    expect(() =>
      parseAgentHomeProjection({
        schemaVersion: AGENT_HOME_PROJECTION_VERSION,
        revision: 1,
        conversations: [
          summary('duplicate', { kind: 'workspace', workspaceId: 'workspace:1' }),
          summary('duplicate', { kind: 'workspace', workspaceId: 'workspace:1' }),
        ],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
    ).toThrowError(AgentHomeContractError);
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
