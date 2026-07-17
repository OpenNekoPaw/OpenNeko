import type { CreativeEntityKind } from '@neko/shared';

export const ENTITY_FACTS_DIRECTORY = 'neko/entities';

const NON_CHARACTER_ENTITY_FILE_NAMES: Readonly<
  Record<Exclude<CreativeEntityKind, 'character'>, string>
> = {
  scene: 'scenes.json',
  location: 'locations.json',
  object: 'objects.json',
  style: 'styles.json',
} as const;

export function resolveCharacterRegistryPath(projectRoot: string): string {
  return joinProjectPath(projectRoot, 'characters.json');
}

export function resolveProjectEntityFilePath(
  projectRoot: string,
  kind: Exclude<CreativeEntityKind, 'character'>,
): string {
  return joinProjectPath(
    projectRoot,
    ENTITY_FACTS_DIRECTORY,
    NON_CHARACTER_ENTITY_FILE_NAMES[kind],
  );
}

export function resolveEntityCandidateFilePath(projectRoot: string): string {
  return joinProjectPath(projectRoot, ENTITY_FACTS_DIRECTORY, 'candidates.json');
}

export function resolveEntityAssetBindingsPath(projectRoot: string): string {
  return joinProjectPath(projectRoot, 'neko', 'entity-bindings.json');
}

export function resolveVisualIdentityDraftsPath(projectRoot: string): string {
  return joinProjectPath(projectRoot, 'neko', 'visual-identity-drafts.json');
}

export function resolveEntityAssetRequirementsPath(projectRoot: string): string {
  return joinProjectPath(projectRoot, 'neko', 'entity-asset-requirements.json');
}

export function resolveCharacterMemoryPath(projectRoot: string): string {
  return joinProjectPath(projectRoot, 'neko', 'character-memory.json');
}

export function assertGitTrackedEntityFactPath(filePath: string): void {
  const normalized = normalizePath(filePath);
  if (/(?:^|\/)\.neko\/\.cache(?:\/|$)/i.test(normalized)) {
    throw new Error('Creative entity facts must not be stored under .neko/.cache');
  }
}

export function joinProjectPath(projectRoot: string, ...segments: readonly string[]): string {
  const root = normalizePath(projectRoot).replace(/\/+$/g, '');
  const suffix = segments
    .map((segment) => normalizePath(segment).replace(/^\/+|\/+$/g, ''))
    .filter((segment) => segment.length > 0)
    .join('/');
  return suffix ? `${root}/${suffix}` : root;
}

export function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/');
}
