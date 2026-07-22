import { validateContentLocator, type ContentLocator } from './content-locator';

export const MEDIA_LIBRARY_PROJECTION_CAPABILITIES = [
  'read',
  'preview',
  'bind',
  'copy',
  'delete',
] as const;

export type MediaLibraryProjectionCapability =
  (typeof MEDIA_LIBRARY_PROJECTION_CAPABILITIES)[number];

export type MediaLibraryProjectionAvailability = 'available' | 'unavailable';

export type MediaLibraryProjectionDiagnosticCode =
  'resource-missing' | 'resource-inaccessible' | 'resource-unsupported' | 'projection-stale';

export interface MediaLibraryProjectionDiagnostic {
  readonly code: MediaLibraryProjectionDiagnosticCode;
}

export interface MediaLibraryProjectionMetadata {
  readonly mediaType?: string;
  readonly byteLength?: number;
  readonly modifiedAt?: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationSeconds?: number;
}

/** Rebuildable Media Library view state keyed only by a canonical content locator. */
export interface MediaLibraryProjectionEntry {
  readonly locator: ContentLocator;
  readonly label: string;
  readonly description?: string;
  readonly availability: MediaLibraryProjectionAvailability;
  readonly diagnostic?: MediaLibraryProjectionDiagnostic;
  readonly capabilities: readonly MediaLibraryProjectionCapability[];
  readonly metadata?: MediaLibraryProjectionMetadata;
}

export function isMediaLibraryProjectionEntry(
  value: unknown,
): value is MediaLibraryProjectionEntry {
  if (!isRecord(value) || !hasOnlyKeys(value, ENTRY_KEYS)) return false;
  const locator = validateContentLocator(value['locator']);
  if (!locator.ok) return false;
  if (!isNonEmptyString(value['label'])) return false;
  if (value['description'] !== undefined && typeof value['description'] !== 'string') return false;
  if (value['availability'] !== 'available' && value['availability'] !== 'unavailable') {
    return false;
  }
  if (!isCapabilities(value['capabilities'])) return false;
  if (value['metadata'] !== undefined && !isProjectionMetadata(value['metadata'])) return false;
  if (value['diagnostic'] !== undefined && !isProjectionDiagnostic(value['diagnostic'])) {
    return false;
  }
  return value['availability'] === 'unavailable'
    ? value['diagnostic'] !== undefined
    : value['diagnostic'] === undefined;
}

function isProjectionDiagnostic(value: unknown): value is MediaLibraryProjectionDiagnostic {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, DIAGNOSTIC_KEYS) &&
    (value['code'] === 'resource-missing' ||
      value['code'] === 'resource-inaccessible' ||
      value['code'] === 'resource-unsupported' ||
      value['code'] === 'projection-stale')
  );
}

function isProjectionMetadata(value: unknown): value is MediaLibraryProjectionMetadata {
  if (!isRecord(value) || !hasOnlyKeys(value, METADATA_KEYS)) return false;
  return (
    isOptionalNonEmptyString(value['mediaType']) &&
    isOptionalNonNegativeNumber(value['byteLength']) &&
    isOptionalNonEmptyString(value['modifiedAt']) &&
    isOptionalNonNegativeNumber(value['width']) &&
    isOptionalNonNegativeNumber(value['height']) &&
    isOptionalNonNegativeNumber(value['durationSeconds'])
  );
}

function isCapabilities(value: unknown): value is readonly MediaLibraryProjectionCapability[] {
  if (!Array.isArray(value)) return false;
  const capabilities = value.filter(isMediaLibraryProjectionCapability);
  return capabilities.length === value.length && new Set(capabilities).size === value.length;
}

function isMediaLibraryProjectionCapability(
  value: unknown,
): value is MediaLibraryProjectionCapability {
  return (
    value === 'read' ||
    value === 'preview' ||
    value === 'bind' ||
    value === 'copy' ||
    value === 'delete'
  );
}

const ENTRY_KEYS = [
  'locator',
  'label',
  'description',
  'availability',
  'diagnostic',
  'capabilities',
  'metadata',
] as const;
const DIAGNOSTIC_KEYS = ['code'] as const;
const METADATA_KEYS = [
  'mediaType',
  'byteLength',
  'modifiedAt',
  'width',
  'height',
  'durationSeconds',
] as const;

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalNonEmptyString(value: unknown): boolean {
  return value === undefined || isNonEmptyString(value);
}

function isOptionalNonNegativeNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}
