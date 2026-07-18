import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { CanvasNode, CanvasSubsystemManifest } from '@neko/shared';
import {
  createCanvasNodeLibraryIcon,
  mapCanvasNodeLibraryGroupToTreeItems,
  mapCanvasNodePropertyCommit,
  mapCanvasNodeTransformToProperties,
} from './sharedCanvasUiAdapter';
import type { NodeLibraryGroup } from '../panels/NodeLibraryPanel';

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

  it('maps node library groups to TreeView items with creation metadata', () => {
    const group: NodeLibraryGroup = {
      id: 'core',
      label: 'Basic',
      nodeTypes: ['text'],
      presentation: 'node-entries',
    };

    const items = mapCanvasNodeLibraryGroupToTreeItems({
      descriptors: {
        text: {
          type: 'text',
          labelKey: 'toolbar.text',
          icon: 'T',
          tagLabel: 'TXT',
          tagColor: '#fff',
          defaultSize: { width: 100, height: 50 },
          presentation: 'foundational',
        },
      },
      group,
    });

    expect(items[0]).toMatchObject({
      id: 'text',
      label: 'Text',
      draggable: true,
      disabled: false,
    });
    expect(items[0]?.icon).not.toBe('T');
  });

  it('marks subsystem node entries with subsystem metadata', () => {
    const group: NodeLibraryGroup = {
      id: 'storyboard',
      label: 'Storyboard',
      nodeTypes: ['shot'],
      presentation: 'node-entries',
      subsystemId: 'storyboard' as CanvasSubsystemManifest['id'],
    };

    const items = mapCanvasNodeLibraryGroupToTreeItems({
      descriptors: {},
      group,
    });

    expect(items[0]?.metadata).toMatchObject({
      kind: 'node-type',
      nodeType: 'shot',
      subsystemId: 'storyboard',
    });
  });

  it('uses a consistent inline SVG wrapper for node library icons', () => {
    const icon = createCanvasNodeLibraryIcon('media', '#3b82f6');

    expect(isValidElement(icon)).toBe(true);
    expect(icon).toMatchObject({
      type: 'span',
      props: {
        className: 'canvas-node-library-icon',
        'data-node-library-icon': 'media',
      },
    });
    expect(icon).toHaveProperty(['props', 'children', 'type'], 'svg');
    expect(icon).toHaveProperty(
      ['props', 'children', 'props', 'data-node-library-icon-glyph'],
      'image',
    );
    expect(icon).toHaveProperty(['props', 'children', 'props', 'viewBox'], '0 0 24 24');
  });
});

function createNode(): CanvasNode {
  return {
    id: 'node-1',
    type: 'annotation',
    position: { x: 10, y: 20 },
    size: { width: 120, height: 80 },
    zIndex: 4,
    rotation: 15,
    data: { content: 'Note' },
  } as CanvasNode;
}
