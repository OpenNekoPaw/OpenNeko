// @vitest-environment jsdom

import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('@neko/assets-webview/resource-browser/runtime-bootstrap', () => ({
  createResourceBrowserRuntimeBootstrap: vi.fn(() => ({
    prepare: mocks.prepare,
    dispose: mocks.dispose,
  })),
}));
vi.mock('@neko/assets-webview/resource-browser/root', () => ({
  ResourceBrowserRoot: () => <div data-testid="resource-browser-root" />,
}));
vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ locale: 'en', t: (key: string) => key }),
}));
vi.mock('./desktop-resource-browser-host-runtime', () => ({
  createElectronResourceBrowserHostRuntime: vi.fn(() => ({ id: 'resource-browser-runtime' })),
}));
vi.mock('./application-settings-context', () => ({
  useDesktopApplicationSettings: () => ({
    projection: { preferences: { resourceBrowserView: 'list' } },
  }),
}));

import { DesktopResourceBrowserSurface } from './DesktopResourceBrowserSurface';

afterEach(() => vi.clearAllMocks());

describe('DesktopResourceBrowserSurface bootstrap', () => {
  it('prepares data beside the lazy UI module and disposes only after final unmount', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <DesktopResourceBrowserSurface
            project={
              {
                projectId: 'project-1',
                workspaceId: 'workspace-1',
                displayName: 'Fixture project',
              } as never
            }
            projection={
              {
                rendererSessionId: 'renderer-1',
                window: { windowId: 'window-1' },
              } as never
            }
            tab={
              {
                viewId: 'project-view-1',
                viewInstanceId: 'view-instance-1',
              } as never
            }
          />
        </StrictMode>,
      );
      await Promise.resolve();
    });

    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="resource-browser-root"]')).not.toBeNull();
    expect(mocks.dispose).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    expect(mocks.dispose).toHaveBeenCalledOnce();
    container.remove();
  });
});
