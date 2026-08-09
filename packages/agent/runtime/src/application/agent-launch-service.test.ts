import { describe, expect, it, vi } from 'vitest';
import type { AgentModelCatalogEntry } from '@neko/agent-contracts';
import type { AssistantConfigState } from '@neko/host/settings';
import {
  createAgentLaunchApplicationService,
  projectAgentLaunchBaseCatalog,
  projectAgentConfigurationPolicy,
} from './agent-launch-service';

const assistantDraft = (assistantSpaceId = 'assistant:1') => ({
  phase: 'draft' as const,
  draftId: 'draft-1',
  binding: { kind: 'assistant' as const, assistantSpaceId, baseGrantIds: [] },
  bindingReceipt: null,
});

const emptyCatalog = {
  models: [],
  configuration: projectAgentConfigurationPolicy({
    models: [],
    request: null,
    source: 'global-default',
    defaults: {
      executionMode: 'ask',
      temperature: 0.7,
      maximumOutputTokens: 4096,
      thinkingBudget: 0,
    },
  }),
  inputs: [],
} as const;
const noWorkspaceMentions = {
  search: vi.fn(async ({ filter }: { readonly filter: string }) => ({
    filter,
    files: [],
    mentionExtras: [],
  })),
};

describe('Agent launch application service', () => {
  it('projects Character capability restrictions through canonical catalog and config policies', () => {
    const projection = projectAgentLaunchBaseCatalog({
      config: createAssistantConfigState(),
      thinkingBudget: 128,
      skills: {
        records: [
          {
            name: 'character-helper',
            description: 'Character helper',
            source: { kind: 'builtin' },
            enabled: true,
            trusted: true,
            fingerprint: 'skill-character-helper',
            entryPoint: { kind: 'skill' },
          },
        ],
        diagnostics: [],
      },
      interaction: {
        phase: 'draft',
        draftId: 'draft-character',
        binding: {
          kind: 'character',
          characterId: 'character-lin',
          characterVersionId: 'character-version-lin',
          roleProfileId: 'role-profile-lin',
        },
        bindingReceipt: null,
      },
      personalSkillOwnerId: 'assistant:default',
      launchCommandHandlerIds: new Set(['builtin:clear']),
      domainPolicy: {
        owner: 'character-version-lin',
        allowedInputKinds: ['mention'],
        lockedConfigurationFields: ['executionMode', 'temperature'],
        reason: 'This Character Version restricts executable inputs and runtime parameters.',
      },
    });

    expect(
      projection.inputs.filter((entry) => entry.trigger === 'command' || entry.trigger === 'skill'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          availability: {
            status: 'unavailable',
            diagnostic: expect.objectContaining({
              code: 'domain-policy-denied',
              owner: 'character-version-lin',
            }),
          },
        }),
      ]),
    );
    expect(projection.configuration.fields.executionMode).toMatchObject({
      source: 'domain-policy',
      policy: { status: 'locked', owner: 'character-version-lin' },
    });
    expect(projection.configuration.fields.temperature).toMatchObject({
      source: 'domain-policy',
      policy: { status: 'locked', owner: 'character-version-lin' },
    });
    expect(projection.configuration.fields.model.policy.status).toBe('editable');
  });
  it('owns exact connection, binding receipt, unified catalog and opaque grants', async () => {
    const releaseConnection = vi.fn(async () => undefined);
    let identity = 0;
    const service = createAgentLaunchApplicationService({
      createIdentity: () => `launch-${++identity}`,
      catalog: {
        readCatalog: vi.fn(async () => {
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
          ] as const;
          return {
            models,
            configuration: availableConfiguration(models),
            inputs: [],
          };
        }),
      },
      authorization: {
        authorize: vi.fn(async ({ resourceKind, interaction }) => ({
          status: 'authorized' as const,
          entry: {
            id: `mention:${resourceKind}:resource-grant-1`,
            name: 'reference.png',
            description: 'Authorized file',
            trigger: 'mention' as const,
            prefix: '@' as const,
            phaseRequirement: 'draft' as const,
            bindingRequirement: 'assistant' as const,
            source: {
              kind: 'personal' as const,
              ownerId:
                interaction.binding.kind === 'assistant'
                  ? interaction.binding.assistantSpaceId
                  : 'invalid',
              sourceId: 'resource-grant-1',
            },
            availability: { status: 'available' as const },
            executable: {
              kind: 'reference' as const,
              referenceId: 'resource-grant-1',
              ownerKind: 'assistant' as const,
              ownerId: 'assistant:1',
            },
          },
        })),
        releaseConnection,
      },
      workspaceMentions: noWorkspaceMentions,
    });
    const attach = {
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view-1',
      draft: assistantDraft(),
    };

    const first = await service.attach(attach);
    expect(first.connection.connectionId).toBe('launch-1');
    expect(first.interaction.bindingReceipt).toMatchObject({
      bindingReceiptId: 'binding:launch-1',
      connectionId: 'launch-1',
    });
    expect(await service.attach(attach)).toEqual(first);
    const authorized = await service.authorizeResource(first.connection, 'file');
    expect(authorized?.inputs).toEqual([
      expect.objectContaining({
        trigger: 'mention',
        executable: expect.objectContaining({ referenceId: 'resource-grant-1' }),
      }),
    ]);
    expect(JSON.stringify(authorized)).not.toContain('/Users/');

    const replacement = await service.attach({
      ...attach,
      draft: assistantDraft('assistant:2'),
    });
    expect(replacement.connection.connectionId).toBe('launch-2');
    expect(releaseConnection).toHaveBeenCalledWith(first.connection);
    expect(() => service.readCatalog(first.connection)).toThrow('Stale Agent launch connection');
    await expect(service.detach(first.connection)).resolves.toBeUndefined();
    await service.dispose();
    expect(releaseConnection).toHaveBeenLastCalledWith(replacement.connection);
  });

  it('preserves the connection and catalog when native authorization is cancelled', async () => {
    const service = createAgentLaunchApplicationService({
      createIdentity: () => 'launch-1',
      catalog: { readCatalog: async () => emptyCatalog },
      authorization: {
        authorize: async () => ({ status: 'cancelled' }),
        releaseConnection: async () => undefined,
      },
      workspaceMentions: noWorkspaceMentions,
    });
    const catalog = await service.attach({
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view-1',
      draft: assistantDraft(),
    });

    await expect(
      service.authorizeResource(catalog.connection, 'directory'),
    ).resolves.toBeUndefined();
    expect(service.readCatalog(catalog.connection)).toEqual(catalog);
  });

  it('replaces a Draft target on the same connection and invalidates prior target state', async () => {
    let identity = 0;
    const releaseConnection = vi.fn(async () => undefined);
    const readCatalog = vi.fn(async () => emptyCatalog);
    const service = createAgentLaunchApplicationService({
      createIdentity: () => `launch-${++identity}`,
      catalog: { readCatalog },
      authorization: {
        authorize: async () => ({ status: 'cancelled' }),
        releaseConnection,
      },
      workspaceMentions: noWorkspaceMentions,
    });
    const initial = await service.attach({
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view-1',
      draft: {
        phase: 'draft',
        draftId: 'draft-1',
        binding: { kind: 'unbound' },
        bindingReceipt: null,
      },
    });
    const rebound = await service.replaceBinding(initial.connection, {
      kind: 'workspace',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
    });

    expect(rebound.connection).toEqual(initial.connection);
    expect(rebound.interaction).toMatchObject({
      phase: 'draft',
      draftId: 'draft-1',
      binding: { kind: 'workspace', workspaceId: 'workspace-1' },
      bindingReceipt: {
        bindingReceiptId: 'binding:launch-1:launch-2',
        connectionId: 'launch-1',
      },
    });
    expect(initial.interaction.bindingReceipt).toBeNull();
    expect(releaseConnection).toHaveBeenCalledOnce();
    expect(readCatalog).toHaveBeenLastCalledWith(rebound.interaction);

    const released = await service.replaceBinding(initial.connection, { kind: 'unbound' });
    expect(released.interaction).toMatchObject({ binding: { kind: 'unbound' } });
    expect(released.interaction.bindingReceipt).toBeNull();
    expect(releaseConnection).toHaveBeenCalledTimes(2);
  });

  it('searches mentions through the exact Workspace binding receipt', async () => {
    let identity = 0;
    const search = vi.fn(async ({ binding, filter }) => ({
      filter,
      files: [
        {
          locator: { kind: 'workspace-file' as const, path: 'notes/hero.md' },
          name: 'hero.md',
          type: 'file' as const,
          source: 'workspace' as const,
        },
      ],
      mentionExtras: [
        {
          type: 'entity' as const,
          id: 'entity:character:hero',
          label: 'Hero',
          summary: 'Character: Hero',
          source: 'entity-graph' as const,
          navigationData: { workspaceId: binding.workspaceId },
        },
      ],
    }));
    const service = createAgentLaunchApplicationService({
      createIdentity: () => `launch-${++identity}`,
      catalog: { readCatalog: async () => emptyCatalog },
      authorization: {
        authorize: async () => ({ status: 'cancelled' }),
        releaseConnection: async () => undefined,
      },
      workspaceMentions: { search },
    });
    const initial = await service.attach({
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view-1',
      draft: {
        phase: 'draft',
        draftId: 'draft-1',
        binding: { kind: 'unbound' },
        bindingReceipt: null,
      },
    });
    const workspace = await service.replaceBinding(initial.connection, {
      kind: 'workspace',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
    });
    const bindingReceiptId = workspace.interaction.bindingReceipt?.bindingReceiptId;
    if (!bindingReceiptId) throw new Error('Expected a Workspace binding receipt.');

    await expect(
      service.searchWorkspaceMentions(workspace.connection, bindingReceiptId, 'hero'),
    ).resolves.toEqual({
      bindingReceiptId,
      filter: 'hero',
      files: [
        expect.objectContaining({
          locator: { kind: 'workspace-file', path: 'notes/hero.md' },
          name: 'hero.md',
          type: 'file',
          source: 'workspace',
          referenceReceipt: expect.objectContaining({
            ownerKind: 'workspace',
            ownerId: 'workspace-1',
            bindingReceiptId,
          }),
        }),
      ],
      mentionExtras: [
        expect.objectContaining({
          id: 'entity:character:hero',
          navigationData: { workspaceId: 'workspace-1' },
        }),
      ],
    });
    expect(search).toHaveBeenCalledWith({
      binding: {
        kind: 'workspace',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
      },
      filter: 'hero',
    });
  });

  it('rejects a late mention result after its Workspace target is replaced', async () => {
    let identity = 0;
    let resolveSearch:
      ((value: { filter: string; files: []; mentionExtras: [] }) => void) | undefined;
    const pendingSearch = new Promise<{ filter: string; files: []; mentionExtras: [] }>(
      (resolve) => {
        resolveSearch = resolve;
      },
    );
    const service = createAgentLaunchApplicationService({
      createIdentity: () => `launch-${++identity}`,
      catalog: { readCatalog: async () => emptyCatalog },
      authorization: {
        authorize: async () => ({ status: 'cancelled' }),
        releaseConnection: async () => undefined,
      },
      workspaceMentions: { search: () => pendingSearch },
    });
    const first = await service.attach({
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view-1',
      draft: {
        phase: 'draft',
        draftId: 'draft-1',
        binding: { kind: 'unbound' },
        bindingReceipt: null,
      },
    });
    const workspaceA = await service.replaceBinding(first.connection, {
      kind: 'workspace',
      workspaceId: 'workspace-a',
      workspaceGrantId: 'workspace-grant-a',
    });
    const receiptA = workspaceA.interaction.bindingReceipt?.bindingReceiptId;
    if (!receiptA) throw new Error('Expected Workspace A binding receipt.');
    const search = service.searchWorkspaceMentions(first.connection, receiptA, 'hero');

    await service.replaceBinding(first.connection, {
      kind: 'workspace',
      workspaceId: 'workspace-b',
      workspaceGrantId: 'workspace-grant-b',
    });
    resolveSearch?.({ filter: 'hero', files: [], mentionExtras: [] });

    await expect(search).rejects.toThrow(`mention search result for '${receiptA}' is stale`);
  });

  it('rejects an entity result owned by another Workspace without changing the current catalog', async () => {
    const service = createAgentLaunchApplicationService({
      createIdentity: () => 'launch-one',
      catalog: { readCatalog: async () => emptyCatalog },
      authorization: {
        authorize: async () => ({ status: 'cancelled' }),
        releaseConnection: async () => undefined,
      },
      workspaceMentions: {
        search: async ({ filter }) => ({
          filter,
          files: [],
          mentionExtras: [
            {
              type: 'entity',
              id: 'entity:foreign',
              label: 'Foreign entity',
              summary: 'Owned by another Workspace',
              navigationData: { workspaceId: 'workspace-other' },
            },
          ],
        }),
      },
    });
    const catalog = await service.attach({
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view-1',
      draft: {
        phase: 'draft',
        draftId: 'draft-1',
        binding: {
          kind: 'workspace',
          workspaceId: 'workspace-one',
          workspaceGrantId: 'grant-one',
        },
        bindingReceipt: null,
      },
    });
    const receiptId = catalog.interaction.bindingReceipt?.bindingReceiptId;
    if (!receiptId) throw new Error('Expected a Workspace binding receipt.');

    await expect(
      service.searchWorkspaceMentions(catalog.connection, receiptId, 'foreign'),
    ).rejects.toThrow("mention 'entity:foreign' belongs to another Workspace");
    expect(service.readCatalog(catalog.connection).inputs).toEqual(catalog.inputs);
  });

  it('rejects stale model, session-only command and replaced Workspace reference identities', async () => {
    const model = {
      id: 'openai:gpt-5',
      label: 'GPT-5',
      providerId: 'openai',
      modelId: 'gpt-5',
      modelType: 'llm' as const,
      contextWindow: 128_000,
      maximumOutputTokens: 16_384,
      purposeCapabilities: ['agent.main'],
      availability: { status: 'available' as const },
    };
    const compact = {
      id: 'command:builtin:compact',
      name: 'compact',
      description: 'Compact context',
      trigger: 'command' as const,
      prefix: '/' as const,
      phaseRequirement: 'session' as const,
      bindingRequirement: 'any' as const,
      source: { kind: 'builtin' as const, sourceId: 'compact' },
      availability: {
        status: 'unavailable' as const,
        diagnostic: {
          code: 'session-required',
          owner: 'agent-runtime',
          message: 'Command /compact requires an exact Conversation.',
        },
      },
      executable: { kind: 'command' as const, commandId: 'compact', handlerId: 'builtin:compact' },
    };
    const skill = {
      id: 'skill:project:review-current',
      name: 'review',
      description: 'Review the exact Workspace',
      trigger: 'skill' as const,
      prefix: '$' as const,
      phaseRequirement: 'any' as const,
      bindingRequirement: 'workspace' as const,
      source: {
        kind: 'project' as const,
        workspaceId: 'workspace-a',
        sourceId: 'review-current',
      },
      availability: { status: 'available' as const },
      executable: {
        kind: 'skill' as const,
        skillName: 'review',
        activationId: 'skill:project:skill:review-current',
      },
    };
    let identity = 0;
    const service = createAgentLaunchApplicationService({
      createIdentity: () => `launch-${++identity}`,
      catalog: {
        readCatalog: async () => ({
          models: [model],
          configuration: availableConfiguration([model]),
          inputs: [compact, skill],
        }),
      },
      authorization: {
        authorize: async () => ({ status: 'cancelled' }),
        releaseConnection: async () => undefined,
      },
      workspaceMentions: {
        search: async ({ filter }) => ({
          filter,
          files: [
            {
              locator: { kind: 'workspace-file', path: 'hero.md' },
              name: 'hero.md',
              type: 'file',
            },
          ],
          mentionExtras: [],
        }),
      },
    });
    const catalog = await service.attach({
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view-1',
      draft: {
        phase: 'draft',
        draftId: 'draft-1',
        binding: {
          kind: 'workspace',
          workspaceId: 'workspace-a',
          workspaceGrantId: 'workspace-grant-a',
        },
        bindingReceipt: null,
      },
    });
    const receiptId = catalog.interaction.bindingReceipt?.bindingReceiptId;
    if (!receiptId) throw new Error('Expected a Workspace binding receipt.');
    const baseInput = {
      draft: catalog.interaction,
      input: { kind: 'message' as const, text: 'Use the reference' },
      references: [],
      resourceGrantIds: [],
      configuration: catalog.configuration.request!,
    };
    expect(() => service.validateDraftSubmit(catalog.connection, baseInput)).not.toThrow();
    expect(() =>
      service.validateDraftSubmit(catalog.connection, {
        ...baseInput,
        configuration: { ...baseInput.configuration, modelCatalogEntryId: 'openai:removed' },
      }),
    ).toThrow('configuration is stale');
    expect(() =>
      service.validateDraftSubmit(catalog.connection, {
        ...baseInput,
        input: {
          kind: 'command',
          catalogEntryId: compact.id,
          commandId: compact.executable.commandId,
          handlerId: compact.executable.handlerId,
        },
      }),
    ).toThrow("command catalog entry 'command:builtin:compact' is stale or unavailable");
    expect(() =>
      service.validateDraftSubmit(catalog.connection, {
        ...baseInput,
        input: {
          kind: 'skill',
          catalogEntryId: skill.id,
          skillName: skill.executable.skillName,
          activationId: skill.executable.activationId,
        },
      }),
    ).not.toThrow();
    expect(() =>
      service.validateDraftSubmit(catalog.connection, {
        ...baseInput,
        input: {
          kind: 'skill',
          catalogEntryId: skill.id,
          skillName: skill.executable.skillName,
          activationId: 'skill:project:skill:review-stale',
        },
      }),
    ).toThrow("skill catalog entry 'skill:project:review-current' is stale or unavailable");

    const search = await service.searchWorkspaceMentions(catalog.connection, receiptId, 'hero');
    const referenceReceipt = search.files[0]?.referenceReceipt;
    if (!referenceReceipt) throw new Error('Expected an exact file reference receipt.');
    const referencedInput = { ...baseInput, references: [referenceReceipt] };
    expect(() => service.validateDraftSubmit(catalog.connection, referencedInput)).not.toThrow();
    expect(() =>
      service.validateDraftSubmit(catalog.connection, {
        ...baseInput,
        references: [{ ...referenceReceipt, ownerId: 'workspace-other' }],
      }),
    ).toThrow(`reference '${referenceReceipt.referenceId}' is stale or cross-owner`);

    await service.replaceBinding(catalog.connection, {
      kind: 'workspace',
      workspaceId: 'workspace-b',
      workspaceGrantId: 'workspace-grant-b',
    });
    expect(() => service.validateDraftSubmit(catalog.connection, referencedInput)).toThrow(
      'does not match its exact launch binding receipt',
    );
  });

  it('keeps same-View launch connections isolated by exact Agent Surface', async () => {
    let identity = 0;
    const releaseConnection = vi.fn(async () => undefined);
    const service = createAgentLaunchApplicationService({
      createIdentity: () => `launch-${++identity}`,
      catalog: { readCatalog: async () => emptyCatalog },
      authorization: {
        authorize: async () => ({ status: 'cancelled' }),
        releaseConnection,
      },
      workspaceMentions: noWorkspaceMentions,
    });
    const base = {
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      viewId: 'agent-view-1',
      draft: assistantDraft(),
    };

    const first = await service.attach({ ...base, agentSurfaceId: 'agent-surface-1' });
    const second = await service.attach({ ...base, agentSurfaceId: 'agent-surface-2' });

    expect(first.connection.connectionId).toBe('launch-1');
    expect(second.connection.connectionId).toBe('launch-2');
    expect(service.readCatalog(first.connection)).toEqual(first);
    expect(service.readCatalog(second.connection)).toEqual(second);
    expect(releaseConnection).not.toHaveBeenCalled();

    await service.dispose();
  });

  it('keeps a shared StrictMode launch connection until its final attachment detaches', async () => {
    const releaseConnection = vi.fn(async () => undefined);
    let resolveCatalog: ((value: typeof emptyCatalog) => void) | undefined;
    const catalog = new Promise<typeof emptyCatalog>((resolve) => {
      resolveCatalog = resolve;
    });
    const service = createAgentLaunchApplicationService({
      createIdentity: () => 'launch-strict',
      catalog: { readCatalog: () => catalog },
      authorization: {
        authorize: async () => ({ status: 'cancelled' }),
        releaseConnection,
      },
      workspaceMentions: noWorkspaceMentions,
    });
    const input = {
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view-1',
      draft: assistantDraft(),
    };

    const firstAttach = service.attach(input);
    const secondAttach = service.attach(input);
    resolveCatalog?.(emptyCatalog);
    const [first, second] = await Promise.all([firstAttach, secondAttach]);
    expect(second.connection).toEqual(first.connection);

    await service.detach(first.connection);
    expect(service.readCatalog(second.connection)).toEqual(second);
    expect(releaseConnection).not.toHaveBeenCalled();
    await service.detach(second.connection);
    expect(releaseConnection).toHaveBeenCalledOnce();
    await expect(service.detach(second.connection)).resolves.toBeUndefined();
  });

  it('owns Draft configuration without mutating defaults or losing it on validation failure', async () => {
    const model: AgentModelCatalogEntry = {
      id: 'openai:gpt-5',
      label: 'GPT-5',
      providerId: 'openai',
      modelId: 'gpt-5',
      modelType: 'llm',
      contextWindow: 128_000,
      maximumOutputTokens: 16_384,
      purposeCapabilities: ['agent.main'],
      availability: { status: 'available' },
    };
    const defaultConfiguration = availableConfiguration([model]);
    let identity = 0;
    const service = createAgentLaunchApplicationService({
      createIdentity: () => `launch-config-${++identity}`,
      catalog: {
        readCatalog: async () => ({
          models: [model],
          configuration: defaultConfiguration,
          inputs: [],
        }),
      },
      authorization: {
        authorize: async () => ({ status: 'cancelled' }),
        releaseConnection: async () => undefined,
      },
      workspaceMentions: noWorkspaceMentions,
    });
    const catalog = await service.attach({
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view-1',
      draft: assistantDraft(),
    });
    const request = {
      ...catalog.configuration.request!,
      executionMode: 'plan' as const,
      temperature: 0.2,
    };

    const updated = service.updateConfiguration(catalog.connection, request);
    expect(updated.configuration.request).toEqual(request);
    expect(defaultConfiguration.request?.executionMode).toBe('ask');
    await service.replaceBinding(catalog.connection, {
      kind: 'assistant',
      assistantSpaceId: 'assistant:2',
      baseGrantIds: [],
    });
    expect(service.readCatalog(catalog.connection).configuration.request).toEqual(request);

    expect(() =>
      service.validateDraftSubmit(catalog.connection, {
        draft: service.readCatalog(catalog.connection).interaction,
        input: { kind: 'message', text: 'hello' },
        references: [],
        resourceGrantIds: [],
        configuration: { ...request, modelCatalogEntryId: 'stale:model' },
      }),
    ).toThrow('configuration is stale');
    expect(service.readCatalog(catalog.connection).configuration.request).toEqual(request);
  });
});

function availableConfiguration(models: readonly AgentModelCatalogEntry[]) {
  const model = models[0];
  if (!model) throw new Error('Available configuration requires one model.');
  return projectAgentConfigurationPolicy({
    models,
    request: {
      modelCatalogEntryId: model.id,
      providerId: model.providerId,
      modelId: model.modelId,
      executionMode: 'ask',
      temperature: 0.7,
      maximumOutputTokens: Math.min(model.maximumOutputTokens ?? 4096, 4096),
      thinkingBudget: 0,
    },
    source: 'global-default',
    defaults: {
      executionMode: 'ask',
      temperature: 0.7,
      maximumOutputTokens: 4096,
      thinkingBudget: 0,
    },
  });
}

function createAssistantConfigState(): AssistantConfigState {
  const provider = {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    models: [{ id: 'gpt-5', name: 'GPT-5', enabled: true }],
    enabled: true,
  };
  return {
    providers: [provider],
    configuredProviders: [provider],
    selectedProviderId: 'openai',
    selectedModelId: 'gpt-5',
    customSystemPrompt: '',
    autoExecuteTools: false,
    streamResponses: true,
    showToolCalls: true,
    temperature: 0.7,
    maxTokens: 4096,
    executionMode: 'ask',
    chatModelOptions: [
      {
        id: 'openai:gpt-5',
        label: 'GPT-5',
        providerId: 'openai',
        modelId: 'gpt-5',
        category: 'llm',
        contextWindow: 128_000,
        maxOutputTokens: 16_384,
        capabilities: ['agent.main', 'character.dialogue'],
      },
    ],
    modelGroups: [],
    defaultMediaModels: {},
  };
}
