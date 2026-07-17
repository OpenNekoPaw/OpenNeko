/**
 * Tests for MarketShaderService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// Mock vscode before import
vi.mock('vscode', () => ({
  EventEmitter: class {
    private listeners: Array<(e: unknown) => void> = [];
    event = (listener: (e: unknown) => void) => {
      this.listeners.push(listener);
      return {
        dispose: () => {
          this.listeners = this.listeners.filter((l) => l !== listener);
        },
      };
    };
    fire(data: unknown) {
      this.listeners.forEach((l) => l(data));
    }
    dispose() {
      this.listeners = [];
    }
  },
  extensions: {
    getExtension: vi.fn().mockReturnValue(undefined),
  },
}));

// Mock os.homedir to point to a temp dir
const mockHome = vi.hoisted(() => ({ tempHome: '' }));

vi.mock('os', async (importOriginal) => {
  const original = await importOriginal<typeof import('os')>();
  return {
    ...original,
    homedir: () => mockHome.tempHome,
  };
});

import { MarketShaderService } from '../MarketShaderService';
import type { ILogger } from '@neko/shared';

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
    level: 0,
    dispose: vi.fn(),
  } as unknown as ILogger;
}

describe('MarketShaderService', () => {
  let logger: ILogger;
  let shadersDir: string;

  beforeEach(async () => {
    mockHome.tempHome = await mkdtemp(join(tmpdir(), 'neko-market-shader-test-'));
    shadersDir = join(mockHome.tempHome, '.neko', 'shaders');
    logger = createMockLogger();
  });

  afterEach(async () => {
    await rm(mockHome.tempHome, { recursive: true, force: true });
  });

  it('initializes with empty list when no shaders directory', async () => {
    const service = new MarketShaderService(logger);
    await service.initialize();

    expect(service.marketShaders).toHaveLength(0);
    service.dispose();
  });

  it('discovers shaders in publisher/name/ structure', async () => {
    // Create shader directory structure
    const shaderDir = join(shadersDir, 'test-publisher', 'blur-shader');
    await mkdir(shaderDir, { recursive: true });
    await writeFile(join(shaderDir, 'blur.wgsl'), '// WGSL blur shader');
    await writeFile(
      join(shaderDir, 'manifest.json'),
      JSON.stringify({ name: 'Blur Shader', category: 'blur', description: 'A blur shader' }),
    );

    const service = new MarketShaderService(logger);
    await service.initialize();

    expect(service.marketShaders).toHaveLength(1);
    expect(service.marketShaders[0]!.name).toBe('Blur Shader');
    expect(service.marketShaders[0]!.category).toBe('blur');
    expect(service.marketShaders[0]!.shaderId).toBe('market:test-publisher/blur-shader/blur');
    service.dispose();
  });

  it('discovers shaders in kind/publisher/name/ structure', async () => {
    const shaderDir = join(shadersDir, 'preset', 'test-publisher', 'blur-shader');
    await mkdir(shaderDir, { recursive: true });
    await writeFile(join(shaderDir, 'blur.wgsl'), '// WGSL blur shader');

    const service = new MarketShaderService(logger);
    await service.initialize();

    expect(service.marketShaders).toHaveLength(1);
    expect(service.marketShaders[0]!.packageId).toBe('@test-publisher/blur-shader');
    expect(service.marketShaders[0]!.shaderId).toBe('market:test-publisher/blur-shader/blur');
    service.dispose();
  });

  it('handles multiple wgsl files in one package', async () => {
    const shaderDir = join(shadersDir, 'pub', 'multi');
    await mkdir(shaderDir, { recursive: true });
    await writeFile(join(shaderDir, 'pass1.wgsl'), '// pass 1');
    await writeFile(join(shaderDir, 'pass2.wgsl'), '// pass 2');

    const service = new MarketShaderService(logger);
    await service.initialize();

    expect(service.marketShaders).toHaveLength(2);
    service.dispose();
  });

  it('skips directories without wgsl files', async () => {
    const shaderDir = join(shadersDir, 'pub', 'no-shader');
    await mkdir(shaderDir, { recursive: true });
    await writeFile(join(shaderDir, 'readme.md'), 'No shader here');

    const service = new MarketShaderService(logger);
    await service.initialize();

    expect(service.marketShaders).toHaveLength(0);
    service.dispose();
  });

  it('uses package name as fallback when no manifest', async () => {
    const shaderDir = join(shadersDir, 'pub', 'my-shader');
    await mkdir(shaderDir, { recursive: true });
    await writeFile(join(shaderDir, 'effect.wgsl'), '// effect');

    const service = new MarketShaderService(logger);
    await service.initialize();

    expect(service.marketShaders).toHaveLength(1);
    expect(service.marketShaders[0]!.name).toBe('my-shader');
    expect(service.marketShaders[0]!.category).toBe('market');
    service.dispose();
  });

  it('fires onDidChange after rescan', async () => {
    const service = new MarketShaderService(logger);
    await service.initialize();

    const listener = vi.fn();
    service.onDidChange(listener);

    await service.rescan();
    expect(listener).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it('gracefully handles missing market extension', async () => {
    const vscode = await import('vscode');
    vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);

    const service = new MarketShaderService(logger);
    await service.initialize();

    // Should not throw, just log debug message
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('neko-market not available'));
    service.dispose();
  });

  it('filters enabled v4 shader and LUT preset installs by market status', async () => {
    const vscode = await import('vscode');
    const activeShaderDir = join(shadersDir, 'pub', 'active-shader');
    const lutPresetDir = join(shadersDir, 'pub', 'film-lut');
    const expiredShaderDir = join(shadersDir, 'pub', 'expired-shader');
    const nonLutPresetDir = join(shadersDir, 'pub', 'theme-preset');
    for (const dir of [activeShaderDir, lutPresetDir, expiredShaderDir, nonLutPresetDir]) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'effect.wgsl'), '// effect');
    }

    const getInstalled = vi.fn().mockResolvedValue([
      {
        packageId: '@pub/active-shader',
        installedPath: activeShaderDir,
        enabled: true,
        status: 'active',
      },
      {
        packageId: '@pub/film-lut',
        installedPath: lutPresetDir,
        enabled: true,
        status: 'deprecated',
        manifest: { typeMetadata: { type: 'preset', data: { presetKind: 'lut' } } },
      },
      {
        packageId: '@pub/expired-shader',
        installedPath: expiredShaderDir,
        enabled: true,
        status: 'expired',
      },
      {
        packageId: '@pub/theme-preset',
        installedPath: nonLutPresetDir,
        enabled: true,
        status: 'active',
        manifest: { typeMetadata: { type: 'preset', data: { presetKind: 'theme' } } },
      },
    ]);
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: true,
      exports: {
        getInstalled,
        onDidInstall: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        onDidUninstall: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        onDidEnable: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        onDidDisable: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      },
    } as never);

    const service = new MarketShaderService(logger);
    await service.initialize();

    expect(getInstalled).toHaveBeenCalledWith({ types: ['shader', 'preset'], enabledOnly: true });
    expect(service.marketShaders.map((shader) => shader.packageId).sort()).toEqual([
      '@pub/active-shader',
      '@pub/film-lut',
    ]);
    service.dispose();
  });

  it('rescans when typed market events remove a LUT preset projection', async () => {
    const vscode = await import('vscode');
    const onDidMarketPackageEvent = vi.fn().mockReturnValue({ dispose: vi.fn() });
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: true,
      exports: {
        getInstalled: vi.fn().mockResolvedValue([]),
        onDidMarketPackageEvent,
        onDidInstall: vi.fn(),
        onDidUninstall: vi.fn(),
        onDidEnable: vi.fn(),
        onDidDisable: vi.fn(),
      },
    } as never);

    const service = new MarketShaderService(logger);
    const rescan = vi.spyOn(service, 'rescan').mockResolvedValue(undefined);
    await service.initialize();
    const listener = onDidMarketPackageEvent.mock.calls[0]?.[0] as
      | ((event: unknown) => void)
      | undefined;

    listener?.({
      kind: 'uninstall',
      packageId: '@pub/film-lut',
      type: 'preset',
      manifest: { typeMetadata: { type: 'preset', data: { presetKind: 'lut' } } },
    });

    expect(rescan).toHaveBeenCalledTimes(2);
    service.dispose();
  });
});
