import { parseCharacterRepresentationRef, type CharacterRepresentationKind } from './character';
import {
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireNonNegativeInteger,
  requireString,
  requireUniqueIdentities,
} from './codec';

export interface CharacterLocalizedAssetFile {
  readonly relativeAssetPath: string;
  readonly mediaType: string;
  readonly byteLength: number;
}

export interface CharacterLocalizedAssetBinding {
  readonly representationId: string;
  readonly kind: CharacterRepresentationKind;
  readonly resourceRef: string;
  readonly entryRelativeAssetPath: string;
  readonly files: readonly CharacterLocalizedAssetFile[];
}

export interface CharacterLocalizedAssetBindingCatalog {
  readonly characterProjectId: string;
  readonly bindings: readonly CharacterLocalizedAssetBinding[];
}

export function parseCharacterLocalizedAssetBindingCatalog(
  value: unknown,
): CharacterLocalizedAssetBindingCatalog {
  const record = requireExactRecord(
    value,
    ['characterProjectId', 'bindings'],
    'Character localized asset binding catalog',
  );
  const bindings = requireUniqueIdentities(
    requireArray(
      record['bindings'],
      parseCharacterLocalizedAssetBinding,
      'Character localized asset bindings',
    ),
    (binding) => binding.representationId,
    'Character localized asset bindings',
  );
  requireUniqueIdentities(
    bindings.flatMap((binding) => binding.files),
    (file) => file.relativeAssetPath,
    'Character localized asset files',
  );
  return {
    characterProjectId: requireIdentity(
      record['characterProjectId'],
      'Character localized asset binding CharacterProject identity',
    ),
    bindings,
  };
}

export function parseCharacterLocalizedAssetBinding(
  value: unknown,
): CharacterLocalizedAssetBinding {
  const record = requireExactRecord(
    value,
    ['representationId', 'kind', 'resourceRef', 'entryRelativeAssetPath', 'files'],
    'Character localized asset binding',
  );
  const representation = parseCharacterRepresentationRef({
    representationId: record['representationId'],
    kind: record['kind'],
    resourceRef: record['resourceRef'],
  });
  const files = requireUniqueIdentities(
    requireArray(
      record['files'],
      parseCharacterLocalizedAssetFile,
      'Character localized asset binding files',
    ),
    (file) => file.relativeAssetPath,
    'Character localized asset binding files',
  );
  if (files.length === 0) {
    throw new Error('Character localized asset binding must declare at least one owned file.');
  }
  const entryRelativeAssetPath = requireLocalizedAssetPath(
    record['entryRelativeAssetPath'],
    'Character localized asset entry path',
  );
  if (!files.some((file) => file.relativeAssetPath === entryRelativeAssetPath)) {
    throw new Error(
      'Character localized asset binding entry path must identify one declared owned file.',
    );
  }
  return { ...representation, entryRelativeAssetPath, files };
}

export function parseCharacterLocalizedAssetFile(value: unknown): CharacterLocalizedAssetFile {
  const record = requireExactRecord(
    value,
    ['relativeAssetPath', 'mediaType', 'byteLength'],
    'Character localized asset file',
  );
  const mediaType = requireString(record['mediaType'], 'Character localized asset media type');
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(mediaType)) {
    throw new Error('Character localized asset media type must be a valid MIME type.');
  }
  return {
    relativeAssetPath: requireLocalizedAssetPath(
      record['relativeAssetPath'],
      'Character localized asset file path',
    ),
    mediaType,
    byteLength: requireNonNegativeInteger(
      record['byteLength'],
      'Character localized asset file byte length',
    ),
  };
}

function requireLocalizedAssetPath(value: unknown, label: string): string {
  const path = requireIdentity(value, label);
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\u0000') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`${label} must be a safe relative path.`);
  }
  return path;
}
