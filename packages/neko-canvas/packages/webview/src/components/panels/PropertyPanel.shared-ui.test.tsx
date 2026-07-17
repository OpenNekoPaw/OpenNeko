// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import { PropertyPanel } from './PropertyPanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(globalThis as { React?: typeof React }).React = React;

describe('Canvas PropertyPanel shared UI migration', () => {
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

  it('delegates transform, lock, and delete actions through shared controls', () => {
    const onDeleteNode = vi.fn();
    const onToggleLock = vi.fn();
    const onUpdateNode = vi.fn();

    act(() => {
      root.render(
        <PropertyPanel
          selectedNodes={[createNode()]}
          onDeleteNode={onDeleteNode}
          onToggleLock={onToggleLock}
          onUpdateNode={onUpdateNode}
          onUpdateNodeData={vi.fn()}
        />,
      );
    });

    const xInput = host.querySelector<HTMLInputElement>(
      '[data-property-id="position.x"] input[type="number"]',
    );
    expect(xInput).not.toBeNull();

    act(() => {
      if (!xInput) return;
      setInputValue(xInput, '24');
      xInput.dispatchEvent(new Event('input', { bubbles: true }));
      xInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    expect(onUpdateNode).toHaveBeenCalledWith('node-1', { position: { x: 24, y: 20 } });

    act(() => {
      host.querySelector<HTMLButtonElement>('button .codicon-lock')?.closest('button')?.click();
    });
    expect(onToggleLock).toHaveBeenCalledWith('node-1');

    act(() => {
      host.querySelector<HTMLButtonElement>('button .codicon-trash')?.closest('button')?.click();
    });
    expect(onDeleteNode).toHaveBeenCalledWith('node-1');
  });

  it('renders lightweight reference summaries without raw descriptor JSON', () => {
    act(() => {
      root.render(
        <PropertyPanel
          selectedNodes={[
            createNode({
              id: 'shot-1',
              type: 'shot',
              data: {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'A close-up panel',
                characters: [],
                shotScale: 'MS',
                characterAction: '',
                emotion: [],
                sceneTags: [],
                generationStatus: 'idle',
                generationHistory: [],
                referenceRefs: ['gallery-1'],
                generatedAsset: {
                  id: 'asset-generated-1',
                  type: 'generated-image',
                  path: '${PROJECT}/generated/asset-generated-1.png',
                  mimeType: 'image/png',
                  generatedAt: '2026-06-09T00:00:00.000Z',
                  width: 1024,
                  height: 576,
                  ratio: '16:9',
                },
                runtimeReferenceImagePath: 'vscode-resource://runtime/panel.png',
              },
            }),
          ]}
          onDeleteNode={vi.fn()}
          onToggleLock={vi.fn()}
          onUpdateNode={vi.fn()}
          onUpdateNodeData={vi.fn()}
        />,
      );
    });

    expect(host.textContent).toContain('References');
    expect(host.textContent).toContain('Reference');
    expect(host.textContent).toContain('Output');
    expect(host.textContent).toContain('runtime projection');
    expect(host.textContent).not.toContain('reference-descriptor');
  });
});

function createNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: 'node-1',
    type: 'annotation',
    position: { x: 10, y: 20 },
    size: { width: 120, height: 80 },
    zIndex: 4,
    rotation: 15,
    locked: true,
    data: { content: 'Note' },
    ...overrides,
  } as CanvasNode;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}
