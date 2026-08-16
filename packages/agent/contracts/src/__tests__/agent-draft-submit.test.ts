import { describe, expect, it } from 'vitest';
import {
  parseAgentCanvasTurnIntent,
  parseAgentDraftSubmitInput,
  parseAgentDraftSubmitProjection,
} from '../agent-draft-submit';

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
        entryTargetReceipt: null,
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

  it('keeps an exact Canvas turn intent outside the domain binding and references', () => {
    const canvasTurnTarget = {
      workspaceId: 'workspace-1',
      target: { kind: 'exact-canvas', workspaceId: 'workspace-1', canvasId: 'canvas-1' },
      summary: { canvasId: 'canvas-1', name: 'Canvas 1' },
    };
    expect(parseAgentCanvasTurnIntent(canvasTurnTarget)).toEqual(canvasTurnTarget);
    expect(
      parseAgentDraftSubmitInput({
        draft: {
          phase: 'draft',
          draftId: 'draft-workspace-1',
          binding: {
            kind: 'workspace',
            workspaceId: 'workspace-1',
            workspaceGrantId: 'workspace-grant-1',
          },
          bindingReceipt: {
            bindingReceiptId: 'binding-1',
            draftId: 'draft-workspace-1',
            connectionId: 'connection-1',
            binding: {
              kind: 'workspace',
              workspaceId: 'workspace-1',
              workspaceGrantId: 'workspace-grant-1',
            },
          },
        },
        entryTargetReceipt: null,
        input: { kind: 'message', text: 'Update canvas-1' },
        references: [],
        resourceGrantIds: [],
        configuration,
        canvasTurnTarget,
      }).canvasTurnTarget,
    ).toEqual(canvasTurnTarget);
  });

  it('rejects a Canvas turn intent whose workspace does not match its target', () => {
    expect(() =>
      parseAgentCanvasTurnIntent({
        workspaceId: 'workspace-2',
        target: { kind: 'exact-canvas', workspaceId: 'workspace-1', canvasId: 'canvas-1' },
        summary: { canvasId: 'canvas-1', name: 'Canvas 1' },
      }),
    ).toThrow('does not match its target');
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
        entryTargetReceipt: null,
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

  it('keeps exact generation purpose models on the first submitted Turn', () => {
    expect(
      parseAgentDraftSubmitInput({
        draft: {
          phase: 'draft',
          draftId: 'draft-entry-1',
          binding: { kind: 'unbound' },
          bindingReceipt: null,
        },
        entryTargetReceipt: null,
        input: { kind: 'message', text: 'Generate an image' },
        references: [],
        resourceGrantIds: [],
        configuration,
        purposeModels: {
          'image.generate': {
            providerId: 'image-provider',
            modelId: 'image-model',
            category: 'image',
          },
        },
      }),
    ).toMatchObject({
      purposeModels: {
        'image.generate': {
          providerId: 'image-provider',
          modelId: 'image-model',
          category: 'image',
        },
      },
    });
  });

  it('rejects a generation purpose model with the wrong media category', () => {
    expect(() =>
      parseAgentDraftSubmitInput({
        draft: {
          phase: 'draft',
          draftId: 'draft-entry-1',
          binding: { kind: 'unbound' },
          bindingReceipt: null,
        },
        entryTargetReceipt: null,
        input: { kind: 'message', text: 'Generate an image' },
        references: [],
        resourceGrantIds: [],
        configuration,
        purposeModels: {
          'image.generate': {
            providerId: 'image-provider',
            modelId: 'image-model',
            category: 'video',
          },
        },
      }),
    ).toThrow("category must be 'image'");
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
        entryTargetReceipt: null,
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
