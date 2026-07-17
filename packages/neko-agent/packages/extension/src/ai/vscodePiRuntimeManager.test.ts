import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  InMemoryUserCredentialPersistence,
  NodePiConversationAuthority,
  OpenNekoCredentialStore,
  createOpenNekoPiModels,
  resolvePiToolPermissionAction,
} from '@neko/agent/pi';
import type { Model, Provider } from '@neko/platform';

import {
  VSCodePiRuntimeManager,
  ensureVSCodePiProviderCredential,
  filterVSCodePiTurnPurposeModels,
  resolveVSCodePiPurposeModelUse,
  resolveVSCodePiTurnModelPolicy,
} from './vscodePiRuntimeManager';

const accountProvider: Provider = {
  id: 'neko-account-gateway',
  name: 'neko-account-gateway',
  displayName: 'Neko Account Gateway',
  type: 'newapi',
  apiUrl: 'https://gateway.example.invalid/v1',
  enabled: true,
  protocolProfile: 'newapi',
  requiresApiKey: false,
  useBearerAuth: true,
};

describe('VSCodePiRuntimeManager tool permission', () => {
  it('does not block an explicitly confirmation-free read_skill call in ask mode', () => {
    expect(resolvePiToolPermissionAction('ask', false, true)).toBe('allow');
    expect(resolvePiToolPermissionAction('ask', undefined, true)).toBe('allow');
    expect(resolvePiToolPermissionAction('ask', true, true)).toBe('confirm');
    expect(resolvePiToolPermissionAction('ask', false, false)).toBe('confirm');
    expect(resolvePiToolPermissionAction('auto', false, false)).toBe('allow');
    expect(resolvePiToolPermissionAction('auto', undefined, false)).toBe('allow');
    expect(resolvePiToolPermissionAction('auto', true, false)).toBe('confirm');
    expect(resolvePiToolPermissionAction('plan', false, true)).toBe('deny');
  });
});

describe('VSCodePiRuntimeManager authority ownership', () => {
  it('opens one program-level authority for catalog reads and disposes it once', async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), 'neko-vscode-pi-manager-'));
    const createSpy = vi.spyOn(NodePiConversationAuthority, 'create');
    const disposeSpy = vi.spyOn(NodePiConversationAuthority.prototype, 'dispose');
    const replace = vi.fn();
    const manager = new VSCodePiRuntimeManager({
      userDataRoot,
      builtinSkillRoot: join(userDataRoot, 'builtin-skills'),
      workspaceId: 'workspace-1',
      hostId: 'vscode-test',
      credentials: new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence()),
      tools: { list: () => [] } as never,
      workspaceTrusted: () => true,
    });

    try {
      await expect(manager.listConversationCatalog()).resolves.toEqual([]);
      await manager.projectConversationCatalog({ replace });
      await expect(manager.listConversationCatalog()).resolves.toEqual([]);

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith({
        workspaceId: 'workspace-1',
        conversations: [],
        branches: [],
      });
    } finally {
      manager.dispose();
      await vi.waitFor(() => expect(disposeSpy).toHaveBeenCalledTimes(1));
      createSpy.mockRestore();
      disposeSpy.mockRestore();
      await rm(userDataRoot, { recursive: true, force: true });
    }
  });

  it('deletes a persisted conversation through the program authority', async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), 'neko-vscode-pi-delete-'));
    const manager = new VSCodePiRuntimeManager({
      userDataRoot,
      builtinSkillRoot: join(userDataRoot, 'builtin-skills'),
      workspaceId: 'workspace-1',
      hostId: 'vscode-test',
      credentials: new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence()),
      tools: { list: () => [] } as never,
      workspaceTrusted: () => true,
    });

    try {
      await expect(
        manager.createConversation({
          conversationId: 'conversation-delete',
          title: 'Created in Pi',
        }),
      ).resolves.toMatchObject({
        conversationId: 'conversation-delete',
        title: 'Created in Pi',
        activeBranchId: 'main',
      });
      await manager.updateConversationTitle('conversation-delete', 'Renamed in Pi');
      await expect(manager.listConversationCatalog()).resolves.toEqual([
        expect.objectContaining({
          conversationId: 'conversation-delete',
          title: 'Renamed in Pi',
        }),
      ]);
      await expect(manager.deleteConversation('conversation-delete')).resolves.toBe(true);
      await expect(manager.listConversationCatalog()).resolves.toEqual([]);
      await expect(manager.deleteConversation('conversation-delete')).resolves.toBe(false);
    } finally {
      const disposeSpy = vi.spyOn(NodePiConversationAuthority.prototype, 'dispose');
      manager.dispose();
      await vi.waitFor(() => expect(disposeSpy).toHaveBeenCalledTimes(1));
      disposeSpy.mockRestore();
      await rm(userDataRoot, { recursive: true, force: true });
    }
  });

  it('projects display counts and reads transcript entries through Pi Session', async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), 'neko-vscode-pi-projection-'));
    const entries = [
      {
        type: 'message' as const,
        id: 'entry-user',
        parentId: null,
        timestamp: '2026-07-17T00:00:00.000Z',
        message: { role: 'user' as const, content: 'hello', timestamp: 1 },
      },
      {
        type: 'message' as const,
        id: 'entry-tool',
        parentId: 'entry-user',
        timestamp: '2026-07-17T00:00:01.000Z',
        message: {
          role: 'toolResult' as const,
          toolCallId: 'tool-1',
          toolName: 'fixture',
          content: [{ type: 'text' as const, text: 'done' }],
          isError: false,
          timestamp: 2,
        },
      },
    ];
    const readEntries = vi
      .spyOn(NodePiConversationAuthority.prototype, 'readBranchEntries')
      .mockResolvedValue(entries);
    const manager = new VSCodePiRuntimeManager({
      userDataRoot,
      builtinSkillRoot: join(userDataRoot, 'builtin-skills'),
      workspaceId: 'workspace-1',
      hostId: 'vscode-test',
      credentials: new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence()),
      tools: { list: () => [] } as never,
      workspaceTrusted: () => true,
    });

    try {
      await manager.createConversation({ conversationId: 'conversation-projection' });
      await expect(manager.listConversationPresentationCatalog()).resolves.toEqual([
        expect.objectContaining({
          conversationId: 'conversation-projection',
          messageCount: 1,
        }),
      ]);
      await expect(manager.readConversationEntries('conversation-projection')).resolves.toEqual(
        entries,
      );
      expect(readEntries).toHaveBeenCalledWith('conversation-projection', 'main');
    } finally {
      manager.dispose();
      readEntries.mockRestore();
      await rm(userDataRoot, { recursive: true, force: true });
    }
  });
});

describe('VSCodePiRuntimeManager credential projection', () => {
  it('excludes configured purpose models without a registered Agent Tool caller', () => {
    const input = {
      purposeModels: {
        'video.understand': {
          provider: accountProvider,
          model: {
            id: 'video-understanding',
            name: 'gemini-3.5-flash',
            providerId: accountProvider.id,
            capabilities: ['video.understand'],
            enabled: true,
          },
          providerSource: 'account-gateway',
        },
      },
    } as never;

    expect(filterVSCodePiTurnPurposeModels(input, [])).toMatchObject({
      purposeModels: undefined,
    });
  });

  it('projects the product account session into the shared Pi store with explicit provenance', async () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const resolveAccountGatewayCredential = vi.fn(async () => '  account-token  ');

    await ensureVSCodePiProviderCredential(
      credentials,
      { provider: accountProvider, providerSource: 'account-gateway' },
      resolveAccountGatewayCredential,
    );

    expect(resolveAccountGatewayCredential).toHaveBeenCalledWith('neko-account-gateway');
    await expect(credentials.read('neko-account-gateway')).resolves.toEqual({
      type: 'api_key',
      key: 'account-token',
    });
    await expect(credentials.status('neko-account-gateway')).resolves.toMatchObject({
      provenance: 'account-gateway',
      fingerprint: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
  });

  it('does not fall back when the account credential resolver is absent or empty', async () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());

    await expect(
      ensureVSCodePiProviderCredential(
        credentials,
        { provider: accountProvider, providerSource: 'account-gateway' },
        undefined,
      ),
    ).rejects.toThrow('no product-auth credential resolver');
    await expect(
      ensureVSCodePiProviderCredential(
        credentials,
        { provider: accountProvider, providerSource: 'account-gateway' },
        async () => '   ',
      ),
    ).rejects.toThrow('returned an empty credential');
    await expect(credentials.read('neko-account-gateway')).resolves.toBeUndefined();
  });

  it('freezes main and bounded understanding as peer purpose entries', async () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const models = createOpenNekoPiModels(credentials);
    const provider: Provider = {
      ...accountProvider,
      id: 'configured-newapi',
      name: 'configured-newapi',
      requiresApiKey: true,
      apiKey: 'configured-secret',
    };
    const main: Model = {
      id: 'main-config-id',
      name: 'main-api-id',
      providerId: provider.id,
      type: 'llm',
      capabilities: ['llm.chat'],
      contextWindow: 64_000,
      maxOutputTokens: 8_192,
      enabled: true,
    };
    const vision: Model = {
      id: 'vision-config-id',
      name: 'vision-api-id',
      providerId: provider.id,
      type: 'llm',
      protocolProfile: 'openai-responses',
      capabilities: ['image.understand', 'vision'],
      contextWindow: 32_000,
      maxOutputTokens: 4_096,
      enabled: true,
    };

    const policy = await resolveVSCodePiTurnModelPolicy(
      models,
      credentials,
      {
        conversationId: 'conversation-1',
        prompt: 'inspect image',
        systemPrompt: 'system',
        provider,
        model: main,
        providerSource: 'explicit-config',
        purposeModels: {
          'image.understand': {
            provider,
            model: vision,
            providerSource: 'explicit-config',
          },
        },
        executionMode: 'ask',
        topP: 0.95,
        locale: 'en',
        events: { emit: vi.fn() },
      },
      undefined,
    );

    expect(Object.keys(policy)).toEqual(['agent.main', 'image.understand']);
    expect(policy['agent.main'].model).toMatchObject({
      provider: 'configured-newapi',
      id: 'main-api-id',
      api: 'openai-completions',
    });
    expect(policy['agent.main'].parameters).toMatchObject({ topP: 0.95 });
    expect(policy['image.understand']?.model).toMatchObject({
      provider: 'configured-newapi',
      id: 'vision-api-id',
      api: 'openai-responses',
    });
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it('freezes a domain media model beside agent.main without projecting it as Pi chat', async () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const models = createOpenNekoPiModels(credentials);
    const provider: Provider = {
      ...accountProvider,
      id: 'configured-newapi',
      name: 'configured-newapi',
      requiresApiKey: true,
      apiKey: 'configured-secret',
    };
    const main: Model = {
      id: 'main-config-id',
      name: 'main-api-id',
      providerId: provider.id,
      type: 'llm',
      capabilities: ['llm.chat'],
      contextWindow: 64_000,
      maxOutputTokens: 8_192,
      enabled: true,
    };
    const image: Model = {
      id: 'image-config-id',
      name: 'image-api-id',
      providerId: provider.id,
      type: 'image',
      capabilities: ['image.generate'],
      enabled: true,
    };

    const policy = await resolveVSCodePiTurnModelPolicy(
      models,
      credentials,
      {
        conversationId: 'conversation-image',
        prompt: 'generate image',
        systemPrompt: 'system',
        provider,
        model: main,
        providerSource: 'explicit-config',
        purposeModels: {
          'image.generate': { provider, model: image, providerSource: 'explicit-config' },
        },
        executionMode: 'ask',
        locale: 'en',
        events: { emit: vi.fn() },
      },
      undefined,
    );

    expect(policy['image.generate']).toEqual({
      purpose: 'image.generate',
      execution: 'domain',
      model: { provider: 'configured-newapi', id: 'image-config-id', name: 'image-api-id' },
      parameters: { metadata: undefined },
    });
    expect(models.getModel('configured-newapi', 'image-api-id')).toBeUndefined();
  });

  it('uses the exact account NewAPI endpoint, model, bearer token, and source', async () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const models = createOpenNekoPiModels(credentials);
    const model: Model = {
      id: 'account-chat',
      name: 'account-api-chat',
      providerId: accountProvider.id,
      type: 'llm',
      capabilities: ['chat'],
      contextWindow: 32_000,
      maxOutputTokens: 4_096,
      enabled: true,
    };

    const policy = await resolveVSCodePiTurnModelPolicy(
      models,
      credentials,
      {
        conversationId: 'conversation-account',
        prompt: 'hello',
        systemPrompt: 'system',
        provider: accountProvider,
        model,
        providerSource: 'account-gateway',
        executionMode: 'ask',
        locale: 'en',
        events: { emit: vi.fn() },
      },
      async () => 'account-access-token',
    );

    expect(policy['agent.main'].model).toMatchObject({
      provider: 'neko-account-gateway',
      id: 'account-api-chat',
      api: 'openai-completions',
      baseUrl: 'https://gateway.example.invalid/v1',
    });
    await expect(models.getAuth(policy['agent.main'].model)).resolves.toEqual({
      auth: { headers: { authorization: 'Bearer account-access-token' } },
      source: 'OpenNeko CredentialStore',
    });
    await expect(credentials.status(accountProvider.id)).resolves.toMatchObject({
      provenance: 'account-gateway',
    });
  });

  it('resolves a flat Canvas purpose without creating an agent.main binding', async () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const models = createOpenNekoPiModels(credentials);
    const provider: Provider = {
      ...accountProvider,
      id: 'configured-newapi',
      name: 'configured-newapi',
      requiresApiKey: true,
      apiKey: 'configured-secret',
    };
    const model: Model = {
      id: 'canvas-config-id',
      name: 'canvas-api-id',
      providerId: provider.id,
      type: 'llm',
      capabilities: ['llm.chat'],
      contextWindow: 16_000,
      maxOutputTokens: 1_024,
      enabled: true,
    };

    const resolved = await resolveVSCodePiPurposeModelUse(
      models,
      credentials,
      {
        purpose: 'canvas.prompt',
        provider,
        model,
        providerSource: 'explicit-config',
        parameters: { temperature: 0.4, maxTokens: 300 },
      },
      undefined,
    );

    expect(resolved).toMatchObject({
      purpose: 'canvas.prompt',
      execution: 'pi',
      model: { provider: 'configured-newapi', id: 'canvas-api-id' },
      parameters: { temperature: 0.4, maxTokens: 300 },
    });
    expect(models.getModel('configured-newapi', 'canvas-api-id')).toBeDefined();
  });

  it('rejects conflicting credentials for one provider purpose group', async () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const models = createOpenNekoPiModels(credentials);
    const provider: Provider = {
      ...accountProvider,
      id: 'configured-newapi',
      name: 'configured-newapi',
      requiresApiKey: true,
      apiKey: 'main-key',
    };
    const main: Model = {
      id: 'main-config-id',
      name: 'main-api-id',
      providerId: provider.id,
      type: 'llm',
      capabilities: ['llm.chat'],
      contextWindow: 64_000,
      maxOutputTokens: 8_192,
      enabled: true,
    };
    const vision: Model = {
      id: 'vision-config-id',
      name: 'vision-api-id',
      providerId: provider.id,
      type: 'llm',
      capabilities: ['image.understand'],
      contextWindow: 32_000,
      maxOutputTokens: 4_096,
      enabled: true,
    };

    await expect(
      resolveVSCodePiTurnModelPolicy(
        models,
        credentials,
        {
          conversationId: 'conversation-conflict',
          prompt: 'inspect image',
          systemPrompt: 'system',
          provider,
          model: main,
          providerSource: 'explicit-config',
          purposeModels: {
            'image.understand': {
              provider: { ...provider, apiKey: 'different-key' },
              model: vision,
              providerSource: 'explicit-config',
            },
          },
          executionMode: 'ask',
          locale: 'en',
          events: { emit: vi.fn() },
        },
        undefined,
      ),
    ).rejects.toThrow(
      'Pi provider configured-newapi has conflicting endpoint, credential, source, or auth projections.',
    );
  });

  it('rejects a model bound through the wrong provider identity', async () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const models = createOpenNekoPiModels(credentials);
    const model: Model = {
      id: 'foreign-model',
      name: 'foreign-api-model',
      providerId: 'another-provider',
      type: 'llm',
      capabilities: ['llm.chat'],
      contextWindow: 64_000,
      maxOutputTokens: 8_192,
      enabled: true,
    };

    await expect(
      resolveVSCodePiTurnModelPolicy(
        models,
        credentials,
        {
          conversationId: 'conversation-wrong-provider',
          prompt: 'hello',
          systemPrompt: 'system',
          provider: accountProvider,
          model,
          providerSource: 'account-gateway',
          executionMode: 'ask',
          locale: 'en',
          events: { emit: vi.fn() },
        },
        async () => 'account-token',
      ),
    ).rejects.toThrow(
      'Model foreign-model belongs to provider another-provider, not neko-account-gateway.',
    );
  });
});
