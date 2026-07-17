import type { Model } from '@earendil-works/pi-ai';
import { describe, expect, it } from 'vitest';

import {
  AgentModelPolicyError,
  DEFAULT_PI_MODEL_REQUEST_TIMEOUT_MS,
  requireAgentModelUse,
  resolveAgentPurposeModelUse,
  resolveAgentModelPolicy,
  type AgentModelCatalogEntry,
} from '../model-policy';

function model(
  provider: string,
  id: string,
  input: Model<'openai-completions'>['input'] = ['text'],
): Model<'openai-completions'> {
  return {
    id,
    name: id,
    api: 'openai-completions',
    provider,
    baseUrl: `https://${provider}.example.invalid/v1`,
    reasoning: false,
    input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8_192,
    maxTokens: 2_048,
  };
}

function catalogEntry(
  provider: string,
  id: string,
  overrides: Partial<AgentModelCatalogEntry> = {},
): AgentModelCatalogEntry {
  return {
    model: model(provider, id),
    capabilities: ['llm.chat', 'tools'],
    credentialState: 'configured',
    ...overrides,
  };
}

describe('resolveAgentModelPolicy', () => {
  it('resolves one exact product purpose without fabricating agent.main', () => {
    const resolved = resolveAgentPurposeModelUse({
      purpose: 'canvas.prompt',
      catalog: [catalogEntry('newapi', 'canvas-prompt')],
      binding: {
        providerId: 'newapi',
        modelId: 'canvas-prompt',
        parameters: { maxTokens: 300 },
      },
      requirement: { capabilities: ['llm.chat'] },
    });

    expect(resolved).toMatchObject({
      purpose: 'canvas.prompt',
      execution: 'pi',
      model: { provider: 'newapi', id: 'canvas-prompt' },
      parameters: { maxTokens: 300 },
    });
  });

  it('requires one explicit flat agent.main binding', () => {
    expect(() =>
      resolveAgentModelPolicy({
        catalog: [catalogEntry('openai', 'main')],
        userBindings: {
          'image.generate': { providerId: 'openai', modelId: 'main' },
        },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AgentModelPolicyError>>({ code: 'missing-main' }),
    );
  });

  it('merges catalog parameter defaults into an immutable turn snapshot', () => {
    const source = catalogEntry('newapi', 'gpt-compatible', {
      defaultParameters: {
        temperature: 0.4,
        maxTokens: 1_000,
        headers: { 'x-source': 'catalog' },
      },
    });
    const userBindings = {
      'agent.main': {
        providerId: 'newapi',
        modelId: 'gpt-compatible',
        parameters: { temperature: 0.7, headers: { 'x-user': 'configured' } },
      },
    } as const;

    const policy = resolveAgentModelPolicy({ catalog: [source], userBindings });
    source.model.name = 'mutated after turn start';

    expect(policy['agent.main'].model.name).toBe('gpt-compatible');
    expect(policy['agent.main'].parameters).toEqual({
      temperature: 0.7,
      maxTokens: 1_000,
      timeoutMs: DEFAULT_PI_MODEL_REQUEST_TIMEOUT_MS,
      headers: { 'x-source': 'catalog', 'x-user': 'configured' },
      metadata: undefined,
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy['agent.main'].model)).toBe(true);
    expect(Object.isFrozen(policy['agent.main'].parameters.headers)).toBe(true);
  });

  it('bounds Pi provider requests without shortening domain media tasks', () => {
    const policy = resolveAgentModelPolicy({
      catalog: [
        catalogEntry('openai', 'main'),
        {
          model: { provider: 'media', id: 'image', name: 'Image' },
          execution: 'domain',
          capabilities: ['image.generate'],
          credentialState: 'ambient',
        },
      ],
      userBindings: {
        'agent.main': { providerId: 'openai', modelId: 'main' },
        'image.generate': { providerId: 'media', modelId: 'image' },
      },
      requirements: { 'image.generate': { capabilities: ['image.generate'] } },
    });

    expect(policy['agent.main'].parameters.timeoutMs).toBe(DEFAULT_PI_MODEL_REQUEST_TIMEOUT_MS);
    expect(policy['image.generate']?.parameters.timeoutMs).toBeUndefined();

    const explicit = resolveAgentPurposeModelUse({
      purpose: 'agent.main',
      catalog: [catalogEntry('openai', 'main')],
      binding: {
        providerId: 'openai',
        modelId: 'main',
        parameters: { timeoutMs: 30_000 },
      },
    });
    expect(explicit.parameters.timeoutMs).toBe(30_000);
  });

  it('applies conversation overrides by purpose without a nested hierarchy', () => {
    const policy = resolveAgentModelPolicy({
      catalog: [catalogEntry('openai', 'user-main'), catalogEntry('anthropic', 'turn-main')],
      catalogDefaults: {
        'agent.main': { providerId: 'openai', modelId: 'user-main' },
      },
      conversationOverrides: {
        'agent.main': { providerId: 'anthropic', modelId: 'turn-main' },
      },
    });

    expect(policy['agent.main'].model.provider).toBe('anthropic');
  });

  it('resolves each retained tool purpose as a separate flat immutable entry', () => {
    const policy = resolveAgentModelPolicy({
      catalog: [
        catalogEntry('openai', 'main'),
        catalogEntry('newapi', 'vision', {
          model: model('newapi', 'vision', ['text', 'image']),
          capabilities: ['image.understand'],
        }),
        catalogEntry('newapi', 'video', {
          capabilities: ['video.understand'],
        }),
      ],
      userBindings: {
        'agent.main': { providerId: 'openai', modelId: 'main' },
        'image.understand': {
          providerId: 'newapi',
          modelId: 'vision',
          parameters: { maxTokens: 1_024 },
        },
        'video.understand': { providerId: 'newapi', modelId: 'video' },
      },
      requirements: {
        'image.understand': { capabilities: ['image.understand'] },
        'video.understand': { capabilities: ['video.understand'] },
      },
    });

    expect(Object.keys(policy)).toEqual(['agent.main', 'image.understand', 'video.understand']);
    expect(policy['agent.main'].model).toMatchObject({ provider: 'openai', id: 'main' });
    expect(policy['image.understand']).toMatchObject({
      purpose: 'image.understand',
      model: { provider: 'newapi', id: 'vision' },
      parameters: { maxTokens: 1_024 },
    });
    expect(policy['video.understand']).toMatchObject({
      purpose: 'video.understand',
      model: { provider: 'newapi', id: 'video' },
    });
    expect(Object.isFrozen(policy['image.understand'])).toBe(true);
  });

  it('keeps retained product model operations as flat explicit purposes', () => {
    const policy = resolveAgentModelPolicy({
      catalog: [
        catalogEntry('openai', 'main'),
        catalogEntry('openai', 'canvas'),
        catalogEntry('local', 'embedding', {
          model: { provider: 'local', id: 'embedding', name: 'Embedding' },
          execution: 'domain',
          capabilities: ['text.embed'],
          credentialState: 'not-required',
        }),
      ],
      userBindings: {
        'agent.main': { providerId: 'openai', modelId: 'main' },
        'canvas.prompt': { providerId: 'openai', modelId: 'canvas' },
        'text.embed': { providerId: 'local', modelId: 'embedding' },
      },
      requirements: {
        'canvas.prompt': { capabilities: ['llm.chat'] },
        'text.embed': { capabilities: ['text.embed'] },
      },
    });

    expect(policy['canvas.prompt']).toMatchObject({
      purpose: 'canvas.prompt',
      execution: 'pi',
      model: { provider: 'openai', id: 'canvas' },
    });
    expect(policy['text.embed']).toMatchObject({
      purpose: 'text.embed',
      execution: 'domain',
      model: { provider: 'local', id: 'embedding' },
    });
  });

  it('keeps domain-executed generation in the same flat immutable snapshot without a fake Pi model', () => {
    const policy = resolveAgentModelPolicy({
      catalog: [
        catalogEntry('openai', 'main'),
        {
          model: { provider: 'newapi-media', id: 'image-v1', name: 'Image v1' },
          execution: 'domain',
          capabilities: ['image.generate'],
          credentialState: 'ambient',
        },
      ],
      userBindings: {
        'agent.main': { providerId: 'openai', modelId: 'main' },
        'image.generate': { providerId: 'newapi-media', modelId: 'image-v1' },
      },
      requirements: { 'image.generate': { capabilities: ['image.generate'] } },
    });

    expect(policy['image.generate']).toEqual({
      purpose: 'image.generate',
      execution: 'domain',
      model: { provider: 'newapi-media', id: 'image-v1', name: 'Image v1' },
      parameters: { metadata: undefined },
    });
    expect(Object.isFrozen(policy['image.generate']?.model)).toBe(true);
  });

  it('does not select a compatible model or main model for a missing purpose', () => {
    const policy = resolveAgentModelPolicy({
      catalog: [catalogEntry('openai', 'main'), catalogEntry('newapi', 'vision')],
      userBindings: {
        'agent.main': { providerId: 'openai', modelId: 'main' },
      },
    });

    expect(policy['image.understand']).toBeUndefined();
    expect(() => requireAgentModelUse(policy, 'image.understand')).toThrowError(
      expect.objectContaining<Partial<AgentModelPolicyError>>({ code: 'model-not-found' }),
    );
  });

  it('fails exact provider, capability, and credential checks visibly', () => {
    const vision = catalogEntry('newapi', 'vision', {
      capabilities: ['llm.chat'],
      credentialState: 'missing',
    });

    expect(() =>
      resolveAgentModelPolicy({
        catalog: [vision],
        userBindings: {
          'agent.main': { providerId: 'other', modelId: 'vision' },
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'provider-mismatch' }));
    expect(() =>
      resolveAgentModelPolicy({
        catalog: [{ ...vision, credentialState: 'configured' }],
        userBindings: {
          'agent.main': { providerId: 'newapi', modelId: 'vision' },
          'image.understand': { providerId: 'newapi', modelId: 'vision' },
        },
        requirements: {
          'image.understand': { capabilities: ['image.understand'] },
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'capability-mismatch' }));
    expect(() =>
      resolveAgentModelPolicy({
        catalog: [vision],
        userBindings: {
          'agent.main': { providerId: 'newapi', modelId: 'vision' },
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'credential-missing' }));
  });

  it('rejects legacy and unknown purpose keys instead of interpreting them', () => {
    const legacyBindings = {
      'agent.main': { providerId: 'openai', modelId: 'main' },
      'llm.chat': { providerId: 'openai', modelId: 'main' },
    };
    expect(() =>
      resolveAgentModelPolicy({
        catalog: [catalogEntry('openai', 'main')],
        userBindings: legacyBindings,
      }),
    ).toThrowError(expect.objectContaining({ code: 'unknown-purpose' }));
  });
});
