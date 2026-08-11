// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AutomationLocalRuntimeManagementProjection,
  AutomationLocalRuntimeManagementRuntime,
} from '@neko/automation-contracts/local-runtime-management';
import { AutomationLocalRuntimeManagementRoot } from './root';

vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('AutomationLocalRuntimeManagementRoot', () => {
  it('offers guide, exact authorization, recheck and disconnect without install lifecycle', async () => {
    const runtime = fixtureRuntime();
    render(
      <AutomationLocalRuntimeManagementRoot
        confirmAction={() => true}
        interactive
        runtime={runtime}
        sourceId="browser-use.observe.local"
      />,
    );

    await screen.findByText('Browser Use 0.13.7');
    expect(screen.getByText('home.capabilities.localRuntime.openGuide')).toBeTruthy();
    expect(screen.getByText('home.capabilities.localRuntime.copyCommand')).toBeTruthy();
    expect(screen.getAllByText('home.capabilities.localRuntime.authorizeAsset')).toHaveLength(2);
    expect(screen.queryByText(/install|update|uninstall/iu)).toBeNull();

    fireEvent.click(screen.getAllByText('home.capabilities.localRuntime.authorizeAsset')[0]!);
    await waitFor(() =>
      expect(runtime.authorizeAsset).toHaveBeenCalledWith(
        'browser-use.observe.local',
        'provider-runtime',
      ),
    );
  });

  it('binds recheck and disconnect to the exact opaque runtime identity', async () => {
    const runtime = fixtureRuntime(configuredProjection());
    render(
      <AutomationLocalRuntimeManagementRoot
        confirmAction={() => true}
        interactive
        runtime={runtime}
        sourceId="browser-use.observe.local"
      />,
    );

    await screen.findByText('Browser Use 0.13.7');
    fireEvent.click(screen.getByText('home.capabilities.localRuntime.recheck'));
    await waitFor(() =>
      expect(runtime.recheck).toHaveBeenCalledWith(
        'browser-use.observe.local',
        'local-runtime:browser-1',
      ),
    );
    fireEvent.click(screen.getByText('home.capabilities.localRuntime.disconnect'));
    await waitFor(() =>
      expect(runtime.disconnect).toHaveBeenCalledWith(
        'browser-use.observe.local',
        'local-runtime:browser-1',
      ),
    );
  });
});

function fixtureRuntime(
  projection: AutomationLocalRuntimeManagementProjection = missingProjection(),
): AutomationLocalRuntimeManagementRuntime {
  return {
    identity: projection.identity,
    getSnapshot: async () => projection,
    openInstallationGuide: vi.fn(async () => projection),
    copyInstallationCommand: vi.fn(async () => projection),
    authorizeAsset: vi.fn(async () => projection),
    recheck: vi.fn(async () => projection),
    disconnect: vi.fn(async () => projection),
    dispose: vi.fn(),
  };
}

function missingProjection(): AutomationLocalRuntimeManagementProjection {
  return {
    identity: { windowId: 'window-1' },
    runtimes: [
      {
        sourceId: 'browser-use.observe.local',
        displayName: 'Browser Use 0.13.7',
        providerKind: 'browser',
        installationGuideUrl: 'https://pypi.org/project/browser-use/0.13.7/',
        installationCommand: 'uvx browser-use --mcp',
        authorized: false,
        runtimeId: '',
        state: 'not-configured',
        assets: [
          {
            key: 'provider-runtime',
            label: 'Browser Use runtime',
            authorized: false,
            runtimeId: '',
            displayName: '',
            status: 'missing',
          },
          {
            key: 'browser-executable',
            label: 'Browser executable',
            authorized: false,
            runtimeId: '',
            displayName: '',
            status: 'missing',
          },
        ],
        diagnostics: [],
      },
    ],
  };
}

function configuredProjection(): AutomationLocalRuntimeManagementProjection {
  const projection = missingProjection();
  return {
    ...projection,
    runtimes: [
      {
        ...projection.runtimes[0]!,
        authorized: true,
        runtimeId: 'local-runtime:browser-1',
        state: 'error',
        diagnostics: ['provider-unavailable'],
        assets: projection.runtimes[0]!.assets.map((asset) => ({
          ...asset,
          authorized: true,
          runtimeId: `local-runtime-asset:${asset.key}`,
          displayName: asset.key === 'provider-runtime' ? 'browser-use' : 'Chromium',
          status: 'valid' as const,
        })),
      },
    ],
  };
}
