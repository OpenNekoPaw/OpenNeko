import { describe, expect, it } from 'vitest';
import { createEmptyCanvasData } from '@neko/shared';
import { projectContentLocatorToCanvas } from '../canvas-content-authoring';

describe('Canvas ContentLocator authoring', () => {
  it('creates a durable media node at the requested position', () => {
    const canvas = projectContentLocatorToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      locator: { kind: 'workspace-file', path: 'media/cat.png' },
      position: { x: 320, y: 180 },
    });

    expect(canvas.nodes).toEqual([
      expect.objectContaining({
        type: 'media',
        position: { x: 320, y: 180 },
        data: expect.objectContaining({
          assetPath: 'media/cat.png',
          contentLocator: { kind: 'workspace-file', path: 'media/cat.png' },
          mediaType: 'image',
        }),
      }),
    ]);
  });

  it('maps Canvas documents and generic files without runtime locations', () => {
    const withCanvas = projectContentLocatorToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      locator: { kind: 'workspace-file', path: 'boards/scene.nkc' },
    });
    const withDocument = projectContentLocatorToCanvas({
      canvas: withCanvas,
      locator: { kind: 'workspace-file', path: 'docs/brief.pdf' },
    });

    expect(withDocument.nodes.map((node) => node.type)).toEqual(['canvas-embed', 'file']);
    expect(JSON.stringify(withDocument)).not.toContain('file://');
    expect(JSON.stringify(withDocument)).not.toContain('runtimePath');
  });
});
