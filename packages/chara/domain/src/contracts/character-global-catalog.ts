import {
  optionalIdentity,
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireIsoDate,
  requireUniqueIdentities,
} from './codec';
import { parseCharacterDefinition, type CharacterDefinition } from './character';
import { collectCharacterLoreEvidenceIds } from './character-lore-storyline-memory';

export interface GlobalCharacterVersion {
  readonly characterVersionId: string;
  readonly globalCharacterId: string;
  readonly label: string;
  readonly definition: CharacterDefinition;
  readonly acceptedEvidenceIds: readonly string[];
  readonly publishedAt: string;
}

export interface GlobalCharacter {
  readonly globalCharacterId: string;
  readonly displayName: string;
  readonly currentCharacterVersionId: string;
  readonly characterVersionIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CharacterWorkspaceGlobalLink {
  readonly characterProjectId: string;
  readonly globalCharacterId: string;
  readonly lastSyncedCharacterVersionId: string;
}

export interface GlobalCharacterCatalog {
  readonly characters: readonly GlobalCharacter[];
  readonly versions: readonly GlobalCharacterVersion[];
  readonly links: readonly CharacterWorkspaceGlobalLink[];
  readonly diagnostics: readonly GlobalCharacterCatalogDiagnostic[];
}

export function parseGlobalCharacterVersion(value: unknown): GlobalCharacterVersion {
  const record = requireExactRecord(
    value,
    [
      'characterVersionId',
      'globalCharacterId',
      'label',
      'definition',
      'acceptedEvidenceIds',
      'publishedAt',
    ],
    'GlobalCharacterVersion',
  );
  const acceptedEvidenceIds = requireUniqueIdentities(
    requireArray(
      record['acceptedEvidenceIds'],
      (item) => requireIdentity(item, 'GlobalCharacterVersion accepted evidence identity'),
      'GlobalCharacterVersion accepted evidence identities',
    ),
    (identity) => identity,
    'GlobalCharacterVersion accepted evidence identities',
  );
  const definition = parseCharacterDefinition(record['definition']);
  const missingEvidenceId = collectCharacterLoreEvidenceIds(definition).find(
    (identity) => !acceptedEvidenceIds.includes(identity),
  );
  if (missingEvidenceId !== undefined) {
    throw new Error(
      `GlobalCharacterVersion lore references unknown evidence '${missingEvidenceId}'.`,
    );
  }
  return {
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'GlobalCharacterVersion identity',
    ),
    globalCharacterId: requireIdentity(
      record['globalCharacterId'],
      'GlobalCharacterVersion owner identity',
    ),
    label: requireIdentity(record['label'], 'GlobalCharacterVersion label'),
    definition,
    acceptedEvidenceIds,
    publishedAt: requireIsoDate(record['publishedAt'], 'GlobalCharacterVersion publishedAt'),
  };
}

export interface GlobalCharacterCatalogDiagnostic {
  readonly recordKind: 'global-character' | 'character-version';
  readonly recordId?: string;
  readonly message: string;
}

export function parseGlobalCharacter(value: unknown): GlobalCharacter {
  const record = requireExactRecord(
    value,
    [
      'globalCharacterId',
      'displayName',
      'currentCharacterVersionId',
      'characterVersionIds',
      'createdAt',
      'updatedAt',
    ],
    'GlobalCharacter',
  );
  const characterVersionIds = requireUniqueIdentities(
    requireArray(
      record['characterVersionIds'],
      (item) => requireIdentity(item, 'GlobalCharacter CharacterVersion identity'),
      'GlobalCharacter CharacterVersion identities',
    ),
    (identity) => identity,
    'GlobalCharacter CharacterVersion identities',
  );
  const currentCharacterVersionId = requireIdentity(
    record['currentCharacterVersionId'],
    'GlobalCharacter current CharacterVersion identity',
  );
  if (!characterVersionIds.includes(currentCharacterVersionId)) {
    throw new Error('GlobalCharacter current CharacterVersion must belong to its version history.');
  }
  return {
    globalCharacterId: requireIdentity(record['globalCharacterId'], 'GlobalCharacter identity'),
    displayName: requireIdentity(record['displayName'], 'GlobalCharacter display name'),
    currentCharacterVersionId,
    characterVersionIds,
    createdAt: requireIsoDate(record['createdAt'], 'GlobalCharacter createdAt'),
    updatedAt: requireIsoDate(record['updatedAt'], 'GlobalCharacter updatedAt'),
  };
}

export function parseCharacterWorkspaceGlobalLink(value: unknown): CharacterWorkspaceGlobalLink {
  const record = requireExactRecord(
    value,
    ['characterProjectId', 'globalCharacterId', 'lastSyncedCharacterVersionId'],
    'Character Workspace global link',
  );
  return {
    characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject identity'),
    globalCharacterId: requireIdentity(record['globalCharacterId'], 'GlobalCharacter identity'),
    lastSyncedCharacterVersionId: requireIdentity(
      record['lastSyncedCharacterVersionId'],
      'Last synchronized CharacterVersion identity',
    ),
  };
}

export function parseGlobalCharacterCatalog(value: unknown): GlobalCharacterCatalog {
  const record = requireExactRecord(
    value,
    ['characters', 'versions', 'links', 'diagnostics'],
    'Global Character catalog',
  );
  const characters = requireUniqueIdentities(
    requireArray(record['characters'], parseGlobalCharacter, 'Global Characters'),
    (character) => character.globalCharacterId,
    'Global Characters',
  );
  const versions = requireUniqueIdentities(
    requireArray(record['versions'], parseGlobalCharacterVersion, 'Global CharacterVersions'),
    (version) => version.characterVersionId,
    'Global CharacterVersions',
  );
  const versionIds = new Set(versions.map((version) => version.characterVersionId));
  const links = requireUniqueIdentities(
    requireArray(record['links'], parseCharacterWorkspaceGlobalLink, 'Character Workspace links'),
    (link) => link.characterProjectId,
    'Character Workspace links',
  );
  for (const character of characters) {
    const unavailable = character.characterVersionIds.find((identity) => !versionIds.has(identity));
    if (unavailable) {
      throw new Error(
        `GlobalCharacter '${character.globalCharacterId}' references unavailable CharacterVersion '${unavailable}'.`,
      );
    }
    const wrongOwner = versions.find(
      (version) =>
        character.characterVersionIds.includes(version.characterVersionId) &&
        version.globalCharacterId !== character.globalCharacterId,
    );
    if (wrongOwner) {
      throw new Error(
        `GlobalCharacter '${character.globalCharacterId}' does not own CharacterVersion '${wrongOwner.characterVersionId}'.`,
      );
    }
  }
  return {
    characters,
    versions,
    links,
    diagnostics: requireArray(
      record['diagnostics'],
      parseGlobalCharacterCatalogDiagnostic,
      'Global Character catalog diagnostics',
    ),
  };
}

function parseGlobalCharacterCatalogDiagnostic(value: unknown): GlobalCharacterCatalogDiagnostic {
  const record = requireExactRecord(
    value,
    ['recordKind', 'recordId', 'message'],
    'Global Character catalog diagnostic',
  );
  if (record['recordKind'] !== 'global-character' && record['recordKind'] !== 'character-version') {
    throw new Error(
      `Unknown Global Character catalog record kind: ${String(record['recordKind'])}`,
    );
  }
  const recordId = optionalIdentity(record['recordId'], 'Global Character catalog record identity');
  return {
    recordKind: record['recordKind'],
    ...(recordId === undefined ? {} : { recordId }),
    message: requireIdentity(record['message'], 'Global Character catalog diagnostic message'),
  };
}
