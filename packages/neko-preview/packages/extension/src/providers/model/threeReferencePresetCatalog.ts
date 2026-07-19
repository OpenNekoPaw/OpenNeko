import type {
  ThreeReferenceAppearancePolicy,
  ThreeReferencePresetKind,
  ThreeReferencePresetIdentity,
  ThreeReferencePurpose,
  ThreeReferenceRuntimePosePreset,
  ThreeReferenceVector3,
} from '@neko/shared';
import {
  THREE_REFERENCE_MANNEQUIN_JOINTS,
  THREE_REFERENCE_MANNEQUIN_POSES,
} from './threeReferenceMannequinPoses';

export type ThreeReferencePresetCatalogErrorCode =
  | 'duplicate-preset-id'
  | 'invalid-preset-identity'
  | 'invalid-joint-metadata'
  | 'invalid-render-pass-metadata'
  | 'undeclared-packaged-dependency'
  | 'invalid-packaged-dependency'
  | 'missing-license-notice'
  | 'missing-provenance'
  | 'guide-appearance-forbidden'
  | 'unknown-preset-id'
  | 'preset-version-mismatch'
  | 'preset-fingerprint-mismatch'
  | 'preset-metadata-mismatch';

export class ThreeReferencePresetCatalogError extends Error {
  constructor(
    readonly code: ThreeReferencePresetCatalogErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ThreeReferencePresetCatalogError';
  }
}

export type ThreeReferencePresetRenderPass =
  | 'appearance-rgb'
  | 'pose-skeleton'
  | 'depth'
  | 'camera-composition'
  | 'panorama-source'
  | 'panorama-viewport';

export interface ThreeReferencePresetJointConstraint {
  readonly jointId: string;
  readonly parentJointId?: string;
  readonly rotationConstraint: {
    readonly min: ThreeReferenceVector3;
    readonly max: ThreeReferenceVector3;
  };
}

export interface ThreeReferencePresetPoseCapabilities {
  readonly posePresets: readonly ThreeReferenceRuntimePosePreset[];
  readonly joints: readonly ThreeReferencePresetJointConstraint[];
}

export interface ThreeReferencePresetEnvironmentCapabilities {
  readonly projection: 'equirectangular';
  readonly supportsYaw: boolean;
  readonly supportsPitch: boolean;
}

export type ThreeReferencePresetRuntime =
  | {
      readonly kind: 'procedural';
      readonly implementationId: string;
    }
  | {
      readonly kind: 'packaged';
      readonly entryDependencyId: string;
    };

export interface ThreeReferencePresetPackagedDependency {
  readonly dependencyId: string;
  readonly packageRelativePath: string;
  readonly mediaType:
    'model/gltf-binary' | 'image/png' | 'image/jpeg' | 'image/webp' | 'image/vnd.radiance';
  readonly sha256: string;
}

export interface ThreeReferencePresetProvenance {
  readonly origin: 'project-authored' | 'third-party';
  readonly author: string;
  readonly source: string;
  readonly sourceUrl?: string;
  readonly copyright?: string;
}

export interface ThreeReferencePresetLicense {
  readonly spdxId: string;
  readonly redistribution: 'project-owned' | 'approved';
  readonly notice: string;
  readonly licenseTextPath?: string;
}

export interface ThreeReferencePresetCatalogEntry {
  readonly presetId: string;
  readonly presetVersion: number;
  readonly fingerprint: string;
  readonly presetKind: ThreeReferencePresetKind;
  readonly appearancePolicy: ThreeReferenceAppearancePolicy;
  readonly allowedPurposes: readonly ThreeReferencePurpose[];
  readonly labelKey: string;
  readonly defaultScale: number;
  readonly runtime: ThreeReferencePresetRuntime;
  readonly poseCapabilities?: ThreeReferencePresetPoseCapabilities;
  readonly environmentCapabilities?: ThreeReferencePresetEnvironmentCapabilities;
  readonly renderPasses: readonly ThreeReferencePresetRenderPass[];
  readonly packagedDependencies: readonly ThreeReferencePresetPackagedDependency[];
  readonly provenance: ThreeReferencePresetProvenance;
  readonly license: ThreeReferencePresetLicense;
}

export function defineThreeReferencePresetCatalog(
  entries: readonly ThreeReferencePresetCatalogEntry[],
): readonly ThreeReferencePresetCatalogEntry[] {
  validateCatalog(entries);
  return Object.freeze(entries.map(freezeCatalogEntry));
}

export function resolveThreeReferencePreset(
  catalog: readonly ThreeReferencePresetCatalogEntry[],
  identity: ThreeReferencePresetIdentity,
): ThreeReferencePresetCatalogEntry {
  const entry = catalog.find((candidate) => candidate.presetId === identity.presetId);
  if (!entry) {
    throw new ThreeReferencePresetCatalogError(
      'unknown-preset-id',
      `Unknown 3D reference preset: ${identity.presetId}`,
    );
  }
  if (entry.presetVersion !== identity.presetVersion) {
    throw new ThreeReferencePresetCatalogError(
      'preset-version-mismatch',
      `3D reference preset version mismatch for ${identity.presetId}.`,
    );
  }
  if (entry.fingerprint !== identity.fingerprint) {
    throw new ThreeReferencePresetCatalogError(
      'preset-fingerprint-mismatch',
      `3D reference preset fingerprint mismatch for ${identity.presetId}.`,
    );
  }
  if (
    entry.presetKind !== identity.presetKind ||
    entry.appearancePolicy !== identity.appearancePolicy ||
    !sameStringSet(entry.allowedPurposes, identity.allowedPurposes)
  ) {
    throw new ThreeReferencePresetCatalogError(
      'preset-metadata-mismatch',
      `3D reference preset metadata mismatch for ${identity.presetId}.`,
    );
  }
  return entry;
}

export const THREE_REFERENCE_PRESET_CATALOG = defineThreeReferencePresetCatalog([
  mannequinPreset({
    presetId: 'guide-mannequin-female',
    implementationId: 'neutral-mannequin-female-v2',
    fingerprint: 'sha256:8fee3056caeed0cb8e4ad4b404ff8fef2b0dacea000238659b2d984ef0a65afc',
    labelKey: 'preview.threeReference.preset.femaleMannequin',
  }),
  mannequinPreset({
    presetId: 'guide-mannequin-male',
    implementationId: 'neutral-mannequin-male-v2',
    fingerprint: 'sha256:29cacde2f7ec95306259baf2d535a0f3c1aa8124482d01d520572184eb11943f',
    labelKey: 'preview.threeReference.preset.maleMannequin',
  }),
  mannequinPreset({
    presetId: 'guide-mannequin-child',
    implementationId: 'neutral-mannequin-child-v2',
    fingerprint: 'sha256:2fa5962892c51638c0799e1bb30ee7344ca23422034d44db7869efd864368490',
    labelKey: 'preview.threeReference.preset.childMannequin',
  }),
  {
    presetId: 'guide-primitive-blockout-props',
    presetVersion: 1,
    fingerprint: 'sha256:09fe929b333c29941a53017592e406293825132ee3d3efc5e90912b54101c3fd',
    presetKind: 'prop',
    appearancePolicy: 'guide-only',
    allowedPurposes: ['camera'],
    labelKey: 'preview.threeReference.preset.primitiveBlockoutProps',
    defaultScale: 1,
    runtime: { kind: 'procedural', implementationId: 'primitive-blockout-props-v1' },
    renderPasses: ['camera-composition'],
    packagedDependencies: [],
    ...projectAuthoredMetadata('primitive and blockout prop geometry'),
  },
  {
    presetId: 'guide-studio-room-blockout',
    presetVersion: 1,
    fingerprint: 'sha256:9f00b430295619abf6cc09af9f8d5310c02c0db3f2616dbe6a5eb1a9ed37947c',
    presetKind: 'environment',
    appearancePolicy: 'guide-only',
    allowedPurposes: ['camera'],
    labelKey: 'preview.threeReference.preset.studioRoomBlockout',
    defaultScale: 1,
    runtime: { kind: 'procedural', implementationId: 'studio-room-blockout-v1' },
    renderPasses: ['camera-composition'],
    packagedDependencies: [],
    ...projectAuthoredMetadata('studio room blockout geometry'),
  },
  {
    presetId: 'guide-neutral-panorama-grid',
    presetVersion: 1,
    fingerprint: 'sha256:3cee1ed3d2c3e55d91452833bb07b511012cf61e9225e455eda8068dfd2ded2e',
    presetKind: 'panorama-grid',
    appearancePolicy: 'guide-only',
    allowedPurposes: ['panorama-scene'],
    labelKey: 'preview.threeReference.preset.neutralPanoramaGrid',
    defaultScale: 1,
    runtime: { kind: 'procedural', implementationId: 'neutral-panorama-grid-v1' },
    environmentCapabilities: {
      projection: 'equirectangular',
      supportsYaw: true,
      supportsPitch: true,
    },
    renderPasses: ['panorama-source', 'panorama-viewport'],
    packagedDependencies: [],
    ...projectAuthoredMetadata('neutral equirectangular orientation grid'),
  },
]);

function validateCatalog(entries: readonly ThreeReferencePresetCatalogEntry[]): void {
  const presetIds = new Set<string>();
  for (const entry of entries) {
    if (presetIds.has(entry.presetId)) {
      throw new ThreeReferencePresetCatalogError(
        'duplicate-preset-id',
        `Duplicate 3D reference preset ID: ${entry.presetId}`,
      );
    }
    presetIds.add(entry.presetId);
    validateCatalogEntry(entry);
  }
}

function validateCatalogEntry(entry: ThreeReferencePresetCatalogEntry): void {
  if (
    !isNonEmptyString(entry.presetId) ||
    !Number.isInteger(entry.presetVersion) ||
    entry.presetVersion <= 0 ||
    !isNonEmptyString(entry.fingerprint) ||
    !isNonEmptyString(entry.labelKey) ||
    !Number.isFinite(entry.defaultScale) ||
    entry.defaultScale <= 0 ||
    entry.allowedPurposes.length === 0 ||
    new Set(entry.allowedPurposes).size !== entry.allowedPurposes.length
  ) {
    throw new ThreeReferencePresetCatalogError(
      'invalid-preset-identity',
      `Invalid 3D reference preset identity: ${entry.presetId || '<empty>'}`,
    );
  }
  if (
    entry.appearancePolicy === 'guide-only' &&
    (entry.allowedPurposes.includes('appearance') || entry.renderPasses.includes('appearance-rgb'))
  ) {
    throw new ThreeReferencePresetCatalogError(
      'guide-appearance-forbidden',
      `Guide-only preset cannot expose appearance: ${entry.presetId}`,
    );
  }
  validatePoseCapabilities(entry);
  validateRenderPasses(entry);
  validatePackagedDependencies(entry);
  validateProvenance(entry);
}

function validatePoseCapabilities(entry: ThreeReferencePresetCatalogEntry): void {
  const pose = entry.poseCapabilities;
  if (!pose) {
    if (entry.allowedPurposes.includes('pose')) {
      throw new ThreeReferencePresetCatalogError(
        'invalid-joint-metadata',
        `Pose purpose requires declared joints: ${entry.presetId}`,
      );
    }
    return;
  }
  if (!entry.allowedPurposes.includes('pose') || pose.joints.length === 0) {
    throw new ThreeReferencePresetCatalogError(
      'invalid-joint-metadata',
      `Unexpected or empty pose metadata: ${entry.presetId}`,
    );
  }
  const jointIds = new Set(pose.joints.map((joint) => joint.jointId));
  if (jointIds.size !== pose.joints.length || jointIds.has('')) {
    throw new ThreeReferencePresetCatalogError(
      'invalid-joint-metadata',
      `Joint IDs must be unique and non-empty: ${entry.presetId}`,
    );
  }
  for (const joint of pose.joints) {
    if (
      (joint.parentJointId !== undefined &&
        (joint.parentJointId === joint.jointId || !jointIds.has(joint.parentJointId))) ||
      !validConstraint(joint.rotationConstraint.min, joint.rotationConstraint.max)
    ) {
      throw new ThreeReferencePresetCatalogError(
        'invalid-joint-metadata',
        `Invalid joint constraint for ${joint.jointId} in ${entry.presetId}.`,
      );
    }
  }
  const poseIds = new Set(pose.posePresets.map((preset) => preset.poseId));
  if (
    pose.posePresets.length === 0 ||
    poseIds.size !== pose.posePresets.length ||
    poseIds.has('')
  ) {
    throw new ThreeReferencePresetCatalogError(
      'invalid-joint-metadata',
      `Pose preset IDs must be unique and non-empty: ${entry.presetId}`,
    );
  }
  for (const preset of pose.posePresets) {
    const presetJointIds = new Set(preset.joints.map((joint) => joint.jointId));
    if (
      !isNonEmptyString(preset.labelKey) ||
      preset.joints.length !== pose.joints.length ||
      presetJointIds.size !== pose.joints.length ||
      [...jointIds].some((jointId) => !presetJointIds.has(jointId)) ||
      preset.joints.some((jointPose) => {
        const constraint = pose.joints.find((joint) => joint.jointId === jointPose.jointId);
        return !constraint || !rotationWithinConstraint(jointPose.rotation, constraint);
      })
    ) {
      throw new ThreeReferencePresetCatalogError(
        'invalid-joint-metadata',
        `Pose preset does not declare a complete bounded joint pose: ${entry.presetId}/${preset.poseId}`,
      );
    }
  }
}

function rotationWithinConstraint(
  rotation: { readonly x: number; readonly y: number; readonly z: number },
  joint: ThreeReferencePresetJointConstraint,
): boolean {
  const { min, max } = joint.rotationConstraint;
  return (
    Number.isFinite(rotation.x) &&
    Number.isFinite(rotation.y) &&
    Number.isFinite(rotation.z) &&
    rotation.x >= min.x &&
    rotation.x <= max.x &&
    rotation.y >= min.y &&
    rotation.y <= max.y &&
    rotation.z >= min.z &&
    rotation.z <= max.z
  );
}

function validateRenderPasses(entry: ThreeReferencePresetCatalogEntry): void {
  if (
    entry.renderPasses.length === 0 ||
    new Set(entry.renderPasses).size !== entry.renderPasses.length ||
    entry.renderPasses.some(
      (renderPass) => !renderPassMatchesPurpose(renderPass, entry.allowedPurposes),
    )
  ) {
    throw new ThreeReferencePresetCatalogError(
      'invalid-render-pass-metadata',
      `Render passes do not match allowed purposes: ${entry.presetId}`,
    );
  }
}

function validatePackagedDependencies(entry: ThreeReferencePresetCatalogEntry): void {
  const dependencyIds = new Set<string>();
  for (const dependency of entry.packagedDependencies) {
    if (
      dependencyIds.has(dependency.dependencyId) ||
      !isNonEmptyString(dependency.dependencyId) ||
      !isSafePackageRelativePath(dependency.packageRelativePath) ||
      !/^(?:sha256:)?[a-f0-9]{64}$/i.test(dependency.sha256)
    ) {
      throw new ThreeReferencePresetCatalogError(
        'invalid-packaged-dependency',
        `Invalid packaged dependency in ${entry.presetId}.`,
      );
    }
    dependencyIds.add(dependency.dependencyId);
  }
  if (
    (entry.runtime.kind === 'packaged' && !dependencyIds.has(entry.runtime.entryDependencyId)) ||
    (entry.runtime.kind === 'procedural' && entry.packagedDependencies.length > 0)
  ) {
    throw new ThreeReferencePresetCatalogError(
      'undeclared-packaged-dependency',
      `Runtime dependencies are not exact for ${entry.presetId}.`,
    );
  }
}

function validateProvenance(entry: ThreeReferencePresetCatalogEntry): void {
  if (!isNonEmptyString(entry.provenance.author) || !isNonEmptyString(entry.provenance.source)) {
    throw new ThreeReferencePresetCatalogError(
      'missing-provenance',
      `Preset provenance is incomplete: ${entry.presetId}`,
    );
  }
  if (
    !isNonEmptyString(entry.license.spdxId) ||
    !isNonEmptyString(entry.license.notice) ||
    (entry.provenance.origin === 'third-party' &&
      (!isNonEmptyString(entry.provenance.sourceUrl) ||
        !isNonEmptyString(entry.provenance.copyright) ||
        entry.license.redistribution !== 'approved' ||
        !isNonEmptyString(entry.license.licenseTextPath)))
  ) {
    throw new ThreeReferencePresetCatalogError(
      'missing-license-notice',
      `Preset license or notice is incomplete: ${entry.presetId}`,
    );
  }
}

function renderPassMatchesPurpose(
  renderPass: ThreeReferencePresetRenderPass,
  purposes: readonly ThreeReferencePurpose[],
): boolean {
  switch (renderPass) {
    case 'appearance-rgb':
      return purposes.includes('appearance');
    case 'pose-skeleton':
    case 'depth':
      return purposes.includes('pose');
    case 'camera-composition':
      return purposes.includes('camera');
    case 'panorama-source':
    case 'panorama-viewport':
      return purposes.includes('panorama-scene');
  }
}

function validConstraint(min: ThreeReferenceVector3, max: ThreeReferenceVector3): boolean {
  return (
    Number.isFinite(min.x) &&
    Number.isFinite(min.y) &&
    Number.isFinite(min.z) &&
    Number.isFinite(max.x) &&
    Number.isFinite(max.y) &&
    Number.isFinite(max.z) &&
    min.x <= max.x &&
    min.y <= max.y &&
    min.z <= max.z
  );
}

function isSafePackageRelativePath(value: string): boolean {
  return (
    isNonEmptyString(value) &&
    !value.startsWith('/') &&
    !value.startsWith('\\') &&
    !value.split(/[\\/]/u).includes('..')
  );
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function mannequinPreset(input: {
  readonly presetId: string;
  readonly implementationId: string;
  readonly fingerprint: string;
  readonly labelKey: string;
}): ThreeReferencePresetCatalogEntry {
  return {
    presetId: input.presetId,
    presetVersion: 2,
    fingerprint: input.fingerprint,
    presetKind: 'mannequin',
    appearancePolicy: 'guide-only',
    allowedPurposes: ['pose', 'camera'],
    labelKey: input.labelKey,
    defaultScale: 1,
    runtime: { kind: 'procedural', implementationId: input.implementationId },
    poseCapabilities: {
      posePresets: THREE_REFERENCE_MANNEQUIN_POSES,
      joints: THREE_REFERENCE_MANNEQUIN_JOINTS,
    },
    renderPasses: ['pose-skeleton', 'depth', 'camera-composition'],
    packagedDependencies: [],
    ...projectAuthoredMetadata(`${input.presetId} smooth procedural guide geometry`),
  };
}

function projectAuthoredMetadata(description: string): {
  readonly provenance: ThreeReferencePresetProvenance;
  readonly license: ThreeReferencePresetLicense;
} {
  return {
    provenance: {
      origin: 'project-authored',
      author: 'OpenNeko contributors',
      source: 'packages/neko-preview',
      copyright: 'OpenNeko contributors',
    },
    license: {
      spdxId: 'AGPL-3.0-or-later',
      redistribution: 'project-owned',
      notice: `Project-authored ${description}.`,
    },
  };
}

function freezeCatalogEntry(
  entry: ThreeReferencePresetCatalogEntry,
): ThreeReferencePresetCatalogEntry {
  const poseCapabilities = entry.poseCapabilities
    ? Object.freeze({
        posePresets: Object.freeze(
          entry.poseCapabilities.posePresets.map((preset) =>
            Object.freeze({
              ...preset,
              joints: Object.freeze(
                preset.joints.map((joint) =>
                  Object.freeze({
                    ...joint,
                    rotation: Object.freeze({ ...joint.rotation }),
                  }),
                ),
              ),
            }),
          ),
        ),
        joints: Object.freeze(
          entry.poseCapabilities.joints.map((joint) =>
            Object.freeze({
              ...joint,
              rotationConstraint: Object.freeze({
                min: Object.freeze({ ...joint.rotationConstraint.min }),
                max: Object.freeze({ ...joint.rotationConstraint.max }),
              }),
            }),
          ),
        ),
      })
    : undefined;
  const environmentCapabilities = entry.environmentCapabilities
    ? Object.freeze({ ...entry.environmentCapabilities })
    : undefined;

  return Object.freeze({
    ...entry,
    allowedPurposes: Object.freeze([...entry.allowedPurposes]),
    runtime: Object.freeze({ ...entry.runtime }),
    poseCapabilities,
    environmentCapabilities,
    renderPasses: Object.freeze([...entry.renderPasses]),
    packagedDependencies: Object.freeze(
      entry.packagedDependencies.map((dependency) => Object.freeze({ ...dependency })),
    ),
    provenance: Object.freeze({ ...entry.provenance }),
    license: Object.freeze({ ...entry.license }),
  });
}
