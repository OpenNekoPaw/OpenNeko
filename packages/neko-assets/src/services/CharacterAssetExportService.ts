import * as path from 'node:path';
import type {
  AssetEntity,
  AssetFile,
  AssetManifest,
  CharacterAssetDimension,
  CharacterAssetExportResult,
  CharacterAssetMediaKind,
  CharacterSingleAssetExportRequest,
  CharacterPackExportRequest,
  CharacterPackExportResult,
  CharacterRecord,
  EntityAssetBinding,
  EntityAssetBindingRole,
  MediaKind,
  NkpBone2D,
  NkpLayer,
  NkpNativeProjectData,
  NkpVec2,
  NkEntityArtifact,
  NkEntityBinding,
  NkEntityNativePuppetMetadata,
  NkEntityExportRequest,
  NativePuppetExportPlan,
} from '@neko/shared';
import {
  collectCharacterLookupKeys,
  isMediaKind,
  isNkpNativeProjectData,
  normalizeCharacterLookupKey,
} from '@neko/shared';
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

    const entityArtifact: NkEntityArtifact = {
      ...build.entity,
      bindings: packagedBindings,
      metadata: rebasePackagedEntityMetadata(build.entity, packagedBindings),
    };
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

  async exportNativePuppetProject(
    request: CharacterSingleAssetExportRequest,
  ): Promise<CharacterAssetExportResult> {
    const sourcePath = path.resolve(request.sourcePath);
    const outputPath = path.resolve(request.outputPath);
    const parsed = await this.readNativePuppetProject(sourcePath);

    const artifact = {
      ...parsed,
      name: request.name ?? parsed.name,
      version: parsed.version.startsWith('2.') ? parsed.version : '2.0',
      puppet: {
        ...parsed.puppet,
        format: 'native' as const,
        animationModel: 'bone-blendshape' as const,
      },
    };

    await this.fs.createDirectory(path.dirname(outputPath));
    await this.fs.writeFile(
      outputPath,
      Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`, 'utf-8'),
    );

    return {
      format: 'nkp',
      outputPath,
      files: [{ path: outputPath, role: 'model', mediaKind: 'puppet-model', dimension: 'model' }],
      diagnostics:
        sourcePath === outputPath
          ? [
              'Native puppet export rewrote the requested output path; original import sources were not mutated.',
            ]
          : ['Native puppet export copied .nkp v2 data without mutating original import sources.'],
    };
  }

  async exportNativePuppetSpineJson(
    request: CharacterSingleAssetExportRequest,
  ): Promise<CharacterAssetExportResult> {
    const sourcePath = path.resolve(request.sourcePath);
    const outputPath = path.resolve(request.outputPath);
    const project = await this.readNativePuppetProject(sourcePath);
    const spineJson = buildSpineJson(project, request.name ?? project.name);

    await this.fs.createDirectory(path.dirname(outputPath));
    await this.fs.writeFile(
      outputPath,
      Buffer.from(`${JSON.stringify(spineJson, null, 2)}\n`, 'utf-8'),
    );

    return {
      format: 'spine-json',
      outputPath,
      files: [
        { path: outputPath, role: 'spine-json', mediaKind: 'puppet-model', dimension: 'model' },
      ],
      diagnostics: [
        'Spine JSON export used native skeleton, mesh, skin weight, and animation data without mutating source assets.',
      ],
    };
  }

  async exportNativePuppetSpritesheetPlan(
    request: CharacterSingleAssetExportRequest & {
      readonly frameRate?: number;
      readonly frameSize?: readonly [number, number];
    },
  ): Promise<CharacterAssetExportResult> {
    const sourcePath = path.resolve(request.sourcePath);
    const outputPath = path.resolve(request.outputPath);
    const project = await this.readNativePuppetProject(sourcePath);
    const plan = buildSpritesheetBakePlan({
      project,
      sourcePath,
      outputPath,
      name: request.name ?? project.name,
      frameRate: request.frameRate ?? 30,
      frameSize: request.frameSize ?? [1024, 1024],
    });

    await this.fs.createDirectory(path.dirname(outputPath));
    await this.fs.writeFile(outputPath, Buffer.from(`${JSON.stringify(plan, null, 2)}\n`, 'utf-8'));

    return {
      format: 'spritesheet',
      outputPath,
      files: [
        { path: outputPath, role: 'spritesheet', mediaKind: 'puppet-motion', dimension: 'motion' },
      ],
      diagnostics: [
        'Spritesheet export wrote a non-mutating engine bake plan for native puppet clips.',
      ],
    };
  }

  async exportNativePuppetLottiePlan(
    request: CharacterSingleAssetExportRequest,
  ): Promise<CharacterAssetExportResult> {
    const sourcePath = path.resolve(request.sourcePath);
    const outputPath = path.resolve(request.outputPath);
    const project = await this.readNativePuppetProject(sourcePath);
    const plan = buildLottieCompatibilityPlan({
      project,
      sourcePath,
      outputPath,
      name: request.name ?? project.name,
    });

    await this.fs.createDirectory(path.dirname(outputPath));
    await this.fs.writeFile(outputPath, Buffer.from(`${JSON.stringify(plan, null, 2)}\n`, 'utf-8'));

    return {
      format: 'lottie-plan',
      outputPath,
      files: [{ path: outputPath, role: 'diagnostic' }],
      diagnostics: [
        'Lottie-compatible export plan records unsupported native skinned mesh features and alternate export targets.',
      ],
    };
  }

  planNativePuppetSpineExport(input: {
    readonly sourcePath: string;
    readonly outputPath: string;
  }): NativePuppetExportPlan {
    const outputPath = path.resolve(input.outputPath);
    return {
      target: 'spine-json',
      outputPath,
      mutatesSource: false,
      files: [
        { path: outputPath, role: 'spine-json', mediaKind: 'puppet-model', dimension: 'model' },
      ],
      diagnostics: [
        {
          code: 'spine-native-data-required',
          severity: 'info',
          message:
            'Spine JSON export is planned from native skeleton, mesh, skin weights, and animations; source assets are not mutated.',
        },
      ],
    };
  }

  planNativePuppetSpritesheetExport(input: {
    readonly sourcePath: string;
    readonly outputPath: string;
  }): NativePuppetExportPlan {
    const outputPath = path.resolve(input.outputPath);
    return {
      target: 'spritesheet',
      outputPath,
      mutatesSource: false,
      files: [
        { path: outputPath, role: 'spritesheet', mediaKind: 'puppet-motion', dimension: 'motion' },
      ],
      diagnostics: [
        {
          code: 'spritesheet-bake-plan',
          severity: 'info',
          message:
            'Spritesheet export bakes native puppet animation frames for runtimes that cannot consume skeleton or BlendShape data; source assets are not mutated.',
        },
      ],
    };
  }

  planNativePuppetLottieExport(input: {
    readonly sourcePath: string;
    readonly outputPath: string;
  }): NativePuppetExportPlan {
    const outputPath = path.resolve(input.outputPath);
    return {
      target: 'lottie',
      outputPath,
      mutatesSource: false,
      files: [{ path: outputPath, role: 'diagnostic' }],
      diagnostics: [
        {
          code: 'lottie-native-skinning-unsupported',
          severity: 'unsupported',
          message:
            'Lottie-compatible export is not directly supported for native skinned meshes yet; use spritesheet export or Spine JSON when target runtime supports it.',
        },
      ],
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

    const nativePuppetMetadata = collectNativePuppetMetadata(exportedBindings);
    const entity: NkEntityArtifact = {
      format: 'nkentity',
      version: nativePuppetMetadata ? 2 : 1,
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
      ...(nativePuppetMetadata ? { metadata: { nativePuppet: nativePuppetMetadata } } : {}),
    };

    return { entity, assetEntitiesById, diagnostics, exportedAt };
  }

  private async readNativePuppetProject(sourcePath: string): Promise<NkpNativeProjectData> {
    const sourceBytes = await this.fs.readFile(sourcePath);
    const parsed = parseJson(sourceBytes, sourcePath);
    if (!isNkpNativeProjectData(parsed)) {
      throw new Error('Source file is not a native .nkp v2 puppet project.');
    }
    return parsed;
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
    metadata: createBindingMetadata(binding, metadata),
  };
}

function chooseCharacterAssetMetadata(
  assetEntity: AssetEntity | undefined,
  role: EntityAssetBindingRole,
):
  | {
      readonly mediaKind?: CharacterAssetMediaKind;
      readonly assetDimension?: CharacterAssetDimension;
      readonly rigTemplate?: string;
      readonly blendshapeStandard?: string;
      readonly implementedBlendShapes?: readonly string[];
      readonly animationModel?: 'bone-blendshape' | 'moc3-parameter';
      readonly sourceKind?: string;
    }
  | undefined {
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
      return mediaKind === 'puppet-model';
    case 'live2d':
      return mediaKind === 'puppet-model';
    case 'live3d':
      return mediaKind === 'model-3d';
    case 'motion':
      return mediaKind === 'puppet-motion' || mediaKind === 'model-motion';
    case 'voice':
      return mediaKind === 'voice-pack';
    case 'style':
      return mediaKind === 'puppet-config' || mediaKind === 'model-config';
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
      return { mediaKind: 'puppet-model', dimension: 'model' };
    case 'live2d':
      return { mediaKind: 'puppet-model', dimension: 'model' };
    case 'live3d':
      return { mediaKind: 'model-3d', dimension: 'model' };
    case 'motion':
      return { mediaKind: 'puppet-motion', dimension: 'motion' };
    case 'voice':
      return { mediaKind: 'voice-pack', dimension: 'audio' };
    case 'style':
      return { mediaKind: 'puppet-config', dimension: 'config' };
    case 'portrait':
    case 'reference':
      return undefined;
  }
}

function createBindingMetadata(
  binding: EntityAssetBinding,
  metadata:
    | {
        readonly rigTemplate?: string;
        readonly blendshapeStandard?: string;
        readonly implementedBlendShapes?: readonly string[];
        readonly animationModel?: 'bone-blendshape' | 'moc3-parameter';
        readonly sourceKind?: string;
      }
    | undefined,
): Record<string, unknown> {
  return {
    source: binding.source,
    status: binding.status,
    confidence: binding.confidence,
    ...(metadata?.rigTemplate ? { rigTemplate: metadata.rigTemplate } : {}),
    ...(metadata?.blendshapeStandard ? { blendshapeStandard: metadata.blendshapeStandard } : {}),
    ...(metadata?.implementedBlendShapes
      ? { implementedBlendShapes: metadata.implementedBlendShapes }
      : {}),
    ...(metadata?.animationModel ? { animationModel: metadata.animationModel } : {}),
    ...(metadata?.sourceKind ? { sourceKind: metadata.sourceKind } : {}),
  };
}

function collectNativePuppetMetadata(
  bindings: readonly NkEntityBinding[],
): NkEntityNativePuppetMetadata | undefined {
  const nativeBinding = bindings.find((binding) => binding.role === 'puppet-bone');
  if (!nativeBinding) return undefined;

  const metadata = nativeBinding.metadata ?? {};
  const rigTemplate = readString(metadata, 'rigTemplate');
  const blendshapeStandard = readString(metadata, 'blendshapeStandard');
  const implementedBlendShapes = readStringArray(metadata, 'implementedBlendShapes');
  const sourceKind = readString(metadata, 'sourceKind');
  return {
    ...(rigTemplate ? { rigTemplate } : {}),
    ...(blendshapeStandard ? { blendshapeStandard } : {}),
    ...(implementedBlendShapes ? { implementedBlendShapes } : {}),
    animationModel:
      readAnimationModel(metadata, 'animationModel') ??
      (nativeBinding.mediaKind === 'puppet-model' ? 'bone-blendshape' : undefined),
    ...(sourceKind ? { sourceKind } : {}),
  };
}

function parseJson(bytes: Uint8Array, sourcePath: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf-8')) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to parse native puppet project JSON from ${sourcePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function readString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readStringArray(
  metadata: Record<string, unknown>,
  key: string,
): readonly string[] | undefined {
  const value = metadata[key];
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

function readAnimationModel(
  metadata: Record<string, unknown>,
  key: string,
): NkEntityNativePuppetMetadata['animationModel'] | undefined {
  const value = metadata[key];
  return value === 'bone-blendshape' || value === 'moc3-parameter' ? value : undefined;
}

function rebasePackagedEntityMetadata(
  entity: NkEntityArtifact,
  packagedBindings: readonly NkEntityBinding[],
): NkEntityArtifact['metadata'] {
  const nativePuppet = collectNativePuppetMetadata(packagedBindings);
  return nativePuppet ? { ...entity.metadata, nativePuppet } : entity.metadata;
}

function buildSpineJson(project: NkpNativeProjectData, name: string): Record<string, unknown> {
  return {
    skeleton: {
      spine: '4.1',
      hash: `neko-native:${project.version}`,
      name,
      images: './textures/',
    },
    bones: project.skeleton.bones.map((bone) => ({
      name: bone.id,
      ...(bone.parent ? { parent: bone.parent } : {}),
      x: bone.position[0],
      y: bone.position[1],
      ...(bone.rotation !== undefined ? { rotation: bone.rotation } : {}),
      ...(bone.scale ? { scaleX: bone.scale[0], scaleY: bone.scale[1] } : {}),
      ...(bone.length !== undefined ? { length: bone.length } : {}),
    })),
    slots: project.layers.map((layer) => ({
      name: layer.id,
      bone: primaryBoneForLayer(layer, project.skeleton.bones),
      attachment: layer.id,
      ...(layer.blendMode ? { blend: layer.blendMode } : {}),
    })),
    skins: [
      {
        name: 'default',
        attachments: Object.fromEntries(
          project.layers.map((layer) => [
            layer.id,
            {
              [layer.id]: buildSpineMeshAttachment(layer),
            },
          ]),
        ),
      },
    ],
    animations: Object.fromEntries(
      project.animations.map((clip) => [
        clip.name,
        {
          bones: Object.fromEntries(
            (clip.boneTracks ?? []).map((track) => [
              track.bone,
              {
                ...(track.positionKeys
                  ? {
                      translate: track.positionKeys.map((key) =>
                        keyframeVec2(key.timeMs, key.value),
                      ),
                    }
                  : {}),
                ...(track.rotationKeys
                  ? {
                      rotate: track.rotationKeys.map((key) => ({
                        time: key.timeMs / 1000,
                        angle: key.value,
                      })),
                    }
                  : {}),
                ...(track.scaleKeys
                  ? { scale: track.scaleKeys.map((key) => keyframeVec2(key.timeMs, key.value)) }
                  : {}),
              },
            ]),
          ),
          deform: buildSpineDeformTimeline(project, clip.name),
        },
      ]),
    ),
    neko: {
      source: 'nkp-v2-native',
      animationModel: project.puppet.animationModel,
      blendShapes: project.blendShapes.implemented,
      importSource: project.puppet.importSource,
    },
  };
}

function buildSpritesheetBakePlan(input: {
  readonly project: NkpNativeProjectData;
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly name: string;
  readonly frameRate: number;
  readonly frameSize: readonly [number, number];
}): Record<string, unknown> {
  return {
    format: 'neko-native-puppet-spritesheet-plan',
    version: 1,
    name: input.name,
    source: {
      path: input.sourcePath,
      animationModel: input.project.puppet.animationModel,
      importSource: input.project.puppet.importSource,
    },
    target: {
      atlasJson: input.outputPath,
      imagePattern: `${stripExtension(input.outputPath)}-{clip}-{frame}.png`,
      frameRate: input.frameRate,
      frameSize: input.frameSize,
    },
    clips: input.project.animations.map((clip) => ({
      name: clip.name,
      durationMs: clip.durationMs,
      frameCount: Math.max(1, Math.ceil((clip.durationMs / 1000) * input.frameRate)),
      usesBoneTracks: (clip.boneTracks?.length ?? 0) > 0,
      usesBlendShapeTracks: (clip.blendshapeTracks?.length ?? 0) > 0,
    })),
    requiredEnginePipeline: 'native-puppet-control-driver-blendshape-skinning',
    mutatesSource: false,
  };
}

function buildLottieCompatibilityPlan(input: {
  readonly project: NkpNativeProjectData;
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly name: string;
}): Record<string, unknown> {
  const unsupportedFeatures = [
    ...(input.project.layers.some((layer) => layer.skinWeights) ? ['skinned-mesh'] : []),
    ...((input.project.blendShapes.shapes?.length ?? 0) > 0 ? ['vertex-blendshape'] : []),
    ...(input.project.skeleton.springBones && input.project.skeleton.springBones.length > 0
      ? ['spring-bone']
      : []),
  ];
  return {
    format: 'neko-native-puppet-lottie-plan',
    version: 1,
    name: input.name,
    sourcePath: input.sourcePath,
    requestedOutputPath: input.outputPath,
    mutatesSource: false,
    status: unsupportedFeatures.length > 0 ? 'unsupported' : 'planned',
    unsupportedFeatures,
    fallbackTargets: ['spritesheet', 'spine-json'],
  };
}

function stripExtension(filePath: string): string {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, parsed.name);
}

function primaryBoneForLayer(layer: NkpLayer, bones: readonly NkpBone2D[]): string {
  const fallbackBone = bones[0]?.id ?? 'root';
  const weights = layer.skinWeights;
  if (!weights || weights.jointWeights.length === 0) return fallbackBone;
  let bestIndex = 0;
  let bestWeight = -1;
  weights.jointWeights.forEach((jointWeights, vertexIndex) => {
    jointWeights.forEach((weight, slotIndex) => {
      if (weight > bestWeight) {
        bestWeight = weight;
        bestIndex = weights.jointIndices[vertexIndex]?.[slotIndex] ?? 0;
      }
    });
  });
  return bones[bestIndex]?.id ?? fallbackBone;
}

function buildSpineMeshAttachment(layer: NkpLayer): Record<string, unknown> {
  return {
    type: 'mesh',
    path: layer.textureRef,
    vertices: buildSpineVertices(layer),
    uvs: layer.mesh.uvs?.flatMap(([u, v]) => [u, v]) ?? [],
    triangles: layer.mesh.triangles?.flatMap(([a, b, c]) => [a, b, c]) ?? [],
    edges: [],
    nekoSkinWeights: layer.skinWeights,
  };
}

function buildSpineVertices(layer: NkpLayer): number[] {
  if (!layer.skinWeights) {
    return layer.mesh.vertices.flatMap(([x, y]) => [x, y]);
  }

  return layer.mesh.vertices.flatMap(([x, y], vertexIndex) => {
    const jointIndices = layer.skinWeights?.jointIndices[vertexIndex];
    const jointWeights = layer.skinWeights?.jointWeights[vertexIndex];
    if (!jointIndices || !jointWeights) return [x, y];

    const influences = jointWeights
      .map((weight, slotIndex) => ({ jointIndex: jointIndices[slotIndex] ?? 0, weight }))
      .filter((influence) => influence.weight > 0);
    return [
      influences.length,
      ...influences.flatMap((influence) => [influence.jointIndex, x, y, influence.weight]),
    ];
  });
}

function keyframeVec2(timeMs: number, value: NkpVec2): Record<string, number> {
  return { time: timeMs / 1000, x: value[0], y: value[1] };
}

function buildSpineDeformTimeline(
  project: NkpNativeProjectData,
  clipName: string,
): Record<string, unknown> {
  const clip = project.animations.find((animation) => animation.name === clipName);
  const tracks = clip?.blendshapeTracks ?? [];
  if (tracks.length === 0) return {};

  return {
    default: Object.fromEntries(
      project.layers.map((layer) => [
        layer.id,
        Object.fromEntries(
          tracks.map((track) => [
            track.blendshape,
            track.weightKeys.map((key) => ({
              time: key.timeMs / 1000,
              vertices: buildBlendShapeVertices(
                project,
                layer.mesh.id,
                track.blendshape,
                key.value,
              ),
            })),
          ]),
        ),
      ]),
    ),
  };
}

function buildBlendShapeVertices(
  project: NkpNativeProjectData,
  meshId: string,
  blendshapeName: string,
  weight: number,
): number[] {
  const shape = [...(project.blendShapes.shapes ?? []), ...(project.blendShapes.custom ?? [])].find(
    (candidate) => candidate.meshId === meshId && candidate.name === blendshapeName,
  );
  return shape?.vertexDeltas.flatMap(([x, y]) => [x * weight, y * weight]) ?? [];
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
