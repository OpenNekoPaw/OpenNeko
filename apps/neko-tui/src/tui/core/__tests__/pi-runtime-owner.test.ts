import { describe, expect, it } from 'vitest';
import {
  InMemoryUserCredentialPersistence,
  OpenNekoCredentialStore,
  createOpenNekoPiModels,
} from '@neko/agent/pi';

import { projectTuiThinkingParameters, resolveTuiPiModelPolicy } from '../pi-runtime-owner';
import { DEFAULT_CLI_CONFIG, type CLIConfig } from '../types';

describe('TUI Pi model parameter projection', () => {
  it('preserves an Anthropic token budget exactly', () => {
    expect(
      projectTuiThinkingParameters({
        provider: 'anthropic',
        protocolProfile: 'anthropic',
        thinkingBudget: 12_345,
      }),
    ).toEqual({
      thinkingLevel: 'medium',
      thinkingBudgets: { medium: 12_345 },
    });
  });

  it('does not approximate a numeric token budget on effort-based protocols', () => {
    expect(() =>
      projectTuiThinkingParameters({
        provider: 'newapi',
        protocolProfile: 'newapi',
        thinkingBudget: 12_345,
      }),
    ).toThrow('requires the Anthropic protocol for an exact Pi projection');
  });
});

describe('TUI flat Pi purpose projection', () => {
  it('does not project an unreferenced understanding model into the Pi turn policy', async () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const models = createOpenNekoPiModels(credentials);
    const config: CLIConfig = {
      ...DEFAULT_CLI_CONFIG,
      apiKey: 'main-key',
      purposeModels: {
        'video.understand': {
          purpose: 'video.understand',
          providerId: 'nekoapi-chat',
          modelId: 'gemini-3.5-flash',
          apiModelId: 'gemini-3.5-flash',
          category: 'llm',
          capabilities: ['video.understand'],
          baseUrl: 'https://newapi.example.invalid/v1',
          protocolProfile: 'newapi',
          providerRequiresApiKey: true,
          providerAuth: { type: 'bearer' },
        },
      },
    };

    const policy = await resolveTuiPiModelPolicy(models, credentials, config, []);

    expect(Object.keys(policy)).toEqual(['agent.main']);
  });

  it('freezes Pi understanding and domain generation beside agent.main', async () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const models = createOpenNekoPiModels(credentials);
    const config: CLIConfig = {
      ...DEFAULT_CLI_CONFIG,
      provider: 'newapi',
      providerType: 'newapi',
      protocolProfile: 'newapi',
      providerAuth: { type: 'bearer' },
      model: 'main-config',
      chatModel: {
        providerId: 'newapi',
        modelId: 'main-config',
        apiModelId: 'main-api',
        capabilities: ['llm.chat'],
        contextWindow: 64_000,
        maxOutputTokens: 8_192,
      },
      baseUrl: 'https://newapi.example.invalid/v1',
      apiKey: 'main-key',
      purposeModels: {
        'image.understand': {
          purpose: 'image.understand',
          providerId: 'newapi',
          modelId: 'vision-config',
          apiModelId: 'vision-api',
          category: 'llm',
          capabilities: ['image.understand', 'vision'],
          baseUrl: 'https://newapi.example.invalid/v1',
          protocolProfile: 'newapi',
          providerRequiresApiKey: true,
          providerAuth: { type: 'bearer' },
          apiKey: 'main-key',
          contextWindow: 32_000,
          maxOutputTokens: 4_096,
        },
        'image.generate': {
          purpose: 'image.generate',
          providerId: 'newapi',
          modelId: 'image-config',
          apiModelId: 'image-api',
          category: 'image',
          capabilities: ['image.generate'],
          baseUrl: 'https://newapi.example.invalid/v1',
          protocolProfile: 'newapi',
          providerRequiresApiKey: true,
          providerAuth: { type: 'bearer' },
          apiKey: 'main-key',
        },
      },
    };

    const policy = await resolveTuiPiModelPolicy(models, credentials, config, [
      'image.understand',
      'image.generate',
    ]);

    expect(policy['agent.main']).toMatchObject({
      execution: 'pi',
      model: { provider: 'newapi', id: 'main-api' },
    });
    expect(policy['image.understand']).toMatchObject({
      execution: 'pi',
      model: { provider: 'newapi', id: 'vision-api' },
    });
    expect(policy['image.generate']).toEqual({
      purpose: 'image.generate',
      execution: 'domain',
      model: { provider: 'newapi', id: 'image-config', name: 'image-api' },
      parameters: { metadata: undefined },
    });
    expect(models.getModel('newapi', 'image-config')).toBeUndefined();
    await expect(models.getAuth(policy['agent.main'].model)).resolves.toMatchObject({
      auth: { headers: { authorization: 'Bearer main-key' } },
    });
  });

  it('registers a keyless local main model directly in Pi', async () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const models = createOpenNekoPiModels(credentials);
    const policy = await resolveTuiPiModelPolicy(
      models,
      credentials,
      {
        ...DEFAULT_CLI_CONFIG,
        provider: 'local',
        providerType: 'ollama',
        protocolProfile: 'ollama',
        providerRequiresApiKey: false,
        providerAuth: { type: 'provider-default' },
        model: 'local-config',
        chatModel: {
          providerId: 'local',
          modelId: 'local-config',
          apiModelId: 'llama3.2',
          capabilities: ['chat'],
          contextWindow: 32_000,
          maxOutputTokens: 4_096,
        },
        baseUrl: 'http://localhost:11434/api',
        apiKey: undefined,
        credentialProvenance: undefined,
      },
      [],
    );

    expect(policy['agent.main'].model).toMatchObject({
      provider: 'local',
      id: 'llama3.2',
      api: 'openai-completions',
      baseUrl: 'http://localhost:11434/api',
    });
    await expect(models.getAuth(policy['agent.main'].model)).resolves.toEqual({
      auth: {},
      source: 'OpenNeko keyless local provider',
    });
  });

  it('rejects conflicting credentials for the same provider projection', async () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const models = createOpenNekoPiModels(credentials);
    const config: CLIConfig = {
      ...DEFAULT_CLI_CONFIG,
      apiKey: 'main-key',
      purposeModels: {
        'image.understand': {
          purpose: 'image.understand',
          providerId: DEFAULT_CLI_CONFIG.provider,
          modelId: 'vision-config',
          apiModelId: 'vision-api',
          category: 'llm',
          capabilities: ['image.understand'],
          baseUrl: DEFAULT_CLI_CONFIG.baseUrl ?? 'https://api.anthropic.com',
          protocolProfile: 'anthropic',
          providerRequiresApiKey: true,
          providerAuth: { type: 'provider-default' },
          apiKey: 'different-key',
          contextWindow: 32_000,
          maxOutputTokens: 4_096,
        },
      },
    };

    await expect(
      resolveTuiPiModelPolicy(models, credentials, config, ['image.understand']),
    ).rejects.toThrow(
      `Provider ${DEFAULT_CLI_CONFIG.provider} has conflicting purpose projections.`,
    );
  });
});
