import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: undefined },
  env: { language: 'zh-cn' },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
}));

const bootstrapLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const activateMock = vi.fn();
const disposeMock = vi.fn();
const discoveryDeps: unknown[] = [];
const registerRuntimeProviderCardDirectoriesMock = vi.fn(() =>
  Promise.resolve({ market: [], project: [] }),
);

function createMockCapabilityRuntimeBindingStore(logger: {
  warn: (message: string, data?: unknown) => void;
}) {
  let bindings: Record<string, unknown> = {};
  const update = (next: Record<string, unknown>) => {
    const merged = { ...bindings };
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) {
        if (merged[key] !== undefined) {
          logger.warn(
            'Ignoring undefined capability runtime binding update to avoid clearing shared singleton state.',
            {
              code: 'extension.capability-runtime.binding-update-ignored',
              reason: 'undefined-value-ignored',
              message:
                'Ignoring undefined capability runtime binding update to avoid clearing shared singleton state.',
              context: { binding: key },
            },
          );
        }
        continue;
      }
      merged[key] = value;
    }
    bindings = merged;
    return bindings;
  };
  return {
    get: () => bindings,
    update,
  };
}

vi.mock('@neko/agent', () => ({
  ProviderCardRegistry: class ProviderCardRegistry {
    readonly id = 'default-provider-card-registry';
  },
  ToolCategoryRegistry: class ToolCategoryRegistry {
    readonly id = 'default-tool-category-registry';
  },
  registerRuntimeProviderCardDirectories: registerRuntimeProviderCardDirectoriesMock,
}));

vi.mock('@neko/agent/runtime', () => ({
  createCapabilityRuntimeBindingStore: createMockCapabilityRuntimeBindingStore,
}));

vi.mock('../../base', () => ({
  getLogger: () => bootstrapLogger,
}));

vi.mock('../../services/capabilityDiscoveryService', () => ({
  CapabilityDiscoveryService: class {
    constructor(deps: unknown) {
      discoveryDeps.push(deps);
    }
    activate = activateMock;
    dispose = disposeMock;
  },
}));

describe('capabilityBootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    activateMock.mockReset();
    disposeMock.mockReset();
    bootstrapLogger.info.mockReset();
    bootstrapLogger.warn.mockReset();
    bootstrapLogger.error.mockReset();
    bootstrapLogger.debug.mockReset();
    discoveryDeps.length = 0;
    registerRuntimeProviderCardDirectoriesMock.mockClear();
  });

  it('reuses canonical capability registries when a later bootstrap omits them', async () => {
    const module = await import('../capabilityBootstrap');

    const toolRegistry = {
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => []),
    } as never;
    const toolCategoryRegistry = { id: 'tool-category-registry-a' } as never;
    const providerCardRegistry = { id: 'provider-card-registry-a' } as never;
    const context = { subscriptions: [] } as never;

    module.bootstrapCapabilities(
      {
        toolRegistry,
        toolCategoryRegistry,
        providerCardRegistry,
      },
      context,
    );

    module.bootstrapCapabilities(
      {
        toolRegistry,
      },
      { subscriptions: [] } as never,
    );

    expect(module.getCapabilityRuntimeBindings()).toEqual(
      expect.objectContaining({
        toolCategoryRegistry,
        providerCardRegistry,
      }),
    );
    expect(bootstrapLogger.warn).not.toHaveBeenCalled();
  });

  it('creates and shares a ProviderCardRegistry when none is provided', async () => {
    const module = await import('../capabilityBootstrap');
    const toolRegistry = {
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => []),
    } as never;

    module.bootstrapCapabilities(
      {
        toolRegistry,
      },
      { subscriptions: [] } as never,
    );

    const bindings = module.getCapabilityRuntimeBindings();
    expect(bindings.providerCardRegistry).toBeDefined();
    expect(discoveryDeps[0]).toEqual(
      expect.objectContaining({
        providerCardRegistry: bindings.providerCardRegistry,
      }),
    );
  });

  it('delegates provider card directory registration to the agent runtime', async () => {
    const module = await import('../capabilityBootstrap');
    const toolRegistry = {
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => []),
    } as never;

    module.bootstrapCapabilities(
      {
        toolRegistry,
        workspaceRoot: '/workspace/project',
      },
      { subscriptions: [] } as never,
    );

    expect(registerRuntimeProviderCardDirectoriesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: '/workspace/project',
      }),
    );
  });
});
