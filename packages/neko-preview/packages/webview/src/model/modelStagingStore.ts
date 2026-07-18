import type {
  ModelPreviewCameraPreset,
  ModelPreviewCaptureSettings,
  ModelPreviewLightEntry,
  ModelPreviewStagingState,
  ModelPreviewTransform,
} from '@neko/shared';

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
  return nextRevision(state, {
    cameraPresets: state.cameraPresets.map((candidate) =>
      candidate.id === camera.id ? camera : candidate,
    ),
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
