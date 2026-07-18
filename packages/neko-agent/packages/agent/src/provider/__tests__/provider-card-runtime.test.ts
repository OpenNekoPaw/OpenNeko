import { describe, expect, it, vi } from 'vitest';
import type { IProviderCardRegistry, ProviderCard } from '@neko/shared';
import { registerRuntimeProviderCardDirectories } from '../provider-card-runtime';

describe('registerRuntimeProviderCardDirectories', () => {
  it('registers personal and project provider card directories with canonical layers', async () => {
    const personalCard = createProviderCard('personal-provider');
    const projectCard = createProviderCard('project-provider');
    const registerDirectory = vi
      .fn()
      .mockResolvedValueOnce([personalCard])
      .mockResolvedValueOnce([projectCard]);

    const result = await registerRuntimeProviderCardDirectories({
      registry: createRegistry(),
      fs: {
        readdir: vi.fn(async () => []),
        readFile: vi.fn(async () => ''),
      },
      homeDir: '/home/neko',
      workspaceRoot: '/workspace/project',
      registerDirectory,
    });

    expect(registerDirectory).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        root: '/home/neko/.neko/providers',
        sourceLayer: 'personal',
        recursive: true,
        sourceRefPrefix: '${NEKO_HOME}/providers',
      }),
    );
    expect(registerDirectory).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        root: '/workspace/project/neko/providers',
        sourceLayer: 'project',
        recursive: false,
        sourceRefPrefix: 'neko/providers',
      }),
    );
    expect(result).toEqual({
      personal: [personalCard],
      project: [projectCard],
    });
  });

  it('skips project registration when workspace root is absent', async () => {
    const registerDirectory = vi.fn(async () => []);

    await registerRuntimeProviderCardDirectories({
      registry: createRegistry(),
      fs: {
        readdir: vi.fn(async () => []),
        readFile: vi.fn(async () => ''),
      },
      homeDir: '/home/neko',
      registerDirectory,
    });

    expect(registerDirectory).toHaveBeenCalledTimes(1);
    expect(registerDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLayer: 'personal',
      }),
    );
  });

  it('logs provider card load warnings from directory callbacks', async () => {
    const logger = { warn: vi.fn() };
    const registerDirectory = vi.fn(async (options) => {
      options.onError?.({
        path: '/workspace/project/.neko/providers/demo.card.md',
        reason: 'parse-failed',
        cause: new Error('bad card'),
      });
      return [];
    });

    await registerRuntimeProviderCardDirectories({
      registry: createRegistry(),
      fs: {
        readdir: vi.fn(async () => []),
        readFile: vi.fn(async () => ''),
      },
      homeDir: '/home/neko',
      registerDirectory,
    });

    expect(logger.warn).not.toHaveBeenCalled();

    await registerRuntimeProviderCardDirectories({
      registry: createRegistry(),
      fs: {
        readdir: vi.fn(async () => []),
        readFile: vi.fn(async () => ''),
      },
      homeDir: '/home/neko',
      workspaceRoot: '/workspace/project',
      logger,
      registerDirectory,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to load provider expression card.',
      expect.objectContaining({
        code: 'extension.provider-card.load-failed',
        reason: 'parse-failed',
      }),
    );
  });
});

function createRegistry(): IProviderCardRegistry {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(),
    list: vi.fn(() => []),
    forCapability: vi.fn(() => []),
  };
}

function createProviderCard(providerId: string): ProviderCard {
  return {
    providerId,
    displayName: providerId,
    version: '1.0.0',
    sourceLayer: 'personal',
    sourceRef: `${providerId}.card.md`,
    capabilities: [],
    syntaxProfile: {
      notes: [],
    },
    conceptCoverage: {
      entries: [],
    },
    trainingProfile: {
      styleAffinities: {},
      antiBiasStrategies: [],
    },
  };
}
