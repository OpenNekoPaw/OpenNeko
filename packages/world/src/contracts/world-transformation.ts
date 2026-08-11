import {
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireIsoDate,
  requireJsonValue,
  requireNonNegativeInteger,
  requireOneOf,
  requireUniqueIdentities,
  type WorldJsonValue,
} from './codec';

export const WORLD_TRANSFORMATION_CATEGORIES = [
  'world-state',
  'world-structure',
  'world-story',
  'world-gameplay',
  'character-canon',
  'presentation',
] as const;

export const WORLD_TRANSFORMATION_OWNERS = [
  'world-runtime',
  'world-definition',
  'world-story',
  'world-gameplay',
  'chara',
  'world-presentation',
] as const;

export const WORLD_CAPABILITY_KINDS = [
  'world-action',
  'owner',
  'interaction-surface',
  'execution-profile',
  'presentation-profile',
  'agent-role',
  'adapter',
  'provider',
] as const;

export const WORLD_CAPABILITY_REQUIREMENT_MODES = ['required', 'optional'] as const;

export type WorldTransformationCategory = (typeof WORLD_TRANSFORMATION_CATEGORIES)[number];
export type WorldTransformationOwner = (typeof WORLD_TRANSFORMATION_OWNERS)[number];
export type WorldCapabilityKind = (typeof WORLD_CAPABILITY_KINDS)[number];
export type WorldCapabilityRequirementMode = (typeof WORLD_CAPABILITY_REQUIREMENT_MODES)[number];

export interface WorldCapabilityRequirement {
  readonly capabilityKind: WorldCapabilityKind;
  readonly capabilityId: string;
  readonly mode: WorldCapabilityRequirementMode;
}

export interface WorldCapabilityRegistration {
  readonly capabilityKind: WorldCapabilityKind;
  readonly capabilityId: string;
}

export type WorldSemanticDiffEntry =
  | {
      readonly operation: 'add';
      readonly semanticRef: string;
      readonly after: WorldJsonValue;
    }
  | {
      readonly operation: 'remove';
      readonly semanticRef: string;
      readonly before: WorldJsonValue;
    }
  | {
      readonly operation: 'replace';
      readonly semanticRef: string;
      readonly before: WorldJsonValue;
      readonly after: WorldJsonValue;
    };

export type WorldTransformationBase =
  | {
      readonly kind: 'runtime';
      readonly worldVersionId: string;
      readonly worldRunId: string;
      readonly worldSaveId: string;
      readonly branchId: string;
      readonly worldStateRevision: number;
      readonly timepoint: number;
    }
  | {
      readonly kind: 'authoring';
      readonly ownerRecordId: string;
    };

export interface WorldTransformationCandidate {
  readonly worldTransformationCandidateId: string;
  readonly category: WorldTransformationCategory;
  readonly owner: WorldTransformationOwner;
  readonly requester: {
    readonly actorId: string;
    readonly authority: 'participant' | 'author';
  };
  readonly base: WorldTransformationBase;
  readonly source: {
    readonly intent: string;
    readonly sourceRefIds: readonly string[];
  };
  readonly diff: readonly WorldSemanticDiffEntry[];
  readonly requirements: readonly WorldCapabilityRequirement[];
  readonly createdAt: string;
}

export interface WorldCapabilityGapDiagnostic {
  readonly code: 'world-capability-unavailable';
  readonly worldTransformationCandidateId: string;
  readonly capabilityKind: WorldCapabilityKind;
  readonly capabilityId: string;
  readonly mode: WorldCapabilityRequirementMode;
  readonly message: string;
}

const OWNER_BY_CATEGORY: Readonly<Record<WorldTransformationCategory, WorldTransformationOwner>> = {
  'world-state': 'world-runtime',
  'world-structure': 'world-definition',
  'world-story': 'world-story',
  'world-gameplay': 'world-gameplay',
  'character-canon': 'chara',
  presentation: 'world-presentation',
};

export function ownerForWorldTransformationCategory(
  category: WorldTransformationCategory,
): WorldTransformationOwner {
  return OWNER_BY_CATEGORY[category];
}

export function worldFactSemanticRef(factId: string): string {
  const identity = requireIdentity(factId, 'WorldFact');
  return identity.startsWith('world-fact:') ? identity : `world-fact:${identity}`;
}

export function parseWorldCapabilityRequirement(value: unknown): WorldCapabilityRequirement {
  const record = requireExactRecord(
    value,
    ['capabilityKind', 'capabilityId', 'mode'],
    'World capability requirement',
  );
  return {
    capabilityKind: requireOneOf(
      record['capabilityKind'],
      WORLD_CAPABILITY_KINDS,
      'World capability kind',
    ),
    capabilityId: requireIdentity(record['capabilityId'], 'World capability'),
    mode: requireOneOf(
      record['mode'],
      WORLD_CAPABILITY_REQUIREMENT_MODES,
      'World capability requirement mode',
    ),
  };
}

export function parseWorldCapabilityRegistration(value: unknown): WorldCapabilityRegistration {
  const record = requireExactRecord(
    value,
    ['capabilityKind', 'capabilityId'],
    'World capability registration',
  );
  return {
    capabilityKind: requireOneOf(
      record['capabilityKind'],
      WORLD_CAPABILITY_KINDS,
      'World capability kind',
    ),
    capabilityId: requireIdentity(record['capabilityId'], 'World capability'),
  };
}

export function parseWorldTransformationCandidate(value: unknown): WorldTransformationCandidate {
  const record = requireExactRecord(
    value,
    [
      'worldTransformationCandidateId',
      'category',
      'owner',
      'requester',
      'base',
      'source',
      'diff',
      'requirements',
      'createdAt',
    ],
    'World transformation candidate',
  );
  const category = requireOneOf(
    record['category'],
    WORLD_TRANSFORMATION_CATEGORIES,
    'World transformation category',
  );
  const owner = requireOneOf(
    record['owner'],
    WORLD_TRANSFORMATION_OWNERS,
    'World transformation owner',
  );
  if (owner !== ownerForWorldTransformationCategory(category)) {
    throw new Error(
      `World transformation category '${category}' must target '${ownerForWorldTransformationCategory(category)}'.`,
    );
  }
  const requester = requireExactRecord(
    record['requester'],
    ['actorId', 'authority'],
    'World transformation requester',
  );
  const source = requireExactRecord(
    record['source'],
    ['intent', 'sourceRefIds'],
    'World transformation source',
  );
  const diff = requireArray(record['diff'], parseWorldSemanticDiffEntry, 'World semantic diff');
  if (diff.length === 0) throw new Error('World semantic diff must contain at least one change.');
  requireUniqueIdentities(diff, (entry) => entry.semanticRef, 'World semantic diff');
  const requirements = requireArray(
    record['requirements'],
    parseWorldCapabilityRequirement,
    'World capability requirements',
  );
  requireUniqueIdentities(
    requirements,
    (requirement) => `${requirement.capabilityKind}:${requirement.capabilityId}`,
    'World capability requirements',
  );
  const base = parseWorldTransformationBase(record['base']);
  if (category === 'world-state' && base.kind !== 'runtime') {
    throw new Error('World state transformation requires an exact runtime base.');
  }
  return {
    worldTransformationCandidateId: requireIdentity(
      record['worldTransformationCandidateId'],
      'WorldTransformationCandidate',
    ),
    category,
    owner,
    requester: {
      actorId: requireIdentity(requester['actorId'], 'World transformation requester actor'),
      authority: requireOneOf(
        requester['authority'],
        ['participant', 'author'] as const,
        'World transformation requester authority',
      ),
    },
    base,
    source: {
      intent: requireIdentity(source['intent'], 'World transformation creative intent'),
      sourceRefIds: requireUniqueIdentities(
        requireArray(
          source['sourceRefIds'],
          (item) => requireIdentity(item, 'World transformation source reference'),
          'World transformation source references',
        ),
        (item) => item,
        'World transformation source references',
      ),
    },
    diff,
    requirements,
    createdAt: requireIsoDate(record['createdAt'], 'World transformation createdAt'),
  };
}

function parseWorldTransformationBase(value: unknown): WorldTransformationBase {
  const kindRecord = requireExactRecordByKind(value, 'World transformation base');
  if (kindRecord.kind === 'runtime') {
    const record = requireExactRecord(
      value,
      [
        'kind',
        'worldVersionId',
        'worldRunId',
        'worldSaveId',
        'branchId',
        'worldStateRevision',
        'timepoint',
      ],
      'World runtime transformation base',
    );
    return {
      kind: 'runtime',
      worldVersionId: requireIdentity(record['worldVersionId'], 'WorldVersion'),
      worldRunId: requireIdentity(record['worldRunId'], 'WorldRun'),
      worldSaveId: requireIdentity(record['worldSaveId'], 'WorldSave'),
      branchId: requireIdentity(record['branchId'], 'World branch'),
      worldStateRevision: requireNonNegativeInteger(
        record['worldStateRevision'],
        'World state revision',
      ),
      timepoint: requireNonNegativeInteger(record['timepoint'], 'World timepoint'),
    };
  }
  if (kindRecord.kind === 'authoring') {
    const record = requireExactRecord(
      value,
      ['kind', 'ownerRecordId'],
      'World authoring transformation base',
    );
    return {
      kind: 'authoring',
      ownerRecordId: requireIdentity(record['ownerRecordId'], 'World authoring record'),
    };
  }
  throw new Error(`Unknown World transformation base kind '${String(kindRecord.kind)}'.`);
}

function parseWorldSemanticDiffEntry(value: unknown): WorldSemanticDiffEntry {
  const operationRecord = requireExactRecordByKind(value, 'World semantic diff entry', 'operation');
  if (operationRecord.kind === 'add') {
    const record = requireExactRecord(
      value,
      ['operation', 'semanticRef', 'after'],
      'World semantic add diff',
    );
    return {
      operation: 'add',
      semanticRef: requireIdentity(record['semanticRef'], 'World semantic reference'),
      after: requireJsonValue(record['after'], 'World semantic after value'),
    };
  }
  if (operationRecord.kind === 'remove') {
    const record = requireExactRecord(
      value,
      ['operation', 'semanticRef', 'before'],
      'World semantic remove diff',
    );
    return {
      operation: 'remove',
      semanticRef: requireIdentity(record['semanticRef'], 'World semantic reference'),
      before: requireJsonValue(record['before'], 'World semantic before value'),
    };
  }
  if (operationRecord.kind === 'replace') {
    const record = requireExactRecord(
      value,
      ['operation', 'semanticRef', 'before', 'after'],
      'World semantic replace diff',
    );
    return {
      operation: 'replace',
      semanticRef: requireIdentity(record['semanticRef'], 'World semantic reference'),
      before: requireJsonValue(record['before'], 'World semantic before value'),
      after: requireJsonValue(record['after'], 'World semantic after value'),
    };
  }
  throw new Error(`Unknown World semantic diff operation '${String(operationRecord.kind)}'.`);
}

function requireExactRecordByKind(
  value: unknown,
  label: string,
  key = 'kind',
): { readonly kind: unknown } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return { kind: (value as Readonly<Record<string, unknown>>)[key] };
}
