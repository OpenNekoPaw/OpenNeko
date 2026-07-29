import type {
  ModelPreviewCameraPreset,
  ModelPreviewCaptureSettings,
  ModelPreviewLightEntry,
  ModelPreviewStagingState,
  ModelPreviewTransform,
} from '@neko/shared';
import type { ModelCameraPlacementPreset, ModelLightPlacementPreset } from './modelCreationPresets';

export const MAX_MODEL_PREVIEW_DIRECTIONAL_LIGHTS = 8;

export function selectModelNode(
  state: ModelPreviewStagingState,
  nodePath: string | undefined,
): ModelPreviewStagingState {
  return nextRevision(state, {
    ...(nodePath ? { selectedNodePath: nodePath } : { selectedNodePath: undefined }),
  });
}

export function patchModelTransform(
  state: ModelPreviewStagingState,
  nodePath: string,
  transform: ModelPreviewTransform,
): ModelPreviewStagingState {
  const existing = state.transformPatches.filter((patch) => patch.nodePath !== nodePath);
  return nextRevision(state, {
    transformPatches: [...existing, { nodePath, transform }],
    selectedNodePath: nodePath,
  });
}

export function selectModelCamera(
  state: ModelPreviewStagingState,
  cameraId: string,
): ModelPreviewStagingState {
  if (!state.cameraPresets.some((camera) => camera.id === cameraId)) {
    throw new Error(`Unknown Model Preview camera: ${cameraId}`);
  }
  return nextRevision(state, { activeCameraId: cameraId });
}

export function updateModelCamera(
  state: ModelPreviewStagingState,
  camera: ModelPreviewCameraPreset,
): ModelPreviewStagingState {
  if (!state.cameraPresets.some((candidate) => candidate.id === camera.id)) {
    throw new Error(`Unknown Model Preview camera: ${camera.id}`);
  }
  if (camera.label.trim().length === 0) {
    throw new Error('Model Preview camera label cannot be empty.');
  }
  return nextRevision(state, {
    cameraPresets: state.cameraPresets.map((candidate) =>
      candidate.id === camera.id ? camera : candidate,
    ),
  });
}

export function duplicateModelCamera(
  state: ModelPreviewStagingState,
  cameraId: string,
  label: string,
): ModelPreviewStagingState {
  const source = state.cameraPresets.find((camera) => camera.id === cameraId);
  if (!source) throw new Error(`Unknown Model Preview camera: ${cameraId}`);
  if (label.trim().length === 0) throw new Error('Model Preview camera label cannot be empty.');
  const id = nextCameraCopyId(state, cameraId);
  return nextRevision(state, {
    cameraPresets: [...state.cameraPresets, { ...source, id, label: label.trim() }],
  });
}

export function addModelCamera(
  state: ModelPreviewStagingState,
  placement: ModelCameraPlacementPreset,
  label: string,
): ModelPreviewStagingState {
  if (label.trim().length === 0) throw new Error('Model Preview camera label cannot be empty.');
  const id = nextPlacementId(
    new Set(state.cameraPresets.map((camera) => camera.id)),
    `camera-${placement.id}`,
  );
  return nextRevision(state, {
    cameraPresets: [...state.cameraPresets, { id, label: label.trim(), ...placement.camera }],
  });
}

export function removeModelCamera(
  state: ModelPreviewStagingState,
  cameraId: string,
): ModelPreviewStagingState {
  if (!state.cameraPresets.some((camera) => camera.id === cameraId)) {
    throw new Error(`Unknown Model Preview camera: ${cameraId}`);
  }
  if (state.cameraPresets.length === 1) {
    throw new Error('Model Preview must retain at least one camera.');
  }
  const cameraPresets = state.cameraPresets.filter((camera) => camera.id !== cameraId);
  const firstRemainingCamera = cameraPresets[0];
  if (!firstRemainingCamera) {
    throw new Error('Model Preview camera removal produced no remaining camera.');
  }
  return nextRevision(state, {
    cameraPresets,
    activeCameraId:
      state.activeCameraId === cameraId ? firstRemainingCamera.id : state.activeCameraId,
  });
}

export function updateModelLight(
  state: ModelPreviewStagingState,
  light: ModelPreviewLightEntry,
): ModelPreviewStagingState {
  if (!state.lightRig.lights.some((candidate) => candidate.id === light.id)) {
    throw new Error(`Unknown Model Preview light: ${light.id}`);
  }
  return nextRevision(state, {
    lightRig: {
      ...state.lightRig,
      lights: state.lightRig.lights.map((candidate) =>
        candidate.id === light.id ? light : candidate,
      ),
    },
  });
}

export function addModelLight(
  state: ModelPreviewStagingState,
  placement: ModelLightPlacementPreset,
): ModelPreviewStagingState {
  if (state.lightRig.lights.length >= MAX_MODEL_PREVIEW_DIRECTIONAL_LIGHTS) {
    throw new Error(
      `Model Preview supports at most ${MAX_MODEL_PREVIEW_DIRECTIONAL_LIGHTS} directional lights.`,
    );
  }
  const id = nextPlacementId(
    new Set(state.lightRig.lights.map((light) => light.id)),
    `light-${placement.id}`,
  );
  const light: ModelPreviewLightEntry = { id, ...placement.light };
  return nextRevision(state, {
    lightRig: { ...state.lightRig, lights: [...state.lightRig.lights, light] },
  });
}

export function updateModelEnvironmentIntensity(
  state: ModelPreviewStagingState,
  environmentIntensity: number,
): ModelPreviewStagingState {
  return nextRevision(state, {
    lightRig: { ...state.lightRig, environmentIntensity },
  });
}

export function updateModelBackground(
  state: ModelPreviewStagingState,
  background: string,
): ModelPreviewStagingState {
  return nextRevision(state, { background });
}

export function updateModelCapture(
  state: ModelPreviewStagingState,
  capture: ModelPreviewCaptureSettings,
): ModelPreviewStagingState {
  return nextRevision(state, { capture });
}

function nextRevision(
  state: ModelPreviewStagingState,
  patch: Partial<ModelPreviewStagingState>,
): ModelPreviewStagingState {
  return { ...state, ...patch, revision: state.revision + 1 };
}

function nextCameraCopyId(state: ModelPreviewStagingState, cameraId: string): string {
  const existingIds = new Set(state.cameraPresets.map((camera) => camera.id));
  const baseId = `${cameraId}-copy`;
  if (!existingIds.has(baseId)) return baseId;
  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) suffix += 1;
  return `${baseId}-${suffix}`;
}

function nextPlacementId(existingIds: ReadonlySet<string>, baseId: string): string {
  if (!existingIds.has(baseId)) return baseId;
  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) suffix += 1;
  return `${baseId}-${suffix}`;
}
