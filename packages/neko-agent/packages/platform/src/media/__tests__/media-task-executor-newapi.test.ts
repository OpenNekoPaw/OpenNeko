import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryTaskStorage, TaskManager } from '@neko/agent';
import type { ConfigManager } from '../../config/config-manager';
import type { Model, Provider } from '../../types/provider';
import { createMediaTaskInput, MediaTaskExecutor } from '../media-task-executor';

const OWNER = {
  conversationId: 'conv-newapi-image',
  runId: 'run-newapi-image',
  parentRunId: 'run-newapi-image',
} as const;

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

describe('MediaTaskExecutor NewAPI image materialization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('materializes inline image bytes without a detached remote URL fetch', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://newapi.example.test/v1/images/generations') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const image =
          body['response_format'] === 'b64_json'
            ? { b64_json: PNG_BASE64 }
            : { url: 'https://assets.example.test/generated.png' };
        return new Response(JSON.stringify({ created: 1, data: [image] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url === 'https://assets.example.test/generated.png') {
        throw Object.assign(new TypeError('fetch failed'), {
          cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }),
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const storage = new MemoryTaskStorage();
    const manager = new TaskManager({ storage, cleanupIntervalMs: 0 });
    const executor = new MediaTaskExecutor(createConfigManager());
    executor.registerWith(manager);

    const taskId = await manager.submit(
      createMediaTaskInput('text-to-image', 'nekoapi-media', 'nekoapi-image', {
        prompt: 'two cats playing',
        width: 1024,
        height: 1024,
      }),
      OWNER,
    );
    const task = await manager.waitForCompletion(taskId, 5_000);

    expect(task.status).toBe('completed');
    expect(task.output?.data).toMatchObject({
      outputs: [
        {
          type: 'image',
          url: `data:image/png;base64,${PNG_BASE64}`,
          mimeType: 'image/png',
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      response_format: 'b64_json',
    });
  });

  it('does not resubmit when the synchronous generation outcome is unknown', async () => {
    const transportCause = Object.assign(new Error('other side closed'), {
      code: 'UND_ERR_SOCKET',
    });
    const fetchMock = vi.fn(async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: transportCause });
    });
    vi.stubGlobal('fetch', fetchMock);

    const storage = new MemoryTaskStorage();
    const manager = new TaskManager({ storage, cleanupIntervalMs: 0 });
    const executor = new MediaTaskExecutor(createConfigManager());
    executor.registerWith(manager);

    const taskId = await manager.submit(
      createMediaTaskInput('text-to-image', 'nekoapi-media', 'nekoapi-image', {
        prompt: 'two cats playing',
        width: 1024,
        height: 1024,
      }),
      OWNER,
    );
    const task = await manager.waitForCompletion(taskId, 5_000);

    expect(task.status).toBe('failed');
    expect(task.error).toContain('outcome is unknown');
    expect(task.error).toContain('RELAY_TIMEOUT');
    expect(task.error).toContain('must not be retried automatically');
    expect(task.output?.failure).toEqual({
      code: 'NEWAPI_IMAGE_OUTCOME_UNKNOWN',
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function createConfigManager(): ConfigManager {
  const provider: Provider = {
    id: 'nekoapi-media',
    name: 'Neko API Media',
    displayName: 'Neko API Media',
    type: 'newapi',
    apiUrl: 'https://newapi.example.test/v1',
    apiKey: 'test-key',
    enabled: true,
  };
  const model: Model = {
    id: 'nekoapi-image',
    name: 'gpt-image-2',
    displayName: 'GPT Image 2',
    providerId: provider.id,
    capabilities: ['text_to_image'],
    enabled: true,
  };
  return {
    getProvider: (id: string) => (id === provider.id ? provider : undefined),
    getModel: (id: string) => (id === model.id ? model : undefined),
  } as unknown as ConfigManager;
}
