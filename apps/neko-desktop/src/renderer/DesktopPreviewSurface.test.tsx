// @vitest-environment jsdom

import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('@neko/preview-webview/runtime-bootstrap', () => ({
  createPreviewRuntimeBootstrap: () => ({
    runtime: {},
    prepare: mocks.prepare,
    getSnapshot: vi.fn(),
    dispose: mocks.dispose,
  }),
}));
vi.mock('@neko/preview-webview/presentation-snapshot', () => ({
  usePreviewViewerSnapshotStore: () => ({}),
}));
vi.mock('@neko/preview-webview/root', () => ({
  PreviewRoot: () => <div data-testid="preview-root" />,
}));
vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ locale: 'en', t: (key: string) => key }),
}));
vi.mock('./desktop-preview-host-runtime', () => ({
  createElectronPreviewHostRuntime: vi.fn(() => ({})),
}));

import { DesktopPreviewSurface } from './DesktopPreviewSurface';

afterEach(() => vi.clearAllMocks());

describe('DesktopPreviewSurface', () => {
  it('keeps its exact bootstrap active across StrictMode replay and disposes on final unmount', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <DesktopPreviewSurface
            project={{ projectId: 'project-1', workspaceId: 'workspace-1' } as never}
            projection={
              {
                rendererSessionId: 'renderer-1',
                window: { windowId: 'window-1' },
              } as never
            }
            view={
              {
                viewId: 'preview-view-1',
                viewInstanceId: 'view-instance-1',
                ownerId: 'preview-session-1',
                documentId: 'books/story.epub',
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
