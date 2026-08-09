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

  it('parses exact Character and Room owner-qualified contexts', () => {
    expect(
      parseAgentConversationContext({
        kind: 'character',
        characterId: 'character:neko',
        characterRunId: 'character-run:neko:1',
        dialogueRunId: 'dialogue-run:neko:1',
        workspaceId: 'assistant-space:default',
      }),
    ).toEqual({
      kind: 'character',
      characterId: 'character:neko',
      characterRunId: 'character-run:neko:1',
      dialogueRunId: 'dialogue-run:neko:1',
      workspaceId: 'assistant-space:default',
    });
    expect(
      parseAgentConversationContext({
        kind: 'room',
        roomId: 'room:studio',
        roomRunId: 'room-run:studio:1',
        workspaceId: 'assistant-space:default',
      }),
    ).toEqual({
      kind: 'room',
      roomId: 'room:studio',
      roomRunId: 'room-run:studio:1',
      workspaceId: 'assistant-space:default',
    });
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

  it('rejects unknown fields at the exact record boundary', () => {
    expect(() =>
      parseAgentConversationContext({
        unexpectedField: true,
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:default',
        baseGrantIds: [],
      }),
    ).toThrow("unknown field 'unexpectedField'");
    expect(
      parseAgentConversationContext({
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:other',
        baseGrantIds: [],
      }),
    ).toMatchObject({ assistantSpaceId: 'assistant-space:other' });
  });
});
