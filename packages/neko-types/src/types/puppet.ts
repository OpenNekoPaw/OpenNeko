// =============================================================================
// Puppet Project Types — .nkp file format
//
// Lightweight JSON wrapper referencing an external .moc3 file or a Live2D
// bundle-backed source.
// Stores parameter overrides and viewport state.
// =============================================================================

import type { BundleEntryLocator } from './bundle-locator';

/** Supported .nkp source formats. */
export type PuppetFormat = 'moc3' | 'native';

export type NkpAnimationModel = 'moc3-parameter' | 'bone-blendshape';

export type NkpPuppetRuntimeAdapterId =
  | 'neko-puppet-native'
  | 'live2d-moc3-compat'
  | 'live2d-cubism';

export type NkpPuppetRuntimeAdapterStatus = 'available' | 'unavailable' | 'compatibility';

export type NkpPuppetRuntimeDiagnosticCode =
  | 'cubism-adapter-unavailable'
  | 'legacy-moc3-compatibility'
  | 'wrong-domain-field';

export interface NkpPuppetRuntimeDiagnostic {
  readonly code: NkpPuppetRuntimeDiagnosticCode;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly context?: Record<string, string | number | boolean | null>;
}

export interface NkpPuppetRuntimeAdapterDescriptor {
  readonly id: NkpPuppetRuntimeAdapterId;
  readonly owner: 'neko-puppet';
  readonly version?: string;
  readonly status: NkpPuppetRuntimeAdapterStatus;
  readonly sdkNeutral: true;
  readonly sourceCompatibility: readonly PuppetFormat[];
  readonly diagnostics?: readonly NkpPuppetRuntimeDiagnostic[];
}

export type NkpImportSourceKind = 'psd' | 'png' | 'live2d-bundle' | 'moc3' | 'generated';

export type NkpBlendShapeStandard = 'arkit_52' | 'vrm' | 'custom';

export type NkpRigTemplate =
  | 'humanoid_full'
  | 'humanoid_upper'
  | 'humanoid_chibi'
  | 'quadruped'
  | 'custom';

export type NkpVec2 = readonly [number, number];
export type NkpVec4 = readonly [number, number, number, number];
export type NkpJointIndex4 = readonly [number, number, number, number];

export interface NkpImportSource {
  readonly kind: NkpImportSourceKind;
  /** Relative path or ${VAR}/path. */
  readonly path?: string;
  readonly contentHash?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface NkpTransform2D {
  readonly position?: NkpVec2;
  readonly rotation?: number;
  readonly scale?: NkpVec2;
}

export type NkpTransformEditMode = 'set' | 'offset';

export interface NkpTransform2DEdit {
  readonly position?: NkpVec2;
  /** Rotation in degrees. */
  readonly rotation?: number;
  readonly scale?: NkpVec2;
}

export interface NkpLayerMesh {
  readonly id: string;
  readonly vertices: readonly NkpVec2[];
  readonly uvs?: readonly NkpVec2[];
  readonly triangles?: readonly [number, number, number][];
}

export interface NkpSkinWeights2D {
  readonly meshId: string;
  readonly jointIndices: readonly NkpJointIndex4[];
  readonly jointWeights: readonly NkpVec4[];
}

export interface NkpLayer {
  readonly id: string;
  readonly name?: string;
  readonly textureRef: string;
  readonly mesh: NkpLayerMesh;
  readonly blendMode?: string;
  readonly opacity?: number;
  readonly zOrder?: number;
  readonly skinWeights?: NkpSkinWeights2D;
}

export interface NkpBone2D {
  readonly id: string;
  readonly name: string;
  readonly parent?: string | null;
  readonly position: NkpVec2;
  readonly rotation?: number;
  readonly scale?: NkpVec2;
  readonly length?: number;
}

export type NkpIkSolver2D =
  | { readonly type: 'twoBone' }
  | { readonly type: 'ccd'; readonly maxIterations?: number };

export interface NkpIkConstraint2D {
  readonly id: string;
  readonly targetBone: string;
  readonly endBone: string;
  readonly chainLength: number;
  readonly solver: NkpIkSolver2D;
}

export interface NkpPathConstraint2D {
  readonly id: string;
  readonly bone: string;
  readonly path: readonly NkpVec2[];
  readonly influence?: number;
}

export interface NkpSpringBone2D {
  readonly id: string;
  readonly bone: string;
  readonly stiffness: number;
  readonly damping: number;
  readonly gravityScale?: number;
  readonly windInfluence?: number;
}

export interface NkpSkeleton2D {
  readonly bones: readonly NkpBone2D[];
  readonly ikConstraints?: readonly NkpIkConstraint2D[];
  readonly pathConstraints?: readonly NkpPathConstraint2D[];
  readonly springBones?: readonly NkpSpringBone2D[];
}

export interface NkpBlendShapeDef {
  readonly id?: string;
  readonly name: string;
  readonly meshId: string;
  readonly vertexDeltas: readonly NkpVec2[];
  readonly postSkin?: boolean;
}

export interface NkpBlendShapeLibrary {
  readonly standard?: NkpBlendShapeStandard;
  readonly implemented: readonly string[];
  readonly shapes?: readonly NkpBlendShapeDef[];
  readonly custom?: readonly NkpBlendShapeDef[];
  readonly aliases?: Record<string, string | readonly string[]>;
}

export interface NkpExpressionPreset {
  readonly name: string;
  readonly weights: Record<string, number>;
}

export type NkpDriverCurve =
  | {
      readonly type: 'linear';
      readonly scale?: number;
      readonly offset?: number;
    }
  | {
      readonly type: 'bezier';
      readonly points: readonly [number, number, number, number];
    }
  | {
      readonly type: 'step';
    };

export type NkpDriverBlendMode = 'add' | 'override' | 'max';
export type NkpAxis2D = 'x' | 'y' | 'z';

export type NkpControlSource =
  | { readonly type: 'blendshape'; readonly name: string }
  | { readonly type: 'expression'; readonly preset: string }
  | { readonly type: 'tracking'; readonly name: string }
  | { readonly type: 'live2dParam'; readonly name: string };

export type NkpControlTarget =
  | { readonly type: 'boneRotation'; readonly bone: string; readonly axis: NkpAxis2D }
  | { readonly type: 'bonePosition'; readonly bone: string }
  | { readonly type: 'boneScale'; readonly bone: string }
  | { readonly type: 'blendshapeWeight'; readonly name: string };

export interface NkpControlDriver {
  readonly id: string;
  readonly source: NkpControlSource;
  readonly target: NkpControlTarget;
  readonly curve: NkpDriverCurve;
  readonly blendMode: NkpDriverBlendMode;
  readonly priority: number;
}

export type PuppetCommand =
  | { readonly type: 'load'; readonly dataBase64: string }
  | { readonly type: 'loadNativeProject'; readonly project: NkpProjectData }
  | { readonly type: 'setParameter'; readonly name: string; readonly value: number }
  | { readonly type: 'tick'; readonly deltaMs: number }
  | { readonly type: 'playAnimation'; readonly name: string; readonly loopAnim: boolean }
  | { readonly type: 'stopAnimation' }
  | { readonly type: 'seekAnimation'; readonly timeMs: number }
  | {
      readonly type: 'addKeyframe';
      readonly clipName: string;
      readonly paramName: string;
      readonly timeMs: number;
      readonly value: number;
    }
  | {
      readonly type: 'removeKeyframe';
      readonly clipName: string;
      readonly paramName: string;
      readonly keyframeId: string;
    }
  | {
      readonly type: 'updateKeyframe';
      readonly clipName: string;
      readonly paramName: string;
      readonly keyframeId: string;
      readonly timeMs?: number;
      readonly value?: number;
      readonly easing?: string;
    }
  | { readonly type: 'createClip'; readonly name: string; readonly durationMs: number }
  | {
      readonly type: 'crossfadeAnimation';
      readonly clipName: string;
      readonly fadeDurationMs: number;
      readonly loopAnim: boolean;
    }
  | { readonly type: 'setBlendWeight'; readonly clipName: string; readonly weight: number }
  | { readonly type: 'setNodeOpacity'; readonly nodeId: string; readonly opacity: number }
  | { readonly type: 'setTexture'; readonly nodeId: string; readonly textureIndex: number }
  | { readonly type: 'setExpression'; readonly name: string }
  | { readonly type: 'clearExpression' }
  | { readonly type: 'setNativeBlendShape'; readonly name: string; readonly weight: number }
  | {
      readonly type: 'setNativeBlendShapeDelta';
      readonly name: string;
      readonly meshId: string;
      readonly vertexIndex: number;
      readonly delta: NkpVec2;
    }
  | {
      readonly type: 'setNativeBoneTransform';
      readonly bone: string;
      readonly transform: NkpTransform2DEdit;
      readonly mode?: NkpTransformEditMode;
    }
  | {
      readonly type: 'setNativeSkinWeight';
      readonly meshId: string;
      readonly vertexIndex: number;
      readonly jointIndices: NkpJointIndex4;
      readonly jointWeights: NkpVec4;
    }
  | { readonly type: 'upsertNativeControlDriver'; readonly driver: NkpControlDriver }
  | { readonly type: 'removeNativeControlDriver'; readonly id: string }
  | { readonly type: 'setNativeTrackingInput'; readonly name: string; readonly value: number }
  | { readonly type: 'setNativeExpression'; readonly name: string }
  | { readonly type: 'clearNativeExpression' }
  | { readonly type: 'playNativeAnimation'; readonly name: string; readonly loopAnim: boolean }
  | { readonly type: 'stopNativeAnimation' }
  | { readonly type: 'seekNativeAnimation'; readonly timeMs: number }
  | {
      readonly type: 'loadMoc3Auxiliary';
      readonly expressions?: readonly (readonly [string, string])[];
      readonly motions?: readonly (readonly [string, string])[];
      readonly physicsJson?: string;
    };

export interface PuppetCommandEnvelope {
  /** Strictly ordered command sequence number. */
  readonly seq: number;
  /** Client-observed puppet revision before applying this command. */
  readonly baseRevision: number;
  /** Optional client correlation id. */
  readonly transactionId?: string;
  readonly command: PuppetCommand;
}

export type PuppetCommandAckStatus = 'applied' | 'rejected';
export type PuppetCommandErrorCode = 'ordering' | 'revisionConflict' | 'applyFailed';

export interface PuppetCommandError {
  readonly code: PuppetCommandErrorCode;
  readonly message: string;
}

export interface PuppetCommandAck {
  readonly seq: number;
  readonly appliedSeq: number;
  readonly baseRevision: number;
  readonly revision: number;
  readonly status: PuppetCommandAckStatus;
  readonly result?: unknown;
  readonly error?: PuppetCommandError;
}

export type NkpEasingType =
  | { readonly type: 'linear' }
  | { readonly type: 'step' }
  | { readonly type: 'bezier'; readonly c1: NkpVec2; readonly c2: NkpVec2 };

export interface NkpKeyframe<T> {
  readonly timeMs: number;
  readonly value: T;
  readonly easing?: NkpEasingType;
}

export interface NkpBoneTrack {
  readonly bone: string;
  readonly positionKeys?: readonly NkpKeyframe<NkpVec2>[];
  readonly rotationKeys?: readonly NkpKeyframe<number>[];
  readonly scaleKeys?: readonly NkpKeyframe<NkpVec2>[];
}

export interface NkpBlendShapeTrack {
  readonly blendshape: string;
  readonly weightKeys: readonly NkpKeyframe<number>[];
}

export interface AnimationClip2D {
  readonly name: string;
  readonly durationMs: number;
  readonly boneTracks?: readonly NkpBoneTrack[];
  readonly blendshapeTracks?: readonly NkpBlendShapeTrack[];
}

export interface NkpAutoRigMetadata {
  readonly template: NkpRigTemplate | string;
  readonly generatedBy: string;
  readonly confidence: number;
  readonly modelVersion?: string;
  readonly userAdjusted?: readonly string[];
  readonly sourceKind?: NkpImportSourceKind;
}

export interface NkpViewportState {
  readonly zoom: number;
}

export interface NkpSceneAuthoringDiagnostic {
  readonly code: 'wrong-domain-field';
  readonly severity: 'error';
  readonly message: string;
  readonly path: readonly (string | number)[];
}

export interface NkpLive2dBundleReference {
  /** Path to the source ZIP, stored as relative path or ${VAR}/path. */
  path: string;
  /** Entry locator for the model3.json manifest. */
  manifest: BundleEntryLocator;
  /** Entry locator for the referenced .moc3 file. */
  moc: BundleEntryLocator;
  /** Bundle content hash when available. */
  contentHash?: string;
}

export interface NkpPuppetRuntimeAdapterReference {
  readonly id: NkpPuppetRuntimeAdapterId;
  readonly version?: string;
  readonly importSettings?: Record<string, unknown>;
}

export interface NkpBundleMotionIndexEntry {
  name: string;
  group: string;
  locator: BundleEntryLocator;
  fadeInTime?: number;
  fadeOutTime?: number;
}

export interface NkpBundleExpressionIndexEntry {
  name: string;
  locator: BundleEntryLocator;
}

export interface NkpBundleTextureIndexEntry {
  index: number;
  locator: BundleEntryLocator;
  name?: string;
}

export interface PuppetExternalTextureData {
  /** MOC3 texture slot index used by mesh `texture_index` values. */
  readonly index: number;
  /** Base64-encoded PNG bytes, optionally as a `data:image/png;base64,...` URL. */
  readonly data: string;
  /** Runtime texture channel currently supports Live2D PNG textures. */
  readonly mimeType?: 'image/png';
  /** Optional user/model-facing texture name from model3.json. */
  readonly name?: string;
  /** Optional metadata locator; renderers must consume `data`, not this path. */
  readonly locator?: BundleEntryLocator;
}

export interface PuppetAuxiliaryJsonData {
  /** Expression tuples passed to the engine as `[name, exp3Json]`. */
  readonly expressions?: readonly (readonly [string, string])[];
  /** Motion tuples passed to the engine as `[name, motion3Json]`. */
  readonly motions?: readonly (readonly [string, string])[];
  /** Optional physics3.json content. */
  readonly physics?: string;
}

export interface NkpBundleIndex {
  storageMode: 'bundle-memory';
  manifest: BundleEntryLocator;
  moc: BundleEntryLocator;
  textures: readonly NkpBundleTextureIndexEntry[];
  motions: readonly NkpBundleMotionIndexEntry[];
  expressions: readonly NkpBundleExpressionIndexEntry[];
  physics?: BundleEntryLocator;
  parameterIds?: readonly string[];
  generatedAt?: string;
}

/** .nkp project data */
export interface NkpProjectData {
  version: string;
  name: string;
  puppet: {
    src: string | null;
    /** Binary format (auto-detected from file extension if omitted) */
    format?: PuppetFormat;
    /** Runtime/authoring animation model. */
    animationModel?: NkpAnimationModel;
    /** SDK-neutral runtime adapter selection. */
    runtimeAdapter?: NkpPuppetRuntimeAdapterReference;
    /** Original source metadata for native imports. */
    importSource?: NkpImportSource;
    /** Live2D ZIP bundle source when the model is loaded from bundle memory. */
    bundle?: NkpLive2dBundleReference;
  };
  /** Lightweight index for search/discovery without reparsing ZIP bytes. */
  bundleIndex?: NkpBundleIndex;
  /** Native layer, mesh, and texture bindings. */
  layers?: readonly NkpLayer[];
  /** Native 2D skeleton. */
  skeleton?: NkpSkeleton2D;
  /** Native BlendShape library. */
  blendShapes?: NkpBlendShapeLibrary;
  /** Explicit semantic driver mappings. */
  controlDrivers?: readonly NkpControlDriver[];
  /** Named expression presets. */
  expressions?: Record<string, Record<string, number>>;
  /** Native animation clips. */
  animations?: readonly AnimationClip2D[];
  /** Automatic creation metadata. */
  autoRig?: NkpAutoRigMetadata;
  parameters: Record<string, number>;
  /** Standard face parameter values (subset matching PUPPET_FACE_PARAMETERS) */
  faceParameters?: Record<string, number>;
  viewport: NkpViewportState;
}

export interface NkpNativeProjectData extends NkpProjectData {
  puppet: NkpProjectData['puppet'] & {
    format: 'native';
    animationModel: 'bone-blendshape';
    importSource?: NkpImportSource;
  };
  layers: readonly NkpLayer[];
  skeleton: NkpSkeleton2D;
  blendShapes: NkpBlendShapeLibrary;
  controlDrivers: readonly NkpControlDriver[];
  expressions: Record<string, Record<string, number>>;
  animations: readonly AnimationClip2D[];
  autoRig?: NkpAutoRigMetadata;
}

export function isNkpProjectData(value: unknown): value is NkpProjectData {
  if (!isRecord(value)) return false;
  return (
    typeof value['version'] === 'string' &&
    typeof value['name'] === 'string' &&
    isNkpPuppetSource(value['puppet']) &&
    (value['bundleIndex'] === undefined || isNkpBundleIndex(value['bundleIndex'])) &&
    (value['layers'] === undefined || isArrayOf(value['layers'], isNkpLayer)) &&
    (value['skeleton'] === undefined || isNkpSkeleton2D(value['skeleton'])) &&
    (value['blendShapes'] === undefined || isNkpBlendShapeLibrary(value['blendShapes'])) &&
    (value['controlDrivers'] === undefined ||
      isArrayOf(value['controlDrivers'], isNkpControlDriver)) &&
    (value['expressions'] === undefined || isRecordOfNumberRecords(value['expressions'])) &&
    (value['animations'] === undefined || isArrayOf(value['animations'], isAnimationClip2D)) &&
    (value['autoRig'] === undefined || isNkpAutoRigMetadata(value['autoRig'])) &&
    isNumberRecord(value['parameters']) &&
    (value['faceParameters'] === undefined || isNumberRecord(value['faceParameters'])) &&
    isNkpViewportState(value['viewport'])
  );
}

const NKP_SCENE_AUTHORING_FIELD_MESSAGES: ReadonlyMap<string, string> = new Map([
  ['scene2d', '2D Scene authoring state belongs to .nkm profile: 2d, not .nkp.'],
  ['sprites', 'Sprite scene authoring belongs to .nkm profile: 2d, not .nkp.'],
  ['tilemap', 'Tilemap authoring belongs to .nkm profile: 2d, not .nkp.'],
  ['tilemaps', 'Tilemap authoring belongs to .nkm profile: 2d, not .nkp.'],
  ['sceneCamera', 'Scene camera authoring belongs to .nkm profile: 2d or live, not .nkp.'],
  ['stageCamera', 'Stage camera authoring belongs to .nkm profile: live, not .nkp.'],
  ['cameraRig', 'Scene camera rig authoring belongs to .nkm, not .nkp.'],
  ['sceneLights', 'Scene light authoring belongs to .nkm profile: 2d or 3d, not .nkp.'],
  ['lights', 'Scene light authoring belongs to .nkm profile: 2d or 3d, not .nkp.'],
  ['parallax', 'Parallax scene authoring belongs to .nkm profile: 2d, not .nkp.'],
  ['parallaxLayers', 'Parallax scene authoring belongs to .nkm profile: 2d, not .nkp.'],
  ['particles', 'Particle scene authoring belongs to .nkm profile: 2d, not .nkp.'],
  ['particleEmitters', 'Particle scene authoring belongs to .nkm profile: 2d, not .nkp.'],
  ['sceneGraph', 'Generic scene graph authoring belongs to .nkm, not .nkp.'],
  ['sceneSwitching', 'Scene switching belongs to .nkm profile: live, not .nkp.'],
  ['stage', 'Live stage authoring belongs to .nkm profile: live, not .nkp.'],
]);

export function diagnoseNkpSceneAuthoringFields(value: unknown): NkpSceneAuthoringDiagnostic[] {
  if (!isRecord(value)) return [];

  const diagnostics: NkpSceneAuthoringDiagnostic[] = [];
  for (const [field, message] of NKP_SCENE_AUTHORING_FIELD_MESSAGES) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      diagnostics.push({
        code: 'wrong-domain-field',
        severity: 'error',
        message: `${field}: ${message}`,
        path: [field],
      });
    }
  }

  const puppet = value['puppet'];
  if (isRecord(puppet) && Object.prototype.hasOwnProperty.call(puppet, 'scene')) {
    diagnostics.push({
      code: 'wrong-domain-field',
      severity: 'error',
      message: 'puppet.scene: Generic scene authoring belongs to .nkm, not .nkp.',
      path: ['puppet', 'scene'],
    });
  }

  return diagnostics;
}

export function isNkpNativeProjectData(value: unknown): value is NkpNativeProjectData {
  if (!isNkpProjectData(value)) return false;
  return (
    value.puppet.format === 'native' &&
    value.puppet.animationModel === 'bone-blendshape' &&
    Array.isArray(value.layers) &&
    isNkpSkeleton2D(value.skeleton) &&
    isNkpBlendShapeLibrary(value.blendShapes) &&
    Array.isArray(value.controlDrivers) &&
    value.expressions !== undefined &&
    isRecordOfNumberRecords(value.expressions) &&
    Array.isArray(value.animations)
  );
}

export function isPuppetCommandEnvelope(value: unknown): value is PuppetCommandEnvelope {
  if (!isRecord(value)) return false;
  return (
    isNonNegativeInteger(value['seq']) &&
    isNonNegativeInteger(value['baseRevision']) &&
    (value['transactionId'] === undefined || typeof value['transactionId'] === 'string') &&
    isPuppetCommand(value['command'])
  );
}

export function isPuppetCommandAck(value: unknown): value is PuppetCommandAck {
  if (!isRecord(value)) return false;
  return (
    isNonNegativeInteger(value['seq']) &&
    isNonNegativeInteger(value['appliedSeq']) &&
    isNonNegativeInteger(value['baseRevision']) &&
    isNonNegativeInteger(value['revision']) &&
    (value['status'] === 'applied' || value['status'] === 'rejected') &&
    (value['error'] === undefined || isPuppetCommandError(value['error']))
  );
}

function isNkpPuppetSource(value: unknown): value is NkpProjectData['puppet'] {
  if (!isRecord(value)) return false;
  return (
    (typeof value['src'] === 'string' || value['src'] === null) &&
    (value['format'] === undefined || isPuppetFormat(value['format'])) &&
    (value['animationModel'] === undefined || isNkpAnimationModel(value['animationModel'])) &&
    (value['runtimeAdapter'] === undefined ||
      isNkpPuppetRuntimeAdapterReference(value['runtimeAdapter'])) &&
    (value['importSource'] === undefined || isNkpImportSource(value['importSource'])) &&
    (value['bundle'] === undefined || isNkpLive2dBundleReference(value['bundle']))
  );
}

export function createNkpPuppetRuntimeAdapterDescriptor(
  id: NkpPuppetRuntimeAdapterId,
  options: {
    readonly version?: string;
    readonly status?: NkpPuppetRuntimeAdapterStatus;
    readonly diagnostics?: readonly NkpPuppetRuntimeDiagnostic[];
  } = {},
): NkpPuppetRuntimeAdapterDescriptor {
  return {
    id,
    owner: 'neko-puppet',
    ...(options.version ? { version: options.version } : {}),
    status: options.status ?? defaultRuntimeAdapterStatus(id),
    sdkNeutral: true,
    sourceCompatibility: runtimeAdapterSourceCompatibility(id),
    ...(options.diagnostics ? { diagnostics: [...options.diagnostics] } : {}),
  };
}

function isPuppetCommand(value: unknown): value is PuppetCommand {
  if (!isRecord(value) || typeof value['type'] !== 'string') return false;

  switch (value['type']) {
    case 'load':
      return typeof value['dataBase64'] === 'string';
    case 'loadNativeProject':
      return isNkpProjectData(value['project']);
    case 'setParameter':
      return typeof value['name'] === 'string' && typeof value['value'] === 'number';
    case 'tick':
      return typeof value['deltaMs'] === 'number';
    case 'playAnimation':
    case 'playNativeAnimation':
      return typeof value['name'] === 'string' && typeof value['loopAnim'] === 'boolean';
    case 'stopAnimation':
    case 'clearExpression':
    case 'clearNativeExpression':
    case 'stopNativeAnimation':
      return true;
    case 'seekAnimation':
    case 'seekNativeAnimation':
      return typeof value['timeMs'] === 'number';
    case 'addKeyframe':
      return (
        typeof value['clipName'] === 'string' &&
        typeof value['paramName'] === 'string' &&
        typeof value['timeMs'] === 'number' &&
        typeof value['value'] === 'number'
      );
    case 'removeKeyframe':
      return (
        typeof value['clipName'] === 'string' &&
        typeof value['paramName'] === 'string' &&
        typeof value['keyframeId'] === 'string'
      );
    case 'updateKeyframe':
      return (
        typeof value['clipName'] === 'string' &&
        typeof value['paramName'] === 'string' &&
        typeof value['keyframeId'] === 'string' &&
        (value['timeMs'] === undefined || typeof value['timeMs'] === 'number') &&
        (value['value'] === undefined || typeof value['value'] === 'number') &&
        (value['easing'] === undefined || typeof value['easing'] === 'string')
      );
    case 'createClip':
      return typeof value['name'] === 'string' && typeof value['durationMs'] === 'number';
    case 'crossfadeAnimation':
      return (
        typeof value['clipName'] === 'string' &&
        typeof value['fadeDurationMs'] === 'number' &&
        typeof value['loopAnim'] === 'boolean'
      );
    case 'setBlendWeight':
      return typeof value['clipName'] === 'string' && typeof value['weight'] === 'number';
    case 'setNodeOpacity':
      return typeof value['nodeId'] === 'string' && typeof value['opacity'] === 'number';
    case 'setTexture':
      return typeof value['nodeId'] === 'string' && isNonNegativeInteger(value['textureIndex']);
    case 'setExpression':
    case 'setNativeExpression':
      return typeof value['name'] === 'string';
    case 'setNativeBlendShape':
      return typeof value['name'] === 'string' && typeof value['weight'] === 'number';
    case 'setNativeBlendShapeDelta':
      return (
        typeof value['name'] === 'string' &&
        typeof value['meshId'] === 'string' &&
        isNonNegativeInteger(value['vertexIndex']) &&
        isVec2(value['delta'])
      );
    case 'setNativeBoneTransform':
      return (
        typeof value['bone'] === 'string' &&
        isNkpTransform2DEdit(value['transform']) &&
        (value['mode'] === undefined || isNkpTransformEditMode(value['mode']))
      );
    case 'setNativeSkinWeight':
      return (
        typeof value['meshId'] === 'string' &&
        isNonNegativeInteger(value['vertexIndex']) &&
        isJointIndex4(value['jointIndices']) &&
        isVec4(value['jointWeights'])
      );
    case 'upsertNativeControlDriver':
      return isNkpControlDriver(value['driver']);
    case 'removeNativeControlDriver':
      return typeof value['id'] === 'string';
    case 'setNativeTrackingInput':
      return typeof value['name'] === 'string' && typeof value['value'] === 'number';
    case 'loadMoc3Auxiliary':
      return (
        (value['expressions'] === undefined || isArrayOf(value['expressions'], isStringTuple)) &&
        (value['motions'] === undefined || isArrayOf(value['motions'], isStringTuple)) &&
        (value['physicsJson'] === undefined || typeof value['physicsJson'] === 'string')
      );
    default:
      return false;
  }
}

function isPuppetCommandError(value: unknown): value is PuppetCommandError {
  if (!isRecord(value)) return false;
  return (
    (value['code'] === 'ordering' ||
      value['code'] === 'revisionConflict' ||
      value['code'] === 'applyFailed') &&
    typeof value['message'] === 'string'
  );
}

function isNkpTransform2DEdit(value: unknown): value is NkpTransform2DEdit {
  if (!isRecord(value)) return false;
  return (
    (value['position'] === undefined || isVec2(value['position'])) &&
    (value['rotation'] === undefined || typeof value['rotation'] === 'number') &&
    (value['scale'] === undefined || isVec2(value['scale']))
  );
}

function isNkpTransformEditMode(value: unknown): value is NkpTransformEditMode {
  return value === 'set' || value === 'offset';
}

function isPuppetFormat(value: unknown): value is PuppetFormat {
  return value === 'moc3' || value === 'native';
}

function isNkpAnimationModel(value: unknown): value is NkpAnimationModel {
  return value === 'moc3-parameter' || value === 'bone-blendshape';
}

function isNkpPuppetRuntimeAdapterReference(
  value: unknown,
): value is NkpPuppetRuntimeAdapterReference {
  if (!isRecord(value)) return false;
  return (
    isNkpPuppetRuntimeAdapterId(value['id']) &&
    (value['version'] === undefined || typeof value['version'] === 'string') &&
    (value['importSettings'] === undefined || isRecord(value['importSettings']))
  );
}

function isNkpPuppetRuntimeAdapterId(value: unknown): value is NkpPuppetRuntimeAdapterId {
  return (
    value === 'neko-puppet-native' || value === 'live2d-moc3-compat' || value === 'live2d-cubism'
  );
}

function defaultRuntimeAdapterStatus(id: NkpPuppetRuntimeAdapterId): NkpPuppetRuntimeAdapterStatus {
  return id === 'live2d-moc3-compat' ? 'compatibility' : 'available';
}

function runtimeAdapterSourceCompatibility(id: NkpPuppetRuntimeAdapterId): readonly PuppetFormat[] {
  switch (id) {
    case 'neko-puppet-native':
      return ['native'];
    case 'live2d-moc3-compat':
    case 'live2d-cubism':
      return ['moc3'];
  }
}

function isNkpImportSource(value: unknown): value is NkpImportSource {
  if (!isRecord(value)) return false;
  return (
    isNkpImportSourceKind(value['kind']) &&
    (value['path'] === undefined || typeof value['path'] === 'string') &&
    (value['contentHash'] === undefined || typeof value['contentHash'] === 'string') &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

function isNkpImportSourceKind(value: unknown): value is NkpImportSourceKind {
  return (
    value === 'psd' ||
    value === 'png' ||
    value === 'live2d-bundle' ||
    value === 'moc3' ||
    value === 'generated'
  );
}

function isNkpLive2dBundleReference(value: unknown): value is NkpLive2dBundleReference {
  if (!isRecord(value)) return false;
  return (
    typeof value['path'] === 'string' &&
    isBundleEntryLocator(value['manifest']) &&
    isBundleEntryLocator(value['moc']) &&
    (value['contentHash'] === undefined || typeof value['contentHash'] === 'string')
  );
}

function isNkpBundleIndex(value: unknown): value is NkpBundleIndex {
  if (!isRecord(value)) return false;
  return (
    value['storageMode'] === 'bundle-memory' &&
    isBundleEntryLocator(value['manifest']) &&
    isBundleEntryLocator(value['moc']) &&
    isArrayOf(value['textures'], isNkpBundleTextureIndexEntry) &&
    isArrayOf(value['motions'], isNkpBundleMotionIndexEntry) &&
    isArrayOf(value['expressions'], isNkpBundleExpressionIndexEntry) &&
    (value['physics'] === undefined || isBundleEntryLocator(value['physics'])) &&
    (value['parameterIds'] === undefined || isArrayOf(value['parameterIds'], isString)) &&
    (value['generatedAt'] === undefined || typeof value['generatedAt'] === 'string')
  );
}

function isNkpBundleTextureIndexEntry(value: unknown): value is NkpBundleTextureIndexEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value['index'] === 'number' &&
    isBundleEntryLocator(value['locator']) &&
    (value['name'] === undefined || typeof value['name'] === 'string')
  );
}

function isNkpBundleMotionIndexEntry(value: unknown): value is NkpBundleMotionIndexEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value['name'] === 'string' &&
    typeof value['group'] === 'string' &&
    isBundleEntryLocator(value['locator']) &&
    (value['fadeInTime'] === undefined || typeof value['fadeInTime'] === 'number') &&
    (value['fadeOutTime'] === undefined || typeof value['fadeOutTime'] === 'number')
  );
}

function isNkpBundleExpressionIndexEntry(value: unknown): value is NkpBundleExpressionIndexEntry {
  if (!isRecord(value)) return false;
  return typeof value['name'] === 'string' && isBundleEntryLocator(value['locator']);
}

function isBundleEntryLocator(value: unknown): value is BundleEntryLocator {
  if (!isRecord(value)) return false;
  return (
    typeof value['bundlePath'] === 'string' &&
    typeof value['entryPath'] === 'string' &&
    typeof value['fragmentRef'] === 'string'
  );
}

function isNkpViewportState(value: unknown): value is NkpViewportState {
  if (!isRecord(value)) return false;
  return typeof value['zoom'] === 'number';
}

function isNkpLayer(value: unknown): value is NkpLayer {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    (value['name'] === undefined || typeof value['name'] === 'string') &&
    typeof value['textureRef'] === 'string' &&
    isNkpLayerMesh(value['mesh']) &&
    (value['blendMode'] === undefined || typeof value['blendMode'] === 'string') &&
    (value['opacity'] === undefined || typeof value['opacity'] === 'number') &&
    (value['zOrder'] === undefined || typeof value['zOrder'] === 'number') &&
    (value['skinWeights'] === undefined || isNkpSkinWeights2D(value['skinWeights']))
  );
}

function isNkpLayerMesh(value: unknown): value is NkpLayerMesh {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    isArrayOf(value['vertices'], isVec2) &&
    (value['uvs'] === undefined || isArrayOf(value['uvs'], isVec2)) &&
    (value['triangles'] === undefined || isArrayOf(value['triangles'], isTriangle))
  );
}

function isNkpSkinWeights2D(value: unknown): value is NkpSkinWeights2D {
  if (!isRecord(value)) return false;
  return (
    typeof value['meshId'] === 'string' &&
    isArrayOf(value['jointIndices'], isJointIndex4) &&
    isArrayOf(value['jointWeights'], isVec4)
  );
}

function isNkpSkeleton2D(value: unknown): value is NkpSkeleton2D {
  if (!isRecord(value)) return false;
  return (
    isArrayOf(value['bones'], isNkpBone2D) &&
    (value['ikConstraints'] === undefined ||
      isArrayOf(value['ikConstraints'], isNkpIkConstraint2D)) &&
    (value['pathConstraints'] === undefined ||
      isArrayOf(value['pathConstraints'], isNkpPathConstraint2D)) &&
    (value['springBones'] === undefined || isArrayOf(value['springBones'], isNkpSpringBone2D))
  );
}

function isNkpBone2D(value: unknown): value is NkpBone2D {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    (value['parent'] === undefined ||
      typeof value['parent'] === 'string' ||
      value['parent'] === null) &&
    isVec2(value['position']) &&
    (value['rotation'] === undefined || typeof value['rotation'] === 'number') &&
    (value['scale'] === undefined || isVec2(value['scale'])) &&
    (value['length'] === undefined || typeof value['length'] === 'number')
  );
}

function isNkpIkConstraint2D(value: unknown): value is NkpIkConstraint2D {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['targetBone'] === 'string' &&
    typeof value['endBone'] === 'string' &&
    typeof value['chainLength'] === 'number' &&
    isNkpIkSolver2D(value['solver'])
  );
}

function isNkpIkSolver2D(value: unknown): value is NkpIkSolver2D {
  if (!isRecord(value)) return false;
  return (
    value['type'] === 'twoBone' ||
    (value['type'] === 'ccd' &&
      (value['maxIterations'] === undefined || typeof value['maxIterations'] === 'number'))
  );
}

function isNkpPathConstraint2D(value: unknown): value is NkpPathConstraint2D {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['bone'] === 'string' &&
    isArrayOf(value['path'], isVec2) &&
    (value['influence'] === undefined || typeof value['influence'] === 'number')
  );
}

function isNkpSpringBone2D(value: unknown): value is NkpSpringBone2D {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['bone'] === 'string' &&
    typeof value['stiffness'] === 'number' &&
    typeof value['damping'] === 'number' &&
    (value['gravityScale'] === undefined || typeof value['gravityScale'] === 'number') &&
    (value['windInfluence'] === undefined || typeof value['windInfluence'] === 'number')
  );
}

function isNkpBlendShapeLibrary(value: unknown): value is NkpBlendShapeLibrary {
  if (!isRecord(value)) return false;
  return (
    (value['standard'] === undefined || isNkpBlendShapeStandard(value['standard'])) &&
    isArrayOf(value['implemented'], isString) &&
    (value['shapes'] === undefined || isArrayOf(value['shapes'], isNkpBlendShapeDef)) &&
    (value['custom'] === undefined || isArrayOf(value['custom'], isNkpBlendShapeDef)) &&
    (value['aliases'] === undefined || isBlendShapeAliases(value['aliases']))
  );
}

function isNkpBlendShapeStandard(value: unknown): value is NkpBlendShapeStandard {
  return value === 'arkit_52' || value === 'vrm' || value === 'custom';
}

function isNkpBlendShapeDef(value: unknown): value is NkpBlendShapeDef {
  if (!isRecord(value)) return false;
  return (
    (value['id'] === undefined || typeof value['id'] === 'string') &&
    typeof value['name'] === 'string' &&
    typeof value['meshId'] === 'string' &&
    isArrayOf(value['vertexDeltas'], isVec2) &&
    (value['postSkin'] === undefined || typeof value['postSkin'] === 'boolean')
  );
}

function isBlendShapeAliases(value: unknown): value is Record<string, string | readonly string[]> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (item) => typeof item === 'string' || isArrayOf(item, isString),
  );
}

function isNkpControlDriver(value: unknown): value is NkpControlDriver {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    isNkpControlSource(value['source']) &&
    isNkpControlTarget(value['target']) &&
    isNkpDriverCurve(value['curve']) &&
    isNkpDriverBlendMode(value['blendMode']) &&
    typeof value['priority'] === 'number'
  );
}

function isNkpControlSource(value: unknown): value is NkpControlSource {
  if (!isRecord(value)) return false;
  if (
    value['type'] === 'blendshape' ||
    value['type'] === 'tracking' ||
    value['type'] === 'live2dParam'
  ) {
    return typeof value['name'] === 'string';
  }
  return value['type'] === 'expression' && typeof value['preset'] === 'string';
}

function isNkpControlTarget(value: unknown): value is NkpControlTarget {
  if (!isRecord(value)) return false;
  if (value['type'] === 'boneRotation') {
    return typeof value['bone'] === 'string' && isNkpAxis2D(value['axis']);
  }
  if (value['type'] === 'bonePosition' || value['type'] === 'boneScale') {
    return typeof value['bone'] === 'string';
  }
  return value['type'] === 'blendshapeWeight' && typeof value['name'] === 'string';
}

function isNkpDriverCurve(value: unknown): value is NkpDriverCurve {
  if (!isRecord(value)) return false;
  if (value['type'] === 'linear') {
    return (
      (value['scale'] === undefined || typeof value['scale'] === 'number') &&
      (value['offset'] === undefined || typeof value['offset'] === 'number')
    );
  }
  if (value['type'] === 'bezier') {
    return isVec4(value['points']);
  }
  return value['type'] === 'step';
}

function isNkpDriverBlendMode(value: unknown): value is NkpDriverBlendMode {
  return value === 'add' || value === 'override' || value === 'max';
}

function isNkpAxis2D(value: unknown): value is NkpAxis2D {
  return value === 'x' || value === 'y' || value === 'z';
}

function isAnimationClip2D(value: unknown): value is AnimationClip2D {
  if (!isRecord(value)) return false;
  return (
    typeof value['name'] === 'string' &&
    typeof value['durationMs'] === 'number' &&
    (value['boneTracks'] === undefined || isArrayOf(value['boneTracks'], isNkpBoneTrack)) &&
    (value['blendshapeTracks'] === undefined ||
      isArrayOf(value['blendshapeTracks'], isNkpBlendShapeTrack))
  );
}

function isNkpBoneTrack(value: unknown): value is NkpBoneTrack {
  if (!isRecord(value)) return false;
  return (
    typeof value['bone'] === 'string' &&
    (value['positionKeys'] === undefined || isArrayOf(value['positionKeys'], isVec2Keyframe)) &&
    (value['rotationKeys'] === undefined || isArrayOf(value['rotationKeys'], isNumberKeyframe)) &&
    (value['scaleKeys'] === undefined || isArrayOf(value['scaleKeys'], isVec2Keyframe))
  );
}

function isNkpBlendShapeTrack(value: unknown): value is NkpBlendShapeTrack {
  if (!isRecord(value)) return false;
  return (
    typeof value['blendshape'] === 'string' && isArrayOf(value['weightKeys'], isNumberKeyframe)
  );
}

function isNumberKeyframe(value: unknown): value is NkpKeyframe<number> {
  if (!isRecord(value)) return false;
  return (
    typeof value['timeMs'] === 'number' &&
    typeof value['value'] === 'number' &&
    (value['easing'] === undefined || isNkpEasingType(value['easing']))
  );
}

function isVec2Keyframe(value: unknown): value is NkpKeyframe<NkpVec2> {
  if (!isRecord(value)) return false;
  return (
    typeof value['timeMs'] === 'number' &&
    isVec2(value['value']) &&
    (value['easing'] === undefined || isNkpEasingType(value['easing']))
  );
}

function isNkpEasingType(value: unknown): value is NkpEasingType {
  if (!isRecord(value)) return false;
  if (value['type'] === 'linear' || value['type'] === 'step') return true;
  return value['type'] === 'bezier' && isVec2(value['c1']) && isVec2(value['c2']);
}

function isNkpAutoRigMetadata(value: unknown): value is NkpAutoRigMetadata {
  if (!isRecord(value)) return false;
  return (
    typeof value['template'] === 'string' &&
    typeof value['generatedBy'] === 'string' &&
    typeof value['confidence'] === 'number' &&
    (value['modelVersion'] === undefined || typeof value['modelVersion'] === 'string') &&
    (value['userAdjusted'] === undefined || isArrayOf(value['userAdjusted'], isString)) &&
    (value['sourceKind'] === undefined || isNkpImportSourceKind(value['sourceKind']))
  );
}

function isRecordOfNumberRecords(value: unknown): value is Record<string, Record<string, number>> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => isNumberRecord(item));
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => typeof item === 'number');
}

function isVec2(value: unknown): value is NkpVec2 {
  return (
    Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === 'number')
  );
}

function isVec4(value: unknown): value is NkpVec4 {
  return (
    Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === 'number')
  );
}

function isJointIndex4(value: unknown): value is NkpJointIndex4 {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => Number.isInteger(item) && item >= 0)
  );
}

function isTriangle(value: unknown): value is readonly [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => Number.isInteger(item) && item >= 0)
  );
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringTuple(value: unknown): value is readonly [string, string] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'string'
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is readonly T[] {
  return Array.isArray(value) && value.every((item) => guard(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
