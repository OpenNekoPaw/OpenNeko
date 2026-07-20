import { describe, expect, it, vi } from 'vitest';

import { resolveNativeEngineModule } from './nativeEngineBinding';

describe('nativeEngineBinding', () => {
  it('resolves the Node 24 CommonJS dynamic-import namespace', () => {
    const create = vi.fn();
    const module = resolveNativeEngineModule({
      default: {
        NativeEngine: { create },
      },
    });

    expect(module.NativeEngine.create).toBe(create);
  });

  it.each([
    undefined,
    {},
    { default: {} },
    { default: { NativeEngine: {} } },
    { NativeEngine: { create: vi.fn() } },
  ])('rejects an invalid native module namespace: %j', (namespace) => {
    expect(() => resolveNativeEngineModule(namespace)).toThrow(
      'Invalid @neko-engine/host-napi module: expected default.NativeEngine.create to be a function.',
    );
  });
});
