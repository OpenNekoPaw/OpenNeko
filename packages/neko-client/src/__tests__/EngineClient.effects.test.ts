import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineClient } from '../EngineClient';

function mockDispatchResponse(data: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'req-1', status: 'ok', data }),
  } as Response);
}

function lastDispatchBody(): Record<string, unknown> {
  const calls = vi.mocked(globalThis.fetch).mock.calls;
  const call = calls[calls.length - 1];
  if (!call) {
    throw new Error('fetch was not called');
  }
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('EngineClient effect discovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches effects:list-capabilities', async () => {
    mockDispatchResponse([
      {
        id: 'gaussian-blur',
        kind: 'shader',
        source: 'built-in',
        name: 'Gaussian Blur',
        gpuAccelerated: true,
        params: [],
      },
    ]);
    const client = new EngineClient(7788);

    await expect(client.listEffectCapabilities()).resolves.toEqual([
      {
        id: 'gaussian-blur',
        kind: 'shader',
        source: 'built-in',
        name: 'Gaussian Blur',
        gpuAccelerated: true,
        params: [],
      },
    ]);
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'effects',
        action: 'list-capabilities',
        options: {},
      }),
    );
  });

  it('registers user WGSL effects through the retained effects group', async () => {
    mockDispatchResponse(null);
    const client = new EngineClient(7788);

    await client.registerShader('custom-blur', '@compute @workgroup_size(16, 16) fn main() {}');

    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'effects',
        action: 'register',
        options: {
          id: 'custom-blur',
          code: '@compute @workgroup_size(16, 16) fn main() {}',
          params: [],
        },
      }),
    );
  });
});
