import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/canvas-domain';
import { buildCanvasNode } from '../../utils/nodeFactory';
import {
  createBuiltInNodePropertiesRendererRegistry,
  enumerateComposablePropertyItems,
} from './PropertyPanel';

describe('PropertyPanel canonical node registry', () => {
  it('registers direct editors only for Markdown and Group', () => {
    const registry = createBuiltInNodePropertiesRendererRegistry();

    expect(Object.keys(registry).sort()).toEqual(['group', 'markdown']);
  });

  it('does not infer legacy composable fields for canonical media nodes', () => {
    const node = {
      ...buildCanvasNode({
        type: 'media',
        position: { x: 0, y: 0 },
        zIndex: 1,
        data: {
          assetPath: 'assets/ref.png',
          mediaType: 'image',
          contentLocator: { kind: 'workspace-file', path: 'assets/ref.png' },
        },
      }),
      id: 'media-1',
    } as CanvasNode;

    expect(enumerateComposablePropertyItems(node)).toEqual([]);
  });
});
