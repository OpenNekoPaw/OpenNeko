import { describe, expect, it, vi } from 'vitest';
import type { AutomationLocalRuntimeAssetProjection } from '@neko/automation-contracts/local-runtime-management';
import { BROWSER_USE_OBSERVE_PROFILE } from './browser-use';
import {
  createAutomationLocalRuntimeManagementService,
  type AutomationLocalRuntimeHostInspection,
  type AutomationLocalRuntimeHostPort,
  type AutomationLocalRuntimeSourceDescriptor,
} from './local-runtime-management';

const source = {
  sourceId: 'browser-use.observe.local',
  displayName: 'Browser Use 0.13.7',
  profile: BROWSER_USE_OBSERVE_PROFILE,
  installationGuideUrl: 'https://pypi.org/project/browser-use/0.13.7/',
  installationCommand: 'uvx browser-use --mcp',
  assets: [
    { key: 'provider-runtime', label: 'Browser Use runtime' },
    { key: 'browser-executable', label: 'Browser executable' },
  ],
  expectedServer: { name: 'browser-use' },
} as const satisfies AutomationLocalRuntimeSourceDescriptor;

describe('Automation local runtime management service', () => {
  it('keeps missing authorization explicit and exposes no install/update/remove lifecycle', async () => {
    const host = memoryHost();
    const service = createAutomationLocalRuntimeManagementService({ sources: [source], host });

    await expect(service.list()).resolves.toMatchObject([
      {
        sourceId: source.sourceId,
        authorized: false,
        runtimeId: '',
        state: 'not-configured',
        assets: [
          { key: 'provider-runtime', status: 'missing' },
          { key: 'browser-executable', status: 'missing' },
        ],
      },
    ]);
    expect('install' in service || 'update' in service || 'remove' in service).toBe(false);
  });

  it('connects only the exact authorized runtime and independent browser executable', async () => {
    const host = memoryHost(compatibleInspection());
    const service = createAutomationLocalRuntimeManagementService({ sources: [source], host });

    await expect(service.list()).resolves.toMatchObject([
      {
        authorized: true,
        runtimeId: 'local-runtime:browser-1',
        state: 'ready',
        diagnostics: [],
      },
    ]);
    expect(JSON.stringify(await service.list())).not.toContain('/Users');
    expect(JSON.stringify(await service.list())).not.toContain('/Applications');
  });

  it('invalidates a changed asset without trying another source', async () => {
    const inspection = compatibleInspection();
    const host = memoryHost({
      ...inspection,
      assets: inspection.assets.map((asset) =>
        asset.key === 'provider-runtime' ? { ...asset, status: 'changed' as const } : asset,
      ),
      server: undefined,
      operations: undefined,
    });
    const service = createAutomationLocalRuntimeManagementService({ sources: [source], host });

    await expect(service.list()).resolves.toMatchObject([
      {
        state: 'error',
        diagnostics: ['asset-changed'],
      },
    ]);
    expect(host.authorizeAsset).not.toHaveBeenCalled();
    expect(Object.keys(host).sort()).toEqual([
      'authorizeAsset',
      'copyInstallationCommand',
      'disconnect',
      'inspect',
      'openInstallationGuide',
    ]);
  });

  it('binds recheck and disconnect to the current opaque runtime identity', async () => {
    const host = memoryHost(compatibleInspection());
    const service = createAutomationLocalRuntimeManagementService({ sources: [source], host });

    await expect(service.recheck(source.sourceId, 'stale')).rejects.toThrow('identity is stale');
    await expect(service.disconnect(source.sourceId, 'stale')).rejects.toThrow('identity is stale');
    await service.disconnect(source.sourceId, 'local-runtime:browser-1');
    expect(host.disconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: source.sourceId,
        runtimeId: 'local-runtime:browser-1',
      }),
    );
  });

  it('opens only the reviewed guide and delegates explicit asset authorization', async () => {
    const host = memoryHost();
    const service = createAutomationLocalRuntimeManagementService({ sources: [source], host });

    await service.openInstallationGuide(source.sourceId);
    expect(host.openInstallationGuide).toHaveBeenCalledWith({
      sourceId: source.sourceId,
      url: source.installationGuideUrl,
    });
    await service.copyInstallationCommand(source.sourceId);
    expect(host.copyInstallationCommand).toHaveBeenCalledWith({
      sourceId: source.sourceId,
      command: source.installationCommand,
    });
    await service.authorizeAsset(source.sourceId, 'provider-runtime', 'window-1');
    expect(host.authorizeAsset).toHaveBeenCalledWith({
      sourceId: source.sourceId,
      assetKey: 'provider-runtime',
      ownerId: 'window-1',
    });
  });
});

function compatibleInspection(): AutomationLocalRuntimeHostInspection {
  return {
    runtimeId: 'local-runtime:browser-1',
    assets: [
      asset('provider-runtime', 'Browser Use runtime', 'browser-use'),
      asset('browser-executable', 'Browser executable', 'Chromium'),
    ],
    server: source.expectedServer,
    operations: BROWSER_USE_OBSERVE_PROFILE.operations.map((operation) => ({
      name: operation.name,
      inputSchema: { type: 'object', properties: {} },
      annotations: {},
    })),
  };
}

function asset(
  key: AutomationLocalRuntimeAssetProjection['key'],
  label: string,
  displayName: string,
): AutomationLocalRuntimeAssetProjection {
  return {
    key,
    label,
    authorized: true,
    runtimeId: `local-runtime-asset:${key}`,
    displayName,
    status: 'valid',
  };
}

function memoryHost(
  initial?: AutomationLocalRuntimeHostInspection,
): AutomationLocalRuntimeHostPort & {
  readonly authorizeAsset: ReturnType<typeof vi.fn>;
  readonly disconnect: ReturnType<typeof vi.fn>;
  readonly openInstallationGuide: ReturnType<typeof vi.fn>;
  readonly copyInstallationCommand: ReturnType<typeof vi.fn>;
} {
  let inspection = initial;
  return {
    inspect: vi.fn(async () => inspection),
    authorizeAsset: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => {
      inspection = undefined;
    }),
    openInstallationGuide: vi.fn(async () => undefined),
    copyInstallationCommand: vi.fn(async () => undefined),
  };
}
