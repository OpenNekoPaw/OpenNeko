import type { JobRef } from '@neko/shared/job-lifecycle';
import { isCanvasMaterialGenerationContext, type CanvasMaterialGenerationContext } from './canvas';
import {
  validateContentLocator,
  type ContentLocator,
  type GeneratedOutputContentLocator,
} from '@neko/content';
import { isEntityRepresentationRole, type EntityRepresentationRole } from '@neko/entity-domain';

export const CANVAS_MATERIAL_ORIGINS = ['referenced', 'generated'] as const;
export const CANVAS_MATERIAL_MEDIA_KINDS = [
  'image',
  'audio',
  'video',
  'document',
  'model',
  'other',
] as const;
export const CANVAS_MATERIAL_ACTION_EFFECTS = [
  'read',
  'derive',
  'copy',
  'handoff',
  'generate',
] as const;
export const CANVAS_MATERIAL_IMPORT_CONFLICT_POLICIES = ['reject', 'rename', 'replace'] as const;
export const CANVAS_MEDIA_LIBRARY_COPY_CONFLICT_POLICIES = ['fail-if-exists', 'replace'] as const;

export type CanvasMaterialOrigin = (typeof CANVAS_MATERIAL_ORIGINS)[number];
export type CanvasMaterialMediaKind = (typeof CANVAS_MATERIAL_MEDIA_KINDS)[number];
export type CanvasMaterialActionEffect = (typeof CANVAS_MATERIAL_ACTION_EFFECTS)[number];
export type CanvasMaterialImportConflictPolicy =
  (typeof CANVAS_MATERIAL_IMPORT_CONFLICT_POLICIES)[number];
export type CanvasMediaLibraryCopyConflictPolicy =
  (typeof CANVAS_MEDIA_LIBRARY_COPY_CONFLICT_POLICIES)[number];
export type CanvasGenerationJobRef = JobRef<'generation'>;
export type CanvasReferencedContentLocator = Exclude<ContentLocator, GeneratedOutputContentLocator>;

/**
 * Immutable creator-facing evidence for a generated result.
 * Generation remains the recipe and Job lifecycle authority.
 */
export interface CanvasGenerationEvidence {
  readonly jobRef: CanvasGenerationJobRef;
  readonly summary: CanvasMaterialGenerationContext;
}

/**
 * Entity identity is retained separately from the representation ContentLocator.
 */
export interface CanvasEntityRepresentationEvidence {
  readonly entityId: string;
  readonly bindingId: string;
  readonly role: EntityRepresentationRole;
}

export interface CanvasMaterialAuthoringIdentity {
  readonly projectId: string;
  readonly canvasId: string;
  readonly canvasSessionId: string;
}

export interface CanvasMaterialPosition {
  readonly x: number;
  readonly y: number;
}

interface CanvasMediaLibraryCopyRequestBase {
  readonly identity: CanvasMaterialAuthoringIdentity;
  readonly source: ContentLocator;
  readonly destinationDirectory: string;
  readonly fileName: string;
  readonly conflictPolicy: CanvasMediaLibraryCopyConflictPolicy;
}

/**
 * Explicit copy into a Media Library already linked to the active project.
 * The source Canvas material identity remains unchanged.
 */
export interface CanvasProjectMediaLibraryCopyRequest extends CanvasMediaLibraryCopyRequestBase {
  readonly kind: 'copy-to-project-media-library';
  readonly libraryName: string;
}

/**
 * Explicit copy into a Desktop-global Media Library connection.
 * The returned global entry identity must never replace the Canvas locator.
 */
export interface CanvasGlobalMediaLibraryCopyRequest extends CanvasMediaLibraryCopyRequestBase {
  readonly kind: 'copy-to-global-media-library';
  readonly globalLibraryId: string;
}

export type CanvasMediaLibraryCopyRequest =
  CanvasProjectMediaLibraryCopyRequest | CanvasGlobalMediaLibraryCopyRequest;

interface CanvasMaterialAuthoringRequestBase {
  readonly identity: CanvasMaterialAuthoringIdentity;
  readonly position?: CanvasMaterialPosition;
}

export type CanvasMaterialAuthoringRequest =
  | (CanvasMaterialAuthoringRequestBase & {
      readonly kind: 'direct-reference';
      readonly locator: CanvasReferencedContentLocator;
      readonly mediaKind: CanvasMaterialMediaKind;
      readonly title?: string;
      readonly entity?: CanvasEntityRepresentationEvidence;
    })
  | (CanvasMaterialAuthoringRequestBase & {
      readonly kind: 'entity-representation-replace';
      readonly nodeId: string;
      readonly expectedEntity: CanvasEntityRepresentationEvidence;
      readonly locator: CanvasReferencedContentLocator;
      readonly mediaKind: CanvasMaterialMediaKind;
      readonly title: string;
      readonly entity: CanvasEntityRepresentationEvidence;
    })
  | (CanvasMaterialAuthoringRequestBase & {
      readonly kind: 'external-import';
      /** Opaque Host-issued selection token. Raw absolute paths are not accepted. */
      readonly sourceToken: string;
      readonly sourceName: string;
      readonly mediaKind: CanvasMaterialMediaKind;
      readonly conflictPolicy: CanvasMaterialImportConflictPolicy;
    })
  | {
      readonly kind: 'global-library-link';
      readonly identity: CanvasMaterialAuthoringIdentity;
      readonly globalLibraryId: string;
    }
  | (CanvasMaterialAuthoringRequestBase & {
      readonly kind: 'global-library-copy';
      readonly globalLibraryId: string;
      readonly entryId: string;
      readonly mediaKind: CanvasMaterialMediaKind;
      readonly conflictPolicy: CanvasMaterialImportConflictPolicy;
    })
  | (CanvasMaterialAuthoringRequestBase & {
      readonly kind: 'generated-output-commit';
      readonly locator: GeneratedOutputContentLocator;
      readonly generation: CanvasGenerationEvidence;
      readonly mediaKind: CanvasMaterialMediaKind;
      readonly title: string;
    })
  | (CanvasMaterialAuthoringRequestBase & {
      readonly kind: 'derived-output-commit';
      readonly locator: ContentLocator;
      readonly generation?: CanvasGenerationEvidence;
      readonly mediaKind: CanvasMaterialMediaKind;
      readonly title: string;
      readonly sourceNodeIds: readonly string[];
    });

export interface CanvasMaterialActionSelection {
  readonly minimum: number;
  readonly maximum?: number;
}

/**
 * Descriptors are contributed by capability owners and projected by Canvas.
 * Unavailable capabilities do not contribute descriptors.
 */
export interface CanvasMaterialActionDescriptor {
  readonly id: string;
  readonly ownerId: string;
  readonly label: string;
  readonly mediaKinds: readonly CanvasMaterialMediaKind[];
  readonly origins: readonly CanvasMaterialOrigin[];
  readonly selection: CanvasMaterialActionSelection;
  readonly effect: CanvasMaterialActionEffect;
}

export interface CanvasMaterialActionIntent<
  TPayload extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  readonly identity: CanvasMaterialAuthoringIdentity;
  readonly actionId: string;
  readonly selectedNodeIds: readonly string[];
  readonly payload: TPayload;
}

export type CanvasMaterialPersistenceDiagnosticCode =
  | 'canvas-material-content-locator-required'
  | 'canvas-material-content-locator-invalid'
  | 'canvas-material-media-kind-invalid'
  | 'canvas-material-generation-evidence-required'
  | 'canvas-material-generation-evidence-forbidden'
  | 'canvas-material-entity-evidence-invalid'
  | 'canvas-material-non-serializable-value'
  | 'canvas-material-sensitive-value-forbidden';

export interface CanvasMaterialPersistenceDiagnostic {
  readonly code: CanvasMaterialPersistenceDiagnosticCode;
  readonly target: string;
  readonly message: string;
}

export function deriveCanvasMaterialOrigin(locator: ContentLocator): CanvasMaterialOrigin {
  const result = validateContentLocator(locator);
  if (!result.ok) {
    throw new Error('Canvas material origin requires a valid ContentLocator.');
  }
  return result.locator.kind === 'generated-output' ? 'generated' : 'referenced';
}

export function isCanvasGenerationEvidence(value: unknown): value is CanvasGenerationEvidence {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['jobRef', 'summary']) &&
    isCanvasGenerationJobRef(value['jobRef']) &&
    isCanvasMaterialGenerationContext(value['summary'])
  );
}

export function isCanvasEntityRepresentationEvidence(
  value: unknown,
): value is CanvasEntityRepresentationEvidence {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['entityId', 'bindingId', 'role']) &&
    isNonEmptyString(value['entityId']) &&
    isNonEmptyString(value['bindingId']) &&
    isEntityRepresentationRole(value['role'])
  );
}

export function isCanvasMaterialAuthoringRequest(
  value: unknown,
): value is CanvasMaterialAuthoringRequest {
  if (!isRecord(value) || !isCanvasMaterialAuthoringIdentity(value['identity'])) return false;
  switch (value['kind']) {
    case 'direct-reference': {
      if (
        !hasOnlyKeys(value, [
          'kind',
          'identity',
          'position',
          'locator',
          'mediaKind',
          'title',
          'entity',
        ]) ||
        !isOptionalPosition(value['position']) ||
        !isCanvasMaterialMediaKind(value['mediaKind']) ||
        !isOptionalNonEmptyString(value['title']) ||
        !isOptionalEntityEvidence(value['entity'])
      ) {
        return false;
      }
      const locator = validateContentLocator(value['locator']);
      return locator.ok && locator.locator.kind !== 'generated-output';
    }
    case 'entity-representation-replace': {
      if (
        !hasOnlyKeys(value, [
          'kind',
          'identity',
          'position',
          'nodeId',
          'expectedEntity',
          'locator',
          'mediaKind',
          'title',
          'entity',
        ]) ||
        value['position'] !== undefined ||
        !isNonEmptyString(value['nodeId']) ||
        !isCanvasEntityRepresentationEvidence(value['expectedEntity']) ||
        !isCanvasMaterialMediaKind(value['mediaKind']) ||
        !isNonEmptyString(value['title']) ||
        !isCanvasEntityRepresentationEvidence(value['entity'])
      ) {
        return false;
      }
      const locator = validateContentLocator(value['locator']);
      return (
        locator.ok &&
        locator.locator.kind !== 'generated-output' &&
        value['expectedEntity'].entityId === value['entity'].entityId
      );
    }
    case 'external-import':
      return (
        hasOnlyKeys(value, [
          'kind',
          'identity',
          'position',
          'sourceToken',
          'sourceName',
          'mediaKind',
          'conflictPolicy',
        ]) &&
        isOptionalPosition(value['position']) &&
        isOpaqueSourceToken(value['sourceToken']) &&
        isSafeSourceName(value['sourceName']) &&
        isCanvasMaterialMediaKind(value['mediaKind']) &&
        isCanvasMaterialImportConflictPolicy(value['conflictPolicy'])
      );
    case 'global-library-link':
      return (
        hasOnlyKeys(value, ['kind', 'identity', 'globalLibraryId']) &&
        isNonEmptyString(value['globalLibraryId'])
      );
    case 'global-library-copy':
      return (
        hasOnlyKeys(value, [
          'kind',
          'identity',
          'position',
          'globalLibraryId',
          'entryId',
          'mediaKind',
          'conflictPolicy',
        ]) &&
        isOptionalPosition(value['position']) &&
        isNonEmptyString(value['globalLibraryId']) &&
        isNonEmptyString(value['entryId']) &&
        isCanvasMaterialMediaKind(value['mediaKind']) &&
        isCanvasMaterialImportConflictPolicy(value['conflictPolicy'])
      );
    case 'generated-output-commit': {
      if (
        !hasOnlyKeys(value, [
          'kind',
          'identity',
          'position',
          'locator',
          'generation',
          'mediaKind',
          'title',
        ]) ||
        !isOptionalPosition(value['position']) ||
        !isCanvasGenerationEvidence(value['generation']) ||
        !isCanvasMaterialMediaKind(value['mediaKind']) ||
        !isNonEmptyString(value['title'])
      ) {
        return false;
      }
      const locator = validateContentLocator(value['locator']);
      return locator.ok && locator.locator.kind === 'generated-output';
    }
    case 'derived-output-commit': {
      if (
        !hasOnlyKeys(value, [
          'kind',
          'identity',
          'position',
          'locator',
          'generation',
          'mediaKind',
          'title',
          'sourceNodeIds',
        ]) ||
        !isOptionalPosition(value['position']) ||
        !isCanvasMaterialMediaKind(value['mediaKind']) ||
        !isNonEmptyString(value['title']) ||
        !isNonEmptyUniqueStringArray(value['sourceNodeIds'])
      ) {
        return false;
      }
      const locator = validateContentLocator(value['locator']);
      if (!locator.ok) return false;
      return locator.locator.kind === 'generated-output'
        ? isCanvasGenerationEvidence(value['generation'])
        : value['generation'] === undefined;
    }
    default:
      return false;
  }
}

export function isCanvasMaterialActionDescriptor(
  value: unknown,
): value is CanvasMaterialActionDescriptor {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'id',
      'ownerId',
      'label',
      'mediaKinds',
      'origins',
      'selection',
      'effect',
    ]) &&
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['ownerId']) &&
    isNonEmptyString(value['label']) &&
    isNonEmptyArray(value['mediaKinds'], isCanvasMaterialMediaKind) &&
    isNonEmptyArray(value['origins'], isCanvasMaterialOrigin) &&
    isCanvasMaterialActionSelection(value['selection']) &&
    isCanvasMaterialActionEffect(value['effect'])
  );
}

export function isCanvasMaterialActionIntent(value: unknown): value is CanvasMaterialActionIntent {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['identity', 'actionId', 'selectedNodeIds', 'payload']) &&
    isCanvasMaterialAuthoringIdentity(value['identity']) &&
    isNonEmptyString(value['actionId']) &&
    isNonEmptyArray(value['selectedNodeIds'], isNonEmptyString) &&
    isRecord(value['payload'])
  );
}

export function isCanvasProjectMediaLibraryCopyRequest(
  value: unknown,
): value is CanvasProjectMediaLibraryCopyRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'kind',
      'identity',
      'source',
      'libraryName',
      'destinationDirectory',
      'fileName',
      'conflictPolicy',
    ]) &&
    value['kind'] === 'copy-to-project-media-library' &&
    isCanvasMaterialAuthoringIdentity(value['identity']) &&
    validateContentLocator(value['source']).ok &&
    isNonEmptyString(value['libraryName']) &&
    isNormalizedPortableDirectory(value['destinationDirectory']) &&
    isSafeSourceName(value['fileName']) &&
    isCanvasMediaLibraryCopyConflictPolicy(value['conflictPolicy'])
  );
}

export function isCanvasGlobalMediaLibraryCopyRequest(
  value: unknown,
): value is CanvasGlobalMediaLibraryCopyRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'kind',
      'identity',
      'source',
      'globalLibraryId',
      'destinationDirectory',
      'fileName',
      'conflictPolicy',
    ]) &&
    value['kind'] === 'copy-to-global-media-library' &&
    isCanvasMaterialAuthoringIdentity(value['identity']) &&
    validateContentLocator(value['source']).ok &&
    isNonEmptyString(value['globalLibraryId']) &&
    isNormalizedPortableDirectory(value['destinationDirectory']) &&
    isSafeSourceName(value['fileName']) &&
    isCanvasMediaLibraryCopyConflictPolicy(value['conflictPolicy'])
  );
}

export function isCanvasMediaLibraryCopyRequest(
  value: unknown,
): value is CanvasMediaLibraryCopyRequest {
  return (
    isCanvasProjectMediaLibraryCopyRequest(value) || isCanvasGlobalMediaLibraryCopyRequest(value)
  );
}

export function validateCanvasMaterialNodePersistence(
  nodeType: unknown,
  data: unknown,
  target = 'data',
): readonly CanvasMaterialPersistenceDiagnostic[] {
  if (nodeType !== 'media' && nodeType !== 'file') return [];
  if (!isRecord(data)) {
    return [
      {
        code: 'canvas-material-content-locator-required',
        target,
        message: 'Persisted Canvas Media/File node data must contain a ContentLocator.',
      },
    ];
  }

  const diagnostics: CanvasMaterialPersistenceDiagnostic[] = [];
  if (
    nodeType === 'file' &&
    data['mediaKind'] !== undefined &&
    !isCanvasMaterialMediaKind(data['mediaKind'])
  ) {
    diagnostics.push({
      code: 'canvas-material-media-kind-invalid',
      target: `${target}.mediaKind`,
      message:
        'Canvas File material mediaKind must use the canonical media-kind contract; file extensions are not material identity.',
    });
  }
  const locator = validateContentLocator(data['contentLocator']);
  if (data['contentLocator'] === undefined) {
    diagnostics.push({
      code: 'canvas-material-content-locator-required',
      target: `${target}.contentLocator`,
      message:
        'Persisted Canvas Media/File nodes require a canonical ContentLocator; raw paths and ResourceRefs are not content identity.',
    });
  } else if (!locator.ok) {
    diagnostics.push({
      code: 'canvas-material-content-locator-invalid',
      target: `${target}.contentLocator`,
      message: 'Canvas material ContentLocator is invalid or non-portable.',
    });
  }

  if (locator.ok && locator.locator.kind === 'generated-output') {
    if (!isCanvasGenerationEvidence(data['generation'])) {
      diagnostics.push({
        code: 'canvas-material-generation-evidence-required',
        target: `${target}.generation`,
        message:
          'Generated-output Canvas material requires immutable evidence with JobRef<generation>.',
      });
    }
  } else if (data['generation'] !== undefined) {
    diagnostics.push({
      code: 'canvas-material-generation-evidence-forbidden',
      target: `${target}.generation`,
      message:
        'Referenced Canvas material cannot persist Generation evidence or be classified as generated.',
    });
  }

  if (
    data['entityRepresentation'] !== undefined &&
    !isCanvasEntityRepresentationEvidence(data['entityRepresentation'])
  ) {
    diagnostics.push({
      code: 'canvas-material-entity-evidence-invalid',
      target: `${target}.entityRepresentation`,
      message: 'Canvas Entity representation evidence is invalid.',
    });
  }

  collectForbiddenPersistenceValues(data, target, diagnostics, new Set());
  return diagnostics;
}

function isCanvasGenerationJobRef(value: unknown): value is CanvasGenerationJobRef {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['kind', 'jobId']) &&
    value['kind'] === 'generation' &&
    isNonEmptyString(value['jobId'])
  );
}

function isCanvasMaterialAuthoringIdentity(
  value: unknown,
): value is CanvasMaterialAuthoringIdentity {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['projectId', 'canvasId', 'canvasSessionId']) &&
    isNonEmptyString(value['projectId']) &&
    isNonEmptyString(value['canvasId']) &&
    isNonEmptyString(value['canvasSessionId'])
  );
}

function isCanvasMaterialActionSelection(value: unknown): value is CanvasMaterialActionSelection {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['minimum', 'maximum']) ||
    !isPositiveInteger(value['minimum'])
  ) {
    return false;
  }
  return (
    value['maximum'] === undefined ||
    (isPositiveInteger(value['maximum']) && value['maximum'] >= value['minimum'])
  );
}

function isCanvasMaterialOrigin(value: unknown): value is CanvasMaterialOrigin {
  return value === 'referenced' || value === 'generated';
}

function isCanvasMediaLibraryCopyConflictPolicy(
  value: unknown,
): value is CanvasMediaLibraryCopyConflictPolicy {
  return value === 'fail-if-exists' || value === 'replace';
}

function isNormalizedPortableDirectory(value: unknown): value is string {
  if (typeof value !== 'string' || value !== value.normalize('NFC')) return false;
  if (value === '') return true;
  if (value.startsWith('/') || value.endsWith('/') || value.includes('\\')) return false;
  return value
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

export function isCanvasMaterialMediaKind(value: unknown): value is CanvasMaterialMediaKind {
  return (
    value === 'image' ||
    value === 'audio' ||
    value === 'video' ||
    value === 'document' ||
    value === 'model' ||
    value === 'other'
  );
}

function isCanvasMaterialActionEffect(value: unknown): value is CanvasMaterialActionEffect {
  return (
    value === 'read' ||
    value === 'derive' ||
    value === 'copy' ||
    value === 'handoff' ||
    value === 'generate'
  );
}

function isCanvasMaterialImportConflictPolicy(
  value: unknown,
): value is CanvasMaterialImportConflictPolicy {
  return value === 'reject' || value === 'rename' || value === 'replace';
}

function isOptionalPosition(value: unknown): boolean {
  return value === undefined || isCanvasMaterialPosition(value);
}

function isCanvasMaterialPosition(value: unknown): value is CanvasMaterialPosition {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['x', 'y']) &&
    typeof value['x'] === 'number' &&
    Number.isFinite(value['x']) &&
    typeof value['y'] === 'number' &&
    Number.isFinite(value['y'])
  );
}

function isOptionalNonEmptyString(value: unknown): boolean {
  return value === undefined || isNonEmptyString(value);
}

function isOptionalEntityEvidence(value: unknown): boolean {
  return value === undefined || isCanvasEntityRepresentationEvidence(value);
}

function isNonEmptyUniqueStringArray(value: unknown): value is readonly string[] {
  if (!isNonEmptyArray(value, isNonEmptyString)) return false;
  return new Set(value).size === value.length;
}

function isOpaqueSourceToken(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    !value.includes('\0') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:[\\/]/u.test(value) &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
  );
}

const SENSITIVE_PERSISTED_KEY_PATTERN =
  /(?:^|\.)(?:credential|credentials|secret|apiKey|accessToken|refreshToken|password)$/i;

function collectForbiddenPersistenceValues(
  value: unknown,
  target: string,
  diagnostics: CanvasMaterialPersistenceDiagnostic[],
  seen: Set<object>,
): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return;
  }
  if (
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint' ||
    typeof value !== 'object'
  ) {
    diagnostics.push({
      code: 'canvas-material-non-serializable-value',
      target,
      message: 'Canvas material persistence accepts only JSON-serializable values.',
    });
    return;
  }
  if (seen.has(value)) {
    diagnostics.push({
      code: 'canvas-material-non-serializable-value',
      target,
      message: 'Canvas material persistence cannot contain cyclic values.',
    });
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectForbiddenPersistenceValues(entry, `${target}[${index}]`, diagnostics, seen),
    );
    seen.delete(value);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const entryTarget = `${target}.${key}`;
    if (SENSITIVE_PERSISTED_KEY_PATTERN.test(entryTarget)) {
      diagnostics.push({
        code: 'canvas-material-sensitive-value-forbidden',
        target: entryTarget,
        message: `Canvas material field "${key}" cannot persist credentials or secrets.`,
      });
      continue;
    }
    collectForbiddenPersistenceValues(entry, entryTarget, diagnostics, seen);
  }
  seen.delete(value);
}

function isSafeSourceName(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    !value.includes('\0') &&
    !value.includes('/') &&
    !value.includes('\\') &&
    value !== '.' &&
    value !== '..'
  );
}

function isNonEmptyArray<T>(
  value: unknown,
  predicate: (entry: unknown) => entry is T,
): value is readonly T[] {
  return Array.isArray(value) && value.length > 0 && value.every(predicate);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
