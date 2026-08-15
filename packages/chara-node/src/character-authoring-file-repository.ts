import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { lstat, mkdir, open, readdir, realpath, rename, rm, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  parseCharacterAuthoringTestSnapshot,
  parseCharacterLocalizedAssetBindingCatalog,
  parseCharacterProject,
  parseCharacterStoryline,
  parseCharacterStorylineDraft,
  parseCharacterStorylineVersion,
  parseCharacterVersion,
  parseCharacterVersionLineage,
  type CharacterAuthoringTestSnapshot,
  type CharacterLocalizedAssetBindingCatalog,
  type CharacterProject,
  type CharacterStoryline,
  type CharacterStorylineDraft,
  type CharacterStorylineVersion,
  type CharacterVersion,
} from '@neko/chara/contracts';
import type {
  CharacterAuthoringCatalogPort,
  CharacterAuthoringCatalogScope,
  CharacterAuthoringRepository,
  CharacterVersionDeletionRepository,
  CharacterDurableRecordDiagnostic,
  CharacterLocalizedAssetDescriptor,
  CharacterLocalizedAssetRepository,
  CharacterStorylineRepository,
  CharacterVersionLineageRepository,
} from '@neko/chara/application';

export interface CharacterPublicationFilePort {
  readPublication(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion | undefined>;
}

export interface CharacterAuthoringFileRepository
  extends
    CharacterAuthoringRepository,
    CharacterVersionDeletionRepository,
    CharacterVersionLineageRepository,
    CharacterStorylineRepository,
    CharacterLocalizedAssetRepository,
    CharacterPublicationFilePort,
    CharacterAuthoringCatalogPort {}

export class CharacterAuthoringStorageError extends Error {
  constructor(
    readonly code:
      | 'character-workspace-unavailable'
      | 'character-workspace-path-escape'
      | 'character-record-invalid'
      | 'character-record-read-failed'
      | 'character-record-write-failed'
      | 'character-publication-conflict'
      | 'character-record-conflict'
      | 'character-resource-limit-exceeded',
    readonly operation: string,
    readonly recordId: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CharacterAuthoringStorageError';
  }
}

export function createCharacterAuthoringFileRepository(options: {
  readonly workspaceRoot: string;
  readonly scope: CharacterAuthoringCatalogScope;
}): CharacterAuthoringFileRepository {
  requireAbsoluteRoot(options.workspaceRoot);
  return {
    readProject: (identity, signal) => readProjectRecord(options.workspaceRoot, identity, signal),
    saveProject: (project, signal) => {
      const canonical = parseCharacterProject(project);
      return writeRecord(
        options.workspaceRoot,
        characterProjectPath(canonical.characterProjectId),
        canonical.characterProjectId,
        canonical,
        signal,
      );
    },
    readLineage: (identity, signal) =>
      readRecord(
        options.workspaceRoot,
        characterLineagePath(identity),
        identity,
        parseCharacterVersionLineage,
        signal,
      ),
    saveLineage: (lineage, signal) => {
      const canonical = parseCharacterVersionLineage(lineage);
      return writeRecord(
        options.workspaceRoot,
        characterLineagePath(canonical.characterProjectId),
        canonical.characterProjectId,
        canonical,
        signal,
      );
    },
    readPublication: (identity, signal) => findPublication(options.workspaceRoot, identity, signal),
    async storePublication(publication, signal) {
      const canonical = parseCharacterVersion(publication);
      const existing = await readRecord(
        options.workspaceRoot,
        characterVersionPath(canonical.characterProjectId, canonical.characterVersionId),
        canonical.characterVersionId,
        parseCharacterVersion,
        signal,
      );
      if (existing) {
        if (isDeepStrictEqual(existing, canonical)) return;
        throw new CharacterAuthoringStorageError(
          'character-publication-conflict',
          'store-publication',
          canonical.characterVersionId,
          `Immutable CharacterVersion '${canonical.characterVersionId}' already exists with different facts.`,
        );
      }
      await writeRecord(
        options.workspaceRoot,
        characterVersionPath(canonical.characterProjectId, canonical.characterVersionId),
        canonical.characterVersionId,
        canonical,
        signal,
      );
    },
    deletePublication: (characterProjectId, characterVersionId, signal) => {
      return deletePublication(
        options.workspaceRoot,
        characterProjectId,
        characterVersionId,
        signal,
      );
    },
    async saveAuthoringTestSnapshot(snapshot, signal) {
      const canonical = parseCharacterAuthoringTestSnapshot(snapshot);
      const path = characterAuthoringTestPath(
        canonical.characterProjectId,
        canonical.authoringTestSnapshotId,
      );
      const existing = await readRecord(
        options.workspaceRoot,
        path,
        canonical.authoringTestSnapshotId,
        parseCharacterAuthoringTestSnapshot,
        signal,
      );
      if (existing && !isDeepStrictEqual(existing, canonical)) {
        throw new CharacterAuthoringStorageError(
          'character-publication-conflict',
          'save-authoring-test',
          canonical.authoringTestSnapshotId,
          `Immutable Character authoring test '${canonical.authoringTestSnapshotId}' already exists with different facts.`,
        );
      }
      if (!existing) {
        await writeRecord(
          options.workspaceRoot,
          path,
          canonical.authoringTestSnapshotId,
          canonical,
          signal,
        );
      }
    },
    readCharacterProject: (identity, signal) =>
      readProjectRecord(options.workspaceRoot, identity, signal),
    readCharacterVersion: (identity, signal) =>
      findPublication(options.workspaceRoot, identity, signal),
    createStoryline: (storyline, draft, signal) => {
      return createStoryline(options.workspaceRoot, storyline, draft, signal);
    },
    updateStoryline: (storyline, draft, signal) => {
      return updateStoryline(options.workspaceRoot, storyline, draft, signal);
    },
    readStoryline: async (identity, signal) =>
      (await findStoryline(options.workspaceRoot, identity, signal))?.storyline,
    readStorylineDraft: async (identity, signal) => {
      const found = await findStoryline(options.workspaceRoot, identity, signal);
      if (!found) return undefined;
      const draft = await readRecord(
        options.workspaceRoot,
        characterStorylineDraftPath(found.storyline.characterProjectId, identity),
        identity,
        parseCharacterStorylineDraft,
        signal,
      );
      if (draft && draft.characterStorylineId !== identity) {
        throw invalidRecord(
          'read-storyline-draft',
          identity,
          `CharacterStorylineDraft '${draft.characterStorylineId}' does not match its containing CharacterStoryline '${identity}'.`,
        );
      }
      return draft;
    },
    storeStorylineVersion: (version, signal) => {
      return storeStorylineVersion(options.workspaceRoot, version, signal);
    },
    readStorylineVersion: async (identity, signal) =>
      (await findStorylineVersion(options.workspaceRoot, identity, signal))?.version,
    listStorylines: (characterProjectId, signal) =>
      listStorylines(options.workspaceRoot, characterProjectId, signal),
    listStorylineVersions: (characterStorylineId, signal) =>
      listStorylineVersions(options.workspaceRoot, characterStorylineId, signal),
    deleteStoryline: (characterStorylineId, signal) => {
      return deleteStoryline(options.workspaceRoot, characterStorylineId, signal);
    },
    readLocalizedAssetBindingCatalog: (characterProjectId, signal) =>
      readLocalizedAssetBindingCatalog(options.workspaceRoot, characterProjectId, signal),
    saveLocalizedAssetBindingCatalog: (catalog, signal) => {
      return saveLocalizedAssetBindingCatalog(options.workspaceRoot, catalog, signal);
    },
    listLocalizedAssets: (characterProjectId, signal) =>
      listLocalizedAssets(options.workspaceRoot, characterProjectId, signal),
    readLocalizedAsset: (characterProjectId, relativeAssetPath, maxBytes, signal) =>
      readLocalizedAsset(
        options.workspaceRoot,
        characterProjectId,
        relativeAssetPath,
        maxBytes,
        signal,
      ),
    storeLocalizedAsset: (characterProjectId, relativeAssetPath, bytes, signal) => {
      return storeLocalizedAsset(
        options.workspaceRoot,
        characterProjectId,
        relativeAssetPath,
        bytes,
        signal,
      );
    },
    readAuthoringCatalog: (signal) => readCatalog(options, signal),
  };
}

export function characterProjectPath(characterProjectId: string): string {
  return `neko/characters/${pathIdentity(characterProjectId)}/project.json`;
}

export function characterLineagePath(characterProjectId: string): string {
  return `neko/characters/${pathIdentity(characterProjectId)}/lineage.json`;
}

export function characterVersionPath(
  characterProjectId: string,
  characterVersionId: string,
): string {
  return `neko/characters/${pathIdentity(characterProjectId)}/versions/${pathIdentity(characterVersionId)}.json`;
}

export function characterAuthoringTestPath(
  characterProjectId: string,
  authoringTestSnapshotId: string,
): string {
  return `neko/characters/${pathIdentity(characterProjectId)}/authoring-tests/${pathIdentity(authoringTestSnapshotId)}.json`;
}

async function deletePublication(
  workspaceRoot: string,
  characterProjectId: string,
  characterVersionId: string,
  signal?: AbortSignal,
): Promise<void> {
  await requireProjectRecord(workspaceRoot, characterProjectId, signal);
  const relativePath = characterVersionPath(characterProjectId, characterVersionId);
  const publication = await readRecord(
    workspaceRoot,
    relativePath,
    characterVersionId,
    parseCharacterVersion,
    signal,
  );
  if (publication === undefined) {
    throw new CharacterAuthoringStorageError(
      'character-record-read-failed',
      'delete-publication',
      characterVersionId,
      `CharacterVersion '${characterVersionId}' is unavailable in exact CharacterProject '${characterProjectId}'.`,
    );
  }
  if (publication.characterProjectId !== characterProjectId) {
    throw new CharacterAuthoringStorageError(
      'character-record-invalid',
      'delete-publication',
      characterVersionId,
      `CharacterVersion '${characterVersionId}' does not belong to exact CharacterProject '${characterProjectId}'.`,
    );
  }
  const target = await resolveWorkspacePath(
    workspaceRoot,
    relativePath,
    'delete-publication',
    characterVersionId,
    false,
  );
  const entry = await lstat(target);
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new CharacterAuthoringStorageError(
      'character-workspace-path-escape',
      'delete-publication',
      characterVersionId,
      `CharacterVersion '${characterVersionId}' must be a regular file below the authorized Workspace root.`,
    );
  }
  signal?.throwIfAborted();
  try {
    await unlink(target);
  } catch (cause) {
    throw storageError(
      'character-record-write-failed',
      'delete-publication',
      characterVersionId,
      cause,
    );
  }
}

export function characterStorylinePath(
  characterProjectId: string,
  characterStorylineId: string,
): string {
  return `neko/characters/${pathIdentity(characterProjectId)}/storylines/${pathIdentity(characterStorylineId)}/storyline.json`;
}

export function characterStorylineDraftPath(
  characterProjectId: string,
  characterStorylineId: string,
): string {
  return `neko/characters/${pathIdentity(characterProjectId)}/storylines/${pathIdentity(characterStorylineId)}/draft.json`;
}

export function characterStorylineVersionPath(
  characterProjectId: string,
  characterStorylineId: string,
  characterStorylineVersionId: string,
): string {
  return `neko/characters/${pathIdentity(characterProjectId)}/storylines/${pathIdentity(characterStorylineId)}/versions/${pathIdentity(characterStorylineVersionId)}.json`;
}

export function characterLocalizedAssetPath(
  characterProjectId: string,
  relativeAssetPath: string,
): string {
  return `neko/characters/${pathIdentity(characterProjectId)}/assets/${localizedAssetPath(relativeAssetPath)}`;
}

export function characterLocalizedAssetBindingCatalogPath(characterProjectId: string): string {
  return `neko/characters/${pathIdentity(characterProjectId)}/localized-assets.json`;
}

async function createStoryline(
  workspaceRoot: string,
  storylineValue: CharacterStoryline,
  draftValue: CharacterStorylineDraft,
  signal?: AbortSignal,
): Promise<void> {
  const storyline = parseCharacterStoryline(storylineValue);
  const draft = parseCharacterStorylineDraft(draftValue);
  assertStorylineDraftBinding(storyline, draft);
  await requireProjectRecord(workspaceRoot, storyline.characterProjectId, signal);
  await requireVersionOwnedByProject(
    workspaceRoot,
    draft.characterVersionId,
    storyline.characterProjectId,
    signal,
  );
  if (await findStoryline(workspaceRoot, storyline.characterStorylineId, signal)) {
    throw recordConflict(
      'create-storyline',
      storyline.characterStorylineId,
      `CharacterStoryline '${storyline.characterStorylineId}' already exists.`,
    );
  }
  await writeRecord(
    workspaceRoot,
    characterStorylineDraftPath(storyline.characterProjectId, storyline.characterStorylineId),
    storyline.characterStorylineId,
    draft,
    signal,
  );
  await writeRecord(
    workspaceRoot,
    characterStorylinePath(storyline.characterProjectId, storyline.characterStorylineId),
    storyline.characterStorylineId,
    storyline,
    signal,
  );
}

async function updateStoryline(
  workspaceRoot: string,
  storylineValue: CharacterStoryline,
  draftValue: CharacterStorylineDraft,
  signal?: AbortSignal,
): Promise<void> {
  const storyline = parseCharacterStoryline(storylineValue);
  const draft = parseCharacterStorylineDraft(draftValue);
  assertStorylineDraftBinding(storyline, draft);
  const existing = await findStoryline(workspaceRoot, storyline.characterStorylineId, signal);
  if (!existing) {
    throw recordConflict(
      'update-storyline',
      storyline.characterStorylineId,
      `CharacterStoryline '${storyline.characterStorylineId}' does not exist.`,
    );
  }
  if (existing.storyline.characterProjectId !== storyline.characterProjectId) {
    throw recordConflict(
      'update-storyline',
      storyline.characterStorylineId,
      `CharacterStoryline '${storyline.characterStorylineId}' cannot change CharacterProject ownership.`,
    );
  }
  await requireVersionOwnedByProject(
    workspaceRoot,
    draft.characterVersionId,
    storyline.characterProjectId,
    signal,
  );
  await writeRecord(
    workspaceRoot,
    characterStorylineDraftPath(storyline.characterProjectId, storyline.characterStorylineId),
    storyline.characterStorylineId,
    draft,
    signal,
  );
  await writeRecord(
    workspaceRoot,
    characterStorylinePath(storyline.characterProjectId, storyline.characterStorylineId),
    storyline.characterStorylineId,
    storyline,
    signal,
  );
}

async function storeStorylineVersion(
  workspaceRoot: string,
  versionValue: CharacterStorylineVersion,
  signal?: AbortSignal,
): Promise<void> {
  const version = parseCharacterStorylineVersion(versionValue);
  const found = await findStoryline(workspaceRoot, version.characterStorylineId, signal);
  if (!found) {
    throw recordConflict(
      'store-storyline-version',
      version.characterStorylineVersionId,
      `CharacterStoryline '${version.characterStorylineId}' does not exist.`,
    );
  }
  await requireVersionOwnedByProject(
    workspaceRoot,
    version.characterVersionId,
    found.storyline.characterProjectId,
    signal,
  );
  const path = characterStorylineVersionPath(
    found.storyline.characterProjectId,
    version.characterStorylineId,
    version.characterStorylineVersionId,
  );
  const existing = await readRecord(
    workspaceRoot,
    path,
    version.characterStorylineVersionId,
    parseCharacterStorylineVersion,
    signal,
  );
  if (existing) {
    if (isDeepStrictEqual(existing, version)) return;
    throw recordConflict(
      'store-storyline-version',
      version.characterStorylineVersionId,
      `Immutable CharacterStorylineVersion '${version.characterStorylineVersionId}' already exists with different facts.`,
    );
  }
  await writeRecord(workspaceRoot, path, version.characterStorylineVersionId, version, signal);
}

async function findStoryline(
  workspaceRoot: string,
  characterStorylineId: string,
  signal?: AbortSignal,
): Promise<{ readonly storyline: CharacterStoryline } | undefined> {
  let found: { readonly storyline: CharacterStoryline } | undefined;
  for (const projectId of await listDirectories(workspaceRoot, 'neko/characters')) {
    signal?.throwIfAborted();
    const storyline = await readRecord(
      workspaceRoot,
      characterStorylinePath(projectId, characterStorylineId),
      characterStorylineId,
      parseCharacterStoryline,
      signal,
    );
    if (!storyline) continue;
    if (
      storyline.characterStorylineId !== characterStorylineId ||
      storyline.characterProjectId !== projectId
    ) {
      throw invalidRecord(
        'read-storyline',
        characterStorylineId,
        `CharacterStoryline '${storyline.characterStorylineId}' does not match its exact identity and containing CharacterProject '${projectId}'.`,
      );
    }
    if (found) {
      throw new CharacterAuthoringStorageError(
        'character-record-invalid',
        'read-storyline',
        characterStorylineId,
        `CharacterStoryline '${characterStorylineId}' exists under multiple CharacterProject roots.`,
      );
    }
    found = { storyline };
  }
  return found;
}

async function findStorylineVersion(
  workspaceRoot: string,
  characterStorylineVersionId: string,
  signal?: AbortSignal,
): Promise<
  | {
      readonly version: CharacterStorylineVersion;
      readonly characterProjectId: string;
    }
  | undefined
> {
  let found:
    | { readonly version: CharacterStorylineVersion; readonly characterProjectId: string }
    | undefined;
  for (const projectId of await listDirectories(workspaceRoot, 'neko/characters')) {
    for (const storylineId of await listDirectories(
      workspaceRoot,
      `neko/characters/${pathIdentity(projectId)}/storylines`,
    )) {
      signal?.throwIfAborted();
      const version = await readRecord(
        workspaceRoot,
        characterStorylineVersionPath(projectId, storylineId, characterStorylineVersionId),
        characterStorylineVersionId,
        parseCharacterStorylineVersion,
        signal,
      );
      if (!version) continue;
      if (version.characterStorylineId !== storylineId) {
        throw new CharacterAuthoringStorageError(
          'character-record-invalid',
          'read-storyline-version',
          characterStorylineVersionId,
          `CharacterStorylineVersion '${characterStorylineVersionId}' does not belong to its containing CharacterStoryline '${storylineId}'.`,
        );
      }
      if (version.characterStorylineVersionId !== characterStorylineVersionId) {
        throw invalidRecord(
          'read-storyline-version',
          characterStorylineVersionId,
          `CharacterStorylineVersion '${version.characterStorylineVersionId}' does not match its containing record '${characterStorylineVersionId}'.`,
        );
      }
      const storyline = await readRecord(
        workspaceRoot,
        characterStorylinePath(projectId, storylineId),
        storylineId,
        parseCharacterStoryline,
        signal,
      );
      if (
        !storyline ||
        storyline.characterStorylineId !== storylineId ||
        storyline.characterProjectId !== projectId
      ) {
        throw invalidRecord(
          'read-storyline-version',
          characterStorylineVersionId,
          `CharacterStorylineVersion '${characterStorylineVersionId}' has no exact owner-qualified CharacterStoryline.`,
        );
      }
      await requireVersionOwnedByProject(
        workspaceRoot,
        version.characterVersionId,
        projectId,
        signal,
      );
      if (found) {
        throw new CharacterAuthoringStorageError(
          'character-record-invalid',
          'read-storyline-version',
          characterStorylineVersionId,
          `CharacterStorylineVersion '${characterStorylineVersionId}' exists under multiple CharacterStoryline roots.`,
        );
      }
      found = { version, characterProjectId: projectId };
    }
  }
  return found;
}

async function listStorylines(
  workspaceRoot: string,
  characterProjectId: string,
  signal?: AbortSignal,
): Promise<readonly CharacterStoryline[]> {
  await requireProjectRecord(workspaceRoot, characterProjectId, signal);
  const storylines: CharacterStoryline[] = [];
  for (const storylineId of await listDirectories(
    workspaceRoot,
    `neko/characters/${pathIdentity(characterProjectId)}/storylines`,
  )) {
    signal?.throwIfAborted();
    const storyline = await readRecord(
      workspaceRoot,
      characterStorylinePath(characterProjectId, storylineId),
      storylineId,
      parseCharacterStoryline,
      signal,
    );
    if (!storyline) {
      throw new CharacterAuthoringStorageError(
        'character-record-invalid',
        'list-storylines',
        storylineId,
        `CharacterStoryline directory '${storylineId}' has no storyline record.`,
      );
    }
    if (
      storyline.characterStorylineId !== storylineId ||
      storyline.characterProjectId !== characterProjectId
    ) {
      throw new CharacterAuthoringStorageError(
        'character-record-invalid',
        'list-storylines',
        storylineId,
        `CharacterStoryline '${storylineId}' belongs to another CharacterProject.`,
      );
    }
    storylines.push(storyline);
  }
  return storylines;
}

async function listStorylineVersions(
  workspaceRoot: string,
  characterStorylineId: string,
  signal?: AbortSignal,
): Promise<readonly CharacterStorylineVersion[]> {
  const found = await findStoryline(workspaceRoot, characterStorylineId, signal);
  if (!found) return [];
  const versions: CharacterStorylineVersion[] = [];
  for (const file of await listJsonFiles(
    workspaceRoot,
    `neko/characters/${pathIdentity(found.storyline.characterProjectId)}/storylines/${pathIdentity(characterStorylineId)}/versions`,
  )) {
    signal?.throwIfAborted();
    const identity = file.slice(0, -5);
    const version = await readRecord(
      workspaceRoot,
      characterStorylineVersionPath(
        found.storyline.characterProjectId,
        characterStorylineId,
        identity,
      ),
      identity,
      parseCharacterStorylineVersion,
      signal,
    );
    if (
      !version ||
      version.characterStorylineVersionId !== identity ||
      version.characterStorylineId !== characterStorylineId
    ) {
      throw new CharacterAuthoringStorageError(
        'character-record-invalid',
        'list-storyline-versions',
        identity,
        `CharacterStorylineVersion '${identity}' does not belong to exact CharacterStoryline '${characterStorylineId}'.`,
      );
    }
    await requireVersionOwnedByProject(
      workspaceRoot,
      version.characterVersionId,
      found.storyline.characterProjectId,
      signal,
    );
    versions.push(version);
  }
  return versions;
}

async function deleteStoryline(
  workspaceRoot: string,
  characterStorylineId: string,
  signal?: AbortSignal,
): Promise<void> {
  const found = await findStoryline(workspaceRoot, characterStorylineId, signal);
  if (!found) return;
  const relativePath = dirname(
    characterStorylinePath(found.storyline.characterProjectId, characterStorylineId),
  );
  const target = await resolveWorkspacePath(
    workspaceRoot,
    relativePath,
    'delete-storyline',
    characterStorylineId,
    false,
  );
  const entry = await lstat(target);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new CharacterAuthoringStorageError(
      'character-workspace-path-escape',
      'delete-storyline',
      characterStorylineId,
      `CharacterStoryline '${characterStorylineId}' must be a regular directory below the authorized Workspace root.`,
    );
  }
  signal?.throwIfAborted();
  await rm(target, { recursive: true });
}

async function listLocalizedAssets(
  workspaceRoot: string,
  characterProjectId: string,
  signal?: AbortSignal,
): Promise<readonly CharacterLocalizedAssetDescriptor[]> {
  await requireProjectRecord(workspaceRoot, characterProjectId, signal);
  const root = `neko/characters/${pathIdentity(characterProjectId)}/assets`;
  const files = await listFilesRecursively(workspaceRoot, root, signal);
  return files.map((file) => ({
    characterProjectId,
    relativeAssetPath: file.relativePath,
    byteLength: file.byteLength,
  }));
}

async function readLocalizedAssetBindingCatalog(
  workspaceRoot: string,
  characterProjectId: string,
  signal?: AbortSignal,
): Promise<CharacterLocalizedAssetBindingCatalog | undefined> {
  await requireProjectRecord(workspaceRoot, characterProjectId, signal);
  const catalog = await readRecord(
    workspaceRoot,
    characterLocalizedAssetBindingCatalogPath(characterProjectId),
    characterProjectId,
    parseCharacterLocalizedAssetBindingCatalog,
    signal,
  );
  if (catalog === undefined) return undefined;
  if (catalog.characterProjectId !== characterProjectId) {
    throw invalidRecord(
      'read-localized-asset-bindings',
      characterProjectId,
      `Character localized asset binding catalog '${catalog.characterProjectId}' does not match its containing CharacterProject '${characterProjectId}'.`,
    );
  }
  await validateLocalizedAssetBindingCatalog(workspaceRoot, catalog, signal);
  return catalog;
}

async function saveLocalizedAssetBindingCatalog(
  workspaceRoot: string,
  value: CharacterLocalizedAssetBindingCatalog,
  signal?: AbortSignal,
): Promise<void> {
  const catalog = parseCharacterLocalizedAssetBindingCatalog(value);
  await validateLocalizedAssetBindingCatalog(workspaceRoot, catalog, signal);
  const path = characterLocalizedAssetBindingCatalogPath(catalog.characterProjectId);
  const existing = await readRecord(
    workspaceRoot,
    path,
    catalog.characterProjectId,
    parseCharacterLocalizedAssetBindingCatalog,
    signal,
  );
  if (existing !== undefined) {
    if (existing.characterProjectId !== catalog.characterProjectId) {
      throw invalidRecord(
        'save-localized-asset-bindings',
        catalog.characterProjectId,
        `Character localized asset binding catalog '${existing.characterProjectId}' does not match its containing CharacterProject '${catalog.characterProjectId}'.`,
      );
    }
    for (const binding of existing.bindings) {
      const replacement = catalog.bindings.find(
        (candidate) => candidate.representationId === binding.representationId,
      );
      if (replacement === undefined || !isDeepStrictEqual(replacement, binding)) {
        throw recordConflict(
          'save-localized-asset-bindings',
          binding.representationId,
          `Localized Character asset binding '${binding.representationId}' cannot be removed or replaced implicitly.`,
        );
      }
    }
    if (isDeepStrictEqual(existing, catalog)) return;
  }
  await writeRecord(workspaceRoot, path, catalog.characterProjectId, catalog, signal);
}

async function validateLocalizedAssetBindingCatalog(
  workspaceRoot: string,
  catalog: CharacterLocalizedAssetBindingCatalog,
  signal?: AbortSignal,
): Promise<void> {
  const project = await requireProjectRecord(workspaceRoot, catalog.characterProjectId, signal);
  const references = new Map(
    project.draft.representationRefs.map((reference) => [reference.representationId, reference]),
  );
  for (const file of await listJsonFiles(
    workspaceRoot,
    `neko/characters/${pathIdentity(catalog.characterProjectId)}/versions`,
  )) {
    const characterVersionId = file.slice(0, -5);
    const version = await readRecord(
      workspaceRoot,
      characterVersionPath(catalog.characterProjectId, characterVersionId),
      characterVersionId,
      parseCharacterVersion,
      signal,
    );
    if (version === undefined || version.characterProjectId !== catalog.characterProjectId) {
      throw invalidRecord(
        'validate-localized-asset-bindings',
        characterVersionId,
        `CharacterVersion '${characterVersionId}' is unavailable from its exact CharacterProject while validating localized assets.`,
      );
    }
    for (const reference of version.definition.representationRefs) {
      const existing = references.get(reference.representationId);
      if (existing !== undefined && !isDeepStrictEqual(existing, reference)) {
        throw recordConflict(
          'validate-localized-asset-bindings',
          reference.representationId,
          `Character representation '${reference.representationId}' has conflicting facts across the exact CharacterProject.`,
        );
      }
      references.set(reference.representationId, reference);
    }
  }
  const files = await listLocalizedAssets(workspaceRoot, catalog.characterProjectId, signal);
  for (const binding of catalog.bindings) {
    const reference = references.get(binding.representationId);
    if (
      reference === undefined ||
      reference.kind !== binding.kind ||
      reference.resourceRef !== binding.resourceRef
    ) {
      throw recordConflict(
        'validate-localized-asset-bindings',
        binding.representationId,
        `Localized Character asset binding '${binding.representationId}' does not match an exact Character representation.`,
      );
    }
    for (const declared of binding.files) {
      const actual = files.find(
        (candidate) => candidate.relativeAssetPath === declared.relativeAssetPath,
      );
      if (actual === undefined || actual.byteLength !== declared.byteLength) {
        throw recordConflict(
          'validate-localized-asset-bindings',
          binding.representationId,
          `Localized Character asset binding '${binding.representationId}' has a missing or changed owned file '${declared.relativeAssetPath}'.`,
        );
      }
    }
  }
}

async function readLocalizedAsset(
  workspaceRoot: string,
  characterProjectId: string,
  relativeAssetPath: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array | undefined> {
  requirePositiveByteLimit(maxBytes);
  await requireProjectRecord(workspaceRoot, characterProjectId, signal);
  return readBinary(
    workspaceRoot,
    characterLocalizedAssetPath(characterProjectId, relativeAssetPath),
    `${characterProjectId}:${relativeAssetPath}`,
    maxBytes,
    signal,
  );
}

async function storeLocalizedAsset(
  workspaceRoot: string,
  characterProjectId: string,
  relativeAssetPath: string,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  await requireProjectRecord(workspaceRoot, characterProjectId, signal);
  const recordId = `${characterProjectId}:${relativeAssetPath}`;
  const path = characterLocalizedAssetPath(characterProjectId, relativeAssetPath);
  let existing: Uint8Array | undefined;
  try {
    existing = await readBinary(workspaceRoot, path, recordId, bytes.byteLength, signal);
  } catch (cause) {
    if (
      cause instanceof CharacterAuthoringStorageError &&
      cause.code === 'character-resource-limit-exceeded'
    ) {
      throw recordConflict(
        'store-localized-asset',
        recordId,
        `Localized Character asset '${relativeAssetPath}' already exists with different bytes.`,
      );
    }
    throw cause;
  }
  if (existing !== undefined) {
    if (isDeepStrictEqual(existing, bytes)) return;
    throw recordConflict(
      'store-localized-asset',
      recordId,
      `Localized Character asset '${relativeAssetPath}' already exists with different bytes.`,
    );
  }
  await writeBinary(workspaceRoot, path, recordId, bytes, signal);
}

async function requireProjectRecord(
  workspaceRoot: string,
  characterProjectId: string,
  signal?: AbortSignal,
): Promise<CharacterProject> {
  const project = await readProjectRecord(workspaceRoot, characterProjectId, signal);
  if (!project) {
    throw recordConflict(
      'require-character-project',
      characterProjectId,
      `CharacterProject '${characterProjectId}' does not exist.`,
    );
  }
  return project;
}

async function readProjectRecord(
  workspaceRoot: string,
  characterProjectId: string,
  signal?: AbortSignal,
): Promise<CharacterProject | undefined> {
  const project = await readRecord(
    workspaceRoot,
    characterProjectPath(characterProjectId),
    characterProjectId,
    parseCharacterProject,
    signal,
  );
  if (project && project.characterProjectId !== characterProjectId) {
    throw invalidRecord(
      'read-character-project',
      characterProjectId,
      `CharacterProject '${project.characterProjectId}' does not match its containing record '${characterProjectId}'.`,
    );
  }
  return project;
}

async function requireVersionOwnedByProject(
  workspaceRoot: string,
  characterVersionId: string,
  characterProjectId: string,
  signal?: AbortSignal,
): Promise<CharacterVersion> {
  const version = await findPublication(workspaceRoot, characterVersionId, signal);
  if (!version || version.characterProjectId !== characterProjectId) {
    throw recordConflict(
      'require-character-version',
      characterVersionId,
      `CharacterVersion '${characterVersionId}' does not belong to exact CharacterProject '${characterProjectId}'.`,
    );
  }
  return version;
}

function assertStorylineDraftBinding(
  storyline: CharacterStoryline,
  draft: CharacterStorylineDraft,
): void {
  if (draft.characterStorylineId !== storyline.characterStorylineId) {
    throw recordConflict(
      'write-storyline',
      storyline.characterStorylineId,
      'CharacterStoryline and CharacterStorylineDraft identities must match.',
    );
  }
}

async function findPublication(
  workspaceRoot: string,
  characterVersionId: string,
  signal?: AbortSignal,
): Promise<CharacterVersion | undefined> {
  let found: CharacterVersion | undefined;
  for (const projectId of await listDirectories(workspaceRoot, 'neko/characters')) {
    signal?.throwIfAborted();
    const publication = await readRecord(
      workspaceRoot,
      characterVersionPath(projectId, characterVersionId),
      characterVersionId,
      parseCharacterVersion,
      signal,
    );
    if (!publication) continue;
    if (
      publication.characterVersionId !== characterVersionId ||
      publication.characterProjectId !== projectId
    ) {
      throw invalidRecord(
        'read-publication',
        characterVersionId,
        `CharacterVersion '${publication.characterVersionId}' does not match its exact identity and containing CharacterProject '${projectId}'.`,
      );
    }
    if (found) {
      throw new CharacterAuthoringStorageError(
        'character-record-invalid',
        'read-publication',
        characterVersionId,
        `CharacterVersion '${characterVersionId}' exists under multiple CharacterProject roots.`,
      );
    }
    found = publication;
  }
  return found;
}

async function readCatalog(
  options: { readonly workspaceRoot: string; readonly scope: CharacterAuthoringCatalogScope },
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const projects: CharacterProject[] = [];
  const versions: CharacterVersion[] = [];
  const authoringTestSnapshots: CharacterAuthoringTestSnapshot[] = [];
  const diagnostics: CharacterDurableRecordDiagnostic[] = [];
  for (const projectId of await listDirectories(options.workspaceRoot, 'neko/characters')) {
    signal?.throwIfAborted();
    await collect(
      readRecord(
        options.workspaceRoot,
        `neko/characters/${projectId}/project.json`,
        projectId,
        parseCharacterProject,
        signal,
      ),
      projects,
      diagnostics,
      'character-project',
      projectId,
    );
    for (const file of await listJsonFiles(
      options.workspaceRoot,
      `neko/characters/${projectId}/versions`,
    )) {
      const identity = file.slice(0, -5);
      await collect(
        readRecord(
          options.workspaceRoot,
          `neko/characters/${projectId}/versions/${file}`,
          identity,
          parseCharacterVersion,
          signal,
        ),
        versions,
        diagnostics,
        'character-version',
        identity,
      );
    }
    for (const file of await listJsonFiles(
      options.workspaceRoot,
      `neko/characters/${projectId}/authoring-tests`,
    )) {
      const identity = file.slice(0, -5);
      await collect(
        readRecord(
          options.workspaceRoot,
          `neko/characters/${projectId}/authoring-tests/${file}`,
          identity,
          parseCharacterAuthoringTestSnapshot,
          signal,
        ),
        authoringTestSnapshots,
        diagnostics,
        'authoring-test-snapshot',
        identity,
      );
    }
  }
  return {
    scope: options.scope,
    projects,
    versions,
    authoringTestSnapshots,
    diagnostics,
  };
}

async function collect<T>(
  pending: Promise<T | undefined>,
  records: T[],
  diagnostics: CharacterDurableRecordDiagnostic[],
  recordKind: CharacterDurableRecordDiagnostic['recordKind'],
  recordId: string,
): Promise<void> {
  try {
    const record = await pending;
    if (record) records.push(record);
  } catch (error) {
    diagnostics.push({
      recordKind,
      recordId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function readRecord<T>(
  workspaceRoot: string,
  relativePath: string,
  recordId: string,
  parse: (value: unknown) => T,
  signal?: AbortSignal,
): Promise<T | undefined> {
  signal?.throwIfAborted();
  const target = await resolveWorkspacePath(workspaceRoot, relativePath, 'read', recordId, false);
  let source: string;
  try {
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const entry = await file.stat();
      if (!entry.isFile()) {
        throw new CharacterAuthoringStorageError(
          'character-workspace-path-escape',
          'read',
          recordId,
          `Character authoring record '${recordId}' must be a regular file below the authorized Workspace root.`,
        );
      }
      source = await file.readFile('utf8');
    } finally {
      await file.close();
    }
  } catch (cause) {
    if (isErrorCode(cause, 'ENOENT')) return undefined;
    if (isErrorCode(cause, 'ELOOP')) {
      throw new CharacterAuthoringStorageError(
        'character-workspace-path-escape',
        'read',
        recordId,
        `Character authoring record '${recordId}' cannot be a symbolic link.`,
        { cause },
      );
    }
    if (cause instanceof CharacterAuthoringStorageError) throw cause;
    throw storageError('character-record-read-failed', 'read', recordId, cause);
  }
  try {
    return parse(JSON.parse(source));
  } catch (cause) {
    throw storageError('character-record-invalid', 'read', recordId, cause);
  }
}

async function writeRecord(
  workspaceRoot: string,
  relativePath: string,
  recordId: string,
  value: unknown,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const target = await resolveWorkspacePath(workspaceRoot, relativePath, 'write', recordId, true);
  const parent = dirname(target);
  const temporary = join(parent, `.${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    signal?.throwIfAborted();
    await rename(temporary, target);
  } catch (cause) {
    await rm(temporary, { force: true });
    if (cause instanceof CharacterAuthoringStorageError) throw cause;
    throw storageError('character-record-write-failed', 'write', recordId, cause);
  }
}

async function readBinary(
  workspaceRoot: string,
  relativePath: string,
  recordId: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array | undefined> {
  signal?.throwIfAborted();
  const target = await resolveWorkspacePath(workspaceRoot, relativePath, 'read', recordId, false);
  try {
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const entry = await file.stat();
      if (!entry.isFile()) {
        throw new CharacterAuthoringStorageError(
          'character-workspace-path-escape',
          'read',
          recordId,
          `Localized Character asset '${recordId}' must be a regular file below the authorized Workspace root.`,
        );
      }
      if (entry.size > maxBytes) {
        throw new CharacterAuthoringStorageError(
          'character-resource-limit-exceeded',
          'read',
          recordId,
          `Localized Character asset '${recordId}' exceeds the authorized byte limit.`,
        );
      }
      return new Uint8Array(await file.readFile());
    } finally {
      await file.close();
    }
  } catch (cause) {
    if (isErrorCode(cause, 'ENOENT')) return undefined;
    if (isErrorCode(cause, 'ELOOP')) {
      throw new CharacterAuthoringStorageError(
        'character-workspace-path-escape',
        'read',
        recordId,
        `Localized Character asset '${recordId}' cannot be a symbolic link.`,
        { cause },
      );
    }
    if (cause instanceof CharacterAuthoringStorageError) throw cause;
    throw storageError('character-record-read-failed', 'read', recordId, cause);
  }
}

async function writeBinary(
  workspaceRoot: string,
  relativePath: string,
  recordId: string,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const target = await resolveWorkspacePath(workspaceRoot, relativePath, 'write', recordId, true);
  const temporary = join(dirname(target), `.${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    signal?.throwIfAborted();
    await rename(temporary, target);
  } catch (cause) {
    await rm(temporary, { force: true });
    throw storageError('character-record-write-failed', 'write', recordId, cause);
  }
}

async function listFilesRecursively(
  workspaceRoot: string,
  relativeRoot: string,
  signal?: AbortSignal,
): Promise<readonly { readonly relativePath: string; readonly byteLength: number }[]> {
  const root = await resolveWorkspacePath(
    workspaceRoot,
    relativeRoot,
    'list-localized-assets',
    relativeRoot,
    false,
  );
  const files: { relativePath: string; byteLength: number }[] = [];
  try {
    const entry = await lstat(root);
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new CharacterAuthoringStorageError(
        'character-workspace-path-escape',
        'list-localized-assets',
        relativeRoot,
        `Localized Character asset root '${relativeRoot}' must be a regular directory.`,
      );
    }
  } catch (cause) {
    if (isErrorCode(cause, 'ENOENT')) return [];
    throw cause;
  }
  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    signal?.throwIfAborted();
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (cause) {
      if (isErrorCode(cause, 'ENOENT')) return;
      throw storageError(
        'character-record-read-failed',
        'list-localized-assets',
        relativeRoot,
        cause,
      );
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      signal?.throwIfAborted();
      const relativePath =
        relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
      const target = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new CharacterAuthoringStorageError(
          'character-workspace-path-escape',
          'list-localized-assets',
          relativePath,
          `Localized Character asset '${relativePath}' cannot be a symbolic link.`,
        );
      }
      if (entry.isDirectory()) {
        await visit(target, relativePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new CharacterAuthoringStorageError(
          'character-record-invalid',
          'list-localized-assets',
          relativePath,
          `Localized Character asset '${relativePath}' must be a regular file.`,
        );
      }
      files.push({ relativePath, byteLength: (await lstat(target)).size });
    }
  }
  await visit(root, '');
  return files;
}

async function listDirectories(workspaceRoot: string, relativePath: string): Promise<string[]> {
  const target = await resolveWorkspacePath(
    workspaceRoot,
    relativePath,
    'catalog',
    relativePath,
    false,
  );
  try {
    const root = await lstat(target);
    if (root.isSymbolicLink() || !root.isDirectory()) {
      throw new CharacterAuthoringStorageError(
        'character-workspace-path-escape',
        'catalog',
        relativePath,
        `Character authoring directory '${relativePath}' must be a regular directory.`,
      );
    }
    const entries = await readdir(target, { withFileTypes: true });
    const symbolicLink = entries.find((entry) => entry.isSymbolicLink());
    if (symbolicLink) {
      throw new CharacterAuthoringStorageError(
        'character-workspace-path-escape',
        'catalog',
        `${relativePath}/${symbolicLink.name}`,
        `Character authoring directory '${relativePath}' contains a symbolic link.`,
      );
    }
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (cause) {
    if (isErrorCode(cause, 'ENOENT')) return [];
    if (cause instanceof CharacterAuthoringStorageError) throw cause;
    throw storageError('character-record-read-failed', 'catalog', relativePath, cause);
  }
}

async function listJsonFiles(workspaceRoot: string, relativePath: string): Promise<string[]> {
  const target = await resolveWorkspacePath(
    workspaceRoot,
    relativePath,
    'catalog',
    relativePath,
    false,
  );
  try {
    const root = await lstat(target);
    if (root.isSymbolicLink() || !root.isDirectory()) {
      throw new CharacterAuthoringStorageError(
        'character-workspace-path-escape',
        'catalog',
        relativePath,
        `Character authoring directory '${relativePath}' must be a regular directory.`,
      );
    }
    const entries = await readdir(target, { withFileTypes: true });
    const symbolicLink = entries.find(
      (entry) => entry.isSymbolicLink() && entry.name.endsWith('.json'),
    );
    if (symbolicLink) {
      throw new CharacterAuthoringStorageError(
        'character-workspace-path-escape',
        'catalog',
        `${relativePath}/${symbolicLink.name}`,
        `Character authoring directory '${relativePath}' contains a symbolic-link JSON record.`,
      );
    }
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort();
  } catch (cause) {
    if (isErrorCode(cause, 'ENOENT')) return [];
    if (cause instanceof CharacterAuthoringStorageError) throw cause;
    throw storageError('character-record-read-failed', 'catalog', relativePath, cause);
  }
}

async function resolveWorkspacePath(
  workspaceRoot: string,
  relativePath: string,
  operation: string,
  recordId: string,
  createParent: boolean,
): Promise<string> {
  let root: string;
  try {
    root = await realpath(resolve(workspaceRoot));
  } catch (cause) {
    throw storageError('character-workspace-unavailable', operation, recordId, cause);
  }
  const target = resolve(root, relativePath);
  assertContained(root, target, operation, recordId);
  if (createParent) {
    await ensureContainedDirectory(root, dirname(target), operation, recordId);
  } else {
    try {
      const parent = await realpath(dirname(target));
      assertContained(root, parent, operation, recordId);
    } catch (cause) {
      if (!isErrorCode(cause, 'ENOENT')) throw cause;
    }
  }
  return target;
}

async function ensureContainedDirectory(
  root: string,
  directory: string,
  operation: string,
  recordId: string,
): Promise<void> {
  assertContained(root, directory, operation, recordId);
  const segments = relative(root, directory).split(sep).filter(Boolean);
  let cursor = root;
  for (const segment of segments) {
    cursor = join(cursor, segment);
    try {
      const entry = await lstat(cursor);
      if (entry.isSymbolicLink() || !entry.isDirectory()) {
        throw new CharacterAuthoringStorageError(
          'character-workspace-path-escape',
          operation,
          recordId,
          `Character authoring parent for '${recordId}' must contain only regular directories.`,
        );
      }
    } catch (cause) {
      if (!isErrorCode(cause, 'ENOENT')) throw cause;
      await mkdir(cursor, { mode: 0o700 });
    }
  }
}

function assertContained(root: string, target: string, operation: string, recordId: string): void {
  const path = relative(root, target);
  if (path !== '' && !path.startsWith('..') && !isAbsolute(path)) return;
  throw new CharacterAuthoringStorageError(
    'character-workspace-path-escape',
    operation,
    recordId,
    `Character authoring path for '${recordId}' escapes the authorized Workspace root.`,
  );
}

function pathIdentity(identity: string): string {
  if (!/^[A-Za-z0-9._:-]+$/u.test(identity) || identity === '.' || identity === '..') {
    throw new CharacterAuthoringStorageError(
      'character-record-invalid',
      'resolve-path',
      identity,
      `Character identity '${identity}' is not valid in a Workspace-relative path.`,
    );
  }
  return identity;
}

function localizedAssetPath(value: string): string {
  if (
    value.length === 0 ||
    value.includes('\\') ||
    isAbsolute(value) ||
    value.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new CharacterAuthoringStorageError(
      'character-record-invalid',
      'resolve-localized-asset-path',
      value,
      `Localized Character asset path '${value}' must be a safe relative path.`,
    );
  }
  return value;
}

function requirePositiveByteLimit(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CharacterAuthoringStorageError(
      'character-resource-limit-exceeded',
      'read-localized-asset',
      'byte-limit',
      'Localized Character asset byte limit must be a positive safe integer.',
    );
  }
}

function recordConflict(
  operation: string,
  recordId: string,
  message: string,
): CharacterAuthoringStorageError {
  return new CharacterAuthoringStorageError(
    'character-record-conflict',
    operation,
    recordId,
    message,
  );
}

function invalidRecord(
  operation: string,
  recordId: string,
  message: string,
): CharacterAuthoringStorageError {
  return new CharacterAuthoringStorageError(
    'character-record-invalid',
    operation,
    recordId,
    message,
  );
}

function requireAbsoluteRoot(root: string): void {
  if (!isAbsolute(root)) {
    throw new CharacterAuthoringStorageError(
      'character-workspace-unavailable',
      'construct',
      'workspace',
      'Character Workspace root must be an absolute Host-authorized path.',
    );
  }
}

function storageError(
  code: CharacterAuthoringStorageError['code'],
  operation: string,
  recordId: string,
  cause: unknown,
): CharacterAuthoringStorageError {
  return new CharacterAuthoringStorageError(
    code,
    operation,
    recordId,
    `Character authoring ${operation} failed for '${recordId}'.`,
    { cause },
  );
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
