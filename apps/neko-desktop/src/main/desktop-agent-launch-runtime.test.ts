import { describe, expect, it, vi } from 'vitest';
import {
  createDesktopAgentConversationReferenceResolver,
  createDesktopAgentLaunchRuntime,
} from './desktop-agent-launch-runtime';

describe('Desktop Agent launch native adapter', () => {
  it('authorizes Workspace references and preserves every content format as a locator', async () => {
    const authorizeWorkspace = vi.fn(async () => undefined);
    const resolver = createDesktopAgentConversationReferenceResolver({
      authorizeWorkspace,
    });
    const context = {
      kind: 'workspace' as const,
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
    };

    await expect(
      resolver.resolve({
        conversationId: 'conversation-1',
        context,
        references: [
          {
            id: 'file:brief',
            label: 'brief.md',
            contentLocator: { kind: 'workspace-file', path: 'docs/brief.md' },
            mediaType: 'text',
          },
          {
            id: 'file:screenplay',
            label: 'test.fountain',
            contentLocator: { kind: 'workspace-file', path: 'scripts/test.fountain' },
            mediaType: 'document',
          },
          {
            id: 'file:book',
            label: 'book.epub',
            contentLocator: { kind: 'workspace-file', path: 'books/book.epub' },
            mediaType: 'document',
          },
          {
            id: 'file:comic',
            label: 'comic.cbz',
            contentLocator: { kind: 'workspace-file', path: 'books/comic.cbz' },
            mediaType: 'document',
          },
          {
            id: 'file:report',
            label: 'report.pdf',
            contentLocator: { kind: 'workspace-file', path: 'docs/report.pdf' },
            mediaType: 'document',
          },
          {
            id: 'file:draft',
            label: 'draft.docx',
            contentLocator: { kind: 'workspace-file', path: 'docs/draft.docx' },
            mediaType: 'document',
          },
        ],
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'file:brief',
        data: expect.objectContaining({
          kind: 'authorized-content-reference',
          locator: { kind: 'workspace-file', path: 'docs/brief.md' },
          mediaType: 'text',
        }),
      }),
      expect.objectContaining({
        id: 'file:screenplay',
        data: expect.objectContaining({
          locator: { kind: 'workspace-file', path: 'scripts/test.fountain' },
          mediaType: 'document',
        }),
      }),
      expect.objectContaining({
        id: 'file:book',
        data: expect.objectContaining({
          locator: { kind: 'workspace-file', path: 'books/book.epub' },
          mediaType: 'document',
        }),
      }),
      expect.objectContaining({
        id: 'file:comic',
        data: expect.objectContaining({
          locator: { kind: 'workspace-file', path: 'books/comic.cbz' },
          mediaType: 'document',
        }),
      }),
      expect.objectContaining({
        id: 'file:report',
        data: expect.objectContaining({
          locator: { kind: 'workspace-file', path: 'docs/report.pdf' },
          mediaType: 'document',
        }),
      }),
      expect.objectContaining({
        id: 'file:draft',
        data: expect.objectContaining({
          locator: { kind: 'workspace-file', path: 'docs/draft.docx' },
          mediaType: 'document',
        }),
      }),
    ]);
    expect(authorizeWorkspace).toHaveBeenCalledWith(context);

    await expect(
      resolver.resolve({
        conversationId: 'conversation-assistant',
        context: { kind: 'assistant', assistantSpaceId: 'assistant-1', baseGrantIds: [] },
        references: [],
      }),
    ).rejects.toThrow('does not authorize Workspace file locators');
  });

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
      config: createConfig(),
      selectResource,
      readTextResource: vi.fn(async () => 'reference contents'),
      workspaceMentions: {
        search: async ({ filter }) => ({ filter, files: [], mentionExtras: [] }),
      },
      readWorkspaceSkillCatalog: async () => ({ records: [], diagnostics: [], warnings: [] }),
      resolveWorkspaceReferenceContext: async () => {
        throw new Error('Workspace reference resolution is not expected by this test.');
      },
      createIdentity: () => `identity-${++identity}`,
    });
    const catalog = await runtime.attach({
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view:window-1',
      draft: {
        phase: 'draft',
        draftId: 'draft:1',
        binding: { kind: 'assistant', assistantSpaceId: 'assistant:1', baseGrantIds: [] },
        bindingReceipt: null,
      },
    });
    const authorized = await runtime.authorizeResource(catalog.connection, 'file');

    expect(selectResource).toHaveBeenCalledWith({ windowId: 'window-1', resourceKind: 'file' });
    expect(authorized?.inputs.filter((entry) => entry.trigger === 'mention')).toEqual([
      expect.objectContaining({
        name: 'reference.png',
        executable: expect.objectContaining({ referenceId: 'identity-2' }),
      }),
    ]);
    expect(JSON.stringify(authorized)).not.toContain('/Users/private');
    await runtime.commitResourceGrants(catalog.connection, 'conversation:1', ['identity-2']);
    await expect(
      runtime.resolveResourceContexts(
        {
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

  it('replaces the exact Draft binding and invalidates prior target grants', async () => {
    let identity = 0;
    const runtime = createDesktopAgentLaunchRuntime({
      agent: {
        readGlobalSkillCatalog: async () => ({ records: [], diagnostics: [], warnings: [] }),
      },
      config: createConfig(),
      selectResource: async () => ({
        label: 'brief.txt',
        hostResource: '/Users/private/brief.txt',
      }),
      readTextResource: async () => 'Assistant brief',
      workspaceMentions: {
        search: async ({ filter }) => ({ filter, files: [], mentionExtras: [] }),
      },
      readWorkspaceSkillCatalog: async () => ({ records: [], diagnostics: [], warnings: [] }),
      resolveWorkspaceReferenceContext: async () => {
        throw new Error('Workspace reference resolution is not expected by this test.');
      },
      createIdentity: () => `identity-${++identity}`,
    });
    const catalog = await runtime.attach({
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view:window-1',
      draft: {
        phase: 'draft',
        draftId: 'draft:1',
        binding: { kind: 'unbound' },
        bindingReceipt: null,
      },
    });
    await runtime.authorizeResource(catalog.connection, 'file');
    const assistantContext = {
      kind: 'assistant' as const,
      assistantSpaceId: 'assistant:1',
      baseGrantIds: [],
    };

    await expect(runtime.validateResourceGrants(assistantContext, ['identity-2'])).rejects.toThrow(
      "Agent Resource grant 'identity-2' belongs to another scope.",
    );
    const rebound = await runtime.bindTarget(catalog.connection, assistantContext);
    expect(rebound.interaction).toMatchObject({
      binding: assistantContext,
      bindingReceipt: {
        draftId: 'draft:1',
        connectionId: catalog.connection.connectionId,
      },
    });
    await expect(runtime.validateResourceGrants(assistantContext, ['identity-2'])).rejects.toThrow(
      "Agent Resource grant 'identity-2' is not present.",
    );
    await expect(runtime.bindTarget(catalog.connection, assistantContext)).resolves.toEqual(
      rebound,
    );
    await runtime.authorizeResource(catalog.connection, 'file');
    await expect(
      runtime.resolveResourceContexts(assistantContext, ['identity-4']),
    ).resolves.toEqual([
      {
        type: 'file',
        id: 'identity-4',
        label: 'brief.txt',
        summary: 'Authorized file: brief.txt',
        data: { text: 'Assistant brief' },
      },
    ]);
  });

  it('preflights every Resource grant before committing any grant to a Conversation', async () => {
    let identity = 0;
    const runtime = createDesktopAgentLaunchRuntime({
      agent: {
        readGlobalSkillCatalog: async () => ({ records: [], diagnostics: [], warnings: [] }),
      },
      config: createConfig(),
      selectResource: async () => ({ label: 'brief.txt', hostResource: '/private/brief.txt' }),
      readTextResource: async () => 'brief',
      workspaceMentions: {
        search: async ({ filter }) => ({ filter, files: [], mentionExtras: [] }),
      },
      readWorkspaceSkillCatalog: async () => ({ records: [], diagnostics: [], warnings: [] }),
      resolveWorkspaceReferenceContext: async () => {
        throw new Error('Workspace reference resolution is not expected by this test.');
      },
      createIdentity: () => `identity-${++identity}`,
    });
    const catalog = await runtime.attach({
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view:window-1',
      draft: {
        phase: 'draft',
        draftId: 'draft:1',
        binding: { kind: 'assistant', assistantSpaceId: 'assistant:1', baseGrantIds: [] },
        bindingReceipt: null,
      },
    });
    await runtime.authorizeResource(catalog.connection, 'file');

    expect(() =>
      runtime.validateResourceGrantCommit(catalog.connection, undefined, [
        'identity-2',
        'missing-grant',
      ]),
    ).toThrow("'missing-grant' does not belong to its launch connection");
    await expect(
      runtime.commitResourceGrants(catalog.connection, 'conversation:one', [
        'identity-2',
        'missing-grant',
      ]),
    ).rejects.toThrow("'missing-grant' does not belong to its launch connection");
    await expect(
      runtime.commitResourceGrants(catalog.connection, 'conversation:two', ['identity-2']),
    ).resolves.toBeUndefined();
  });

  it('reads the exact Workspace Skill snapshot instead of the scope-neutral catalog', async () => {
    const readGlobalSkillCatalog = vi.fn(async () => ({
      records: [],
      diagnostics: [],
      warnings: [],
    }));
    const readWorkspaceSkillCatalog = vi.fn(async () => ({
      records: [
        {
          name: 'project-review',
          description: 'Review this project',
          source: { kind: 'project' as const },
          trusted: true,
          enabled: true,
          fingerprint: 'sha256:project-review',
          locator: {
            kind: 'skill' as const,
            value: '/__neko_skills/fixture/project-review',
            fingerprint: 'sha256:project-review',
          },
          entryPoint: { kind: 'skill' as const },
        },
        {
          name: 'project-review',
          description: 'Run the project review command',
          source: { kind: 'project' as const },
          trusted: true,
          enabled: true,
          fingerprint: 'sha256:project-review-command',
          locator: {
            kind: 'skill' as const,
            value: '/__neko_skills/fixture/project-review-command',
            fingerprint: 'sha256:project-review-command',
          },
          entryPoint: {
            kind: 'command-artifact' as const,
            commandId: 'project-review',
            artifactId: 'command:project-review',
            argumentHint: '<scope>',
            supportsArguments: true,
          },
        },
      ],
      diagnostics: [],
      warnings: [],
    }));
    const runtime = createDesktopAgentLaunchRuntime({
      agent: { readGlobalSkillCatalog },
      config: createConfig(),
      selectResource: async () => undefined,
      readTextResource: async () => '',
      workspaceMentions: {
        search: async ({ filter }) => ({ filter, files: [], mentionExtras: [] }),
      },
      readWorkspaceSkillCatalog,
      resolveWorkspaceReferenceContext: async () => {
        throw new Error('Workspace reference resolution is not expected by this test.');
      },
      createIdentity: () => 'launch-one',
    });
    const binding = {
      kind: 'workspace' as const,
      workspaceId: 'workspace-one',
      workspaceGrantId: 'grant-one',
    };

    const catalog = await runtime.attach({
      applicationInstanceId: 'app-one',
      windowId: 'window-one',
      workbenchInstanceId: 'workbench-one',
      agentSurfaceId: 'surface-one',
      viewId: 'view-one',
      draft: {
        phase: 'draft',
        draftId: 'draft-one',
        binding,
        bindingReceipt: null,
      },
    });

    expect(readWorkspaceSkillCatalog).toHaveBeenCalledWith(binding);
    expect(readGlobalSkillCatalog).not.toHaveBeenCalled();
    expect(catalog.inputs).toContainEqual(
      expect.objectContaining({
        trigger: 'skill',
        name: 'project-review',
        source: {
          kind: 'project',
          workspaceId: 'workspace-one',
          sourceId: 'sha256:project-review',
        },
      }),
    );
    expect(catalog.inputs).toContainEqual(
      expect.objectContaining({
        id: 'command-artifact:project:command:project-review',
        trigger: 'command',
        name: 'project-review',
        phaseRequirement: 'any',
        bindingRequirement: 'workspace',
        source: {
          kind: 'command-artifact',
          workspaceId: 'workspace-one',
          artifactId: 'command:project-review',
        },
        availability: { status: 'available' },
        executable: {
          kind: 'command',
          commandId: 'project-review',
          handlerId:
            'command-artifact:skill:project:command-artifact:sha256:project-review-command',
        },
      }),
    );
    expect(catalog.inputs).toContainEqual(
      expect.objectContaining({
        id: 'command:builtin:help',
        availability: {
          status: 'unavailable',
          diagnostic: expect.objectContaining({ code: 'command-handler-unavailable' }),
        },
      }),
    );
    expect(catalog.inputs).toContainEqual(
      expect.objectContaining({
        id: 'command:builtin:new',
        availability: { status: 'available' },
      }),
    );
  });

  it('delegates mention search only through the current Workspace receipt', async () => {
    const search = vi.fn(async ({ filter }: { readonly filter: string }) => ({
      filter,
      files: [
        {
          locator: { kind: 'workspace-file' as const, path: 'hero.md' },
          name: 'hero.md',
          type: 'file' as const,
        },
      ],
      mentionExtras: [],
    }));
    const runtime = createDesktopAgentLaunchRuntime({
      agent: {
        readGlobalSkillCatalog: async () => ({ records: [], diagnostics: [], warnings: [] }),
      },
      config: createConfig(),
      selectResource: async () => undefined,
      readTextResource: async () => '',
      workspaceMentions: { search },
      readWorkspaceSkillCatalog: async () => ({ records: [], diagnostics: [], warnings: [] }),
      resolveWorkspaceReferenceContext: async ({ reference }) => ({
        type: reference.kind === 'file' ? 'file' : 'entity',
        id:
          reference.kind === 'file' ? JSON.stringify(reference.file.locator) : reference.entity.id,
        label: reference.kind === 'file' ? reference.file.name : reference.entity.label,
        summary:
          reference.kind === 'file'
            ? `Workspace file: ${reference.file.name}`
            : reference.entity.summary,
        data: reference,
      }),
      createIdentity: () => 'launch-1',
    });
    const catalog = await runtime.attach({
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view:window-1',
      draft: {
        phase: 'draft',
        draftId: 'draft:1',
        binding: {
          kind: 'workspace',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'workspace-grant-1',
        },
        bindingReceipt: null,
      },
    });
    const receiptId = catalog.interaction.bindingReceipt?.bindingReceiptId;
    if (!receiptId) throw new Error('Expected a Workspace binding receipt.');
    if (catalog.interaction.binding.kind !== 'workspace') {
      throw new Error('Expected Workspace binding.');
    }

    const projection = await runtime.searchWorkspaceMentions(catalog.connection, receiptId, 'hero');
    expect(projection).toMatchObject({
      bindingReceiptId: receiptId,
      filter: 'hero',
      files: [expect.objectContaining({ name: 'hero.md' })],
    });
    const referenceReceipt = projection.files[0]?.referenceReceipt;
    if (!referenceReceipt) throw new Error('Expected a Workspace reference receipt.');
    runtime.validateReferenceCommit(catalog.connection, undefined, [referenceReceipt]);
    runtime.commitReferences(catalog.connection, 'conversation:one', [referenceReceipt]);
    await expect(
      runtime.resolveReferenceContexts('conversation:one', catalog.interaction.binding, [
        referenceReceipt,
      ]),
    ).resolves.toEqual([expect.objectContaining({ type: 'file', label: 'hero.md' })]);
    await expect(
      runtime.searchWorkspaceMentions(catalog.connection, 'binding:stale', 'hero'),
    ).rejects.toThrow('stale or not Workspace-bound');
    expect(search).toHaveBeenCalledOnce();
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

function createConfig() {
  const state = createConfigState();
  return {
    getAssistantConfigState: () => state,
    getAssistantRuntimeSettingsSnapshot: () => ({
      selectedProviderId: state.selectedProviderId,
      selectedModelId: state.selectedModelId,
      customSystemPrompt: state.customSystemPrompt,
      autoExecuteTools: state.autoExecuteTools,
      streamResponses: state.streamResponses,
      showToolCalls: state.showToolCalls,
      temperature: state.temperature,
      maxTokens: state.maxTokens,
      executionMode: state.executionMode,
      thinkingBudget: 0,
    }),
  };
}
