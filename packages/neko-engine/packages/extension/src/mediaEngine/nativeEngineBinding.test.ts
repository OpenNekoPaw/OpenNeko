import { describe, expect, it, vi } from 'vitest';

import { createNativeEngineBindingFactory, resolveNativeEngineModule } from './nativeEngineBinding';

describe('nativeEngineBinding', () => {
  it('resolves the packaged CommonJS module value', () => {
    const create = vi.fn();
    const module = resolveNativeEngineModule({
      NativeEngine: { create },
    });

    expect(module.NativeEngine.create).toBe(create);
  });

  it.each([
    undefined,
    {},
    { default: {} },
    { default: { NativeEngine: {} } },
    { default: { NativeEngine: { create: vi.fn() } } },
  ])('rejects an invalid native module namespace: %j', (namespace) => {
    expect(() => resolveNativeEngineModule(namespace)).toThrow(
      'Invalid packaged Engine module: expected NativeEngine.create to be a function.',
    );
  });

  it('loads only the configured absolute packaged path', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'engine' });
    const loadModule = vi.fn(() => ({ NativeEngine: { create } }));
    const createBinding = createNativeEngineBindingFactory(
      '/extension/dist/features/neko-engine/packages/host-napi/loader.js',
      loadModule,
    );

    await expect(createBinding()).resolves.toEqual({ id: 'engine' });
    expect(loadModule).toHaveBeenCalledWith(
      '/extension/dist/features/neko-engine/packages/host-napi/loader.js',
    );
    expect(create).toHaveBeenCalledOnce();
  });

  it('rejects a relative packaged module path', () => {
    expect(() => createNativeEngineBindingFactory('packages/host-napi/loader.js')).toThrow(
      'Packaged Engine module path must be absolute',
    );
  });
});
