import { describe, expect, it } from 'vitest';
import {
  projectRetiredConversationUnavailable,
  RETIRED_CONVERSATION_RUNTIME_UNAVAILABLE,
} from '../retired-conversation-unavailable';

describe('retired Conversation unavailable projection', () => {
  it('keeps bounded identity and disables execution without transcript content', () => {
    const projection = projectRetiredConversationUnavailable({
      conversationId: 'conversation:retired',
      owner: { kind: 'workspace', workspaceId: 'workspace:one' },
      title: 'Archived conversation',
      updatedAt: '2026-08-18T00:00:00.000Z',
    });

    expect(projection).toEqual({
      navigation: {
        conversationId: 'conversation:retired',
        owner: { kind: 'workspace', workspaceId: 'workspace:one' },
      },
      title: 'Archived conversation',
      updatedAt: '2026-08-18T00:00:00.000Z',
      attention: 'none',
      lastActivity: {
        kind: 'conversation-updated',
        occurredAt: '2026-08-18T00:00:00.000Z',
      },
      unavailable: {
        fieldNames: ['runtime'],
        message: `${RETIRED_CONVERSATION_RUNTIME_UNAVAILABLE}: retired transcript authority is unavailable.`,
      },
    });
    expect(JSON.stringify(projection)).not.toContain('Pi');
    expect(JSON.stringify(projection)).not.toContain('opaque fixture payload');
  });

  it('rejects malformed bounded metadata locally', () => {
    expect(() =>
      projectRetiredConversationUnavailable({
        conversationId: '',
        owner: { kind: 'workspace', workspaceId: 'workspace:one' },
        title: 'Archived conversation',
        updatedAt: '2026-08-18T00:00:00.000Z',
      }),
    ).toThrow('Agent Conversation identity is required.');
    expect(() =>
      projectRetiredConversationUnavailable({
        conversationId: 'conversation:retired',
        owner: { kind: 'workspace', workspaceId: 'workspace:one' },
        title: 'Archived conversation',
        updatedAt: 'not-a-date',
      }),
    ).toThrow('updatedAt must be an ISO timestamp');
    expect(() =>
      projectRetiredConversationUnavailable({
        conversationId: 'conversation:retired',
        owner: { kind: 'workspace', workspaceId: '' },
        title: 'Archived conversation',
        updatedAt: '2026-08-18T00:00:00.000Z',
      }),
    ).toThrow('Workspace identity is required.');
  });
});
