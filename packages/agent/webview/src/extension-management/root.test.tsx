// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentExtensionManagementProjection,
  AgentExtensionManagementRuntime,
} from '@neko/agent-contracts/extension-management';
import {
  AgentExtensionManagementRoot,
  searchAndOrderAgentExtensions,
  searchAndOrderAgentSkills,
} from './root';

vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('AgentExtensionManagementRoot', () => {
  it('keeps filtering and ordering package-owned and deterministic', () => {
    expect(
      searchAndOrderAgentSkills([skill('Video', 'plugin'), skill('Audio', 'personal')], '').map(
        (item) => item.name,
      ),
    ).toEqual(['Audio', 'Video']);
    expect(
      searchAndOrderAgentExtensions(
        [
          extension('github@openneko', 'GitHub', false),
          extension('computer-use@openneko', 'Computer Use', true),
        ],
        '',
      ).map((item) => item.id),
    ).toEqual(['computer-use@openneko', 'github@openneko']);
  });

  it('renders an explicit empty state for the active catalog', async () => {
    const identity = { windowId: 'window-1' };
    const runtime: AgentExtensionManagementRuntime = {
      identity,
      getSnapshot: async () => ({
        identity,
        operations: [],
        skills: [],
        skillDiscovery: { diagnostics: [], duplicateCount: 0 },
        extensions: [],
        extensionDiscovery: { diagnostics: [] },
      }),
      installPlugin: vi.fn(),
      updatePlugin: vi.fn(),
      cancelPluginOperation: vi.fn(),
      enablePlugin: vi.fn(),
      disablePlugin: vi.fn(),
      removePlugin: vi.fn(),
      refreshMarketplaces: vi.fn(),
      installPersonalSkill: vi.fn(),
      removePersonalSkill: vi.fn(),
      dispose: vi.fn(),
    };

    render(
      <AgentExtensionManagementRoot confirmAction={() => true} interactive runtime={runtime} />,
    );

    await waitFor(() => expect(screen.getByText('home.capabilities.noSkills')).toBeTruthy());
    const emptyState = document.querySelector('[data-neko-empty-state="fill"]');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.querySelector('svg')).not.toBeNull();
    expect(emptyState?.closest('.management-surface-list')?.getAttribute('data-empty')).toBe(
      'true',
    );
    expect(document.querySelector('.management-surface-empty')).toBeNull();
  });

  it('reconstructs with default tab and query instead of retaining a management page', async () => {
    const identity = { windowId: 'window-1' };
    const runtime: AgentExtensionManagementRuntime = {
      identity,
      getSnapshot: async () => ({
        identity,
        operations: [],
        skills: [skill('Audio', 'personal')],
        skillDiscovery: { diagnostics: [], duplicateCount: 0 },
        extensions: [extension('github@openneko', 'GitHub', false)],
        extensionDiscovery: { diagnostics: [] },
      }),
      installPlugin: vi.fn(),
      updatePlugin: vi.fn(),
      cancelPluginOperation: vi.fn(),
      enablePlugin: vi.fn(),
      disablePlugin: vi.fn(),
      removePlugin: vi.fn(),
      refreshMarketplaces: vi.fn(),
      installPersonalSkill: vi.fn(),
      removePersonalSkill: vi.fn(),
      dispose: vi.fn(),
    };
    const first = render(
      <AgentExtensionManagementRoot confirmAction={() => true} interactive runtime={runtime} />,
    );
    await screen.findAllByText('Audio');
    fireEvent.change(screen.getByRole('textbox', { name: 'home.capabilities.search' }), {
      target: { value: 'github' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.extensions' }));
    expect(
      screen
        .getByRole('button', { name: 'home.capabilities.extensions' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    first.unmount();

    render(
      <AgentExtensionManagementRoot confirmAction={() => true} interactive runtime={runtime} />,
    );
    await screen.findAllByText('Audio');
    expect(
      screen.getByRole<HTMLInputElement>('textbox', { name: 'home.capabilities.search' }).value,
    ).toBe('');
    expect(
      screen.getByRole('button', { name: 'home.capabilities.skills' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('keeps configuration absent until the user selects an exact item', async () => {
    const identity = { windowId: 'window-1' };
    const onDetailVisibilityChange = vi.fn();
    const runtime: AgentExtensionManagementRuntime = {
      identity,
      getSnapshot: async () => ({
        identity,
        operations: [],
        skills: [skill('Audio', 'personal')],
        skillDiscovery: { diagnostics: [], duplicateCount: 0 },
        extensions: [extension('github@openneko', 'GitHub', false)],
        extensionDiscovery: { diagnostics: [] },
      }),
      installPlugin: vi.fn(),
      updatePlugin: vi.fn(),
      cancelPluginOperation: vi.fn(),
      enablePlugin: vi.fn(),
      disablePlugin: vi.fn(),
      removePlugin: vi.fn(),
      refreshMarketplaces: vi.fn(),
      installPersonalSkill: vi.fn(),
      removePersonalSkill: vi.fn(),
      dispose: vi.fn(),
    };

    render(
      <AgentExtensionManagementRoot
        confirmAction={() => true}
        interactive
        onDetailVisibilityChange={onDetailVisibilityChange}
        renderDetail={({ content }) => <div data-testid="configuration">{content}</div>}
        runtime={runtime}
      />,
    );

    const audio = await screen.findByRole('option', { name: /Audio/u });
    expect(audio.getAttribute('aria-selected')).toBe('false');
    expect(screen.queryByTestId('configuration')).toBeNull();
    expect(onDetailVisibilityChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(audio);
    expect(audio.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByTestId('configuration')).toBeTruthy();
    expect(onDetailVisibilityChange).toHaveBeenLastCalledWith(true);
  });

  it('preserves exact selection while switching between grid and list presentations', async () => {
    const identity = { windowId: 'window-1' };
    const runtime: AgentExtensionManagementRuntime = {
      identity,
      getSnapshot: async () => ({
        identity,
        operations: [],
        skills: [skill('Audio', 'personal'), skill('Video', 'plugin')],
        skillDiscovery: { diagnostics: [], duplicateCount: 0 },
        extensions: [extension('github@openneko', 'GitHub', false)],
        extensionDiscovery: { diagnostics: [] },
      }),
      installPlugin: vi.fn(),
      updatePlugin: vi.fn(),
      cancelPluginOperation: vi.fn(),
      enablePlugin: vi.fn(),
      disablePlugin: vi.fn(),
      removePlugin: vi.fn(),
      refreshMarketplaces: vi.fn(),
      installPersonalSkill: vi.fn(),
      removePersonalSkill: vi.fn(),
      dispose: vi.fn(),
    };

    render(
      <AgentExtensionManagementRoot
        confirmAction={() => true}
        interactive
        renderDetail={({ content, tab }) => (
          <div data-testid="configuration" data-tab={tab}>
            {content}
          </div>
        )}
        runtime={runtime}
      />,
    );

    const video = await screen.findByRole('option', { name: /Video/u });
    fireEvent.click(video);
    expect(video.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.view.list' }));
    expect(
      document.querySelector('.agent-extension-management-root')?.getAttribute('data-catalog-view'),
    ).toBe('list');
    expect(screen.getByRole('option', { name: /Video/u }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByTestId('configuration').getAttribute('data-tab')).toBe('skills');
    expect(screen.queryByText('home.capabilities.detail.agentStatus')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.extensions' }));
    expect(screen.queryByTestId('configuration')).toBeNull();
    fireEvent.click(await screen.findByRole('option', { name: /GitHub/u }));
    expect(screen.getByTestId('configuration').getAttribute('data-tab')).toBe('extensions');
    expect(await screen.findByText('home.capabilities.detail.agentStatus')).toBeTruthy();
  });

  it('shows unavailable automation qualification without exposing an install action', async () => {
    const identity = { windowId: 'window-1' };
    const browserUse = {
      ...extension('browser-use@openneko', 'Browser Use', false),
      version: '0.13.7',
      canInstall: false,
      deliverySource: '' as const,
      artifactPlatform: '',
      downloadSizeBytes: 0,
      artifactStatus: 'unavailable' as const,
      agentStatus: 'unsupported' as const,
      runtimeDiagnosticCode: 'artifact-unavailable',
      mcpServerIds: ['browser-use'],
      declaredPermissions: ['browser-observe', 'screen-content'],
    };
    const runtime: AgentExtensionManagementRuntime = {
      identity,
      getSnapshot: async () => ({
        identity,
        operations: [],
        skills: [],
        skillDiscovery: { diagnostics: [], duplicateCount: 0 },
        extensions: [browserUse],
        extensionDiscovery: { diagnostics: [] },
      }),
      installPlugin: vi.fn(),
      updatePlugin: vi.fn(),
      cancelPluginOperation: vi.fn(),
      enablePlugin: vi.fn(),
      disablePlugin: vi.fn(),
      removePlugin: vi.fn(),
      refreshMarketplaces: vi.fn(),
      installPersonalSkill: vi.fn(),
      removePersonalSkill: vi.fn(),
      dispose: vi.fn(),
    };

    render(
      <AgentExtensionManagementRoot confirmAction={() => true} interactive runtime={runtime} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'home.capabilities.extensions' }));
    fireEvent.click(await screen.findByRole('option', { name: /Browser Use/u }));
    expect(
      screen.getByText(/home\.capabilities\.runtimeDiagnostic\.artifact-unavailable/u),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'home.capabilities.install' })).toBeNull();
    expect(runtime.installPlugin).not.toHaveBeenCalled();
  });

  it('requires confirmation and invokes the exact reviewed update action', async () => {
    const identity = { windowId: 'window-1' };
    const candidate = {
      ...extension('browser-use@openneko', 'Browser Use', true),
      enabled: false,
      canDisable: false,
      canRemove: true,
      canUpdate: true,
      updatePackageRelease: '0.13.8',
      agentStatus: 'disabled' as const,
      qualificationStatus: 'unqualified' as const,
    };
    const runtime: AgentExtensionManagementRuntime = {
      identity,
      getSnapshot: async () => ({
        identity,
        operations: [],
        skills: [],
        skillDiscovery: { diagnostics: [], duplicateCount: 0 },
        extensions: [candidate],
        extensionDiscovery: { diagnostics: [] },
      }),
      installPlugin: vi.fn(),
      updatePlugin: vi.fn(),
      cancelPluginOperation: vi.fn(),
      enablePlugin: vi.fn(),
      disablePlugin: vi.fn(),
      removePlugin: vi.fn(),
      refreshMarketplaces: vi.fn(),
      installPersonalSkill: vi.fn(),
      removePersonalSkill: vi.fn(),
      dispose: vi.fn(),
    };
    const confirmAction = vi.fn(() => true);

    render(
      <AgentExtensionManagementRoot confirmAction={confirmAction} interactive runtime={runtime} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'home.capabilities.extensions' }));
    fireEvent.click(await screen.findByRole('option', { name: /Browser Use/u }));
    expect(screen.getByText(/home\.capabilities\.deliverySource\.official-download/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.update' }));

    await waitFor(() => expect(runtime.updatePlugin).toHaveBeenCalledWith('browser-use@openneko'));
    expect(confirmAction).toHaveBeenCalledOnce();
  });

  it('reprojects a Main-owned artifact operation after mount and cancels its exact identity', async () => {
    const identity = { windowId: 'window-1' };
    let cancelled = false;
    const cancelPluginOperation = vi.fn(async () => {
      cancelled = true;
    });
    const runtime: AgentExtensionManagementRuntime = {
      identity,
      getSnapshot: vi.fn(async (): Promise<AgentExtensionManagementProjection> => ({
        identity,
        operations: [
          {
            operationId: 'artifact-operation-1',
            pluginId: 'browser-use@openneko',
            kind: 'install',
            phase: cancelled ? ('cancelling' as const) : ('downloading' as const),
            status: cancelled ? ('cancelled' as const) : ('active' as const),
            transferredBytes: 64,
            totalBytes: 128,
            canCancel: !cancelled,
            diagnosticCode: cancelled ? ('cancelled' as const) : ('' as const),
          },
        ],
        skills: [],
        skillDiscovery: { diagnostics: [], duplicateCount: 0 },
        extensions: [extension('browser-use@openneko', 'Browser Use', true)],
        extensionDiscovery: { diagnostics: [] },
      })),
      installPlugin: vi.fn(),
      updatePlugin: vi.fn(),
      cancelPluginOperation,
      enablePlugin: vi.fn(),
      disablePlugin: vi.fn(),
      removePlugin: vi.fn(),
      refreshMarketplaces: vi.fn(),
      installPersonalSkill: vi.fn(),
      removePersonalSkill: vi.fn(),
      dispose: vi.fn(),
    };
    const view = render(
      <AgentExtensionManagementRoot confirmAction={() => true} interactive runtime={runtime} />,
    );

    expect(screen.queryByRole('button', { name: 'home.capabilities.cancelOperation' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'home.capabilities.extensions' }));
    fireEvent.click(await screen.findByRole('option', { name: /Browser Use/u }));

    fireEvent.click(
      await screen.findByRole('button', { name: 'home.capabilities.cancelOperation' }),
    );
    await waitFor(() => expect(cancelPluginOperation).toHaveBeenCalledWith('artifact-operation-1'));
    view.unmount();
  });

  it('starts polling as soon as install is submitted so the same Root can cancel it', async () => {
    const identity = { windowId: 'window-1' };
    let started = false;
    const installPlugin = vi.fn(async () => {
      started = true;
      await new Promise<void>(() => undefined);
    });
    const runtime: AgentExtensionManagementRuntime = {
      identity,
      getSnapshot: vi.fn(async () => ({
        identity,
        operations: started
          ? [
              {
                operationId: 'artifact-operation-2',
                pluginId: 'browser-use@openneko',
                kind: 'install' as const,
                phase: 'downloading' as const,
                status: 'active' as const,
                transferredBytes: 32,
                totalBytes: 128,
                canCancel: true,
                diagnosticCode: '' as const,
              },
            ]
          : [],
        skills: [],
        skillDiscovery: { diagnostics: [], duplicateCount: 0 },
        extensions: [extension('browser-use@openneko', 'Browser Use', false)],
        extensionDiscovery: { diagnostics: [] },
      })),
      installPlugin,
      updatePlugin: vi.fn(),
      cancelPluginOperation: vi.fn(),
      enablePlugin: vi.fn(),
      disablePlugin: vi.fn(),
      removePlugin: vi.fn(),
      refreshMarketplaces: vi.fn(),
      installPersonalSkill: vi.fn(),
      removePersonalSkill: vi.fn(),
      dispose: vi.fn(),
    };
    const view = render(
      <AgentExtensionManagementRoot confirmAction={() => true} interactive runtime={runtime} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'home.capabilities.extensions' }));
    fireEvent.click(await screen.findByRole('option', { name: /Browser Use/u }));
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.install' }));

    await waitFor(() => expect(installPlugin).toHaveBeenCalledWith('browser-use@openneko'));
    expect(
      await screen.findByRole('button', { name: 'home.capabilities.cancelOperation' }),
    ).toBeTruthy();
    view.unmount();
  });
});

function skill(name: string, source: 'personal' | 'plugin') {
  return {
    id: `${source}:${name}`,
    name,
    description: name,
    source,
    sourceId: source,
    managementId: source === 'personal' ? `skill:${name}` : '',
    canRemove: source === 'personal',
  };
}

function extension(id: string, displayName: string, installed: boolean) {
  return {
    id,
    name: displayName,
    displayName,
    description: displayName,
    version: '1.0.0',
    developer: 'OpenNeko',
    marketplace: 'openneko',
    category: 'Productivity',
    installed,
    enabled: installed,
    canInstall: !installed,
    canUpdate: false,
    canEnable: false,
    canDisable: installed,
    canRemove: false,
    updatePackageRelease: '',
    deliverySource: 'official-download' as const,
    artifactPlatform: installed ? '' : 'darwin-arm64',
    downloadSizeBytes: installed ? 0 : 1024,
    artifactStatus: installed ? ('installed' as const) : ('available' as const),
    dependencyStatus: installed ? ('ready' as const) : ('unchecked' as const),
    enableGrantStatus: 'not-required' as const,
    hostPermissionStatus: 'not-applicable' as const,
    qualificationStatus: installed ? ('qualified' as const) : ('unqualified' as const),
    declaredPermissions: [],
    acceptedPermissions: [],
    agentStatus: installed ? ('ready' as const) : ('not-installed' as const),
    runtimeDiagnosticCode: '',
    iconDataUrl: '',
    mcpServerIds: [],
    hasSkills: false,
    appIds: [],
  };
}
