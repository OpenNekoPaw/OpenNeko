import { describe, expect, it } from 'vitest';
import { EFFECTIVE_AGENT_CONFIG_DIMENSIONS } from '@neko/agent-contracts';
import type { UnifiedConfig } from '../config-core/index';
import type { ConfigReadResult } from '../config-reader';
import {
  assertEffectiveAgentConfigurationProjection,
  createEffectiveAgentConfigurationProjection,
  resolveEffectiveAgentWorkspaceConfigSnapshot,
} from '../effective-agent-config';
import type { Model, Provider } from '../types/provider';

const USER_CONFIG_PATH = '/home/.neko/config.toml';

function okConfig(config: UnifiedConfig): Extract<ConfigReadResult, { readonly status: 'ok' }> {
  return {
    status: 'ok',
    filePath: USER_CONFIG_PATH,
    config,
    diagnostics: [],
    providerCredentials: {},
  };
}

function createUserConfig(): UnifiedConfig {
  return {
    defaultModels: {
      llm: { providerId: 'explicit-user', modelId: 'user-chat' },
      image: { providerId: 'explicit-user', modelId: 'user-image' },
    },
    temperature: 0.3,
    maxTokens: 4096,
    thinkingBudget: 8000,
    executionMode: 'ask',
    providers: [
      {
        id: 'explicit-user',
        name: 'explicit-user',
        displayName: 'Explicit User',
        type: 'generic',
        apiUrl: 'https://ai.example.test/api',
        enabled: true,
        requiresApiKey: true,
      },
    ],
    models: [
      {
        id: 'user-chat',
        name: 'user-chat',
        displayName: 'User Chat',
        providerId: 'explicit-user',
        type: 'llm',
        capabilities: ['chat', 'function_calling'],
        enabled: true,
      },
      {
        id: 'user-image',
        name: 'user-image',
        displayName: 'User Image',
        providerId: 'explicit-user',
        type: 'image',
        capabilities: ['image.generate'],
        enabled: true,
      },
    ],
  };
}

function providers(config: UnifiedConfig): readonly Provider[] {
  return (config.providers ?? []) as readonly Provider[];
}

function models(config: UnifiedConfig): readonly Model[] {
  return (config.models ?? []) as readonly Model[];
}

function resolve(config: UnifiedConfig, runtimeOverrides = {}) {
  return resolveEffectiveAgentWorkspaceConfigSnapshot({
    userConfigReadResult: okConfig(config),
    providers: providers(config),
    models: models(config),
    runtimeOverrides,
  });
}

describe('resolveEffectiveAgentWorkspaceConfigSnapshot', () => {
  it('resolves every durable setting from the canonical user config', () => {
    const snapshot = resolve(createUserConfig());

    expect(snapshot).toMatchObject({
      providerId: 'explicit-user',
      modelId: 'user-chat',
      temperature: 0.3,
      maxTokens: 4096,
      thinkingBudget: 8000,
      executionMode: 'ask',
      defaultMediaModels: { image: 'explicit-user:user-image' },
      sources: {
        provider: 'user',
        model: 'user',
        temperature: 'user',
        maxTokens: 'user',
        thinkingBudget: 'user',
        executionMode: 'user',
      },
    });
    expect(snapshot.diagnostics).toEqual([]);
  });

  it('isolates a removed transient model without substituting the durable default or changing sibling settings', () => {
    const config = createUserConfig();
    const before = structuredClone(config);
    const snapshot = resolve(config, {
      selectedProviderId: 'explicit-user',
      selectedModelId: 'removed-model',
      executionMode: 'plan',
      temperature: 0.8,
    });
    expect(snapshot).toMatchObject({
      providerId: 'explicit-user',
      modelId: null,
      executionMode: 'plan',
      temperature: 0.8,
      defaultMediaModels: { image: 'explicit-user:user-image' },
    });
    expect(snapshot.model).toBeUndefined();
    expect(snapshot.blockingDiagnostic).toBeDefined();
    expect(config).toEqual(before);
    expect(resolve(config).modelId).toBe('user-chat');
    expect(
      resolve(config, { selectedProviderId: 'explicit-user', selectedModelId: 'user-chat' })
        .blockingDiagnostic,
    ).toBeUndefined();
  });

  it('keeps runtime overrides session-only', () => {
    const userConfig = createUserConfig();
    const snapshot = resolve(userConfig, {
      selectedProviderId: 'explicit-user',
      selectedModelId: 'user-chat',
      temperature: 0.9,
      maxTokens: 1234,
      thinkingBudget: 64,
      executionMode: 'plan' as const,
      outputFormat: 'json' as const,
      defaultMediaModels: { image: 'runtime:image-model' },
    });

    expect(snapshot).toMatchObject({
      temperature: 0.9,
      maxTokens: 1234,
      thinkingBudget: 64,
      executionMode: 'plan',
      outputFormat: 'json',
      defaultMediaModels: { image: 'runtime:image-model' },
      sources: {
        provider: 'runtime',
        model: 'runtime',
        temperature: 'runtime',
        maxTokens: 'runtime',
        thinkingBudget: 'runtime',
        executionMode: 'runtime',
        outputFormat: 'runtime',
      },
    });
    expect(userConfig.temperature).toBe(0.3);
  });

  it('projects a frozen typed identity and detects digest drift', () => {
    const projection = createEffectiveAgentConfigurationProjection(resolve(createUserConfig()));

    expect(assertEffectiveAgentConfigurationProjection(projection)).toBe(projection);
    expect(projection).toMatchObject({
      profileId: expect.stringMatching(/^effective-agent-[a-f0-9]{16}$/u),
      digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      values: {
        modelBinding: {
          purpose: 'agent.main',
          providerId: 'explicit-user',
          modelId: 'user-chat',
        },
        outputFormat: 'markdown',
      },
    });
    expect(projection.dimensions).toBe(EFFECTIVE_AGENT_CONFIG_DIMENSIONS);
    expect(Object.isFrozen(projection.values)).toBe(true);
    expect(() =>
      assertEffectiveAgentConfigurationProjection({
        ...projection,
        values: { ...projection.values, temperature: 1.2 },
      }),
    ).toThrow('digest does not match');
  });

  it('rejects invalid or incomplete effective configuration projection', () => {
    const snapshot = resolve(createUserConfig());
    expect(() =>
      createEffectiveAgentConfigurationProjection({ ...snapshot, maxTokens: 0 }),
    ).toThrow('positive integer');
    expect(() =>
      createEffectiveAgentConfigurationProjection({
        ...snapshot,
        sources: { ...snapshot.sources, model: 'runtime' },
      }),
    ).toThrow('provider/model sources must match');
  });

  it('keeps an invalid user default visible instead of selecting another model', () => {
    const config = createUserConfig();
    config.defaultModels = {
      llm: { providerId: 'missing-provider', modelId: 'missing-model' },
    };
    const snapshot = resolve(config);

    expect(snapshot.providerId).toBe('missing-provider');
    expect(snapshot.modelId).toBe('missing-model');
    expect(snapshot.provider).toBeUndefined();
    expect(snapshot.model).toBeUndefined();
    expect(snapshot.blockingDiagnostic).toEqual(
      expect.objectContaining({ code: 'invalidDefaultProvider', filePath: USER_CONFIG_PATH }),
    );
  });

  it('keeps provider and model unset when no explicit default exists', () => {
    const config = createUserConfig();
    delete config.defaultModels;
    const snapshot = resolve(config);

    expect(snapshot.providerId).toBeNull();
    expect(snapshot.modelId).toBeNull();
    expect(snapshot.sources.provider).toBe('default');
    expect(snapshot.sources.model).toBe('default');
    expect(snapshot.diagnostics).toEqual([]);
  });

  it('keeps recoverable sibling diagnostics visible without blocking a valid selection', () => {
    const config = createUserConfig();
    const snapshot = resolveEffectiveAgentWorkspaceConfigSnapshot({
      userConfigReadResult: {
        ...okConfig(config),
        diagnostics: [
          {
            code: 'invalidProviderApiKey',
            filePath: USER_CONFIG_PATH,
            path: 'providers.unused.api_key',
            message: 'secret-safe local diagnostic',
          },
        ],
      },
      providers: providers(config),
      models: models(config),
    });

    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalidProviderApiKey',
        path: 'providers.unused.api_key',
      }),
    ]);
    expect(snapshot.blockingDiagnostic).toBeUndefined();
  });

  it('projects canonical user config read failures as blocking diagnostics', () => {
    const config = createUserConfig();
    const snapshot = resolveEffectiveAgentWorkspaceConfigSnapshot({
      userConfigReadResult: {
        status: 'invalidToml',
        filePath: USER_CONFIG_PATH,
        diagnostic: {
          code: 'invalidToml',
          filePath: USER_CONFIG_PATH,
          message: 'invalid test TOML',
        },
      },
      providers: providers(config),
      models: models(config),
    });

    expect(snapshot.blockingDiagnostic).toEqual(
      expect.objectContaining({ code: 'invalidToml', filePath: USER_CONFIG_PATH }),
    );
  });
});
