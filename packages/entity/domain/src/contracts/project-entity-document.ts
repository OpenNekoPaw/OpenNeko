import {
  isProjectDurableContentLocator,
  validateContentLocator,
  type ContentLocator,
} from '@neko/content';
import { isCreativeEntityKind, type CreativeEntityKind } from './creative-entity-identity';
import {
  isEntityRepresentationRole,
  type EntityRepresentationRole,
} from './project-entity-representation';

export const PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH = 'neko/entities.json' as const;

export const PROJECT_ENTITY_LIFECYCLE_STATES = ['active', 'deprecated'] as const;
export const PROJECT_ENTITY_BINDING_SOURCES = ['user', 'agent', 'import'] as const;
export const PROJECT_ENTITY_CANDIDATE_SOURCE_OWNERS = [
  'workspace',
  'document',
  'media-library',
  'managed-asset',
] as const;
export const PROJECT_ENTITY_CANDIDATE_FRESHNESS_STATES = [
  'fresh',
  'stale',
  'building',
  'partial',
  'failed',
] as const;

export type ProjectEntityLifecycleState = (typeof PROJECT_ENTITY_LIFECYCLE_STATES)[number];
export type ProjectEntityBindingSource = (typeof PROJECT_ENTITY_BINDING_SOURCES)[number];
export type ProjectEntityCandidateSourceOwner =
  (typeof PROJECT_ENTITY_CANDIDATE_SOURCE_OWNERS)[number];
export type ProjectEntityCandidateFreshness =
  (typeof PROJECT_ENTITY_CANDIDATE_FRESHNESS_STATES)[number];

export interface ProjectEntityNames {
  readonly canonical: string;
  readonly display?: string;
  readonly aliases: readonly string[];
}

export type ProjectEntityLifecycle =
  | { readonly state: 'active' }
  | {
      readonly state: 'deprecated';
      readonly deprecatedAt: string;
      readonly replacementEntityId?: string;
    };

export interface ProjectEntityRepresentationBinding {
  readonly bindingId: string;
  readonly role: EntityRepresentationRole;
  readonly target: ContentLocator;
  readonly source: ProjectEntityBindingSource;
  readonly isDefault?: boolean;
  readonly acceptedAt: string;
}

export interface ProjectEntitySemanticSnapshot {
  readonly kind: CreativeEntityKind;
  readonly names: ProjectEntityNames;
  readonly representations: readonly ProjectEntityRepresentationBinding[];
}

export interface ProjectEntityRecord extends ProjectEntitySemanticSnapshot {
  readonly entityId: string;
  readonly lifecycle: ProjectEntityLifecycle;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectEntityDocument {
  readonly projectId: string;
  readonly entities: readonly ProjectEntityRecord[];
}

export type ProjectEntityDocumentMutation = (
  current: ProjectEntityDocument,
) => ProjectEntityDocument | Promise<ProjectEntityDocument>;

export interface ProjectEntityDocumentRepository {
  load(signal?: AbortSignal): Promise<ProjectEntityDocument>;
  mutate(
    mutation: ProjectEntityDocumentMutation,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument>;
}

export interface ProjectEntityCandidateEvidence {
  readonly evidenceId: string;
  readonly owner: ProjectEntityCandidateSourceOwner;
  readonly sourceId: string;
  readonly locator?: ContentLocator;
  readonly label?: string;
  readonly confidence?: number;
  readonly observedAt?: string;
}

export interface ProjectEntityCandidateProjection {
  readonly candidateId: string;
  readonly kind: CreativeEntityKind;
  readonly proposedNames: ProjectEntityNames;
  readonly confidence?: number;
  readonly freshness: ProjectEntityCandidateFreshness;
  readonly evidence: readonly ProjectEntityCandidateEvidence[];
}

export type ProjectEntityDiagnosticCode =
  | 'invalid-project-entity-document'
  | 'project-entity-owner-mismatch'
  | 'duplicate-project-entity-id'
  | 'duplicate-project-entity-binding-id'
  | 'project-entity-not-found'
  | 'project-entity-candidate-not-found'
  | 'project-entity-candidate-not-referenceable'
  | 'project-entity-operation-invalid'
  | 'project-entity-reference-plan-incomplete'
  | 'project-entity-binding-unavailable'
  | 'project-entity-path-unauthorized'
  | 'project-entity-operation-cancelled'
  | 'project-entity-io-failed';

export interface ProjectEntityDiagnostic {
  readonly code: ProjectEntityDiagnosticCode;
  readonly message: string;
  readonly entityId?: string;
  readonly bindingId?: string;
  readonly candidateId?: string;
}

export interface ProjectEntityDocumentReadResult {
  readonly document: ProjectEntityDocument;
  readonly diagnostics: readonly ProjectEntityDiagnostic[];
}

export type ProjectEntityDocumentDecodeResult =
  | ({ readonly ok: true } & ProjectEntityDocumentReadResult)
  | { readonly ok: false; readonly diagnostics: readonly ProjectEntityDiagnostic[] };

export class ProjectEntityContractError extends Error {
  readonly diagnostics: readonly ProjectEntityDiagnostic[];

  constructor(diagnostics: readonly ProjectEntityDiagnostic[], options?: ErrorOptions) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join(' '), options);
    this.name = 'ProjectEntityContractError';
    this.diagnostics = diagnostics;
  }
}

export function decodeProjectEntityDocument(value: unknown): ProjectEntityDocumentDecodeResult {
  if (
    !isRecord(value) ||
    !isStableIdentity(value['projectId']) ||
    !Array.isArray(value['entities'])
  ) {
    return invalidDocument(
      'invalid-project-entity-document',
      'Project Entity document violates the canonical fact contract.',
    );
  }
  const diagnostics: ProjectEntityDiagnostic[] = [];
  const unsupportedKeys = Object.keys(value).filter(
    (key) => !DOCUMENT_KEYS.some((candidate) => candidate === key),
  );
  if (unsupportedKeys.length > 0) {
    diagnostics.push({
      code: 'invalid-project-entity-document',
      message: `Project Entity document contains unsupported fields: ${unsupportedKeys.sort().join(', ')}.`,
    });
  }
  const entities: ProjectEntityRecord[] = [];
  const entityIds = new Set<string>();
  const bindingIds = new Set<string>();
  for (const [index, candidate] of value['entities'].entries()) {
    const candidateEntityId = readCandidateEntityId(candidate);
    const entity = parseEntity(candidate);
    if (!entity) {
      diagnostics.push({
        code: 'invalid-project-entity-document',
        message: candidateEntityId
          ? `Project Entity '${candidateEntityId}' violates the canonical fact contract.`
          : `Project Entity record at index ${String(index)} violates the canonical fact contract.`,
        ...(candidateEntityId ? { entityId: candidateEntityId } : {}),
      });
      continue;
    }
    if (entityIds.has(entity.entityId)) {
      diagnostics.push({
        code: 'duplicate-project-entity-id',
        message: `Project Entity identity '${entity.entityId}' is duplicated.`,
        entityId: entity.entityId,
      });
      continue;
    }
    const localBindingIds = new Set<string>();
    let duplicateBindingId: string | undefined;
    for (const binding of entity.representations) {
      if (bindingIds.has(binding.bindingId) || localBindingIds.has(binding.bindingId)) {
        duplicateBindingId = binding.bindingId;
        break;
      }
      localBindingIds.add(binding.bindingId);
    }
    if (duplicateBindingId) {
      diagnostics.push({
        code: 'duplicate-project-entity-binding-id',
        message: `Project Entity binding identity '${duplicateBindingId}' is duplicated.`,
        entityId: entity.entityId,
        bindingId: duplicateBindingId,
      });
      continue;
    }
    entities.push(entity);
    entityIds.add(entity.entityId);
    for (const bindingId of localBindingIds) bindingIds.add(bindingId);
  }

  let removedInvalidReference = true;
  while (removedInvalidReference) {
    removedInvalidReference = false;
    for (let index = entities.length - 1; index >= 0; index -= 1) {
      const entity = entities[index];
      if (
        !entity ||
        entity.lifecycle.state !== 'deprecated' ||
        entity.lifecycle.replacementEntityId === undefined ||
        entityIds.has(entity.lifecycle.replacementEntityId)
      ) {
        continue;
      }
      diagnostics.push({
        code: 'invalid-project-entity-document',
        message: `Project Entity '${entity.entityId}' references an unknown replacement Entity.`,
        entityId: entity.entityId,
      });
      entities.splice(index, 1);
      entityIds.delete(entity.entityId);
      removedInvalidReference = true;
    }
  }
  return {
    ok: true,
    document: { projectId: value['projectId'], entities },
    diagnostics,
  };
}

export function assertProjectEntityDocument(value: unknown): ProjectEntityDocument {
  const decoded = decodeProjectEntityDocument(value);
  if (decoded.ok && decoded.diagnostics.length === 0) return decoded.document;
  throw new ProjectEntityContractError(decoded.diagnostics);
}

export function encodeProjectEntityDocument(document: ProjectEntityDocument): string {
  return `${JSON.stringify(assertProjectEntityDocument(document), null, 2)}\n`;
}

export function createEmptyProjectEntityDocument(projectId: string): ProjectEntityDocument {
  if (!isStableIdentity(projectId)) {
    throw new ProjectEntityContractError([
      {
        code: 'invalid-project-entity-document',
        message: 'Project Entity document requires a stable Project identity.',
      },
    ]);
  }
  return {
    projectId,
    entities: [],
  };
}

export function isProjectEntityCandidateProjection(
  value: unknown,
): value is ProjectEntityCandidateProjection {
  if (!isRecord(value) || !hasOnlyKeys(value, CANDIDATE_KEYS)) return false;
  return (
    isStableIdentity(value['candidateId']) &&
    isCreativeEntityKind(value['kind']) &&
    parseNames(value['proposedNames']) !== undefined &&
    isOptionalConfidence(value['confidence']) &&
    isOneOf(value['freshness'], PROJECT_ENTITY_CANDIDATE_FRESHNESS_STATES) &&
    Array.isArray(value['evidence']) &&
    value['evidence'].length > 0 &&
    value['evidence'].every(isProjectEntityCandidateEvidence)
  );
}

export function isProjectEntityRecord(value: unknown): value is ProjectEntityRecord {
  return parseEntity(value) !== undefined;
}

function parseEntity(value: unknown): ProjectEntityRecord | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ENTITY_KEYS)) return undefined;
  const semantic = parseSemanticSnapshot(value);
  const lifecycle = parseLifecycle(value['lifecycle']);
  if (
    !semantic ||
    !isStableIdentity(value['entityId']) ||
    !lifecycle ||
    !isTimestamp(value['createdAt']) ||
    !isTimestamp(value['updatedAt']) ||
    Date.parse(value['updatedAt']) < Date.parse(value['createdAt'])
  ) {
    return undefined;
  }
  return {
    entityId: value['entityId'],
    ...semantic,
    lifecycle,
    createdAt: value['createdAt'],
    updatedAt: value['updatedAt'],
  };
}

function readCandidateEntityId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return isStableIdentity(value['entityId']) ? value['entityId'] : undefined;
}

function parseSemanticSnapshot(value: unknown): ProjectEntitySemanticSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const names = parseNames(value['names']);
  if (!isCreativeEntityKind(value['kind']) || !names || !Array.isArray(value['representations'])) {
    return undefined;
  }
  const representations: ProjectEntityRepresentationBinding[] = [];
  for (const candidate of value['representations']) {
    const representation = parseRepresentation(candidate);
    if (!representation) return undefined;
    representations.push(representation);
  }
  const defaultRoles = new Set<EntityRepresentationRole>();
  for (const representation of representations) {
    if (!representation.isDefault) continue;
    if (defaultRoles.has(representation.role)) return undefined;
    defaultRoles.add(representation.role);
  }
  return { kind: value['kind'], names, representations };
}

function parseNames(value: unknown): ProjectEntityNames | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, NAME_KEYS)) return undefined;
  if (
    !isNonEmptyString(value['canonical']) ||
    (value['display'] !== undefined && !isNonEmptyString(value['display'])) ||
    !Array.isArray(value['aliases']) ||
    !value['aliases'].every(isNonEmptyString)
  ) {
    return undefined;
  }
  const normalized = [value['canonical'], ...value['aliases']].map(normalizeName);
  if (new Set(normalized).size !== normalized.length) return undefined;
  return {
    canonical: value['canonical'],
    ...(typeof value['display'] === 'string' ? { display: value['display'] } : {}),
    aliases: [...value['aliases']],
  };
}

function parseLifecycle(value: unknown): ProjectEntityLifecycle | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, LIFECYCLE_KEYS)) return undefined;
  if (value['state'] === 'active') {
    return value['deprecatedAt'] === undefined && value['replacementEntityId'] === undefined
      ? { state: 'active' }
      : undefined;
  }
  if (
    value['state'] !== 'deprecated' ||
    !isTimestamp(value['deprecatedAt']) ||
    (value['replacementEntityId'] !== undefined && !isStableIdentity(value['replacementEntityId']))
  ) {
    return undefined;
  }
  return {
    state: 'deprecated',
    deprecatedAt: value['deprecatedAt'],
    ...(typeof value['replacementEntityId'] === 'string'
      ? { replacementEntityId: value['replacementEntityId'] }
      : {}),
  };
}

function parseRepresentation(value: unknown): ProjectEntityRepresentationBinding | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, REPRESENTATION_KEYS)) return undefined;
  const target = validateContentLocator(value['target']);
  if (
    !isStableIdentity(value['bindingId']) ||
    !isEntityRepresentationRole(value['role']) ||
    !target.ok ||
    !isProjectDurableContentLocator(target.locator) ||
    !isOneOf(value['source'], PROJECT_ENTITY_BINDING_SOURCES) ||
    (value['isDefault'] !== undefined && typeof value['isDefault'] !== 'boolean') ||
    !isTimestamp(value['acceptedAt'])
  ) {
    return undefined;
  }
  return {
    bindingId: value['bindingId'],
    role: value['role'],
    target: target.locator,
    source: value['source'],
    ...(value['isDefault'] === true ? { isDefault: true } : {}),
    acceptedAt: value['acceptedAt'],
  };
}

function isProjectEntityCandidateEvidence(value: unknown): value is ProjectEntityCandidateEvidence {
  if (!isRecord(value) || !hasOnlyKeys(value, CANDIDATE_EVIDENCE_KEYS)) return false;
  const locator =
    value['locator'] === undefined ? undefined : validateContentLocator(value['locator']);
  return (
    isStableIdentity(value['evidenceId']) &&
    isOneOf(value['owner'], PROJECT_ENTITY_CANDIDATE_SOURCE_OWNERS) &&
    isStableIdentity(value['sourceId']) &&
    (locator === undefined || (locator.ok && isProjectDurableContentLocator(locator.locator))) &&
    (value['label'] === undefined || isNonEmptyString(value['label'])) &&
    isOptionalConfidence(value['confidence']) &&
    (value['observedAt'] === undefined || isTimestamp(value['observedAt']))
  );
}

function invalidDocument(
  code: ProjectEntityDiagnosticCode,
  message: string,
  identity: Pick<ProjectEntityDiagnostic, 'entityId' | 'bindingId' | 'candidateId'> = {},
): ProjectEntityDocumentDecodeResult {
  return { ok: false, diagnostics: [{ code, message, ...identity }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.some((candidate) => candidate === value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStableIdentity(value: unknown): value is string {
  return isNonEmptyString(value) && value.length <= 256 && !/[\\/\0]/u.test(value);
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isOptionalConfidence(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && value >= 0 && value <= 1);
}

function normalizeName(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase();
}

const DOCUMENT_KEYS = ['projectId', 'entities'] as const;
const ENTITY_KEYS = [
  'entityId',
  'kind',
  'names',
  'representations',
  'lifecycle',
  'createdAt',
  'updatedAt',
] as const;
const NAME_KEYS = ['canonical', 'display', 'aliases'] as const;
const LIFECYCLE_KEYS = ['state', 'deprecatedAt', 'replacementEntityId'] as const;
const REPRESENTATION_KEYS = [
  'bindingId',
  'role',
  'target',
  'source',
  'isDefault',
  'acceptedAt',
] as const;
const CANDIDATE_KEYS = [
  'candidateId',
  'kind',
  'proposedNames',
  'confidence',
  'freshness',
  'evidence',
] as const;
const CANDIDATE_EVIDENCE_KEYS = [
  'evidenceId',
  'owner',
  'sourceId',
  'locator',
  'label',
  'confidence',
  'observedAt',
] as const;
