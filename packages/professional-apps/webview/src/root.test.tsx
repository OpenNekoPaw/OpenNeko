// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nService } from '@neko/ui/i18n';
import { I18nProvider } from '@neko/ui/i18n/react';
import type {
  ProfessionalApplicationManagementProjection,
  ProfessionalApplicationManagementRuntime,
} from '@neko/professional-apps-contracts';

import { professionalApplicationsMessages } from './messages';
import { ProfessionalApplicationManagementRoot } from './root';

afterEach(cleanup);

describe('ProfessionalApplicationManagementRoot', () => {
  it('shows qualified applications separately and saves launcher preferences', async () => {
    const projection = createProjection();
    const updateBinding = vi.fn(async () => projection);
    const dispose = vi.fn();
    const runtime: ProfessionalApplicationManagementRuntime = {
      identity: { windowId: 'window-1' },
      getSnapshot: vi.fn(async () => projection),
      addBinding: vi.fn(async () => projection),
      updateBinding,
      setEnabled: vi.fn(async () => projection),
      removeBinding: vi.fn(async () => projection),
      selectApplication: vi.fn(async () => projection),
      launch: vi.fn(async () => ({
        integrationId: 'comfyui',
        operationId: 'comfyui.launch',
        status: 'launched' as const,
        targetIdentity: 'comfyui-window-1',
      })),
      dispose,
    };

    const rendered = render(
      <I18nProvider service={createI18n()}>
        <ProfessionalApplicationManagementRoot
          interactive
          runtime={runtime}
          toolbarControls={<div data-test-toolbar-controls />}
        />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByText('ComfyUI')).toBeTruthy());
    expect(document.body.textContent).not.toContain('不会自动安装应用、Skill、MCP、节点或模型');
    expect(document.querySelector('[data-extension-catalog-tab="plugin"]')).toBeNull();
    expect(
      document
        .querySelector('[data-test-toolbar-controls]')
        ?.closest('.management-surface-toolbar'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('ComfyUI 本地接口地址')).toBeNull();

    const card = screen.getByRole('listitem', { name: 'ComfyUI' });
    expect(card.getAttribute('data-lifecycle-state')).toBe('enabled');
    expect(card.querySelector('.professional-application-row__affordance')).toBeTruthy();
    const cardOpenButton = within(card).getByRole('button', { name: /ComfyUI/u });
    expect(cardOpenButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(cardOpenButton);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(document.body.textContent).toContain('不会自动安装应用、Skill、MCP、节点或模型');
    expect(cardOpenButton.getAttribute('aria-pressed')).toBe('true');
    expect(card.getAttribute('data-selected')).toBe('true');

    expect(screen.queryByLabelText('ComfyUI 本地接口地址')).toBeNull();
    expect(screen.queryByLabelText('ComfyUI 默认工作流绑定')).toBeNull();
    fireEvent.change(screen.getByLabelText('ComfyUI 启动偏好'), {
      target: { value: 'launch-new' },
    });
    fireEvent.click(screen.getByText('保存配置'));

    await waitFor(() =>
      expect(updateBinding).toHaveBeenCalledWith({
        integrationId: 'comfyui',
        launchPreference: 'launch-new',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '关闭应用详情' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cardOpenButton.getAttribute('aria-pressed')).toBe('false');
    expect(card.getAttribute('data-selected')).toBe('false');
    rendered.unmount();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('uses the native application selector without changing adjacent drafts', async () => {
    const projection = createProjection();
    const selectedProjection: ProfessionalApplicationManagementProjection = {
      ...projection,
      items: [
        {
          ...projection.items[0]!,
          binding: {
            integrationId: 'comfyui',
            applicationLocator: {
              kind: 'application-identity',
              identity: 'com.todesktop.241012ess7yxs0e',
            },
            launchPreference: 'launch-new',
          },
        },
      ],
    };
    const selectApplication = vi.fn(async () => selectedProjection);
    const runtime: ProfessionalApplicationManagementRuntime = {
      identity: { windowId: 'window-1' },
      getSnapshot: vi.fn(async () => projection),
      addBinding: vi.fn(),
      updateBinding: vi.fn(),
      setEnabled: vi.fn(),
      removeBinding: vi.fn(),
      selectApplication,
      launch: vi.fn(),
      dispose: vi.fn(),
    };
    render(
      <I18nProvider service={createI18n()}>
        <ProfessionalApplicationManagementRoot interactive runtime={runtime} />
      </I18nProvider>,
    );

    const card = await screen.findByRole('listitem', { name: 'ComfyUI' });
    expect(screen.queryByText('选择应用…')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: /ComfyUI/u }));
    await waitFor(() => expect(screen.getByText('选择应用…')).toBeTruthy());
    fireEvent.click(screen.getByText('选择应用…'));

    await waitFor(() => expect(selectApplication).toHaveBeenCalledWith('comfyui'));
    expect(screen.getByText('重新选择应用…')).toBeTruthy();
  });

  it('shows a profile-local diagnostic without hiding the card', async () => {
    const runtime: ProfessionalApplicationManagementRuntime = {
      identity: { windowId: 'window-1' },
      getSnapshot: vi.fn(async (): Promise<ProfessionalApplicationManagementProjection> => {
        const projection = createProjection();
        return {
          ...projection,
          items: [
            {
              ...projection.items[0]!,
              readiness: {
                integrationId: 'comfyui',
                state: 'unavailable',
                availableOperationIds: [],
                diagnostics: [{ code: 'profile-probe-failed', message: 'Probe failed visibly.' }],
              },
            },
          ],
        };
      }),
      addBinding: vi.fn(),
      updateBinding: vi.fn(),
      setEnabled: vi.fn(),
      removeBinding: vi.fn(),
      selectApplication: vi.fn(),
      launch: vi.fn(),
      dispose: vi.fn(),
    };

    render(
      <I18nProvider service={createI18n()}>
        <ProfessionalApplicationManagementRoot interactive runtime={runtime} />
      </I18nProvider>,
    );

    const card = await screen.findByRole('listitem', { name: 'ComfyUI' });
    await waitFor(() =>
      expect(within(card).getByRole('alert').textContent).toContain('Probe failed'),
    );
    expect(screen.getByText('ComfyUI')).toBeTruthy();
    expect(screen.queryByText('打开')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: /ComfyUI/u }));
    expect(screen.getByText('打开').hasAttribute('disabled')).toBe(true);
  });

  it('uses a compact heading without repeating the package title', async () => {
    const projection = createProjection();
    const runtime: ProfessionalApplicationManagementRuntime = {
      identity: { windowId: 'window-1' },
      getSnapshot: vi.fn(async () => projection),
      addBinding: vi.fn(),
      updateBinding: vi.fn(),
      setEnabled: vi.fn(),
      removeBinding: vi.fn(),
      selectApplication: vi.fn(),
      launch: vi.fn(),
      dispose: vi.fn(),
    };

    render(
      <I18nProvider service={createI18n()}>
        <ProfessionalApplicationManagementRoot compactHeading interactive runtime={runtime} />
      </I18nProvider>,
    );

    await screen.findByText('ComfyUI');
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('button', { name: '刷新应用' })).toBeNull();
    expect(screen.getByText(/已添加/u)).toBeTruthy();
  });

  it('adds, disables and removes a professional application binding through explicit actions', async () => {
    const unbound = createProjection(false);
    const enabled = createProjection(true);
    const disabled: ProfessionalApplicationManagementProjection = {
      ...enabled,
      items: enabled.items.map((item) => ({ ...item, enabled: false })),
    };
    const addBinding = vi.fn(async () => enabled);
    const setEnabled = vi.fn(async () => disabled);
    const removeBinding = vi.fn(async () => unbound);
    const runtime: ProfessionalApplicationManagementRuntime = {
      identity: { windowId: 'window-1' },
      getSnapshot: vi.fn(async () => unbound),
      addBinding,
      updateBinding: vi.fn(),
      setEnabled,
      removeBinding,
      selectApplication: vi.fn(),
      launch: vi.fn(),
      dispose: vi.fn(),
    };

    render(
      <I18nProvider service={createI18n()}>
        <ProfessionalApplicationManagementRoot compactHeading interactive runtime={runtime} />
      </I18nProvider>,
    );

    const addAction = await screen.findByRole('button', { name: '添加应用' });
    fireEvent.click(addAction);
    const addDialog = await screen.findByRole('dialog');
    fireEvent.click(within(addDialog).getByRole('button', { name: 'ComfyUI' }));
    await waitFor(() => expect(addBinding).toHaveBeenCalledWith('comfyui'));

    const detail = await screen.findByRole('dialog');
    fireEvent.click(within(detail).getByRole('button', { name: '停用' }));
    await waitFor(() => expect(setEnabled).toHaveBeenCalledWith('comfyui', false));
    await waitFor(() =>
      expect(
        document
          .querySelector('.professional-application-row')
          ?.getAttribute('data-lifecycle-state'),
      ).toBe('disabled'),
    );
    expect(within(detail).getByRole('button', { name: '启用' })).toBeTruthy();

    fireEvent.click(within(detail).getByRole('button', { name: '删除绑定' }));
    const confirmation = await screen.findByRole('dialog', { name: '删除应用绑定？' });
    expect(confirmation.textContent).toContain('不会卸载或修改外部应用');
    fireEvent.click(within(confirmation).getByRole('button', { name: '删除绑定' }));
    await waitFor(() => expect(removeBinding).toHaveBeenCalledWith('comfyui'));
    await waitFor(() =>
      expect(screen.getByRole('listitem', { name: 'ComfyUI' }).textContent).toContain('未添加'),
    );
    expect(
      document.querySelector('.professional-application-row')?.getAttribute('data-lifecycle-state'),
    ).toBe('not-added');
  });
});

function createProjection(bound = true): ProfessionalApplicationManagementProjection {
  return {
    identity: { windowId: 'window-1' },
    items: [
      {
        profile: {
          id: 'comfyui',
          name: 'ComfyUI',
          description: 'Local node workflows.',
          category: 'workflow-platform' as const,
          supportedPlatforms: ['macos' as const],
          applicationIdentities: [
            {
              platform: 'macos' as const,
              kind: 'bundle-id' as const,
              value: 'com.todesktop.241012ess7yxs0e',
            },
          ],
          officialDownloadUrl: 'https://github.com/Comfy-Org/Comfy-Desktop/releases',
          configurable: { applicationLocator: true, endpoint: false, defaultWorkflow: false },
          operations: [
            {
              id: 'comfyui.launch',
              label: 'Open',
              kind: 'launch' as const,
              transport: 'host' as const,
              effect: 'launch' as const,
              requiresApproval: false,
              verification: 'launch-receipt' as const,
              inputMimeTypes: [],
            },
          ],
        },
        ...(bound
          ? {
              binding: {
                integrationId: 'comfyui',
                launchPreference: 'reuse-qualified' as const,
              },
            }
          : {}),
        enabled: bound,
        readiness: {
          integrationId: 'comfyui',
          state: 'ready' as const,
          availableOperationIds: ['comfyui.launch'],
          diagnostics: [],
        },
      },
    ],
  };
}

function createI18n(): I18nService {
  const service = new I18nService('zh-cn');
  service.registerBundle(
    'professional-applications',
    'zh-cn',
    professionalApplicationsMessages['zh-cn'],
  );
  return service;
}
