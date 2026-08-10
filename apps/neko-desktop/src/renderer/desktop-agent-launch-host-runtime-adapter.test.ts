// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { AgentHostToWebviewMessage } from '@neko/agent-contracts';
import { projectAgentConfigurationPolicy } from '@neko/agent-runtime/application';
import { createElectronAgentLaunchHostRuntimeAdapter } from './desktop-agent-launch-host-runtime-adapter';
import type { DesktopAgentPresentationStorage } from './desktop-agent-host-runtime-adapter';

describe('Electron Agent launch Host runtime adapter', () => {
  it('projects secret-free launch catalogs and rejects Project search in Assistant scope', () => {
    const adapter = createElectronAgentLaunchHostRuntimeAdapter({
      bridge: createBridge(),
      catalog: createCatalog(),
      draftId: 'draft:entry',
    });
    const messages: AgentHostToWebviewMessage[] = [];
    adapter.subscribe((message) => messages.push(message));

    adapter.send({ type: 'refreshConfigSnapshot' });
    adapter.send({ type: 'searchProjectFiles', filter: 'secret', purpose: 'entry' });

    expect(messages[0]).toMatchObject({
      type: 'configState',
      config: {
        selectedProviderId: 'openai',
        selectedModelId: 'gpt-5',
        defaultMediaModels: { image: 'openai:gpt-image-1' },
        mediaUnderstandingModels: {
          image: expect.objectContaining({ optionId: 'openai:gpt-5' }),
        },
      },
    });
    expect(JSON.stringify(messages[0])).not.toContain('apiKey');
    expect(messages[1]).toEqual({
      type: 'globalError',
      message:
        "Agent route 'searchProjectFiles' requires an explicitly authorized Workspace scope.",
    });
  });

  it('projects exact Workspace mention results and ignores a late result after rebinding', async () => {
    const bridge = createBridge();
    const workspaceBinding = {
      kind: 'workspace' as const,
      workspaceId: 'workspace:1',
      workspaceGrantId: 'workspace-grant:1',
    };
    const workspaceCatalog = createCatalog({ binding: workspaceBinding });
    let resolveSearch:
      | ((value: import('@neko/agent-contracts').AgentDraftMentionSearchProjection) => void)
      | undefined;
    bridge.agentLaunch.searchWorkspaceMentions.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );
    bridge.agentLaunch.bindTarget.mockResolvedValueOnce(
      createCatalog({ bindingReceiptId: 'binding:assistant-replacement' }),
    );
    const adapter = createElectronAgentLaunchHostRuntimeAdapter({
      bridge,
      catalog: workspaceCatalog,
      draftId: 'draft:entry',
    });
    const messages: AgentHostToWebviewMessage[] = [];
    adapter.subscribe((message) => messages.push(message));

    adapter.send({ type: 'searchProjectFiles', filter: 'hero', purpose: 'entry' });
    expect(bridge.agentLaunch.searchWorkspaceMentions).toHaveBeenCalledWith(
      workspaceCatalog.connection,
      workspaceCatalog.interaction.bindingReceipt?.bindingReceiptId,
      'hero',
    );
    await adapter.bindTarget({ kind: 'unbound' });
    resolveSearch?.({
      bindingReceiptId: workspaceCatalog.interaction.bindingReceipt?.bindingReceiptId ?? '',
      filter: 'hero',
      files: [
        {
          locator: { kind: 'workspace-file', path: 'hero.md' },
          name: 'hero.md',
          type: 'file',
          referenceReceipt: {
            catalogEntryId: 'mention:hero',
            referenceId: 'workspace-reference:hero',
            ownerKind: 'workspace',
            ownerId: 'workspace:1',
            bindingReceiptId: workspaceCatalog.interaction.bindingReceipt?.bindingReceiptId ?? '',
          },
        },
      ],
      mentionExtras: [],
    });
    await Promise.resolve();

    expect(messages).toEqual([
      { type: 'projectFiles', filter: '', purpose: 'entry', files: [], mentionExtras: [] },
    ]);
  });

  it('emits exact Workspace mention results returned by the launch bridge', async () => {
    const bridge = createBridge();
    const catalog = createCatalog({
      binding: {
        kind: 'workspace',
        workspaceId: 'workspace:1',
        workspaceGrantId: 'workspace-grant:1',
      },
    });
    const bindingReceiptId = catalog.interaction.bindingReceipt?.bindingReceiptId;
    if (!bindingReceiptId) throw new Error('Expected a Workspace binding receipt.');
    bridge.agentLaunch.searchWorkspaceMentions.mockResolvedValueOnce({
      bindingReceiptId,
      filter: 'hero',
      files: [
        {
          locator: { kind: 'workspace-file', path: 'hero.md' },
          name: 'hero.md',
          type: 'file',
          referenceReceipt: {
            catalogEntryId: 'mention:hero',
            referenceId: 'workspace-reference:hero',
            ownerKind: 'workspace',
            ownerId: 'workspace:1',
            bindingReceiptId,
          },
        },
      ],
      mentionExtras: [],
    });
    const adapter = createElectronAgentLaunchHostRuntimeAdapter({
      bridge,
      catalog,
      draftId: 'draft:entry',
    });
    const messages: AgentHostToWebviewMessage[] = [];
    adapter.subscribe((message) => messages.push(message));

    adapter.send({ type: 'searchProjectFiles', filter: 'hero', purpose: 'entry' });
    await vi.waitFor(() => expect(messages).toHaveLength(1));

    expect(messages[0]).toEqual({
      type: 'projectFiles',
      filter: 'hero',
      purpose: 'entry',
      files: [
        {
          locator: { kind: 'workspace-file', path: 'hero.md' },
          name: 'hero.md',
          type: 'file',
          referenceReceipt: {
            catalogEntryId: 'mention:hero',
            referenceId: 'workspace-reference:hero',
            ownerKind: 'workspace',
            ownerId: 'workspace:1',
            bindingReceiptId,
          },
        },
      ],
      mentionExtras: [],
    });
  });

  it('fails visibly for session-only routes and detaches once', async () => {
    const bridge = createBridge();
    const adapter = createElectronAgentLaunchHostRuntimeAdapter({
      bridge,
      catalog: createCatalog(),
      draftId: 'draft:entry',
    });
    const messages: AgentHostToWebviewMessage[] = [];
    adapter.subscribe((message) => messages.push(message));

    adapter.send({ type: 'newConversation' });
    expect(messages).toEqual([
      {
        type: 'globalError',
        message: "Agent route 'newConversation' requires a committed conversation session.",
      },
    ]);
    await adapter.dispose();
    await adapter.dispose();
    expect(bridge.agentLaunch.detach).toHaveBeenCalledOnce();
  });

  it('rebinds the same adapter to the exact Host-returned Draft catalog', async () => {
    const bridge = createBridge();
    const workspaceBinding = {
      kind: 'workspace' as const,
      workspaceId: 'workspace:1',
      workspaceGrantId: 'workspace-grant:1',
    };
    const workspaceCatalog = createCatalog({ binding: workspaceBinding });
    bridge.agentLaunch.bindTarget.mockResolvedValueOnce(workspaceCatalog);
    const adapter = createElectronAgentLaunchHostRuntimeAdapter({
      bridge,
      catalog: createCatalog(),
      draftId: 'draft:entry',
    });

    await expect(adapter.bindTarget(workspaceBinding)).resolves.toEqual(workspaceCatalog);
    expect(bridge.agentLaunch.bindTarget).toHaveBeenCalledWith(
      createCatalog().connection,
      workspaceBinding,
    );
    expect(adapter.readLaunchCatalog()).toEqual(workspaceCatalog);
  });

  it('restores the one Window entry draft across scope and connection replacement', () => {
    const storage = createStorage();
    const first = createElectronAgentLaunchHostRuntimeAdapter({
      bridge: createBridge(),
      catalog: createCatalog(),
      draftId: 'draft:entry',
      storage,
    });
    const replacement = createElectronAgentLaunchHostRuntimeAdapter({
      bridge: createBridge(),
      catalog: createCatalog({ connectionId: 'launch-replacement' }),
      draftId: 'draft:entry',
      storage,
    });
    const workspaceReplacement = createElectronAgentLaunchHostRuntimeAdapter({
      bridge: createBridge(),
      catalog: createCatalog({
        connectionId: 'launch-workspace-replacement',
        binding: {
          kind: 'workspace',
          workspaceId: 'workspace:1',
          workspaceGrantId: 'workspace-grant:1',
        },
      }),
      draftId: 'draft:entry',
      storage,
    });

    first.setState({ drafts: [{ tabId: 'tab-1' }] });

    expect(replacement.getState()).toEqual({ drafts: [{ tabId: 'tab-1' }] });
    expect(workspaceReplacement.getState()).toEqual({ drafts: [{ tabId: 'tab-1' }] });
    expect([...storage.values.keys()]).toEqual([
      'openneko:agent:presentation:window:window-1:draft:draft:entry:agent-view:window-1',
    ]);
  });

  it('authorizes a file into an opaque context payload without projecting its Host path', async () => {
    const bridge = createBridge();
    bridge.agentLaunch.authorizeResource.mockResolvedValueOnce({
      ...createCatalog(),
      inputs: [
        ...createCatalog().inputs,
        {
          id: 'mention:resource:grant-1',
          name: 'notes.txt',
          description: 'Authorized file: notes.txt',
          trigger: 'mention',
          prefix: '@',
          phaseRequirement: 'draft',
          bindingRequirement: 'assistant',
          source: { kind: 'personal', ownerId: 'assistant:1', sourceId: 'grant-1' },
          availability: { status: 'available' },
          executable: {
            kind: 'reference',
            referenceId: 'grant-1',
            ownerKind: 'assistant',
            ownerId: 'assistant:1',
          },
        },
      ],
    });
    const adapter = createElectronAgentLaunchHostRuntimeAdapter({
      bridge,
      catalog: createCatalog(),
      draftId: 'draft:entry',
    });

    const payload = await adapter.authorizeResource('file');

    expect(payload).toEqual({
      type: 'file',
      id: 'grant-1',
      label: 'notes.txt',
      summary: 'Authorized file: notes.txt',
      data: {
        catalogEntryId: 'mention:resource:grant-1',
        resourceGrantId: 'grant-1',
        resourceKind: 'file',
        ownerKind: 'assistant',
        ownerId: 'assistant:1',
        bindingReceiptId: 'binding:launch-1',
      },
    });
    expect(JSON.stringify(payload)).not.toContain('/');
  });
});

function createBridge() {
  return {
    agentLaunch: {
      attach: vi.fn(),
      authorizeResource: vi.fn(),
      bindTarget: vi.fn(),
      updateConfiguration: vi.fn(),
      searchWorkspaceMentions: vi.fn(),
      submitDraft: vi.fn(),
      detach: vi.fn(async () => undefined),
    },
  };
}

function createCatalog(
  input: {
    readonly connectionId?: string;
    readonly binding?: import('@neko/agent-contracts').AgentBoundDomainBinding;
    readonly bindingReceiptId?: string;
  } = {},
): import('@neko/agent-contracts').AgentLaunchCatalogProjection {
  const connectionId = input.connectionId ?? 'launch-1';
  const binding = input.binding ?? {
    kind: 'assistant' as const,
    assistantSpaceId: 'assistant:1',
    baseGrantIds: [],
  };
  const models = [
    {
      id: 'openai:gpt-5',
      label: 'GPT-5',
      providerId: 'openai',
      modelId: 'gpt-5',
      modelType: 'llm' as const,
      contextWindow: 128_000,
      maximumOutputTokens: 16_384,
      purposeCapabilities: ['agent.main'],
      availability: { status: 'available' as const },
    },
    {
      id: 'openai:gpt-image-1',
      label: 'GPT Image 1',
      providerId: 'openai',
      modelId: 'gpt-image-1',
      modelType: 'image' as const,
      contextWindow: null,
      maximumOutputTokens: null,
      purposeCapabilities: ['image.generate'],
      availability: { status: 'available' as const },
    },
  ];
  const request = {
    modelCatalogEntryId: 'openai:gpt-5',
    providerId: 'openai',
    modelId: 'gpt-5',
    executionMode: 'ask' as const,
    temperature: 0.7,
    maximumOutputTokens: 4096,
    thinkingBudget: 0,
  };
  return {
    connection: {
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view:window-1',
      draftId: 'draft:entry',
      connectionId,
    },
    interaction: {
      phase: 'draft',
      draftId: 'draft:entry',
      binding,
      bindingReceipt: {
        bindingReceiptId: input.bindingReceiptId ?? `binding:${connectionId}`,
        draftId: 'draft:entry',
        connectionId,
        binding,
      },
    },
    models,
    defaultMediaModels: { image: 'openai:gpt-image-1' },
    mediaUnderstandingModels: {
      image: {
        category: 'image',
        purpose: 'image.understand',
        status: 'configured',
        providerId: 'openai',
        modelId: 'gpt-5',
        optionId: 'openai:gpt-5',
        source: 'explicit-config',
      },
      audio: { category: 'audio', purpose: 'audio.understand', status: 'missing' },
      video: { category: 'video', purpose: 'video.understand', status: 'missing' },
    },
    configuration: projectAgentConfigurationPolicy({
      models,
      request,
      source: 'draft-request',
      defaults: {
        executionMode: 'ask',
        temperature: 0.7,
        maximumOutputTokens: 4096,
        thinkingBudget: 0,
      },
    }),
    inputs: [
      {
        id: 'skill:personal:general-help',
        name: 'general-help',
        description: 'Help with general tasks.',
        trigger: 'skill',
        prefix: '$',
        phaseRequirement: 'any',
        bindingRequirement: 'any',
        source: { kind: 'personal', ownerId: 'local-user', sourceId: 'general-help' },
        availability: { status: 'available' },
        executable: {
          kind: 'skill',
          skillName: 'general-help',
          activationId: 'skill:personal:general-help',
        },
      },
      {
        id: 'skill:project:workspace-only',
        name: 'workspace-only',
        description: 'Mutate Workspace facts.',
        trigger: 'skill',
        prefix: '$',
        phaseRequirement: 'any',
        bindingRequirement: 'workspace',
        source: { kind: 'project', workspaceId: 'workspace:1', sourceId: 'workspace-only' },
        availability: {
          status: 'unavailable',
          diagnostic: {
            code: 'binding-required',
            owner: 'agent-runtime',
            message: 'Workspace binding required.',
          },
        },
        executable: {
          kind: 'skill',
          skillName: 'workspace-only',
          activationId: 'skill:project:workspace-only',
        },
      },
    ],
  };
}

function createStorage(): DesktopAgentPresentationStorage & {
  readonly values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
