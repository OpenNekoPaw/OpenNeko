import { describe, expect, it } from 'vitest';
import { MODEL_PREVIEW_STAGING_SCHEMA_VERSION, type ModelPreviewStagingState } from '@neko/shared';
import {
  patchModelTransform,
  selectModelCamera,
  selectModelNode,
  updateModelEnvironmentIntensity,
  updateModelLight,
} from './modelStagingStore';

describe('model staging store', () => {
  it('serializes temporary camera, light, selection, and transform state', () => {
    let state = initialState();
    state = selectModelNode(state, 'root/0:mesh');
    state = selectModelCamera(state, 'front');
    state = updateModelEnvironmentIntensity(state, 1.5);
    state = updateModelLight(state, { ...state.lightRig.lights[0]!, intensity: 4 });
    state = patchModelTransform(state, 'root/0:mesh', {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 1, z: 0, order: 'XYZ' },
      scale: { x: 1, y: 1, z: 1 },
    });

    expect(state.revision).toBe(5);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(state.selectedNodePath).toBe('root/0:mesh');
    expect(state.activeCameraId).toBe('front');
    expect(state.transformPatches).toHaveLength(1);
  });

  it('fails visibly for unknown camera and light identities', () => {
    const state = initialState();
    expect(() => selectModelCamera(state, 'missing')).toThrow(/Unknown/);
    expect(() =>
      updateModelLight(state, {
        id: 'rim',
        color: '#fff',
        intensity: 1,
        position: { x: 0, y: 0, z: 1 },
      }),
    ).toThrow(/Unknown/);
  });
});

function initialState(): ModelPreviewStagingState {
  return {
    schemaVersion: MODEL_PREVIEW_STAGING_SCHEMA_VERSION,
    sessionId: 'session-1',
    sourceFingerprint: 'fingerprint-1',
    revision: 0,
    transformPatches: [],
    cameraPresets: [
      {
        id: 'default',
        label: 'Default',
        position: { x: 3, y: 2, z: 3 },
        target: { x: 0, y: 0, z: 0 },
        fieldOfViewDeg: 45,
      },
      {
        id: 'front',
        label: 'Front',
        position: { x: 0, y: 1, z: 4 },
        target: { x: 0, y: 0, z: 0 },
        fieldOfViewDeg: 45,
      },
    ],
    activeCameraId: 'default',
    lightRig: {
      environmentIntensity: 1,
      lights: [
        { id: 'key', color: '#fff', intensity: 3, position: { x: 1, y: 2, z: 3 } },
        { id: 'fill', color: '#fff', intensity: 1, position: { x: -1, y: 1, z: 2 } },
      ],
    },
    background: '#1e1e1e',
    capture: { width: 1024, height: 1024 },
  };
}
