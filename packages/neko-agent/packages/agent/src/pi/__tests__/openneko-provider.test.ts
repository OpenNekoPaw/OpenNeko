import { createServer } from 'node:http';

import { describe, expect, it } from 'vitest';

import { InMemoryUserCredentialPersistence, OpenNekoCredentialStore } from '../credential-store';
import {
  createOpenNekoPiModels,
  projectOpenNekoPiProvider,
  registerOpenNekoPiProvider,
  type OpenNekoPiProviderConfig,
} from '../openneko-provider';

function config(overrides: Partial<OpenNekoPiProviderConfig> = {}): OpenNekoPiProviderConfig {
  return {
    id: 'configured-provider',
    name: 'Configured Provider',
    baseUrl: 'https://api.example.invalid/v1',
    protocol: 'openai-chat',
    requiresApiKey: true,
    models: [
      {
        id: 'configured-model',
        input: ['text', 'image'],
        reasoning: true,
        contextWindow: 128_000,
        maxTokens: 8_192,
      },
    ],
    ...overrides,
  };
}

describe('OpenNeko provider projection to Pi', () => {
  it.each([
    ['newapi', 'openai-completions'],
    ['openai-chat', 'openai-completions'],
    ['openai-responses', 'openai-responses'],
    ['anthropic', 'anthropic-messages'],
    ['google', 'google-generative-ai'],
    ['ollama', 'openai-completions'],
  ] as const)('maps %s to the exact Pi API %s', (protocol, api) => {
    const projection = projectOpenNekoPiProvider(config({ protocol }));

    expect(projection.models[0]).toMatchObject({
      provider: 'configured-provider',
      id: 'configured-model',
      api,
      baseUrl: 'https://api.example.invalid/v1',
      input: ['text', 'image'],
      reasoning: true,
    });
  });

  it('registers the configured provider and resolves only its stored credential', async () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    await credentials.replace(
      'configured-provider',
      { type: 'api_key', key: 'configured-secret' },
      'user-config-import',
    );
    const models = createOpenNekoPiModels(credentials);
    const projection = registerOpenNekoPiProvider(models, config());

    const model = projection.models[0];
    if (!model) throw new Error('Expected projected model.');
    expect(models.getModel('configured-provider', 'configured-model')).toBe(model);
    await expect(models.getAuth(model)).resolves.toEqual({
      auth: { apiKey: 'configured-secret' },
      source: 'OpenNeko CredentialStore',
    });
  });

  it('allows keyless local providers but never falls back for a required key', async () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const localModels = createOpenNekoPiModels(credentials);
    const local = registerOpenNekoPiProvider(
      localModels,
      config({
        baseUrl: 'http://localhost:11434/v1',
        protocol: 'ollama',
        requiresApiKey: false,
      }),
    );
    const remoteModels = createOpenNekoPiModels(credentials);
    const remote = registerOpenNekoPiProvider(remoteModels, config());
    const localModel = local.models[0];
    const remoteModel = remote.models[0];
    if (!localModel || !remoteModel) throw new Error('Expected projected models.');

    await expect(localModels.getAuth(localModel)).resolves.toEqual({
      auth: {},
      source: 'OpenNeko keyless local provider',
    });
    await expect(remoteModels.getAuth(remoteModel)).resolves.toBeUndefined();
  });

  it.each([
    ['bearer', { headers: { authorization: 'Bearer configured-secret' } }],
    ['api-key', { headers: { 'x-api-key': 'configured-secret' } }],
    ['custom-header', { headers: { 'x-neko-key': 'configured-secret' } }],
  ] as const)(
    'projects the explicit %s credential profile without GenericAdapter',
    async (type, auth) => {
      const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
      await credentials.replace(
        'configured-provider',
        { type: 'api_key', key: 'configured-secret' },
        'user-config-import',
      );
      const models = createOpenNekoPiModels(credentials);
      const projection = registerOpenNekoPiProvider(
        models,
        config({
          auth: type === 'custom-header' ? { type, header: 'x-neko-key' } : { type },
        }),
      );
      const model = projection.models[0];
      if (!model) throw new Error('Expected projected model.');

      await expect(models.getAuth(model)).resolves.toEqual({
        auth,
        source: 'OpenNeko CredentialStore',
      });
    },
  );

  it('dispatches bearer-authenticated NewAPI chat through the OpenAI completions API', async () => {
    let authorization: string | undefined;
    const server = createServer((request, response) => {
      authorization = request.headers.authorization;
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        connection: 'keep-alive',
      });
      response.end(
        'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"configured-model","choices":[{"index":0,"delta":{"role":"assistant","content":"hello"},"finish_reason":null}]}\n\n' +
          'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"configured-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n' +
          'data: [DONE]\n\n',
      );
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('Expected a TCP test server address.');
      }
      const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
      await credentials.replace(
        'configured-provider',
        { type: 'api_key', key: 'configured-secret' },
        'user-config-import',
      );
      const models = createOpenNekoPiModels(credentials);
      const projection = registerOpenNekoPiProvider(
        models,
        config({
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          protocol: 'newapi',
          auth: { type: 'bearer' },
        }),
      );
      const model = projection.models[0];
      if (!model) throw new Error('Expected projected model.');

      const result = await models.completeSimple(model, {
        messages: [{ role: 'user', content: 'hello', timestamp: 1 }],
      });

      expect(result.stopReason).toBe('stop');
      expect(result.content).toEqual([expect.objectContaining({ type: 'text', text: 'hello' })]);
      expect(authorization).toBe('Bearer configured-secret');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('registers multiple exact models and per-model protocols under one provider', () => {
    const credentials = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const models = createOpenNekoPiModels(credentials);

    registerOpenNekoPiProvider(
      models,
      config({
        models: [
          { id: 'main', contextWindow: 128_000, maxTokens: 8_192 },
          {
            id: 'vision',
            protocol: 'openai-responses',
            input: ['text', 'image'],
            contextWindow: 64_000,
            maxTokens: 4_096,
          },
        ],
      }),
    );

    expect(models.getModel('configured-provider', 'main')).toMatchObject({
      api: 'openai-completions',
    });
    expect(models.getModel('configured-provider', 'vision')).toMatchObject({
      api: 'openai-responses',
      input: ['text', 'image'],
    });
  });

  it('fails invalid endpoints, models, and unknown protocols visibly', () => {
    const unknown = config();
    Object.defineProperty(unknown, 'protocol', { value: 'custom-oauth-chat' });

    expect(() =>
      projectOpenNekoPiProvider(config({ baseUrl: 'http://remote.invalid/v1' })),
    ).toThrow(expect.objectContaining({ code: 'invalid-endpoint' }));
    expect(() =>
      projectOpenNekoPiProvider(config({ models: [{ id: '', contextWindow: 1, maxTokens: 1 }] })),
    ).toThrow(expect.objectContaining({ code: 'invalid-model' }));
    expect(() => projectOpenNekoPiProvider(unknown)).toThrow(
      expect.objectContaining({ code: 'unsupported-protocol' }),
    );
  });
});
