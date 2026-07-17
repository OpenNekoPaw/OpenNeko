// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasData } from '@neko/shared';
import { CanvasSettingsPanel } from './CanvasSettingsPanel';
import { setLocale } from '../../i18n';

vi.mock('@neko/ui/icons', () => ({
  CloseIcon: ({ size = 16 }: { size?: number }) => <span data-icon="close">{size}</span>,
}));

describe('CanvasSettingsPanel', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setLocale('en');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders canvas overview and current subsystem information', () => {
    act(() => {
      root.render(
        <CanvasSettingsPanel
          canvasData={createCanvasData()}
          viewportZoom={1.25}
          nodeTypeSummary={{ shot: 2, scene: 1 }}
          activeSubsystemIds={['storyboard', 'narrative']}
          isGridVisible={true}
          onGridVisibleChange={() => undefined}
          isHudVisible={false}
          onHudVisibleChange={() => undefined}
          onClose={() => undefined}
        />,
      );
    });

    expect(host.querySelector('#canvas-settings-panel')).not.toBeNull();
    expect(host.textContent).toContain('Board A');
    expect(host.textContent).toContain('2.1');
    expect(host.textContent).toContain('125%');
    expect(host.textContent).toContain('storyboard, narrative');
    expect(host.textContent).toContain('scene 1 / shot 2');
    expect(host.textContent).toContain('project.nkp');
    expect(host.textContent).not.toContain('Right Node Tree');
    expect(host.textContent).not.toContain('Node tree mode');
  });

  it('dispatches view setting changes', () => {
    const onGridVisibleChange = vi.fn();
    const onHudVisibleChange = vi.fn();
    const onClose = vi.fn();

    act(() => {
      root.render(
        <CanvasSettingsPanel
          canvasData={createCanvasData()}
          viewportZoom={1}
          nodeTypeSummary={{}}
          activeSubsystemIds={[]}
          isGridVisible={false}
          onGridVisibleChange={onGridVisibleChange}
          isHudVisible={true}
          onHudVisibleChange={onHudVisibleChange}
          onClose={onClose}
        />,
      );
    });

    const switches = host.querySelectorAll<HTMLButtonElement>('[role="switch"]');
    const closeButton = host.querySelector<HTMLButtonElement>(
      '[aria-label="Close canvas settings"]',
    );

    expect(switches).toHaveLength(2);
    expect(host.querySelectorAll<HTMLButtonElement>('[role="tab"]')).toHaveLength(0);

    act(() => {
      switches[0]?.click();
      switches[1]?.click();
      closeButton?.click();
    });

    expect(onGridVisibleChange).toHaveBeenCalledWith(true);
    expect(onHudVisibleChange).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

function createCanvasData(): CanvasData {
  return {
    version: '2.1',
    name: 'Board A',
    projected: true,
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [
      {
        id: 'annotation-1',
        type: 'annotation',
        position: { x: 0, y: 0 },
        size: { width: 120, height: 80 },
        zIndex: 0,
        data: { content: 'A' },
      },
      {
        id: 'annotation-2',
        type: 'annotation',
        position: { x: 160, y: 0 },
        size: { width: 120, height: 80 },
        zIndex: 1,
        data: { content: 'B' },
      },
    ],
    connections: [
      {
        id: 'connection-1',
        sourceId: 'annotation-1',
        targetId: 'annotation-2',
        sourceEndpoint: { nodeId: 'annotation-1', scope: 'node' },
        targetEndpoint: { nodeId: 'annotation-2', scope: 'node' },
      },
    ],
    linkedProject: 'project.nkp',
    relatedBoards: [],
    playback: {
      version: 1,
      adapterId: 'storyboard',
      mode: 'linear',
    },
  };
}
