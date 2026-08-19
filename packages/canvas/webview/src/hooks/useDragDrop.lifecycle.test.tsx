// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_LOCATOR_DRAG_MIME, createContentLocatorDragData } from '@neko/content';
import { useDragDrop, type UseDragDropOptions, type UseDragDropReturn } from './useDragDrop';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('useDragDrop lifecycle', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  it('releases the drop overlay before a ContentLocator projection settles', () => {
    const neverSettles = new Promise<unknown>(() => undefined);
    const projectContent = vi.fn(() => neverSettles);
    let dragDrop: UseDragDropReturn | undefined;

    act(() => {
      root.render(
        <DragDropHarness
          options={createOptions(projectContent)}
          onReady={(value) => {
            dragDrop = value;
          }}
        />,
      );
    });

    act(() => {
      dragDrop?.handleDragEnter(
        createDragEvent({
          types: ['application/json', CONTENT_LOCATOR_DRAG_MIME],
        }),
      );
    });
    expect(dragDrop?.isDragOver).toBe(true);

    const payload = JSON.stringify(
      createContentLocatorDragData({
        locator: { file: { authority: 'workspace', path: 'media/clip.mp4' } },
        name: 'clip.mp4',
      }),
    );
    act(() => {
      dragDrop?.handleDrop(
        createDragEvent({
          types: ['application/json', CONTENT_LOCATOR_DRAG_MIME],
          data: {
            'application/json': '{}',
            [CONTENT_LOCATOR_DRAG_MIME]: payload,
          },
          clientX: 120,
          clientY: 240,
        }),
      );
    });

    expect(projectContent).toHaveBeenCalledTimes(1);
    expect(projectContent).toHaveBeenCalledWith(
      { file: { authority: 'workspace', path: 'media/clip.mp4' } },
      'video',
      { x: 110, y: 220 },
      'clip.mp4',
    );
    expect(dragDrop?.isDragOver).toBe(false);
  });
});

function DragDropHarness({
  onReady,
  options,
}: {
  readonly onReady: (value: UseDragDropReturn) => void;
  readonly options: UseDragDropOptions;
}): React.ReactElement | null {
  const value = useDragDrop(options);
  onReady(value);
  return null;
}

function createOptions(projectContent: UseDragDropOptions['projectContent']): UseDragDropOptions {
  return {
    hostPort: {
      postMessage: vi.fn(),
      getState: vi.fn(),
      setState: vi.fn(),
    },
    screenToCanvas: (screenX, screenY) => ({ x: screenX - 10, y: screenY - 20 }),
    addMediaAt: vi.fn(),
    projectContent,
  };
}

function createDragEvent(input: {
  readonly types: string[];
  readonly data?: Readonly<Record<string, string>>;
  readonly clientX?: number;
  readonly clientY?: number;
}): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientX: input.clientX ?? 0,
    clientY: input.clientY ?? 0,
    dataTransfer: {
      types: input.types,
      files: [],
      dropEffect: 'none',
      getData: (type: string) => input.data?.[type] ?? '',
    },
  } as unknown as React.DragEvent;
}
