// @vitest-environment jsdom

import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('@neko/text-editor-webview/runtime-bootstrap', () => ({
  createTextEditorRuntimeBootstrap: vi.fn(() => ({
    prepare: mocks.prepare,
    dispose: mocks.dispose,
  })),
}));
vi.mock('@neko/text-editor-webview/root', () => ({
  TextEditorRoot: () => <div data-testid="text-editor-root" />,
}));
vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ locale: 'en' }),
}));
vi.mock('./desktop-text-editor-host-runtime', () => ({
  createElectronTextEditorHostRuntime: vi.fn(() => ({ id: 'text-editor-runtime' })),
}));

import { DesktopTextEditorSurface } from './DesktopTextEditorSurface';

afterEach(() => vi.clearAllMocks());

describe('DesktopTextEditorSurface', () => {
  it('prepares data beside the lazy UI module and disposes only after final unmount', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const nonce = document.createElement('meta');
    nonce.setAttribute('property', 'csp-nonce');
    nonce.setAttribute('nonce', 'text-editor-test-csp');
    document.head.append(nonce);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <DesktopTextEditorSurface
            contextActionsTarget={null}
            project={{ projectId: 'project-1', workspaceId: 'workspace-1' } as never}
            projection={
              {
                rendererSessionId: 'renderer-1',
                window: { windowId: 'window-1' },
              } as never
            }
            view={
              {
                viewId: 'text-editor-view-1',
                viewInstanceId: 'view-instance-1',
                documentId: 'notes/story.md',
                editorSessionId: 'editor-session-1',
              } as never
            }
          />
        </StrictMode>,
      );
      await Promise.resolve();
    });

    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="text-editor-root"]')).not.toBeNull();
    expect(mocks.dispose).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    expect(mocks.dispose).toHaveBeenCalledOnce();
    container.remove();
    nonce.remove();
  });
});
