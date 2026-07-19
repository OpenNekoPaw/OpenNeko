import { describe, expect, it, vi } from 'vitest';
import { createResourceFingerprint, createResourceRef } from '@neko/shared';
import { ThreeReferenceOutputCollector } from './ThreeReferenceOutputCollector';
import type { ThreeReferenceCaptureRequest } from './ModelPreviewProvider';

describe('ThreeReferenceOutputCollector', () => {
  it('delivers a camera-only context immediately when the camera capture action is used', async () => {
    const deliverContext = vi.fn(async () => undefined);
    const collector = new ThreeReferenceOutputCollector({
      materializeCapture: async (request) => resource(`capture-${request.purpose}`),
      deliverContext,
    });
    const staging = sourceStaging();

    await collector.collect(request(staging, 'camera'));

    expect(deliverContext).toHaveBeenCalledWith(
      expect.objectContaining({
        type: '3d-reference',
        id: '3d-reference:session-1:2:camera',
        data: expect.objectContaining({
          staging: { ...staging, selectedPurposes: ['camera'] },
          outputs: [expect.objectContaining({ kind: 'camera' })],
        }),
      }),
    );
  });

  it('delivers independently captured roles without cross-action pending state', async () => {
    const deliverContext = vi.fn(async () => undefined);
    const collector = new ThreeReferenceOutputCollector({
      materializeCapture: async (request) => resource(`capture-${request.purpose}`),
      deliverContext,
    });
    const staging = sourceStaging();
    await collector.collect(request(staging, 'appearance'));
    await collector.collect(request(staging, 'camera'));
    expect(deliverContext).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: '3d-reference:session-1:2:appearance',
        data: expect.objectContaining({
          staging: { ...staging, selectedPurposes: ['appearance'] },
          outputs: [expect.objectContaining({ kind: 'appearance' })],
        }),
      }),
    );
    expect(deliverContext).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: '3d-reference:session-1:2:camera',
        data: expect.objectContaining({
          staging: { ...staging, selectedPurposes: ['camera'] },
          outputs: [expect.objectContaining({ kind: 'camera' })],
        }),
      }),
    );
    expect(deliverContext).toHaveBeenCalledTimes(2);
  });

  it('rejects appearance output from guide-only staging', async () => {
    const collector = new ThreeReferenceOutputCollector({
      materializeCapture: async () => resource('capture'),
      deliverContext: async () => undefined,
    });
    const staging = {
      ...sourceStaging(),
      subject: {
        kind: 'builtin-preset' as const,
        presetId: 'guide-neutral-mannequin',
        presetVersion: 1,
        fingerprint: 'guide-1',
        presetKind: 'mannequin' as const,
        appearancePolicy: 'guide-only' as const,
        allowedPurposes: ['pose', 'camera'] as const,
      },
      selectedPurposes: ['appearance'] as const,
    };
    await expect(collector.collect(request(staging, 'appearance'))).rejects.toThrow(
      /cannot produce appearance/i,
    );
  });
});

function request(
  staging: ThreeReferenceCaptureRequest['staging'],
  purpose: ThreeReferenceCaptureRequest['purpose'],
): ThreeReferenceCaptureRequest {
  return {
    requestId: `capture-${purpose}`,
    identity: { sessionId: staging.sessionId, revision: staging.revision },
    purpose,
    imageDataUrl: 'data:image/png;base64,AA==',
    width: 1024,
    height: 1024,
    staging,
    signal: new AbortController().signal,
  };
}

function sourceStaging() {
  const source = resource('source');
  return {
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    revision: 2,
    subject: {
      kind: 'source-model' as const,
      source,
      fingerprint: 'source',
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

function resource(value: string) {
  return createResourceRef({
    scope: 'project',
    provider: 'test',
    kind: 'preview',
    source: { kind: 'preview-asset', previewAssetId: value },
    locator: { kind: 'preview-asset', assetId: value },
    fingerprint: createResourceFingerprint({ strategy: 'provider', value }),
  });
}
