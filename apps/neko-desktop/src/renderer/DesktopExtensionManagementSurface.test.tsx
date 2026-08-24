// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import type { AgentExtensionManagementRuntime } from '@neko/agent-contracts/extension-management';
import type { ProfessionalApplicationManagementRuntime } from '@neko/professional-apps-contracts';

import { DesktopExtensionManagementSurface } from './DesktopExtensionManagementSurface';
import { createDesktopI18n } from './i18n';

vi.mock('@neko/agent-webview/extension-management/root', () => ({
  AgentExtensionManagementRoot: ({
    compactHeading,
    selectedTab,
  }: {
    readonly compactHeading: boolean;
    readonly selectedTab: string;
  }) => <div data-agent-compact-heading={compactHeading} data-agent-extension-tab={selectedTab} />,
}));

vi.mock('@neko/professional-apps-webview/root', () => ({
  ProfessionalApplicationManagementRoot: ({
    compactHeading,
    runtime,
  }: {
    readonly compactHeading: boolean;
    readonly runtime: ProfessionalApplicationManagementRuntime;
  }) => (
    <div
      data-professional-application-compact-heading={compactHeading}
      data-professional-application-window={runtime.identity.windowId}
    />
  ),
}));

afterEach(cleanup);

describe('DesktopExtensionManagementSurface', () => {
  it('composes Skill, MCP and Professional applications without merging their runtimes', async () => {
    const emptySnapshot = {
      identity: { windowId: 'window-1' },
      catalogScope: 'global' as const,
      skills: [],
      mcp: [],
      diagnostics: [],
    };
    const extensionRuntime: AgentExtensionManagementRuntime = {
      identity: { windowId: 'window-1' },
      addSkill: vi.fn(async () => emptySnapshot),
      setSkillEnabled: vi.fn(async () => emptySnapshot),
      removeSkill: vi.fn(async () => emptySnapshot),
      addMcp: vi.fn(async () => emptySnapshot),
      setMcpEnabled: vi.fn(async () => emptySnapshot),
      removeMcp: vi.fn(async () => emptySnapshot),
      getSnapshot: vi.fn(async () => ({
        identity: { windowId: 'window-1' },
        catalogScope: 'global' as const,
        skills: [],
        mcp: [],
        diagnostics: [],
      })),
      dispose: vi.fn(),
    };
    const professionalApplicationRuntime: ProfessionalApplicationManagementRuntime = {
      identity: { windowId: 'window-1' },
      getSnapshot: vi.fn(async () => ({ identity: { windowId: 'window-1' }, items: [] })),
      updateBinding: vi.fn(),
      selectApplication: vi.fn(),
      launch: vi.fn(),
      dispose: vi.fn(),
    };
    const i18n = createDesktopI18n('en');

    render(
      <I18nProvider service={i18n.i18nService}>
        <DesktopExtensionManagementSurface
          extensionRuntime={extensionRuntime}
          interactive
          professionalApplicationRuntime={professionalApplicationRuntime}
        />
      </I18nProvider>,
    );

    await waitFor(() =>
      expect(document.querySelector('[data-agent-extension-tab="skills"]')).toBeTruthy(),
    );
    expect(document.querySelector('[data-agent-compact-heading="true"]')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Skills' }).getAttribute('aria-selected')).toBe('true');
    expect(
      document.querySelector(
        '.desktop-extension-management-composition > .management-segmented-control',
      ),
    ).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'MCP' }));
    expect(document.querySelector('[data-agent-extension-tab="mcp"]')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'MCP' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Professional applications' }));
    await waitFor(() =>
      expect(
        document.querySelector('[data-professional-application-window="window-1"]'),
      ).toBeTruthy(),
    );
    expect(document.querySelector('[data-agent-extension-tab]')).toBeNull();
    expect(
      document.querySelector('[data-professional-application-compact-heading="true"]'),
    ).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: 'Professional applications' }).getAttribute('aria-selected'),
    ).toBe('true');
  });
});
