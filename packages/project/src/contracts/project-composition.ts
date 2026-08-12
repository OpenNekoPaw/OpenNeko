import type { CharacterProject, CharacterVersion } from '@neko/chara/contracts';
import type { WorldExperienceVersionId, WorldProject } from '@neko/world/contracts';

export type ContentProjectId = string;
export type CharacterProjectId = CharacterProject['characterProjectId'];
export type CharacterVersionId = CharacterVersion['characterVersionId'];
export type WorldProjectId = WorldProject['worldProjectId'];
export type ProjectEntityId = string;

export interface ProjectEntityCharacterAssociation {
  readonly entityId: ProjectEntityId;
  readonly characterProjectId: CharacterProjectId;
}

export type ProjectLocalTargetRef =
  | { readonly kind: 'character-project'; readonly characterProjectId: CharacterProjectId }
  | { readonly kind: 'world-project'; readonly worldProjectId: WorldProjectId };

export type ProjectAuthoringTargetRef =
  | { readonly kind: 'content-project'; readonly contentProjectId: ContentProjectId }
  | ProjectLocalTargetRef;

export type ProjectPublicationDependencyRef =
  | { readonly kind: 'character-version'; readonly characterVersionId: CharacterVersionId }
  | {
      readonly kind: 'world-experience-version';
      readonly worldExperienceVersionId: WorldExperienceVersionId;
    };

export interface ContentProjectComposition {
  readonly contentProjectId: ContentProjectId;
  readonly localTargets: readonly ProjectLocalTargetRef[];
  readonly dependencies: readonly ProjectPublicationDependencyRef[];
  readonly entityCharacterAssociations: readonly ProjectEntityCharacterAssociation[];
}

export function parseContentProjectComposition(value: unknown): ContentProjectComposition {
  const record = requireExactRecord(
    value,
    ['contentProjectId', 'localTargets', 'dependencies', 'entityCharacterAssociations'],
    'ContentProjectComposition',
  );
  const localTargets = requireArray(record['localTargets'], parseProjectLocalTargetRef);
  const dependencies = requireArray(record['dependencies'], parseProjectPublicationDependencyRef);
  const entityCharacterAssociations = requireArray(
    record['entityCharacterAssociations'],
    parseProjectEntityCharacterAssociation,
  );
  requireUnique(localTargets, projectLocalTargetKey, 'Project local targets');
  requireUnique(dependencies, projectPublicationDependencyKey, 'Project dependencies');
  requireUnique(
    entityCharacterAssociations,
    (association) => association.entityId,
    'Project Entity Character association Entity identities',
  );
  requireUnique(
    entityCharacterAssociations,
    (association) => association.characterProjectId,
    'Project Entity Character association CharacterProject identities',
  );
  const characterTargets = new Set(
    localTargets.flatMap((target) =>
      target.kind === 'character-project' ? [target.characterProjectId] : [],
    ),
  );
  for (const association of entityCharacterAssociations) {
    if (!characterTargets.has(association.characterProjectId)) {
      throw new Error(
        `Project Entity Character association references unlinked CharacterProject '${association.characterProjectId}'.`,
      );
    }
  }
  return {
    contentProjectId: requireIdentity(record['contentProjectId'], 'Content Project identity'),
    localTargets,
    dependencies,
    entityCharacterAssociations,
  };
}

export function parseProjectEntityCharacterAssociation(
  value: unknown,
): ProjectEntityCharacterAssociation {
  const record = requireExactRecord(
    value,
    ['entityId', 'characterProjectId'],
    'Project Entity Character association',
  );
  return {
    entityId: requireIdentity(record['entityId'], 'Project Entity identity'),
    characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject identity'),
  };
}

export function projectEntityCharacterAssociationKey(
  association: ProjectEntityCharacterAssociation,
): string {
  return `${association.entityId}:${association.characterProjectId}`;
}

export function parseProjectLocalTargetRef(value: unknown): ProjectLocalTargetRef {
  const record = requireRecord(value, 'Project local target');
  if (record['kind'] === 'character-project') {
    requireExactKeys(record, ['kind', 'characterProjectId'], 'Character Project target');
    return {
      kind: 'character-project',
      characterProjectId: requireIdentity(
        record['characterProjectId'],
        'Character Project identity',
      ),
    };
  }
  if (record['kind'] === 'world-project') {
    requireExactKeys(record, ['kind', 'worldProjectId'], 'World Project target');
    return {
      kind: 'world-project',
      worldProjectId: requireIdentity(record['worldProjectId'], 'World Project identity'),
    };
  }
  throw new Error(`Unknown Project local target kind: ${String(record['kind'])}`);
}

export function parseProjectAuthoringTargetRef(value: unknown): ProjectAuthoringTargetRef {
  const record = requireRecord(value, 'Project authoring target');
  if (record['kind'] === 'content-project') {
    requireExactKeys(record, ['kind', 'contentProjectId'], 'Content Project authoring target');
    return {
      kind: 'content-project',
      contentProjectId: requireIdentity(record['contentProjectId'], 'Content Project identity'),
    };
  }
  return parseProjectLocalTargetRef(record);
}

export function parseProjectPublicationDependencyRef(
  value: unknown,
): ProjectPublicationDependencyRef {
  const record = requireRecord(value, 'Project publication dependency');
  if (record['kind'] === 'character-version') {
    requireExactKeys(record, ['kind', 'characterVersionId'], 'Character publication dependency');
    return {
      kind: 'character-version',
      characterVersionId: requireIdentity(
        record['characterVersionId'],
        'CharacterVersion identity',
      ),
    };
  }
  if (record['kind'] === 'world-experience-version') {
    requireExactKeys(
      record,
      ['kind', 'worldExperienceVersionId'],
      'World Experience publication dependency',
    );
    return {
      kind: 'world-experience-version',
      worldExperienceVersionId: requireIdentity(
        record['worldExperienceVersionId'],
        'WorldExperienceVersion identity',
      ),
    };
  }
  throw new Error(`Unknown Project publication dependency kind: ${String(record['kind'])}`);
}

export function projectLocalTargetKey(target: ProjectLocalTargetRef): string {
  return target.kind === 'character-project'
    ? `character-project:${target.characterProjectId}`
    : `world-project:${target.worldProjectId}`;
}

export function projectAuthoringTargetKey(target: ProjectAuthoringTargetRef): string {
  return target.kind === 'content-project'
    ? `content-project:${target.contentProjectId}`
    : projectLocalTargetKey(target);
}

export function projectPublicationDependencyKey(
  dependency: ProjectPublicationDependencyRef,
): string {
  return dependency.kind === 'character-version'
    ? `character-version:${dependency.characterVersionId}`
    : `world-experience-version:${dependency.worldExperienceVersionId}`;
}

function requireArray<T>(value: unknown, parse: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new Error('Project composition field must be an array.');
  return value.map(parse);
}

function requireExactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  const record = requireRecord(value, label);
  requireExactKeys(record, keys, label);
  return record;
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  const expected = new Set(keys);
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !expected.has(key))) {
    throw new Error(`${label} has unknown or missing fields.`);
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireUnique<T>(
  values: readonly T[],
  identity: (value: T) => string,
  label: string,
): void {
  const identities = values.map(identity);
  if (new Set(identities).size !== identities.length) {
    throw new Error(`${label} must contain unique exact identities.`);
  }
}
