import type { ModelPreviewLightEntry } from '@neko/shared';

export type ModelSceneSelection =
  | { readonly kind: 'scene' }
  | { readonly kind: 'camera'; readonly cameraId: string }
  | { readonly kind: 'light'; readonly lightId: ModelPreviewLightEntry['id'] }
  | { readonly kind: 'node'; readonly nodePath: string };

const SCENE_ID = 'model-selection:scene';
const CAMERA_PREFIX = 'model-selection:camera:';
const LIGHT_PREFIX = 'model-selection:light:';
const NODE_PREFIX = 'model-selection:node:';

export function modelSceneSelectionId(selection: ModelSceneSelection): string {
  switch (selection.kind) {
    case 'scene':
      return SCENE_ID;
    case 'camera':
      return `${CAMERA_PREFIX}${selection.cameraId}`;
    case 'light':
      return `${LIGHT_PREFIX}${selection.lightId}`;
    case 'node':
      return `${NODE_PREFIX}${selection.nodePath}`;
  }
}

export function parseModelSceneSelection(id: string): ModelSceneSelection | undefined {
  if (id === SCENE_ID) return { kind: 'scene' };
  if (id.startsWith(CAMERA_PREFIX) && id.length > CAMERA_PREFIX.length) {
    return { kind: 'camera', cameraId: id.slice(CAMERA_PREFIX.length) };
  }
  if (id.startsWith(LIGHT_PREFIX)) {
    const lightId = id.slice(LIGHT_PREFIX.length);
    if (isModelPreviewLightId(lightId)) return { kind: 'light', lightId };
  }
  if (id.startsWith(NODE_PREFIX) && id.length > NODE_PREFIX.length) {
    return { kind: 'node', nodePath: id.slice(NODE_PREFIX.length) };
  }
  return undefined;
}

function isModelPreviewLightId(value: string): value is ModelPreviewLightEntry['id'] {
  return value === 'key' || value === 'fill' || value === 'rim';
}
