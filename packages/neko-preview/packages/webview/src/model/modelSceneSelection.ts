export type ModelSceneSelection =
  | { readonly kind: 'scene' }
  | { readonly kind: 'camera'; readonly cameraId: string }
  | { readonly kind: 'node'; readonly nodePath: string };

const SCENE_ID = 'model-selection:scene';
const CAMERA_PREFIX = 'model-selection:camera:';
const NODE_PREFIX = 'model-selection:node:';

export function modelSceneSelectionId(selection: ModelSceneSelection): string {
  switch (selection.kind) {
    case 'scene':
      return SCENE_ID;
    case 'camera':
      return `${CAMERA_PREFIX}${selection.cameraId}`;
    case 'node':
      return `${NODE_PREFIX}${selection.nodePath}`;
  }
}

export function parseModelSceneSelection(id: string): ModelSceneSelection | undefined {
  if (id === SCENE_ID) return { kind: 'scene' };
  if (id.startsWith(CAMERA_PREFIX) && id.length > CAMERA_PREFIX.length) {
    return { kind: 'camera', cameraId: id.slice(CAMERA_PREFIX.length) };
  }
  if (id.startsWith(NODE_PREFIX) && id.length > NODE_PREFIX.length) {
    return { kind: 'node', nodePath: id.slice(NODE_PREFIX.length) };
  }
  return undefined;
}
