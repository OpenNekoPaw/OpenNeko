import React from 'react';
import type {
  PropertyDefinition,
  PropertyGroupDefinition,
  PropertyValue,
  TreeViewBadge,
  TreeViewItem,
} from '@neko/ui/creative';
import type { CanvasNode, CanvasNodeType, CanvasSubsystemManifest } from '@neko/shared';
import type { NodeTypeDescriptorRegistry } from '../nodes/nodeTypeDescriptor';
import { t } from '../../i18n';
import { getNodeLibraryCreationPolicy } from '../../utils/nodeLibraryPolicy';
import type { NodeLibraryGroup } from '../panels/NodeLibraryPanel';

export interface CanvasNodePropertyAdapterResult {
  readonly properties: readonly PropertyDefinition[];
  readonly groups: readonly PropertyGroupDefinition[];
}

export type CanvasNodePropertyId =
  'position.x' | 'position.y' | 'size.width' | 'size.height' | 'rotation';

type NodeLibraryIconGlyph =
  | 'action'
  | 'canvas'
  | 'chat'
  | 'code-file'
  | 'cube'
  | 'database'
  | 'decision'
  | 'document'
  | 'folder'
  | 'frame'
  | 'gallery'
  | 'hierarchy'
  | 'image'
  | 'key'
  | 'layers'
  | 'merge'
  | 'note'
  | 'person'
  | 'play'
  | 'slot'
  | 'state'
  | 'stop'
  | 'table'
  | 'target'
  | 'text'
  | 'trigger';

type NodeLibraryIconStyle = React.CSSProperties & {
  readonly '--node-library-icon-color': string;
};

export function mapCanvasNodeTransformToProperties(
  node: CanvasNode,
  translate: (key: string) => string,
): CanvasNodePropertyAdapterResult {
  return {
    properties: [
      {
        id: 'position.x',
        kind: 'number',
        label: 'X',
        value: node.position.x,
        step: 1,
      },
      {
        id: 'position.y',
        kind: 'number',
        label: 'Y',
        value: node.position.y,
        step: 1,
      },
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
  if (typeof value !== 'number') {
    return {};
  }

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

export function mapCanvasNodeLibraryGroupToTreeItems({
  descriptors,
  group,
}: {
  readonly descriptors: NodeTypeDescriptorRegistry;
  readonly group: NodeLibraryGroup;
}): readonly TreeViewItem[] {
  return group.nodeTypes.map((nodeType) =>
    mapCanvasNodeLibraryTypeToTreeItem({
      descriptors,
      nodeType,
      subsystemId: group.subsystemId,
    }),
  );
}

function mapCanvasNodeLibraryTypeToTreeItem({
  descriptors,
  nodeType,
  subsystemId,
}: {
  readonly descriptors: NodeTypeDescriptorRegistry;
  readonly nodeType: CanvasNodeType;
  readonly subsystemId?: CanvasSubsystemManifest['id'];
}): TreeViewItem {
  const descriptor = descriptors[nodeType];
  const policy = getNodeLibraryCreationPolicy(nodeType);
  const badge = policy.badgeKey ? createNodeLibraryBadge(policy.badgeKey) : undefined;
  return {
    id: nodeType,
    label: resolveCanvasNodeLibraryLabel(nodeType, descriptor),
    icon: createCanvasNodeLibraryIcon(nodeType, descriptor?.tagColor),
    draggable: policy.canDragToCreate,
    disabled: policy.kind !== 'create' && !policy.requiresSourceAdd,
    badges: badge ? [badge] : [],
    metadata: {
      kind: 'node-type',
      nodeType,
      subsystemId,
      creationPolicy: policy,
    },
  };
}

function resolveCanvasNodeLibraryLabel(
  nodeType: CanvasNodeType,
  descriptor?: NodeTypeDescriptorRegistry[CanvasNodeType],
): string {
  const key = descriptor?.labelKey ?? NODE_TYPE_LABEL_KEY_FALLBACK[nodeType] ?? `node.${nodeType}`;
  const label = t(key);
  return label === key ? nodeType : label;
}

function createNodeLibraryBadge(badgeKey: string): TreeViewBadge {
  return {
    id: badgeKey,
    label: React.createElement('span', { 'data-node-library-badge': badgeKey }, t(badgeKey)),
  };
}

export function createCanvasNodeLibraryIcon(
  nodeType: CanvasNodeType,
  color = NODE_LIBRARY_ICON_FALLBACK_COLOR,
): React.ReactNode {
  const glyph = resolveNodeLibraryIconGlyph(nodeType);
  return React.createElement(
    'span',
    {
      'aria-hidden': 'true',
      className: 'canvas-node-library-icon',
      'data-node-library-icon': nodeType,
      style: { '--node-library-icon-color': color } satisfies NodeLibraryIconStyle,
    },
    React.createElement(
      'svg',
      {
        className: 'canvas-node-library-icon-svg',
        'data-node-library-icon-glyph': glyph,
        fill: 'none',
        focusable: 'false',
        stroke: 'currentColor',
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 1.8,
        viewBox: '0 0 24 24',
      },
      ...createNodeLibraryIconGlyph(glyph),
    ),
  );
}

function resolveNodeLibraryIconGlyph(nodeType: CanvasNodeType): NodeLibraryIconGlyph {
  return NODE_LIBRARY_ICON_BY_TYPE[nodeType];
}

function createNodeLibraryIconGlyph(glyph: NodeLibraryIconGlyph): React.ReactElement[] {
  switch (glyph) {
    case 'action':
      return [
        rect('frame', { x: 4, y: 6, width: 16, height: 12, rx: 2 }),
        path('arrow', 'M8 12h7m-3-3 3 3-3 3'),
      ];
    case 'canvas':
      return [
        rect('outer', { x: 4, y: 5, width: 16, height: 14, rx: 2 }),
        rect('inner', { x: 8, y: 9, width: 8, height: 6, rx: 1.5 }),
      ];
    case 'chat':
      return [
        path('bubble', 'M5 6h14v9H9l-4 4V6Z'),
        line('text-a', { x1: 8, y1: 10, x2: 16, y2: 10 }),
        line('text-b', { x1: 8, y1: 13, x2: 13, y2: 13 }),
      ];
    case 'code-file':
      return [
        path('file', 'M7 3h7l4 4v14H7V3Z'),
        path('fold', 'M14 3v5h4'),
        path('left', 'M10 13l-2 2 2 2'),
        path('right', 'M14 13l2 2-2 2'),
      ];
    case 'cube':
      return [
        path('outer', 'M12 3 19 7v10l-7 4-7-4V7l7-4Z'),
        path('top', 'M5 7l7 4 7-4'),
        path('split', 'M12 11v10'),
      ];
    case 'database':
      return [
        path('top', 'M5 7c0-2 14-2 14 0s-14 2-14 0Z'),
        path('side', 'M5 7v10c0 2 14 2 14 0V7'),
        path('middle', 'M5 12c0 2 14 2 14 0'),
      ];
    case 'decision':
      return [
        polygon('diamond', { points: '12 3 20 12 12 21 4 12 12 3' }),
        line('in', { x1: 12, y1: 7, x2: 12, y2: 12 }),
        path('out', 'M12 12h4m-4 0v4'),
      ];
    case 'document':
      return [
        path('file', 'M7 3h7l4 4v14H7V3Z'),
        path('fold', 'M14 3v5h4'),
        line('line-a', { x1: 9, y1: 12, x2: 16, y2: 12 }),
        line('line-b', { x1: 9, y1: 16, x2: 14, y2: 16 }),
      ];
    case 'folder':
      return [path('folder', 'M4 7h6l2 2h8v9H4V7Z'), path('lip', 'M4 10h16')];
    case 'frame':
      return [
        rect('frame', { x: 5, y: 5, width: 14, height: 14, rx: 1.5 }),
        path('corner-a', 'M8 3v4H4'),
        path('corner-b', 'M16 21v-4h4'),
      ];
    case 'gallery':
      return [
        rect('back', { x: 4, y: 6, width: 12, height: 10, rx: 1.5 }),
        rect('front', { x: 8, y: 9, width: 12, height: 10, rx: 1.5 }),
        path('mountain', 'M10 17l3-3 2 2 2-2 2 3'),
      ];
    case 'hierarchy':
      return [
        rect('root', { x: 9, y: 3, width: 6, height: 4, rx: 1 }),
        rect('left', { x: 4, y: 17, width: 6, height: 4, rx: 1 }),
        rect('right', { x: 14, y: 17, width: 6, height: 4, rx: 1 }),
        path('links', 'M12 7v5M7 17v-3h10v3'),
      ];
    case 'image':
      return [
        rect('frame', { x: 4, y: 5, width: 16, height: 14, rx: 2 }),
        circle('sun', { cx: 8, cy: 9, r: 1.25 }),
        path('mountain', 'M6 17l4-4 3 3 2-2 3 3'),
      ];
    case 'key':
      return [
        circle('head', { cx: 8, cy: 12, r: 3 }),
        path('stem', 'M11 12h8'),
        path('teeth', 'M16 12v3m3-3v2'),
      ];
    case 'layers':
      return [
        polygon('top', { points: '12 4 20 9 12 14 4 9 12 4' }),
        path('middle', 'M4 13l8 5 8-5'),
        path('bottom', 'M4 17l8 5 8-5'),
      ];
    case 'merge':
      return [
        circle('top', { cx: 6, cy: 6, r: 2 }),
        circle('bottom', { cx: 6, cy: 18, r: 2 }),
        circle('right', { cx: 18, cy: 12, r: 2 }),
        path('links', 'M8 6c5 0 5 6 8 6M8 18c5 0 5-6 8-6'),
      ];
    case 'note':
      return [
        path('note', 'M6 4h12v11l-5 5H6V4Z'),
        path('fold', 'M13 15v5m0-5h5'),
        line('line', { x1: 9, y1: 9, x2: 15, y2: 9 }),
      ];
    case 'person':
      return [circle('head', { cx: 12, cy: 8, r: 3 }), path('body', 'M5 20c1.5-4 12.5-4 14 0')];
    case 'play':
      return [
        circle('ring', { cx: 12, cy: 12, r: 8 }),
        polygon('play', { points: '10 8 16 12 10 16 10 8' }),
      ];
    case 'slot':
      return [
        rect('slot', { x: 5, y: 5, width: 14, height: 14, rx: 2 }),
        path('pin', 'M9 12h6M12 9v6'),
        path('brackets', 'M7 8v8M17 8v8'),
      ];
    case 'state':
      return [circle('outer', { cx: 12, cy: 12, r: 7 }), circle('inner', { cx: 12, cy: 12, r: 3 })];
    case 'stop':
      return [
        circle('ring', { cx: 12, cy: 12, r: 8 }),
        rect('stop', { x: 9, y: 9, width: 6, height: 6, rx: 1 }),
      ];
    case 'table':
      return [
        rect('table', { x: 4, y: 5, width: 16, height: 14, rx: 1.5 }),
        line('row-a', { x1: 4, y1: 10, x2: 20, y2: 10 }),
        line('row-b', { x1: 4, y1: 15, x2: 20, y2: 15 }),
        line('col-a', { x1: 9, y1: 5, x2: 9, y2: 19 }),
        line('col-b', { x1: 15, y1: 5, x2: 15, y2: 19 }),
      ];
    case 'target':
      return [
        circle('outer', { cx: 12, cy: 12, r: 7 }),
        circle('inner', { cx: 12, cy: 12, r: 2 }),
        path('crosshair', 'M12 3v3M12 18v3M3 12h3M18 12h3'),
      ];
    case 'text':
      return [
        line('top', { x1: 5, y1: 6, x2: 19, y2: 6 }),
        line('stem', { x1: 12, y1: 6, x2: 12, y2: 18 }),
        line('base', { x1: 8, y1: 18, x2: 16, y2: 18 }),
      ];
    case 'trigger':
      return [path('bolt', 'M13 3 5 14h6l-1 7 9-12h-6l0-6Z')];
  }
}

function path(
  key: string,
  d: string,
  props: Omit<React.SVGProps<SVGPathElement>, 'd'> = {},
): React.ReactElement {
  return React.createElement('path', { key, d, ...props });
}

function rect(
  key: string,
  props: React.SVGProps<SVGRectElement> & {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  },
): React.ReactElement {
  return React.createElement('rect', { key, ...props });
}

function circle(
  key: string,
  props: React.SVGProps<SVGCircleElement> & {
    readonly cx: number;
    readonly cy: number;
    readonly r: number;
  },
): React.ReactElement {
  return React.createElement('circle', { key, ...props });
}

function line(
  key: string,
  props: React.SVGProps<SVGLineElement> & {
    readonly x1: number;
    readonly x2: number;
    readonly y1: number;
    readonly y2: number;
  },
): React.ReactElement {
  return React.createElement('line', { key, ...props });
}

function polygon(
  key: string,
  props: React.SVGProps<SVGPolygonElement> & {
    readonly points: string;
  },
): React.ReactElement {
  return React.createElement('polygon', { key, ...props });
}

const NODE_TYPE_LABEL_KEY_FALLBACK: Partial<Record<CanvasNodeType, string>> = {
  annotation: 'node.note',
  text: 'toolbar.text',
  scene: 'node.sceneGroup',
  'canvas-embed': 'node.canvasEmbed',
  'narrative-scene': 'node.narrativeScene',
  'narrative-note': 'node.narrativeNote',
  'representation-slot': 'node.representationSlot',
  'generated-asset': 'node.generatedAsset',
};

const NODE_LIBRARY_ICON_FALLBACK_COLOR = '#64748b';

const NODE_LIBRARY_ICON_BY_TYPE: Record<CanvasNodeType, NodeLibraryIconGlyph> = {
  action: 'action',
  annotation: 'note',
  artboard: 'frame',
  'canvas-embed': 'canvas',
  choice: 'decision',
  composite: 'hierarchy',
  condition: 'decision',
  conversation: 'chat',
  document: 'document',
  entity: 'person',
  fact: 'key',
  gallery: 'gallery',
  'generated-asset': 'cube',
  group: 'folder',
  media: 'image',
  memory: 'database',
  merge: 'merge',
  model: 'cube',
  'narrative-ending': 'stop',
  'narrative-note': 'note',
  'narrative-scene': 'layers',
  'narrative-start': 'play',
  occurrence: 'target',
  project: 'folder',
  'representation-slot': 'slot',
  scene: 'layers',
  script: 'code-file',
  shot: 'image',
  state: 'state',
  storyboard: 'gallery',
  table: 'table',
  text: 'text',
  trigger: 'trigger',
};
