export const PROJECT_ENTITY_CHARACTER_ASSOCIATION_DIRECTORY =
  'neko/project-bindings/entity-character' as const;

export interface ProjectEntityCharacterAssociationFact {
  readonly projectId: string;
  readonly entityId: string;
  readonly characterProjectId: string;
}

export interface ProjectEntityCharacterAssociationDiagnostic {
  readonly code: 'project-entity-character-association-invalid';
  readonly projectId: string;
  readonly recordName: string;
  readonly message: string;
}

export function parseProjectEntityCharacterAssociationFact(
  value: unknown,
): ProjectEntityCharacterAssociationFact {
  const record = requireRecord(value);
  const keys = Object.keys(record);
  if (
    keys.length !== 3 ||
    keys.some((key) => !['projectId', 'entityId', 'characterProjectId'].includes(key))
  ) {
    throw new Error('Project Entity Character association has unknown or missing fields.');
  }
  return {
    projectId: requireIdentity(record['projectId'], 'Project'),
    entityId: requireIdentity(record['entityId'], 'Project Entity'),
    characterProjectId: requireIdentity(record['characterProjectId'], 'Character Project'),
  };
}

export function parseProjectEntityCharacterAssociationJson(
  json: string,
): ProjectEntityCharacterAssociationFact {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new Error(`Project Entity Character association is not valid JSON: ${String(error)}`);
  }
  return parseProjectEntityCharacterAssociationFact(value);
}

export function serializeProjectEntityCharacterAssociationFact(
  value: ProjectEntityCharacterAssociationFact,
): string {
  return `${JSON.stringify(parseProjectEntityCharacterAssociationFact(value), null, 2)}\n`;
}

export function projectEntityCharacterAssociationRelativePath(entityId: string): string {
  return `${PROJECT_ENTITY_CHARACTER_ASSOCIATION_DIRECTORY}/${encodeAssociationRecordName(entityId)}.json`;
}

export function encodeAssociationRecordName(entityId: string): string {
  return `u${[...requireIdentity(entityId, 'Project Entity')]
    .map((character) => character.codePointAt(0)!.toString(16))
    .join('-')}`;
}

export function decodeAssociationRecordName(recordName: string): string {
  if (!/^u[0-9a-f]+(?:-[0-9a-f]+)*$/.test(recordName)) {
    throw new Error('Project Entity Character association record name is invalid.');
  }
  let identity: string;
  try {
    identity = recordName
      .slice(1)
      .split('-')
      .map((value) => String.fromCodePoint(Number.parseInt(value, 16)))
      .join('');
  } catch {
    throw new Error('Project Entity Character association record name is invalid.');
  }
  if (encodeAssociationRecordName(identity) !== recordName) {
    throw new Error('Project Entity Character association record name is not canonical.');
  }
  return requireIdentity(identity, 'Project Entity');
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Project Entity Character association must be an object.');
  }
  return Object.fromEntries(Object.entries(value));
}

function requireIdentity(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    [...value].length > 80 ||
    value !== value.normalize('NFC') ||
    value.includes('\0') ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('${')
  ) {
    throw new Error(`${label} identity is invalid.`);
  }
  return value;
}
