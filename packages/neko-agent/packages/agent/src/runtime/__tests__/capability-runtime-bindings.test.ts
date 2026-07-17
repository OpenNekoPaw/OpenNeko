import { describe, expect, it, vi } from 'vitest';
import {
  createCapabilityRuntimeBindingStore,
  mergeCapabilityRuntimeBindings,
} from '../capability/capability-runtime-bindings';

describe('capability-runtime-bindings', () => {
  it('stores external processor runtime as a shared capability binding', () => {
    const logger = { warn: vi.fn() };
    const store = createCapabilityRuntimeBindingStore(logger);
    const externalProcessorRuntime = { list: vi.fn() } as never;

    store.update({ externalProcessorRuntime });
    store.update({ externalProcessorRuntime: undefined });

    expect(store.get().externalProcessorRuntime).toBe(externalProcessorRuntime);
    expect(logger.warn).toHaveBeenCalledWith(
      'Ignoring undefined capability runtime binding update to avoid clearing shared singleton state.',
      expect.objectContaining({
        code: 'extension.capability-runtime.binding-update-ignored',
      }),
    );
  });

  it('stores content access runtime as a shared capability binding', () => {
    const logger = { warn: vi.fn() };
    const store = createCapabilityRuntimeBindingStore(logger);
    const contentAccessRuntime = { resolve: vi.fn() } as never;

    store.update({ contentAccessRuntime });
    store.update({ contentAccessRuntime: undefined });

    expect(store.get().contentAccessRuntime).toBe(contentAccessRuntime);
    expect(logger.warn).toHaveBeenCalledWith(
      'Ignoring undefined capability runtime binding update to avoid clearing shared singleton state.',
      expect.objectContaining({
        code: 'extension.capability-runtime.binding-update-ignored',
      }),
    );
  });
});
