import { describe, expect, it } from 'vitest';
import {
  defineThreeReferencePresetCatalog,
  resolveThreeReferencePreset,
  THREE_REFERENCE_PRESET_CATALOG,
  ThreeReferencePresetCatalogError,
  type ThreeReferencePresetCatalogEntry,
} from './threeReferencePresetCatalog';

const validEntry: ThreeReferencePresetCatalogEntry = {
  presetId: 'guide-neutral-mannequin',
  presetVersion: 1,
  fingerprint: 'sha256:procedural-neutral-mannequin-v1',
  presetKind: 'mannequin',
  appearancePolicy: 'guide-only',
  allowedPurposes: ['pose', 'camera'],
  labelKey: 'preview.threeReference.preset.neutralMannequin',
  defaultScale: 1,
  runtime: { kind: 'procedural', implementationId: 'neutral-mannequin-v1' },
  poseCapabilities: {
    posePresetIds: ['standing'],
    joints: [
      {
        jointId: 'hips',
        rotationConstraint: {
          min: { x: -0.35, y: -0.52, z: -0.35 },
          max: { x: 0.35, y: 0.52, z: 0.35 },
        },
      },
    ],
  },
  renderPasses: ['pose-skeleton', 'depth', 'camera-composition'],
  packagedDependencies: [],
  provenance: {
    origin: 'project-authored',
    author: 'OpenNeko contributors',
    source: 'packages/neko-preview',
  },
  license: {
    spdxId: 'AGPL-3.0-or-later',
    redistribution: 'project-owned',
    notice: 'Project-authored procedural guide geometry.',
  },
};

describe('3D reference preset catalog contract', () => {
  it('ships only the minimum project-authored guide catalog', () => {
    expect(
      THREE_REFERENCE_PRESET_CATALOG.map((entry) => ({
        presetId: entry.presetId,
        presetKind: entry.presetKind,
        allowedPurposes: entry.allowedPurposes,
      })),
    ).toEqual([
      {
        presetId: 'guide-neutral-mannequin',
        presetKind: 'mannequin',
        allowedPurposes: ['pose', 'camera'],
      },
      {
        presetId: 'guide-primitive-blockout-props',
        presetKind: 'prop',
        allowedPurposes: ['camera'],
      },
      {
        presetId: 'guide-studio-room-blockout',
        presetKind: 'environment',
        allowedPurposes: ['camera'],
      },
      {
        presetId: 'guide-neutral-panorama-grid',
        presetKind: 'panorama-grid',
        allowedPurposes: ['panorama-scene'],
      },
    ]);
    for (const entry of THREE_REFERENCE_PRESET_CATALOG) {
      expect(entry.appearancePolicy).toBe('guide-only');
      expect(entry.allowedPurposes).not.toContain('appearance');
      expect(entry.provenance.origin).toBe('project-authored');
      expect(entry.license).toMatchObject({
        spdxId: 'AGPL-3.0-or-later',
        redistribution: 'project-owned',
      });
      expect(entry.license.notice.length).toBeGreaterThan(0);
    }
  });

  it('keeps identity, capabilities, dependencies, provenance, and license immutable', () => {
    const catalog = defineThreeReferencePresetCatalog([validEntry]);

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      presetId: 'guide-neutral-mannequin',
      presetVersion: 1,
      appearancePolicy: 'guide-only',
      allowedPurposes: ['pose', 'camera'],
      renderPasses: ['pose-skeleton', 'depth', 'camera-composition'],
    });
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog[0])).toBe(true);
    expect(Object.isFrozen(catalog[0]?.poseCapabilities?.joints)).toBe(true);
    expect(Object.isFrozen(catalog[0]?.packagedDependencies)).toBe(true);
    expect(Object.isFrozen(catalog[0]?.provenance)).toBe(true);
    expect(Object.isFrozen(catalog[0]?.license)).toBe(true);
  });

  it.each([
    {
      name: 'duplicate preset IDs',
      entries: [validEntry, { ...validEntry, presetVersion: 2 }],
      code: 'duplicate-preset-id',
    },
    {
      name: 'invalid joint constraints',
      entries: [
        {
          ...validEntry,
          poseCapabilities: {
            posePresetIds: ['standing'],
            joints: [
              {
                jointId: 'hips',
                parentJointId: 'missing-parent',
                rotationConstraint: {
                  min: { x: 1, y: 0, z: 0 },
                  max: { x: -1, y: 0, z: 0 },
                },
              },
            ],
          },
        },
      ],
      code: 'invalid-joint-metadata',
    },
    {
      name: 'render passes that do not match purposes',
      entries: [
        {
          ...validEntry,
          allowedPurposes: ['camera'] as const,
          renderPasses: ['pose-skeleton'] as const,
          poseCapabilities: undefined,
        },
      ],
      code: 'invalid-render-pass-metadata',
    },
    {
      name: 'packaged runtime with undeclared entry dependency',
      entries: [
        {
          ...validEntry,
          runtime: { kind: 'packaged' as const, entryDependencyId: 'model' },
          packagedDependencies: [],
        },
      ],
      code: 'undeclared-packaged-dependency',
    },
    {
      name: 'missing provenance or license notice',
      entries: [{ ...validEntry, license: { ...validEntry.license, notice: '' } }],
      code: 'missing-license-notice',
    },
    {
      name: 'guide preset exposing appearance',
      entries: [
        {
          ...validEntry,
          allowedPurposes: ['appearance', 'pose'] as const,
          renderPasses: ['appearance-rgb', 'pose-skeleton'] as const,
        },
      ],
      code: 'guide-appearance-forbidden',
    },
  ])('rejects $name', ({ entries, code }) => {
    expectCatalogError(() => defineThreeReferencePresetCatalog(entries), code);
  });

  it.each([
    {
      name: 'unknown preset ID',
      identity: { ...identityOf(validEntry), presetId: 'unknown' },
      code: 'unknown-preset-id',
    },
    {
      name: 'incompatible preset version',
      identity: { ...identityOf(validEntry), presetVersion: 2 },
      code: 'preset-version-mismatch',
    },
    {
      name: 'fingerprint mismatch',
      identity: { ...identityOf(validEntry), fingerprint: 'sha256:other' },
      code: 'preset-fingerprint-mismatch',
    },
  ])('rejects $name during identity resolution', ({ identity, code }) => {
    const catalog = defineThreeReferencePresetCatalog([validEntry]);
    expectCatalogError(() => resolveThreeReferencePreset(catalog, identity), code);
  });
});

function identityOf(entry: ThreeReferencePresetCatalogEntry) {
  return {
    presetId: entry.presetId,
    presetVersion: entry.presetVersion,
    fingerprint: entry.fingerprint,
    presetKind: entry.presetKind,
    appearancePolicy: entry.appearancePolicy,
    allowedPurposes: entry.allowedPurposes,
  };
}

function expectCatalogError(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ThreeReferencePresetCatalogError);
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected preset catalog error: ${code}`);
}
