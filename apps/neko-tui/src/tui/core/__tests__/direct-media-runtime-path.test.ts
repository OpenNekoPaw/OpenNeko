import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
  coordinatorDispose: vi.fn(async () => undefined),
  coordinatorRecovery: vi.fn(async () => undefined),
  deliveryDispose: vi.fn(),
  metadataDispose: vi.fn(async () => undefined),
  migrateNamespace: vi.fn(async () => undefined),
  platformDispose: vi.fn(),
}));

vi.mock('@neko/agent', () => ({
  ToolRegistry: class ToolRegistry {},
}));

vi.mock('@neko/generation', () => ({
  createPersistentGenerationJobStore: vi.fn(() => ({})),
  GENERATION_JOB_MIGRATIONS: [],
  GenerationJobCoordinator: class GenerationJobCoordinator {
    recoverPersistedGenerationJobs = runtimeMocks.coordinatorRecovery;
    dispose = runtimeMocks.coordinatorDispose;
    submitGeneration = vi.fn();
    observeGeneration = vi.fn();
  },
}));

vi.mock('@neko/platform', () => ({
  createResourceCacheGeneratedAssetIndex: vi.fn(async () => ({
    index: {},
    migrationReport: { sourceStatus: 'missing' },
  })),
}));

vi.mock('../platform-bootstrap', () => ({
  createCLIPlatform: vi.fn(() => ({
    platform: {
      media: {},
      dispose: runtimeMocks.platformDispose,
    },
  })),
}));

vi.mock('../../host/tui-local-metadata-binding', () => ({
  createTuiLocalMetadataBinding: vi.fn(async () => ({
    workspaceId: 'workspace-1',
    resourceCacheManifestStore: {},
    metadataStore: {
      migrateNamespace: runtimeMocks.migrateNamespace,
    },
    dispose: runtimeMocks.metadataDispose,
  })),
}));

vi.mock('../../host/node-media-generation-delivery-host', () => ({
  NodeMediaGenerationDeliveryHost: class NodeMediaGenerationDeliveryHost {
    dispose = runtimeMocks.deliveryDispose;
    deliverMediaGeneration = vi.fn();
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  runtimeMocks.coordinatorRecovery.mockResolvedValue(undefined);
  runtimeMocks.migrateNamespace.mockResolvedValue(undefined);
});

describe('direct media runtime production path', () => {
  it('uses the persistent Generation store and startup recovery without an in-memory fallback', async () => {
    const source = await readFile(
      fileURLToPath(new URL('../direct-media-runtime.ts', import.meta.url)),
      'utf8',
    );

    expect(source).toContain('createPersistentGenerationJobStore');
    expect(source).toContain('GENERATION_JOB_MIGRATIONS');
    expect(source).toContain('recoverPersistedGenerationJobs');
    expect(source).toContain("from '@neko/generation'");
    expect(source).not.toMatch(/GenerationJob[^;]+from '@neko\/platform'/s);
    expect(source).toContain('disposeDirectMediaResources');
    expect(source).toContain('Direct media runtime initialization and cleanup failed.');
    expect(source).not.toContain('createInMemoryGenerationJobStore');
    expect(source).not.toContain('TaskManager');
    expect(source).not.toContain('TaskRef');
  });

  it('disposes every acquired owner when persisted Job recovery fails', async () => {
    const recoveryError = new Error('recovery failed');
    runtimeMocks.coordinatorRecovery.mockRejectedValueOnce(recoveryError);
    const { createDirectMediaRuntime } = await import('../direct-media-runtime');

    await expect(
      createDirectMediaRuntime({
        workDir: '/workspace',
        localMetadataHome: '/metadata-home',
      }),
    ).rejects.toBe(recoveryError);

    expect(runtimeMocks.coordinatorDispose).toHaveBeenCalledOnce();
    expect(runtimeMocks.deliveryDispose).toHaveBeenCalledOnce();
    expect(runtimeMocks.platformDispose).toHaveBeenCalledOnce();
    expect(runtimeMocks.metadataDispose).toHaveBeenCalledOnce();
  });
});
