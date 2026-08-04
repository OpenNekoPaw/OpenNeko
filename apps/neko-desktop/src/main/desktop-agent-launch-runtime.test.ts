import { describe, expect, it, vi } from 'vitest';
import { createDesktopAgentLaunchRuntime } from './desktop-agent-launch-runtime';

describe('Desktop Agent launch native adapter', () => {
  it('keeps selected paths Main-private and releases grants with the connection', async () => {
    const selectResource = vi.fn(async () => ({
      label: 'reference.png',
      hostResource: '/Users/private/reference.png',
    }));
    let identity = 0;
    const runtime = createDesktopAgentLaunchRuntime({
      agent: {
        readGlobalSkillCatalog: async () => ({ records: [], diagnostics: [], warnings: [] }),
      },
      config: { getAssistantConfigState: () => createConfigState() },
      selectResource,
      readTextResource: vi.fn(async () => 'reference contents'),
      createIdentity: () => `identity-${++identity}`,
    });
    const catalog = await runtime.attach({
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      viewId: 'agent-view:window-1',
      rendererEpoch: 1,
      scope: { kind: 'assistant', assistantSpaceId: 'assistant:1' },
    });
    const authorized = await runtime.authorizeResource(catalog.connection, 'file');

    expect(selectResource).toHaveBeenCalledWith({ windowId: 'window-1', resourceKind: 'file' });
    expect(authorized?.resources).toEqual([
      expect.objectContaining({
        label: 'reference.png',
        resourceGrantId: 'identity-2',
        resourceKind: 'file',
      }),
    ]);
    expect(JSON.stringify(authorized)).not.toContain('/Users/private');
    await runtime.commitResourceGrants(catalog.connection, 'conversation:1', ['identity-2']);
    await expect(
      runtime.resolveResourceContexts(
        {
          schemaVersion: 1,
          kind: 'assistant',
          assistantSpaceId: 'assistant:1',
          baseGrantIds: ['identity-2'],
        },
        ['identity-2'],
      ),
    ).resolves.toEqual([
      {
        type: 'file',
        id: 'identity-2',
        label: 'reference.png',
        summary: 'Authorized file: reference.png',
        data: { text: 'reference contents' },
      },
    ]);
    await runtime.detach(catalog.connection);
    expect(() => runtime.readCatalog(catalog.connection)).toThrow('Stale Agent launch connection');
  });

  it('atomically binds exact unbound draft grants to Assistant scope', async () => {
    let identity = 0;
    const runtime = createDesktopAgentLaunchRuntime({
      agent: {
        readGlobalSkillCatalog: async () => ({ records: [], diagnostics: [], warnings: [] }),
      },
      config: { getAssistantConfigState: () => createConfigState() },
      selectResource: async () => ({
        label: 'brief.txt',
        hostResource: '/Users/private/brief.txt',
      }),
      readTextResource: async () => 'Assistant brief',
      createIdentity: () => `identity-${++identity}`,
    });
    const catalog = await runtime.attach({
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      viewId: 'agent-view:window-1',
      rendererEpoch: 1,
      scope: { kind: 'unbound', draftId: 'draft:1' },
    });
    await runtime.authorizeResource(catalog.connection, 'file');
    const assistantContext = {
      schemaVersion: 1 as const,
      kind: 'assistant' as const,
      assistantSpaceId: 'assistant:1',
      baseGrantIds: ['identity-2'],
    };

    await expect(
      runtime.validateResourceGrants(assistantContext, ['identity-2']),
    ).rejects.toThrow("Agent Resource grant 'identity-2' belongs to another scope.");
    await expect(
      runtime.bindAssistantResourceGrants(catalog.connection, 'assistant:1', [
        'identity-2',
        'missing-grant',
      ]),
    ).rejects.toThrow("Agent Resource grant 'missing-grant' does not belong to its launch connection.");
    await expect(
      runtime.validateResourceGrants(assistantContext, ['identity-2']),
    ).rejects.toThrow("Agent Resource grant 'identity-2' belongs to another scope.");

    const otherCatalog = await runtime.attach({
      applicationInstanceId: 'app-1',
      windowId: 'window-2',
      viewId: 'agent-view:window-2',
      rendererEpoch: 1,
      scope: { kind: 'unbound', draftId: 'draft:2' },
    });
    await runtime.authorizeResource(otherCatalog.connection, 'file');
    await expect(
      runtime.bindAssistantResourceGrants(catalog.connection, 'assistant:1', ['identity-4']),
    ).rejects.toThrow("Agent Resource grant 'identity-4' does not belong to its launch connection.");

    await runtime.bindAssistantResourceGrants(catalog.connection, 'assistant:1', ['identity-2']);
    await runtime.bindAssistantResourceGrants(catalog.connection, 'assistant:1', ['identity-2']);
    await expect(
      runtime.resolveResourceContexts(assistantContext, ['identity-2']),
    ).resolves.toEqual([
      {
        type: 'file',
        id: 'identity-2',
        label: 'brief.txt',
        summary: 'Authorized file: brief.txt',
        data: { text: 'Assistant brief' },
      },
    ]);
  });
});

function createConfigState() {
  return {
    providers: [],
    configuredProviders: [],
    selectedProviderId: 'openai',
    selectedModelId: 'gpt-5',
    customSystemPrompt: '',
    autoExecuteTools: false,
    streamResponses: true,
    showToolCalls: true,
    temperature: 0.7,
    maxTokens: 2048,
    executionMode: 'ask' as const,
    chatModelOptions: [
      {
        id: 'openai:gpt-5',
        label: 'GPT-5',
        providerId: 'openai',
        modelId: 'gpt-5',
        category: 'llm' as const,
      },
    ],
    modelGroups: [],
    defaultMediaModels: {},
  };
}
