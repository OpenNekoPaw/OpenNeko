// @vitest-environment jsdom

import type { MarkdownCanvasNode } from '@neko/canvas-domain';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useMarqueeSelect } from './useMarqueeSelect';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
});

describe('useMarqueeSelect', () => {
  it('keeps the gesture-start additive decision through mouseup', async () => {
    const onSelect = vi.fn();
    ({ root, container } = createTestRoot());
    await act(async () => {
      root?.render(<MarqueeHarness onSelect={onSelect} />);
    });
    const surface = container?.querySelector<HTMLElement>('[data-marquee-harness]');
    if (!surface) throw new Error('Marquee harness not found.');
    surface.getBoundingClientRect = () => new DOMRect(0, 0, 400, 300);

    await act(async () => {
      surface.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
          shiftKey: true,
          clientX: 0,
          clientY: 0,
        }),
      );
    });
    await act(async () => {
      surface.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          buttons: 1,
          clientX: 180,
          clientY: 180,
        }),
      );
    });
    await act(async () => {
      surface.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 0,
          shiftKey: false,
          clientX: 180,
          clientY: 180,
        }),
      );
    });

    expect(onSelect).toHaveBeenCalledWith(['inside'], true);
  });
});

function MarqueeHarness({
  onSelect,
}: {
  readonly onSelect: (nodeIds: string[], additive: boolean) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const marquee = useMarqueeSelect({
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    containerRef: surfaceRef,
    nodes: [markdownNode('inside', 40, 40), markdownNode('outside', 280, 220)],
    onSelect,
  });
  return (
    <div ref={surfaceRef} data-marquee-harness {...marquee.handlers}>
      {marquee.marqueeRect ? <span data-marquee-active /> : null}
    </div>
  );
}

function markdownNode(id: string, x: number, y: number): MarkdownCanvasNode {
  return {
    id,
    type: 'markdown',
    position: { x, y },
    size: { width: 80, height: 80 },
    zIndex: 1,
    data: { content: id },
  };
}

function createTestRoot(): { readonly root: Root; readonly container: HTMLDivElement } {
  const nextContainer = document.createElement('div');
  document.body.append(nextContainer);
  return { root: createRoot(nextContainer), container: nextContainer };
}
