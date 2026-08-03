import { describe, expect, it } from 'vitest';
import {
  AGENT_CONVERSATION_CONTEXT_VERSION,
  migrateAgentConversationContext,
  parseAgentConversationContext,
  parseAgentResourceGrant,
  parseAgentScratchArtifactRef,
} from '../agent-conversation-context';

describe('Agent Conversation context contracts', () => {
  it('parses exact Assistant and Workspace identities without physical paths', () => {
    const assistant = parseAgentConversationContext({
      schemaVersion: AGENT_CONVERSATION_CONTEXT_VERSION,
      kind: 'assistant',
      assistantSpaceId: 'assistant-space:default',
      baseGrantIds: ['resource-grant:1'],
    });
    const workspace = parseAgentConversationContext({
      schemaVersion: AGENT_CONVERSATION_CONTEXT_VERSION,
      kind: 'workspace',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant:1',
    });
    expect(assistant.kind).toBe('assistant');
    expect(workspace.kind).toBe('workspace');
    expect(JSON.stringify([assistant, workspace])).not.toContain('/Users/fixture');
  });

  it('rejects raw paths, duplicate grants and unresolved legacy records', () => {
    expect(() =>
      parseAgentResourceGrant({
        schemaVersion: 1,
        resourceGrantId: 'resource-grant:1',
        assistantSpaceId: 'assistant-space:default',
        kind: 'file',
        label: 'notes.txt',
        path: '/Users/fixture/notes.txt',
      }),
    ).toThrow(/unknown field 'path'/);
    expect(() =>
      parseAgentConversationContext({
        schemaVersion: 1,
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:default',
        baseGrantIds: ['resource-grant:1', 'resource-grant:1'],
      }),
    ).toThrow(/must not contain duplicates/);
    expect(() => migrateAgentConversationContext({})).toThrowError(
      expect.objectContaining({ code: 'unresolved-agent-conversation-context-migration' }),
    );
  });

  it('migrates only from an exact stored Workspace identity', () => {
    expect(
      migrateAgentConversationContext({
        exactWorkspaceIdentity: {
          workspaceId: 'workspace-1',
          workspaceGrantId: 'workspace-grant:1',
        },
      }),
    ).toEqual({
      schemaVersion: 1,
      kind: 'workspace',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant:1',
    });
    expect(() =>
      parseAgentScratchArtifactRef({
        schemaVersion: 1,
        scratchArtifactId: 'scratch-1',
        assistantSpaceId: 'assistant-space:default',
        conversationId: 'conversation-1',
        label: 'draft.png',
        state: 'recoverable',
        hostPath: '/Users/fixture/scratch/draft.png',
      }),
    ).toThrow(/unknown field 'hostPath'/);
  });
});
