// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import {
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
} from '@neko/host/desktop-scene-contract';
import { projectDesktopConversationNavigation } from '@neko/host/desktop-shell-contract';
import { createDesktopWindowComposition } from '@neko/host/desktop-window-composition-contract';
import { createDefaultDesktopWorkbenchLayout } from '@neko/host/desktop-workbench-contract';
import { DesktopCanvasSurface } from './DesktopCanvasSurface';
import { DesktopSurfaceErrorBoundary } from './DesktopSurfaceErrorBoundary';
import { createDesktopI18n } from './i18n';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@neko/canvas-webview/root', () => {
  throw new Error('poisoned Canvas Webview module');
});

vi.mock('./desktop-canvas-host-runtime', () => ({
  createElectronCanvasHostRuntime: vi.fn(() => ({ id: 'canvas-runtime' })),
}));

vi.mock('./desktop-canvas-webview-delegate', () => ({
  createDesktopCanvasWebviewDelegate: vi.fn(() => ({ id: 'canvas-delegate' })),
}));

describe('DesktopCanvasSurface module containment', () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    consoleError.mockRestore();
    container.remove();
  });

  it('keeps sibling Desktop content visible when the Canvas Webview import rejects', async () => {
    const i18n = createDesktopI18n('en');
    const projection = createProjection();
    await act(async () => {
      root.render(
        <I18nProvider service={i18n.i18nService}>
          <div data-testid="shell-sibling">Agent interaction remains available</div>
          <DesktopSurfaceErrorBoundary surfaceIdentity="workspace-1:main">
            <DesktopCanvasSurface
              project={{
                projectId: 'project-1',
                workspaceId: 'workspace-1',
                profile: 'content',
                displayName: 'Fixture project',
                createdAt: '2026-08-08T00:00:00.000Z',
                updatedAt: '2026-08-08T00:00:00.000Z',
              }}
              projection={projection}
              view={{
                viewId: 'canvas-view-1',
                viewInstanceId: 'canvas-instance-1',
                projectId: 'project-1',
                workspaceId: 'workspace-1',
                kind: 'canvas',
                ownerId: 'canvas-owner-1',
                displayLabel: 'workspace.nkc',
                documentId: 'workspace.nkc',
              }}
            />
          </DesktopSurfaceErrorBoundary>
        </I18nProvider>,
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="shell-sibling"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'This panel could not be displayed',
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Surface 'workspace-1:main' failed",
    );
  });
});

function createProjection() {
  const catalog = { projects: [] } as const;
  const agentHome = {
    conversations: [],
    attention: { needsInput: 0, needsReview: 0, running: 0 },
  } as const;
  const scene = createDefaultDesktopAgentScene('window-1', 'draft:test');
  return {
    applicationInstanceId: 'app-1',
    rendererSessionId: 'app-1:window-1:1',
    catalog,
    window: {
      windowId: 'window-1',
      activeTarget: { kind: 'home' } as const,
      tabs: [],
      workbench: createDesktopWindowComposition({
        workbenchInstanceId: 'workbench:window-1:entry',
        layout: createDefaultDesktopWorkbenchLayout('window-1'),
        scene,
      }),
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
    agentHome,
    conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome, []),
    domains: [],
  };
}
