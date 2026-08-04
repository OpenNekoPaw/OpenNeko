import { validateContentLocator, type ContentLocator } from '@neko/content';
import { isCreativeEntityKind, type CreativeEntityKind } from './creative-entity-identity';
import {
  isEntityRepresentationRole,
  type EntityRepresentationRole,
} from './entity-representation-binding';

export const PROJECT_ENTITY_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH = 'neko/entities.json' as const;

export const PROJECT_ENTITY_LIFECYCLE_STATES = ['active', 'deprecated'] as const;
export const PROJECT_ENTITY_BINDING_SOURCES = ['user', 'agent', 'import', 'migration'] as const;
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

export type ProjectEntityFactValue =
  | null
  | boolean
  | number
  | string
  | readonly ProjectEntityFactValue[]
  | { readonly [key: string]: ProjectEntityFactValue };

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

export interface ProjectEntityAssetRevisionRef {
  readonly assetId: string;
  readonly revision: string;
  readonly digest: string;
}

export interface ProjectEntitySemanticSnapshot {
  readonly kind: CreativeEntityKind;
  readonly names: ProjectEntityNames;
  readonly facts: Readonly<Record<string, ProjectEntityFactValue>>;
  readonly representations: readonly ProjectEntityRepresentationBinding[];
}

export interface ProjectEntityAssetProvenance {
  readonly origin: ProjectEntityAssetRevisionRef;
  readonly applied: ProjectEntityAssetRevisionRef;
  readonly importBase: ProjectEntitySemanticSnapshot;
}

export interface ProjectEntityRecord extends ProjectEntitySemanticSnapshot {
  readonly entityId: string;
  readonly lifecycle: ProjectEntityLifecycle;
  readonly provenance?: ProjectEntityAssetProvenance;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectEntityDocument {
  readonly schemaVersion: typeof PROJECT_ENTITY_DOCUMENT_SCHEMA_VERSION;
  readonly projectId: string;
  readonly revision: number;
  readonly entities: readonly ProjectEntityRecord[];
}

export interface ProjectEntityCommitRequest {
  readonly expectedRevision: number;
  readonly next: ProjectEntityDocument;
}

export interface ProjectEntityDocumentRepository {
  load(signal?: AbortSignal): Promise<ProjectEntityDocument>;
  commit(request: ProjectEntityCommitRequest, signal?: AbortSignal): Promise<ProjectEntityDocument>;
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
  | 'unsupported-project-entity-version'
  | 'invalid-project-entity-document'
  | 'duplicate-project-entity-id'
  | 'duplicate-project-entity-binding-id'
  | 'project-entity-revision-conflict'
  | 'project-entity-not-found'
  | 'project-entity-candidate-not-referenceable'
  | 'project-entity-reference-plan-incomplete'
  | 'project-entity-binding-unavailable'
  | 'invalid-project-entity-asset-provenance'
  | 'project-entity-migration-required'
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

export type ProjectEntityDocumentDecodeResult =
  | { readonly ok: true; readonly document: ProjectEntityDocument }
  | { readonly ok: false; readonly diagnostics: readonly ProjectEntityDiagnostic[] };

export class ProjectEntityContractError extends Error {
  readonly diagnostics: readonly ProjectEntityDiagnostic[];

  constructor(diagnostics: readonly ProjectEntityDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join(' '));
    this.name = 'ProjectEntityContractError';
    this.diagnostics = diagnostics;
  }
}

export function decodeProjectEntityDocument(value: unknown): ProjectEntityDocumentDecodeResult {
  if (isRecord(value) && value['schemaVersion'] !== PROJECT_ENTITY_DOCUMENT_SCHEMA_VERSION) {
    return invalidDocument(
      'unsupported-project-entity-version',
      'Project Entity document uses an unsupported schema version.',
    );
  }
  const document = parseDocument(value);
  if (!document) {
    return invalidDocument(
      'invalid-project-entity-document',
      'Project Entity document violates the canonical fact contract.',
    );
  }
  const entityIds = new Set<string>();
  const bindingIds = new Set<string>();
  for (const entity of document.entities) {
    if (entityIds.has(entity.entityId)) {
      return invalidDocument(
        'duplicate-project-entity-id',
        `Project Entity identity '${entity.entityId}' is duplicated.`,
        { entityId: entity.entityId },
      );
    }
    entityIds.add(entity.entityId);
    for (const binding of entity.representations) {
      if (bindingIds.has(binding.bindingId)) {
        return invalidDocument(
          'duplicate-project-entity-binding-id',
          `Project Entity binding identity '${binding.bindingId}' is duplicated.`,
          { entityId: entity.entityId, bindingId: binding.bindingId },
        );
      }
      bindingIds.add(binding.bindingId);
    }
  }
  for (const entity of document.entities) {
    if (
      entity.lifecycle.state === 'deprecated' &&
      entity.lifecycle.replacementEntityId !== undefined &&
      !entityIds.has(entity.lifecycle.replacementEntityId)
    ) {
      return invalidDocument(
        'invalid-project-entity-document',
        `Project Entity '${entity.entityId}' references an unknown replacement Entity.`,
        { entityId: entity.entityId },
      );
    }
  }
  return { ok: true, document };
}

export function assertProjectEntityDocument(value: unknown): ProjectEntityDocument {
  const decoded = decodeProjectEntityDocument(value);
  if (decoded.ok) return decoded.document;
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
    schemaVersion: PROJECT_ENTITY_DOCUMENT_SCHEMA_VERSION,
    projectId,
    revision: 0,
    entities: [],
  };
}

export function validateProjectEntityCommitRequest(
  request: ProjectEntityCommitRequest,
): ProjectEntityCommitRequest {
  if (
    !isNonNegativeInteger(request.expectedRevision) ||
    request.next.revision !== request.expectedRevision + 1
  ) {
    throw new ProjectEntityContractError([
      {
        code: 'project-entity-revision-conflict',
        message: 'Project Entity commit must advance the expected revision exactly once.',
      },
    ]);
  }
  return {
    expectedRevision: request.expectedRevision,
    next: assertProjectEntityDocument(request.next),
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

function parseDocument(value: unknown): ProjectEntityDocument | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, DOCUMENT_KEYS)) return undefined;
  if (
    value['schemaVersion'] !== PROJECT_ENTITY_DOCUMENT_SCHEMA_VERSION ||
    !isStableIdentity(value['projectId']) ||
    !isNonNegativeInteger(value['revision']) ||
    !Array.isArray(value['entities'])
  ) {
    return undefined;
  }
  const entities: ProjectEntityRecord[] = [];
  for (const candidate of value['entities']) {
    const entity = parseEntity(candidate);
    if (!entity) return undefined;
    entities.push(entity);
  }
  return {
    schemaVersion: PROJECT_ENTITY_DOCUMENT_SCHEMA_VERSION,
    projectId: value['projectId'],
    revision: value['revision'],
    entities,
  };
}

function parseEntity(value: unknown): ProjectEntityRecord | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ENTITY_KEYS)) return undefined;
  const semantic = parseSemanticSnapshot(value);
  const lifecycle = parseLifecycle(value['lifecycle']);
  const provenance = parseOptionalProvenance(value['provenance']);
  if (
    !semantic ||
    !isStableIdentity(value['entityId']) ||
    !lifecycle ||
    provenance === false ||
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
    ...(provenance ? { provenance } : {}),
    createdAt: value['createdAt'],
    updatedAt: value['updatedAt'],
  };
}

function parseSemanticSnapshot(value: unknown): ProjectEntitySemanticSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const names = parseNames(value['names']);
  const facts = parseFacts(value['facts']);
  if (
    !isCreativeEntityKind(value['kind']) ||
    !names ||
    !facts ||
    !Array.isArray(value['representations'])
  ) {
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
  return { kind: value['kind'], names, facts, representations };
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
    !isOneOf(value['source'], PROJECT_ENTITY_BINDING_SOURCES) ||
    (value['isDefault'] !== undefined && typeof value['isDefault'] !== 'boolean') ||
    !isTimestamp(value['acceptedAt'])
  ) {
    return undefined;
  }
  if (target.locator.kind === 'package-resource' && target.locator.digest === undefined) {
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

function parseOptionalProvenance(value: unknown): ProjectEntityAssetProvenance | undefined | false {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !hasOnlyKeys(value, PROVENANCE_KEYS)) return false;
  const origin = parseAssetRevision(value['origin']);
  const applied = parseAssetRevision(value['applied']);
  const importBase = parseImportBase(value['importBase']);
  if (!origin || !applied || !importBase || origin.assetId !== applied.assetId) return false;
  return { origin, applied, importBase };
}

function parseImportBase(value: unknown): ProjectEntitySemanticSnapshot | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, SNAPSHOT_KEYS)) return undefined;
  return parseSemanticSnapshot(value);
}

function parseAssetRevision(value: unknown): ProjectEntityAssetRevisionRef | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ASSET_REVISION_KEYS)) return undefined;
  if (
    !isStableIdentity(value['assetId']) ||
    !isStableIdentity(value['revision']) ||
    !isDigest(value['digest'])
  ) {
    return undefined;
  }
  return { assetId: value['assetId'], revision: value['revision'], digest: value['digest'] };
}

function parseFacts(value: unknown): Readonly<Record<string, ProjectEntityFactValue>> | undefined {
  if (!isRecord(value) || !isFactObject(value)) return undefined;
  if (Object.keys(value).some((key) => FORBIDDEN_FACT_KEYS.has(key))) return undefined;
  return value;
}

function isProjectEntityCandidateEvidence(value: unknown): value is ProjectEntityCandidateEvidence {
  if (!isRecord(value) || !hasOnlyKeys(value, CANDIDATE_EVIDENCE_KEYS)) return false;
  const locator =
    value['locator'] === undefined ? undefined : validateContentLocator(value['locator']);
  return (
    isStableIdentity(value['evidenceId']) &&
    isOneOf(value['owner'], PROJECT_ENTITY_CANDIDATE_SOURCE_OWNERS) &&
    isStableIdentity(value['sourceId']) &&
    (locator === undefined || locator.ok) &&
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

function isFactObject(
  value: Record<string, unknown>,
): value is Record<string, ProjectEntityFactValue> {
  return Object.values(value).every(isFactValue);
}

function isFactValue(value: unknown): value is ProjectEntityFactValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isFactValue);
  return isRecord(value) && Object.values(value).every(isFactValue);
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

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isOptionalConfidence(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && value >= 0 && value <= 1);
}

function normalizeName(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase();
}

const DOCUMENT_KEYS = ['schemaVersion', 'projectId', 'revision', 'entities'] as const;
const ENTITY_KEYS = [
  'entityId',
  'kind',
  'names',
  'facts',
  'representations',
  'lifecycle',
  'provenance',
  'createdAt',
  'updatedAt',
] as const;
const SNAPSHOT_KEYS = ['kind', 'names', 'facts', 'representations'] as const;
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
const PROVENANCE_KEYS = ['origin', 'applied', 'importBase'] as const;
const ASSET_REVISION_KEYS = ['assetId', 'revision', 'digest'] as const;
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
const FORBIDDEN_FACT_KEYS = new Set([
  'availability',
  'candidateScore',
  'confidence',
  'occurrences',
  'searchRows',
  'thumbnail',
  'cachePath',
  'runtimePath',
  'providerResponse',
]);
