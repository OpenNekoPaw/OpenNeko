import { describe, expect, it } from 'vitest';
import { parseAgentLaunchCatalogProjection } from '../agent-launch';

describe('Agent launch contract', () => {
  it('parses one exact Draft, model and input catalog projection', () => {
    const binding = {
      kind: 'workspace' as const,
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
    };
    const projection = parseAgentLaunchCatalogProjection({
      connection: {
        applicationInstanceId: 'application-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'agent-surface-1',
        viewId: 'agent-view-1',
        draftId: 'draft-1',
        connectionId: 'launch-connection-1',
      },
      interaction: {
        phase: 'draft',
        draftId: 'draft-1',
        binding,
        bindingReceipt: {
          bindingReceiptId: 'binding-1',
          draftId: 'draft-1',
          connectionId: 'launch-connection-1',
          binding,
        },
      },
      models: [
        {
          id: 'openai:gpt-5',
          label: 'GPT-5',
          providerId: 'openai',
          modelId: 'gpt-5',
          modelType: 'llm',
          contextWindow: 128_000,
          maximumOutputTokens: 16_384,
          purposeCapabilities: ['agent.main'],
          availability: { status: 'available' },
        },
      ],
      configuration: configuration({
        modelCatalogEntryId: 'openai:gpt-5',
        providerId: 'openai',
        modelId: 'gpt-5',
        executionMode: 'ask',
        temperature: 0.7,
        maximumOutputTokens: 4096,
        thinkingBudget: 0,
      }),
      inputs: [
        {
          id: 'skill:project:storyboard',
          name: 'storyboard',
          description: 'Create a storyboard.',
          trigger: 'skill',
          prefix: '$',
          phaseRequirement: 'any',
          bindingRequirement: 'workspace',
          source: { kind: 'project', workspaceId: 'workspace-1', sourceId: 'storyboard' },
          availability: { status: 'available' },
          executable: {
            kind: 'skill',
            skillName: 'storyboard',
            activationId: 'skill:workspace-1:storyboard',
          },
        },
      ],
    });

    expect(projection.interaction.binding).toEqual(binding);
    expect(projection.inputs[0]?.source).toMatchObject({ kind: 'project' });
  });

  it('rejects cross-Draft and cross-connection binding receipts', () => {
    const base = {
      connection: {
        applicationInstanceId: 'application-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'agent-surface-1',
        viewId: 'agent-view-1',
        draftId: 'draft-1',
        connectionId: 'launch-connection-1',
      },
      interaction: {
        phase: 'draft',
        draftId: 'draft-1',
        binding: {
          kind: 'assistant',
          assistantSpaceId: 'assistant:1',
          baseGrantIds: [],
        },
        bindingReceipt: {
          bindingReceiptId: 'binding-1',
          draftId: 'draft-1',
          connectionId: 'launch-connection-other',
          binding: {
            kind: 'assistant',
            assistantSpaceId: 'assistant:1',
            baseGrantIds: [],
          },
        },
      },
      models: [],
      configuration: configuration(null),
      inputs: [],
    };
    expect(() => parseAgentLaunchCatalogProjection(base)).toThrow('another connection');
    expect(() =>
      parseAgentLaunchCatalogProjection({
        ...base,
        interaction: { ...base.interaction, draftId: 'draft-other' },
      }),
    ).toThrow('another Draft');
  });

  it('rejects paths, secrets and stale launch catalog shapes', () => {
    const base = {
      connection: {
        applicationInstanceId: 'application-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'agent-surface-1',
        viewId: 'agent-view-1',
        draftId: 'draft-1',
        connectionId: 'launch-connection-1',
      },
      interaction: {
        phase: 'draft',
        draftId: 'draft-1',
        binding: { kind: 'unbound' },
        bindingReceipt: null,
      },
      models: [],
      configuration: configuration(null),
      inputs: [],
    };
    expect(() =>
      parseAgentLaunchCatalogProjection({ ...base, absolutePath: '/Users/private' }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseAgentLaunchCatalogProjection({ ...base, commands: [], skills: [], resources: [] }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseAgentLaunchCatalogProjection({
        ...base,
        connection: { ...base.connection, scope: { kind: 'unbound', draftId: 'draft-1' } },
      }),
    ).toThrow('unsupported fields');
  });
});

function configuration(
  request: {
    readonly modelCatalogEntryId: string;
    readonly providerId: string;
    readonly modelId: string;
    readonly executionMode: 'ask';
    readonly temperature: number;
    readonly maximumOutputTokens: number;
    readonly thinkingBudget: number;
  } | null,
) {
  const editable = { status: 'editable' as const, owner: 'agent-config' };
  return {
    request,
    fields: {
      model: {
        effectiveValue:
          request === null
            ? null
            : {
                modelCatalogEntryId: request.modelCatalogEntryId,
                providerId: request.providerId,
                modelId: request.modelId,
              },
        source: 'global-default' as const,
        policy:
          request === null
            ? {
                status: 'unavailable' as const,
                owner: 'agent-config',
                reason: 'Choose a model.',
              }
            : editable,
      },
      executionMode: {
        effectiveValue: request?.executionMode ?? 'ask',
        source: 'global-default' as const,
        policy: editable,
      },
      temperature: {
        effectiveValue: request?.temperature ?? 0.7,
        source: 'global-default' as const,
        policy: editable,
      },
      maximumOutputTokens: {
        effectiveValue: request?.maximumOutputTokens ?? 4096,
        source: 'global-default' as const,
        policy: editable,
      },
      thinkingBudget: {
        effectiveValue: request?.thinkingBudget ?? 0,
        source: 'global-default' as const,
        policy: editable,
      },
    },
  };
}
