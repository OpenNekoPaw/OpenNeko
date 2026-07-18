import * as path from 'node:path';
import type {
  AssetEntity,
  AssetFile,
  AssetManifest,
  CharacterAssetDimension,
  CharacterAssetExportResult,
  CharacterAssetMediaKind,
  CharacterPackExportRequest,
  CharacterPackExportResult,
  CharacterRecord,
  EntityAssetBinding,
  EntityAssetBindingRole,
  MediaKind,
  NkEntityArtifact,
  NkEntityBinding,
  NkEntityExportRequest,
} from '@neko/shared';
import { collectCharacterLookupKeys, isMediaKind, normalizeCharacterLookupKey } from '@neko/shared';
import { parseProjectAssetEntityId } from '@neko/asset';

interface ZipLike {
  addFile(entryName: string, data: Buffer): void;
  toBuffer(): Buffer;
}

type ZipConstructor = new () => ZipLike;

export interface CharacterAssetExportFileSystem {
  readonly readFile: (filePath: string) => Promise<Uint8Array>;
  readonly writeFile: (filePath: string, data: Uint8Array) => Promise<void>;
  readonly createDirectory: (dirPath: string) => Promise<void>;
  readonly exists?: (filePath: string) => Promise<boolean>;
}

export interface CharacterAssetLibraryReader {
  getAllEntities(): Promise<readonly AssetEntity[]>;
  resolvePath(storedPath: string): string;
}

export interface CharacterRegistryReader {
  list(): Promise<readonly CharacterRecord[]>;
}

export interface EntityAssetBindingReader {
  list(): Promise<readonly EntityAssetBinding[]>;
}

export interface CharacterAssetExportServiceOptions {
  readonly fs: CharacterAssetExportFileSystem;
  readonly library: CharacterAssetLibraryReader;
  readonly characters: CharacterRegistryReader;
  readonly bindings: EntityAssetBindingReader;
  readonly zipConstructor?: ZipConstructor;
  readonly now?: () => Date;
}

export class CharacterAssetExportService {
  private readonly fs: CharacterAssetExportFileSystem;
  private readonly library: CharacterAssetLibraryReader;
  private readonly characters: CharacterRegistryReader;
  private readonly bindings: EntityAssetBindingReader;
  private readonly zipConstructor: ZipConstructor;
  private readonly now: () => Date;

  constructor(options: CharacterAssetExportServiceOptions) {
    this.fs = options.fs;
    this.library = options.library;
    this.characters = options.characters;
    this.bindings = options.bindings;
    this.zipConstructor = options.zipConstructor ?? loadAdmZipConstructor();
    this.now = options.now ?? (() => new Date());
  }

  async exportEntity(
    request: NkEntityExportRequest,
  ): Promise<CharacterAssetExportResult & { readonly entity: NkEntityArtifact }> {
    const build = await this.buildNkEntity(request);
    assertNoRemovedNativePuppetBinding(build.entity.bindings, build.assetEntitiesById);
    const outputPath = path.resolve(request.outputPath);
    await this.fs.createDirectory(path.dirname(outputPath));
    await this.fs.writeFile(
      outputPath,
      Buffer.from(`${JSON.stringify(build.entity, null, 2)}\n`, 'utf-8'),
    );

    return {
      format: 'nkentity',
      outputPath,
      entity: build.entity,
      files: [{ path: outputPath, role: 'entity' }],
      ...(build.diagnostics.length > 0 ? { diagnostics: build.diagnostics } : {}),
    };
  }

  async exportCharacterPack(
    request: CharacterPackExportRequest,
  ): Promise<CharacterPackExportResult> {
    const outputPath = path.resolve(request.outputPath);
    const build = await this.buildNkEntity(request);
    assertNoRemovedNativePuppetBinding(build.entity.bindings, build.assetEntitiesById);
    const zip = new this.zipConstructor();
    const diagnostics = [...build.diagnostics];
    const packagedBindings: NkEntityBinding[] = [];
    const packagedFiles: string[] = [];

    for (const binding of build.entity.bindings) {
      if (!isMediaKind(binding.mediaKind)) {
        diagnostics.push(`Skipped unsupported bundle media kind: ${binding.mediaKind}`);
        packagedBindings.push(binding);
        continue;
      }

      const assetEntity = build.assetEntitiesById.get(binding.assetEntityId ?? '');
      if (!assetEntity) {
        diagnostics.push(`Skipped unpackaged binding without project asset entity: ${binding.ref}`);
        packagedBindings.push(binding);
        continue;
      }

      const packageRoot = `assets/${slugify(assetEntity.id)}`;
      const assetManifest = createAssetManifestForBinding({
        assetEntity,
        binding,
        outputPath: `${packageRoot}/manifest.json`,
        exportedAt: build.exportedAt,
      });
      zip.addFile(
        `${packageRoot}/manifest.json`,
        Buffer.from(JSON.stringify(assetManifest, null, 2), 'utf-8'),
      );
      packagedFiles.push(`${packageRoot}/manifest.json`);

      const copiedFiles = await this.copyAssetFiles(zip, packageRoot, assetEntity, diagnostics);
      packagedFiles.push(...copiedFiles);
      packagedBindings.push({
        ...binding,
        ref: `./${packageRoot}/manifest.json`,
      });
    }

    const entityArtifact: NkEntityArtifact = { ...build.entity, bindings: packagedBindings };
    const manifest = createCharacterPackManifest({
      request,
      entity: entityArtifact,
      outputPath,
      exportedAt: build.exportedAt,
    });

    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
    zip.addFile(
      'entity.nkentity',
      Buffer.from(`${JSON.stringify(entityArtifact, null, 2)}\n`, 'utf-8'),
    );
    await this.fs.createDirectory(path.dirname(outputPath));
    await this.fs.writeFile(outputPath, zip.toBuffer());

    return {
      format: 'character-pack',
      outputPath,
      manifest,
      entity: entityArtifact,
      bundleType: 'character-pack',
      files: [
        { path: 'manifest.json', role: 'manifest', mediaKind: 'character-pack' },
        { path: 'entity.nkentity', role: 'entity', mediaKind: 'character-pack' },
        ...packagedFiles.map((filePath) => ({ path: filePath, role: 'asset' as const })),
      ],
      ...(diagnostics.length > 0 ? { diagnostics } : {}),
    };
  }

  private async buildNkEntity(request: NkEntityExportRequest): Promise<{
    readonly entity: NkEntityArtifact;
    readonly assetEntitiesById: ReadonlyMap<string, AssetEntity>;
    readonly diagnostics: readonly string[];
    readonly exportedAt: string;
  }> {
    const exportedAt = this.now().toISOString();
    const [characters, bindings, assetEntities] = await Promise.all([
      this.characters.list(),
      this.bindings.list(),
      this.library.getAllEntities(),
    ]);
    const character = resolveCharacter(characters, request);
    if (!character) {
      throw new Error('Character entity was not found for export.');
    }

    const assetEntitiesById = new Map(assetEntities.map((entity) => [entity.id, entity]));
    const diagnostics: string[] = [];
    const exportedBindings = bindings
      .filter((binding) => binding.entityId === character.id && binding.status !== 'rejected')
      .map((binding) => toNkEntityBinding(binding, assetEntitiesById, diagnostics))
      .filter((binding): binding is NkEntityBinding => binding !== undefined)
      .sort(compareNkEntityBindings);

    const entity: NkEntityArtifact = {
      format: 'nkentity',
      version: 1,
      entity: {
        id: character.id,
        kind: 'character',
        name: request.name ?? character.displayName ?? character.canonicalName,
        canonicalName: character.canonicalName,
        aliases: character.aliases,
        status: character.status,
        metadata: character.metadata,
      },
      bindings: exportedBindings,
      exportedAt,
    };

    return { entity, assetEntitiesById, diagnostics, exportedAt };
  }

  private async copyAssetFiles(
    zip: ZipLike,
    packageRoot: string,
    assetEntity: AssetEntity,
    diagnostics: string[],
  ): Promise<readonly string[]> {
    const copied: string[] = [];
    for (const file of assetEntity.variants.flatMap((variant) => variant.files)) {
      const sourcePath = this.library.resolvePath(file.path);
      if (this.fs.exists && !(await this.fs.exists(sourcePath))) {
        diagnostics.push(`Skipped missing asset file: ${sourcePath}`);
        continue;
      }

      try {
        const bytes = await this.fs.readFile(sourcePath);
        const entryPath = uniqueAssetEntryPath(packageRoot, file, copied);
        zip.addFile(entryPath, Buffer.from(bytes));
        copied.push(entryPath);
      } catch (error) {
        diagnostics.push(
          `Skipped unreadable asset file: ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return copied;
  }
}

function resolveCharacter(
  characters: readonly CharacterRecord[],
  request: NkEntityExportRequest,
): CharacterRecord | undefined {
  if (request.entityId) {
    const byId = characters.find((character) => character.id === request.entityId);
    if (byId) return byId;
  }

  const name = request.characterName ?? request.name;
  if (!name) return undefined;
  const lookup = normalizeCharacterLookupKey(name);
  return characters.find((character) => collectCharacterLookupKeys(character).includes(lookup));
}

function toNkEntityBinding(
  binding: EntityAssetBinding,
  assetEntitiesById: ReadonlyMap<string, AssetEntity>,
  diagnostics: string[],
): NkEntityBinding | undefined {
  const assetEntityId = parseProjectAssetEntityId(binding.assetRef);
  const metadata = assetEntityId
    ? chooseCharacterAssetMetadata(assetEntitiesById.get(assetEntityId), binding.role)
    : undefined;
  const fallback = fallbackBindingKind(binding.role);
  const mediaKind = metadata?.mediaKind ?? fallback?.mediaKind;
  const dimension = metadata?.assetDimension ?? fallback?.dimension;
  if (!mediaKind || !dimension) {
    diagnostics.push(`Skipped binding without character asset dimension: ${binding.id}`);
    return undefined;
  }

  return {
    role: binding.role,
    ref: binding.assetRef,
    mediaKind,
    dimension,
    bindingId: binding.id,
    ...(assetEntityId ? { assetEntityId } : {}),
    optional: binding.isDefault === true ? false : true,
    metadata: createBindingMetadata(binding),
  };
}

function chooseCharacterAssetMetadata(
  assetEntity: AssetEntity | undefined,
  role: EntityAssetBindingRole,
): NonNullable<AssetFile['characterAsset']> | undefined {
  const candidates =
    assetEntity?.variants.flatMap((variant) =>
      variant.files
        .map((file) => file.characterAsset)
        .filter((metadata): metadata is NonNullable<typeof metadata> => metadata !== undefined),
    ) ?? [];
  const preferred = candidates.find((metadata) => roleMatchesMediaKind(role, metadata.mediaKind));
  return preferred ?? candidates[0];
}

function roleMatchesMediaKind(
  role: EntityAssetBindingRole,
  mediaKind: CharacterAssetMediaKind | undefined,
): boolean {
  if (!mediaKind) return false;
  switch (role) {
    case 'puppet-bone':
      return mediaKind === 'live2d-model';
    case 'live2d':
      return mediaKind === 'live2d-model';
    case 'live3d':
      return mediaKind === 'model-3d';
    case 'motion':
      return mediaKind === 'live2d-motion' || mediaKind === 'model-motion';
    case 'voice':
      return mediaKind === 'voice-pack';
    case 'style':
      return mediaKind === 'live2d-config' || mediaKind === 'model-config';
    case 'portrait':
    case 'reference':
      return false;
  }
}

function fallbackBindingKind(
  role: EntityAssetBindingRole,
):
  | { readonly mediaKind: CharacterAssetMediaKind; readonly dimension: CharacterAssetDimension }
  | undefined {
  switch (role) {
    case 'puppet-bone':
      return { mediaKind: 'live2d-model', dimension: 'model' };
    case 'live2d':
      return { mediaKind: 'live2d-model', dimension: 'model' };
    case 'live3d':
      return { mediaKind: 'model-3d', dimension: 'model' };
    case 'motion':
      return { mediaKind: 'live2d-motion', dimension: 'motion' };
    case 'voice':
      return { mediaKind: 'voice-pack', dimension: 'audio' };
    case 'style':
      return { mediaKind: 'live2d-config', dimension: 'config' };
    case 'portrait':
    case 'reference':
      return undefined;
  }
}

function createBindingMetadata(binding: EntityAssetBinding): Record<string, unknown> {
  return {
    source: binding.source,
    status: binding.status,
    confidence: binding.confidence,
  };
}

function assertNoRemovedNativePuppetBinding(
  bindings: readonly NkEntityBinding[],
  assetEntitiesById: ReadonlyMap<string, AssetEntity>,
): void {
  const nativeBinding = bindings.find(
    (binding) =>
      binding.role === 'puppet-bone' ||
      binding.ref.toLowerCase().endsWith('.nkp') ||
      assetEntitiesById
        .get(binding.assetEntityId ?? '')
        ?.variants.some((variant) =>
          variant.files.some((file) => file.path.toLowerCase().endsWith('.nkp')),
        ),
  );
  if (!nativeBinding) return;
  throw new Error(
    `Native .nkp puppet export is not supported by the retained product set: ${nativeBinding.ref}`,
  );
}

function createAssetManifestForBinding(input: {
  readonly assetEntity: AssetEntity;
  readonly binding: NkEntityBinding;
  readonly outputPath: string;
  readonly exportedAt: string;
}): AssetManifest {
  return {
    id: `local/${slugify(input.assetEntity.id)}`,
    name: input.assetEntity.name,
    version: '1.0.0',
    type: 'media',
    source: { kind: 'local', path: input.outputPath },
    distributionKind: 'archive',
    typeMetadata: {
      type: 'media',
      data: {
        mediaKind: toManifestMediaKind(input.binding.mediaKind),
        fileSize: input.assetEntity.variants.reduce((total, variant) => {
          const variantSize = variant.files.reduce(
            (variantTotal, file) => variantTotal + file.metadata.fileSize,
            0,
          );
          return total + variantSize;
        }, 0),
      },
    },
    distribution: {
      license: 'UNSPECIFIED',
      author: 'local',
      tags: ['character', input.binding.mediaKind, input.binding.dimension],
      checksum: 'local-export',
    },
    createdAt: Date.parse(input.exportedAt),
    updatedAt: Date.parse(input.exportedAt),
  };
}

function createCharacterPackManifest(input: {
  readonly request: CharacterPackExportRequest;
  readonly entity: NkEntityArtifact;
  readonly outputPath: string;
  readonly exportedAt: string;
}): AssetManifest {
  const bundleName = input.request.name ?? `${input.entity.entity.name} Character Pack`;
  return {
    id: input.request.bundleId ?? `local/${slugify(bundleName)}-character-pack`,
    name: bundleName,
    version: input.request.version ?? '1.0.0',
    type: 'bundle',
    source: { kind: 'local', path: input.outputPath },
    distributionKind: 'orchestration',
    typeMetadata: {
      type: 'bundle',
      data: {
        installPolicy: 'all',
        bundleType: 'character-pack',
      },
    },
    contents: input.entity.bindings.map((binding) => ({
      packageId: binding.assetEntityId
        ? `local/${slugify(binding.assetEntityId)}`
        : `local/${slugify(binding.ref)}`,
      version: '1.0.0',
      role: binding.role,
      optional: binding.optional,
    })),
    distribution: {
      license: 'UNSPECIFIED',
      author: 'local',
      tags: ['character-pack', input.entity.entity.kind],
      checksum: 'local-export',
    },
    createdAt: Date.parse(input.exportedAt),
    updatedAt: Date.parse(input.exportedAt),
  };
}

function toManifestMediaKind(mediaKind: CharacterAssetMediaKind): MediaKind {
  if (!isMediaKind(mediaKind)) {
    throw new Error(`Unsupported media kind for media manifest: ${mediaKind}`);
  }
  return mediaKind;
}

function uniqueAssetEntryPath(
  packageRoot: string,
  file: AssetFile,
  existing: readonly string[],
): string {
  const parsed = path.parse(file.path);
  const baseName = parsed.base || file.name || file.id;
  const candidate = `${packageRoot}/files/${baseName}`;
  if (!existing.includes(candidate)) return candidate;
  return `${packageRoot}/files/${parsed.name || file.id}-${file.id}${parsed.ext}`;
}

function compareNkEntityBindings(left: NkEntityBinding, right: NkEntityBinding): number {
  return (
    left.dimension.localeCompare(right.dimension) ||
    left.mediaKind.localeCompare(right.mediaKind) ||
    left.role.localeCompare(right.role) ||
    left.ref.localeCompare(right.ref)
  );
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'character-asset'
  );
}

function loadAdmZipConstructor(): ZipConstructor {
  const loaded = require('adm-zip') as unknown;
  if (typeof loaded !== 'function') {
    throw new Error('adm-zip module did not provide a constructor.');
  }
  return loaded as ZipConstructor;
}
