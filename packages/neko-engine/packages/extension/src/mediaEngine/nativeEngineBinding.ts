import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import type { NativeEngine } from '@neko-engine/host-napi';

type NativeEngineFactory = {
  create(configPath?: string | null): Promise<NativeEngine>;
};

type NativeEngineModule = {
  NativeEngine: NativeEngineFactory;
};

type NativeEngineBindingFactory = () => Promise<NativeEngine>;
type NativeEngineModuleLoader = (modulePath: string) => unknown;

let bindingFactory: NativeEngineBindingFactory | undefined;

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

export function resolveNativeEngineModule(moduleValue: unknown): NativeEngineModule {
  if (!isNativeEngineModule(moduleValue)) {
    throw new Error(
      'Invalid packaged Engine module: expected NativeEngine.create to be a function.',
    );
  }

  return moduleValue;
}

export function createNativeEngineBindingFactory(
  modulePath: string,
  loadModule?: NativeEngineModuleLoader,
): NativeEngineBindingFactory {
  if (!isAbsolute(modulePath)) {
    throw new Error(`Packaged Engine module path must be absolute: ${modulePath}`);
  }

  const moduleLoader = loadModule ?? createRequire(modulePath);

  return async () => resolveNativeEngineModule(moduleLoader(modulePath)).NativeEngine.create();
}

export function configureNativeEngineBinding(
  modulePath: string,
  loadModule?: NativeEngineModuleLoader,
): void {
  bindingFactory = createNativeEngineBindingFactory(modulePath, loadModule);
}

export async function createNativeEngineBinding(): Promise<NativeEngine> {
  if (!bindingFactory) {
    throw new Error('Packaged Engine module path was not configured during extension activation.');
  }
  return bindingFactory();
}
