import type { ContentLocator } from '@neko/content';
import { validateContentLocator } from '@neko/content';
import { isCreativeEntityKind, type CreativeEntityKind } from './creative-entity-identity';
import { isEntityRepresentationRole } from './project-entity-representation';
import type {
  ProjectEntityNames,
  ProjectEntityRepresentationBinding,
} from './project-entity-document';

export const PROJECT_ENTITY_INSPECTOR_OPERATIONS = [
  'confirm',
  'edit',
  'bind',
  'unbind',
  'merge',
  'deprecate',
  'reference',
] as const;

export type ProjectEntityInspectorOperation = (typeof PROJECT_ENTITY_INSPECTOR_OPERATIONS)[number];

export interface ProjectEntityInspectorBlocker {
  readonly code: string;
  readonly message: string;
  readonly operation?: ProjectEntityInspectorOperation;
}

export interface ProjectEntityInspectorBinding {
  readonly bindingId: string;
  readonly role: ProjectEntityRepresentationBinding['role'];
  readonly target: ContentLocator;
  readonly availability: 'available' | 'needs-attention' | 'unknown';
  readonly attentionAction?: 'rebind' | 'reinstall' | 'reconnect' | 'retry';
}

export interface ProjectEntityInspectorInteractionContext {
  readonly conversationId?: string;
}

export interface ProjectEntityInspectorProjection {
  readonly status: 'confirmed' | 'candidate' | 'needs-attention' | 'deprecated';
  readonly kind: CreativeEntityKind;
  readonly names: ProjectEntityNames;
  readonly entityId?: string;
  readonly candidateId?: string;
  readonly evidence?: readonly {
    readonly evidenceId: string;
    readonly owner: 'workspace' | 'document' | 'media-library' | 'managed-asset';
    readonly sourceId: string;
    readonly label?: string;
    readonly confidence?: number;
  }[];
  readonly bindings: readonly ProjectEntityInspectorBinding[];
  readonly operations: readonly ProjectEntityInspectorOperation[];
  readonly interaction?: ProjectEntityInspectorInteractionContext;
  readonly blockers: readonly ProjectEntityInspectorBlocker[];
}

export type ProjectEntityInspectorIntent =
  | {
      readonly type: 'confirm';
      readonly candidateId: string;
      readonly accepted: {
        readonly kind: CreativeEntityKind;
        readonly names: ProjectEntityNames;
      };
    }
  | {
      readonly type: 'edit';
      readonly entityId: string;
      readonly changes: {
        readonly names: ProjectEntityNames;
      };
    }
  | {
      readonly type: 'bind';
      readonly entityId: string;
      readonly binding: Pick<ProjectEntityRepresentationBinding, 'role' | 'target' | 'isDefault'>;
    }
  | {
      readonly type: 'unbind';
      readonly entityId: string;
      readonly bindingId: string;
    }
  | {
      readonly type: 'merge';
      readonly sourceEntityId: string;
      readonly targetEntityId: string;
    }
  | {
      readonly type: 'merge';
      readonly candidateId: string;
      readonly targetEntityId: string;
    }
  | {
      readonly type: 'deprecate';
      readonly entityId: string;
      readonly replacementEntityId?: string;
    }
  | {
      readonly type: 'reference';
      readonly entityId: string;
      readonly conversationId: string;
    };

export function assertProjectEntityInspectorIntent(value: unknown): ProjectEntityInspectorIntent {
  const record = requireRecord(value, 'Project Entity Inspector intent must be an object.');
  const type = record['type'];
  if (!isInspectorOperation(type)) {
    throw new Error('Project Entity Inspector intent type is invalid.');
  }
  switch (type) {
    case 'confirm':
      requireOnlyKeys(record, ['type', 'candidateId', 'accepted']);
      return {
        type,
        candidateId: requireIdentity(record['candidateId']),
        accepted: parseAccepted(record['accepted']),
      };
    case 'edit':
      requireOnlyKeys(record, ['type', 'entityId', 'changes']);
      return {
        type,
        entityId: requireIdentity(record['entityId']),
        changes: parseChanges(record['changes']),
      };
    case 'bind':
      requireOnlyKeys(record, ['type', 'entityId', 'binding']);
      return {
        type,
        entityId: requireIdentity(record['entityId']),
        binding: parseBinding(record['binding']),
      };
    case 'unbind':
      requireOnlyKeys(record, ['type', 'entityId', 'bindingId']);
      return {
        type,
        entityId: requireIdentity(record['entityId']),
        bindingId: requireIdentity(record['bindingId']),
      };
    case 'merge': {
      const candidateId = optionalIdentity(record['candidateId']);
      const sourceEntityId = optionalIdentity(record['sourceEntityId']);
      if ((candidateId === undefined) === (sourceEntityId === undefined)) {
        throw new Error('Project Entity merge requires exactly one source identity.');
      }
      requireOnlyKeys(record, ['type', 'candidateId', 'sourceEntityId', 'targetEntityId']);
      const base = {
        type,
        targetEntityId: requireIdentity(record['targetEntityId']),
      } as const;
      if (candidateId) return { ...base, candidateId };
      if (sourceEntityId) return { ...base, sourceEntityId };
      throw new Error('Project Entity merge source identity is invalid.');
    }
    case 'deprecate': {
      requireOnlyKeys(record, ['type', 'entityId', 'replacementEntityId']);
      const replacementEntityId = optionalIdentity(record['replacementEntityId']);
      return {
        type,
        entityId: requireIdentity(record['entityId']),
        ...(replacementEntityId ? { replacementEntityId } : {}),
      };
    }
    case 'reference':
      requireOnlyKeys(record, ['type', 'entityId', 'conversationId']);
      return {
        type,
        entityId: requireIdentity(record['entityId']),
        conversationId: requireIdentity(record['conversationId']),
      };
  }
}

export function assertProjectEntityInspectorProjection(
  value: unknown,
): ProjectEntityInspectorProjection {
  if (!isProjectEntityInspectorProjection(value)) {
    throw new Error('Project Entity Inspector projection is invalid.');
  }
  return value;
}

function isProjectEntityInspectorProjection(
  value: unknown,
): value is ProjectEntityInspectorProjection {
  if (!isRecord(value)) return false;
  const status = value['status'];
  const entityId = value['entityId'];
  const candidateId = value['candidateId'];
  return (
    hasOnlyAllowedKeys(value, INSPECTOR_PROJECTION_KEYS) &&
    (status === 'confirmed' ||
      status === 'candidate' ||
      status === 'needs-attention' ||
      status === 'deprecated') &&
    isCreativeEntityKind(value['kind']) &&
    isNames(value['names']) &&
    (status === 'candidate'
      ? entityId === undefined && isIdentity(candidateId) && isEvidenceArray(value['evidence'])
      : isIdentity(entityId) && candidateId === undefined && value['evidence'] === undefined) &&
    Array.isArray(value['bindings']) &&
    value['bindings'].every(isInspectorBinding) &&
    Array.isArray(value['operations']) &&
    value['operations'].every(isInspectorOperation) &&
    isOptionalInteraction(value['interaction']) &&
    Array.isArray(value['blockers']) &&
    value['blockers'].every(isInspectorBlocker)
  );
}

function isInspectorBinding(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const target = validateContentLocator(value['target']);
  return (
    hasOnlyAllowedKeys(value, INSPECTOR_BINDING_KEYS) &&
    isIdentity(value['bindingId']) &&
    isEntityRepresentationRole(value['role']) &&
    target.ok &&
    (value['availability'] === 'available' ||
      value['availability'] === 'needs-attention' ||
      value['availability'] === 'unknown') &&
    (value['attentionAction'] === undefined ||
      value['attentionAction'] === 'rebind' ||
      value['attentionAction'] === 'reinstall' ||
      value['attentionAction'] === 'reconnect' ||
      value['attentionAction'] === 'retry')
  );
}

function isEvidenceArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        hasOnlyAllowedKeys(entry, INSPECTOR_EVIDENCE_KEYS) &&
        isIdentity(entry['evidenceId']) &&
        (entry['owner'] === 'workspace' ||
          entry['owner'] === 'document' ||
          entry['owner'] === 'media-library' ||
          entry['owner'] === 'managed-asset') &&
        isIdentity(entry['sourceId']) &&
        (entry['label'] === undefined || isNonEmptyString(entry['label'])) &&
        (entry['confidence'] === undefined ||
          (typeof entry['confidence'] === 'number' &&
            entry['confidence'] >= 0 &&
            entry['confidence'] <= 1)),
    )
  );
}

function isOptionalInteraction(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    isRecord(value) &&
    hasOnlyAllowedKeys(value, INTERACTION_KEYS) &&
    optionalIdentityValue(value['conversationId']) &&
    Object.keys(value).length > 0
  );
}

function isInspectorBlocker(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyAllowedKeys(value, BLOCKER_KEYS) &&
    isIdentity(value['code']) &&
    isNonEmptyString(value['message']) &&
    (value['operation'] === undefined || isInspectorOperation(value['operation']))
  );
}

function isNames(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyAllowedKeys(value, NAME_KEYS) &&
    isNonEmptyString(value['canonical']) &&
    (value['display'] === undefined || isNonEmptyString(value['display'])) &&
    Array.isArray(value['aliases']) &&
    value['aliases'].every(isNonEmptyString)
  );
}

function isIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\\/\0]/u.test(value);
}

function optionalIdentityValue(value: unknown): boolean {
  return value === undefined || isIdentity(value);
}

function hasOnlyAllowedKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function parseAccepted(
  value: unknown,
): Extract<ProjectEntityInspectorIntent, { type: 'confirm' }>['accepted'] {
  const record = requireRecord(value, 'Project Entity accepted candidate is invalid.');
  requireOnlyKeys(record, ['kind', 'names']);
  return {
    kind: requireEntityKind(record['kind']),
    names: parseNames(record['names']),
  };
}

function parseChanges(
  value: unknown,
): Extract<ProjectEntityInspectorIntent, { type: 'edit' }>['changes'] {
  const record = requireRecord(value, 'Project Entity changes are invalid.');
  requireOnlyKeys(record, ['names']);
  return { names: parseNames(record['names']) };
}

function parseBinding(
  value: unknown,
): Extract<ProjectEntityInspectorIntent, { type: 'bind' }>['binding'] {
  const record = requireRecord(value, 'Project Entity binding is invalid.');
  requireOnlyKeys(record, ['role', 'target', 'isDefault']);
  const target = validateContentLocator(record['target']);
  if (!target.ok) throw new Error('Project Entity binding target is invalid.');
  const role = record['role'];
  if (!isEntityRepresentationRole(role)) {
    throw new Error('Project Entity binding role is invalid.');
  }
  if (record['isDefault'] !== undefined && typeof record['isDefault'] !== 'boolean') {
    throw new Error('Project Entity binding default flag is invalid.');
  }
  return {
    role,
    target: target.locator,
    ...(record['isDefault'] === true ? { isDefault: true } : {}),
  };
}

function parseNames(value: unknown): ProjectEntityNames {
  const record = requireRecord(value, 'Project Entity names are invalid.');
  requireOnlyKeys(record, ['canonical', 'display', 'aliases']);
  const aliases = requireArray(record['aliases']).map(requireNonEmptyString);
  const display = optionalNonEmptyString(record['display']);
  return {
    canonical: requireNonEmptyString(record['canonical']),
    ...(display ? { display } : {}),
    aliases,
  };
}

function requireEntityKind(value: unknown): CreativeEntityKind {
  if (!isCreativeEntityKind(value)) {
    throw new Error('Project Entity kind is invalid.');
  }
  return value;
}

function isInspectorOperation(value: unknown): value is ProjectEntityInspectorOperation {
  return PROJECT_ENTITY_INSPECTOR_OPERATIONS.some((operation) => operation === value);
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new Error('Project Entity Inspector intent contains unsupported fields.');
  }
}

function requireArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error('Project Entity Inspector value must be an array.');
  return value;
}

function requireIdentity(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || /[\\/\0]/u.test(value)) {
    throw new Error('Project Entity identity is invalid.');
  }
  return value;
}

function optionalIdentity(value: unknown): string | undefined {
  return value === undefined ? undefined : requireIdentity(value);
}

function requireNonEmptyString(value: unknown): string {
  if (!isNonEmptyString(value)) {
    throw new Error('Project Entity text is invalid.');
  }
  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalNonEmptyString(value: unknown): string | undefined {
  return value === undefined ? undefined : requireNonEmptyString(value);
}

const INSPECTOR_PROJECTION_KEYS = [
  'status',
  'kind',
  'names',
  'entityId',
  'candidateId',
  'evidence',
  'bindings',
  'operations',
  'interaction',
  'blockers',
] as const;
const INSPECTOR_BINDING_KEYS = [
  'bindingId',
  'role',
  'target',
  'availability',
  'attentionAction',
] as const;
const INSPECTOR_EVIDENCE_KEYS = ['evidenceId', 'owner', 'sourceId', 'label', 'confidence'] as const;
const INTERACTION_KEYS = ['conversationId'] as const;
const BLOCKER_KEYS = ['code', 'message', 'operation'] as const;
const NAME_KEYS = ['canonical', 'display', 'aliases'] as const;
