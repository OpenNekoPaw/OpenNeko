import React from 'react';
import type { PropertyDefinition, PropertyGroupDefinition, PropertyValue } from '@neko/ui/creative';
import { toCodiconClassName, type CodiconName } from '@neko/ui/icons';
import type { CanonicalCanvasNodeType, CanvasNode } from '@neko/shared';

export interface CanvasNodePropertyAdapterResult {
  readonly properties: readonly PropertyDefinition[];
  readonly groups: readonly PropertyGroupDefinition[];
}

export type CanvasNodePropertyId =
  'position.x' | 'position.y' | 'size.width' | 'size.height' | 'rotation';

const ADD_ACTION_ICON_BY_TYPE: Readonly<Record<CanonicalCanvasNodeType, CodiconName>> = {
  markdown: 'edit',
  media: 'symbol-color',
  group: 'symbol-namespace',
  job: 'lightbulb',
  file: 'package',
  'canvas-embed': 'type-hierarchy',
};

export function mapCanvasNodeTransformToProperties(
  node: CanvasNode,
  translate: (key: string) => string,
): CanvasNodePropertyAdapterResult {
  return {
    properties: [
      { id: 'position.x', kind: 'number', label: 'X', value: node.position.x, step: 1 },
      { id: 'position.y', kind: 'number', label: 'Y', value: node.position.y, step: 1 },
      {
        id: 'size.width',
        kind: 'number',
        label: 'W',
        value: node.size.width,
        min: 50,
        step: 1,
      },
      {
        id: 'size.height',
        kind: 'number',
        label: 'H',
        value: node.size.height,
        min: 30,
        step: 1,
      },
      {
        id: 'rotation',
        kind: 'number',
        label: 'R',
        value: node.rotation ?? 0,
        min: 0,
        max: 359,
        step: 1,
        unit: 'deg',
      },
    ],
    groups: [
      {
        id: 'transform',
        label: translate('panel.transform'),
        propertyIds: ['position.x', 'position.y', 'size.width', 'size.height', 'rotation'],
      },
    ],
  };
}

export function mapCanvasNodePropertyCommit(
  node: CanvasNode,
  id: string,
  value: PropertyValue,
): Partial<CanvasNode> {
  if (typeof value !== 'number') return {};
  switch (id as CanvasNodePropertyId) {
    case 'position.x':
      return { position: { ...node.position, x: value } };
    case 'position.y':
      return { position: { ...node.position, y: value } };
    case 'size.width':
      return { size: { ...node.size, width: Math.max(50, value) } };
    case 'size.height':
      return { size: { ...node.size, height: Math.max(30, value) } };
    case 'rotation':
      return { rotation: ((value % 360) + 360) % 360 };
    default:
      return {};
  }
}

export function createCanvasAddActionIcon(
  nodeType: CanonicalCanvasNodeType,
  color = 'var(--neko-fg-secondary)',
): React.ReactNode {
  return React.createElement('span', {
    'aria-hidden': 'true',
    className: `${toCodiconClassName(ADD_ACTION_ICON_BY_TYPE[nodeType])} canvas-add-action-icon`,
    'data-canvas-add-action-icon': nodeType,
    style: { color },
  });
}
