import { describe, expect, it } from 'vitest';
import { parseAgentDraftSubmitInput, parseAgentDraftSubmitProjection } from '../agent-draft-submit';

describe('Agent draft submit contract', () => {
  it('accepts deterministic Assistant entry targeting for the exact unbound draft', () => {
    expect(
      parseAgentDraftSubmitInput({
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
        target: {
          kind: 'bound-context',
          draftId: 'draft-workspace-1',
          context: {
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
      target: {
        kind: 'bound-context',
        draftId: 'draft-workspace-1',
        context: { kind: 'workspace', workspaceId: 'workspace-1' },
      },
    });
  });

  it('rejects a bound target without the exact draft identity', () => {
    expect(() =>
      parseAgentDraftSubmitInput({
        target: {
          kind: 'bound-context',
          context: {
            kind: 'workspace',
            workspaceId: 'workspace-1',
            workspaceGrantId: 'workspace-grant-1',
          },
        },
        messageText: 'Edit this project',
        resourceGrantIds: [],
        configuration: { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' },
      }),
    ).toThrow('unsupported fields');
  });

  it('rejects the superseded caller-supplied context field', () => {
    expect(() =>
      parseAgentDraftSubmitInput({
        context: {
          kind: 'assistant',
          assistantSpaceId: 'assistant:default',
          baseGrantIds: [],
        },
        messageText: 'Use the canonical route',
        resourceGrantIds: [],
        configuration: { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' },
      }),
    ).toThrow('unsupported fields');
  });

  it('projects a completed initial provider turn as a terminal launch state', () => {
    expect(
      parseAgentDraftSubmitProjection({
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        turnStatus: 'completed',
      }),
    ).toEqual({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      turnStatus: 'completed',
    });
  });
});
