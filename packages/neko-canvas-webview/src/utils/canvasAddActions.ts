import type { CanonicalCanvasNodeType } from '@neko/shared';

export type CanvasAddActionId =
  'markdown' | 'image' | 'audio' | 'video' | 'group' | 'file' | 'subcanvas';

export interface CanvasAddAction {
  readonly id: CanvasAddActionId;
  readonly nodeType: CanonicalCanvasNodeType;
  readonly labelKey: string;
  readonly mode: 'direct' | 'source';
  readonly mediaType?: 'image' | 'audio' | 'video';
}

export interface CanvasAddActionGroup {
  readonly id: 'create' | 'import' | 'reference';
  readonly labelKey: string;
  readonly actions: readonly CanvasAddAction[];
}

export const CANVAS_ADD_ACTION_GROUPS: readonly CanvasAddActionGroup[] = [
  {
    id: 'create',
    labelKey: 'add.group.create',
    actions: [
      {
        id: 'markdown',
        nodeType: 'markdown',
        labelKey: 'node.markdown',
        mode: 'direct',
      },
      {
        id: 'group',
        nodeType: 'group',
        labelKey: 'node.group',
        mode: 'direct',
      },
    ],
  },
  {
    id: 'import',
    labelKey: 'add.group.import',
    actions: [
      {
        id: 'image',
        nodeType: 'media',
        labelKey: 'node.image',
        mode: 'source',
        mediaType: 'image',
      },
      {
        id: 'audio',
        nodeType: 'media',
        labelKey: 'node.audio',
        mode: 'source',
        mediaType: 'audio',
      },
      {
        id: 'video',
        nodeType: 'media',
        labelKey: 'node.video',
        mode: 'source',
        mediaType: 'video',
      },
    ],
  },
  {
    id: 'reference',
    labelKey: 'add.group.reference',
    actions: [
      {
        id: 'file',
        nodeType: 'file',
        labelKey: 'node.file',
        mode: 'source',
      },
      {
        id: 'subcanvas',
        nodeType: 'canvas-embed',
        labelKey: 'node.subcanvas',
        mode: 'source',
      },
    ],
  },
] as const;

const ACTION_BY_ID = new Map(
  CANVAS_ADD_ACTION_GROUPS.flatMap((group) => group.actions).map((action) => [action.id, action]),
);

export function getCanvasAddAction(id: CanvasAddActionId): CanvasAddAction {
  const action = ACTION_BY_ID.get(id);
  if (!action) {
    throw new Error(`Unknown Canvas add action "${id}"`);
  }
  return action;
}
