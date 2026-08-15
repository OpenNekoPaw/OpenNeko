import type { CharacterProject, CharacterVersion } from '@neko/chara/contracts';
import type { WorldExperienceVersionId, WorldProject, WorldVersion } from '@neko/world/contracts';

export type ContentProjectId = string;
export type CharacterProjectId = CharacterProject['characterProjectId'];
export type CharacterVersionId = CharacterVersion['characterVersionId'];
export type WorldProjectId = WorldProject['worldProjectId'];
export type WorldVersionId = WorldVersion['worldVersionId'];

export type ProjectLocalTargetRef =
  | { readonly kind: 'character-project'; readonly characterProjectId: CharacterProjectId }
  | { readonly kind: 'world-project'; readonly worldProjectId: WorldProjectId };

export type ProjectAuthoringTargetRef =
  | { readonly kind: 'content-project'; readonly contentProjectId: ContentProjectId }
  | ProjectLocalTargetRef;

export type ProjectGlobalReference =
  | {
      readonly kind: 'character-version';
      readonly globalCharacterId: string;
      readonly characterVersionId: CharacterVersionId;
    }
  | {
      readonly kind: 'world-version';
      readonly globalWorldId: string;
      readonly worldVersionId: WorldVersionId;
    };

export type ProjectPublicationDependencyRef =
  | { readonly kind: 'character-version'; readonly characterVersionId: CharacterVersionId }
  | {
      readonly kind: 'world-experience-version';
      readonly worldExperienceVersionId: WorldExperienceVersionId;
    }
  | { readonly kind: 'asset-revision'; readonly assetId: string; readonly revision: string }
  | {
      readonly kind: 'media-library';
      readonly libraryName: string;
      readonly relativePath: string;
    }
  | {
      readonly kind: 'package-resource';
      readonly packageId: string;
      readonly revision: string;
      readonly resourcePath: string;
    };

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
  switch (record['kind']) {
    case 'character-version':
      requireExactKeys(record, ['kind', 'characterVersionId'], 'Character publication dependency');
      return {
        kind: 'character-version',
        characterVersionId: requireIdentity(
          record['characterVersionId'],
          'CharacterVersion identity',
        ),
      };
    case 'world-experience-version':
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
    case 'asset-revision':
      requireExactKeys(record, ['kind', 'assetId', 'revision'], 'Asset revision dependency');
      return {
        kind: 'asset-revision',
        assetId: requireIdentity(record['assetId'], 'Asset identity'),
        revision: requireIdentity(record['revision'], 'Asset revision'),
      };
    case 'media-library':
      requireExactKeys(record, ['kind', 'libraryName', 'relativePath'], 'Media Library dependency');
      return {
        kind: 'media-library',
        libraryName: requireIdentity(record['libraryName'], 'Media Library name'),
        relativePath: requireRelativePath(record['relativePath'], 'Media Library path'),
      };
    case 'package-resource':
      requireExactKeys(
        record,
        ['kind', 'packageId', 'revision', 'resourcePath'],
        'Package resource dependency',
      );
      return {
        kind: 'package-resource',
        packageId: requireIdentity(record['packageId'], 'Package identity'),
        revision: requireIdentity(record['revision'], 'Package revision'),
        resourcePath: requireRelativePath(record['resourcePath'], 'Package resource path'),
      };
    default:
      throw new Error(`Unknown Project publication dependency kind: ${String(record['kind'])}`);
  }
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
  switch (dependency.kind) {
    case 'character-version':
      return `character-version:${dependency.characterVersionId}`;
    case 'world-experience-version':
      return `world-experience-version:${dependency.worldExperienceVersionId}`;
    case 'asset-revision':
      return `asset-revision:${dependency.assetId}:${dependency.revision}`;
    case 'media-library':
      return `media-library:${dependency.libraryName}:${dependency.relativePath}`;
    case 'package-resource':
      return `package-resource:${dependency.packageId}:${dependency.revision}:${dependency.resourcePath}`;
  }
}

export function parseProjectGlobalReference(value: unknown): ProjectGlobalReference {
  const record = requireRecord(value, 'Project global reference');
  if (record['kind'] === 'character-version') {
    requireExactKeys(
      record,
      ['kind', 'globalCharacterId', 'characterVersionId'],
      'Character global reference',
    );
    return {
      kind: 'character-version',
      globalCharacterId: requireIdentity(record['globalCharacterId'], 'GlobalCharacter identity'),
      characterVersionId: requireIdentity(
        record['characterVersionId'],
        'CharacterVersion identity',
      ),
    };
  }
  if (record['kind'] === 'world-version') {
    requireExactKeys(record, ['kind', 'globalWorldId', 'worldVersionId'], 'World global reference');
    return {
      kind: 'world-version',
      globalWorldId: requireIdentity(record['globalWorldId'], 'GlobalWorld identity'),
      worldVersionId: requireIdentity(record['worldVersionId'], 'WorldVersion identity'),
    };
  }
  throw new Error(`Unknown Project global reference kind: ${String(record['kind'])}`);
}

export function projectGlobalReferenceKey(reference: ProjectGlobalReference): string {
  return reference.kind === 'character-version'
    ? `character-version:${reference.globalCharacterId}:${reference.characterVersionId}`
    : `world-version:${reference.globalWorldId}:${reference.worldVersionId}`;
}

export function projectGlobalObjectKey(reference: ProjectGlobalReference): string {
  return reference.kind === 'character-version'
    ? `character:${reference.globalCharacterId}`
    : `world:${reference.globalWorldId}`;
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
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireRelativePath(value: unknown, label: string): string {
  const path = requireIdentity(value, label);
  if (
    path.startsWith('/') ||
    path.startsWith('\\') ||
    path.split(/[\\/]/u).some((segment) => segment === '.' || segment === '..' || !segment)
  ) {
    throw new Error(`${label} must be a normalized relative path.`);
  }
  return path.replaceAll('\\', '/');
}
