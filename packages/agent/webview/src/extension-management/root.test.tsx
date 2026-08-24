// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nService } from '@neko/ui/i18n';
import { I18nProvider } from '@neko/ui/i18n/react';
import type { AgentExtensionManagementRuntime } from '@neko/agent-contracts/extension-management';

import { AgentExtensionManagementRoot } from './root';

afterEach(cleanup);

describe('Agent Skill/MCP extension management', () => {
  it('renders exactly Skill and MCP tabs without a Plugin management surface', async () => {
    const runtime: AgentExtensionManagementRuntime = {
      identity: { windowId: 'window-1' },
      getSnapshot: vi.fn(async () => ({
        identity: { windowId: 'window-1' },
        catalogScope: 'global' as const,
        skills: [
          {
            id: 'dsh-skill:storyboard',
            name: 'storyboard',
            description: 'Create a storyboard.',
            source: 'bundled',
            provider: 'openneko-builtin',
            userInvocable: true,
            modelInvocable: true,
          },
        ],
        mcp: [],
        diagnostics: [],
      })),
      dispose: vi.fn(),
    };

    render(
      <I18nProvider service={createI18n()}>
        <AgentExtensionManagementRoot interactive runtime={runtime} />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByText('storyboard')).toBeTruthy());
    const tabs = [...document.querySelectorAll('[data-extension-catalog-tab]')].map((tab) =>
      tab.getAttribute('data-extension-catalog-tab'),
    );
    expect(tabs).toEqual(['skills', 'mcp']);
    expect(document.querySelector('[data-extension-catalog-tab="plugin"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Install Plugin');
  });
});

function createI18n(): I18nService {
  const messages = {
    'home.capabilities': 'Extensions',
    'home.capabilities.description': 'Manage Skills and MCP.',
    'home.capabilities.discoveryIssues': '{count} issues',
    'home.capabilities.eyebrow': 'Global catalog',
    'home.capabilities.loading': 'Loading catalog',
    'home.capabilities.noEntries': 'No matching entries',
    'home.capabilities.refresh': 'Refresh catalog',
    'home.capabilities.search': 'Search',
    'home.capabilities.skills': 'Skills',
    'home.capabilities.tabs': 'Extension catalog',
    'home.capabilities.view.grid': 'Grid view',
    'home.capabilities.view.list': 'List view',
  };
  const service = new I18nService('en');
  service.registerBundle('extensions-test', 'en', messages);
  return service;
}
