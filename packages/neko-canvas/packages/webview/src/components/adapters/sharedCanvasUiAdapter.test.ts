import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import {
  createCanvasAddActionIcon,
  mapCanvasNodePropertyCommit,
  mapCanvasNodeTransformToProperties,
} from './sharedCanvasUiAdapter';

describe('sharedCanvasUiAdapter', () => {
  it('maps node transform values to shared PropertyPanel definitions', () => {
    const node = createNode();
    const result = mapCanvasNodeTransformToProperties(node, (key) => key);

    expect(result.groups).toEqual([
      {
        id: 'transform',
        label: 'panel.transform',
        propertyIds: ['position.x', 'position.y', 'size.width', 'size.height', 'rotation'],
      },
    ]);
    expect(result.properties.find((property) => property.id === 'position.x')).toMatchObject({
      kind: 'number',
      value: 10,
    });
    expect(mapCanvasNodePropertyCommit(node, 'size.width', 20)).toEqual({
      size: { width: 50, height: 80 },
    });
    expect(mapCanvasNodePropertyCommit(node, 'rotation', -10)).toEqual({ rotation: 350 });
  });

  it('uses the shared icon system for canonical add action icons', () => {
    const icon = createCanvasAddActionIcon('media', '#3b82f6');

    expect(isValidElement(icon)).toBe(true);
    expect(icon).toMatchObject({
      type: 'span',
      props: {
        'data-canvas-add-action-icon': 'media',
      },
    });
    expect(icon).toHaveProperty(
      ['props', 'className'],
      expect.stringContaining('codicon-symbol-color'),
    );
  });
});

function createNode(): CanvasNode {
  return {
    id: 'node-1',
    type: 'markdown',
    position: { x: 10, y: 20 },
    size: { width: 120, height: 80 },
    zIndex: 4,
    rotation: 15,
    data: { content: 'Note' },
  };
}
