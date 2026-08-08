// @vitest-environment jsdom

import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import {
  createDefaultDesktopWorkbenchLayout,
  openOrFocusMainView,
  setWorkbenchDisplayMode,
} from '@neko/host/desktop-workbench-contract';
import {
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
  parseDesktopWorkbenchSceneProjection,
} from '@neko/host/desktop-scene-contract';
import {
  projectDesktopConversationNavigation,
  resolveActiveDesktopWindowWorkbench,
  type DesktopShellProjection,
  type DesktopShellProjectionEvent,
} from '@neko/host/desktop-shell-contract';
import { createDesktopWindowComposition } from '@neko/host/desktop-window-composition-contract';
import { DEFAULT_DESKTOP_APPLICATION_PREFERENCES } from '@neko/host/application-settings';
import { DesktopApplication } from './DesktopShell';
import { DesktopApplicationSettingsProvider } from './application-settings-context';
import { createDesktopI18n } from './i18n';
import { DesktopExtensionManagementRuntime } from './desktop-extension-management-runtime';
import {
  TEXT_EDITOR_HOST_ROUTES,
  type TextEditorHostRequest,
  type TextEditorHostResult,
} from '@neko/text-editor-domain';
import {
  createDefaultAssetCenterFilter,
  type AssetCenterSessionProjection,
} from '@neko/assets-domain/asset-center/contract';
import type {
  DesktopProjectPortabilityRequest,
  OpenNekoDesktopProjectPortabilityBridge,
} from '@neko/assets-domain/contracts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const rendererInstrumentation = vi.hoisted(() => ({
  extensionRootRender: vi.fn(),
  textEditorRootRender: vi.fn(),
}));

vi.mock('./DesktopExtensionManagementSurface', () => ({
  DesktopExtensionManagementSurface: ({
    runtime,
  }: {
    readonly runtime: DesktopExtensionManagementRuntime;
  }) => {
    rendererInstrumentation.extensionRootRender(runtime.identity.windowId);
    return (
      <div
        data-extension-management-root="agent"
        data-extension-management-window={runtime.identity.windowId}
      />
    );
  },
}));

vi.mock('./DesktopAssetManagementSurface', () => ({
  DesktopAssetManagementSurface: () => <div data-asset-management-root="assets" />,
}));

vi.mock('./DesktopAssetCenterMainSurface', () => ({
  DesktopAssetCenterMainSurface: ({
    projection,
  }: {
    readonly projection: AssetCenterSessionProjection;
  }) => (
    <div
      data-asset-preview-surface="preview-webview-adapter"
      data-preview-session={
        projection.preview.status === 'ready' ? projection.preview.previewSessionId : undefined
      }
    />
  ),
}));

vi.mock('./DesktopTextEditorSurface', () => ({
  DesktopTextEditorSurface: ({ view }: { readonly view: { readonly viewId: string } }) => {
    rendererInstrumentation.textEditorRootRender(view.viewId);
    return <div data-text-editor-root={view.viewId} />;
  },
}));

describe('DesktopApplication scene lifecycle', () => {
  afterEach(() => {
    document.body.replaceChildren();
    rendererInstrumentation.extensionRootRender.mockClear();
    rendererInstrumentation.textEditorRootRender.mockClear();
    vi.restoreAllMocks();
  });

  it('owns one Shell subscription and commits Sidebar state through its sender-bound owner', async () => {
    const projection = createProjection();
    const updateWorkbench = vi.fn();
    const updateApplicationSidebar = vi.fn(async () => ({
      ...projection,
      window: {
        ...projection.window,
        applicationSidebar: {
          ...projection.window.applicationSidebar,
          visible: false,
        },
      },
    }));
    let activeSubscriptions = 0;
    const subscribe = vi.fn(() => {
      activeSubscriptions += 1;
      return () => {
        activeSubscriptions -= 1;
      };
    });
    installBridge({
      projection,
      subscribe,
      updateApplicationSidebar,
      updateWorkbench,
    });
    const { container, root } = await renderApplication(true);

    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(activeSubscriptions).toBe(1);
    expect(container.querySelectorAll('[data-neko-controlled-workbench="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-primary-sidebar="application"]')).toHaveLength(1);

    const collapse = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse sidebar"]',
    );
    if (!collapse) throw new Error('Desktop fixture requires the Sidebar toggle.');
    await act(async () => collapse.click());
    await waitFor(() => updateApplicationSidebar.mock.calls.length === 1);
    expect(updateApplicationSidebar).toHaveBeenCalledWith('window-1', false, 240);
    expect(updateWorkbench).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    expect(activeSubscriptions).toBe(0);
  });

  it.each([
    { label: 'clean', dirty: false, confirmations: [] as boolean[], decision: 'discard' as const },
    { label: 'dirty save', dirty: true, confirmations: [true], decision: 'save' as const },
    {
      label: 'dirty discard',
      dirty: true,
      confirmations: [false, true],
      decision: 'discard' as const,
    },
  ])('closes a $label Text Editor tab through its exact session', async (fixture) => {
    const projection = createTextEditorShellProjection();
    const confirm = vi.spyOn(globalThis, 'confirm');
    for (const response of fixture.confirmations) confirm.mockReturnValueOnce(response);
    const execute = vi.fn(async (request: TextEditorHostRequest): Promise<TextEditorHostResult> =>
      request.route === TEXT_EDITOR_HOST_ROUTES.projectionGet
        ? readyTextEditorResult(request, fixture.dirty)
        : {
            requestId: request.requestId,
            identity: request.identity,
            status: 'closed',
          },
    );
    installBridge({ projection, textEditorExecute: execute });
    const { container, root } = await renderApplication();

    const close = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Close story.fountain"]',
    );
    if (!close) throw new Error('Desktop fixture requires the Text Editor close control.');
    await act(async () => close.click());
    await waitFor(() => execute.mock.calls.length === 2);

    expect(confirm.mock.calls).toHaveLength(fixture.confirmations.length);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
      identity: textEditorRuntimeIdentity(projection),
    });
    expect(execute.mock.calls[1]?.[0]).toMatchObject({
      route: TEXT_EDITOR_HOST_ROUTES.close,
      identity: textEditorRuntimeIdentity(projection),
      decision: fixture.decision,
    });
    await act(async () => root.unmount());
  });

  it('keeps a dirty Text Editor tab when close is cancelled', async () => {
    const projection = createTextEditorShellProjection();
    vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(false);
    const execute = vi.fn(async (request: TextEditorHostRequest): Promise<TextEditorHostResult> =>
      readyTextEditorResult(request, true),
    );
    installBridge({ projection, textEditorExecute: execute });
    const { container, root } = await renderApplication();

    const close = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Close story.fountain"]',
    );
    if (!close) throw new Error('Desktop fixture requires the Text Editor close control.');
    await act(async () => close.click());
    await waitFor(() => execute.mock.calls.length === 1);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-text-editor-root="text-editor:view-1"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('keeps the exact Text Editor tab and reports a save conflict during close', async () => {
    const projection = createTextEditorShellProjection();
    const getSnapshot = vi.fn(async () => projection);
    vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(true);
    const execute = vi.fn(async (request: TextEditorHostRequest): Promise<TextEditorHostResult> => {
      if (request.route === TEXT_EDITOR_HOST_ROUTES.projectionGet) {
        return readyTextEditorResult(request, true);
      }
      return {
        requestId: request.requestId,
        identity: request.identity,
        status: 'rejected',
        diagnostic: { code: 'text-document-save-conflict', severity: 'error' },
      };
    });
    installBridge({ projection, getSnapshot, textEditorExecute: execute });
    const { container, root } = await renderApplication();

    const close = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Close story.fountain"]',
    );
    if (!close) throw new Error('Desktop fixture requires the Text Editor close control.');
    await act(async () => close.click());
    await waitFor(() => container.querySelector('[role="alert"]') !== null);

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'text-document-save-conflict',
    );
    expect(container.querySelector('[data-text-editor-root="text-editor:view-1"]')).not.toBeNull();
    expect(getSnapshot).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it('uses one committed projection event to switch Settings without a success refresh', async () => {
    const assistant = createProjection();
    const settings = withActiveScene(
      {
        ...assistant,
        window: {
          ...assistant.window,
        },
      },
      settingsScene(),
    );
    let listener: ((event: DesktopShellProjectionEvent) => void) | undefined;
    const getSnapshot = vi.fn(async () => assistant);
    const transition = vi.fn(async () => {
      queueMicrotask(() =>
        listener?.({
          applicationInstanceId: settings.applicationInstanceId,
          windowId: settings.window.windowId,
          rendererSessionId: settings.rendererSessionId,
          sequence: 1,
          projection: settings,
        }),
      );
      return {
        status: 'transitioned' as const,
        requestId: 'transition-1',
        scene: activeScene(settings),
      };
    });
    installBridge({
      projection: assistant,
      getSnapshot,
      subscribe: vi.fn((next) => {
        listener = next;
        return () => undefined;
      }),
      transition,
    });
    const { container, root } = await renderApplication();
    const workbench = container.querySelector('[data-neko-controlled-workbench="true"]');
    const sidebar = container.querySelector('[data-primary-sidebar="application"]');
    const settingsButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Desktop settings"]',
    );
    if (!workbench || !sidebar || !settingsButton) {
      throw new Error('Desktop fixture requires Workbench navigation.');
    }

    await act(async () => settingsButton.click());
    await waitFor(() => container.querySelector('[data-settings-surface="main"]') !== null);
    expect(transition).toHaveBeenCalledWith(
      'window-1',
      { kind: 'open-settings' },
      activeScene(assistant).sceneId,
    );
    expect(container.querySelector('[data-neko-controlled-workbench="true"]')).toBe(workbench);
    expect(container.querySelector('[data-primary-sidebar="application"]')).toBe(sidebar);
    expect(container.querySelector('[data-settings-surface="navigation"]')).not.toBeNull();
    expect(container.querySelector('[data-settings-surface="main"]')).not.toBeNull();
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('recovers from a renderer-session replacement through one authoritative snapshot', async () => {
    const initial = createProjection();
    const replacement: DesktopShellProjection = {
      ...withActiveScene(initial, settingsScene()),
      rendererSessionId: 'app-1:window-1:2',
    };
    const replacementEvent: DesktopShellProjection = {
      ...withActiveScene(initial, extensionsScene()),
      rendererSessionId: replacement.rendererSessionId,
    };
    let listener: ((event: DesktopShellProjectionEvent) => void) | undefined;
    const getSnapshot = vi
      .fn<() => Promise<DesktopShellProjection>>()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(replacement);
    installBridge({
      projection: initial,
      getSnapshot,
      subscribe: vi.fn((next) => {
        listener = next;
        return () => undefined;
      }),
    });
    const { container, root } = await renderApplication();

    await act(async () => {
      listener?.({
        applicationInstanceId: replacement.applicationInstanceId,
        windowId: replacement.window.windowId,
        rendererSessionId: replacement.rendererSessionId,
        sequence: 1,
        projection: replacementEvent,
      });
    });
    await waitFor(() => container.querySelector('[data-settings-surface="main"]') !== null);

    expect(getSnapshot).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-extension-management-root="agent"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('rejects an event sequence gap and restores from the authoritative snapshot', async () => {
    const initial = createProjection();
    const extensions = withActiveScene(initial, extensionsScene());
    const skipped = withActiveScene(initial, projectManagementScene());
    const recovered = withActiveScene(initial, settingsScene());
    let listener: ((event: DesktopShellProjectionEvent) => void) | undefined;
    const getSnapshot = vi
      .fn<() => Promise<DesktopShellProjection>>()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(recovered);
    installBridge({
      projection: initial,
      getSnapshot,
      subscribe: vi.fn((next) => {
        listener = next;
        return () => undefined;
      }),
    });
    const { container, root } = await renderApplication();

    await act(async () => {
      listener?.({
        applicationInstanceId: initial.applicationInstanceId,
        windowId: initial.window.windowId,
        rendererSessionId: initial.rendererSessionId,
        sequence: 1,
        projection: extensions,
      });
    });
    expect(container.querySelector('[data-extension-management-root="agent"]')).not.toBeNull();

    await act(async () => {
      listener?.({
        applicationInstanceId: initial.applicationInstanceId,
        windowId: initial.window.windowId,
        rendererSessionId: initial.rendererSessionId,
        sequence: 3,
        projection: skipped,
      });
    });
    await waitFor(() => container.querySelector('[data-settings-surface="main"]') !== null);

    expect(getSnapshot).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-project-management-surface="main"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('recovers from a failed scene mutation and dismisses its transient error', async () => {
    vi.useFakeTimers();
    try {
      const initial = createProjection();
      const recovered = withActiveScene(initial, settingsScene());
      const getSnapshot = vi
        .fn<() => Promise<DesktopShellProjection>>()
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(recovered);
      const transition = vi.fn(async () => {
        throw new Error('Scene transition failed before commit.');
      });
      installBridge({ projection: initial, getSnapshot, transition });
      const { container, root } = await renderApplication();
      const assetCenter = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent?.trim() === 'Asset Center',
      );
      if (!assetCenter) throw new Error('Desktop fixture requires Asset Center navigation.');

      await act(async () => assetCenter.click());
      await waitFor(() => container.querySelector('[data-settings-surface="main"]') !== null);

      expect(getSnapshot).toHaveBeenCalledTimes(2);
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'Scene transition failed before commit.',
      );
      expect(container.querySelector('[data-asset-management-root="assets"]')).toBeNull();
      await act(async () => vi.advanceTimersByTime(6_000));
      expect(container.querySelector('[role="alert"]')).toBeNull();
      await act(async () => root.unmount());
    } finally {
      vi.useRealTimers();
    }
  });

  it('routes every Start Creating action to a fresh Host-owned Entry Draft transition', async () => {
    const projection = createProjection();
    const transition = vi.fn(async () => ({
      status: 'transitioned' as const,
      requestId: 'start-creating-1',
      scene: activeScene(projection),
    }));
    installBridge({ projection, transition });
    const { container, root } = await renderApplication();
    const startCreating = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Start creating',
    );
    if (!startCreating) throw new Error('Desktop fixture requires Start Creating navigation.');

    await act(async () => startCreating.click());
    await waitFor(() => transition.mock.calls.length === 1);

    expect(transition).toHaveBeenCalledWith(
      'window-1',
      { kind: 'open-agent-entry' },
      activeScene(projection).sceneId,
    );
    await act(async () => root.unmount());
  });

  it('shows owner-qualified unavailable without replacing the current scene', async () => {
    const projection = createProjection();
    const getSnapshot = vi.fn(async () => projection);
    const transition = vi.fn(async () => ({
      status: 'unavailable' as const,
      requestId: 'transition-1',
      diagnostic: {
        code: 'desktop-scene-owner-unavailable' as const,
        severity: 'error' as const,
        message: 'Asset Center owner is unavailable.',
        metadata: {
          owner: 'workspace-authority' as const,
          intentKind: 'open-workspace' as const,
        },
      },
    }));
    installBridge({ projection, getSnapshot, transition });
    const { container, root } = await renderApplication();
    const assetCenter = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Asset Center',
    );
    if (!assetCenter) throw new Error('Desktop fixture requires Asset Center navigation.');
    await act(async () => assetCenter.click());
    await waitFor(() => container.textContent?.includes('Asset Center owner is unavailable.'));

    expect(transition).toHaveBeenCalledWith(
      'window-1',
      { kind: 'open-asset-center' },
      activeScene(projection).sceneId,
    );
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Connecting to Agent');
    await act(async () => root.unmount());
  });

  it('shows a rejected stored Window briefly while keeping the new Workbench usable', async () => {
    vi.useFakeTimers();
    try {
      const projection: DesktopShellProjection = {
        ...createProjection(),
        stateDiagnostics: [
          {
            code: 'desktop-stored-window-invalid',
            severity: 'error',
            windowId: 'window:old',
            message: "Stored Window 'window:old' is unavailable and was not opened.",
          },
        ],
      };
      let listener: ((event: DesktopShellProjectionEvent) => void) | undefined;
      installBridge({
        projection,
        subscribe: vi.fn((next) => {
          listener = next;
          return () => undefined;
        }),
      });

      const { container, root } = await renderApplication();

      const alert = container.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain(
        'Saved workspace window window:old is no longer compatible and was not opened.',
      );
      expect(alert?.getAttribute('title')).toBe(
        "Stored Window 'window:old' is unavailable and was not opened.",
      );
      expect(container.querySelector('[data-neko-controlled-workbench="true"]')).not.toBeNull();
      expect(container.querySelector('.agent-workspace')).not.toBeNull();
      await act(async () => vi.advanceTimersByTime(6_000));
      expect(container.querySelector('[role="alert"]')).toBeNull();
      await act(async () => {
        listener?.({
          applicationInstanceId: projection.applicationInstanceId,
          windowId: projection.window.windowId,
          rendererSessionId: projection.rendererSessionId,
          sequence: 1,
          projection: withActiveScene(projection, settingsScene()),
        });
      });
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.querySelector('[data-settings-surface="main"]')).not.toBeNull();
      await act(async () => root.unmount());
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a rejected Shell authority diagnostic while keeping the new Workbench usable', async () => {
    const projection: DesktopShellProjection = {
      ...createProjection(),
      stateDiagnostics: [
        {
          code: 'desktop-stored-state-invalid',
          severity: 'error',
          authorityKey: 'desktop.shell',
          rejectionId: 3,
          message: 'Stored Desktop Shell state was rejected: removed root field.',
        },
      ],
    };
    installBridge({ projection });

    const { container, root } = await renderApplication();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      'The saved workspace state is no longer compatible and was safely isolated.',
    );
    expect(alert?.getAttribute('title')).toBe(
      'Stored Desktop Shell state was rejected: removed root field.',
    );
    expect(container.querySelector('[data-neko-controlled-workbench="true"]')).not.toBeNull();
    expect(container.querySelector('.agent-workspace')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('shows retained Shell metadata while keeping the restored Workbench usable', async () => {
    const projection: DesktopShellProjection = {
      ...createProjection(),
      stateDiagnostics: [
        {
          code: 'desktop-stored-state-metadata-retained',
          severity: 'warning',
          authorityKey: 'desktop.shell',
          fieldNames: ['opaqueSourceMarker'],
          message: 'Desktop Shell root metadata was preserved without interpretation.',
        },
      ],
    };
    installBridge({ projection });

    const { container, root } = await renderApplication();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      'Unrecognized workspace metadata was preserved (opaqueSourceMarker).',
    );
    expect(alert?.getAttribute('title')).toBe(
      'Desktop Shell root metadata was preserved without interpretation.',
    );
    expect(container.querySelector('[data-neko-controlled-workbench="true"]')).not.toBeNull();
    expect(container.querySelector('.agent-workspace')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('shows retained Application Settings metadata while keeping the Workbench usable', async () => {
    const projection: DesktopShellProjection = {
      ...createProjection(),
      stateDiagnostics: [
        {
          code: 'desktop-stored-state-metadata-retained',
          severity: 'warning',
          authorityKey: 'desktop.application-settings',
          fieldNames: ['opaqueSourceMarker'],
          message: 'Desktop application settings metadata was preserved without interpretation.',
        },
      ],
    };
    installBridge({ projection });

    const { container, root } = await renderApplication();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      'Unrecognized application settings metadata was preserved (opaqueSourceMarker).',
    );
    expect(alert?.getAttribute('title')).toBe(
      'Desktop application settings metadata was preserved without interpretation.',
    );
    expect(container.querySelector('[data-neko-controlled-workbench="true"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('dismisses retained metadata after startup and does not show it again after a Scene change', async () => {
    vi.useFakeTimers();
    try {
      const projection: DesktopShellProjection = {
        ...createProjection(),
        stateDiagnostics: [
          {
            code: 'desktop-stored-state-metadata-retained',
            severity: 'warning',
            authorityKey: 'desktop.application-settings',
            fieldNames: ['unrecognizedSettingForNotice'],
            message: 'Desktop application settings metadata was preserved without interpretation.',
          },
        ],
      };
      let listener: ((event: DesktopShellProjectionEvent) => void) | undefined;
      installBridge({
        projection,
        subscribe: vi.fn((next) => {
          listener = next;
          return () => undefined;
        }),
      });
      const { container, root } = await renderApplication();

      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'unrecognizedSettingForNotice',
      );
      await act(async () => {
        vi.advanceTimersByTime(6_000);
      });
      expect(container.querySelector('[role="alert"]')).toBeNull();

      await act(async () => {
        listener?.({
          applicationInstanceId: projection.applicationInstanceId,
          windowId: projection.window.windowId,
          rendererSessionId: projection.rendererSessionId,
          sequence: 1,
          projection: withActiveScene(projection, settingsScene()),
        });
      });
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.querySelector('[data-settings-surface="main"]')).not.toBeNull();
      await act(async () => root.unmount());
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets the user dismiss retained metadata immediately', async () => {
    const projection: DesktopShellProjection = {
      ...createProjection(),
      stateDiagnostics: [
        {
          code: 'desktop-stored-state-metadata-retained',
          severity: 'warning',
          authorityKey: 'desktop.shell',
          fieldNames: ['opaqueSourceMarker'],
          message: 'Desktop Shell root metadata was preserved without interpretation.',
        },
      ],
    };
    installBridge({ projection });
    const { container, root } = await renderApplication();

    const dismiss = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss notification"]',
    );
    if (!dismiss) throw new Error('Desktop notice requires a dismiss action.');
    await act(async () => dismiss.click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('shows a rejected Application Settings diagnostic while keeping the Workbench usable', async () => {
    const projection: DesktopShellProjection = {
      ...createProjection(),
      stateDiagnostics: [
        {
          code: 'desktop-stored-state-invalid',
          severity: 'error',
          authorityKey: 'desktop.application-settings',
          rejectionId: 4,
          message: 'Stored Desktop application settings were rejected.',
        },
      ],
    };
    installBridge({ projection });

    const { container, root } = await renderApplication();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      'The saved application settings are no longer compatible and were safely isolated.',
    );
    expect(alert?.getAttribute('title')).toBe('Stored Desktop application settings were rejected.');
    expect(container.querySelector('[data-neko-controlled-workbench="true"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('shows an invalid Conversation diagnostic while keeping the recovered draft usable', async () => {
    const projection: DesktopShellProjection = {
      ...createProjection(),
      agentHome: {
        ...createProjection().agentHome,
        diagnostics: [
          {
            code: 'invalid-conversation-record',
            workspaceId: 'assistant-space:local-user',
            conversationId: 'conversation:invalid-owner',
            message:
              "Agent catalog Conversation 'conversation:invalid-owner' Workspace context resolves to an Assistant Space.",
          },
        ],
      },
    };
    installBridge({ projection });

    const { container, root } = await renderApplication();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      "Saved conversation 'conversation:invalid-owner' is no longer compatible and was isolated.",
    );
    expect(alert?.textContent).not.toContain('Workspace context resolves to an Assistant Space');
    expect(alert?.getAttribute('title')).toContain('conversation:invalid-owner');
    expect(container.querySelector('[data-neko-controlled-workbench="true"]')).not.toBeNull();
    expect(container.querySelector('.agent-workspace')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('applies exact Shell events without creating another Workbench owner', async () => {
    const projection = createProjection();
    let listener: ((event: DesktopShellProjectionEvent) => void) | undefined;
    installBridge({
      projection,
      subscribe: vi.fn((next) => {
        listener = next;
        return () => undefined;
      }),
    });
    const { container, root } = await renderApplication();
    const workbench = container.querySelector('[data-neko-controlled-workbench="true"]');
    const settings = withActiveScene(
      {
        ...projection,
        window: {
          ...projection.window,
        },
      },
      settingsScene(),
    );
    await act(async () => {
      listener?.({
        applicationInstanceId: projection.applicationInstanceId,
        windowId: projection.window.windowId,
        rendererSessionId: 'renderer-session-1',
        sequence: 1,
        projection: settings,
      });
    });
    expect(container.querySelector('[data-neko-controlled-workbench="true"]')).toBe(workbench);
    expect(container.querySelector('[data-settings-surface="main"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('disposes the exact Extensions runtime when Settings replaces its Scene slots', async () => {
    const assistant = createProjection();
    const projection = withActiveScene(assistant, extensionsScene());
    let listener: ((event: DesktopShellProjectionEvent) => void) | undefined;
    const dispose = vi.spyOn(DesktopExtensionManagementRuntime.prototype, 'dispose');
    installBridge({
      projection,
      subscribe: vi.fn((next) => {
        listener = next;
        return () => undefined;
      }),
    });
    const { container, root } = await renderApplication();
    expect(container.querySelector('[data-extension-management-window="window-1"]')).not.toBeNull();

    const settings = withActiveScene(
      {
        ...projection,
        window: {
          ...projection.window,
        },
      },
      settingsScene(),
    );
    await act(async () => {
      listener?.({
        applicationInstanceId: projection.applicationInstanceId,
        windowId: projection.window.windowId,
        rendererSessionId: 'renderer-session-1',
        sequence: 1,
        projection: settings,
      });
    });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-extension-management-root="agent"]')).toBeNull();
    expect(container.querySelector('[data-settings-surface="main"]')).not.toBeNull();
    const extensionRenderCount = rendererInstrumentation.extensionRootRender.mock.calls.length;

    await act(async () => {
      listener?.({
        applicationInstanceId: projection.applicationInstanceId,
        windowId: projection.window.windowId,
        rendererSessionId: projection.rendererSessionId,
        sequence: 2,
        projection: withActiveScene(settings, settingsScene()),
      });
    });
    expect(rendererInstrumentation.extensionRootRender).toHaveBeenCalledTimes(extensionRenderCount);
    expect(dispose).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('composes Asset management and Preview with shared panels and a resizable compact split', async () => {
    const base = createProjection();
    const assetCenterSessionId = 'asset-center:window-1:1';
    const scene = assetCenterPreviewScene();
    const projection = withActiveScene(base, scene);
    const sessionProjection: AssetCenterSessionProjection = {
      identity: {
        assetCenterSessionId,
        windowId: scene.windowId,
      },
      filter: createDefaultAssetCenterFilter(),
      catalog: { status: 'loading' },
      preview: {
        status: 'ready',
        itemId: 'global-asset-library:item-1',
        previewSessionId: 'preview:asset-center:1',
      },
    };
    const assetCenterExecute = vi.fn(
      async (request: { readonly requestId: string; readonly route: string }) => ({
        requestId: request.requestId,
        route: request.route,
        projection: sessionProjection,
      }),
    );
    installBridge({ projection, assetCenterExecute });

    const { container, root } = await renderApplication(true);
    await waitFor(
      () => container.querySelector('[data-preview-session="preview:asset-center:1"]') !== null,
    );

    expectManagementSplit(container, 'asset-management', 'asset-preview');
    expect(
      container
        .querySelector('[data-neko-controlled-workbench="true"]')
        ?.getAttribute('data-interaction-presentation'),
    ).toBe('hidden');
    expect(container.querySelector('[data-asset-management-root="assets"]')).not.toBeNull();
    expect(
      container.querySelector('[data-asset-preview-surface="preview-webview-adapter"]'),
    ).not.toBeNull();
    await act(async () => root.unmount());
    await act(async () => Promise.resolve());
    expect(assetCenterExecute.mock.calls.map(([request]) => request.route)).toEqual([
      'attach',
      'session.detach',
    ]);
  });

  it('keeps low-information Project selection in the full management Main', async () => {
    const base = createProjection();
    const project = {
      projectId: 'content:workspace-1',
      workspaceId: 'workspace-1',
      profile: 'content' as const,
      displayName: 'Project one',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
    };
    const projection = withActiveScene(
      {
        ...base,
        catalog: { projects: [project] },
      },
      projectManagementScene(),
    );
    installBridge({ projection });

    const { container, root } = await renderApplication();
    const projectButton = container.querySelector<HTMLButtonElement>(
      '.management-surface-row__select',
    );
    if (!projectButton) throw new Error('Project management fixture requires a Project row.');
    await act(async () => projectButton.click());
    await waitFor(() => projectButton.getAttribute('aria-pressed') === 'true');

    const shell = container.querySelector<HTMLElement>('[data-neko-controlled-workbench="true"]');
    expect(shell?.dataset.mainSplit).toBe('none');
    expect(shell?.dataset.mainComposition).toBe('continuous');
    expect(container.querySelector('[data-workbench-main-panel="project-detail"]')).toBeNull();
    expect(
      container.querySelector('[data-workbench-main-shell="secondary"]')?.hasAttribute('hidden'),
    ).toBe(true);
    expect(container.querySelector('[data-workbench-main-gutter="true"]')).toBeNull();
    expect(container.querySelector('[aria-label="Open project: Project one"]')).toBeNull();
    expect(container.querySelectorAll('.management-surface-row-actions button')).toHaveLength(2);
    expect(projectButton.closest('[data-project-id="content:workspace-1"]')).not.toBeNull();
    expect(container.textContent).toContain('Project one');
    await act(async () => root.unmount());
  });

  it('retains empty Projects as exact Workspace navigation without a disclosure control', async () => {
    const base = createProjection();
    const project = {
      projectId: 'content:empty-workspace',
      workspaceId: 'empty-workspace',
      profile: 'content' as const,
      displayName: 'Empty project',
      createdAt: '2026-08-07T00:00:00.000Z',
      updatedAt: '2026-08-07T00:00:00.000Z',
    };
    const catalogOnlyProject = {
      ...project,
      projectId: 'content:catalog-only-workspace',
      workspaceId: 'catalog-only-workspace',
      displayName: 'Catalog only project',
    };
    const catalog = { projects: [project, catalogOnlyProject] };
    const agentHome = {
      conversations: [],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    } as const;
    const projection: DesktopShellProjection = {
      ...base,
      catalog,
      agentHome,
      conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome, [
        project.projectId,
      ]),
    };
    const transition = vi.fn(async () => ({
      status: 'transitioned' as const,
      requestId: 'empty-project-transition',
      scene: activeScene(projection),
    }));
    installBridge({ projection, transition });

    const { container, root } = await renderApplication();
    const projectSection = container.querySelector<HTMLElement>(
      '[data-navigation-section="projects"]',
    );
    const conversationSection = container.querySelector<HTMLElement>(
      '[data-navigation-section="conversations"]',
    );
    const group = container.querySelector<HTMLElement>(
      '.primary-conversation-group[data-group-kind="project"]',
    );
    const projectButton = group?.querySelector<HTMLButtonElement>('.home-project-link');
    const newConversationButton = group?.querySelector<HTMLButtonElement>(
      'button[aria-label="New conversation in Empty project"]',
    );
    const cleanupButton = group?.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete Workspace conversations for Empty project"]',
    );
    if (!group || !projectButton || !newConversationButton || !cleanupButton) {
      throw new Error('Desktop fixture requires empty Project navigation actions.');
    }
    if (!projectSection || !conversationSection) {
      throw new Error('Desktop fixture requires current navigation sections.');
    }

    expect(projectSection.querySelector('.home-sidebar-heading')?.textContent).toBe('Projects1');
    expect(conversationSection.querySelector('.home-sidebar-heading')?.textContent).toBe(
      'Conversations0',
    );
    expect(projectSection.contains(group)).toBe(true);
    expect(
      projectSection.compareDocumentPosition(conversationSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(projectButton.textContent).toContain(project.displayName);
    expect(container.textContent).not.toContain(catalogOnlyProject.displayName);
    expect(group.querySelector('.primary-conversation-group__count')?.textContent).toBe('0');
    expect(group.querySelector('.primary-recent-conversation-row')).toBeNull();
    expect(group.querySelector('.primary-conversation-group__collapse')).toBeNull();
    expect(group.querySelector('.primary-conversation-group__collapse-spacer')).not.toBeNull();
    expect(cleanupButton.disabled).toBe(true);

    await act(async () => projectButton.click());
    await waitFor(() => transition.mock.calls.length === 1);
    await act(async () => newConversationButton.click());
    await waitFor(() => transition.mock.calls.length === 2);
    expect(transition).toHaveBeenNthCalledWith(
      1,
      projection.window.windowId,
      { kind: 'open-project-workspace', projectId: project.projectId },
      activeScene(projection).sceneId,
    );
    expect(transition).toHaveBeenNthCalledWith(
      2,
      projection.window.windowId,
      { kind: 'open-project-workspace', projectId: project.projectId },
      activeScene(projection).sceneId,
    );

    await act(async () => root.unmount());
  });

  it('routes recent Project and conversation actions with their exact projection identities', async () => {
    const base = createProjection();
    const project = {
      projectId: 'content:workspace-1',
      workspaceId: 'workspace-1',
      profile: 'content' as const,
      displayName: 'Project one',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
    };
    const conversation = {
      navigation: {
        conversationId: 'conversation-1',
        owner: { kind: 'workspace' as const, workspaceId: project.workspaceId },
      },
      title: 'Conversation one',
      updatedAt: '2026-07-29T00:00:00.000Z',
      attention: 'none' as const,
      lastActivity: {
        kind: 'conversation-updated' as const,
        occurredAt: '2026-07-29T00:00:00.000Z',
      },
    };
    const catalog = { projects: [project] };
    const agentHome = {
      conversations: [conversation],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    } as const;
    const projection: DesktopShellProjection = {
      ...base,
      catalog,
      agentHome,
      conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome, []),
    };
    const transition = vi.fn(async (_windowId: string, _intent: unknown, _sceneId: string) => ({
      status: 'transitioned' as const,
      requestId: 'recent-transition',
      scene: activeScene(projection),
    }));
    const deleteConversation = vi.fn(async () => projection);
    const removedProjection: DesktopShellProjection = {
      ...projection,
      catalog: { projects: [] },
      conversationNavigation: projectDesktopConversationNavigation({ projects: [] }, agentHome, []),
    };
    const removeProjects = vi.fn(async () => removedProjection);
    const deleteProjectConversations = vi.fn(async () => projection);
    installBridge({
      projection,
      transition,
      deleteConversation,
      deleteProjectConversations,
      removeProjects,
    });
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const { container, root } = await renderApplication();

    const projectButton = [
      ...container.querySelectorAll<HTMLButtonElement>('.home-project-link'),
    ].find((button) => button.textContent?.includes(project.displayName));
    const conversationButton = [
      ...container.querySelectorAll<HTMLButtonElement>('.home-project-link'),
    ].find((button) => button.textContent?.includes(conversation.title));
    const newConversationButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="New conversation in Project one"]',
    );
    if (!projectButton || !conversationButton || !newConversationButton) {
      throw new Error('Desktop fixture requires recent Project and conversation actions.');
    }
    expect(
      projectButton.querySelector('.primary-conversation-group__identity-icon.is-project'),
    ).not.toBeNull();
    expect(
      conversationButton.querySelector(
        '.primary-conversation-group__identity-icon.is-conversation',
      ),
    ).not.toBeNull();
    await act(async () => projectButton.click());
    await waitFor(() => transition.mock.calls.length === 1);
    await act(async () => newConversationButton.click());
    await waitFor(() => transition.mock.calls.length === 2);
    await act(async () => conversationButton.click());
    await waitFor(() => transition.mock.calls.length === 3);
    expect(transition).toHaveBeenNthCalledWith(
      1,
      projection.window.windowId,
      { kind: 'open-project-workspace', projectId: project.projectId },
      activeScene(projection).sceneId,
    );
    expect(transition).toHaveBeenNthCalledWith(
      2,
      projection.window.windowId,
      { kind: 'open-project-workspace', projectId: project.projectId },
      activeScene(projection).sceneId,
    );
    expect(transition).toHaveBeenNthCalledWith(
      3,
      projection.window.windowId,
      { kind: 'restore-conversation', navigation: conversation.navigation },
      activeScene(projection).sceneId,
    );

    const collapseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse Project one"]',
    );
    if (!collapseButton) throw new Error('Desktop fixture requires Project group collapse.');
    await act(async () => collapseButton.click());
    expect(
      container.querySelector(
        '.primary-conversation-group[data-group-kind="project"] .primary-recent-conversation-row',
      ),
    ).toBeNull();
    expect(collapseButton.getAttribute('aria-expanded')).toBe('false');
    await act(async () => collapseButton.click());
    expect(collapseButton.getAttribute('aria-expanded')).toBe('true');

    const cleanupProjectButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete Workspace conversations for Project one"]',
    );
    const removeProjectButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Project one"]',
    );
    const deleteButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete conversation Conversation one"]',
    );
    if (!cleanupProjectButton || !removeProjectButton || !deleteButton) {
      throw new Error('Desktop fixture requires Project removal and conversation cleanup actions.');
    }
    await act(async () => deleteButton.click());
    await waitFor(() => deleteConversation.mock.calls.length === 1);
    expect(deleteConversation).toHaveBeenCalledWith([conversation.navigation]);
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
    await act(async () => cleanupProjectButton.click());
    expect(deleteProjectConversations).not.toHaveBeenCalled();
    await act(async () => cleanupProjectButton.click());
    await waitFor(() => deleteProjectConversations.mock.calls.length === 1);
    expect(deleteProjectConversations).toHaveBeenCalledWith([project.projectId]);
    expect(confirm).toHaveBeenCalledWith(
      'Permanently delete 1 Workspace conversations for “Project one”? The project and its files will be retained.',
    );
    await act(async () => removeProjectButton.click());
    await waitFor(() => removeProjects.mock.calls.length === 1);
    expect(removeProjects).toHaveBeenCalledWith([project.projectId]);
    expect(confirm).toHaveBeenCalledWith(
      'Remove “Project one” from OpenNeko? Its conversations and files will be retained.',
    );
    await waitFor(
      () =>
        container.querySelector('.primary-conversation-group[data-group-kind="project"]') === null,
    );
    await act(async () => root.unmount());
  });

  it('routes Project and Conversation context-menu actions through their exact existing commands', async () => {
    const base = createProjection();
    const project = {
      projectId: 'content:context-menu-project',
      workspaceId: 'workspace-context-menu-project',
      profile: 'content' as const,
      displayName: 'Context menu project',
      createdAt: '2026-08-07T00:00:00.000Z',
      updatedAt: '2026-08-07T00:00:00.000Z',
    };
    const conversation = createSidebarConversation(
      project.workspaceId,
      'context-menu',
      'Context menu conversation',
      'none',
    );
    const catalog = { projects: [project] };
    const agentHome = {
      conversations: [conversation],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    } as const;
    const projection: DesktopShellProjection = {
      ...base,
      catalog,
      agentHome,
      conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome, []),
    };
    const transition = vi.fn(async () => ({
      status: 'transitioned' as const,
      requestId: 'context-menu-transition',
      scene: activeScene(projection),
    }));
    const deleteConversation = vi.fn(async () => projection);
    const removeProjects = vi.fn(async () => projection);
    const deleteProjectConversations = vi.fn(async () => projection);
    const inspectPortability = vi.fn(async (request: DesktopProjectPortabilityRequest) => ({
      requestId: request.requestId,
      identity: request.identity,
      portability: {
        state: 'linked-ready' as const,
        requirementFingerprint: 'requirements:empty',
        libraries: [],
      },
    }));
    const projectPortability = {
      inspect: inspectPortability,
      plan: vi.fn(),
      resume: vi.fn(),
      execute: vi.fn(),
      cancel: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    } satisfies OpenNekoDesktopProjectPortabilityBridge['projectPortability'];
    installBridge({
      projection,
      transition,
      deleteConversation,
      removeProjects,
      deleteProjectConversations,
      projectPortability,
    });
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const { container, root } = await renderApplication();

    const projectRow = container.querySelector<HTMLElement>(
      '.primary-conversation-group[data-group-kind="project"] .primary-conversation-group__header',
    );
    const conversationRow = container.querySelector<HTMLElement>(
      '.primary-conversation-group[data-group-kind="project"] .primary-recent-conversation-row',
    );
    if (!projectRow || !conversationRow) {
      throw new Error('Desktop fixture requires Project and Conversation context-menu rows.');
    }
    expect(
      projectRow.querySelectorAll(':scope > .primary-navigation-row-actions button'),
    ).toHaveLength(3);
    expect(
      conversationRow.querySelectorAll(':scope > .primary-navigation-row-actions button'),
    ).toHaveLength(1);
    expect(container.querySelectorAll('.home-navigation-footer__actions button')).toHaveLength(1);

    await openContextMenu(projectRow);
    await selectContextMenuItem('Open project');
    await waitFor(() => transition.mock.calls.length === 1);
    expect(transition).toHaveBeenLastCalledWith(
      projection.window.windowId,
      { kind: 'open-project-workspace', projectId: project.projectId },
      activeScene(projection).sceneId,
    );

    await openContextMenu(projectRow);
    await selectContextMenuItem('New conversation in Context menu project');
    await waitFor(() => transition.mock.calls.length === 2);
    expect(transition).toHaveBeenLastCalledWith(
      projection.window.windowId,
      { kind: 'open-project-workspace', projectId: project.projectId },
      activeScene(projection).sceneId,
    );

    await openContextMenu(projectRow);
    await selectContextMenuItem('Project management');
    await waitFor(() => transition.mock.calls.length === 3);
    expect(transition).toHaveBeenLastCalledWith(
      projection.window.windowId,
      { kind: 'open-project-management' },
      activeScene(projection).sceneId,
    );

    await openContextMenu(projectRow);
    await selectContextMenuItem('Project portability');
    await waitFor(() => inspectPortability.mock.calls.length === 1);
    expect(inspectPortability).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: {
          projectId: project.projectId,
          workspaceId: project.workspaceId,
          windowId: projection.window.windowId,
          rendererSessionId: projection.rendererSessionId,
        },
      }),
    );
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'Linked media is available on this machine.',
    );
    const closePortability = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Close project portability"]',
    );
    if (!closePortability) throw new Error('Project portability dialog requires a close command.');
    await act(async () => closePortability.click());

    await openContextMenu(projectRow);
    await selectContextMenuItem('Delete Workspace conversations for Context menu project');
    await waitFor(() => deleteProjectConversations.mock.calls.length === 1);
    expect(deleteProjectConversations).toHaveBeenCalledWith([project.projectId]);

    await openContextMenu(projectRow);
    await selectContextMenuItem('Remove Context menu project');
    await waitFor(() => removeProjects.mock.calls.length === 1);
    expect(removeProjects).toHaveBeenCalledWith([project.projectId]);

    await openContextMenu(conversationRow);
    await selectContextMenuItem('Open conversation');
    await waitFor(() => transition.mock.calls.length === 4);
    expect(transition).toHaveBeenLastCalledWith(
      projection.window.windowId,
      { kind: 'restore-conversation', navigation: conversation.navigation },
      activeScene(projection).sceneId,
    );

    await openContextMenu(conversationRow);
    await selectContextMenuItem('Delete conversation');
    await waitFor(() => deleteConversation.mock.calls.length === 1);
    expect(deleteConversation).toHaveBeenCalledWith([conversation.navigation]);

    await act(async () => root.unmount());
  });

  it('disables unavailable context navigation and shows icon-only exact Conversation execution attention', async () => {
    const base = createProjection();
    const project = {
      projectId: 'content:execution-state-project',
      workspaceId: 'workspace-execution-state-project',
      profile: 'content' as const,
      displayName: 'Execution state project',
      createdAt: '2026-08-07T00:00:00.000Z',
      updatedAt: '2026-08-07T00:00:00.000Z',
    };
    const conversations = [
      createSidebarConversation(project.workspaceId, 'running', 'Running task', 'running'),
      createSidebarConversation(project.workspaceId, 'input', 'Input task', 'needs-input'),
      createSidebarConversation(project.workspaceId, 'review', 'Review task', 'needs-review'),
      createSidebarConversation(project.workspaceId, 'idle', 'Idle task', 'none'),
      {
        ...createSidebarConversation(
          project.workspaceId,
          'unavailable-running',
          'Unavailable running task',
          'running',
        ),
        unavailable: {
          fieldNames: ['context'],
          message: 'Conversation context is unavailable.',
        },
      },
    ] as const;
    const catalog = { projects: [project] };
    const agentHome = {
      conversations,
      attention: { needsInput: 1, needsReview: 1, running: 2 },
    } as const;
    const projection: DesktopShellProjection = {
      ...base,
      catalog,
      agentHome,
      conversationNavigation: projectDesktopConversationNavigation(
        catalog,
        agentHome,
        catalog.projects.map((project) => project.projectId),
      ),
    };
    const transition = vi.fn(async () => ({
      status: 'transitioned' as const,
      requestId: 'execution-status-transition',
      scene: activeScene(projection),
    }));
    const deleteConversation = vi.fn(async () => projection);
    installBridge({ projection, transition, deleteConversation });
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const { container, root } = await renderApplication();

    expect(readConversationStatus(container, 'Running task')).toEqual({
      accessibleName: 'Running',
      iconVisible: true,
      inlineText: '',
    });
    expect(readConversationStatus(container, 'Input task')).toEqual({
      accessibleName: 'Needs input',
      iconVisible: true,
      inlineText: '',
    });
    expect(readConversationStatus(container, 'Review task')).toEqual({
      accessibleName: 'Needs review',
      iconVisible: true,
      inlineText: '',
    });
    expect(readConversationStatus(container, 'Idle task')).toBeUndefined();
    expect(readConversationStatus(container, 'Unavailable running task')).toBeUndefined();

    const unavailableRow = findConversationRow(container, 'Unavailable running task');
    await openContextMenu(unavailableRow);
    const openItem = findContextMenuItem('Open conversation');
    const deleteItem = findContextMenuItem('Delete conversation');
    expect(openItem.hasAttribute('data-disabled')).toBe(true);
    expect(deleteItem.hasAttribute('data-disabled')).toBe(false);
    await act(async () => deleteItem.click());
    await waitFor(() => deleteConversation.mock.calls.length === 1);
    expect(deleteConversation).toHaveBeenCalledWith([conversations[4].navigation]);
    expect(transition).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('keeps unavailable items visible and cleanup-capable without opening them', async () => {
    const base = createProjection();
    const project = {
      projectId: 'content:workspace-unavailable',
      workspaceId: 'workspace-unavailable',
      profile: 'content' as const,
      displayName: 'Unavailable Project',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
      unavailable: {
        fieldNames: ['workspacePath'],
        message: 'The Project workspace is missing.',
      },
    };
    const unavailableConversation = {
      navigation: {
        conversationId: 'conversation-unavailable',
        owner: { kind: 'workspace' as const, workspaceId: project.workspaceId },
      },
      title: 'Unavailable conversation',
      updatedAt: '2026-07-29T00:00:00.000Z',
      attention: 'none' as const,
      lastActivity: {
        kind: 'conversation-updated' as const,
        occurredAt: '2026-07-29T00:00:00.000Z',
      },
      unavailable: {
        fieldNames: ['context'],
        message: 'Conversation context is missing.',
      },
    };
    const validConversation = {
      navigation: {
        conversationId: 'conversation-valid',
        owner: {
          kind: 'assistant' as const,
          assistantSpaceId: 'assistant-space:local-user',
        },
      },
      title: 'Valid conversation',
      updatedAt: '2026-07-28T00:00:00.000Z',
      attention: 'none' as const,
      lastActivity: {
        kind: 'conversation-updated' as const,
        occurredAt: '2026-07-28T00:00:00.000Z',
      },
    };
    const catalog = { projects: [project] };
    const agentHome = {
      conversations: [unavailableConversation, validConversation],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    } as const;
    const projection: DesktopShellProjection = {
      ...base,
      catalog,
      agentHome,
      conversationNavigation: projectDesktopConversationNavigation(
        catalog,
        agentHome,
        catalog.projects.map((project) => project.projectId),
      ),
    };
    const transition = vi.fn(async () => ({
      status: 'transitioned' as const,
      requestId: 'valid-transition',
      scene: activeScene(projection),
    }));
    const deleteConversation = vi.fn(async () => projection);
    const removeProjects = vi.fn(async () => projection);
    installBridge({ projection, transition, deleteConversation, removeProjects });
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const { container, root } = await renderApplication();

    const projectButton = [
      ...container.querySelectorAll<HTMLButtonElement>('.home-project-link'),
    ].find((button) => button.textContent?.includes(project.displayName));
    const unavailableButton = [
      ...container.querySelectorAll<HTMLButtonElement>('.home-conversation-link'),
    ].find((button) => button.textContent?.includes(unavailableConversation.title));
    const validButton = [
      ...container.querySelectorAll<HTMLButtonElement>('.home-conversation-link'),
    ].find((button) => button.textContent?.includes(validConversation.title));
    if (!projectButton || !unavailableButton || !validButton) {
      throw new Error('Desktop fixture requires unavailable and valid navigation items.');
    }
    expect(projectButton.disabled).toBe(true);
    expect(projectButton.title).toBe(project.unavailable.message);
    expect(unavailableButton.disabled).toBe(true);
    expect(unavailableButton.title).toBe(unavailableConversation.unavailable.message);
    const projectGroup = projectButton.closest('.primary-conversation-group');
    const unavailableRow = unavailableButton.closest('.primary-recent-conversation-row');
    expect(
      projectGroup?.querySelector(
        '.primary-conversation-group__header > .primary-navigation-state .primary-navigation-unavailable',
      ),
    ).not.toBeNull();
    expect(
      unavailableRow?.querySelector(
        ':scope > .primary-navigation-state .primary-navigation-unavailable',
      ),
    ).not.toBeNull();
    const projectUnavailableStatus = projectGroup?.querySelector<HTMLElement>(
      '.primary-conversation-group__header > .primary-navigation-state .primary-navigation-unavailable',
    );
    const conversationUnavailableStatus = unavailableRow?.querySelector<HTMLElement>(
      ':scope > .primary-navigation-state .primary-navigation-unavailable',
    );
    expect(projectUnavailableStatus?.textContent?.trim()).toBe('');
    expect(conversationUnavailableStatus?.textContent?.trim()).toBe('');
    expect(projectUnavailableStatus?.querySelector('svg')).not.toBeNull();
    expect(conversationUnavailableStatus?.querySelector('svg')).not.toBeNull();
    expect(projectUnavailableStatus?.getAttribute('aria-label')).toContain(
      project.unavailable.message,
    );
    expect(conversationUnavailableStatus?.getAttribute('aria-label')).toContain(
      unavailableConversation.unavailable.message,
    );
    expect(projectGroup?.querySelector('.primary-conversation-group__diagnostic')).toBeNull();

    const projectHeader = projectButton.closest<HTMLElement>('.primary-conversation-group__header');
    if (!projectHeader) throw new Error('Desktop fixture requires unavailable Project header.');
    await openContextMenu(projectHeader);
    expect(findContextMenuItem('Open project').hasAttribute('data-disabled')).toBe(true);
    expect(findContextMenuItem('Remove Unavailable Project').hasAttribute('data-disabled')).toBe(
      false,
    );

    await act(async () => {
      projectButton.click();
      unavailableButton.click();
    });
    expect(transition).not.toHaveBeenCalled();

    await act(async () => validButton.click());
    await waitFor(() => transition.mock.calls.length === 1);
    expect(transition).toHaveBeenCalledWith(
      projection.window.windowId,
      { kind: 'restore-conversation', navigation: validConversation.navigation },
      activeScene(projection).sceneId,
    );

    const removeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Unavailable Project"]',
    );
    const deleteButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete conversation Unavailable conversation"]',
    );
    if (!removeButton || !deleteButton) {
      throw new Error('Desktop fixture requires unavailable cleanup actions.');
    }
    expect(removeButton.disabled).toBe(false);
    expect(deleteButton.disabled).toBe(false);
    await act(async () => removeButton.click());
    await waitFor(() => removeProjects.mock.calls.length === 1);
    await act(async () => deleteButton.click());
    await waitFor(() => deleteConversation.mock.calls.length === 1);
    expect(removeProjects).toHaveBeenCalledWith([project.projectId]);
    expect(deleteConversation).toHaveBeenCalledWith([unavailableConversation.navigation]);
    await act(async () => root.unmount());
  });

  it('keeps unavailable Workspace groups collapsible and deletes their exact conversations as one batch', async () => {
    const base = createProjection();
    const conversation = {
      navigation: {
        conversationId: 'conversation:missing-workspace',
        owner: { kind: 'workspace' as const, workspaceId: 'workspace:missing' },
      },
      title: 'Missing Workspace conversation',
      updatedAt: '2026-08-07T00:00:00.000Z',
      attention: 'none' as const,
      lastActivity: {
        kind: 'conversation-updated' as const,
        occurredAt: '2026-08-07T00:00:00.000Z',
      },
      unavailable: {
        fieldNames: ['context'],
        message: 'Conversation context is missing.',
      },
    };
    const secondConversation = {
      ...conversation,
      navigation: {
        ...conversation.navigation,
        conversationId: 'conversation:missing-workspace-2',
      },
      title: 'Second missing Workspace conversation',
    };
    const catalog = { projects: [] };
    const agentHome = {
      conversations: [conversation, secondConversation],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    } as const;
    const projection: DesktopShellProjection = {
      ...base,
      catalog,
      agentHome,
      conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome, []),
    };
    const transition = vi.fn();
    const deleteConversation = vi.fn(async () => projection);
    installBridge({ projection, transition, deleteConversation });
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const { container, root } = await renderApplication();

    const group = container.querySelector<HTMLElement>(
      '.primary-conversation-group[data-group-kind="workspace"]',
    );
    if (!group) throw new Error('Desktop fixture requires an unavailable Workspace group.');
    const projectSection = group.closest<HTMLElement>('[data-navigation-section="projects"]');
    const conversationSection = container.querySelector<HTMLElement>(
      '[data-navigation-section="conversations"]',
    );
    expect(projectSection?.querySelector('.home-sidebar-heading')?.textContent).toBe('Projects1');
    expect(conversationSection?.querySelector('.home-sidebar-heading')?.textContent).toBe(
      'Conversations0',
    );
    const heading = group.querySelector<HTMLElement>(
      '.primary-conversation-group__standalone-heading',
    );
    expect(heading?.textContent).toContain('Unavailable workspace');
    expect(heading?.textContent).not.toContain('workspaceId');
    expect(
      heading?.querySelector('.primary-conversation-group__identity-icon.is-workspace'),
    ).not.toBeNull();
    expect(
      heading?.querySelector(':scope > .primary-navigation-state .primary-navigation-unavailable'),
    ).not.toBeNull();
    expect(
      heading?.querySelectorAll(':scope > .primary-navigation-row-actions button'),
    ).toHaveLength(1);
    expect(group.querySelector('.primary-conversation-group__diagnostic')).toBeNull();

    const conversationButton = group.querySelector<HTMLButtonElement>('.home-conversation-link');
    const collapseButton = group.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse Unavailable workspace"]',
    );
    if (!conversationButton || !collapseButton) {
      throw new Error('Unavailable Workspace controls are incomplete.');
    }
    expect(conversationButton.disabled).toBe(true);
    await act(async () => collapseButton.click());
    expect(group.querySelector('.primary-recent-conversation-row')).toBeNull();
    await act(async () => collapseButton.click());
    expect(group.querySelector('.primary-recent-conversation-row')).not.toBeNull();
    expect(transition).not.toHaveBeenCalled();

    const deleteButton = heading?.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete unavailable Workspace conversations"]',
    );
    if (!deleteButton) throw new Error('Unavailable Workspace cleanup action is missing.');
    await act(async () => deleteButton.click());
    await waitFor(() => deleteConversation.mock.calls.length === 1);
    expect(deleteConversation).toHaveBeenCalledWith([
      conversation.navigation,
      secondConversation.navigation,
    ]);
    deleteConversation.mockClear();

    if (!heading) throw new Error('Unavailable Workspace heading is missing.');
    await openContextMenu(heading);
    await selectContextMenuItem('Delete unavailable Workspace conversations');
    await waitFor(() => deleteConversation.mock.calls.length === 1);
    expect(deleteConversation).toHaveBeenCalledWith([
      conversation.navigation,
      secondConversation.navigation,
    ]);
    await act(async () => root.unmount());
  });

  it('confirms and delegates the complete Project Management selection as one batch', async () => {
    const base = createProjection();
    const projects = [
      {
        projectId: 'content:workspace-1',
        workspaceId: 'workspace-1',
        profile: 'content' as const,
        displayName: 'First Project',
        createdAt: '2026-07-28T00:00:00.000Z',
        updatedAt: '2026-07-29T00:00:00.000Z',
      },
      {
        projectId: 'content:workspace-2',
        workspaceId: 'workspace-2',
        profile: 'content' as const,
        displayName: 'Second Project',
        createdAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-30T00:00:00.000Z',
      },
    ];
    const catalog = { projects };
    const projection = withActiveScene(
      {
        ...base,
        catalog,
        conversationNavigation: projectDesktopConversationNavigation(catalog, base.agentHome, []),
      },
      projectManagementScene(),
    );
    const removeProjects = vi.fn(async () => projection);
    installBridge({ projection, removeProjects });
    vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { container, root } = await renderApplication();
    await waitFor(() => container.querySelector('.management-surface-row__select') !== null);
    const selectionButtons = container.querySelectorAll<HTMLButtonElement>(
      '.management-surface-row__select',
    );
    const first = selectionButtons[0];
    const second = selectionButtons[1];
    if (!first || !second) throw new Error('Project Management batch fixture is incomplete.');
    await act(async () => first.click());
    await act(async () =>
      second.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })),
    );
    const removeSelected = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Remove selected',
    );
    if (!removeSelected) throw new Error('Project Management batch action is unavailable.');

    await act(async () => removeSelected.click());
    expect(removeProjects).not.toHaveBeenCalled();
    await act(async () => removeSelected.click());
    await waitFor(() => removeProjects.mock.calls.length === 1);
    expect(removeProjects).toHaveBeenCalledWith(['content:workspace-1', 'content:workspace-2']);
    await act(async () => root.unmount());
  });

  it('groups standalone Assistant conversations and expands beyond the bounded initial list', async () => {
    const base = createProjection();
    const conversations = Array.from({ length: 6 }, (_, index) => ({
      navigation: {
        conversationId: `assistant-conversation-${index + 1}`,
        owner: {
          kind: 'assistant' as const,
          assistantSpaceId: 'assistant-space:local-user',
        },
      },
      title: `Assistant conversation ${index + 1}`,
      updatedAt: `2026-08-0${index + 1}T00:00:00.000Z`,
      attention: 'none' as const,
      lastActivity: {
        kind: 'conversation-updated' as const,
        occurredAt: `2026-08-0${index + 1}T00:00:00.000Z`,
      },
    }));
    const catalog = { projects: [] };
    const agentHome = {
      conversations,
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    } as const;
    const projection: DesktopShellProjection = {
      ...base,
      catalog,
      agentHome,
      conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome, []),
    };
    const transition = vi.fn(async () => ({
      status: 'transitioned' as const,
      requestId: 'assistant-transition',
      scene: activeScene(projection),
    }));
    installBridge({ projection, transition });
    const { container, root } = await renderApplication();

    const group = container.querySelector<HTMLElement>(
      '.primary-conversation-group[data-group-kind="assistant"]',
    );
    if (!group) throw new Error('Desktop fixture requires a standalone Assistant group.');
    const projectSection = container.querySelector<HTMLElement>(
      '[data-navigation-section="projects"]',
    );
    const conversationSection = group.closest<HTMLElement>(
      '[data-navigation-section="conversations"]',
    );
    expect(projectSection?.querySelector('.home-sidebar-heading')?.textContent).toBe('Projects0');
    expect(conversationSection?.querySelector('.home-sidebar-heading')?.textContent).toBe(
      'Conversations6',
    );
    expect(group.textContent).toContain('Personal assistant');
    expect(
      group.querySelector(
        '.primary-conversation-group__standalone-heading .primary-conversation-group__identity-icon.is-assistant',
      ),
    ).not.toBeNull();
    expect(group.querySelectorAll('.primary-recent-conversation-row')).toHaveLength(5);
    expect(
      group.querySelectorAll(
        '.primary-recent-conversation-row .primary-conversation-group__identity-icon.is-conversation',
      ),
    ).toHaveLength(5);
    expect(group.textContent).not.toContain('Assistant conversation 1');
    expect(group.textContent).toContain('Assistant conversation 6');

    const expand = group.querySelector<HTMLButtonElement>('.primary-conversation-group__expand');
    if (!expand) throw new Error('Desktop fixture requires the conversation expand action.');
    expect(expand.textContent).toContain('Show more');
    await act(async () => expand.click());
    expect(group.querySelectorAll('.primary-recent-conversation-row')).toHaveLength(6);
    expect(expand.textContent).toContain('Show less');

    const oldest = [...group.querySelectorAll<HTMLButtonElement>('.home-conversation-link')].find(
      (button) => button.textContent?.includes('Assistant conversation 1'),
    );
    if (!oldest) throw new Error('Expanded Assistant conversation is missing.');
    await act(async () => oldest.click());
    await waitFor(() => transition.mock.calls.length === 1);
    expect(transition).toHaveBeenCalledWith(
      projection.window.windowId,
      { kind: 'restore-conversation', navigation: conversations[0]?.navigation },
      activeScene(projection).sceneId,
    );
    await act(async () => root.unmount());
  });

  it('keeps future Character, Room, and World classifications out of current navigation', async () => {
    const base = createProjection();
    const currentProject = {
      projectId: 'content:project-1',
      workspaceId: 'workspace-1',
      profile: 'content' as const,
      displayName: 'Current authoring project',
      createdAt: '2026-08-07T00:00:00.000Z',
      updatedAt: '2026-08-07T00:00:00.000Z',
    };
    const conversations = [
      {
        navigation: {
          conversationId: 'character-conversation-1',
          owner: {
            kind: 'character' as const,
            characterId: 'character-1',
            characterRunId: 'character-run-1',
          },
        },
        title: 'Character conversation',
        updatedAt: '2026-08-07T01:00:00.000Z',
        attention: 'none' as const,
        lastActivity: {
          kind: 'conversation-updated' as const,
          occurredAt: '2026-08-07T01:00:00.000Z',
        },
      },
      {
        navigation: {
          conversationId: 'room-conversation-1',
          owner: {
            kind: 'room' as const,
            roomId: 'room-1',
            roomRunId: 'room-run-1',
          },
        },
        title: 'Room conversation',
        updatedAt: '2026-08-07T02:00:00.000Z',
        attention: 'none' as const,
        lastActivity: {
          kind: 'conversation-updated' as const,
          occurredAt: '2026-08-07T02:00:00.000Z',
        },
      },
      {
        navigation: {
          conversationId: 'assistant-conversation-current',
          owner: {
            kind: 'assistant' as const,
            assistantSpaceId: 'assistant-space:local-user',
          },
        },
        title: 'Current assistant conversation',
        updatedAt: '2026-08-07T03:00:00.000Z',
        attention: 'none' as const,
        lastActivity: {
          kind: 'conversation-updated' as const,
          occurredAt: '2026-08-07T03:00:00.000Z',
        },
      },
    ];
    const catalog = { projects: [currentProject] };
    const agentHome = {
      conversations,
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    } as const;
    const projection: DesktopShellProjection = {
      ...base,
      catalog,
      agentHome,
      conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome, [
        currentProject.projectId,
      ]),
    };
    installBridge({ projection });
    const { container, root } = await renderApplication();

    const navigation = container.querySelector<HTMLElement>('.home-recent-navigation');
    if (!navigation) throw new Error('Desktop fixture requires PrimarySidebar navigation.');
    const headings = [
      ...navigation.querySelectorAll('.home-sidebar-heading > span:first-child'),
    ].map((heading) => heading.textContent);
    expect(headings).toEqual(['Projects', 'Conversations']);
    expect(
      navigation.querySelector('[data-navigation-section="projects"] .home-sidebar-heading')
        ?.textContent,
    ).toBe('Projects1');
    expect(
      navigation.querySelector('[data-navigation-section="conversations"] .home-sidebar-heading')
        ?.textContent,
    ).toBe('Conversations1');
    expect(
      navigation.querySelector('[data-navigation-section="projects"] [data-group-kind="project"]')
        ?.textContent,
    ).toContain(currentProject.displayName);
    expect(
      navigation.querySelector(
        '[data-navigation-section="conversations"] [data-group-kind="assistant"]',
      )?.textContent,
    ).toContain('Current assistant conversation');
    expect(navigation.querySelector('[data-group-kind="character"]')).toBeNull();
    expect(navigation.querySelector('[data-group-kind="room"]')).toBeNull();
    expect(navigation.querySelector('[data-navigation-section="character"]')).toBeNull();
    expect(navigation.querySelector('[data-navigation-section="room"]')).toBeNull();
    expect(navigation.querySelector('[data-navigation-section="world"]')).toBeNull();
    expect(navigation.textContent).not.toContain('Character conversation');
    expect(navigation.textContent).not.toContain('Room conversation');

    await act(async () => root.unmount());
  });

  it('keeps the Workspace Agent layout mounted when Main or Project catalog is unavailable', async () => {
    const base = createProjection();
    const project = {
      projectId: 'content:workspace-empty',
      workspaceId: 'workspace-empty',
      profile: 'content' as const,
      displayName: 'Empty Workspace',
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
    };
    const tab = {
      tabId: 'tab:workspace-empty',
      projectId: project.projectId,
      viewId: 'agent-view:workspace-empty',
      viewInstanceId: 'view-instance-1',
    };
    const sceneId = 'scene:window-1:workspace-empty';
    const layout = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      display: {
        ...createDefaultDesktopWorkbenchLayout('window-1').display,
        mode: 'chat-main' as const,
      },
    };
    const scene = parseDesktopWorkbenchSceneProjection({
      sceneId,
      windowId: 'window-1',
      context: {
        kind: 'agent',
        agentViewId: tab.viewId,
        scope: {
          kind: 'workspace',
          draftId: 'draft-workspace-empty',
          workspaceId: project.workspaceId,
          workspaceGrantId: 'workspace-grant:empty',
        },
      },
      slots: {
        interaction: {
          kind: 'agent',
          agentSurfaceId: 'agent-surface:workspace-empty',
          agentViewId: tab.viewId,
          phase: 'draft',
          scope: {
            kind: 'workspace',
            draftId: 'draft-workspace-empty',
            workspaceId: project.workspaceId,
            workspaceGrantId: 'workspace-grant:empty',
          },
        },
        rightManager: { kind: 'workspace-resources', workspaceId: project.workspaceId },
        status: { kind: 'scene-status', sceneId },
      },
    });
    const projection = withActiveScene(
      {
        ...base,
        catalog: { projects: [project] },
        window: {
          ...base.window,
          activeTarget: { kind: 'project', tabId: tab.tabId },
          tabs: [tab],
        },
      },
      scene,
      layout,
    );
    installBridge({ projection });

    const { container, root } = await renderApplication();

    expect(container.querySelector('[data-empty-main="true"]')).not.toBeNull();
    expect(container.querySelector('.agent-workspace')).not.toBeNull();
    expect(container.querySelector('[data-neko-controlled-workbench="true"]')).not.toBeNull();
    await act(async () => root.unmount());

    const isolatedProjection: DesktopShellProjection = {
      ...projection,
      catalog: { projects: [] },
      stateDiagnostics: [
        {
          code: 'desktop-shell-component-invalid',
          severity: 'error',
          component: 'project-catalog',
          message: 'Desktop Project catalog projection was rejected without rewriting it.',
        },
      ],
    };
    installBridge({ projection: isolatedProjection });

    const isolated = await renderApplication();
    const alert = isolated.container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      'Project catalog data is unavailable. Other workspace surfaces remain available.',
    );
    expect(alert?.getAttribute('title')).toContain('without rewriting it');
    expect(
      isolated.container.querySelector('[data-scene-surface-unavailable="workspace-authority"]'),
    ).not.toBeNull();
    expect(isolated.container.querySelector('.agent-workspace')).not.toBeNull();
    expect(
      isolated.container.querySelector('[data-neko-controlled-workbench="true"]'),
    ).not.toBeNull();
    await act(async () => isolated.root.unmount());
  });
});

function installBridge({
  getSnapshot = vi.fn(async () => projection),
  projection,
  subscribe = vi.fn(() => () => undefined),
  transition = vi.fn(),
  deleteConversation = vi.fn(),
  deleteProjectConversations = vi.fn(),
  removeProjects = vi.fn(),
  updateApplicationSidebar = vi.fn(),
  updateWorkbench = vi.fn(),
  assetCenterExecute = vi.fn(),
  projectPortability,
  textEditorExecute = vi.fn(),
}: {
  readonly getSnapshot?: () => Promise<DesktopShellProjection>;
  readonly projection: DesktopShellProjection;
  readonly subscribe?: (listener: (event: DesktopShellProjectionEvent) => void) => () => void;
  readonly transition?: ReturnType<typeof vi.fn>;
  readonly deleteConversation?: ReturnType<typeof vi.fn>;
  readonly deleteProjectConversations?: ReturnType<typeof vi.fn>;
  readonly removeProjects?: ReturnType<typeof vi.fn>;
  readonly updateApplicationSidebar?: ReturnType<typeof vi.fn>;
  readonly updateWorkbench?: ReturnType<typeof vi.fn>;
  readonly assetCenterExecute?: ReturnType<typeof vi.fn>;
  readonly projectPortability?: OpenNekoDesktopProjectPortabilityBridge['projectPortability'];
  readonly textEditorExecute?: (request: TextEditorHostRequest) => Promise<TextEditorHostResult>;
}): void {
  Object.defineProperty(window, 'openNekoDesktop', {
    configurable: true,
    value: {
      shell: { getSnapshot, subscribe },
      scenes: { transition },
      conversations: { delete: deleteConversation },
      projects: { remove: removeProjects, deleteConversations: deleteProjectConversations },
      applicationSidebar: { update: updateApplicationSidebar },
      workbench: { update: updateWorkbench },
      assetCenter: { execute: assetCenterExecute },
      textEditor: { execute: textEditorExecute, subscribe: vi.fn(() => () => undefined) },
      agentLaunch: {
        attach: vi.fn(() => new Promise(() => undefined)),
        authorizeResource: vi.fn(),
        bindTarget: vi.fn(),
        bindAssistant: vi.fn(),
        searchWorkspaceMentions: vi.fn(),
        submitDraft: vi.fn(),
        detach: vi.fn(),
      },
      projectPortability,
    },
  });
}

async function renderApplication(strict = false) {
  const i18n = createDesktopI18n('en');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const application = (
    <I18nProvider service={i18n.i18nService}>
      <DesktopApplicationSettingsProvider
        value={{
          projection: {
            eventSequence: 0,
            preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
          },
          update: async () => undefined,
          openAgentAdvanced: async () => undefined,
        }}
      >
        <DesktopApplication />
      </DesktopApplicationSettingsProvider>
    </I18nProvider>
  );
  await act(async () => root.render(strict ? <StrictMode>{application}</StrictMode> : application));
  await waitFor(() => container.querySelector('[data-neko-controlled-workbench="true"]') !== null);
  return { container, root };
}

function createProjection(): DesktopShellProjection {
  const catalog = { projects: [] } as const;
  const agentHome = {
    conversations: [],
    attention: { needsInput: 0, needsReview: 0, running: 0 },
  } as const;
  const scene = createDefaultDesktopAgentScene('window-1', 'draft:test');
  const instance = createDesktopWindowComposition({
    workbenchInstanceId: 'workbench:window-1:entry',
    layout: createDefaultDesktopWorkbenchLayout('window-1'),
    scene,
  });
  return {
    applicationInstanceId: 'app-1',
    rendererSessionId: 'app-1:window-1:1',
    catalog,
    window: {
      windowId: 'window-1',
      activeTarget: { kind: 'home' },
      tabs: [],
      workbench: instance,
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
    agentHome,
    conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome, []),
    domains: [],
  };
}

function createTextEditorShellProjection(): DesktopShellProjection {
  const base = createProjection();
  const project = {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    profile: 'content' as const,
    displayName: 'Screenplay project',
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  };
  const view = {
    viewId: 'text-editor:view-1',
    viewInstanceId: 'view-instance-1',
    projectId: project.projectId,
    workspaceId: project.workspaceId,
    kind: 'text-editor' as const,
    ownerId: 'text-document:session-1',
    displayLabel: 'story.fountain',
    documentId: 'story.fountain',
    editorSessionId: 'text-document:session-1',
  };
  const layout = setWorkbenchDisplayMode(
    openOrFocusMainView(createDefaultDesktopWorkbenchLayout('window-1'), view),
    'main-only',
  );
  const sceneId = 'scene:window-1:workspace-1';
  const scope = {
    kind: 'workspace' as const,
    draftId: 'draft:workspace-1',
    workspaceId: project.workspaceId,
    workspaceGrantId: 'workspace-grant:workspace-1',
  };
  const scene = parseDesktopWorkbenchSceneProjection({
    sceneId,
    windowId: 'window-1',
    context: { kind: 'agent', agentViewId: 'project-view-1', scope },
    slots: {
      interaction: {
        kind: 'agent',
        agentSurfaceId: 'agent-surface:workspace-1',
        agentViewId: 'project-view-1',
        phase: 'draft',
        scope,
      },
      main: {
        kind: 'workspace-main',
        workspaceId: project.workspaceId,
        viewId: view.viewId,
        viewInstanceId: 'view-instance-1',
      },
      rightManager: { kind: 'workspace-resources', workspaceId: project.workspaceId },
      status: { kind: 'scene-status', sceneId },
    },
  });
  const catalog = { projects: [project] };
  return {
    ...base,
    catalog,
    conversationNavigation: projectDesktopConversationNavigation(catalog, base.agentHome, []),
    window: {
      ...base.window,
      activeTarget: { kind: 'project', tabId: 'tab-1' },
      tabs: [
        {
          tabId: 'tab-1',
          projectId: project.projectId,
          viewId: 'project-view-1',
          viewInstanceId: 'view-instance-1',
        },
      ],
      workbench: createDesktopWindowComposition({
        workbenchInstanceId: 'workbench:workspace-1',
        layout,
        scene,
      }),
    },
  };
}

function textEditorRuntimeIdentity(projection: DesktopShellProjection) {
  return {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    windowId: 'window-1',
    viewId: 'text-editor:view-1',
    viewInstanceId: 'view-instance-1',
    documentId: 'story.fountain',
    sessionId: 'text-document:session-1',
    rendererSessionId: projection.rendererSessionId,
  };
}

function readyTextEditorResult(
  request: TextEditorHostRequest,
  dirty: boolean,
): TextEditorHostResult {
  return {
    requestId: request.requestId,
    identity: request.identity,
    status: 'ready',
    projection: {
      identity: {
        owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
        workspaceId: 'workspace-1',
        documentId: 'story.fountain',
        locator: { kind: 'workspace-file', path: 'story.fountain' },
      },
      sessionId: 'text-document:session-1',
      editSequence: dirty ? 1 : 0,
      mode: 'fountain',
      source: '.INT. ROOM - NIGHT\n',
      dirty,
      conflict: false,
      diagnostics: [],
    },
  };
}

function activeScene(projection: DesktopShellProjection) {
  return resolveActiveDesktopWindowWorkbench(projection.window).scene;
}

function withActiveScene(
  projection: DesktopShellProjection,
  scene: ReturnType<typeof parseDesktopWorkbenchSceneProjection>,
  layout = resolveActiveDesktopWindowWorkbench(projection.window).layout,
): DesktopShellProjection {
  const current = resolveActiveDesktopWindowWorkbench(projection.window);
  const instance = createDesktopWindowComposition({
    workbenchInstanceId: current.workbenchInstanceId,
    layout,
    scene,
  });
  return {
    ...projection,
    window: {
      ...projection.window,
      workbench: instance,
    },
  };
}

function settingsScene() {
  const sceneId = 'scene:window-1:settings';
  return parseDesktopWorkbenchSceneProjection({
    sceneId,
    windowId: 'window-1',
    context: { kind: 'settings', settingsSectionId: 'general' },
    slots: {
      leftManager: { kind: 'settings-navigation', settingsSectionId: 'general' },
      main: { kind: 'settings-main', settingsSectionId: 'general' },
      status: { kind: 'scene-status', sceneId },
    },
  });
}

function extensionsScene() {
  const sceneId = 'scene:window-1:extensions';
  return parseDesktopWorkbenchSceneProjection({
    sceneId,
    windowId: 'window-1',
    context: { kind: 'extensions' },
    slots: {
      main: { kind: 'extension-management' },
      status: { kind: 'scene-status', sceneId },
    },
  });
}

function assetCenterPreviewScene() {
  const sceneId = 'scene:window-1:asset-center';
  const assetCenterSessionId = 'asset-center:window-1:1';
  return parseDesktopWorkbenchSceneProjection({
    sceneId,
    windowId: 'window-1',
    context: { kind: 'asset-center', assetCenterSessionId },
    slots: {
      main: { kind: 'asset-management', assetCenterSessionId },
      secondaryMain: {
        kind: 'asset-preview',
        assetCenterSessionId,
        previewSessionId: 'preview:asset-center:1',
      },
      status: { kind: 'scene-status', sceneId },
    },
  });
}

function projectManagementScene() {
  const sceneId = 'scene:window-1:project-management';
  return parseDesktopWorkbenchSceneProjection({
    sceneId,
    windowId: 'window-1',
    context: { kind: 'project-management' },
    slots: {
      main: { kind: 'project-management' },
      status: { kind: 'scene-status', sceneId },
    },
  });
}

function expectManagementSplit(
  container: HTMLElement,
  managementPanelId: string,
  detailPanelId: string,
): void {
  const shell = container.querySelector<HTMLElement>('[data-neko-controlled-workbench="true"]');
  expect(shell?.dataset.mainSplit).toBe('columns');
  expect(shell?.dataset.mainComposition).toBe('independent-shells');
  expect(shell?.style.getPropertyValue('--neko-controlled-main-split-ratio')).toBe('50%');
  expect(
    container.querySelector(
      `[data-workbench-main-panel="${managementPanelId}"][data-panel-size="compact"]`,
    ),
  ).not.toBeNull();
  expect(container.querySelector(`[data-workbench-main-panel="${detailPanelId}"]`)).not.toBeNull();
  expect(container.querySelector('[data-workbench-main-shell="primary"]')).not.toBeNull();
  expect(container.querySelector('[data-workbench-main-shell="secondary"]')).not.toBeNull();
  expect(container.querySelector('[data-workbench-main-gutter="true"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Resize Main split"]')).not.toBeNull();
}

async function openContextMenu(target: HTMLElement): Promise<void> {
  await act(async () => {
    target.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 }),
    );
  });
  await waitFor(() => document.body.querySelector('[role="menu"]') !== null);
}

async function selectContextMenuItem(label: string): Promise<void> {
  const item = findContextMenuItem(label);
  await act(async () => item.click());
}

function findContextMenuItem(label: string): HTMLElement {
  const item = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!item) throw new Error(`Desktop fixture requires context-menu item '${label}'.`);
  return item;
}

function findConversationRow(container: HTMLElement, title: string): HTMLElement {
  const link = [...container.querySelectorAll<HTMLElement>('.home-conversation-link')].find(
    (candidate) => candidate.textContent?.includes(title),
  );
  const row = link?.closest<HTMLElement>('.primary-recent-conversation-row');
  if (!row) throw new Error(`Desktop fixture requires Conversation row '${title}'.`);
  return row;
}

function readConversationStatus(
  container: HTMLElement,
  title: string,
):
  | {
      readonly accessibleName: string | null;
      readonly iconVisible: boolean;
      readonly inlineText: string;
    }
  | undefined {
  const status = findConversationRow(container, title).querySelector<HTMLElement>(
    '.home-conversation-status',
  );
  return status
    ? {
        accessibleName: status.getAttribute('aria-label'),
        iconVisible: status.querySelector('svg') !== null,
        inlineText: status.textContent?.trim() ?? '',
      }
    : undefined;
}

function createSidebarConversation(
  workspaceId: string,
  suffix: string,
  title: string,
  attention: 'none' | 'needs-input' | 'needs-review' | 'running',
) {
  return {
    navigation: {
      conversationId: `conversation-${suffix}`,
      owner: { kind: 'workspace' as const, workspaceId },
    },
    title,
    updatedAt: '2026-08-07T00:00:00.000Z',
    attention,
    lastActivity: {
      kind: attention === 'running' ? ('turn-running' as const) : ('conversation-updated' as const),
      occurredAt: '2026-08-07T00:00:00.000Z',
    },
  };
}

async function waitFor(assertion: () => boolean | undefined): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (assertion()) return;
    await act(async () => Promise.resolve());
  }
  throw new Error('Desktop application fixture did not reach the expected state.');
}
