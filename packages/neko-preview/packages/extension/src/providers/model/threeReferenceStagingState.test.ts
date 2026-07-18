import { describe, expect, it } from 'vitest';
import { createResourceFingerprint, createResourceRef } from '@neko/shared';
import {
  createBuiltinPresetStaging,
  createEnvironmentOnlyStaging,
  createSourceModelStaging,
  restoreThreeReferenceStaging,
  threeReferenceStagingStateKey,
} from './threeReferenceStagingState';
import { THREE_REFERENCE_PRESET_CATALOG } from './threeReferencePresetCatalog';

describe('3D Reference staging state', () => {
  it('creates explicit source, preset, and environment-only subjects', () => {
    const source = createSourceModelStaging('source-session', {
      kind: 'source-model',
      source: resource('model'),
      fingerprint: 'model-fingerprint',
      format: 'glb',
    });
    expect(source).toMatchObject({
      sessionId: 'source-session',
      revision: 0,
      subject: { kind: 'source-model' },
      selectedPurposes: ['appearance', 'camera'],
      camera: { cameraId: 'camera-front' },
    });

    const preset = createBuiltinPresetStaging('preset-session', THREE_REFERENCE_PRESET_CATALOG[0]!);
    expect(preset).toMatchObject({
      subject: { kind: 'builtin-preset', appearancePolicy: 'guide-only' },
      selectedPurposes: ['pose', 'camera'],
      pose: { poseId: 'standing' },
    });

    expect(createEnvironmentOnlyStaging('environment-session')).toMatchObject({
      subject: { kind: 'environment-only' },
      selectedPurposes: ['camera'],
    });
  });

  it('restores only the same subject identity with a fresh session revision', () => {
    const staging = createSourceModelStaging('old-session', {
      kind: 'source-model',
      source: resource('model'),
      fingerprint: 'model-fingerprint',
      format: 'glb',
    });
    expect(restoreThreeReferenceStaging(staging, 'new-session', staging.subject)).toMatchObject({
      sessionId: 'new-session',
      revision: 0,
    });
    expect(
      restoreThreeReferenceStaging(staging, 'new-session', {
        ...staging.subject,
        fingerprint: 'different',
      }),
    ).toBeUndefined();
    expect(threeReferenceStagingStateKey(staging.subject)).not.toContain('model-preview');
  });
});

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
