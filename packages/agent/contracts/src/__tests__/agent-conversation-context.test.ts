import { describe, expect, it } from 'vitest';
import {
  parseAgentConversationContext,
  parseAgentResourceGrant,
  parseAgentScratchArtifactRef,
} from '../agent-conversation-context';

describe('Agent Conversation context contracts', () => {
  it('parses exact Assistant and Workspace identities without physical paths', () => {
    const assistant = parseAgentConversationContext({
      kind: 'assistant',
      assistantSpaceId: 'assistant-space:default',
      baseGrantIds: ['resource-grant:1'],
    });
    const workspace = parseAgentConversationContext({
      kind: 'workspace',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant:1',
    });
    expect(assistant.kind).toBe('assistant');
    expect(workspace.kind).toBe('workspace');
    expect(JSON.stringify([assistant, workspace])).not.toContain('/Users/fixture');
  });

  it('rejects raw paths and duplicate grants', () => {
    expect(() =>
      parseAgentResourceGrant({
        resourceGrantId: 'resource-grant:1',
        assistantSpaceId: 'assistant-space:default',
        kind: 'file',
        label: 'notes.txt',
        path: '/Users/fixture/notes.txt',
      }),
    ).toThrow(/unknown field 'path'/);
    expect(() =>
      parseAgentConversationContext({
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:default',
        baseGrantIds: ['resource-grant:1', 'resource-grant:1'],
      }),
    ).toThrow(/must not contain duplicates/);
  });

  it('rejects Host paths in Scratch references', () => {
    expect(() =>
      parseAgentScratchArtifactRef({
        scratchArtifactId: 'scratch-1',
        assistantSpaceId: 'assistant-space:default',
        conversationId: 'conversation-1',
        label: 'draft.png',
        state: 'recoverable',
        hostPath: '/Users/fixture/scratch/draft.png',
      }),
    ).toThrow(/unknown field 'hostPath'/);
  });

  it('rejects removed version fields at the exact record boundary', () => {
    expect(() =>
      parseAgentConversationContext({
        schemaVersion: 1,
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:default',
        baseGrantIds: [],
      }),
    ).toThrow("unknown field 'schemaVersion'");
    expect(
      parseAgentConversationContext({
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:other',
        baseGrantIds: [],
      }),
    ).toMatchObject({ assistantSpaceId: 'assistant-space:other' });
  });
});
