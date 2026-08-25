import { describe, expect, it } from 'vitest';
import {
  isThreeReferenceDiagnostic,
  isThreeReferenceContextData,
  isThreeReferenceStagingSnapshot,
  isThreeReferencePanoramaRuntimeDescriptor,
  projectThreeReferenceMediaControls,
  type ThreeReferenceContextData,
} from './three-reference';

const poseImage = packageResource('pose-1');

const contextData: ThreeReferenceContextData = {
  staging: {
    sessionId: 'session-1',
    subject: {
      kind: 'builtin-preset',
      presetId: 'guide-mannequin-female',
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
      requestId: 'request-pose',
      controlImage: poseImage,
      controlMode: 'pose',
      joints: [{ jointId: 'hips', rotation: { x: 0, y: 0, z: 0, order: 'XYZ' } }],
    },
    {
      kind: 'camera',
      sessionId: 'session-1',
      requestId: 'request-camera',
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
        uri: 'neko-media://authorized/scene.hdr',
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

    const payload = {
      type: '3d-reference',
      id: '3d-reference:session-1',
      label: 'Neutral mannequin',
      summary: 'Pose and camera reference',
      data: contextData,
    };

    expect(payload.type).toBe('3d-reference');
  });

  it('rejects output data that does not describe the exact staging content', () => {
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
        identity: { sessionId: 'session-1', requestId: 'request-pose' },
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

  it('rejects unknown fields without conversion', () => {
    expect(isThreeReferenceContextData({ ...contextData, obsoleteField: 2 })).toBe(false);
    expect(isThreeReferenceStagingSnapshot({ ...contextData.staging, obsoleteField: 2 })).toBe(
      false,
    );
    expect(
      isThreeReferenceStagingSnapshot({
        obsoleteField: 3,
        sessionId: 'obsolete-session',
        sourceFingerprint: 'obsolete-source',
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
    const panorama = packageResource('panorama-1');
    const appearance = packageResource('appearance-1');
    const source = packageResource('source-1');

    const controls = projectThreeReferenceMediaControls([
      contextData,
      withOutputs(contextData, [
        {
          kind: 'appearance',
          sessionId: 'session-appearance',
          requestId: 'request-appearance',
          image: appearance,
          source,
        },
      ]),
      withOutputs(contextData, [
        {
          kind: 'panorama-scene',
          sessionId: 'session-panorama',
          requestId: 'request-panorama',
          panorama,
          orientation: { yawDeg: 20, pitchDeg: -5, fieldOfViewDeg: 70 },
        },
      ]),
    ]);

    expect(controls.appearanceReferences).toEqual([
      {
        imageRef: appearance,
        sourceRef: source,
        identity: { sessionId: 'session-appearance', requestId: 'request-appearance' },
      },
    ]);
    expect(controls.controlImage).toEqual({
      imageRef: poseImage,
      mode: 'pose',
      identity: { sessionId: 'session-1', requestId: 'request-pose' },
    });
    expect(controls.camera?.value.cameraId).toBe('camera-front');
    expect(controls.panorama).toEqual({
      imageRef: panorama,
      orientation: { yawDeg: 20, pitchDeg: -5, fieldOfViewDeg: 70 },
      identity: { sessionId: 'session-panorama', requestId: 'request-panorama' },
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

function packageResource(id: string) {
  return {
    file: {
      authority: 'package' as const,
      packageId: 'neko-three-reference',
      revision: '1',
      path: `references/${id}.png`,
    },
  };
}

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
      selectedPurposes: [first.kind],
      ...(first.kind === 'appearance'
        ? {
            subject: {
              kind: 'source-model' as const,
              source: first.source,
              fingerprint: JSON.stringify(first.source),
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
              fingerprint: JSON.stringify(first.panorama),
              orientation: first.orientation,
            },
          }
        : {}),
    },
    outputs,
  };
}
