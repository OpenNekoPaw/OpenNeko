import { describe, expect, it } from 'vitest';
import type { AgentContextPayload } from '../agent-context';
import { createResourceFingerprint, createResourceRef } from '../resource-cache';
import {
  isThreeReferenceDiagnostic,
  isThreeReferenceContextData,
  isThreeReferenceStagingSnapshot,
  isThreeReferencePanoramaRuntimeDescriptor,
  projectThreeReferenceMediaControls,
  THREE_REFERENCE_CONTEXT_VERSION,
  THREE_REFERENCE_STAGING_SCHEMA_VERSION,
  type ThreeReferenceContextData,
} from '../three-reference';

const poseImage = createResourceRef({
  scope: 'project',
  provider: 'preview-asset',
  kind: 'preview',
  source: { kind: 'preview-asset', previewAssetId: 'pose-1' },
  locator: { kind: 'preview-asset', assetId: 'pose-1' },
  fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'pose-1' }),
});

const contextData: ThreeReferenceContextData = {
  contractVersion: THREE_REFERENCE_CONTEXT_VERSION,
  staging: {
    schemaVersion: THREE_REFERENCE_STAGING_SCHEMA_VERSION,
    sessionId: 'session-1',
    revision: 4,
    subject: {
      kind: 'builtin-preset',
      presetId: 'guide-mannequin-female',
      presetVersion: 1,
      fingerprint: 'preset-fingerprint',
      presetKind: 'mannequin',
      appearancePolicy: 'guide-only',
      allowedPurposes: ['pose', 'camera'],
    },
    selectedPurposes: ['pose', 'camera'],
    camera: {
      cameraId: 'camera-front',
      position: { x: 0, y: 1.4, z: 4 },
      target: { x: 0, y: 1, z: 0 },
      fieldOfViewDeg: 45,
      aspectRatio: 1,
    },
    pose: {
      poseId: 'pose-standing',
      joints: [{ jointId: 'hips', rotation: { x: 0, y: 0, z: 0, order: 'XYZ' } }],
    },
  },
  outputs: [
    {
      kind: 'pose',
      sessionId: 'session-1',
      revision: 4,
      controlImage: poseImage,
      controlMode: 'pose',
      joints: [{ jointId: 'hips', rotation: { x: 0, y: 0, z: 0, order: 'XYZ' } }],
    },
    {
      kind: 'camera',
      sessionId: 'session-1',
      revision: 4,
      camera: {
        cameraId: 'camera-front',
        position: { x: 0, y: 1.4, z: 4 },
        target: { x: 0, y: 1, z: 0 },
        fieldOfViewDeg: 45,
        aspectRatio: 1,
      },
    },
  ],
};

describe('3D reference contracts', () => {
  it('accepts only bounded authorized panorama runtime descriptors', () => {
    expect(
      isThreeReferencePanoramaRuntimeDescriptor({
        source: poseImage,
        fingerprint: 'panorama-1',
        uri: 'vscode-webview://authorized/scene.hdr',
        mediaType: 'image/vnd.radiance',
        sizeBytes: 1024,
      }),
    ).toBe(true);
    expect(
      isThreeReferencePanoramaRuntimeDescriptor({
        source: poseImage,
        fingerprint: 'panorama-1',
        uri: 'https://example.com/scene.tiff',
        mediaType: 'image/tiff',
        sizeBytes: 1024,
      }),
    ).toBe(false);
  });
  it('accepts one serializable guide context with exact pose and camera outputs', () => {
    expect(isThreeReferenceContextData(JSON.parse(JSON.stringify(contextData)))).toBe(true);

    const payload: AgentContextPayload = {
      type: '3d-reference',
      id: '3d-reference:session-1:4',
      label: 'Neutral mannequin',
      summary: 'Pose and camera reference',
      data: contextData,
    };

    expect(payload.type).toBe('3d-reference');
  });

  it('rejects output data that does not describe the exact live staging revision', () => {
    expect(
      isThreeReferenceContextData({
        ...contextData,
        outputs: [
          {
            ...contextData.outputs[0],
            joints: [{ jointId: 'hips', rotation: { x: 0.5, y: 0, z: 0, order: 'XYZ' } }],
          },
          contextData.outputs[1],
        ],
      }),
    ).toBe(false);
  });

  it('parses only declared identity-bearing diagnostics', () => {
    expect(
      isThreeReferenceDiagnostic({
        code: 'purpose-role-violation',
        message: 'Guide presets cannot provide appearance reference.',
        severity: 'error',
        identity: { sessionId: 'session-1', revision: 4 },
        purpose: 'appearance',
      }),
    ).toBe(true);
    expect(
      isThreeReferenceDiagnostic({
        code: 'unknown-diagnostic',
        message: 'Unknown',
        severity: 'error',
      }),
    ).toBe(false);
  });

  it('rejects incompatible context and staging versions without legacy shape migration', () => {
    expect(isThreeReferenceContextData({ ...contextData, contractVersion: 2 })).toBe(false);
    expect(isThreeReferenceStagingSnapshot({ ...contextData.staging, schemaVersion: 2 })).toBe(
      false,
    );
    expect(
      isThreeReferenceStagingSnapshot({
        schemaVersion: 3,
        sessionId: 'legacy-session',
        sourceFingerprint: 'legacy-source',
        revision: 9,
        transformPatches: [],
        cameraPresets: [],
        activeCameraId: 'camera-front',
        lightRig: { environmentIntensity: 1, lights: [] },
        background: '#f5f6f8',
        capture: { width: 1024, height: 1024 },
      }),
    ).toBe(false);
  });

  it('projects purpose outputs into role-isolated stable media controls', () => {
    const panorama = createResourceRef({
      scope: 'project',
      provider: 'preview-asset',
      kind: 'preview',
      source: { kind: 'preview-asset', previewAssetId: 'panorama-1' },
      locator: { kind: 'preview-asset', assetId: 'panorama-1' },
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'panorama-1' }),
    });
    const appearance = createResourceRef({
      scope: 'project',
      provider: 'preview-asset',
      kind: 'preview',
      source: { kind: 'preview-asset', previewAssetId: 'appearance-1' },
      locator: { kind: 'preview-asset', assetId: 'appearance-1' },
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'appearance-1' }),
    });
    const source = createResourceRef({
      scope: 'project',
      provider: 'preview-asset',
      kind: 'preview',
      source: { kind: 'preview-asset', previewAssetId: 'source-1' },
      locator: { kind: 'preview-asset', assetId: 'source-1' },
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'source-1' }),
    });

    const controls = projectThreeReferenceMediaControls([
      contextData,
      withOutputs(contextData, [
        {
          kind: 'appearance',
          sessionId: 'session-appearance',
          revision: 1,
          image: appearance,
          source,
        },
      ]),
      withOutputs(contextData, [
        {
          kind: 'panorama-scene',
          sessionId: 'session-panorama',
          revision: 1,
          panorama,
          orientation: { yawDeg: 20, pitchDeg: -5, fieldOfViewDeg: 70 },
        },
      ]),
    ]);

    expect(controls.appearanceReferences).toEqual([
      {
        imageRef: appearance,
        sourceRef: source,
        identity: { sessionId: 'session-appearance', revision: 1 },
      },
    ]);
    expect(controls.controlImage).toEqual({
      imageRef: poseImage,
      mode: 'pose',
      identity: { sessionId: 'session-1', revision: 4 },
    });
    expect(controls.camera?.value.cameraId).toBe('camera-front');
    expect(controls.panorama).toEqual({
      imageRef: panorama,
      orientation: { yawDeg: 20, pitchDeg: -5, fieldOfViewDeg: 70 },
      identity: { sessionId: 'session-panorama', revision: 1 },
    });
  });

  it('rejects ambiguous singleton media roles instead of choosing by order', () => {
    expect(() =>
      projectThreeReferenceMediaControls([
        contextData,
        withOutputs(contextData, [
          {
            ...contextData.outputs[0]!,
            sessionId: 'session-2',
          },
        ]),
      ]),
    ).toThrowError(expect.objectContaining({ code: 'ambiguous-pose-control' }));
  });
});

function withOutputs(
  source: ThreeReferenceContextData,
  outputs: ThreeReferenceContextData['outputs'],
): ThreeReferenceContextData {
  const first = outputs[0];
  if (!first) throw new Error('Test context requires one output.');
  return {
    ...source,
    staging: {
      ...source.staging,
      sessionId: first.sessionId,
      revision: first.revision,
      selectedPurposes: [first.kind],
      ...(first.kind === 'appearance'
        ? {
            subject: {
              kind: 'source-model' as const,
              source: first.source,
              fingerprint: first.source.fingerprint.value,
              format: 'glb' as const,
            },
          }
        : {}),
      ...(first.kind === 'panorama-scene'
        ? { subject: { kind: 'environment-only' as const } }
        : {}),
      ...(first.kind === 'panorama-scene'
        ? {
            environment: {
              source: first.panorama,
              fingerprint: first.panorama.fingerprint.value,
              orientation: first.orientation,
            },
          }
        : {}),
    },
    outputs,
  };
}
