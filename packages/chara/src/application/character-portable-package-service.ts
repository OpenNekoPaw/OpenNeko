import {
  parseCharacterAuthoringTestSnapshot,
  parseCharacterPortablePackageManifest,
  parseCharacterPortablePackagePreview,
  parseCharacterPortableExportScope,
  parseCharacterProject,
  parseCharacterStoryline,
  parseCharacterStorylineDraft,
  parseCharacterStorylineVersion,
  parseCharacterVersion,
  parseCharacterVersionLineage,
  type CharacterAuthoringTestSnapshot,
  type CharacterLocalizedAssetBinding,
  type CharacterLocalizedAssetBindingCatalog,
  type CharacterPortableDestination,
  type CharacterPortableExternalDependency,
  type CharacterPortableEmbeddedAssetEntry,
  type CharacterPortablePackageManifest,
  type CharacterPortablePackagePreview,
  type CharacterPortableExportScope,
  type CharacterPortableRecordKind,
  type CharacterProject,
  type CharacterRepresentationKind,
  type CharacterStoryline,
  type CharacterStorylineDraft,
  type CharacterStorylineVersion,
  type CharacterVersion,
  type CharacterVersionLineage,
} from '@neko/chara/contracts';
import type {
  CharacterAuthoringCatalogPort,
  CharacterAuthoringCatalogScope,
} from './character-durable-catalog';
import type { CharacterAuthoringRepository } from './character-authoring-service';
import type { CharacterLocalizedAssetRepository } from './character-localized-asset-repository';
import type { CharacterStorylineRepository } from './character-storyline-service';
import { projectCharacterVersionGraph } from './character-version-graph-service';
import type { CharacterVersionLineageRepository } from './character-version-lineage-repository';

export interface CharacterPortableRecordSource {
  readonly kind: CharacterPortableRecordKind;
  readonly recordId: string;
  readonly archivePath: string;
  readonly bytes: Uint8Array;
}

export interface CharacterPortableAssetSource {
  readonly representationId: string;
  readonly kind: CharacterRepresentationKind;
  readonly resourceRef: string;
  readonly archivePath: string;
  readonly entry: boolean;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface CharacterPortableArchiveContent {
  readonly manifest: CharacterPortablePackageManifest;
  readonly bytesByArchivePath: ReadonlyMap<string, Uint8Array>;
}

export interface CharacterPortableArchivePort {
  write(
    input: {
      readonly characterProjectId: string;
      readonly entryRecordPath: string;
      readonly records: readonly CharacterPortableRecordSource[];
      readonly embeddedAssets: readonly CharacterPortableAssetSource[];
      readonly externalDependencies: readonly CharacterPortableExternalDependency[];
    },
    signal?: AbortSignal,
  ): Promise<{
    readonly archiveBytes: Uint8Array;
    readonly manifest: CharacterPortablePackageManifest;
  }>;
  read(archiveBytes: Uint8Array, signal?: AbortSignal): Promise<CharacterPortableArchiveContent>;
}

export interface CharacterPortableWorkspaceRepository
  extends
    CharacterAuthoringRepository,
    CharacterVersionLineageRepository,
    CharacterStorylineRepository,
    CharacterLocalizedAssetRepository,
    CharacterAuthoringCatalogPort {}

export interface ExportCharacterPortablePackageInput {
  readonly characterProjectId: string;
  readonly characterStorylineIds: readonly string[];
  readonly authoringTestSnapshotIds: readonly string[];
  readonly embeddedRepresentationIds: readonly string[];
  readonly maxEmbeddedAssetBytes: number;
}

export interface PreviewCharacterPortablePackageInput {
  readonly archiveBytes: Uint8Array;
  readonly destination: CharacterPortableDestination;
}

export class CharacterPortablePackageError extends Error {
  constructor(
    readonly code:
      | 'character-package-source-unavailable'
      | 'character-package-selection-invalid'
      | 'character-package-destination-mismatch'
      | 'character-package-identity-conflict',
    message: string,
  ) {
    super(message);
    this.name = 'CharacterPortablePackageError';
  }
}

export class CharacterPortableImportWriteError extends Error {
  readonly code = 'character-package-install-partial';

  constructor(
    readonly characterProjectId: string,
    readonly installedRecordIds: readonly string[],
    options: ErrorOptions,
  ) {
    super(
      `Character package installation stopped after ${String(installedRecordIds.length)} records. Retry the exact package and destination.`,
      options,
    );
    this.name = 'CharacterPortableImportWriteError';
  }
}

export class CharacterPortablePackageService {
  constructor(
    private readonly repository: CharacterPortableWorkspaceRepository,
    private readonly archive: CharacterPortableArchivePort,
  ) {}

  async getExportScope(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<CharacterPortableExportScope> {
    signal?.throwIfAborted();
    const catalog = await this.repository.readAuthoringCatalog(signal);
    const project = catalog.projects.find(
      (candidate) => candidate.characterProjectId === characterProjectId,
    );
    if (!project) {
      throw portableError(
        'character-package-source-unavailable',
        `CharacterProject '${characterProjectId}' is unavailable in the exact source Workspace.`,
      );
    }
    const versions = catalog.versions.filter(
      (version) => version.characterProjectId === characterProjectId,
    );
    const [lineage, storylines, localizedAssets] = await Promise.all([
      this.repository.readLineage(characterProjectId, signal),
      this.repository.listStorylines(characterProjectId, signal),
      this.repository.readLocalizedAssetBindingCatalog(characterProjectId, signal),
    ]);
    const graph = projectCharacterVersionGraph({
      project,
      versions,
      ...(lineage ? { lineage } : {}),
    });
    const bindingByRepresentation = new Map(
      (localizedAssets?.bindings ?? []).map((binding) => [binding.representationId, binding]),
    );
    return parseCharacterPortableExportScope({
      characterProjectId,
      displayName: project.displayName,
      characterVersionIds: versions.map((version) => version.characterVersionId),
      branchHeadCharacterVersionIds: graph.headCharacterVersionIds,
      unlinkedCharacterVersionIds: graph.unlinkedCharacterVersionIds,
      characterStorylines: storylines.map((storyline) => ({
        characterStorylineId: storyline.characterStorylineId,
        displayName: storyline.displayName,
      })),
      authoringTestSnapshotIds: catalog.authoringTestSnapshots
        .filter((snapshot) => snapshot.characterProjectId === characterProjectId)
        .map((snapshot) => snapshot.authoringTestSnapshotId),
      representations: [...collectRepresentations(project, versions).values()].map(
        (representation) => {
          const binding = bindingByRepresentation.get(representation.representationId);
          return {
            representationId: representation.representationId,
            kind: representation.kind,
            canEmbed: binding !== undefined,
            ownedFileCount: binding?.files.length ?? 0,
            ownedByteLength:
              binding?.files.reduce((total, file) => total + file.byteLength, 0) ?? 0,
          };
        },
      ),
    });
  }

  async exportPackage(
    input: ExportCharacterPortablePackageInput,
    signal?: AbortSignal,
  ): Promise<{
    readonly archiveBytes: Uint8Array;
    readonly manifest: CharacterPortablePackageManifest;
  }> {
    signal?.throwIfAborted();
    requirePositiveByteLimit(input.maxEmbeddedAssetBytes);
    const catalog = await this.repository.readAuthoringCatalog(signal);
    const project = catalog.projects.find(
      (candidate) => candidate.characterProjectId === input.characterProjectId,
    );
    if (!project) {
      throw portableError(
        'character-package-source-unavailable',
        `CharacterProject '${input.characterProjectId}' is unavailable in the exact source Workspace.`,
      );
    }
    const versions = catalog.versions.filter(
      (version) => version.characterProjectId === input.characterProjectId,
    );
    const lineage = await this.repository.readLineage(input.characterProjectId, signal);
    const records: CharacterPortableRecordSource[] = [
      record('character-project', project.characterProjectId, 'character/project.json', project),
      ...versions.map((version) =>
        record(
          'character-version',
          version.characterVersionId,
          `character/versions/${version.characterVersionId}.json`,
          version,
        ),
      ),
    ];
    if (lineage) {
      records.push(
        record(
          'character-version-lineage',
          lineage.characterProjectId,
          'character/lineage.json',
          lineage,
        ),
      );
    }
    await this.collectStorylineRecords(
      project,
      unique(input.characterStorylineIds, 'CharacterStoryline selection'),
      records,
      signal,
    );
    collectAuthoringTests(
      project.characterProjectId,
      unique(input.authoringTestSnapshotIds, 'authoring-test selection'),
      catalog.authoringTestSnapshots,
      records,
    );
    const knownRepresentations = collectRepresentations(project, versions);
    const localizedAssetBindings = await this.repository.readLocalizedAssetBindingCatalog(
      project.characterProjectId,
      signal,
    );
    const embeddedAssets = await this.collectEmbeddedAssets(
      unique(input.embeddedRepresentationIds, 'embedded representation selection'),
      knownRepresentations,
      localizedAssetBindings,
      input.maxEmbeddedAssetBytes,
      project.characterProjectId,
      signal,
    );
    const embeddedIds = new Set(embeddedAssets.map((asset) => asset.representationId));
    const externalDependencies = [...knownRepresentations.values()]
      .filter((representation) => !embeddedIds.has(representation.representationId))
      .map((representation): CharacterPortableExternalDependency => ({
        representationId: representation.representationId,
        kind: representation.kind,
        resourceRef: representation.resourceRef,
      }))
      .sort((left, right) => left.representationId.localeCompare(right.representationId));
    signal?.throwIfAborted();
    return this.archive.write(
      {
        characterProjectId: project.characterProjectId,
        entryRecordPath: 'character/project.json',
        records,
        embeddedAssets,
        externalDependencies,
      },
      signal,
    );
  }

  async previewImport(
    input: PreviewCharacterPortablePackageInput,
    signal?: AbortSignal,
  ): Promise<CharacterPortablePackagePreview> {
    const content = await this.archive.read(input.archiveBytes, signal);
    return this.previewDecoded(decodePackage(content), input.destination, signal);
  }

  async commitImport(
    input: PreviewCharacterPortablePackageInput,
    signal?: AbortSignal,
  ): Promise<{ readonly characterProjectId: string }> {
    const content = await this.archive.read(input.archiveBytes, signal);
    const decoded = decodePackage(content);
    const preview = await this.previewDecoded(decoded, input.destination, signal);
    if (!preview.canCommit) {
      throw portableError(
        'character-package-identity-conflict',
        `Character package has ${String(preview.conflicts.length)} exact identity conflicts.`,
      );
    }
    const installed: string[] = [];
    try {
      await this.repository.saveProject(decoded.project, signal);
      installed.push(`character-project:${decoded.project.characterProjectId}`);
      for (const version of decoded.versions) {
        await this.repository.storePublication(version, signal);
        installed.push(`character-version:${version.characterVersionId}`);
      }
      if (decoded.lineage) {
        await this.repository.saveLineage(decoded.lineage, signal);
        installed.push(`character-version-lineage:${decoded.lineage.characterProjectId}`);
      }
      for (const storyline of decoded.storylines) {
        const draft = requireStorylineDraft(decoded, storyline.characterStorylineId);
        const existing = await this.repository.readStoryline(
          storyline.characterStorylineId,
          signal,
        );
        if (!existing) await this.repository.createStoryline(storyline, draft, signal);
        installed.push(`character-storyline:${storyline.characterStorylineId}`);
      }
      for (const version of decoded.storylineVersions) {
        await this.repository.storeStorylineVersion(version, signal);
        installed.push(`character-storyline-version:${version.characterStorylineVersionId}`);
      }
      for (const snapshot of decoded.authoringTests) {
        await this.repository.saveAuthoringTestSnapshot(snapshot, signal);
        installed.push(`authoring-test-snapshot:${snapshot.authoringTestSnapshotId}`);
      }
      for (const asset of decoded.embeddedAssets) {
        await this.repository.storeLocalizedAsset(
          decoded.project.characterProjectId,
          asset.relativeAssetPath,
          asset.bytes,
          signal,
        );
        installed.push(`localized-asset:${asset.relativeAssetPath}`);
      }
      if (decoded.localizedAssetBindings.bindings.length > 0) {
        const existingBindings = await this.repository.readLocalizedAssetBindingCatalog(
          decoded.project.characterProjectId,
          signal,
        );
        await this.repository.saveLocalizedAssetBindingCatalog(
          mergeLocalizedAssetBindings(decoded.localizedAssetBindings, existingBindings),
          signal,
        );
        installed.push(
          ...decoded.localizedAssetBindings.bindings.map(
            (binding) => `localized-asset-binding:${binding.representationId}`,
          ),
        );
      }
    } catch (cause) {
      throw new CharacterPortableImportWriteError(decoded.project.characterProjectId, installed, {
        cause,
      });
    }
    return { characterProjectId: decoded.project.characterProjectId };
  }

  private async collectStorylineRecords(
    project: CharacterProject,
    selectedIds: readonly string[],
    records: CharacterPortableRecordSource[],
    signal?: AbortSignal,
  ): Promise<void> {
    for (const storylineId of selectedIds) {
      signal?.throwIfAborted();
      const storyline = await this.repository.readStoryline(storylineId, signal);
      if (!storyline || storyline.characterProjectId !== project.characterProjectId) {
        throw portableError(
          'character-package-selection-invalid',
          `CharacterStoryline '${storylineId}' is unavailable in exact CharacterProject '${project.characterProjectId}'.`,
        );
      }
      const draft = await this.repository.readStorylineDraft(storylineId, signal);
      if (!draft) {
        throw portableError(
          'character-package-source-unavailable',
          `CharacterStorylineDraft '${storylineId}' is unavailable.`,
        );
      }
      const versions = await this.repository.listStorylineVersions(storylineId, signal);
      records.push(
        record(
          'character-storyline',
          storylineId,
          `character/storylines/${storylineId}/storyline.json`,
          storyline,
        ),
        record(
          'character-storyline-draft',
          storylineId,
          `character/storylines/${storylineId}/draft.json`,
          draft,
        ),
        ...versions.map((version) =>
          record(
            'character-storyline-version',
            version.characterStorylineVersionId,
            `character/storylines/${storylineId}/versions/${version.characterStorylineVersionId}.json`,
            version,
          ),
        ),
      );
    }
  }

  private async collectEmbeddedAssets(
    selectedRepresentationIds: readonly string[],
    knownRepresentations: ReadonlyMap<
      string,
      {
        readonly representationId: string;
        readonly kind: CharacterRepresentationKind;
        readonly resourceRef: string;
      }
    >,
    bindingCatalog: CharacterLocalizedAssetBindingCatalog | undefined,
    maxBytes: number,
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<readonly CharacterPortableAssetSource[]> {
    const assets: CharacterPortableAssetSource[] = [];
    let totalBytes = 0;
    for (const representationId of selectedRepresentationIds) {
      const representation = knownRepresentations.get(representationId);
      const binding = bindingCatalog?.bindings.find(
        (candidate) => candidate.representationId === representationId,
      );
      if (
        !representation ||
        !binding ||
        binding.kind !== representation.kind ||
        binding.resourceRef !== representation.resourceRef
      ) {
        throw portableError(
          'character-package-selection-invalid',
          `Embedded asset selection '${representationId}' has no complete exact localized binding.`,
        );
      }
      for (const file of binding.files) {
        const bytes = await this.repository.readLocalizedAsset(
          characterProjectId,
          file.relativeAssetPath,
          Math.max(1, Math.min(maxBytes, file.byteLength)),
          signal,
        );
        if (!bytes || bytes.byteLength !== file.byteLength) {
          throw portableError(
            'character-package-source-unavailable',
            `Localized Character asset '${file.relativeAssetPath}' is unavailable or changed.`,
          );
        }
        totalBytes += bytes.byteLength;
        if (totalBytes > maxBytes) {
          throw portableError(
            'character-package-selection-invalid',
            `Embedded Character assets exceed the ${String(maxBytes)} byte selection limit.`,
          );
        }
        assets.push({
          representationId: representation.representationId,
          kind: representation.kind,
          resourceRef: representation.resourceRef,
          archivePath: `assets/${file.relativeAssetPath}`,
          entry: file.relativeAssetPath === binding.entryRelativeAssetPath,
          mediaType: file.mediaType,
          bytes,
        });
      }
    }
    return assets;
  }

  private async previewDecoded(
    decoded: DecodedCharacterPackage,
    destination: CharacterPortableDestination,
    signal?: AbortSignal,
  ): Promise<CharacterPortablePackagePreview> {
    signal?.throwIfAborted();
    const catalog = await this.repository.readAuthoringCatalog(signal);
    assertDestination(catalog.scope, destination);
    const conflicts: { kind: CharacterPortableRecordKind | 'localized-asset'; recordId: string }[] =
      [];
    const existingProject = catalog.projects.find(
      (project) => project.characterProjectId === decoded.project.characterProjectId,
    );
    conflictIfDifferent(
      existingProject,
      decoded.project,
      'character-project',
      decoded.project.characterProjectId,
      conflicts,
    );
    for (const version of decoded.versions) {
      conflictIfDifferent(
        catalog.versions.find(
          (candidate) => candidate.characterVersionId === version.characterVersionId,
        ),
        version,
        'character-version',
        version.characterVersionId,
        conflicts,
      );
    }
    if (decoded.lineage) {
      conflictIfDifferent(
        await this.repository.readLineage(decoded.project.characterProjectId, signal),
        decoded.lineage,
        'character-version-lineage',
        decoded.project.characterProjectId,
        conflicts,
      );
    }
    for (const storyline of decoded.storylines) {
      conflictIfDifferent(
        await this.repository.readStoryline(storyline.characterStorylineId, signal),
        storyline,
        'character-storyline',
        storyline.characterStorylineId,
        conflicts,
      );
      conflictIfDifferent(
        await this.repository.readStorylineDraft(storyline.characterStorylineId, signal),
        requireStorylineDraft(decoded, storyline.characterStorylineId),
        'character-storyline-draft',
        storyline.characterStorylineId,
        conflicts,
      );
    }
    for (const version of decoded.storylineVersions) {
      conflictIfDifferent(
        await this.repository.readStorylineVersion(version.characterStorylineVersionId, signal),
        version,
        'character-storyline-version',
        version.characterStorylineVersionId,
        conflicts,
      );
    }
    for (const snapshot of decoded.authoringTests) {
      conflictIfDifferent(
        catalog.authoringTestSnapshots.find(
          (candidate) => candidate.authoringTestSnapshotId === snapshot.authoringTestSnapshotId,
        ),
        snapshot,
        'authoring-test-snapshot',
        snapshot.authoringTestSnapshotId,
        conflicts,
      );
    }
    const existingAssets = existingProject
      ? await this.repository.listLocalizedAssets(decoded.project.characterProjectId, signal)
      : [];
    for (const asset of decoded.embeddedAssets) {
      const descriptor = existingAssets.find(
        (candidate) => candidate.relativeAssetPath === asset.relativeAssetPath,
      );
      if (descriptor && descriptor.byteLength !== asset.bytes.byteLength) {
        conflicts.push({ kind: 'localized-asset', recordId: asset.relativeAssetPath });
        continue;
      }
      const existing = descriptor
        ? await this.repository.readLocalizedAsset(
            decoded.project.characterProjectId,
            asset.relativeAssetPath,
            Math.max(1, descriptor.byteLength),
            signal,
          )
        : undefined;
      conflictIfDifferent(
        existing,
        asset.bytes,
        'localized-asset',
        asset.relativeAssetPath,
        conflicts,
      );
    }
    const existingBindings = existingProject
      ? await this.repository.readLocalizedAssetBindingCatalog(
          decoded.project.characterProjectId,
          signal,
        )
      : undefined;
    for (const binding of decoded.localizedAssetBindings.bindings) {
      conflictIfDifferent(
        existingBindings?.bindings.find(
          (candidate) => candidate.representationId === binding.representationId,
        ),
        binding,
        'localized-asset',
        binding.representationId,
        conflicts,
      );
    }
    const graph = projectCharacterVersionGraph({
      project: decoded.project,
      versions: decoded.versions,
      ...(decoded.lineage === undefined ? {} : { lineage: decoded.lineage }),
    });
    return parseCharacterPortablePackagePreview({
      destination,
      characterProjectId: decoded.project.characterProjectId,
      displayName: decoded.project.displayName,
      characterVersionIds: decoded.versions.map((version) => version.characterVersionId),
      branchHeadCharacterVersionIds: graph.headCharacterVersionIds,
      unlinkedCharacterVersionIds: graph.unlinkedCharacterVersionIds,
      characterStorylineIds: decoded.storylines.map((storyline) => storyline.characterStorylineId),
      embeddedAssets: decoded.content.manifest.embeddedAssets,
      externalDependencies: decoded.content.manifest.externalDependencies,
      conflicts,
      canCommit: conflicts.length === 0,
    });
  }
}

interface DecodedCharacterPackage {
  readonly content: CharacterPortableArchiveContent;
  readonly project: CharacterProject;
  readonly versions: readonly CharacterVersion[];
  readonly lineage?: CharacterVersionLineage;
  readonly storylines: readonly CharacterStoryline[];
  readonly storylineDrafts: readonly CharacterStorylineDraft[];
  readonly storylineVersions: readonly CharacterStorylineVersion[];
  readonly authoringTests: readonly CharacterAuthoringTestSnapshot[];
  readonly embeddedAssets: readonly {
    readonly relativeAssetPath: string;
    readonly bytes: Uint8Array;
  }[];
  readonly localizedAssetBindings: CharacterLocalizedAssetBindingCatalog;
}

function decodePackage(content: CharacterPortableArchiveContent): DecodedCharacterPackage {
  const manifest = parseCharacterPortablePackageManifest(content.manifest);
  let project: CharacterProject | undefined;
  const versions: CharacterVersion[] = [];
  let lineage: CharacterVersionLineage | undefined;
  const storylines: CharacterStoryline[] = [];
  const storylineDrafts: CharacterStorylineDraft[] = [];
  const storylineVersions: CharacterStorylineVersion[] = [];
  const authoringTests: CharacterAuthoringTestSnapshot[] = [];
  for (const entry of manifest.records) {
    const value = decodeRecord(content, entry.archivePath, entry.recordId);
    switch (entry.kind) {
      case 'character-project':
        project = parseCharacterProject(value);
        break;
      case 'character-version':
        versions.push(parseCharacterVersion(value));
        break;
      case 'character-version-lineage':
        lineage = parseCharacterVersionLineage(value);
        break;
      case 'character-storyline':
        storylines.push(parseCharacterStoryline(value));
        break;
      case 'character-storyline-draft':
        storylineDrafts.push(parseCharacterStorylineDraft(value));
        break;
      case 'character-storyline-version':
        storylineVersions.push(parseCharacterStorylineVersion(value));
        break;
      case 'authoring-test-snapshot':
        authoringTests.push(parseCharacterAuthoringTestSnapshot(value));
        break;
    }
  }
  if (!project || project.characterProjectId !== manifest.characterProjectId) {
    throw portableError(
      'character-package-selection-invalid',
      'Character package entry CharacterProject is unavailable or mismatched.',
    );
  }
  validateDecodedOwnership({
    project,
    versions,
    lineage,
    storylines,
    storylineDrafts,
    storylineVersions,
    authoringTests,
    embeddedAssets: manifest.embeddedAssets,
    externalDependencies: manifest.externalDependencies,
  });
  const localizedAssetBindings = decodeLocalizedAssetBindings(manifest);
  return {
    content,
    project,
    versions,
    ...(lineage === undefined ? {} : { lineage }),
    storylines,
    storylineDrafts,
    storylineVersions,
    authoringTests,
    embeddedAssets: manifest.embeddedAssets.map((entry) => ({
      relativeAssetPath: entry.archivePath.slice('assets/'.length),
      bytes: requireBytes(content, entry.archivePath),
    })),
    localizedAssetBindings: {
      characterProjectId: project.characterProjectId,
      bindings: localizedAssetBindings,
    },
  };
}

function validateDecodedOwnership(input: {
  readonly project: CharacterProject;
  readonly versions: readonly CharacterVersion[];
  readonly lineage?: CharacterVersionLineage;
  readonly storylines: readonly CharacterStoryline[];
  readonly storylineDrafts: readonly CharacterStorylineDraft[];
  readonly storylineVersions: readonly CharacterStorylineVersion[];
  readonly authoringTests: readonly CharacterAuthoringTestSnapshot[];
  readonly embeddedAssets: readonly CharacterPortableEmbeddedAssetEntry[];
  readonly externalDependencies: readonly CharacterPortableExternalDependency[];
}): void {
  const projectId = input.project.characterProjectId;
  const versionIds = new Set(input.versions.map((version) => version.characterVersionId));
  if (input.versions.some((version) => version.characterProjectId !== projectId)) {
    throw portableError('character-package-selection-invalid', 'CharacterVersion owner mismatch.');
  }
  if (input.lineage && input.lineage.characterProjectId !== projectId) {
    throw portableError(
      'character-package-selection-invalid',
      'CharacterVersion lineage owner mismatch.',
    );
  }
  if (
    input.lineage?.relations.some(
      (relation) =>
        !versionIds.has(relation.characterVersionId) ||
        relation.parentCharacterVersionIds.some((parentId) => !versionIds.has(parentId)),
    )
  ) {
    throw portableError(
      'character-package-selection-invalid',
      'CharacterVersion lineage references a version outside the package.',
    );
  }
  const storylineIds = new Set(input.storylines.map((storyline) => storyline.characterStorylineId));
  if (input.storylines.some((storyline) => storyline.characterProjectId !== projectId)) {
    throw portableError(
      'character-package-selection-invalid',
      'CharacterStoryline owner mismatch.',
    );
  }
  for (const storylineId of storylineIds) requireStorylineDraft(input, storylineId);
  if (
    input.storylineDrafts.some(
      (draft) =>
        !storylineIds.has(draft.characterStorylineId) || !versionIds.has(draft.characterVersionId),
    ) ||
    input.storylineVersions.some(
      (version) =>
        !storylineIds.has(version.characterStorylineId) ||
        !versionIds.has(version.characterVersionId),
    )
  ) {
    throw portableError(
      'character-package-selection-invalid',
      'Character Storyline records reference facts outside the package.',
    );
  }
  if (input.authoringTests.some((snapshot) => snapshot.characterProjectId !== projectId)) {
    throw portableError('character-package-selection-invalid', 'Authoring test owner mismatch.');
  }
  const representations = collectRepresentations(input.project, input.versions);
  const inventoriedRepresentationIds = new Set([
    ...input.embeddedAssets.map((asset) => asset.representationId),
    ...input.externalDependencies.map((dependency) => dependency.representationId),
  ]);
  if (
    inventoriedRepresentationIds.size !== representations.size ||
    [...representations.keys()].some(
      (representationId) => !inventoriedRepresentationIds.has(representationId),
    )
  ) {
    throw portableError(
      'character-package-selection-invalid',
      'Character package representation inventory must cover every exact Character representation.',
    );
  }
  for (const entry of [...input.embeddedAssets, ...input.externalDependencies]) {
    const representation = representations.get(entry.representationId);
    if (
      representation === undefined ||
      representation.kind !== entry.kind ||
      representation.resourceRef !== entry.resourceRef
    ) {
      throw portableError(
        'character-package-selection-invalid',
        `Character package representation '${entry.representationId}' does not match the exact Character facts.`,
      );
    }
  }
}

function decodeLocalizedAssetBindings(
  manifest: CharacterPortablePackageManifest,
): readonly CharacterLocalizedAssetBinding[] {
  const byRepresentation = new Map<string, CharacterPortableEmbeddedAssetEntry[]>();
  for (const asset of manifest.embeddedAssets) {
    const entries = byRepresentation.get(asset.representationId) ?? [];
    entries.push(asset);
    byRepresentation.set(asset.representationId, entries);
  }
  return [...byRepresentation.values()]
    .map((entries): CharacterLocalizedAssetBinding => {
      const first = entries[0];
      const entry = entries.find((asset) => asset.entry);
      if (first === undefined || entry === undefined) {
        throw portableError(
          'character-package-selection-invalid',
          'Character package embedded asset binding has no exact entry file.',
        );
      }
      return {
        representationId: first.representationId,
        kind: first.kind,
        resourceRef: first.resourceRef,
        entryRelativeAssetPath: entry.archivePath.slice('assets/'.length),
        files: entries.map((asset) => ({
          relativeAssetPath: asset.archivePath.slice('assets/'.length),
          mediaType: asset.mediaType,
          byteLength: asset.byteLength,
        })),
      };
    })
    .sort((left, right) => left.representationId.localeCompare(right.representationId));
}

function mergeLocalizedAssetBindings(
  imported: CharacterLocalizedAssetBindingCatalog,
  existing: CharacterLocalizedAssetBindingCatalog | undefined,
): CharacterLocalizedAssetBindingCatalog {
  if (existing !== undefined && existing.characterProjectId !== imported.characterProjectId) {
    throw portableError(
      'character-package-destination-mismatch',
      `Localized Character asset bindings belong to another CharacterProject '${existing.characterProjectId}'.`,
    );
  }
  const bindings = new Map(
    (existing?.bindings ?? []).map((binding) => [binding.representationId, binding]),
  );
  for (const binding of imported.bindings) {
    const current = bindings.get(binding.representationId);
    if (current !== undefined && !same(current, binding)) {
      throw portableError(
        'character-package-identity-conflict',
        `Localized Character asset binding '${binding.representationId}' already exists with different facts.`,
      );
    }
    bindings.set(binding.representationId, binding);
  }
  return {
    characterProjectId: imported.characterProjectId,
    bindings: [...bindings.values()].sort((left, right) =>
      left.representationId.localeCompare(right.representationId),
    ),
  };
}

function collectAuthoringTests(
  characterProjectId: string,
  selectedIds: readonly string[],
  snapshots: readonly CharacterAuthoringTestSnapshot[],
  records: CharacterPortableRecordSource[],
): void {
  for (const identity of selectedIds) {
    const snapshot = snapshots.find((candidate) => candidate.authoringTestSnapshotId === identity);
    if (!snapshot || snapshot.characterProjectId !== characterProjectId) {
      throw portableError(
        'character-package-selection-invalid',
        `Character authoring test '${identity}' is unavailable in the exact CharacterProject.`,
      );
    }
    records.push(
      record(
        'authoring-test-snapshot',
        identity,
        `character/authoring-tests/${identity}.json`,
        snapshot,
      ),
    );
  }
}

function collectRepresentations(
  project: CharacterProject,
  versions: readonly CharacterVersion[],
): ReadonlyMap<
  string,
  {
    readonly representationId: string;
    readonly kind: CharacterRepresentationKind;
    readonly resourceRef: string;
  }
> {
  const byId = new Map<
    string,
    {
      readonly representationId: string;
      readonly kind: CharacterRepresentationKind;
      readonly resourceRef: string;
    }
  >();
  for (const representation of [
    ...project.draft.representationRefs,
    ...versions.flatMap((version) => version.definition.representationRefs),
  ]) {
    const existing = byId.get(representation.representationId);
    if (existing && !same(existing, representation)) {
      throw portableError(
        'character-package-selection-invalid',
        `Representation '${representation.representationId}' has conflicting facts across selected Character versions.`,
      );
    }
    byId.set(representation.representationId, representation);
  }
  return byId;
}

function decodeRecord(
  content: CharacterPortableArchiveContent,
  archivePath: string,
  recordId: string,
): unknown {
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(requireBytes(content, archivePath)),
    );
  } catch (cause) {
    throw portableError(
      'character-package-selection-invalid',
      `Character package record '${recordId}' cannot be decoded: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

function requireBytes(content: CharacterPortableArchiveContent, archivePath: string): Uint8Array {
  const bytes = content.bytesByArchivePath.get(archivePath);
  if (!bytes) {
    throw portableError(
      'character-package-selection-invalid',
      `Character package entry '${archivePath}' is unavailable.`,
    );
  }
  return bytes;
}

function record(
  kind: CharacterPortableRecordKind,
  recordId: string,
  archivePath: string,
  value: unknown,
): CharacterPortableRecordSource {
  return { kind, recordId, archivePath, bytes: encodeJson(value) };
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function conflictIfDifferent(
  existing: unknown,
  incoming: unknown,
  kind: CharacterPortableRecordKind | 'localized-asset',
  recordId: string,
  conflicts: { kind: CharacterPortableRecordKind | 'localized-asset'; recordId: string }[],
): void {
  if (existing !== undefined && !same(existing, incoming)) conflicts.push({ kind, recordId });
}

function same(left: unknown, right: unknown): boolean {
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return (
      left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
    );
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireStorylineDraft(
  decoded: Pick<DecodedCharacterPackage, 'storylineDrafts'>,
  storylineId: string,
): CharacterStorylineDraft {
  const drafts = decoded.storylineDrafts.filter(
    (draft) => draft.characterStorylineId === storylineId,
  );
  const draft = drafts[0];
  if (draft === undefined || drafts.length !== 1) {
    throw portableError(
      'character-package-selection-invalid',
      `CharacterStoryline '${storylineId}' must have exactly one draft in the package.`,
    );
  }
  return draft;
}

function assertDestination(
  scope: CharacterAuthoringCatalogScope,
  destination: CharacterPortableDestination,
): void {
  if (
    scope.kind !== destination.kind ||
    (scope.kind === 'content-project' &&
      destination.kind === 'content-project' &&
      scope.contentProjectId !== destination.contentProjectId)
  ) {
    throw portableError(
      'character-package-destination-mismatch',
      'Character package destination does not match the exact authorized Workspace repository.',
    );
  }
}

function requirePositiveByteLimit(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw portableError(
      'character-package-selection-invalid',
      'Character package embedded asset byte limit must be a positive safe integer.',
    );
  }
}

function unique(values: readonly string[], label: string): readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw portableError(
        'character-package-selection-invalid',
        `${label} contains duplicate identity '${value}'.`,
      );
    }
    seen.add(value);
  }
  return values;
}

function portableError(
  code: CharacterPortablePackageError['code'],
  message: string,
): CharacterPortablePackageError {
  return new CharacterPortablePackageError(code, message);
}
