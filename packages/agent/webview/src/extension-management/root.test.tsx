// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
        [
          extension('github@openneko', 'GitHub', false),
          extension('computer@openneko', 'Computer', true),
        ],
        '',
      ).map((item) => item.id),
    ).toEqual(['computer@openneko', 'github@openneko']);

    const localized = {
      ...extension('browser@openneko', 'Browser', true),
      description: 'Browser automation',
      localization: { 'zh-cn': { description: '浏览器自动化' } },
    };
    expect(resolveAgentExtensionDescription(localized, 'en')).toBe('Browser automation');
    expect(resolveAgentExtensionDescription(localized, 'zh-cn')).toBe('浏览器自动化');
  });

  it('renders the active catalog, search, empty state, and exact detail selection', async () => {
    i18n.locale = 'zh-cn';
    const localized = {
      ...extension('browser-use@openneko', 'Browser Use', true),
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
    fireEvent.click(await screen.findByRole('option', { name: /Browser Use/u }));
    expect(screen.getByTestId('configuration')).toBeTruthy();
    expect(onDetailVisibilityChange).toHaveBeenLastCalledWith(true);
    view.unmount();
    expect(onDetailVisibilityChange).toHaveBeenLastCalledWith(false);
  });

  it('manages only enablement, personal removal, and source rescanning', async () => {
    const disabled = {
      ...extension('browser-use@openneko', 'Browser Use', true),
      enabled: false,
      canEnable: true,
      canDisable: false,
      agentStatus: 'disabled' as const,
    };
    const personal = {
      ...extension('personal@openneko', 'Personal', true),
      enabled: false,
      canEnable: true,
      canDisable: false,
      canRemove: true,
      deliverySource: 'personal' as const,
      agentStatus: 'disabled' as const,
    };
    const runtime = createRuntime({ extensions: [disabled, personal] });
    render(
      <AgentExtensionManagementRoot confirmAction={() => true} interactive runtime={runtime} />,
    );

    await screen.findByText('home.capabilities.noSkills');
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.refresh' }));
    await waitFor(() => expect(runtime.rescanSources).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.extensions' }));
    fireEvent.click(await screen.findByRole('option', { name: /Browser Use/u }));
    fireEvent.click(screen.getByRole('switch', { name: 'home.capabilities.enablement' }));
    await waitFor(() => expect(runtime.enablePlugin).toHaveBeenCalledWith('browser-use@openneko'));

    fireEvent.click(await screen.findByRole('option', { name: /Personal/u }));
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.remove' }));
    await waitFor(() => expect(runtime.removePlugin).toHaveBeenCalledWith('personal@openneko'));
  });

  it('installs and removes personal skills without adding a plugin installer', async () => {
    const runtime = createRuntime({ skills: [skill('Audio', 'personal')] });
    render(
      <AgentExtensionManagementRoot confirmAction={() => true} interactive runtime={runtime} />,
    );

    await screen.findByRole('option', { name: /Audio/u });
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.addSkill' }));
    await waitFor(() => expect(runtime.installPersonalSkill).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('option', { name: /Audio/u }));
    fireEvent.click(screen.getByRole('button', { name: 'home.capabilities.remove' }));
    await waitFor(() => expect(runtime.removePersonalSkill).toHaveBeenCalledWith('skill:Audio'));
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
    expect((await screen.findByRole('alert')).textContent).toContain('rescan failed');
  });
});

function createRuntime(
  patch: Partial<AgentExtensionManagementProjection> = {},
): AgentExtensionManagementRuntime & {
  readonly rescanSources: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly enablePlugin: ReturnType<typeof vi.fn<(pluginId: string) => Promise<void>>>;
  readonly removePlugin: ReturnType<typeof vi.fn<(pluginId: string) => Promise<void>>>;
  readonly installPersonalSkill: ReturnType<typeof vi.fn<() => Promise<void>>>;
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
    enablePlugin: vi.fn(async () => undefined),
    disablePlugin: vi.fn(async () => undefined),
    removePlugin: vi.fn(async () => undefined),
    rescanSources: vi.fn(async () => undefined),
    installPersonalSkill: vi.fn(async () => undefined),
    removePersonalSkill: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
}

function skill(name: string, source: 'personal' | 'plugin'): AgentManagedSkillItem {
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

function extension(id: string, displayName: string, enabled: boolean): AgentExtensionCatalogItem {
  return {
    id,
    name: displayName,
    displayName,
    description: displayName,
    localization: {},
    version: '1.0.0',
    developer: 'OpenNeko',
    marketplace: 'openneko',
    category: 'Productivity',
    enabled,
    canEnable: !enabled,
    canDisable: enabled,
    canRemove: false,
    deliverySource: 'bundled',
    agentStatus: enabled ? 'ready' : 'disabled',
    runtimeDiagnosticCode: '',
    iconDataUrl: '',
    mcpServerIds: [],
    hasSkills: false,
    appIds: [],
  };
}
