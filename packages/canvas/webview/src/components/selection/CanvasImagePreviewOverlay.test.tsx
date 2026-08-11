// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { CanvasNode } from '@neko/canvas-domain';
import {
  CanvasImagePreviewOverlay,
  resolveCanvasImagePreviewSource,
} from './CanvasImagePreviewOverlay';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('CanvasImagePreviewOverlay', () => {
  it('resolves the exact selected generated Image output', () => {
    const node: CanvasNode = {
      id: 'generation-image',
      type: 'generation',
      position: { x: 0, y: 0 },
      size: { width: 240, height: 180 },
      zIndex: 1,
      data: {
        recipe: { kind: 'image', prompt: 'Character sheet', count: 2 },
        outputs: [output('output-1', 'sha256:first'), output('output-2', 'sha256:selected')],
        selectedOutputId: 'output-2',
      },
    };

    expect(resolveCanvasImagePreviewSource(node)).toEqual(
      expect.objectContaining({
        id: 'canvas-fullscreen:generation:generation-image:output-2',
        role: 'image',
        contentLocator: expect.objectContaining({
          kind: 'generated-output',
          outputId: 'output-2',
          digest: 'sha256:selected',
        }),
      }),
    );
  });

  it('closes on Escape without mutating Canvas state', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <CanvasImagePreviewOverlay
          source={{
            id: 'canvas-fullscreen:media:image-1',
            role: 'image',
            title: 'image.png',
            asset: { kind: 'asset-identity', mediaType: 'image' },
            contentLocator: { kind: 'workspace-file', path: 'assets/image.png' },
            metadata: {},
          }}
          onClose={onClose}
        />,
      );
    });

    expect(container.querySelector('[data-canvas-image-preview="true"]')).not.toBeNull();
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('image.png');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    container.remove();
  });
});

function output(outputId: string, digest: string) {
  return {
    outputId,
    jobRef: { kind: 'generation', jobId: 'job-1' } as const,
    locator: {
      kind: 'generated-output' as const,
      outputId,
      digest,
      path: `neko/generated/${outputId}.png`,
    },
    kind: 'image' as const,
    recipeInputFingerprint: 'recipe-fingerprint-1',
  };
}
