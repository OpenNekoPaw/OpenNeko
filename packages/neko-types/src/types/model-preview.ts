import { isResourceRef, type ResourceRef } from './resource-cache.js';

export const MODEL_PREVIEW_PROTOCOL_VERSION = 1 as const;
export const MODEL_PREVIEW_STAGING_SCHEMA_VERSION = 1 as const;
export const MODEL_PREVIEW_CONTEXT_VERSION = 1 as const;

export const MODEL_PREVIEW_FORMATS = ['glb', 'gltf', 'obj', 'stl', 'ply'] as const;
export type ModelPreviewFormat = (typeof MODEL_PREVIEW_FORMATS)[number];

export interface ModelPreviewIdentity {
  readonly sessionId: string;
  readonly sourceFingerprint: string;
  readonly revision: number;
}

export interface ModelPreviewVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ModelPreviewEuler {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly order: 'XYZ';
}

export interface ModelPreviewTransform {
  readonly position: ModelPreviewVector3;
  readonly rotation: ModelPreviewEuler;
  readonly scale: ModelPreviewVector3;
}

export interface ModelPreviewTransformPatch {
  readonly nodePath: string;
  readonly transform: ModelPreviewTransform;
}

export interface ModelPreviewCameraPreset {
  readonly id: string;
  readonly label: string;
  readonly position: ModelPreviewVector3;
  readonly target: ModelPreviewVector3;
  readonly fieldOfViewDeg: number;
}

export interface ModelPreviewLightEntry {
  readonly id: 'key' | 'fill' | 'rim';
  readonly color: string;
  readonly intensity: number;
  readonly position: ModelPreviewVector3;
}

export interface ModelPreviewLightRig {
  readonly environmentIntensity: number;
  readonly lights: readonly ModelPreviewLightEntry[];
}

export interface ModelPreviewCaptureSettings {
  readonly width: number;
  readonly height: number;
}

export interface ModelPreviewStagingState extends ModelPreviewIdentity {
  readonly schemaVersion: typeof MODEL_PREVIEW_STAGING_SCHEMA_VERSION;
  readonly selectedNodePath?: string;
  readonly transformPatches: readonly ModelPreviewTransformPatch[];
  readonly cameraPresets: readonly ModelPreviewCameraPreset[];
  readonly activeCameraId: string;
  readonly lightRig: ModelPreviewLightRig;
  readonly background: string;
  readonly capture: ModelPreviewCaptureSettings;
}

export interface ModelPreviewBounds {
  readonly min: ModelPreviewVector3;
  readonly max: ModelPreviewVector3;
  readonly center: ModelPreviewVector3;
  readonly size: ModelPreviewVector3;
  readonly radius: number;
}

export interface NormalizedModelFacts {
  readonly bounds: ModelPreviewBounds;
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly animationCount: number;
}

export interface ModelPreviewSourceDescriptor {
  readonly protocolVersion: typeof MODEL_PREVIEW_PROTOCOL_VERSION;
  readonly source: ResourceRef;
  readonly sourceFingerprint: string;
  readonly format: ModelPreviewFormat;
  readonly entryUri: string;
  readonly uriMap: Readonly<Record<string, string>>;
  readonly sizeBytes: number;
}

export interface ModelPreviewCaptureMetadata extends ModelPreviewIdentity {
  readonly mimeType: 'image/png';
  readonly width: number;
  readonly height: number;
  readonly cameraId: string;
}

export interface ModelPreviewCaptureResult {
  readonly metadata: ModelPreviewCaptureMetadata;
  readonly dataUrl: string;
  readonly staging: ModelPreviewStagingState;
  readonly facts: NormalizedModelFacts;
}

export interface ModelPreviewContextData {
  readonly contractVersion: typeof MODEL_PREVIEW_CONTEXT_VERSION;
  readonly source: ResourceRef;
  readonly sourceFingerprint: string;
  readonly format: ModelPreviewFormat;
  readonly facts: NormalizedModelFacts;
  readonly staging: ModelPreviewStagingState;
  readonly previewImage: ResourceRef;
  readonly capture: ModelPreviewCaptureMetadata;
}

export type ModelPreviewDiagnosticCode =
  | 'unsupported-format'
  | 'source-missing'
  | 'source-unauthorized'
  | 'source-too-large'
  | 'mime-mismatch'
  | 'unsafe-dependency'
  | 'missing-dependency'
  | 'dependency-limit-exceeded'
  | 'protocol-mismatch'
  | 'session-mismatch'
  | 'stale-revision'
  | 'stale-state'
  | 'load-failed'
  | 'empty-model'
  | 'renderer-unavailable'
  | 'renderer-lost'
  | 'capture-invalid'
  | 'capture-failed'
  | 'context-invalid'
  | 'agent-unavailable'
  | 'agent-rejected'
  | 'disposed';

export interface ModelPreviewDiagnostic {
  readonly code: ModelPreviewDiagnosticCode;
  readonly message: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly identity?: Partial<ModelPreviewIdentity>;
  readonly detail?: string;
}

export type ModelPreviewExtensionMessage =
  | {
      readonly type: 'model-preview/load';
      readonly source: ModelPreviewSourceDescriptor;
      readonly staging: ModelPreviewStagingState;
    }
  | {
      readonly type: 'model-preview/capture-requested';
      readonly requestId: string;
      readonly identity: ModelPreviewIdentity;
      readonly settings: ModelPreviewCaptureSettings;
    }
  | {
      readonly type: 'model-preview/send-succeeded';
      readonly identity: ModelPreviewIdentity;
    }
  | {
      readonly type: 'model-preview/diagnostic';
      readonly diagnostic: ModelPreviewDiagnostic;
    };

export type ModelPreviewWebviewMessage =
  | {
      readonly type: 'model-preview/ready';
      readonly protocolVersion: typeof MODEL_PREVIEW_PROTOCOL_VERSION;
      readonly sessionId: string;
    }
  | {
      readonly type: 'model-preview/load-completed';
      readonly identity: ModelPreviewIdentity;
      readonly facts: NormalizedModelFacts;
    }
  | {
      readonly type: 'model-preview/state-changed';
      readonly staging: ModelPreviewStagingState;
    }
  | {
      readonly type: 'model-preview/capture-completed';
      readonly requestId: string;
      readonly capture: ModelPreviewCaptureResult;
    }
  | {
      readonly type: 'model-preview/send-requested';
      readonly identity: ModelPreviewIdentity;
    }
  | {
      readonly type: 'model-preview/diagnostic';
      readonly diagnostic: ModelPreviewDiagnostic;
    };

export function isModelPreviewFormat(value: unknown): value is ModelPreviewFormat {
  return typeof value === 'string' && MODEL_PREVIEW_FORMATS.some((format) => format === value);
}

export function isModelPreviewContextData(value: unknown): value is ModelPreviewContextData {
  if (!isRecord(value)) return false;
  if (
    value['contractVersion'] !== MODEL_PREVIEW_CONTEXT_VERSION ||
    !isResourceRef(value['source']) ||
    !isNonEmptyString(value['sourceFingerprint']) ||
    !isModelPreviewFormat(value['format']) ||
    !isNormalizedModelFacts(value['facts']) ||
    !isModelPreviewStagingState(value['staging']) ||
    !isResourceRef(value['previewImage']) ||
    !isModelPreviewCaptureMetadata(value['capture'])
  ) {
    return false;
  }
  const staging = value['staging'];
  const capture = value['capture'];
  return (
    staging.sourceFingerprint === value['sourceFingerprint'] &&
    capture.sourceFingerprint === value['sourceFingerprint'] &&
    capture.sessionId === staging.sessionId &&
    capture.revision === staging.revision &&
    capture.cameraId === staging.activeCameraId
  );
}

export function isModelPreviewIdentity(value: unknown): value is ModelPreviewIdentity {
  return isRecord(value) && isIdentity(value);
}

export function isModelPreviewCaptureResult(value: unknown): value is ModelPreviewCaptureResult {
  return (
    isRecord(value) &&
    isModelPreviewCaptureMetadata(value['metadata']) &&
    typeof value['dataUrl'] === 'string' &&
    value['dataUrl'].startsWith('data:image/png;base64,') &&
    isModelPreviewStagingState(value['staging']) &&
    isNormalizedModelFacts(value['facts']) &&
    value['metadata'].sessionId === value['staging'].sessionId &&
    value['metadata'].sourceFingerprint === value['staging'].sourceFingerprint &&
    value['metadata'].revision === value['staging'].revision
  );
}

export function isModelPreviewStagingState(value: unknown): value is ModelPreviewStagingState {
  if (!isRecord(value)) return false;
  return (
    value['schemaVersion'] === MODEL_PREVIEW_STAGING_SCHEMA_VERSION &&
    isIdentity(value) &&
    optionalNonEmptyString(value['selectedNodePath']) &&
    isArrayOf(value['transformPatches'], isTransformPatch) &&
    isArrayOf(value['cameraPresets'], isCameraPreset) &&
    value['cameraPresets'].length > 0 &&
    isNonEmptyString(value['activeCameraId']) &&
    value['cameraPresets'].some((camera) => camera.id === value['activeCameraId']) &&
    isLightRig(value['lightRig']) &&
    isNonEmptyString(value['background']) &&
    isCaptureSettings(value['capture'])
  );
}

export function isNormalizedModelFacts(value: unknown): value is NormalizedModelFacts {
  if (!isRecord(value) || !isBounds(value['bounds'])) return false;
  return (
    isNonNegativeInteger(value['nodeCount']) &&
    isNonNegativeInteger(value['meshCount']) &&
    isNonNegativeInteger(value['materialCount']) &&
    isNonNegativeInteger(value['animationCount'])
  );
}

function isModelPreviewCaptureMetadata(value: unknown): value is ModelPreviewCaptureMetadata {
  return (
    isRecord(value) &&
    isIdentity(value) &&
    value['mimeType'] === 'image/png' &&
    isPositiveInteger(value['width']) &&
    isPositiveInteger(value['height']) &&
    isNonEmptyString(value['cameraId'])
  );
}

function isIdentity(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value['sessionId']) &&
    isNonEmptyString(value['sourceFingerprint']) &&
    isNonNegativeInteger(value['revision'])
  );
}

function isTransformPatch(value: unknown): value is ModelPreviewTransformPatch {
  return isRecord(value) && isNonEmptyString(value['nodePath']) && isTransform(value['transform']);
}

function isTransform(value: unknown): value is ModelPreviewTransform {
  return (
    isRecord(value) &&
    isVector3(value['position']) &&
    isEuler(value['rotation']) &&
    isVector3(value['scale'])
  );
}

function isCameraPreset(value: unknown): value is ModelPreviewCameraPreset {
  return (
    isRecord(value) &&
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['label']) &&
    isVector3(value['position']) &&
    isVector3(value['target']) &&
    isFiniteNumber(value['fieldOfViewDeg']) &&
    value['fieldOfViewDeg'] >= 10 &&
    value['fieldOfViewDeg'] <= 120
  );
}

function isLightRig(value: unknown): value is ModelPreviewLightRig {
  if (!isRecord(value) || !isFiniteNumber(value['environmentIntensity'])) return false;
  if (value['environmentIntensity'] < 0 || value['environmentIntensity'] > 10) return false;
  if (!isArrayOf(value['lights'], isLightEntry) || value['lights'].length !== 3) return false;
  return new Set(value['lights'].map((light) => light.id)).size === 3;
}

function isLightEntry(value: unknown): value is ModelPreviewLightEntry {
  return (
    isRecord(value) &&
    (value['id'] === 'key' || value['id'] === 'fill' || value['id'] === 'rim') &&
    isNonEmptyString(value['color']) &&
    isFiniteNumber(value['intensity']) &&
    value['intensity'] >= 0 &&
    value['intensity'] <= 20 &&
    isVector3(value['position'])
  );
}

function isCaptureSettings(value: unknown): value is ModelPreviewCaptureSettings {
  return isRecord(value) && isPositiveInteger(value['width']) && isPositiveInteger(value['height']);
}

function isBounds(value: unknown): value is ModelPreviewBounds {
  return (
    isRecord(value) &&
    isVector3(value['min']) &&
    isVector3(value['max']) &&
    isVector3(value['center']) &&
    isVector3(value['size']) &&
    isFiniteNumber(value['radius']) &&
    value['radius'] >= 0
  );
}

function isVector3(value: unknown): value is ModelPreviewVector3 {
  return (
    isRecord(value) &&
    isFiniteNumber(value['x']) &&
    isFiniteNumber(value['y']) &&
    isFiniteNumber(value['z'])
  );
}

function isEuler(value: unknown): value is ModelPreviewEuler {
  return (
    isRecord(value) &&
    isFiniteNumber(value['x']) &&
    isFiniteNumber(value['y']) &&
    isFiniteNumber(value['z']) &&
    value['order'] === 'XYZ'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function optionalNonEmptyString(value: unknown): boolean {
  return value === undefined || isNonEmptyString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value > 0;
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every((item) => guard(item));
}
