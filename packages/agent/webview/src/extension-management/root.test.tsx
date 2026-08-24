// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nService } from '@neko/ui/i18n';
import { I18nProvider } from '@neko/ui/i18n/react';
import type { AgentExtensionManagementRuntime } from '@neko/agent-contracts/extension-management';

import { AgentExtensionManagementRoot } from './root';
import { agentExtensionManagementMessages } from './messages';

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

    await waitFor(() => expect(screen.getByText('Storyboard creation')).toBeTruthy());
    expect(document.body.textContent).not.toContain('openneko-builtin');
    expect(document.body.textContent).not.toContain('$storyboard');
    expect(
      screen
        .getByRole('listitem', { name: 'Storyboard creation' })
        .getAttribute('data-extension-kind'),
    ).toBe('skill');
    const tabs = [...document.querySelectorAll('[data-extension-catalog-tab]')].map((tab) =>
      tab.getAttribute('data-extension-catalog-tab'),
    );
    expect(tabs).toEqual(['skills', 'mcp']);
    expect(document.querySelector('[data-extension-catalog-tab="plugin"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Install Plugin');
  });

  it('projects the canonical MCP kind without changing the runtime item', async () => {
    const runtime: AgentExtensionManagementRuntime = {
      identity: { windowId: 'window-1' },
      getSnapshot: vi.fn(async () => ({
        identity: { windowId: 'window-1' },
        catalogScope: 'global' as const,
        skills: [],
        mcp: [
          {
            id: 'mcp:filesystem',
            name: 'Filesystem MCP',
            description: 'Access approved workspace files.',
            status: 'ready' as const,
            diagnosticCode: '',
          },
        ],
        diagnostics: [],
      })),
      dispose: vi.fn(),
    };

    render(
      <I18nProvider service={createI18n()}>
        <AgentExtensionManagementRoot interactive runtime={runtime} selectedTab="mcp" />
      </I18nProvider>,
    );

    const entry = await screen.findByRole('listitem', { name: 'Filesystem MCP' });
    expect(entry.getAttribute('data-extension-kind')).toBe('mcp');
    expect(screen.getByText('Access approved workspace files.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('ready');

    fireEvent.click(within(entry).getByRole('button'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('ready');
    expect(entry.getAttribute('data-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Close extension details' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(entry.getAttribute('data-selected')).toBe('false');
  });

  it('localizes known bundled Skills while preserving the canonical invocation name', async () => {
    const runtime = runtimeWithSkill({
      id: 'dsh-skill:content-authoring',
      name: 'content-authoring',
      description: 'Canonical English description.',
      whenToUse: 'Canonical English routing.',
      source: 'bundled',
      provider: 'filesystem',
      userInvocable: true,
      modelInvocable: true,
    });

    render(
      <I18nProvider service={createI18n('zh-cn')}>
        <AgentExtensionManagementRoot interactive runtime={runtime} />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByText('内容创作')).toBeTruthy());
    expect(screen.getByRole('listitem', { name: '内容创作' })).toBeTruthy();
    expect(
      screen.getByText('渐进生成简洁一致的创作方案、分析报告、企划、计划和提示词包。'),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('filesystem');
    expect(document.body.textContent).not.toContain('用户可调用');
    expect(document.body.textContent).not.toContain('Canonical English routing.');
  });

  it('does not apply builtin localization to a project Skill with the same name', async () => {
    const runtime = runtimeWithSkill({
      id: 'dsh-skill:content-authoring',
      name: 'content-authoring',
      description: 'Project-authored description.',
      source: 'project-agents',
      provider: 'filesystem',
      userInvocable: true,
      modelInvocable: false,
    });

    render(
      <I18nProvider service={createI18n('zh-cn')}>
        <AgentExtensionManagementRoot interactive runtime={runtime} />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByText('content-authoring')).toBeTruthy());
    expect(screen.getByText('Project-authored description.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('filesystem');
    expect(document.body.textContent).not.toContain('内容创作');
  });

  it('shows every loaded Skill source without inferring an installed-state filter', async () => {
    const getSnapshot = vi.fn(async () => ({
      identity: { windowId: 'window-1' },
      catalogScope: 'global' as const,
      skills: [
        {
          id: 'dsh-skill:storyboard',
          name: 'storyboard',
          description: 'Bundled storyboard.',
          source: 'bundled',
          provider: 'openneko-builtin',
          userInvocable: true,
          modelInvocable: true,
        },
        {
          id: 'dsh-skill:personal-review',
          name: 'personal-review',
          description: 'Personal review.',
          source: 'user-dsh',
          provider: 'filesystem',
          userInvocable: true,
          modelInvocable: true,
        },
        {
          id: 'dsh-skill:project-review',
          name: 'project-review',
          description: 'Project review.',
          source: 'project-agents',
          provider: 'filesystem',
          userInvocable: true,
          modelInvocable: false,
        },
      ],
      mcp: [],
      diagnostics: [],
    }));
    const runtime: AgentExtensionManagementRuntime = {
      identity: { windowId: 'window-1' },
      getSnapshot,
      dispose: vi.fn(),
    };

    render(
      <I18nProvider service={createI18n()}>
        <AgentExtensionManagementRoot interactive runtime={runtime} />
      </I18nProvider>,
    );

    expect(await screen.findByRole('listitem', { name: 'Storyboard creation' })).toBeTruthy();
    expect(screen.getByRole('listitem', { name: 'personal-review' })).toBeTruthy();
    expect(screen.getByRole('listitem', { name: 'project-review' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Added/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /^All/u })).toBeNull();
    expect(getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('describes an empty MCP projection as unconfigured without an added-state filter', async () => {
    const runtime: AgentExtensionManagementRuntime = {
      identity: { windowId: 'window-1' },
      getSnapshot: vi.fn(async () => ({
        identity: { windowId: 'window-1' },
        catalogScope: 'global' as const,
        skills: [],
        mcp: [],
        diagnostics: [],
      })),
      dispose: vi.fn(),
    };

    render(
      <I18nProvider service={createI18n('zh-cn')}>
        <AgentExtensionManagementRoot interactive runtime={runtime} selectedTab="mcp" />
      </I18nProvider>,
    );

    expect(await screen.findByText('尚未配置 MCP')).toBeTruthy();
    expect(screen.queryByText('已添加')).toBeNull();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'filesystem' } });
    expect(await screen.findByText('No matching entries')).toBeTruthy();
    expect(screen.queryByText('尚未配置 MCP')).toBeNull();
  });

  it('opens package-owned details and exposes a clear selected state until close', async () => {
    const runtime = runtimeWithSkill({
      id: 'dsh-skill:content-authoring',
      name: 'content-authoring',
      description: 'Canonical English description.',
      whenToUse: 'Use this capability for structured authoring work.',
      source: 'project-agents',
      provider: 'filesystem',
      userInvocable: true,
      modelInvocable: false,
    });

    render(
      <I18nProvider service={createI18n()}>
        <AgentExtensionManagementRoot interactive runtime={runtime} />
      </I18nProvider>,
    );

    const card = await screen.findByRole('listitem', { name: 'content-authoring' });
    const openButton = within(card).getByRole('button');
    expect(openButton.getAttribute('aria-pressed')).toBe('false');
    expect(document.body.textContent).not.toContain('filesystem');

    fireEvent.click(openButton);

    const dialog = await screen.findByRole('dialog');
    expect(openButton.getAttribute('aria-pressed')).toBe('true');
    expect(card.getAttribute('data-selected')).toBe('true');
    expect(screen.getByText('filesystem')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Capability information' })).toBeTruthy();
    expect(dialog.textContent).toContain('Not model invocable');

    fireEvent.click(screen.getByRole('button', { name: 'Close extension details' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(openButton.getAttribute('aria-pressed')).toBe('false');
    expect(card.getAttribute('data-selected')).toBe('false');
  });

  it('keeps a non-ready MCP diagnostic local to its card', async () => {
    const runtime: AgentExtensionManagementRuntime = {
      identity: { windowId: 'window-1' },
      getSnapshot: vi.fn(async () => ({
        identity: { windowId: 'window-1' },
        catalogScope: 'global' as const,
        skills: [],
        mcp: [
          {
            id: 'mcp:offline',
            name: 'Offline MCP',
            description: 'Requires a local service.',
            status: 'error' as const,
            diagnosticCode: 'connection-refused',
          },
        ],
        diagnostics: [],
      })),
      dispose: vi.fn(),
    };

    render(
      <I18nProvider service={createI18n()}>
        <AgentExtensionManagementRoot interactive runtime={runtime} selectedTab="mcp" />
      </I18nProvider>,
    );

    const card = await screen.findByRole('listitem', { name: 'Offline MCP' });
    expect(card.querySelector('[role="alert"]')?.textContent).toContain('connection-refused');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('uses a compact heading without repeating the page hierarchy', async () => {
    const runtime = runtimeWithSkill({
      id: 'dsh-skill:storyboard',
      name: 'storyboard',
      description: 'Create a storyboard.',
      source: 'bundled',
      provider: 'openneko-builtin',
      userInvocable: true,
      modelInvocable: true,
    });

    render(
      <I18nProvider service={createI18n()}>
        <AgentExtensionManagementRoot compactHeading interactive runtime={runtime} />
      </I18nProvider>,
    );

    const card = await screen.findByRole('listitem', { name: 'Storyboard creation' });
    expect(card.querySelector('.agent-extension-catalog-row__heading > strong')).toBeTruthy();
    expect(card.querySelector('.agent-extension-catalog-row__summary')).toBeTruthy();
    expect(card.querySelector('.agent-extension-catalog-row__affordance')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Extensions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh catalog' })).toBeNull();
    expect(document.querySelector('[data-catalog-view-control]')).toBeNull();
  });
});

function runtimeWithSkill(
  skill: Awaited<ReturnType<AgentExtensionManagementRuntime['getSnapshot']>>['skills'][number],
): AgentExtensionManagementRuntime {
  return {
    identity: { windowId: 'window-1' },
    getSnapshot: vi.fn(async () => ({
      identity: { windowId: 'window-1' },
      catalogScope: 'global' as const,
      skills: [skill],
      mcp: [],
      diagnostics: [],
    })),
    dispose: vi.fn(),
  };
}

function createI18n(locale: 'en' | 'zh-cn' = 'en'): I18nService {
  const messages = {
    'home.capabilities': 'Extensions',
    'home.capabilities.description': 'Manage Skills and MCP.',
    'home.capabilities.discoveryIssues': '{count} issues',
    'home.capabilities.eyebrow': 'Global catalog',
    'home.capabilities.loading': 'Loading catalog',
    'home.capabilities.noEntries': 'No matching entries',
    'home.capabilities.search': 'Search',
    'home.capabilities.skills': 'Skills',
    'home.capabilities.tabs': 'Extension catalog',
  };
  const service = new I18nService(locale);
  service.registerBundle('extensions-test', 'en', messages);
  service.registerBundle('agent-extensions-en', 'en', agentExtensionManagementMessages.en);
  service.registerBundle(
    'agent-extensions-zh-cn',
    'zh-cn',
    agentExtensionManagementMessages['zh-cn'],
  );
  return service;
}
