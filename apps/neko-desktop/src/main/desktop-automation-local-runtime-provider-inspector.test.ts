import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createDesktopAutomationLocalRuntimeProviderInspector } from './desktop-automation-local-runtime-provider-inspector';

describe('Desktop Automation local runtime provider inspector', () => {
  it('accepts Browser Use only through both exact authorized assets', async () => {
    const inspectProvider = vi.fn(async () => ({
      server: { name: 'browser-use', version: '0.1.0' },
      tools: [
        {
          name: 'browser_get_state',
          inputSchema: { type: 'object', properties: {} },
          annotations: { readOnlyHint: true },
        },
      ],
    }));
    const createBrowserFactory = vi.fn(() => ({ inspectProvider }));
    const inspect = createDesktopAutomationLocalRuntimeProviderInspector({
      storageRoot: '/host/user-data/automation',
      platform: 'darwin',
      createBrowserFactory,
      createCuaFactory: vi.fn(),
    });

    await expect(
      inspect({
        sourceId: 'browser-use.observe.local',
        runtimeId: 'local-runtime:browser',
        assets: {
          'provider-runtime': '/authorized/python/bin/browser-use',
          'browser-executable': '/authorized/browser/Chromium',
        },
      }),
    ).resolves.toMatchObject({
      server: { name: 'browser-use' },
      operations: [{ name: 'browser_get_state', annotations: { readOnlyHint: true } }],
    });
    expect(createBrowserFactory).toHaveBeenCalledWith({
      executablePath: '/authorized/python/bin/browser-use',
      browserExecutablePath: '/authorized/browser/Chromium',
      storageRoot: '/host/user-data/automation/browser-use',
    });
  });

  it('derives only the app-owned Cua executable from the fixed authorized bundle', async () => {
    const inspectProvider = vi.fn(async () => ({
      server: { name: 'cua-driver', version: '0.19.2' },
      tools: [{ name: 'verify_state', inputSchema: { type: 'object' } }],
    }));
    const createCuaFactory = vi.fn(() => ({ inspectProvider }));
    const inspect = createDesktopAutomationLocalRuntimeProviderInspector({
      storageRoot: '/host/user-data/automation',
      platform: 'darwin',
      createBrowserFactory: vi.fn(),
      createCuaFactory,
    });

    await inspect({
      sourceId: 'computer-use.observe.local',
      runtimeId: 'local-runtime:cua',
      assets: { 'provider-runtime': '/Applications/CuaDriver.app' },
    });

    expect(createCuaFactory).toHaveBeenCalledWith({
      appBundlePath: '/Applications/CuaDriver.app',
      executablePath: path.join('/Applications/CuaDriver.app', 'Contents', 'MacOS', 'cua-driver'),
      storageRoot: '/host/user-data/automation/cua-driver',
      platform: 'darwin',
    });
  });

  it('does not infer a missing asset or alternate local source', async () => {
    const inspect = createDesktopAutomationLocalRuntimeProviderInspector({
      storageRoot: '/host/user-data/automation',
      createBrowserFactory: vi.fn(),
      createCuaFactory: vi.fn(),
    });
    await expect(
      inspect({
        sourceId: 'browser-use.observe.local',
        runtimeId: 'local-runtime:missing-browser',
        assets: { 'provider-runtime': '/authorized/browser-use' },
      }),
    ).rejects.toThrow("asset 'browser-executable' is unavailable");
    await expect(
      inspect({
        sourceId: 'unknown.local',
        runtimeId: 'local-runtime:unknown',
        assets: {},
      }),
    ).rejects.toThrow("source 'unknown.local' is unavailable");
  });
});
