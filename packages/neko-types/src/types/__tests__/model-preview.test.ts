import { describe, expect, it } from 'vitest';
import { createResourceFingerprint, createResourceRef } from '../resource-cache';
import {
  isModelPreviewContextData,
  MODEL_PREVIEW_CONTEXT_VERSION,
  MODEL_PREVIEW_STAGING_SCHEMA_VERSION,
  type ModelPreviewContextData,
} from '../model-preview';
import type { AgentContextPayload } from '../agent-context';

const source = createResourceRef({
  scope: 'project',
  provider: 'model-preview-source',
  kind: 'media',
  source: { kind: 'file', projectRelativePath: 'models/hero.glb' },
  locator: { kind: 'file', path: 'models/hero.glb' },
  fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'source-fingerprint' }),
});

const previewImage = createResourceRef({
  scope: 'project',
  provider: 'preview-asset',
  kind: 'preview',
  source: { kind: 'preview-asset', previewAssetId: 'capture-1' },
  locator: { kind: 'preview-asset', assetId: 'capture-1' },
  fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'capture-1' }),
});

const contextData: ModelPreviewContextData = {
  contractVersion: MODEL_PREVIEW_CONTEXT_VERSION,
  source,
  sourceFingerprint: 'source-fingerprint',
  format: 'glb',
  facts: {
    bounds: {
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
      center: { x: 0, y: 0, z: 0 },
      size: { x: 2, y: 2, z: 2 },
      radius: 1.73,
    },
    nodeCount: 4,
    meshCount: 2,
    materialCount: 1,
    animationCount: 0,
  },
  staging: {
    schemaVersion: MODEL_PREVIEW_STAGING_SCHEMA_VERSION,
    sessionId: 'session-1',
    sourceFingerprint: 'source-fingerprint',
    revision: 3,
    transformPatches: [],
    cameraPresets: [
      {
        id: 'camera-default',
        label: 'Default',
        position: { x: 3, y: 2, z: 3 },
        target: { x: 0, y: 0, z: 0 },
        fieldOfViewDeg: 45,
      },
    ],
    activeCameraId: 'camera-default',
    lightRig: {
      environmentIntensity: 1,
      lights: [
        { id: 'key', color: '#ffffff', intensity: 3, position: { x: 2, y: 3, z: 4 } },
        { id: 'fill', color: '#ffffff', intensity: 1, position: { x: -2, y: 1, z: 2 } },
        { id: 'rim', color: '#ffffff', intensity: 2, position: { x: 0, y: 3, z: -3 } },
      ],
    },
    background: '#1e1e1e',
    capture: { width: 1024, height: 1024 },
  },
  previewImage,
  capture: {
    sessionId: 'session-1',
    sourceFingerprint: 'source-fingerprint',
    revision: 3,
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
    cameraId: 'camera-default',
  },
};

describe('model preview contracts', () => {
  it('accepts one internally consistent serializable context', () => {
    expect(isModelPreviewContextData(JSON.parse(JSON.stringify(contextData)))).toBe(true);
    const payload: AgentContextPayload = {
      type: 'model-preview',
      id: 'model:hero',
      label: 'hero.glb',
      summary: 'Staged 3D model preview',
      data: contextData,
    };
    expect(payload.type).toBe('model-preview');
  });

  it('rejects stale and incomplete model preview contexts', () => {
    expect(
      isModelPreviewContextData({
        ...contextData,
        capture: { ...contextData.capture, revision: contextData.capture.revision - 1 },
      }),
    ).toBe(false);
    expect(isModelPreviewContextData({ ...contextData, previewImage: undefined })).toBe(false);
  });

  it('does not expose the removed model-scene discriminator', () => {
    const legacyType = 'model-scene';
    // @ts-expect-error model-scene is intentionally absent from the canonical contract.
    const payload: AgentContextPayload = {
      type: legacyType,
      id: 'legacy',
      label: 'Legacy',
      summary: '',
      data: {},
    };
    expect(payload.type).toBe('model-scene');
  });
});
