import {
  parseCharacterPortablePackageManifest,
  parseCharacterPortableExportScope,
  parseCharacterProject,
  parseCharacterVersion,
  parseGlobalCharacterVersion,
  type CharacterLocalizedAssetBinding,
  type CharacterLocalizedAssetBindingCatalog,
  type CharacterPortableExternalDependency,
  type CharacterPortableEmbeddedAssetEntry,
  type CharacterPortablePackageManifest,
  type CharacterPortableExportScope,
  type CharacterPortableRecordKind,
  type CharacterProject,
  type CharacterRepresentationKind,
  type CharacterVersion,
} from '@neko/chara/contracts';
import type { CharacterAuthoringCatalogPort } from './character-durable-catalog';
import type { CharacterAuthoringRepository } from './character-authoring-service';
import type { CharacterLocalizedAssetRepository } from './character-localized-asset-repository';
import type {
  CharacterGlobalCatalogService,
  CharacterGlobalImportReceipt,
  ImportCharacterGlobalVersionInput,
} from './character-global-catalog-service';

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
    CharacterLocalizedAssetRepository,
    CharacterAuthoringCatalogPort {}

export interface ExportCharacterPortablePackageInput {
  readonly characterProjectId: string;
  readonly characterVersionId: string;
  readonly embeddedRepresentationIds: readonly string[];
  readonly maxEmbeddedAssetBytes: number;
}

export interface ImportCharacterPortablePackageToGlobalInput {
  readonly archiveBytes: Uint8Array;
  readonly target?: ImportCharacterGlobalVersionInput['target'];
  readonly globalCatalog: CharacterGlobalCatalogService;
}

export class CharacterPortablePackageError extends Error {
  constructor(
    readonly code: 'character-package-source-unavailable' | 'character-package-selection-invalid',
    message: string,
  ) {
    super(message);
    this.name = 'CharacterPortablePackageError';
  }
}

export class CharacterPortablePackageService {
  constructor(
    private readonly repository: CharacterPortableWorkspaceRepository | undefined,
    private readonly archive: CharacterPortableArchivePort,
  ) {}

  async getExportScope(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<CharacterPortableExportScope> {
    signal?.throwIfAborted();
    const repository = this.requireRepository();
    const catalog = await repository.readAuthoringCatalog(signal);
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
    const localizedAssets = await repository.readLocalizedAssetBindingCatalog(
      characterProjectId,
      signal,
    );
    const bindingByRepresentation = new Map(
      (localizedAssets?.bindings ?? []).map((binding) => [binding.representationId, binding]),
    );
    return parseCharacterPortableExportScope({
      characterProjectId,
      displayName: project.displayName,
      characterVersionIds: versions.map((version) => version.characterVersionId),
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
    const repository = this.requireRepository();
    const catalog = await repository.readAuthoringCatalog(signal);
    const project = catalog.projects.find(
      (candidate) => candidate.characterProjectId === input.characterProjectId,
    );
    if (!project) {
      throw portableError(
        'character-package-source-unavailable',
        `CharacterProject '${input.characterProjectId}' is unavailable in the exact source Workspace.`,
      );
    }
    const version = catalog.versions.find(
      (candidate) => candidate.characterVersionId === input.characterVersionId,
    );
    if (!version || version.characterProjectId !== input.characterProjectId) {
      throw portableError(
        'character-package-selection-invalid',
        `CharacterVersion '${input.characterVersionId}' does not belong to CharacterProject '${input.characterProjectId}'.`,
      );
    }
    const versions = [version];
    const records: CharacterPortableRecordSource[] = [
      record('character-project', project.characterProjectId, 'character/project.json', project),
      record(
        'character-version',
        version.characterVersionId,
        `character/versions/${version.characterVersionId}.json`,
        version,
      ),
    ];
    const knownRepresentations = collectRepresentations(project, versions);
    const localizedAssetBindings = await repository.readLocalizedAssetBindingCatalog(
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

  async importIntoGlobal(
    input: ImportCharacterPortablePackageToGlobalInput,
    signal?: AbortSignal,
  ): Promise<CharacterGlobalImportReceipt> {
    signal?.throwIfAborted();
    const content = await this.archive.read(input.archiveBytes, signal);
    const decoded = decodePackage(content);
    if (decoded.versions.length !== 1) {
      throw portableError(
        'character-package-selection-invalid',
        'A Character package must contain exactly one immutable CharacterVersion.',
      );
    }
    const version = decoded.versions[0];
    if (version === undefined) {
      throw portableError(
        'character-package-selection-invalid',
        'Character package does not contain a CharacterVersion.',
      );
    }
    const target: ImportCharacterGlobalVersionInput['target'] = input.target ?? {
      kind: 'new' as const,
      globalCharacterId: decoded.project.characterProjectId,
    };
    const globalVersion = parseGlobalCharacterVersion({
      characterVersionId: version.characterVersionId,
      globalCharacterId: target.globalCharacterId,
      label: version.label,
      definition: version.definition,
      acceptedEvidenceIds: version.acceptedEvidenceIds,
      publishedAt: version.publishedAt,
    });
    if (target.kind === 'new') {
      return input.globalCatalog.importVersion(
        { target, displayName: decoded.project.displayName, characterVersion: globalVersion },
        signal,
      );
    }
    return input.globalCatalog.importVersion(
      { target, displayName: decoded.project.displayName, characterVersion: globalVersion },
      signal,
    );
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
        const bytes = await this.requireRepository().readLocalizedAsset(
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

  private requireRepository(): CharacterPortableWorkspaceRepository {
    if (!this.repository) {
      throw portableError(
        'character-package-source-unavailable',
        'Character package export requires an exact Project Workspace source.',
      );
    }
    return this.repository;
  }
}

interface DecodedCharacterPackage {
  readonly content: CharacterPortableArchiveContent;
  readonly project: CharacterProject;
  readonly versions: readonly CharacterVersion[];
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
  for (const entry of manifest.records) {
    const value = decodeRecord(content, entry.archivePath, entry.recordId);
    switch (entry.kind) {
      case 'character-project':
        project = parseCharacterProject(value);
        break;
      case 'character-version':
        versions.push(parseCharacterVersion(value));
        break;
    }
  }
  if (!project || project.characterProjectId !== manifest.characterProjectId) {
    throw portableError(
      'character-package-selection-invalid',
      'Character package entry CharacterProject is unavailable or mismatched.',
    );
  }
  if (versions.length !== 1) {
    throw portableError(
      'character-package-selection-invalid',
      'Character package must contain exactly one immutable CharacterVersion.',
    );
  }
  validateDecodedOwnership({
    project,
    versions,
    embeddedAssets: manifest.embeddedAssets,
    externalDependencies: manifest.externalDependencies,
  });
  const localizedAssetBindings = decodeLocalizedAssetBindings(manifest);
  return {
    content,
    project,
    versions,
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
  readonly embeddedAssets: readonly CharacterPortableEmbeddedAssetEntry[];
  readonly externalDependencies: readonly CharacterPortableExternalDependency[];
}): void {
  const projectId = input.project.characterProjectId;
  if (input.versions.some((version) => version.characterProjectId !== projectId)) {
    throw portableError('character-package-selection-invalid', 'CharacterVersion owner mismatch.');
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

function same(left: unknown, right: unknown): boolean {
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return (
      left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
    );
  }
  return JSON.stringify(left) === JSON.stringify(right);
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
