import {
  optionalIdentity,
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireIsoDate,
  requireUniqueIdentities,
} from './codec';
import { parseWorldDefinition, type WorldDefinition } from './world';

export interface GlobalWorldVersion {
  readonly worldVersionId: string;
  readonly globalWorldId: string;
  readonly label: string;
  readonly definition: WorldDefinition;
  readonly acceptedSourceRefIds: readonly string[];
  readonly publishedAt: string;
}

export interface GlobalWorld {
  readonly globalWorldId: string;
  readonly title: string;
  readonly currentWorldVersionId: string;
  readonly worldVersionIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorldWorkspaceGlobalLink {
  readonly worldProjectId: string;
  readonly globalWorldId: string;
  readonly lastSyncedWorldVersionId: string;
}

export interface GlobalWorldCatalog {
  readonly worlds: readonly GlobalWorld[];
  readonly versions: readonly GlobalWorldVersion[];
  readonly links: readonly WorldWorkspaceGlobalLink[];
  readonly diagnostics: readonly GlobalWorldCatalogDiagnostic[];
}

export function parseGlobalWorldVersion(value: unknown): GlobalWorldVersion {
  const record = requireExactRecord(
    value,
    [
      'worldVersionId',
      'globalWorldId',
      'label',
      'definition',
      'acceptedSourceRefIds',
      'publishedAt',
    ],
    'GlobalWorldVersion',
  );
  const acceptedSourceRefIds = requireUniqueIdentities(
    requireArray(
      record['acceptedSourceRefIds'],
      (item) => requireIdentity(item, 'GlobalWorldVersion accepted source identity'),
      'GlobalWorldVersion accepted source identities',
    ),
    (identity) => identity,
    'GlobalWorldVersion accepted source identities',
  );
  const definition = parseWorldDefinition(record['definition']);
  const referencedSourceIds = [
    ...definition.worldBook.flatMap((item) => item.sourceRefIds),
    ...definition.locations.flatMap((item) => item.sourceRefIds),
    ...definition.organizations.flatMap((item) => item.sourceRefIds),
    ...definition.rules.flatMap((item) => item.sourceRefIds),
  ];
  const missingSourceId = referencedSourceIds.find(
    (identity) => !acceptedSourceRefIds.includes(identity),
  );
  if (missingSourceId !== undefined) {
    throw new Error(
      `GlobalWorldVersion definition references unknown source '${missingSourceId}'.`,
    );
  }
  return {
    worldVersionId: requireIdentity(record['worldVersionId'], 'GlobalWorldVersion identity'),
    globalWorldId: requireIdentity(record['globalWorldId'], 'GlobalWorldVersion owner identity'),
    label: requireIdentity(record['label'], 'GlobalWorldVersion label'),
    definition,
    acceptedSourceRefIds,
    publishedAt: requireIsoDate(record['publishedAt'], 'GlobalWorldVersion publishedAt'),
  };
}

export interface GlobalWorldCatalogDiagnostic {
  readonly recordKind: 'global-world' | 'world-version';
  readonly recordId?: string;
  readonly message: string;
}

export function parseGlobalWorld(value: unknown): GlobalWorld {
  const record = requireExactRecord(
    value,
    [
      'globalWorldId',
      'title',
      'currentWorldVersionId',
      'worldVersionIds',
      'createdAt',
      'updatedAt',
    ],
    'GlobalWorld',
  );
  const worldVersionIds = requireUniqueIdentities(
    requireArray(
      record['worldVersionIds'],
      (item) => requireIdentity(item, 'GlobalWorld WorldVersion identity'),
      'GlobalWorld WorldVersion identities',
    ),
    (identity) => identity,
    'GlobalWorld WorldVersion identities',
  );
  const currentWorldVersionId = requireIdentity(
    record['currentWorldVersionId'],
    'GlobalWorld current WorldVersion identity',
  );
  if (!worldVersionIds.includes(currentWorldVersionId)) {
    throw new Error('GlobalWorld current WorldVersion must belong to its version history.');
  }
  return {
    globalWorldId: requireIdentity(record['globalWorldId'], 'GlobalWorld identity'),
    title: requireIdentity(record['title'], 'GlobalWorld title'),
    currentWorldVersionId,
    worldVersionIds,
    createdAt: requireIsoDate(record['createdAt'], 'GlobalWorld createdAt'),
    updatedAt: requireIsoDate(record['updatedAt'], 'GlobalWorld updatedAt'),
  };
}

export function parseWorldWorkspaceGlobalLink(value: unknown): WorldWorkspaceGlobalLink {
  const record = requireExactRecord(
    value,
    ['worldProjectId', 'globalWorldId', 'lastSyncedWorldVersionId'],
    'World Workspace global link',
  );
  return {
    worldProjectId: requireIdentity(record['worldProjectId'], 'WorldProject identity'),
    globalWorldId: requireIdentity(record['globalWorldId'], 'GlobalWorld identity'),
    lastSyncedWorldVersionId: requireIdentity(
      record['lastSyncedWorldVersionId'],
      'Last synchronized WorldVersion identity',
    ),
  };
}

export function parseGlobalWorldCatalog(value: unknown): GlobalWorldCatalog {
  const record = requireExactRecord(
    value,
    ['worlds', 'versions', 'links', 'diagnostics'],
    'Global World catalog',
  );
  const worlds = requireUniqueIdentities(
    requireArray(record['worlds'], parseGlobalWorld, 'Global Worlds'),
    (world) => world.globalWorldId,
    'Global Worlds',
  );
  const versions = requireUniqueIdentities(
    requireArray(record['versions'], parseGlobalWorldVersion, 'Global WorldVersions'),
    (version) => version.worldVersionId,
    'Global WorldVersions',
  );
  const versionIds = new Set(versions.map((version) => version.worldVersionId));
  const links = requireUniqueIdentities(
    requireArray(record['links'], parseWorldWorkspaceGlobalLink, 'World Workspace links'),
    (link) => link.worldProjectId,
    'World Workspace links',
  );
  for (const world of worlds) {
    const unavailable = world.worldVersionIds.find((identity) => !versionIds.has(identity));
    if (unavailable) {
      throw new Error(
        `GlobalWorld '${world.globalWorldId}' references unavailable WorldVersion '${unavailable}'.`,
      );
    }
    const wrongOwner = versions.find(
      (version) =>
        world.worldVersionIds.includes(version.worldVersionId) &&
        version.globalWorldId !== world.globalWorldId,
    );
    if (wrongOwner) {
      throw new Error(
        `GlobalWorld '${world.globalWorldId}' does not own WorldVersion '${wrongOwner.worldVersionId}'.`,
      );
    }
  }
  return {
    worlds,
    versions,
    links,
    diagnostics: requireArray(
      record['diagnostics'],
      parseGlobalWorldCatalogDiagnostic,
      'Global World catalog diagnostics',
    ),
  };
}

function parseGlobalWorldCatalogDiagnostic(value: unknown): GlobalWorldCatalogDiagnostic {
  const record = requireExactRecord(
    value,
    ['recordKind', 'recordId', 'message'],
    'Global World catalog diagnostic',
  );
  if (record['recordKind'] !== 'global-world' && record['recordKind'] !== 'world-version') {
    throw new Error(`Unknown Global World catalog record kind: ${String(record['recordKind'])}`);
  }
  const recordId = optionalIdentity(record['recordId'], 'Global World catalog record identity');
  return {
    recordKind: record['recordKind'],
    ...(recordId === undefined ? {} : { recordId }),
    message: requireIdentity(record['message'], 'Global World catalog diagnostic message'),
  };
}
