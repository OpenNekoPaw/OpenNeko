import {
  isContentAccessIntent,
  isWebviewLikeRuntimeValue,
  type ContentAccessDiagnostic,
  type ContentAccessIntent,
  type ContentAccessStatus,
  type ContentAccessTarget,
} from './content-access';
import {
  isResourceRef,
  isResourceVariantRole,
  type ResourceRef,
  type ResourceVariantRole,
} from './resource-cache';

export interface NarrativeRelativePathAssetRef {
  readonly kind: 'relative-path';
  readonly path: string;
}

export type NarrativeAssetRef = ResourceRef | NarrativeRelativePathAssetRef;

export type NarrativeAssetValidationCode =
  | 'narrative-asset-invalid-ref'
  | 'narrative-asset-runtime-ref'
  | 'narrative-asset-absolute-path'
  | 'narrative-asset-empty-path';

export interface NarrativeAssetValidationDiagnostic {
  readonly code: NarrativeAssetValidationCode;
  readonly message: string;
  readonly path?: string;
}

export interface NarrativeAssetResolveOptions {
  readonly target?: ContentAccessTarget;
  readonly role?: ResourceVariantRole;
  readonly signal?: AbortSignal;
  readonly metadata?: Record<string, unknown>;
}

export interface NarrativeAssetResolveResult {
  readonly status: ContentAccessStatus;
  readonly ref: NarrativeAssetRef;
  readonly intent: ContentAccessIntent;
  readonly role?: ResourceVariantRole;
  readonly url?: string;
  readonly path?: string;
  readonly mimeType?: string;
  readonly diagnostics?: readonly ContentAccessDiagnostic[];
}

export interface NarrativeAssetResolver {
  resolve(
    ref: NarrativeAssetRef,
    intent: ContentAccessIntent,
    options?: NarrativeAssetResolveOptions,
  ): Promise<NarrativeAssetResolveResult>;
}

export function createNarrativeRelativePathAssetRef(path: string): NarrativeRelativePathAssetRef {
  return { kind: 'relative-path', path };
}

export function isNarrativeRelativePathAssetRef(
  value: unknown,
): value is NarrativeRelativePathAssetRef {
  return isRecord(value) && value['kind'] === 'relative-path' && typeof value['path'] === 'string';
}

export function isNarrativeAssetRef(value: unknown): value is NarrativeAssetRef {
  return isResourceRef(value) || isNarrativeRelativePathAssetRef(value);
}

export function validateNarrativeAssetRef(
  value: unknown,
): readonly NarrativeAssetValidationDiagnostic[] {
  if (isResourceRef(value)) {
    return [];
  }

  if (!isNarrativeRelativePathAssetRef(value)) {
    return [
      {
        code: 'narrative-asset-invalid-ref',
        message: 'Narrative assets must use ResourceRef or relative-path references.',
      },
    ];
  }

  const diagnostics: NarrativeAssetValidationDiagnostic[] = [];
  const path = value.path.trim();

  if (!path) {
    diagnostics.push({
      code: 'narrative-asset-empty-path',
      message: 'Narrative relative asset paths must not be empty.',
      path: value.path,
    });
  }

  if (isWebviewLikeRuntimeValue(path)) {
    diagnostics.push({
      code: 'narrative-asset-runtime-ref',
      message: 'Narrative asset refs must not persist runtime URLs or handles.',
      path: value.path,
    });
  }

  if (isAbsoluteLocalPath(path)) {
    diagnostics.push({
      code: 'narrative-asset-absolute-path',
      message: 'Narrative asset refs must use project-relative or ResourceRef identity.',
      path: value.path,
    });
  }

  return diagnostics;
}

export function isNarrativeAssetAccessIntent(value: unknown): value is ContentAccessIntent {
  return isContentAccessIntent(value);
}

export function isNarrativeAssetResolveOptions(
  value: unknown,
): value is NarrativeAssetResolveOptions {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (
    (value['target'] === undefined || typeof value['target'] === 'string') &&
    (value['role'] === undefined || isResourceVariantRole(value['role'])) &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

function isAbsoluteLocalPath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
