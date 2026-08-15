// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentExtensionCatalogItem } from '@neko/agent-contracts';
import type {
  AgentExtensionManagementProjection,
  AgentExtensionManagementRuntime,
  AgentManagedSkillItem,
} from '@neko/agent-contracts/extension-management';
import {
  AgentExtensionManagementRoot,
  resolveAgentExtensionDescription,
  searchAndOrderAgentExtensions,
  searchAndOrderAgentSkills,
} from './root';

const i18n = vi.hoisted(() => ({ locale: 'en' }));

vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ locale: i18n.locale, t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  i18n.locale = 'en';
});

describe('AgentExtensionManagementRoot', () => {
  it('keeps filtering, localization, and ordering package-owned and deterministic', () => {
    expect(
      searchAndOrderAgentSkills([skill('Video', 'plugin'), skill('Audio', 'personal')], '').map(
        (item) => item.name,
      ),
    ).toEqual(['Audio', 'Video']);
    expect(
      searchAndOrderAgentExtensions(
        [extension('github', 'GitHub', false), extension('computer', 'Computer', true)],
        '',
      ).map((item) => item.id),
    ).toEqual(['computer', 'github']);

    const localized = {
      ...extension('browser', 'Browser', true),
      description: 'Browser automation',
      localization: { 'zh-cn': { description: '浏览器自动化' } },
    };
    expect(resolveAgentExtensionDescription(localized, 'en')).toBe('Browser automation');
    expect(resolveAgentExtensionDescription(localized, 'zh-cn')).toBe('浏览器自动化');
  });

  it('renders the active catalog, search, empty state, and exact detail selection', async () => {
    i18n.locale = 'zh-cn';
    const localized = {
      ...extension('browser-use', 'Browser Use', true),
      description: 'Browser automation',
      localization: { 'zh-cn': { description: '在已授权域名中自动化浏览器' } },
    };
    const onDetailVisibilityChange = vi.fn();
    const runtime = createRuntime({ extensions: [localized] });
    const view = render(
      <AgentExtensionManagementRoot
        confirmAction={() => true}
        interactive
        onDetailVisibilityChange={onDetailVisibilityChange}
        renderDetail={({ content }) => <div data-testid="configuration">{content}</div>}
        runtime={runtime}
      />,
    );

    expect(await screen.findByText('home.capabilities.noSkills')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.extensions' }));
    expect(await screen.findByText('在已授权域名中自动化浏览器')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'home.capabilities.search' }), {
      target: { value: '已授权域名' },
    });
    fireEvent.click(
      within(await screen.findByRole('listitem', { name: 'Browser Use' })).getByRole('button', {
        name: /Browser Use/u,
      }),
    );
    expect(screen.getByTestId('configuration')).toBeTruthy();
    expect(onDetailVisibilityChange).toHaveBeenLastCalledWith(true);
    view.unmount();
    expect(onDetailVisibilityChange).toHaveBeenLastCalledWith(false);
  });

  it('manages local install, enablement, local removal, and source rescanning', async () => {
    const disabled = {
      ...extension('browser-use', 'Browser Use', true),
      enabled: false,
      canEnable: true,
      canDisable: false,
      agentStatus: 'disabled' as const,
    };
    const enabled = extension('computer-use', 'Computer Use', true);
    const personal = {
      ...extension('personal', 'Personal', true),
      enabled: false,
      canEnable: true,
      canDisable: false,
      canRemove: true,
      deliverySource: 'local' as const,
      agentStatus: 'disabled' as const,
    };
    const runtime = createRuntime({ extensions: [disabled, enabled, personal] });
    const confirmAction = vi.fn(() => true);
    const view = render(
      <AgentExtensionManagementRoot confirmAction={confirmAction} interactive runtime={runtime} />,
    );

    await screen.findByText('home.capabilities.noSkills');
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.refresh' }));
    await waitFor(() => expect(runtime.rescanSources).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.extensions' }));
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.addLocalPlugin' }));
    await waitFor(() => expect(runtime.installLocalPlugin).toHaveBeenCalledOnce());
    const browserCard = await screen.findByRole('listitem', { name: 'Browser Use' });
    fireEvent.click(within(browserCard).getByRole('switch'));
    await waitFor(() => expect(runtime.enablePlugin).toHaveBeenCalledWith('browser-use'));
    expect(confirmAction).toHaveBeenCalledOnce();
    expect(view.container.querySelector('.agent-extension-configuration-root')).toBeNull();

    const computerCard = screen.getByRole('listitem', { name: 'Computer Use' });
    fireEvent.click(within(computerCard).getByRole('switch'));
    await waitFor(() => expect(runtime.disablePlugin).toHaveBeenCalledWith('computer-use'));
    expect(confirmAction).toHaveBeenCalledOnce();

    const personalCard = screen.getByRole('listitem', { name: 'Personal' });
    fireEvent.click(within(personalCard).getByRole('button', { name: /Personal/u }));
    const configuration = view.container.querySelector('.agent-extension-configuration-root');
    expect(configuration).not.toBeNull();
    expect(within(configuration as HTMLElement).queryByRole('switch')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.remove' }));
    await waitFor(() => expect(runtime.removePlugin).toHaveBeenCalledWith('personal'));
  });

  it('installs and removes personal skills without adding a plugin installer', async () => {
    const runtime = createRuntime({ skills: [skill('Audio', 'personal')] });
    render(
      <AgentExtensionManagementRoot confirmAction={() => true} interactive runtime={runtime} />,
    );

    const audioCard = await screen.findByRole('listitem', { name: 'Audio' });
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.addSkill' }));
    await waitFor(() => expect(runtime.installPersonalSkill).toHaveBeenCalledOnce());
    fireEvent.click(within(audioCard).getByRole('button', { name: /Audio/u }));
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.openSkillInEditor' }));
    await waitFor(() => expect(runtime.openPersonalSkill).toHaveBeenCalledWith('skill:Audio'));
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.showSkillInFolder' }));
    await waitFor(() =>
      expect(runtime.showPersonalSkillInFolder).toHaveBeenCalledWith('skill:Audio'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.remove' }));
    await waitFor(() => expect(runtime.removePersonalSkill).toHaveBeenCalledWith('skill:Audio'));
  });

  it('shows overview metadata and routes a Plugin Skill to its owning Plugin', async () => {
    const runtime = createRuntime({
      skills: [skill('Shot list', 'plugin', 'plugin-tools')],
      extensions: [extension('plugin-tools', 'Plugin Tools', true)],
    });
    render(
      <AgentExtensionManagementRoot confirmAction={() => true} interactive runtime={runtime} />,
    );

    const skillCard = await screen.findByRole('listitem', { name: 'Shot list' });
    fireEvent.click(within(skillCard).getByRole('button', { name: /Shot list/u }));
    expect(screen.getByText('home.capabilities.overview')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'home.capabilities.openSkillInEditor' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.viewOwningPlugin' }));
    expect(await screen.findByRole('listitem', { name: 'Plugin Tools' })).toBeTruthy();
    expect(screen.getByText('home.capabilities.deliverySource.bundled')).toBeTruthy();
  });

  it('shows discovery diagnostics and mutation failures visibly', async () => {
    const runtime = createRuntime({
      skillDiscovery: {
        diagnostics: [{ code: 'read_failed', source: 'personal', count: 1 }],
        duplicateCount: 1,
      },
    });
    vi.mocked(runtime.rescanSources).mockRejectedValue(new Error('rescan failed'));
    render(
      <AgentExtensionManagementRoot confirmAction={() => true} interactive runtime={runtime} />,
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'home.capabilities.discoveryIssues',
    );
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.refresh' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('home.capabilities.operationFailed'),
    );
    expect(screen.getByRole('alert').textContent).not.toContain('rescan failed');
  });
});

function createRuntime(
  patch: Partial<AgentExtensionManagementProjection> = {},
): AgentExtensionManagementRuntime & {
  readonly rescanSources: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly installLocalPlugin: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly enablePlugin: ReturnType<typeof vi.fn<(pluginId: string) => Promise<void>>>;
  readonly removePlugin: ReturnType<typeof vi.fn<(pluginId: string) => Promise<void>>>;
  readonly installPersonalSkill: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly openPersonalSkill: ReturnType<typeof vi.fn<(managementId: string) => Promise<void>>>;
  readonly showPersonalSkillInFolder: ReturnType<
    typeof vi.fn<(managementId: string) => Promise<void>>
  >;
  readonly removePersonalSkill: ReturnType<typeof vi.fn<(managementId: string) => Promise<void>>>;
} {
  const identity = { windowId: 'window-1' };
  const projection: AgentExtensionManagementProjection = {
    identity,
    skills: [],
    skillDiscovery: { diagnostics: [], duplicateCount: 0 },
    extensions: [],
    extensionDiscovery: { diagnostics: [] },
    ...patch,
  };
  return {
    identity,
    getSnapshot: vi.fn(async () => projection),
    installLocalPlugin: vi.fn(async () => undefined),
    enablePlugin: vi.fn(async () => undefined),
    disablePlugin: vi.fn(async () => undefined),
    removePlugin: vi.fn(async () => undefined),
    rescanSources: vi.fn(async () => undefined),
    installPersonalSkill: vi.fn(async () => undefined),
    openPersonalSkill: vi.fn(async () => undefined),
    showPersonalSkillInFolder: vi.fn(async () => undefined),
    removePersonalSkill: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
}

function skill(
  name: string,
  source: 'personal' | 'plugin',
  sourceId: string = source,
): AgentManagedSkillItem {
  return {
    id: `${source}:${sourceId}:${name}`,
    name,
    description: name,
    source,
    sourceId,
    managementId: source === 'personal' ? `skill:${name}` : '',
    canOpenInEditor: source === 'personal',
    canShowInFolder: source === 'personal',
    canRemove: source === 'personal',
  };
}

function extension(id: string, displayName: string, enabled: boolean): AgentExtensionCatalogItem {
  return {
    id,
    name: displayName,
    displayName,
    description: displayName,
    localization: {},
    version: '1.0.0',
    developer: 'OpenNeko',
    enabled,
    canEnable: !enabled,
    canDisable: enabled,
    canRemove: false,
    deliverySource: 'bundled',
    agentStatus: enabled ? 'ready' : 'disabled',
    runtimeDiagnosticCode: '',
    componentReadiness: {
      skills: { status: 'absent', diagnosticCode: '' },
      mcp: { status: 'absent', diagnosticCode: '' },
      apps: { status: 'absent', diagnosticCode: '' },
    },
    iconDataUrl: '',
    mcpServerIds: [],
    hasSkills: false,
    appIds: [],
  };
}
