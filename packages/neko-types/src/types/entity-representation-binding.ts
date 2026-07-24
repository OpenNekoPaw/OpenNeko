import { validateContentLocator, type ContentLocator } from './content-locator';
import { isCreativeEntityKind, type CreativeEntityKind } from './creative-entity-identity';

export const ENTITY_REPRESENTATION_BINDING_FILE_VERSION = 2 as const;
export const ENTITY_REPRESENTATION_BINDING_WORKSPACE_PATH =
  'neko/entity-representation-bindings.json' as const;

export const ENTITY_REPRESENTATION_ROLES = [
  'portrait',
  'reference',
  'live2d',
  'live3d',
  'voice',
  'motion',
  'style',
] as const;

export const ENTITY_REPRESENTATION_BINDING_STATUSES = [
  'suggested',
  'confirmed',
  'rejected',
] as const;

export const ENTITY_REPRESENTATION_BINDING_AVAILABILITIES = [
  'active',
  'orphaned',
  'archived',
] as const;

export const ENTITY_REPRESENTATION_BINDING_SOURCES = [
  'user',
  'story',
  'canvas',
  'agent',
  'matcher',
  'migration',
] as const;

export type EntityRepresentationRole = (typeof ENTITY_REPRESENTATION_ROLES)[number];

export type EntityRepresentationTarget = ContentLocator;

export type EntityRepresentationBindingStatus = 'suggested' | 'confirmed' | 'rejected';

export type EntityRepresentationBindingAvailability = 'active' | 'orphaned' | 'archived';

export type EntityRepresentationBindingSource =
  'user' | 'story' | 'canvas' | 'agent' | 'matcher' | 'migration';

export interface EntityRepresentationBinding {
  readonly id: string;
  readonly entityId: string;
  readonly entityKind: CreativeEntityKind;
  readonly representation: EntityRepresentationTarget;
  readonly role: EntityRepresentationRole;
  readonly isDefault?: boolean;
  readonly status: EntityRepresentationBindingStatus;
  readonly availability: EntityRepresentationBindingAvailability;
  readonly orphanedAt?: string;
  readonly source: EntityRepresentationBindingSource;
  readonly confidence?: number;
  readonly updatedAt: string;
}

export interface EntityRepresentationBindingFile {
  readonly version: typeof ENTITY_REPRESENTATION_BINDING_FILE_VERSION;
  readonly bindings: readonly EntityRepresentationBinding[];
}

export type EntityRepresentationConsumer = 'canvas' | 'agent' | 'cut';

export interface EntityRepresentationResolveRequest {
  readonly entityId: string;
  readonly consumer: EntityRepresentationConsumer;
  readonly preferredRole?: EntityRepresentationRole;
  readonly candidateRoles?: readonly EntityRepresentationRole[];
  readonly allowAlternativeRoles?: boolean;
}

export type EntityRepresentationResolveResult =
  | {
      readonly status: 'resolved';
      readonly entityId: string;
      readonly binding: EntityRepresentationBinding;
      readonly representation: EntityRepresentationTarget;
      readonly resolvedRole: EntityRepresentationRole;
      readonly usedAlternativeRole: boolean;
    }
  | {
      readonly status: 'missing-representation';
      readonly entityId: string;
      readonly missingRoles: readonly EntityRepresentationRole[];
      readonly suggestedActions: readonly ('generate' | 'bind-existing' | 'dismiss')[];
    };

export const ENTITY_REPRESENTATION_ROLE_ORDER: Readonly<
  Record<EntityRepresentationConsumer, readonly EntityRepresentationRole[]>
> = {
  canvas: ['portrait', 'reference', 'live2d', 'live3d'],
  agent: ['reference', 'portrait', 'live2d', 'live3d'],
  cut: ['motion', 'live2d', 'live3d', 'portrait'],
} as const;

export type EntityRepresentationBindingFileDiagnosticCode =
  'legacy-version' | 'unsupported-version' | 'invalid-file';

export type EntityRepresentationBindingFileDecodeResult =
  | { readonly ok: true; readonly file: EntityRepresentationBindingFile }
  | {
      readonly ok: false;
      readonly code: EntityRepresentationBindingFileDiagnosticCode;
      readonly message: string;
    };

export class EntityRepresentationBindingFileError extends Error {
  readonly code: EntityRepresentationBindingFileDiagnosticCode;

  constructor(code: EntityRepresentationBindingFileDiagnosticCode, message: string) {
    super(message);
    this.name = 'EntityRepresentationBindingFileError';
    this.code = code;
  }
}

export function isEntityRepresentationBinding(
  value: unknown,
): value is EntityRepresentationBinding {
  if (!isRecord(value) || !hasOnlyKeys(value, BINDING_KEYS)) return false;
  const representation = validateContentLocator(value['representation']);
  if (!representation.ok) return false;
  if (
    !isNonEmptyString(value['id']) ||
    !isNonEmptyString(value['entityId']) ||
    !isCreativeEntityKind(value['entityKind']) ||
    !isEntityRepresentationRole(value['role']) ||
    !isEntityRepresentationBindingStatus(value['status']) ||
    !isEntityRepresentationBindingAvailability(value['availability']) ||
    !isEntityRepresentationBindingSource(value['source']) ||
    !isNonEmptyString(value['updatedAt']) ||
    (value['isDefault'] !== undefined && typeof value['isDefault'] !== 'boolean') ||
    (value['confidence'] !== undefined && !isConfidence(value['confidence'])) ||
    (value['orphanedAt'] !== undefined && !isNonEmptyString(value['orphanedAt']))
  ) {
    return false;
  }
  if (value['availability'] === 'orphaned' && value['orphanedAt'] === undefined) return false;
  if (value['availability'] !== 'orphaned' && value['orphanedAt'] !== undefined) return false;
  if (value['isDefault'] === true) {
    return value['status'] === 'confirmed' && value['availability'] === 'active';
  }
  return true;
}

export function isEntityRepresentationBindingFile(
  value: unknown,
): value is EntityRepresentationBindingFile {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, BINDING_FILE_KEYS) &&
    value['version'] === 2 &&
    Array.isArray(value['bindings']) &&
    value['bindings'].every(isEntityRepresentationBinding)
  );
}

export function decodeEntityRepresentationBindingFile(
  value: unknown,
): EntityRepresentationBindingFileDecodeResult {
  if (isRecord(value) && value['version'] === 1) {
    return {
      ok: false,
      code: 'legacy-version',
      message: 'Legacy Entity Asset bindings require explicit inspection and migration.',
    };
  }
  if (isRecord(value) && value['version'] !== undefined && value['version'] !== 2) {
    return {
      ok: false,
      code: 'unsupported-version',
      message: 'Entity representation bindings use an unsupported schema version.',
    };
  }
  if (!isEntityRepresentationBindingFile(value)) {
    return {
      ok: false,
      code: 'invalid-file',
      message: 'Entity representation binding data is invalid.',
    };
  }
  return { ok: true, file: normalizeEntityRepresentationBindingFile(value) };
}

export function assertEntityRepresentationBindingFile(
  value: unknown,
): EntityRepresentationBindingFile {
  const decoded = decodeEntityRepresentationBindingFile(value);
  if (decoded.ok) return decoded.file;
  throw new EntityRepresentationBindingFileError(decoded.code, decoded.message);
}

export function createEmptyEntityRepresentationBindingFile(): EntityRepresentationBindingFile {
  return { version: ENTITY_REPRESENTATION_BINDING_FILE_VERSION, bindings: [] };
}

export function normalizeEntityRepresentationBindingFile(
  file: EntityRepresentationBindingFile,
): EntityRepresentationBindingFile {
  return {
    version: ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
    bindings: [...file.bindings].sort(compareBindings),
  };
}

export function encodeEntityRepresentationBindingFile(
  file: EntityRepresentationBindingFile,
): string {
  const normalized = assertEntityRepresentationBindingFile(file);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

export function isEntityRepresentationRole(value: unknown): value is EntityRepresentationRole {
  return ENTITY_REPRESENTATION_ROLES.some((role) => role === value);
}

const BINDING_KEYS = [
  'id',
  'entityId',
  'entityKind',
  'representation',
  'role',
  'isDefault',
  'status',
  'availability',
  'orphanedAt',
  'source',
  'confidence',
  'updatedAt',
] as const;
const BINDING_FILE_KEYS = ['version', 'bindings'] as const;

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function isEntityRepresentationBindingStatus(
  value: unknown,
): value is EntityRepresentationBindingStatus {
  return ENTITY_REPRESENTATION_BINDING_STATUSES.some((status) => status === value);
}

export function isEntityRepresentationBindingAvailability(
  value: unknown,
): value is EntityRepresentationBindingAvailability {
  return ENTITY_REPRESENTATION_BINDING_AVAILABILITIES.some(
    (availability) => availability === value,
  );
}

export function isEntityRepresentationBindingSource(
  value: unknown,
): value is EntityRepresentationBindingSource {
  return ENTITY_REPRESENTATION_BINDING_SOURCES.some((source) => source === value);
}

function compareBindings(
  left: EntityRepresentationBinding,
  right: EntityRepresentationBinding,
): number {
  return (
    left.entityKind.localeCompare(right.entityKind) ||
    left.entityId.localeCompare(right.entityId) ||
    left.role.localeCompare(right.role) ||
    left.id.localeCompare(right.id)
  );
}
