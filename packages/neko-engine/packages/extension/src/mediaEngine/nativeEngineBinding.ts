import type { NativeEngine } from '@neko-engine/host-napi';

type NativeEngineFactory = {
  create(configPath?: string | null): Promise<NativeEngine>;
};

type NativeEngineModule = {
  NativeEngine: NativeEngineFactory;
};

function isPropertyContainer(value: unknown): value is Record<PropertyKey, unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function isNativeEngineModule(value: unknown): value is NativeEngineModule {
  if (!isPropertyContainer(value)) {
    return false;
  }

  const nativeEngine = value.NativeEngine;
  return isPropertyContainer(nativeEngine) && typeof nativeEngine.create === 'function';
}

export function resolveNativeEngineModule(namespace: unknown): NativeEngineModule {
  if (!isPropertyContainer(namespace) || !isNativeEngineModule(namespace.default)) {
    throw new Error(
      'Invalid @neko-engine/host-napi module: expected default.NativeEngine.create to be a function.',
    );
  }

  return namespace.default;
}

export async function createNativeEngineBinding(): Promise<NativeEngine> {
  const namespace: unknown = await import('@neko-engine/host-napi');
  return resolveNativeEngineModule(namespace).NativeEngine.create();
}
