// @vitest-environment jsdom

import { act, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import {
  resolveConnectionDropTarget,
  useConnectionDrag,
  type UseConnectionDragReturn,
} from './useConnectionDrag';

describe('resolveConnectionDropTarget', () => {
  const nodes = [media('source'), media('target')];

  it('resolves an input handle to its port endpoint', () => {
    const target = document.createElement('div');
    target.dataset.nodeId = 'target';
    target.dataset.connectionHandle = 'in';
    target.dataset.portType = 'input';
    target.dataset.endpointScope = 'port';

    expect(resolveConnectionDropTarget(target, 'source', nodes)).toEqual({
      ok: true,
      target: {
        nodeId: 'target',
        handleId: 'in',
        endpoint: { nodeId: 'target', scope: 'port', portId: 'in' },
      },
    });
  });

  it('snaps a child element inside a target card to a node endpoint', () => {
    const card = document.createElement('div');
    card.dataset.nodeId = 'target';
    const content = document.createElement('button');
    card.appendChild(content);

    expect(resolveConnectionDropTarget(content, 'source', nodes)).toEqual({
      ok: true,
      target: {
        nodeId: 'target',
        handleId: 'in',
        endpoint: { nodeId: 'target', scope: 'node' },
      },
    });
  });

  it('reports output handles and self targets as invalid', () => {
    const output = document.createElement('div');
    output.dataset.nodeId = 'target';
    output.dataset.connectionHandle = 'out';
    output.dataset.portType = 'output';
    output.dataset.endpointScope = 'port';
    const sourceCard = document.createElement('div');
    sourceCard.dataset.nodeId = 'source';

    expect(resolveConnectionDropTarget(output, 'source', nodes)).toEqual({
      ok: false,
      targetNodeId: 'target',
      reason: 'target-direction',
    });
    expect(resolveConnectionDropTarget(sourceCard, 'source', nodes)).toEqual({
      ok: false,
      targetNodeId: 'source',
      reason: 'self-connection',
    });
  });

  it('returns no target for blank Canvas', () => {
    expect(resolveConnectionDropTarget(document.createElement('div'), 'source', nodes)).toEqual({
      ok: false,
      reason: 'missing-target',
    });
  });

  it('projects valid target feedback during drag and cancels the session with Escape', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const target = document.createElement('div');
    target.dataset.nodeId = 'target';
    document.body.appendChild(target);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => target),
    });
    const onCancel = vi.fn();
    let latest: UseConnectionDragReturn | undefined;
    const root = createRoot(host);

    act(() => {
      root.render(
        <ConnectionDragHarness
          nodes={nodes}
          onChange={(value) => {
            latest = value;
          }}
          onCancel={onCancel}
        />,
      );
    });
    const source = host.querySelector<HTMLButtonElement>('button');
    if (!source) throw new Error('source handle was not rendered');

    act(() => {
      source.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 20 }),
      );
    });
    expect(latest?.isConnecting).toBe(true);

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 40 }));
    });
    expect(latest?.targetState).toEqual({ nodeId: 'target', validity: 'valid' });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(latest?.isConnecting).toBe(false);
    expect(latest?.pendingConnection).toBeNull();
    expect(onCancel).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    Reflect.deleteProperty(document, 'elementFromPoint');
    target.remove();
    host.remove();
  });
});

function ConnectionDragHarness({
  nodes,
  onChange,
  onCancel,
}: {
  readonly nodes: readonly CanvasNode[];
  readonly onChange: (value: UseConnectionDragReturn) => void;
  readonly onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const value = useConnectionDrag({
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    containerRef,
    nodes,
    onConnectionCancel: onCancel,
    validateConnection: () => ({ ok: true }),
  });
  useEffect(() => onChange(value), [onChange, value]);
  return (
    <div ref={containerRef}>
      <button type="button" onMouseDown={(event) => value.startConnection('source', 'out', event)}>
        source
      </button>
    </div>
  );
}

function media(id: string): CanvasNode {
  return {
    id,
    type: 'media',
    position: { x: 0, y: 0 },
    size: { width: 280, height: 200 },
    zIndex: 1,
    data: { assetPath: `media/${id}.mp4`, mediaType: 'video' },
  };
}
