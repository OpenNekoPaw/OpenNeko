import { describe, expect, it } from 'vitest';
import { parseAgentDraftSubmitInput, parseAgentDraftSubmitProjection } from '../agent-draft-submit';

const configuration = {
  modelCatalogEntryId: 'openai:gpt-5',
  providerId: 'openai',
  modelId: 'gpt-5',
  executionMode: 'ask' as const,
};

describe('Agent Draft submit contract', () => {
  it('accepts an ordinary message for the exact unbound Draft', () => {
    expect(
      parseAgentDraftSubmitInput({
        draft: {
          phase: 'draft',
          draftId: 'draft-entry-1',
          binding: { kind: 'unbound' },
          bindingReceipt: null,
        },
        input: { kind: 'message', text: 'Help me shape this idea' },
        references: [],
        resourceGrantIds: [],
        configuration,
      }),
    ).toMatchObject({
      draft: { draftId: 'draft-entry-1', binding: { kind: 'unbound' } },
      input: { kind: 'message' },
    });
  });

  it('keeps an explicitly bound owner and receipt exact', () => {
    const binding = {
      kind: 'workspace' as const,
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
    };
    expect(
      parseAgentDraftSubmitInput({
        draft: {
          phase: 'draft',
          draftId: 'draft-workspace-1',
          binding,
          bindingReceipt: {
            bindingReceiptId: 'binding-1',
            draftId: 'draft-workspace-1',
            connectionId: 'connection-1',
            binding,
          },
        },
        input: {
          kind: 'skill',
          catalogEntryId: 'skill:project:storyboard',
          skillName: 'storyboard',
          activationId: 'activation:storyboard',
          args: 'Create three shots',
        },
        references: [
          {
            catalogEntryId: 'mention:workspace-1:brief',
            referenceId: 'workspace-file:brief',
            ownerKind: 'workspace',
            ownerId: 'workspace-1',
            bindingReceiptId: 'binding-1',
          },
        ],
        resourceGrantIds: [],
        configuration,
      }),
    ).toMatchObject({
      draft: { bindingReceipt: { bindingReceiptId: 'binding-1' } },
      input: { kind: 'skill', skillName: 'storyboard' },
    });
  });

  it('rejects a bound Draft without its exact binding receipt', () => {
    expect(() =>
      parseAgentDraftSubmitInput({
        draft: {
          phase: 'draft',
          draftId: 'draft-workspace-1',
          binding: {
            kind: 'workspace',
            workspaceId: 'workspace-1',
            workspaceGrantId: 'workspace-grant-1',
          },
          bindingReceipt: null,
        },
        input: { kind: 'message', text: 'Edit this project' },
        references: [],
        resourceGrantIds: [],
        configuration,
      }),
    ).toThrow('requires an exact binding receipt');
  });

  it('rejects the superseded messageText and target fields', () => {
    expect(() =>
      parseAgentDraftSubmitInput({
        target: { kind: 'automatic-assistant', draftId: 'draft-entry-1' },
        messageText: 'Use the old route',
        resourceGrantIds: [],
        configuration,
      }),
    ).toThrow("unsupported field 'target'");
  });

  it('projects the exact committed Session and immutable Turn identity', () => {
    expect(
      parseAgentDraftSubmitProjection({
        session: {
          phase: 'session',
          conversationId: 'conversation-1',
          binding: {
            kind: 'assistant',
            assistantSpaceId: 'assistant:default',
            baseGrantIds: [],
          },
        },
        turnId: 'turn-1',
        turnStatus: 'completed',
      }),
    ).toEqual({
      session: {
        phase: 'session',
        conversationId: 'conversation-1',
        binding: {
          kind: 'assistant',
          assistantSpaceId: 'assistant:default',
          baseGrantIds: [],
        },
      },
      turnId: 'turn-1',
      turnStatus: 'completed',
    });
  });
});
