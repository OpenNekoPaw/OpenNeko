// @vitest-environment jsdom

import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('@neko/cut-webview/runtime-bridge', () => ({
  createCutHostRuntimeWebviewBridge: () => ({
    prepare: mocks.prepare,
    dispose: mocks.dispose,
    postIntent: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  }),
}));
vi.mock('@neko/cut-webview/root', () => ({
  CutWebviewRoot: () => <div data-testid="cut-root" />,
}));
vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ locale: 'en', t: (key: string) => key }),
}));
vi.mock('./desktop-cut-host-runtime', () => ({
  createElectronCutHostRuntime: vi.fn(() => ({})),
}));

import { DesktopCutSurface } from './DesktopCutSurface';

afterEach(() => vi.clearAllMocks());

describe('DesktopCutSurface', () => {
  it('keeps its memoized Cut bridge active across StrictMode replay and disposes on final unmount', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <DesktopCutSurface
            project={{ projectId: 'project-1', workspaceId: 'workspace-1' } as never}
            projection={
              {
                rendererSessionId: 'renderer-1',
                window: { windowId: 'window-1' },
              } as never
            }
            view={
              {
                viewId: 'cut-view-1',
                viewInstanceId: 'view-instance-1',
                ownerId: 'cut-session-1',
                documentId: 'cuts/story.otio',
              } as never
            }
          />
        </StrictMode>,
      );
      await Promise.resolve();
    });

    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    expect(mocks.dispose).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    expect(mocks.dispose).toHaveBeenCalledOnce();
    container.remove();
  });
});
