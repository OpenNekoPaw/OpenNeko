import {
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireIsoDate,
  requireNonNegativeInteger,
  requireOneOf,
  requireString,
  requireUniqueIdentities,
} from './codec';

export const WORLD_MANAGEMENT_SORTS = ['recently-updated', 'title'] as const;
export type WorldManagementSort = (typeof WORLD_MANAGEMENT_SORTS)[number];
export type WorldManagementPlacement = { readonly kind: 'global-catalog' };

export interface WorldManagementCatalogQuery {
  readonly search: string;
  readonly sort: WorldManagementSort;
}

export type WorldManagementCatalogItem =
  | {
      readonly status: 'available';
      readonly globalWorldId: string;
      readonly title: string;
      readonly summary: string;
      readonly currentWorldVersionId: string;
      readonly updatedAt: string;
      readonly versionCount: number;
      readonly runtimeCount: number;
      readonly runtimeEligible: true;
      readonly attentionCount: number;
    }
  | {
      readonly status: 'invalid';
      readonly globalWorldId: string;
      readonly message: string;
    };

export interface WorldManagementDiagnostic {
  readonly recordKind: 'global-world' | 'world-version' | 'world-runtime';
  readonly recordId: string;
  readonly message: string;
}

export interface WorldManagementCatalogProjection {
  readonly scope: WorldManagementPlacement;
  readonly query: WorldManagementCatalogQuery;
  readonly items: readonly WorldManagementCatalogItem[];
  readonly diagnostics: readonly WorldManagementDiagnostic[];
}

export interface WorldManagementVersionSummary {
  readonly worldProjectId: string;
  readonly worldVersionId: string;
  readonly label: string;
  readonly publishedAt: string;
  readonly runtimeCount: number;
  readonly current: boolean;
}

export interface WorldManagementRuntimeSummary {
  readonly worldRunId: string;
  readonly worldSaveId: string;
  readonly worldVersionId: string;
  readonly saveLabel: string;
  readonly activeBranchId: string;
  readonly updatedAt: string;
}

export interface WorldManagementDetailProjection {
  readonly globalWorldId: string;
  readonly title: string;
  readonly summary: string;
  readonly currentWorldVersionId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly versions: readonly WorldManagementVersionSummary[];
  readonly recentRuntimes: readonly WorldManagementRuntimeSummary[];
  readonly diagnostics: readonly WorldManagementDiagnostic[];
}

export function parseWorldManagementCatalogProjection(
  value: unknown,
): WorldManagementCatalogProjection {
  const record = requireExactRecord(
    value,
    ['scope', 'query', 'items', 'diagnostics'],
    'World management catalog projection',
  );
  return {
    scope: parseWorldManagementPlacement(record['scope']),
    query: parseWorldManagementCatalogQuery(record['query']),
    items: requireUniqueIdentities(
      requireArray(record['items'], parseWorldManagementCatalogItem, 'World management items'),
      (item) => item.globalWorldId,
      'World management items',
    ),
    diagnostics: requireArray(
      record['diagnostics'],
      parseWorldManagementDiagnostic,
      'World management diagnostics',
    ),
  };
}

export function parseWorldManagementDetailProjection(
  value: unknown,
): WorldManagementDetailProjection {
  const record = requireExactRecord(
    value,
    [
      'globalWorldId',
      'title',
      'summary',
      'currentWorldVersionId',
      'createdAt',
      'updatedAt',
      'versions',
      'recentRuntimes',
      'diagnostics',
    ],
    'World management detail projection',
  );
  const versions = requireUniqueIdentities(
    requireArray(
      record['versions'],
      parseWorldManagementVersionSummary,
      'World management versions',
    ),
    (version) => version.worldVersionId,
    'World management versions',
  );
  const currentWorldVersionId = requireIdentity(
    record['currentWorldVersionId'],
    'World management current WorldVersion identity',
  );
  if (
    !versions.some((version) => version.worldVersionId === currentWorldVersionId && version.current)
  ) {
    throw new Error('World management current version must exist and be marked current.');
  }
  return {
    globalWorldId: requireIdentity(record['globalWorldId'], 'GlobalWorld identity'),
    title: requireIdentity(record['title'], 'World management title'),
    summary: requireString(record['summary'], 'World management summary'),
    currentWorldVersionId,
    createdAt: requireIsoDate(record['createdAt'], 'World management createdAt'),
    updatedAt: requireIsoDate(record['updatedAt'], 'World management updatedAt'),
    versions,
    recentRuntimes: requireUniqueIdentities(
      requireArray(
        record['recentRuntimes'],
        parseWorldManagementRuntimeSummary,
        'World management recent runtimes',
      ),
      (runtime) => runtime.worldRunId,
      'World management recent runtimes',
    ),
    diagnostics: requireArray(
      record['diagnostics'],
      parseWorldManagementDiagnostic,
      'World management diagnostics',
    ),
  };
}

export function parseWorldManagementPlacement(value: unknown): WorldManagementPlacement {
  const record = requireExactRecord(value, ['kind'], 'World management placement');
  if (record['kind'] !== 'global-catalog') {
    throw new Error(`Unknown World management placement '${String(record['kind'])}'.`);
  }
  return { kind: 'global-catalog' };
}

function parseWorldManagementCatalogQuery(value: unknown): WorldManagementCatalogQuery {
  const record = requireExactRecord(value, ['search', 'sort'], 'World management catalog query');
  return {
    search: requireString(record['search'], 'World management search'),
    sort: requireOneOf(record['sort'], WORLD_MANAGEMENT_SORTS, 'World management sort'),
  };
}

function parseWorldManagementCatalogItem(value: unknown): WorldManagementCatalogItem {
  const record = requireExactRecord(
    value,
    [
      'status',
      'globalWorldId',
      'title',
      'summary',
      'currentWorldVersionId',
      'updatedAt',
      'versionCount',
      'runtimeCount',
      'runtimeEligible',
      'attentionCount',
      'message',
    ],
    'World management catalog item',
  );
  const status = requireOneOf(
    record['status'],
    ['available', 'invalid'] as const,
    'World management item status',
  );
  const globalWorldId = requireIdentity(record['globalWorldId'], 'GlobalWorld identity');
  if (status === 'invalid') {
    return {
      status,
      globalWorldId,
      message: requireIdentity(record['message'], 'World management invalid item diagnostic'),
    };
  }
  if (record['runtimeEligible'] !== true || record['message'] !== undefined) {
    throw new Error('Available global World must be runtime eligible without invalid diagnostic.');
  }
  return {
    status,
    globalWorldId,
    title: requireIdentity(record['title'], 'World management item title'),
    summary: requireString(record['summary'], 'World management item summary'),
    currentWorldVersionId: requireIdentity(
      record['currentWorldVersionId'],
      'World management current WorldVersion identity',
    ),
    updatedAt: requireIsoDate(record['updatedAt'], 'World management item updatedAt'),
    versionCount: requireNonNegativeInteger(
      record['versionCount'],
      'World management version count',
    ),
    runtimeCount: requireNonNegativeInteger(
      record['runtimeCount'],
      'World management runtime count',
    ),
    runtimeEligible: true,
    attentionCount: requireNonNegativeInteger(
      record['attentionCount'],
      'World management attention count',
    ),
  };
}

function parseWorldManagementVersionSummary(value: unknown): WorldManagementVersionSummary {
  const record = requireExactRecord(
    value,
    ['worldProjectId', 'worldVersionId', 'label', 'publishedAt', 'runtimeCount', 'current'],
    'World management version summary',
  );
  if (typeof record['current'] !== 'boolean') {
    throw new Error('World management version current marker must be boolean.');
  }
  return {
    worldProjectId: requireIdentity(record['worldProjectId'], 'World runtime owner identity'),
    worldVersionId: requireIdentity(record['worldVersionId'], 'WorldVersion identity'),
    label: requireIdentity(record['label'], 'WorldVersion label'),
    publishedAt: requireIsoDate(record['publishedAt'], 'WorldVersion publishedAt'),
    runtimeCount: requireNonNegativeInteger(record['runtimeCount'], 'WorldVersion runtime count'),
    current: record['current'],
  };
}

function parseWorldManagementRuntimeSummary(value: unknown): WorldManagementRuntimeSummary {
  const record = requireExactRecord(
    value,
    ['worldRunId', 'worldSaveId', 'worldVersionId', 'saveLabel', 'activeBranchId', 'updatedAt'],
    'World management runtime summary',
  );
  return {
    worldRunId: requireIdentity(record['worldRunId'], 'WorldRun identity'),
    worldSaveId: requireIdentity(record['worldSaveId'], 'WorldSave identity'),
    worldVersionId: requireIdentity(record['worldVersionId'], 'WorldVersion identity'),
    saveLabel: requireIdentity(record['saveLabel'], 'WorldSave label'),
    activeBranchId: requireIdentity(record['activeBranchId'], 'World branch identity'),
    updatedAt: requireIsoDate(record['updatedAt'], 'World runtime updatedAt'),
  };
}

function parseWorldManagementDiagnostic(value: unknown): WorldManagementDiagnostic {
  const record = requireExactRecord(
    value,
    ['recordKind', 'recordId', 'message'],
    'World management diagnostic',
  );
  const recordKind = requireOneOf(
    record['recordKind'],
    ['global-world', 'world-version', 'world-runtime'] as const,
    'World management diagnostic kind',
  );
  return {
    recordKind,
    recordId: requireIdentity(record['recordId'], 'World management diagnostic identity'),
    message: requireIdentity(record['message'], 'World management diagnostic message'),
  };
}
