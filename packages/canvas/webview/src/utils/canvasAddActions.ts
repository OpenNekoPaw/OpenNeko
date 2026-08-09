import type { CanonicalCanvasNodeType } from '@neko/canvas-domain';

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
  readonly mode: 'direct' | 'generation' | 'source';
  readonly generationKind?: 'prompt' | 'image' | 'video' | 'audio';
  readonly sourceKind?: CanvasAddSourceKind;
}

export const CANVAS_ADD_ACTIONS: readonly CanvasAddAction[] = [
  {
    id: 'text',
    nodeType: 'generation',
    labelKey: 'node.text',
    mode: 'generation',
    generationKind: 'prompt',
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
    nodeType: 'generation',
    labelKey: 'node.image',
    mode: 'generation',
    generationKind: 'image',
  },
  {
    id: 'video',
    nodeType: 'generation',
    labelKey: 'node.video',
    mode: 'generation',
    generationKind: 'video',
  },
  {
    id: 'audio',
    nodeType: 'generation',
    labelKey: 'node.audio',
    mode: 'generation',
    generationKind: 'audio',
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
