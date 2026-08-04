import { describe, expect, it } from 'vitest';
import { parseAgentDraftSubmitInput, parseAgentDraftSubmitProjection } from '../agent-draft-submit';

describe('Agent draft submit contract', () => {
  it('accepts deterministic Assistant entry targeting for the exact unbound draft', () => {
    expect(
      parseAgentDraftSubmitInput({
        schemaVersion: 1,
        target: { kind: 'automatic-assistant', draftId: 'draft-entry-1' },
        messageText: 'Help me shape this idea',
        resourceGrantIds: [],
        configuration: { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' },
      }),
    ).toMatchObject({ target: { kind: 'automatic-assistant', draftId: 'draft-entry-1' } });
  });

  it('keeps an explicitly bound owner context exact', () => {
    expect(
      parseAgentDraftSubmitInput({
        schemaVersion: 1,
        target: {
          kind: 'bound-context',
          context: {
            schemaVersion: 1,
            kind: 'workspace',
            workspaceId: 'workspace-1',
            workspaceGrantId: 'workspace-grant-1',
          },
        },
        messageText: 'Edit this project',
        resourceGrantIds: [],
        configuration: { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' },
      }),
    ).toMatchObject({
      target: { kind: 'bound-context', context: { kind: 'workspace', workspaceId: 'workspace-1' } },
    });
  });

  it('rejects the superseded caller-supplied context field', () => {
    expect(() =>
      parseAgentDraftSubmitInput({
        schemaVersion: 1,
        context: {
          schemaVersion: 1,
          kind: 'assistant',
          assistantSpaceId: 'assistant:default',
          baseGrantIds: [],
        },
        messageText: 'Do not use the old path',
        resourceGrantIds: [],
        configuration: { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' },
      }),
    ).toThrow('unsupported fields');
  });

  it('projects a completed initial provider turn as a terminal launch state', () => {
    expect(
      parseAgentDraftSubmitProjection({
        schemaVersion: 1,
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        turnStatus: 'completed',
      }),
    ).toEqual({
      schemaVersion: 1,
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      turnStatus: 'completed',
    });
  });
});
