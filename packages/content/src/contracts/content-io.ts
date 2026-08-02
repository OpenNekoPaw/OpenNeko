import {
  isContentLocator,
  type ContentFingerprint,
  type ContentLocator,
  type WorkspaceFileContentLocator,
} from './content-locator';

export interface ContentReadRange {
  readonly offset: number;
  readonly length: number;
}

export interface ContentReadOptions {
  readonly range?: ContentReadRange;
  readonly maxBytes?: number;
  readonly expectedFingerprint?: ContentFingerprint;
  readonly signal?: AbortSignal;
}

export type ContentIoDiagnosticCode =
  | 'content-allocation-failed'
  | 'content-cancelled'
  | 'content-changed'
  | 'content-conflict'
  | 'content-missing'
  | 'content-projection-failed'
  | 'content-range-invalid'
  | 'content-read-failed'
  | 'content-too-large'
  | 'content-unauthorized'
  | 'content-unsupported'
  | 'content-write-failed';

export interface ContentIoDiagnostic {
  readonly code: ContentIoDiagnosticCode;
}

export type ContentStat =
  | {
      readonly status: 'ready';
      readonly locator: ContentLocator;
      readonly byteLength: number;
      readonly mimeType?: string;
      readonly fingerprint: ContentFingerprint;
      readonly modifiedAt?: string;
    }
  | {
      readonly status: 'unavailable';
      readonly locator: ContentLocator;
      readonly diagnostic: ContentIoDiagnostic;
    };

export type ContentBytes =
  | {
      readonly status: 'ready';
      readonly locator: ContentLocator;
      readonly bytes: Uint8Array;
      readonly offset: number;
      readonly totalByteLength?: number;
      readonly mimeType?: string;
      readonly fingerprint: ContentFingerprint;
    }
  | {
      readonly status: 'unavailable';
      readonly locator: ContentLocator;
      readonly diagnostic: ContentIoDiagnostic;
    };

export interface ContentReadService {
  stat(locator: ContentLocator, options?: ContentReadOptions): Promise<ContentStat>;
  read(locator: ContentLocator, options?: ContentReadOptions): Promise<ContentBytes>;
}

export interface ContentProjectionOptions {
  readonly expectedFingerprint?: ContentFingerprint;
  readonly signal?: AbortSignal;
}

export type WebviewContentProjection =
  | {
      readonly status: 'ready';
      readonly kind: 'webview';
      readonly locator: ContentLocator;
      readonly uri: string;
    }
  | ContentUnavailableProjection;

export type EngineContentProjection =
  | {
      readonly status: 'ready';
      readonly kind: 'engine';
      readonly locator: ContentLocator;
      readonly token: string;
    }
  | ContentUnavailableProjection;

export type ProcessorContentProjection =
  | {
      readonly status: 'ready';
      readonly kind: 'processor';
      readonly locator: ContentLocator;
      readonly handle: string;
    }
  | ContentUnavailableProjection;

export interface WebviewContentProjectionPort {
  project(
    locator: ContentLocator,
    options?: ContentProjectionOptions,
  ): Promise<WebviewContentProjection>;
}

export interface EngineContentProjectionPort {
  project(
    locator: ContentLocator,
    options?: ContentProjectionOptions,
  ): Promise<EngineContentProjection>;
}

export interface ProcessorContentProjectionPort {
  project(
    locator: ContentLocator,
    options?: ContentProjectionOptions,
  ): Promise<ProcessorContentProjection>;
}

export interface AuthorizedWorkspaceWriteOptions {
  readonly conflict: 'fail-if-exists' | 'replace';
  readonly expectedFingerprint?: ContentFingerprint;
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
}

export type AuthorizedWorkspaceWriteResult =
  | {
      readonly status: 'written';
      readonly locator: WorkspaceFileContentLocator;
      readonly byteLength: number;
      readonly fingerprint?: ContentFingerprint;
    }
  | {
      readonly status: 'unavailable';
      readonly locator: WorkspaceFileContentLocator;
      readonly diagnostic: ContentIoDiagnostic;
    };

export interface AuthorizedWorkspaceWriter {
  write(
    locator: WorkspaceFileContentLocator,
    bytes: Uint8Array,
    options: AuthorizedWorkspaceWriteOptions,
  ): Promise<AuthorizedWorkspaceWriteResult>;
}

export interface AuthorizedWorkspaceDeleteOptions {
  readonly expectedFingerprint: ContentFingerprint;
  readonly signal?: AbortSignal;
}

export type AuthorizedWorkspaceDeleteResult =
  | {
      readonly status: 'deleted';
      readonly locator: WorkspaceFileContentLocator;
    }
  | {
      readonly status: 'unavailable';
      readonly locator: WorkspaceFileContentLocator;
      readonly diagnostic: ContentIoDiagnostic;
    };

export interface AuthorizedWorkspaceDeleter {
  delete(
    locator: WorkspaceFileContentLocator,
    options: AuthorizedWorkspaceDeleteOptions,
  ): Promise<AuthorizedWorkspaceDeleteResult>;
}

export interface AuthorizedOutputAllocationRequest {
  readonly fileNameHint?: string;
  readonly mediaType?: string;
  readonly signal?: AbortSignal;
}

export type AuthorizedOutputAllocationResult =
  | {
      readonly status: 'allocated';
      readonly locator: WorkspaceFileContentLocator;
    }
  | {
      readonly status: 'unavailable';
      readonly diagnostic: ContentIoDiagnostic;
    };

export interface AuthorizedOutputAllocator {
  allocate(request: AuthorizedOutputAllocationRequest): Promise<AuthorizedOutputAllocationResult>;
}

export type ContentIoContractErrorCode =
  | 'invalid-content-locator'
  | 'invalid-content-allocation-request'
  | 'invalid-content-read-options'
  | 'invalid-content-projection-options'
  | 'invalid-content-delete-options'
  | 'invalid-content-write-options'
  | 'invalid-content-handler-result';

export class ContentIoContractError extends Error {
  constructor(
    readonly code: ContentIoContractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ContentIoContractError';
  }
}

export function assertContentLocator(value: unknown): ContentLocator {
  if (!isContentLocator(value)) {
    throw new ContentIoContractError('invalid-content-locator', 'Content locator is invalid.');
  }
  return value;
}

export function assertContentReadOptions(value: unknown): ContentReadOptions {
  if (!isContentReadOptions(value)) {
    throw new ContentIoContractError(
      'invalid-content-read-options',
      'Content read options are invalid.',
    );
  }
  return value;
}

export function isContentReadOptions(value: unknown): value is ContentReadOptions {
  if (!isRecord(value) || !hasOnlyKeys(value, READ_OPTION_KEYS)) return false;
  return (
    (value['range'] === undefined || isContentReadRange(value['range'])) &&
    (value['maxBytes'] === undefined || isPositiveInteger(value['maxBytes'])) &&
    (value['expectedFingerprint'] === undefined ||
      isContentFingerprint(value['expectedFingerprint'])) &&
    (value['signal'] === undefined || isAbortSignal(value['signal']))
  );
}

export function isContentStat(value: unknown): value is ContentStat {
  if (!isRecord(value) || !isContentLocator(value['locator'])) return false;
  if (value['status'] === 'unavailable') {
    return (
      hasOnlyKeys(value, UNAVAILABLE_RESULT_KEYS) && isContentIoDiagnostic(value['diagnostic'])
    );
  }
  return (
    value['status'] === 'ready' &&
    hasOnlyKeys(value, STAT_RESULT_KEYS) &&
    isNonNegativeInteger(value['byteLength']) &&
    (value['mimeType'] === undefined || isNonEmptyString(value['mimeType'])) &&
    isContentFingerprint(value['fingerprint']) &&
    (value['modifiedAt'] === undefined || isIsoTimestamp(value['modifiedAt']))
  );
}

export function isContentBytes(value: unknown): value is ContentBytes {
  if (!isRecord(value) || !isContentLocator(value['locator'])) return false;
  if (value['status'] === 'unavailable') {
    return (
      hasOnlyKeys(value, UNAVAILABLE_RESULT_KEYS) && isContentIoDiagnostic(value['diagnostic'])
    );
  }
  return (
    value['status'] === 'ready' &&
    hasOnlyKeys(value, BYTES_RESULT_KEYS) &&
    value['bytes'] instanceof Uint8Array &&
    isNonNegativeInteger(value['offset']) &&
    (value['totalByteLength'] === undefined ||
      (isNonNegativeInteger(value['totalByteLength']) &&
        value['totalByteLength'] >= value['offset'] + value['bytes'].byteLength)) &&
    (value['mimeType'] === undefined || isNonEmptyString(value['mimeType'])) &&
    isContentFingerprint(value['fingerprint'])
  );
}

export function isContentIoDiagnostic(value: unknown): value is ContentIoDiagnostic {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, DIAGNOSTIC_KEYS) &&
    CONTENT_IO_DIAGNOSTIC_CODES.some((code) => code === value['code'])
  );
}

export function isContentProjectionOptions(value: unknown): value is ContentProjectionOptions {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, PROJECTION_OPTION_KEYS) &&
    (value['expectedFingerprint'] === undefined ||
      isContentFingerprint(value['expectedFingerprint'])) &&
    (value['signal'] === undefined || isAbortSignal(value['signal']))
  );
}

export function isAuthorizedWorkspaceWriteOptions(
  value: unknown,
): value is AuthorizedWorkspaceWriteOptions {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, WRITE_OPTION_KEYS) &&
    (value['conflict'] === 'fail-if-exists' || value['conflict'] === 'replace') &&
    (value['expectedFingerprint'] === undefined ||
      isContentFingerprint(value['expectedFingerprint'])) &&
    (value['maxBytes'] === undefined || isPositiveInteger(value['maxBytes'])) &&
    (value['signal'] === undefined || isAbortSignal(value['signal']))
  );
}

export function isAuthorizedWorkspaceDeleteOptions(
  value: unknown,
): value is AuthorizedWorkspaceDeleteOptions {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, DELETE_OPTION_KEYS) &&
    isContentFingerprint(value['expectedFingerprint']) &&
    (value['signal'] === undefined || isAbortSignal(value['signal']))
  );
}

export function isAuthorizedOutputAllocationRequest(
  value: unknown,
): value is AuthorizedOutputAllocationRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ALLOCATION_REQUEST_KEYS) &&
    (value['fileNameHint'] === undefined || isNonEmptyString(value['fileNameHint'])) &&
    (value['mediaType'] === undefined || isNonEmptyString(value['mediaType'])) &&
    (value['signal'] === undefined || isAbortSignal(value['signal']))
  );
}

interface ContentUnavailableProjection {
  readonly status: 'unavailable';
  readonly locator: ContentLocator;
  readonly diagnostic: ContentIoDiagnostic;
}

const READ_OPTION_KEYS = ['range', 'maxBytes', 'expectedFingerprint', 'signal'] as const;
const PROJECTION_OPTION_KEYS = ['expectedFingerprint', 'signal'] as const;
const WRITE_OPTION_KEYS = ['conflict', 'expectedFingerprint', 'maxBytes', 'signal'] as const;
const DELETE_OPTION_KEYS = ['expectedFingerprint', 'signal'] as const;
const ALLOCATION_REQUEST_KEYS = ['fileNameHint', 'mediaType', 'signal'] as const;
const FINGERPRINT_KEYS = ['strategy', 'value'] as const;
const RANGE_KEYS = ['offset', 'length'] as const;
const DIAGNOSTIC_KEYS = ['code'] as const;
const UNAVAILABLE_RESULT_KEYS = ['status', 'locator', 'diagnostic'] as const;
const STAT_RESULT_KEYS = [
  'status',
  'locator',
  'byteLength',
  'mimeType',
  'fingerprint',
  'modifiedAt',
] as const;
const BYTES_RESULT_KEYS = [
  'status',
  'locator',
  'bytes',
  'offset',
  'totalByteLength',
  'mimeType',
  'fingerprint',
] as const;
const CONTENT_IO_DIAGNOSTIC_CODES: readonly ContentIoDiagnosticCode[] = [
  'content-allocation-failed',
  'content-cancelled',
  'content-changed',
  'content-conflict',
  'content-missing',
  'content-projection-failed',
  'content-range-invalid',
  'content-read-failed',
  'content-too-large',
  'content-unauthorized',
  'content-unsupported',
  'content-write-failed',
] as const;

function isContentReadRange(value: unknown): value is ContentReadRange {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, RANGE_KEYS) &&
    isNonNegativeInteger(value['offset']) &&
    isPositiveInteger(value['length'])
  );
}

export function isContentFingerprint(value: unknown): value is ContentFingerprint {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, FINGERPRINT_KEYS) &&
    (value['strategy'] === 'sha256' ||
      value['strategy'] === 'mtime-size' ||
      value['strategy'] === 'provider') &&
    typeof value['value'] === 'string' &&
    value['value'].trim().length > 0
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    isRecord(value) &&
    typeof value['aborted'] === 'boolean' &&
    typeof value['addEventListener'] === 'function'
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
