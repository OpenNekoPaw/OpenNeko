// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentExtensionManagementRuntime } from '@neko/agent-contracts/extension-management';
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
        skills: [],
        skillDiscovery: { diagnostics: [], duplicateCount: 0 },
        extensions: [],
        extensionDiscovery: { diagnostics: [] },
      }),
      installPlugin: vi.fn(),
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
        skills: [skill('Audio', 'personal')],
        skillDiscovery: { diagnostics: [], duplicateCount: 0 },
        extensions: [extension('github@openneko', 'GitHub', false)],
        extensionDiscovery: { diagnostics: [] },
      }),
      installPlugin: vi.fn(),
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
    canRemove: installed,
    agentStatus: installed ? ('ready' as const) : ('not-installed' as const),
    runtimeDiagnosticCode: '',
    iconDataUrl: '',
    mcpServerIds: [],
    hasSkills: false,
    appIds: [],
  };
}
