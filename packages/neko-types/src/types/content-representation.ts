import { isContentLocator, type ContentLocator } from './content-locator';

export const CONTENT_REPRESENTATION_KINDS = [
  'thumbnail',
  'proxy',
  'preview',
  'waveform',
  'loudness',
  'raster-page',
  'fov-crop',
  'semantic-sidecar',
] as const;

export type ContentRepresentationKind = (typeof CONTENT_REPRESENTATION_KINDS)[number];

export type ContentImageFormat = 'png' | 'jpeg' | 'webp';

export type ContentRepresentationSpec =
  | {
      readonly kind: 'thumbnail' | 'preview';
      readonly maxWidth?: number;
      readonly maxHeight?: number;
      readonly format?: ContentImageFormat;
    }
  | {
      readonly kind: 'proxy';
      readonly profile: string;
    }
  | {
      readonly kind: 'waveform';
      readonly width?: number;
      readonly height?: number;
    }
  | {
      readonly kind: 'loudness';
      readonly standard: 'ebu-r128' | 'peak';
      readonly targetLufs?: number;
    }
  | {
      readonly kind: 'raster-page';
      readonly page: number;
      readonly scale?: number;
      readonly format?: ContentImageFormat;
    }
  | {
      readonly kind: 'fov-crop';
      readonly yaw: number;
      readonly pitch: number;
      readonly horizontalFov: number;
      readonly width: number;
      readonly height: number;
      readonly format?: ContentImageFormat;
    }
  | {
      readonly kind: 'semantic-sidecar';
      readonly modality: 'ocr' | 'asr' | 'embedding' | 'vision';
      readonly profile: string;
    };

export interface ContentRepresentationRequest {
  readonly source: ContentLocator;
  readonly spec: ContentRepresentationSpec;
  readonly expectedSourceFingerprint?: string;
  readonly signal?: AbortSignal;
}

export interface ContentRepresentationLocator {
  readonly kind: 'content-representation';
  readonly id: string;
  readonly representationKind: ContentRepresentationKind;
  readonly source: ContentLocator;
  readonly spec: ContentRepresentationSpec;
  readonly generatorId: string;
  readonly sourceFingerprint: string;
  readonly specFingerprint: string;
  readonly revision: string;
}

export interface ContentRepresentationMetadata {
  readonly mimeType?: string;
  readonly byteLength?: number;
  readonly width?: number;
  readonly height?: number;
  readonly durationSeconds?: number;
}

export type ContentRepresentationDiagnosticCode =
  | 'representation-cancelled'
  | 'representation-failed'
  | 'representation-missing'
  | 'representation-range-invalid'
  | 'representation-source-changed'
  | 'representation-source-missing'
  | 'representation-too-large'
  | 'representation-unauthorized'
  | 'representation-unsupported';

export interface ContentRepresentationDiagnostic {
  readonly code: ContentRepresentationDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
}

export type ContentRepresentationResult =
  | {
      readonly status: 'ready';
      readonly locator: ContentRepresentationLocator;
      readonly metadata: ContentRepresentationMetadata;
    }
  | {
      readonly status: 'unavailable';
      readonly diagnostic: ContentRepresentationDiagnostic;
    };

export interface ContentRepresentationReadRange {
  readonly offset: number;
  readonly length: number;
}

export interface ContentRepresentationReadOptions {
  readonly range?: ContentRepresentationReadRange;
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
}

export type ContentRepresentationBytes =
  | {
      readonly status: 'ready';
      readonly locator: ContentRepresentationLocator;
      readonly bytes: Uint8Array;
      readonly offset: number;
      readonly totalByteLength: number;
      readonly metadata: ContentRepresentationMetadata;
    }
  | {
      readonly status: 'unavailable';
      readonly locator: ContentRepresentationLocator;
      readonly diagnostic: ContentRepresentationDiagnostic;
    };

export interface ContentRepresentationService {
  getRepresentation(request: ContentRepresentationRequest): Promise<ContentRepresentationResult>;
  readRepresentation(
    locator: ContentRepresentationLocator,
    options?: ContentRepresentationReadOptions,
  ): Promise<ContentRepresentationBytes>;
}

export interface ContentRepresentationGeneratorInput {
  readonly source: ContentLocator;
  readonly spec: ContentRepresentationSpec;
  readonly signal?: AbortSignal;
}

export interface ContentRepresentationGeneratorResult {
  readonly bytes: Uint8Array;
  readonly metadata: ContentRepresentationMetadata;
}

export interface ContentRepresentationGenerator {
  readonly id: string;
  readonly revision: string;
  readonly kinds: readonly ContentRepresentationKind[];
  generate(
    input: ContentRepresentationGeneratorInput,
  ): Promise<ContentRepresentationGeneratorResult>;
}

export function isContentRepresentationLocator(
  value: unknown,
): value is ContentRepresentationLocator {
  if (!isRecord(value) || value['kind'] !== 'content-representation') return false;
  if (
    typeof value['id'] !== 'string' ||
    typeof value['generatorId'] !== 'string' ||
    typeof value['sourceFingerprint'] !== 'string' ||
    typeof value['specFingerprint'] !== 'string' ||
    typeof value['revision'] !== 'string' ||
    !isContentLocator(value['source']) ||
    !isContentRepresentationSpec(value['spec'])
  ) {
    return false;
  }
  return (
    value['representationKind'] === value['spec'].kind &&
    new Set<unknown>(CONTENT_REPRESENTATION_KINDS).has(value['representationKind'])
  );
}

export const PROCESSOR_OUTPUT_OWNERSHIPS = [
  'intermediate',
  'debug',
  'candidate',
  'promoted',
] as const;

export type ProcessorOutputOwnership = (typeof PROCESSOR_OUTPUT_OWNERSHIPS)[number];

export type ProcessorDurableTarget = 'generated-output' | 'package' | 'project' | 'export';

export interface ProcessorOutputLocator {
  readonly kind: 'processor-output';
  readonly id: string;
  readonly ownership: ProcessorOutputOwnership;
  readonly mediaType: string;
  readonly fingerprint?: string;
}

export interface ProcessorOutputAllocationRequest {
  readonly ownership: Exclude<ProcessorOutputOwnership, 'promoted'>;
  readonly mediaType: string;
  readonly fileNameHint?: string;
  readonly signal?: AbortSignal;
}

export interface ProcessorOutputPromotionRequest {
  readonly output: ProcessorOutputLocator;
  readonly target: ProcessorDurableTarget;
  readonly signal?: AbortSignal;
}

export interface ProcessorOutputPromotionResult {
  readonly status: 'promoted';
  readonly output: ProcessorOutputLocator & { readonly ownership: 'promoted' };
  readonly source: ContentLocator;
}

export interface ProcessorOutputAllocator {
  allocate(request: ProcessorOutputAllocationRequest): Promise<ProcessorOutputLocator>;
  promote(request: ProcessorOutputPromotionRequest): Promise<ProcessorOutputPromotionResult>;
}

export function isContentRepresentationSpec(value: unknown): value is ContentRepresentationSpec {
  if (!isRecord(value) || typeof value['kind'] !== 'string') return false;

  switch (value['kind']) {
    case 'thumbnail':
    case 'preview':
      return (
        isOptionalPositiveNumber(value['maxWidth']) &&
        isOptionalPositiveNumber(value['maxHeight']) &&
        isOptionalImageFormat(value['format'])
      );
    case 'proxy':
      return isNonEmptyString(value['profile']);
    case 'waveform':
      return isOptionalPositiveNumber(value['width']) && isOptionalPositiveNumber(value['height']);
    case 'loudness':
      return (
        (value['standard'] === 'ebu-r128' || value['standard'] === 'peak') &&
        (value['targetLufs'] === undefined || isFiniteNumber(value['targetLufs']))
      );
    case 'raster-page':
      return (
        isPositiveInteger(value['page']) &&
        isOptionalPositiveNumber(value['scale']) &&
        isOptionalImageFormat(value['format'])
      );
    case 'fov-crop':
      return (
        isFiniteNumber(value['yaw']) &&
        isFiniteNumber(value['pitch']) &&
        isPositiveNumber(value['horizontalFov']) &&
        isPositiveInteger(value['width']) &&
        isPositiveInteger(value['height']) &&
        isOptionalImageFormat(value['format'])
      );
    case 'semantic-sidecar':
      return (
        (value['modality'] === 'ocr' ||
          value['modality'] === 'asr' ||
          value['modality'] === 'embedding' ||
          value['modality'] === 'vision') &&
        isNonEmptyString(value['profile'])
      );
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isPositiveNumber(value) && Number.isInteger(value);
}

function isOptionalPositiveNumber(value: unknown): boolean {
  return value === undefined || isPositiveNumber(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalImageFormat(value: unknown): boolean {
  return value === undefined || value === 'png' || value === 'jpeg' || value === 'webp';
}
