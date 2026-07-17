import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ISceneController,
  ViewportEvent,
  ViewportFrameMeta,
  ViewportKeyInput,
  ViewportMenuItem,
  ViewportOverlayDescriptor,
  ViewportPointerInput,
  ViewportToolbarItem,
  ViewportWheelInput,
} from '@neko/shared';
import { ViewportShell } from './ViewportShell';

describe('ViewportShell', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    vi.restoreAllMocks();
  });

  it('delegates pointer input to the active scene controller', () => {
    const controller = createController();
    render(controller);
    const shell = getShell();
    shell.getBoundingClientRect = () => rect(10, 20, 400, 300);
    shell.setPointerCapture = vi.fn();
    shell.releasePointerCapture = vi.fn();

    act(() => {
      shell.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 110, clientY: 70 }));
      shell.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 120, clientY: 80 }));
      shell.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 130, clientY: 90 }));
    });

    expect(controller.onPointerDown).toHaveBeenCalledWith(
      expect.objectContaining({ position: [100, 50], phase: 'down', viewportId: 'main' }),
    );
    expect(controller.onPointerMove).toHaveBeenCalled();
    expect(controller.onPointerUp).toHaveBeenCalled();
  });

  it('delegates pointer cancel and key up events when a controller opts in', () => {
    const controller = createController();
    render(controller);
    const shell = getShell();
    shell.getBoundingClientRect = () => rect(10, 20, 400, 300);
    shell.releasePointerCapture = vi.fn();

    act(() => {
      shell.dispatchEvent(
        pointerEvent('pointercancel', { pointerId: 4, clientX: 150, clientY: 90 }),
      );
      shell.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Escape' }));
    });

    expect(controller.onPointerCancel).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'cancel', position: [140, 70] }),
    );
    expect(controller.onKeyUp).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'up', key: 'Escape' }),
    );
  });

  it('renders shared toolbar controls and controller extensions', () => {
    const controller = createController({
      toolbar: [
        {
          id: 'model-camera',
          kind: 'button',
          icon: 'C',
          action: 'scene:model:camera',
          order: 20,
        },
      ],
    });
    const onToolbarAction = vi.fn();
    render(controller, { onToolbarAction });

    const buttons = [...host.querySelectorAll('button')];
    expect(buttons.map((button) => button.dataset['action'])).toContain('viewport:zoom:in');
    expect(buttons.map((button) => button.dataset['action'])).toContain('scene:model:camera');

    act(() => {
      buttons.find((button) => button.dataset['action'] === 'scene:model:camera')?.click();
    });
    expect(onToolbarAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'scene:model:camera' }),
    );
  });

  it('does not route toolbar pointer events through scene pointer control', () => {
    const controller = createController({
      toolbar: [
        {
          id: 'model-camera',
          kind: 'button',
          icon: 'C',
          action: 'scene:model:camera',
          order: 20,
        },
      ],
    });
    render(controller);
    const shell = getShell();
    shell.setPointerCapture = vi.fn();
    const button = host.querySelector<HTMLButtonElement>('[data-action="scene:model:camera"]');
    if (!button) throw new Error('Toolbar button not rendered');

    act(() => {
      button.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 30, clientY: 20 }));
    });

    expect(controller.onPointerDown).not.toHaveBeenCalled();
    expect(shell.setPointerCapture).not.toHaveBeenCalled();
  });

  it('does not route toolbar key events through scene key control', () => {
    const controller = createController({
      toolbar: [
        {
          id: 'model-camera',
          kind: 'button',
          icon: 'C',
          action: 'scene:model:camera',
          order: 20,
        },
      ],
    });
    render(controller);
    const button = host.querySelector<HTMLButtonElement>('[data-action="scene:model:camera"]');
    if (!button) throw new Error('Toolbar button not rendered');

    act(() => {
      button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });

    expect(controller.onKeyDown).not.toHaveBeenCalled();
  });

  it('does not route SVG icon pointer events inside toolbar buttons through scene pointer control', () => {
    const controller = createController({
      toolbar: [
        {
          id: 'model-camera',
          kind: 'button',
          icon: 'C',
          action: 'scene:model:camera',
          order: 20,
        },
      ],
    });
    render(controller);
    const shell = getShell();
    shell.setPointerCapture = vi.fn();
    const button = host.querySelector<HTMLButtonElement>('[data-action="scene:model:camera"]');
    if (!button) throw new Error('Toolbar button not rendered');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    button.appendChild(icon);

    act(() => {
      icon.dispatchEvent(pointerEvent('pointerdown', { pointerId: 3, clientX: 30, clientY: 20 }));
    });

    expect(controller.onPointerDown).not.toHaveBeenCalled();
    expect(shell.setPointerCapture).not.toHaveBeenCalled();
  });

  it('keeps wheel zoom as shell-local state while still notifying controller', () => {
    const controller = createController();
    const onLocalStateChange = vi.fn();
    render(controller, { onLocalStateChange });
    const shell = getShell();
    shell.getBoundingClientRect = () => rect(0, 0, 400, 300);

    act(() => {
      shell.dispatchEvent(wheelEvent({ clientX: 200, clientY: 100, deltaY: -120 }));
    });

    expect(controller.onWheel).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'wheel', position: [200, 100], delta: [0, -120] }),
    );
    expect(onLocalStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: expect.any(Number) }),
      expect.objectContaining({ type: 'zoomBy' }),
    );
  });

  it('delegates semantic pointer events exactly once from the shell surface', () => {
    const controller = createController();
    render(controller);
    const shell = getShell();
    shell.getBoundingClientRect = () => rect(0, 0, 400, 300);
    shell.setPointerCapture = vi.fn();

    act(() => {
      shell.dispatchEvent(pointerEvent('pointerdown', { pointerId: 10, clientX: 32, clientY: 48 }));
    });

    expect(controller.onPointerDown).toHaveBeenCalledTimes(1);
    expect(controller.onPointerDown).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneId: 'scene-a',
        viewportId: 'main',
        position: [32, 48],
      }),
    );
  });

  it('does not route context menu item pointer events through scene pointer control', () => {
    const controller = createController({
      contextMenu: [
        {
          id: 'fit',
          label: 'Fit',
          action: 'viewport:fit',
        },
      ],
    });
    const onContextMenuAction = vi.fn();
    render(controller, { onContextMenuAction });
    const shell = getShell();
    shell.getBoundingClientRect = () => rect(0, 0, 400, 300);
    shell.setPointerCapture = vi.fn();

    act(() => {
      shell.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 20,
          clientY: 30,
        }),
      );
    });
    const menuItem = host.querySelector<HTMLButtonElement>('[data-action="viewport:fit"]');
    if (!menuItem) throw new Error('Context menu item not rendered');

    act(() => {
      menuItem.dispatchEvent(
        pointerEvent('pointerdown', { pointerId: 11, clientX: 20, clientY: 30 }),
      );
      menuItem.click();
    });

    expect(controller.onPointerDown).not.toHaveBeenCalled();
    expect(shell.setPointerCapture).not.toHaveBeenCalled();
    expect(onContextMenuAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'viewport:fit' }),
    );
  });

  function render(
    controller: ISceneController,
    options: {
      onLocalStateChange?: Parameters<typeof ViewportShell>[0]['onLocalStateChange'];
      onToolbarAction?: Parameters<typeof ViewportShell>[0]['onToolbarAction'];
      onContextMenuAction?: Parameters<typeof ViewportShell>[0]['onContextMenuAction'];
    } = {},
  ) {
    act(() => {
      root.render(
        <ViewportShell
          sceneId="scene-a"
          viewportId="main"
          controller={controller}
          frameMeta={frameMeta}
          onLocalStateChange={options.onLocalStateChange}
          onToolbarAction={options.onToolbarAction}
          onContextMenuAction={options.onContextMenuAction}
        />,
      );
    });
  }

  function getShell(): HTMLDivElement {
    const shell = host.querySelector<HTMLDivElement>('[data-neko-viewport-shell="true"]');
    if (!shell) throw new Error('ViewportShell not rendered');
    return shell;
  }
});

const frameMeta: ViewportFrameMeta = {
  protocolVersion: 1,
  streamId: 'stream-main',
  sceneId: 'scene-a',
  viewportId: 'main',
  frameId: 1,
  ptsUs: 0,
  durationUs: 16666,
  frameTimestamp: 100,
  revision: 1,
  appliedSeq: 1,
  viewTransform: [1, 0, 0, 1, 0, 0],
};

function createController(
  options: {
    toolbar?: readonly ViewportToolbarItem[];
    contextMenu?: readonly ViewportMenuItem[];
  } = {},
): ISceneController {
  return {
    sceneId: 'scene-a',
    sceneType: '3d',
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    onPointerCancel: vi.fn(),
    onWheel: vi.fn(),
    onKeyDown: vi.fn(),
    onKeyUp: vi.fn(),
    getOverlays: vi.fn((): readonly ViewportOverlayDescriptor[] => []),
    getToolbarExtensions: vi.fn(() => options.toolbar ?? []),
    getContextMenu: vi.fn((): readonly ViewportMenuItem[] => options.contextMenu ?? []),
    handleViewportEvent: vi.fn((_: ViewportEvent) => undefined),
  };
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => undefined,
  } as DOMRect;
}

function pointerEvent(
  type: string,
  init: Pick<PointerEventInit, 'pointerId' | 'clientX' | 'clientY'>,
): Event {
  return new PointerEvent(type, {
    bubbles: true,
    pointerId: init.pointerId,
    pointerType: 'mouse',
    clientX: init.clientX,
    clientY: init.clientY,
    buttons: type === 'pointerup' ? 0 : 1,
    button: 0,
  });
}

function wheelEvent(init: Pick<WheelEventInit, 'clientX' | 'clientY' | 'deltaY'>): Event {
  return new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
    deltaX: 0,
    deltaY: init.deltaY,
    deltaMode: 0,
  });
}

function fakeCanvasContext() {
  return {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
  };
}
