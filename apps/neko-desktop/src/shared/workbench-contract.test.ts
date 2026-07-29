import { describe, expect, it } from 'vitest';
import {
  DESKTOP_WORKBENCH_CONTRACT_VERSION,
  DesktopWorkbenchContractError,
  applyDesktopWorkbenchLayoutPreset,
  createDefaultDesktopWorkbenchLayout,
  parseDesktopWorkbenchLayout,
} from './workbench-contract';

describe('Desktop Workbench contract', () => {
  it('creates the light-weight Agent-first default without domain state', () => {
    expect(createDefaultDesktopWorkbenchLayout('window-1')).toEqual({
      schemaVersion: DESKTOP_WORKBENCH_CONTRACT_VERSION,
      windowId: 'window-1',
      revision: 0,
      preset: 'agent-focus',
      primarySidebar: { visible: true, width: 240 },
      resourceDock: { presentation: 'hidden', position: 'right', width: 320 },
      agent: {
        presentation: 'main',
        dockPresentation: 'hidden',
        dockPosition: 'left',
        width: 360,
      },
      main: { views: [], split: 'none' },
      timeline: { visible: false, height: 240 },
    });
  });

  it('parses an explicit two-View split with owner identity', () => {
    const projection = parseDesktopWorkbenchLayout({
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      revision: 4,
      preset: 'canvas-agent',
      main: {
        views: [
          viewRef('view-canvas', 'canvas', 'canvas-document-1'),
          viewRef('view-agent', 'agent', 'conversation-1'),
        ],
        activeViewId: 'view-canvas',
        sideViewId: 'view-agent',
        split: 'horizontal',
      },
      agent: {
        presentation: 'dock',
        dockPresentation: 'docked',
        dockPosition: 'right',
        width: 360,
      },
    });

    expect(projection.main.views).toHaveLength(2);
    expect(projection.main.activeViewId).toBe('view-canvas');
    expect(projection.main.sideViewId).toBe('view-agent');
    expect(projection.main.split).toBe('horizontal');
  });

  it('rejects unknown versions, stale active View and unbounded layout values', () => {
    expect(() =>
      parseDesktopWorkbenchLayout({
        ...createDefaultDesktopWorkbenchLayout('window-1'),
        schemaVersion: 2,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DesktopWorkbenchContractError>>({
        code: 'unsupported-desktop-workbench-version',
      }),
    );

    expect(() =>
      parseDesktopWorkbenchLayout({
        ...createDefaultDesktopWorkbenchLayout('window-1'),
        main: {
          views: [viewRef('view-1', 'canvas', 'canvas-document-1')],
          activeViewId: 'missing-view',
          split: 'none',
        },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DesktopWorkbenchContractError>>({
        code: 'desktop-workbench-stale-identity',
      }),
    );

    expect(() =>
      parseDesktopWorkbenchLayout({
        ...createDefaultDesktopWorkbenchLayout('window-1'),
        primarySidebar: { visible: true, width: 10 },
      }),
    ).toThrowError(DesktopWorkbenchContractError);
  });

  it('does not retain unknown domain or path fields', () => {
    const projection = parseDesktopWorkbenchLayout({
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      workspacePath: '/Users/private/project',
      agent: {
        ...createDefaultDesktopWorkbenchLayout('window-1').agent,
        conversation: { secret: 'renderer-owned-state' },
      },
    });

    expect(projection).not.toHaveProperty('workspacePath');
    expect(projection.agent).not.toHaveProperty('conversation');
    expect(JSON.stringify(projection)).not.toContain('/Users/private');
  });

  it('projects Preview content kind for Main composition without inferring from opaque ids', () => {
    const previewView = {
      viewId: 'view-preview',
      viewEpoch: 1,
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      kind: 'preview',
      ownerId: 'preview-session-1',
      documentId: 'content:06bfba13',
      previewPresentation: 'pinned',
      previewContentKind: 'model',
    } as const;
    const projection = parseDesktopWorkbenchLayout({
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      preset: 'preview-focus',
      main: {
        views: [previewView],
        activeViewId: previewView.viewId,
        split: 'none',
      },
    });

    expect(projection.main.views[0]).toMatchObject({
      documentId: 'content:06bfba13',
      previewContentKind: 'model',
    });
    expect(() =>
      parseDesktopWorkbenchLayout({
        ...createDefaultDesktopWorkbenchLayout('window-1'),
        main: {
          views: [
            {
              ...viewRef('view-canvas', 'canvas', 'canvas-document-1'),
              previewContentKind: 'model',
            },
          ],
          activeViewId: 'view-canvas',
          split: 'none',
        },
      }),
    ).toThrow('Preview presentation metadata belongs only to Preview Views');
  });

  it('applies deterministic bounded presets and rejects unavailable preset Views', () => {
    const current = parseDesktopWorkbenchLayout({
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      main: {
        views: [
          viewRef('view-agent', 'agent', 'conversation-1'),
          viewRef('view-canvas', 'canvas', 'canvas-document-1'),
        ],
        activeViewId: 'view-agent',
        split: 'none',
      },
    });

    expect(applyDesktopWorkbenchLayoutPreset(current, 'canvas-agent')).toMatchObject({
      revision: 1,
      preset: 'canvas-agent',
      resourceDock: { presentation: 'hidden' },
      agent: { presentation: 'dock', dockPresentation: 'docked' },
      main: {
        views: [
          { viewId: 'view-agent', kind: 'agent' },
          { viewId: 'view-canvas', kind: 'canvas' },
        ],
        activeViewId: 'view-canvas',
        split: 'none',
      },
      timeline: { visible: false },
    });
    expect(() =>
      applyDesktopWorkbenchLayoutPreset(current, 'canvas-preview'),
    ).toThrowError(DesktopWorkbenchContractError);
  });
});

function viewRef(
  viewId: string,
  kind: 'agent' | 'canvas',
  ownerId: string,
) {
  return {
    viewId,
    viewEpoch: 1,
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    kind,
    ownerId,
  } as const;
}
