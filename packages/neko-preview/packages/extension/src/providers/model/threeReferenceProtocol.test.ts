import { describe, expect, it } from 'vitest';
import {
  THREE_REFERENCE_PROTOCOL_VERSION,
  THREE_REFERENCE_STAGING_SCHEMA_VERSION,
  createResourceFingerprint,
  createResourceRef,
} from '@neko/shared';
import { parseThreeReferenceWebviewMessage } from './threeReferenceProtocol';

describe('3D Reference panel protocol', () => {
  it('accepts identity-bearing ready, staging, and purpose capture messages', () => {
    expect(
      parseThreeReferenceWebviewMessage({
        type: '3d-reference/ready',
        protocolVersion: THREE_REFERENCE_PROTOCOL_VERSION,
        sessionId: 'session-a',
      }),
    ).toEqual({
      type: '3d-reference/ready',
      protocolVersion: THREE_REFERENCE_PROTOCOL_VERSION,
      sessionId: 'session-a',
    });

    const staging = sourceModelStaging();
    expect(
      parseThreeReferenceWebviewMessage({ type: '3d-reference/staging-changed', staging }),
    ).toEqual({ type: '3d-reference/staging-changed', staging });
    expect(
      parseThreeReferenceWebviewMessage({
        type: '3d-reference/capture-requested',
        requestId: 'capture-a',
        identity: { sessionId: 'session-a', revision: 0 },
        purpose: 'camera',
        imageDataUrl: 'data:image/png;base64,AA==',
        width: 1024,
        height: 1024,
      }),
    ).toEqual({
      type: '3d-reference/capture-requested',
      requestId: 'capture-a',
      identity: { sessionId: 'session-a', revision: 0 },
      purpose: 'camera',
      imageDataUrl: 'data:image/png;base64,AA==',
      width: 1024,
      height: 1024,
    });
  });

  it('accepts explicit built-in and environment-only staging subjects', () => {
    const builtin = {
      ...sourceModelStaging(),
      subject: {
        kind: 'builtin-preset',
        presetId: 'guide-neutral-mannequin',
        presetVersion: 1,
        fingerprint: 'preset-fingerprint',
        presetKind: 'mannequin',
        appearancePolicy: 'guide-only',
        allowedPurposes: ['pose', 'camera'],
      },
      selectedPurposes: ['pose'],
      pose: { poseId: 'standing', joints: [] },
    } as const;
    expect(
      parseThreeReferenceWebviewMessage({ type: '3d-reference/staging-changed', staging: builtin }),
    ).toBeDefined();

    const environment = {
      ...sourceModelStaging(),
      subject: { kind: 'environment-only' },
      selectedPurposes: ['panorama-scene'],
      environment: {
        source: resource('panorama'),
        fingerprint: 'panorama-fingerprint',
        orientation: { yawDeg: 0, pitchDeg: 0, fieldOfViewDeg: 75 },
      },
    } as const;
    expect(
      parseThreeReferenceWebviewMessage({
        type: '3d-reference/staging-changed',
        staging: environment,
      }),
    ).toBeDefined();
  });

  it('rejects legacy, stale-shape, and purpose-ambiguous messages', () => {
    expect(
      parseThreeReferenceWebviewMessage({
        type: 'model-preview/ready',
        protocolVersion: 1,
        sessionId: 'session-a',
      }),
    ).toBeUndefined();
    expect(
      parseThreeReferenceWebviewMessage({
        type: '3d-reference/staging-changed',
        staging: { ...sourceModelStaging(), schemaVersion: 2 },
      }),
    ).toBeUndefined();
    expect(
      parseThreeReferenceWebviewMessage({
        type: '3d-reference/capture-requested',
        requestId: 'capture-a',
        identity: { sessionId: 'session-a', revision: 0 },
      }),
    ).toBeUndefined();
  });
});

function sourceModelStaging() {
  return {
    schemaVersion: THREE_REFERENCE_STAGING_SCHEMA_VERSION,
    sessionId: 'session-a',
    revision: 0,
    subject: {
      kind: 'source-model' as const,
      source: resource('model'),
      fingerprint: 'model-fingerprint',
      format: 'glb' as const,
    },
    selectedPurposes: ['appearance', 'camera'] as const,
    camera: {
      cameraId: 'camera-front',
      position: { x: 0, y: 0.15, z: 3.5 },
      target: { x: 0, y: 0, z: 0 },
      fieldOfViewDeg: 45,
      aspectRatio: 1,
    },
  };
}

function resource(id: string) {
  return createResourceRef({
    id,
    scope: 'project',
    provider: 'test',
    kind: 'media',
    source: { kind: 'file', projectRelativePath: `${id}.glb` },
    fingerprint: createResourceFingerprint({ strategy: 'hash', value: id }),
  });
}
