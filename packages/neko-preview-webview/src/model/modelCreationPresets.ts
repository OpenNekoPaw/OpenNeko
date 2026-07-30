import type { ModelPreviewCameraPreset, ModelPreviewLightEntry } from '@neko/shared';

export interface ModelCameraPlacementPreset {
  readonly id: string;
  readonly labelKey: string;
  readonly camera: Omit<ModelPreviewCameraPreset, 'id' | 'label'>;
}

export interface ModelLightPlacementPreset {
  readonly id: string;
  readonly labelKey: string;
  readonly light: Omit<ModelPreviewLightEntry, 'id'>;
}

export const MODEL_CAMERA_PLACEMENTS = [
  cameraPlacement('front', 'preview.model.cameraPlacement.front', 0, 0.15, 3.5),
  cameraPlacement('front-left', 'preview.model.cameraPlacement.frontLeft', -2.5, 1.3, 2.5),
  cameraPlacement('front-right', 'preview.model.cameraPlacement.frontRight', 2.5, 1.3, 2.5),
  cameraPlacement('left', 'preview.model.cameraPlacement.left', -3.5, 0.15, 0),
  cameraPlacement('right', 'preview.model.cameraPlacement.right', 3.5, 0.15, 0),
  cameraPlacement('rear', 'preview.model.cameraPlacement.rear', 0, 0.15, -3.5),
] as const satisfies readonly ModelCameraPlacementPreset[];

export const MODEL_LIGHT_PLACEMENTS = [
  lightPlacement('front-left', 'preview.model.lightPlacement.frontLeft', -3, 3, 4),
  lightPlacement('front-right', 'preview.model.lightPlacement.frontRight', 3, 3, 4),
  lightPlacement('left', 'preview.model.lightPlacement.left', -4, 2, 0),
  lightPlacement('right', 'preview.model.lightPlacement.right', 4, 2, 0),
  lightPlacement('rear-left', 'preview.model.lightPlacement.rearLeft', -3, 3, -4),
  lightPlacement('rear-right', 'preview.model.lightPlacement.rearRight', 3, 3, -4),
  lightPlacement('overhead', 'preview.model.lightPlacement.overhead', 0, 4, 0.5),
] as const satisfies readonly ModelLightPlacementPreset[];

export type ModelCameraPlacementId = (typeof MODEL_CAMERA_PLACEMENTS)[number]['id'];
export type ModelLightPlacementId = (typeof MODEL_LIGHT_PLACEMENTS)[number]['id'];

export function resolveModelCameraPlacement(id: string): ModelCameraPlacementPreset {
  const placement = MODEL_CAMERA_PLACEMENTS.find((candidate) => candidate.id === id);
  if (!placement) throw new Error(`Unknown Model Preview camera placement: ${id}`);
  return placement;
}

export function resolveModelLightPlacement(id: string): ModelLightPlacementPreset {
  const placement = MODEL_LIGHT_PLACEMENTS.find((candidate) => candidate.id === id);
  if (!placement) throw new Error(`Unknown Model Preview light placement: ${id}`);
  return placement;
}

function cameraPlacement(
  id: string,
  labelKey: string,
  x: number,
  y: number,
  z: number,
): ModelCameraPlacementPreset {
  return {
    id,
    labelKey,
    camera: {
      position: { x, y, z },
      target: { x: 0, y: 0, z: 0 },
      fieldOfViewDeg: 45,
    },
  };
}

function lightPlacement(
  id: string,
  labelKey: string,
  x: number,
  y: number,
  z: number,
): ModelLightPlacementPreset {
  return {
    id,
    labelKey,
    light: {
      color: '#ffffff',
      intensity: 1.5,
      position: { x, y, z },
    },
  };
}
