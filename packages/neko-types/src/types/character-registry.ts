// =============================================================================
// Character Registry Types — git-tracked project identity source
// =============================================================================

export type CharacterRecordStatus = 'confirmed' | 'candidate' | 'deprecated';

export interface CharacterDefaults {
  readonly assetEntityId?: string;
  readonly galleryNodeId?: string;
  readonly voiceAssetId?: string;
}

export interface CharacterBindings {
  readonly assetEntityIds?: readonly string[];
  readonly galleryNodeIds?: readonly string[];
  readonly generatedAssetIds?: readonly string[];
  readonly scriptNames?: readonly string[];
}

export interface CharacterRecordMetadata {
  readonly [key: string]: unknown;
  readonly role?: string;
  readonly gender?: string;
  readonly ageRange?: string;
  readonly notes?: string;
}

export interface CharacterRecord {
  readonly id: string;
  readonly canonicalName: string;
  readonly displayName?: string;
  readonly aliases: readonly string[];
  readonly status: CharacterRecordStatus;
  readonly metadata?: CharacterRecordMetadata;
  readonly defaults?: CharacterDefaults;
  readonly bindings?: CharacterBindings;
}

export interface CharacterRegistryFile {
  readonly version: 1;
  readonly characters: readonly CharacterRecord[];
}

export interface CharacterBindingMatch {
  readonly record: Pick<CharacterRecord, 'id'>;
}

export interface CharacterBindingResolver {
  resolveCharacter(name: string, uriOrPath?: string): CharacterBindingMatch | undefined;
}

export interface ResolveCharacterBindingsOptions {
  readonly uriOrPath?: string;
  readonly characterResolver?: CharacterBindingResolver;
  readonly fallbackLoader?: (names: readonly string[]) => Promise<Record<string, string>>;
}

const CHARACTER_REGISTRY_VERSION = 1 as const;

export function createEmptyCharacterRegistryFile(): CharacterRegistryFile {
  return {
    version: CHARACTER_REGISTRY_VERSION,
    characters: [],
  };
}

export function normalizeCharacterLookupKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function collectCharacterLookupKeys(record: CharacterRecord): string[] {
  const keys = [
    record.canonicalName,
    record.displayName,
    ...record.aliases,
    ...(record.bindings?.scriptNames ?? []),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(normalizeCharacterLookupKey);

  return Array.from(new Set(keys));
}

function isReadonlyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isCharacterRecordStatus(value: unknown): value is CharacterRecordStatus {
  return value === 'confirmed' || value === 'candidate' || value === 'deprecated';
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function getObjectField(value: object, key: string): unknown {
  return Reflect.get(value, key);
}

export function isCharacterRecord(value: unknown): value is CharacterRecord {
  if (!isObjectLike(value)) {
    return false;
  }

  const aliases = getObjectField(value, 'aliases');

  return (
    typeof getObjectField(value, 'id') === 'string' &&
    typeof getObjectField(value, 'canonicalName') === 'string' &&
    isReadonlyStringArray(aliases) &&
    isCharacterRecordStatus(getObjectField(value, 'status'))
  );
}

export function isCharacterRegistryFile(value: unknown): value is CharacterRegistryFile {
  if (!isObjectLike(value)) {
    return false;
  }

  const characters = getObjectField(value, 'characters');
  return (
    getObjectField(value, 'version') === CHARACTER_REGISTRY_VERSION &&
    Array.isArray(characters) &&
    characters.every((record) => isCharacterRecord(record))
  );
}

export async function resolveCharacterBindingsForNames(
  names: readonly string[],
  options: ResolveCharacterBindingsOptions = {},
): Promise<Record<string, string>> {
  if (names.length === 0) {
    return {};
  }

  const resolved: Record<string, string> = {};
  const unresolved = new Set<string>();

  for (const name of names) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      continue;
    }

    if (resolved[name]) {
      continue;
    }

    const match = options.characterResolver?.resolveCharacter(name, options.uriOrPath);
    const characterId = match?.record.id;
    if (typeof characterId === 'string' && characterId.length > 0) {
      resolved[name] = characterId;
      continue;
    }

    unresolved.add(name);
  }

  if (unresolved.size === 0 || !options.fallbackLoader) {
    return resolved;
  }

  const fallback = await options.fallbackLoader([...unresolved]);
  return {
    ...fallback,
    ...resolved,
  };
}
