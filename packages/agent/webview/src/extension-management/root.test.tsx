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
      ...extensionLifecycleMethods(),
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
            enabled: true,
            manageable: false,
            removable: false,
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
      ...extensionLifecycleMethods(),
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
            transport: 'stdio' as const,
            enabled: true,
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

  it('loads full Skill content on demand and keeps its fingerprint in collapsed technical details', async () => {
    const getSkillDetail = vi.fn(async () => ({
      id: 'dsh-skill:bundled:media-preparation',
      name: 'media-preparation',
      description: 'Canonical English description.',
      whenToUse: 'Canonical English routing.',
      source: 'bundled',
      provider: 'filesystem',
      userInvocable: true,
      modelInvocable: true,
      content: '# Media preparation\n\nPrepare an exact generation input package.',
      fingerprint: `sha256:${'b'.repeat(64)}`,
    }));
    const runtime: AgentExtensionManagementRuntime = {
      ...extensionLifecycleMethods(),
      identity: { windowId: 'window-1' },
      getSkillDetail,
      getSnapshot: vi.fn(async () => ({
        identity: { windowId: 'window-1' },
        catalogScope: 'global' as const,
        skills: [
          {
            id: 'dsh-skill:bundled:media-preparation',
            name: 'media-preparation',
            description: 'Canonical English description.',
            whenToUse: 'Canonical English routing.',
            source: 'bundled',
            provider: 'filesystem',
            userInvocable: true,
            modelInvocable: true,
            enabled: true,
            manageable: false,
            removable: false,
          },
        ],
        mcp: [],
        diagnostics: [],
      })),
      dispose: vi.fn(),
    };

    render(
      <I18nProvider service={createI18n('zh-cn')}>
        <AgentExtensionManagementRoot interactive runtime={runtime} />
      </I18nProvider>,
    );

    const card = await screen.findByRole('listitem', { name: '媒体准备' });
    expect(getSkillDetail).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('Prepare an exact generation input package.');

    fireEvent.click(within(card).getByRole('button'));

    expect(await screen.findByText('$media-preparation')).toBeTruthy();
    expect(await screen.findByText(/Prepare an exact generation input package/u)).toBeTruthy();
    expect(getSkillDetail).toHaveBeenCalledOnce();
    expect(getSkillDetail).toHaveBeenCalledWith({
      name: 'media-preparation',
      source: 'bundled',
    });
    expect(screen.getAllByText('把已选镜头与真实素材准备成可直接提交的媒体输入包。')).toHaveLength(
      2,
    );
    expect(document.body.textContent).not.toContain('Canonical English routing.');

    const technicalDetails = screen.getByText('技术详情').closest('details');
    expect(technicalDetails).not.toBeNull();
    expect(technicalDetails?.open).toBe(false);
    fireEvent.click(screen.getByText('技术详情'));
    expect(technicalDetails?.open).toBe(true);
    expect(within(technicalDetails!).getByText(`sha256:${'b'.repeat(64)}`)).toBeTruthy();
    expect(within(technicalDetails!).getByText('filesystem')).toBeTruthy();
  });

  it('keeps a Skill detail read failure local and visible', async () => {
    const runtime = runtimeWithSkill({
      id: 'dsh-skill:user-dsh:review',
      name: 'review',
      description: 'Review a draft.',
      source: 'user-dsh',
      provider: 'filesystem',
      userInvocable: true,
      modelInvocable: true,
    });
    vi.mocked(runtime.getSkillDetail).mockRejectedValueOnce(
      new Error('Skill detail is no longer available.'),
    );

    render(
      <I18nProvider service={createI18n()}>
        <AgentExtensionManagementRoot interactive runtime={runtime} />
      </I18nProvider>,
    );

    fireEvent.click(
      within(await screen.findByRole('listitem', { name: 'review' })).getByRole('button'),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Skill detail is no longer available.',
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
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
          enabled: true,
          manageable: false,
          removable: false,
        },
        {
          id: 'dsh-skill:personal-review',
          name: 'personal-review',
          description: 'Personal review.',
          source: 'user-dsh',
          provider: 'filesystem',
          userInvocable: true,
          modelInvocable: true,
          enabled: true,
          manageable: true,
          removable: true,
        },
        {
          id: 'dsh-skill:project-review',
          name: 'project-review',
          description: 'Project review.',
          source: 'project-agents',
          provider: 'filesystem',
          userInvocable: true,
          modelInvocable: false,
          enabled: true,
          manageable: false,
          removable: false,
        },
      ],
      mcp: [],
      diagnostics: [],
    }));
    const runtime: AgentExtensionManagementRuntime = {
      ...extensionLifecycleMethods(),
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
      ...extensionLifecycleMethods(),
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
      ...extensionLifecycleMethods(),
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
            transport: 'streamable-http' as const,
            enabled: true,
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
    expect(card.getAttribute('data-lifecycle-state')).toBe('enabled');
    expect(card.querySelector('.agent-extension-catalog-row__heading > strong')).toBeTruthy();
    expect(card.querySelector('.agent-extension-catalog-row__summary')).toBeTruthy();
    expect(card.querySelector('.agent-extension-catalog-row__affordance')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Extensions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh catalog' })).toBeNull();
    expect(document.querySelector('[data-catalog-view-control]')).toBeNull();
  });

  it('adds Skills and manages only personal Skill lifecycle state', async () => {
    const personalSkill = {
      id: 'dsh-skill:user-dsh:review',
      name: 'review',
      description: 'Review a draft.',
      source: 'user-dsh',
      provider: 'filesystem',
      userInvocable: true,
      modelInvocable: true,
      enabled: true,
      manageable: true,
      removable: true,
    };
    const projection = {
      identity: { windowId: 'window-1' },
      catalogScope: 'global' as const,
      skills: [personalSkill],
      mcp: [],
      diagnostics: [],
    };
    const runtime: AgentExtensionManagementRuntime = {
      ...extensionLifecycleMethods(),
      identity: projection.identity,
      getSnapshot: vi.fn(async () => projection),
      addSkill: vi.fn(async () => projection),
      setSkillEnabled: vi.fn(async () => ({
        ...projection,
        skills: [{ ...personalSkill, enabled: false }],
      })),
      removeSkill: vi.fn(async () => ({ ...projection, skills: [] })),
      addMcp: vi.fn(async () => projection),
      setMcpEnabled: vi.fn(async () => projection),
      removeMcp: vi.fn(async () => projection),
      dispose: vi.fn(),
    };

    render(
      <I18nProvider service={createI18n()}>
        <AgentExtensionManagementRoot interactive runtime={runtime} />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Add Skill' }));
    await waitFor(() => expect(runtime.addSkill).toHaveBeenCalledTimes(1));
    const personalCard = screen.getByRole('listitem', { name: 'review' });
    expect(personalCard.getAttribute('data-lifecycle-state')).toBe('enabled');
    fireEvent.click(within(personalCard).getByRole('button'));
    fireEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    await waitFor(() =>
      expect(runtime.setSkillEnabled).toHaveBeenCalledWith({
        name: 'review',
        source: 'user-dsh',
        enabled: false,
      }),
    );
    await waitFor(() => expect(personalCard.getAttribute('data-lifecycle-state')).toBe('disabled'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Delete extension' });
    expect(confirmation.textContent).toContain('permanently removes the imported personal Skill');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(runtime.removeSkill).toHaveBeenCalledWith({
        name: 'review',
        source: 'user-dsh',
      }),
    );
  });

  it('adds an MCP server through the canonical transport form', async () => {
    const projection = {
      identity: { windowId: 'window-1' },
      catalogScope: 'global' as const,
      skills: [],
      mcp: [],
      diagnostics: [],
    };
    const runtime: AgentExtensionManagementRuntime = {
      ...extensionLifecycleMethods(),
      identity: projection.identity,
      getSnapshot: vi.fn(async () => projection),
      addSkill: vi.fn(async () => projection),
      setSkillEnabled: vi.fn(async () => projection),
      removeSkill: vi.fn(async () => projection),
      addMcp: vi.fn(async () => projection),
      setMcpEnabled: vi.fn(async () => projection),
      removeMcp: vi.fn(async () => projection),
      dispose: vi.fn(),
    };

    render(
      <I18nProvider service={createI18n()}>
        <AgentExtensionManagementRoot interactive runtime={runtime} selectedTab="mcp" />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Add MCP' }));
    fireEvent.change(screen.getByLabelText('Server name'), { target: { value: 'filesystem' } });
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'mcp-filesystem' } });
    fireEvent.change(screen.getByLabelText('Arguments (one per line)'), {
      target: { value: '--readonly' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add MCP' }).at(-1)!);

    await waitFor(() =>
      expect(runtime.addMcp).toHaveBeenCalledWith({
        serverName: 'filesystem',
        description: '',
        transport: 'stdio',
        command: 'mcp-filesystem',
        args: ['--readonly'],
      }),
    );
  });
});

function runtimeWithSkill(
  skill: Omit<
    Awaited<ReturnType<AgentExtensionManagementRuntime['getSnapshot']>>['skills'][number],
    'enabled' | 'manageable' | 'removable'
  > &
    Partial<
      Pick<
        Awaited<ReturnType<AgentExtensionManagementRuntime['getSnapshot']>>['skills'][number],
        'enabled' | 'manageable' | 'removable'
      >
    >,
): AgentExtensionManagementRuntime {
  const managedSkill = {
    enabled: true,
    manageable: skill.source === 'user-dsh',
    removable: skill.source === 'user-dsh',
    ...skill,
  };
  return {
    ...extensionLifecycleMethods(),
    identity: { windowId: 'window-1' },
    getSnapshot: vi.fn(async () => ({
      identity: { windowId: 'window-1' },
      catalogScope: 'global' as const,
      skills: [managedSkill],
      mcp: [],
      diagnostics: [],
    })),
    dispose: vi.fn(),
  };
}

function extensionLifecycleMethods() {
  const unsupported = async (): Promise<never> => {
    throw new Error('Unexpected extension lifecycle mutation.');
  };
  return {
    getSkillDetail: vi.fn(async (input: { readonly name: string; readonly source: string }) => ({
      id: `dsh-skill:${input.source}:${input.name}`,
      name: input.name,
      description: '',
      source: input.source,
      provider: 'filesystem',
      userInvocable: true,
      modelInvocable: true,
      content: `# ${input.name}`,
      fingerprint: `sha256:${'a'.repeat(64)}`,
    })),
    addSkill: vi.fn(unsupported),
    setSkillEnabled: vi.fn(unsupported),
    removeSkill: vi.fn(unsupported),
    addMcp: vi.fn(unsupported),
    setMcpEnabled: vi.fn(unsupported),
    removeMcp: vi.fn(unsupported),
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
