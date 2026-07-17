import type { CanvasNodeType } from '@neko/shared';

export type NodeLibraryCreationKind = 'create' | 'file-bound' | 'source-bound' | 'projection-only';

export interface NodeLibraryCreationPolicy {
  readonly kind: NodeLibraryCreationKind;
  readonly canDragToCreate: boolean;
  readonly badgeKey?: string;
  readonly titleKey: string;
  readonly requiresSourceAdd?: boolean;
}

const FILE_BOUND_NODE_TYPES = new Set<CanvasNodeType>([
  'media',
  'script',
  'document',
  'model',
  'canvas-embed',
  'project',
]);

const SOURCE_BOUND_NODE_TYPES = new Set<CanvasNodeType>(['entity']);

const PROJECTION_ONLY_NODE_TYPES = new Set<CanvasNodeType>([
  'representation-slot',
  'occurrence',
  'generated-asset',
]);

export function getNodeLibraryCreationPolicy(nodeType: CanvasNodeType): NodeLibraryCreationPolicy {
  if (FILE_BOUND_NODE_TYPES.has(nodeType)) {
    return {
      kind: 'file-bound',
      canDragToCreate: false,
      badgeKey: 'library.badge.file',
      titleKey: 'library.action.pickFile',
      requiresSourceAdd: true,
    };
  }

  if (SOURCE_BOUND_NODE_TYPES.has(nodeType)) {
    return {
      kind: 'source-bound',
      canDragToCreate: false,
      badgeKey: 'library.badge.source',
      titleKey: 'library.action.sourceBound',
    };
  }

  if (PROJECTION_ONLY_NODE_TYPES.has(nodeType)) {
    return {
      kind: 'projection-only',
      canDragToCreate: false,
      badgeKey: 'library.badge.projected',
      titleKey: 'library.action.projected',
    };
  }

  return {
    kind: 'create',
    canDragToCreate: true,
    titleKey: 'library.action.create',
  };
}

export function isNodeLibraryDirectCreateType(nodeType: CanvasNodeType): boolean {
  return getNodeLibraryCreationPolicy(nodeType).kind === 'create';
}

export function isNodeLibraryFileBoundType(nodeType: CanvasNodeType): boolean {
  return getNodeLibraryCreationPolicy(nodeType).kind === 'file-bound';
}

export function isNodeLibraryVisibleCreateType(nodeType: CanvasNodeType): boolean {
  return getNodeLibraryCreationPolicy(nodeType).kind === 'create';
}

export function requiresNodeLibrarySourceAdd(nodeType: CanvasNodeType): boolean {
  return getNodeLibraryCreationPolicy(nodeType).requiresSourceAdd === true;
}
