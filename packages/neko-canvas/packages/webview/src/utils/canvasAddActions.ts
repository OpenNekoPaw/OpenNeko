import type { CanonicalCanvasNodeType } from '@neko/shared';

export type CanvasAddActionId = 'text' | 'table' | 'image' | 'video' | 'audio' | 'director3d';

export type CanvasAddSourceKind = 'image' | 'video' | 'audio' | 'model';
export type CanvasAddSourceModeId = 'create' | 'import' | 'reference';

export interface CanvasAddSourceMode {
  readonly id: CanvasAddSourceModeId;
  readonly labelKey: string;
  readonly descriptionKey: string;
}

export const CANVAS_ADD_SOURCE_MODES: readonly CanvasAddSourceMode[] = [
  {
    id: 'create',
    labelKey: 'sourceMode.create',
    descriptionKey: 'sourceMode.createDescription',
  },
  {
    id: 'import',
    labelKey: 'sourceMode.import',
    descriptionKey: 'sourceMode.importDescription',
  },
  {
    id: 'reference',
    labelKey: 'sourceMode.reference',
    descriptionKey: 'sourceMode.referenceDescription',
  },
] as const;

export interface CanvasAddAction {
  readonly id: CanvasAddActionId;
  readonly nodeType: CanonicalCanvasNodeType;
  readonly labelKey: string;
  readonly descriptionKey?: string;
  readonly badgeKey?: string;
  readonly mode: 'direct' | 'source';
  readonly sourceKind?: CanvasAddSourceKind;
}

export const CANVAS_ADD_ACTIONS: readonly CanvasAddAction[] = [
  {
    id: 'text',
    nodeType: 'markdown',
    labelKey: 'node.text',
    mode: 'direct',
  },
  {
    id: 'table',
    nodeType: 'markdown',
    labelKey: 'node.table',
    descriptionKey: 'node.tableDescription',
    mode: 'direct',
  },
  {
    id: 'image',
    nodeType: 'media',
    labelKey: 'node.image',
    mode: 'source',
    sourceKind: 'image',
  },
  {
    id: 'video',
    nodeType: 'media',
    labelKey: 'node.video',
    mode: 'source',
    sourceKind: 'video',
  },
  {
    id: 'audio',
    nodeType: 'media',
    labelKey: 'node.audio',
    mode: 'source',
    sourceKind: 'audio',
  },
  {
    id: 'director3d',
    nodeType: 'file',
    labelKey: 'node.director3d',
    badgeKey: 'badge.new',
    mode: 'source',
    sourceKind: 'model',
  },
] as const;

const ACTION_BY_ID = new Map(CANVAS_ADD_ACTIONS.map((action) => [action.id, action]));

export function getCanvasAddAction(id: CanvasAddActionId): CanvasAddAction {
  const action = ACTION_BY_ID.get(id);
  if (!action) {
    throw new Error(`Unknown Canvas add action "${id}"`);
  }
  return action;
}
