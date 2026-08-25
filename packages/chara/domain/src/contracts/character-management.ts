import {
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireNonNegativeInteger,
  requireOneOf,
  requireUniqueIdentities,
} from './codec';
import {
  parseCharacterVersionReferenceInventory,
  type CharacterVersionReferenceInventory,
} from './character-version-reference';

export type CharacterManagementPlacement =
  { readonly kind: 'global-catalog' } | { readonly kind: 'project'; readonly projectId: string };

export interface CharacterManagementLineageNodeSummary {
  readonly characterVersionId: string;
  readonly label: string;
  readonly state: 'declared-root' | 'linked' | 'unlinked';
  readonly isHead: boolean;
  readonly isDraftBasis: boolean;
  readonly parentCharacterVersionId?: string;
}

export type CharacterManagementLineageSummary =
  | {
      readonly status: 'available';
      readonly rootCount: number;
      readonly headCount: number;
      readonly unlinkedCount: number;
      readonly nodes: readonly CharacterManagementLineageNodeSummary[];
      readonly hiddenNodeCount: number;
    }
  | { readonly status: 'unavailable'; readonly message: string };

export interface CharacterManagementDetailProjection {
  readonly characterProjectId: string;
  readonly placement: CharacterManagementPlacement;
  readonly storylineCount: number;
  readonly lineage: CharacterManagementLineageSummary;
  readonly referenceInventories: readonly CharacterVersionReferenceInventory[];
}

export function parseCharacterManagementDetailProjection(
  value: unknown,
): CharacterManagementDetailProjection {
  const record = requireExactRecord(
    value,
    ['characterProjectId', 'placement', 'storylineCount', 'lineage', 'referenceInventories'],
    'Character management detail projection',
  );
  const characterProjectId = requireIdentity(
    record['characterProjectId'],
    'Character management CharacterProject identity',
  );
  const referenceInventories = requireUniqueIdentities(
    requireArray(
      record['referenceInventories'],
      parseCharacterVersionReferenceInventory,
      'Character management reference inventories',
    ),
    (inventory) => inventory.characterVersionId,
    'Character management reference inventories',
  );
  return {
    characterProjectId,
    placement: parseCharacterManagementPlacement(record['placement']),
    storylineCount: requireNonNegativeInteger(
      record['storylineCount'],
      'Character management Storyline count',
    ),
    lineage: parseCharacterManagementLineageSummary(record['lineage']),
    referenceInventories,
  };
}

function parseCharacterManagementPlacement(value: unknown): CharacterManagementPlacement {
  const record = requireExactRecord(value, ['kind', 'projectId'], 'Character management placement');
  const kind = requireOneOf(
    record['kind'],
    ['global-catalog', 'project'] as const,
    'Character management placement kind',
  );
  if (kind === 'global-catalog') {
    if (record['projectId'] !== undefined) {
      throw new Error('Global Character placement cannot carry Project identity.');
    }
    return { kind };
  }
  return {
    kind,
    projectId: requireIdentity(record['projectId'], 'Character management Project identity'),
  };
}

function parseCharacterManagementLineageSummary(value: unknown): CharacterManagementLineageSummary {
  const record = requireExactRecord(
    value,
    ['status', 'rootCount', 'headCount', 'unlinkedCount', 'nodes', 'hiddenNodeCount', 'message'],
    'Character management lineage summary',
  );
  const status = requireOneOf(
    record['status'],
    ['available', 'unavailable'] as const,
    'Character management lineage status',
  );
  if (status === 'unavailable') {
    if (
      record['rootCount'] !== undefined ||
      record['headCount'] !== undefined ||
      record['unlinkedCount'] !== undefined ||
      record['nodes'] !== undefined ||
      record['hiddenNodeCount'] !== undefined
    ) {
      throw new Error('Unavailable Character lineage cannot carry graph summary fields.');
    }
    return {
      status,
      message: requireIdentity(record['message'], 'Character management lineage diagnostic'),
    };
  }
  if (record['message'] !== undefined) {
    throw new Error('Available Character lineage cannot carry an unavailable diagnostic.');
  }
  const nodes = requireUniqueIdentities(
    requireArray(
      record['nodes'],
      parseCharacterManagementLineageNodeSummary,
      'Character management lineage nodes',
    ),
    (node) => node.characterVersionId,
    'Character management lineage nodes',
  );
  return {
    status,
    rootCount: requireNonNegativeInteger(record['rootCount'], 'Character lineage root count'),
    headCount: requireNonNegativeInteger(record['headCount'], 'Character lineage head count'),
    unlinkedCount: requireNonNegativeInteger(
      record['unlinkedCount'],
      'Character lineage unlinked count',
    ),
    nodes,
    hiddenNodeCount: requireNonNegativeInteger(
      record['hiddenNodeCount'],
      'Character lineage hidden node count',
    ),
  };
}

function parseCharacterManagementLineageNodeSummary(
  value: unknown,
): CharacterManagementLineageNodeSummary {
  const record = requireExactRecord(
    value,
    ['characterVersionId', 'label', 'state', 'isHead', 'isDraftBasis', 'parentCharacterVersionId'],
    'Character management lineage node',
  );
  if (typeof record['isHead'] !== 'boolean' || typeof record['isDraftBasis'] !== 'boolean') {
    throw new Error('Character management lineage node flags must be boolean.');
  }
  const parentCharacterVersionId =
    record['parentCharacterVersionId'] === undefined
      ? undefined
      : requireIdentity(
          record['parentCharacterVersionId'],
          'Character management lineage parent identity',
        );
  return {
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'Character management lineage CharacterVersion identity',
    ),
    label: requireIdentity(record['label'], 'Character management lineage label'),
    state: requireOneOf(
      record['state'],
      ['declared-root', 'linked', 'unlinked'] as const,
      'Character management lineage node state',
    ),
    isHead: record['isHead'],
    isDraftBasis: record['isDraftBasis'],
    ...(parentCharacterVersionId === undefined ? {} : { parentCharacterVersionId }),
  };
}
