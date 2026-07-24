import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildFountainScriptIndex } from '@neko/content';
import {
  detectMediaType,
  isDocumentFile,
  isMediaFile,
  normalizeWorkspaceContentPath,
  resolveStorageLayout,
  type MediaFileType,
  type EntityAssetProjectionRecord,
  type EntityAssetProjectionRepository,
  type GeneratedAsset,
  type ProjectIndexFreshness,
  type ProjectIndexPartitionStatus,
  type ProjectSearchAdapter,
  type ProjectSearchAdapterRefreshOptions,
  type ProjectSearchItem,
  type ProjectSearchPartitionKind,
  type ProjectSearchPartitionStatusSnapshot,
  type ProjectSearchQuery,
  type ProjectSearchQueryContext,
  type LocalMetadataPartition,
  type LocalMetadataPartitionRevision,
  type SearchDocumentRepository,
  type WorkspaceFileContentLocator,
} from '@neko/shared';
import { buildProjectSearchText, matchesProjectSearchItem } from '../core/normalization';
import type { ProjectSearchLogger } from '../core/ports';

const STORY_GLOB = '**/*.fountain';

export interface JsonReader {
  read<T>(filePath: string): Promise<T | null>;
}

export interface WorkspaceFileFinder {
  findFiles(include: string, exclude?: string): Promise<readonly vscode.Uri[]>;
}

interface MediaLibraryCacheQueryResult {
  readonly loaded: boolean;
  readonly items: readonly ProjectSearchItem[];
  readonly freshness?: ProjectIndexFreshness;
}

interface CreativeGraphData {
  readonly nodes?: readonly CreativeGraphNodeRecord[];
}

interface CreativeGraphNodeRecord {
  readonly id?: unknown;
  readonly kind?: unknown;
  readonly refId?: unknown;
  readonly label?: unknown;
}

interface CharacterRegistryData {
  readonly characters?: readonly CharacterRecord[];
}

interface CharacterRecord {
  readonly id?: unknown;
  readonly canonicalName?: unknown;
  readonly displayName?: unknown;
  readonly aliases?: unknown;
  readonly metadata?: unknown;
}

interface EntityAssetRequirementData {
  readonly requirements?: readonly EntityAssetRequirementRecord[];
}

interface EntityAssetRequirementRecord {
  readonly id?: unknown;
  readonly entityId?: unknown;
  readonly entityKind?: unknown;
  readonly source?: unknown;
  readonly sourceRef?: unknown;
  readonly requiredKinds?: unknown;
  readonly status?: unknown;
}

export interface CompatibilityProjectSearchAdaptersOptions {
  readonly jsonReader?: JsonReader;
  readonly workspaceFileFinder?: WorkspaceFileFinder;
  readonly resolveThumbnailUri?: (filePath: string) => string | undefined;
  readonly queryMediaLibrary?: (
    query: MediaLibraryRuntimeQuery,
  ) => Promise<readonly MediaLibraryRuntimeResult[]>;
  readonly queryGeneratedAssets?: () =>
    readonly GeneratedAsset[] | Promise<readonly GeneratedAsset[]>;
  readonly searchProjection?: {
    readonly repository: SearchDocumentRepository;
    readonly partition: LocalMetadataPartition;
    readonly hasProjection: () => Promise<boolean>;
  };
  readonly entityAssetProjection?: {
    readonly repository: EntityAssetProjectionRepository;
    readonly partition: LocalMetadataPartition;
    readonly readRevision: () => Promise<LocalMetadataPartitionRevision | null>;
  };
  readonly logger?: ProjectSearchLogger;
}

export interface MediaLibraryRuntimeQuery {
  readonly keyword: string;
  readonly limit?: number;
  readonly types?: readonly MediaFileType[];
  readonly projectRoot?: string;
}

export interface MediaLibraryRuntimeResult {
  readonly locator: WorkspaceFileContentLocator;
  readonly fileName?: string;
  readonly libraryName?: string;
  readonly mediaType?: MediaFileType;
}

export function createCompatibilityProjectSearchAdapters(
  options: CompatibilityProjectSearchAdaptersOptions = {},
): readonly ProjectSearchAdapter[] {
  const jsonReader = options.jsonReader ?? new VscodeJsonReader(options.logger);
  return [
    new StorySymbolProjectSearchAdapter(
      options.workspaceFileFinder ?? new VscodeWorkspaceFileFinder(),
    ),
    new MediaLibraryProjectSearchAdapter({
      queryMediaLibrary: options.queryMediaLibrary ?? queryMediaLibraryWithAssetsCommand,
      searchProjection: options.searchProjection,
      logger: options.logger,
    }),
    new CreativeEntityProjectSearchAdapter(jsonReader, options.entityAssetProjection),
    new GeneratedAssetProjectSearchAdapter({
      queryGeneratedAssets: options.queryGeneratedAssets,
      resolveThumbnailUri: options.resolveThumbnailUri,
    }),
  ];
}

abstract class BaseProjectSearchAdapter implements ProjectSearchAdapter {
  private readonly statusByProject = new Map<string, ProjectSearchPartitionStatusSnapshot>();

  protected constructor(readonly partition: ProjectSearchPartitionKind) {}

  async ensureInitialized(projectRoot: string): Promise<void> {
    await this.refresh({ projectRoot, reason: 'project-open' });
  }

  abstract query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]>;

  async refresh(options: ProjectSearchAdapterRefreshOptions): Promise<void> {
    this.setStatus(options.projectRoot, 'ready', 'fresh');
  }

  getStatus(projectRoot: string): ProjectSearchPartitionStatusSnapshot {
    return (
      this.statusByProject.get(projectRoot) ?? {
        partition: this.partition,
        status: 'idle',
        freshness: 'stale',
      }
    );
  }

  protected setStatus(
    projectRoot: string,
    status: ProjectIndexPartitionStatus,
    freshness: ProjectIndexFreshness,
    itemCount?: number,
    error?: string,
  ): void {
    this.statusByProject.set(projectRoot, {
      partition: this.partition,
      status,
      freshness,
      ...(itemCount !== undefined ? { itemCount } : {}),
      updatedAt: new Date().toISOString(),
      ...(error ? { error } : {}),
    });
  }
}

class StorySymbolProjectSearchAdapter extends BaseProjectSearchAdapter {
  private itemsByProject = new Map<string, readonly ProjectSearchItem[]>();

  constructor(private readonly workspaceFileFinder: WorkspaceFileFinder) {
    super('story-symbols');
  }

  override async refresh(options: ProjectSearchAdapterRefreshOptions): Promise<void> {
    const items = await this.buildItems(options.projectRoot);
    this.itemsByProject.set(options.projectRoot, items);
    this.setStatus(options.projectRoot, 'ready', 'fresh', items.length);
  }

  override async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    const projectRoot = context.projectRoot;
    if (!projectRoot) return [];
    if (!this.itemsByProject.has(projectRoot)) {
      await this.refresh({ projectRoot, reason: 'cache-load' });
    }
    return (this.itemsByProject.get(projectRoot) ?? []).filter((item) =>
      matchesProjectSearchItem(item, query),
    );
  }

  private async buildItems(projectRoot: string): Promise<readonly ProjectSearchItem[]> {
    const files = await this.workspaceFileFinder.findFiles(STORY_GLOB, '**/node_modules/**');
    const items: ProjectSearchItem[] = [];

    for (const uri of files) {
      const filePath = uri.fsPath;
      if (!isPathInside(filePath, projectRoot)) continue;

      const sourceText = await readWorkspaceText(filePath);
      if (sourceText) {
        const scriptIndex = buildFountainScriptIndex({ uri: filePath, content: sourceText });
        for (const character of scriptIndex.characters) {
          items.push(
            createStoryItem(projectRoot, filePath, 'script-role', character.name, {
              id: `script-role:${filePath}:${character.name}`,
              description: 'Script role',
              navigationData: {
                filePath,
                line: character.first_line,
                sceneIds: character.scene_ids.join(','),
              },
              searchText: buildProjectSearchText([
                character.name,
                filePath,
                character.scene_ids,
                'script role character',
              ]),
            }),
          );
        }

        for (const scene of scriptIndex.scenes) {
          items.push(
            createStoryItem(projectRoot, filePath, 'story-scene', scene.sceneTitle, {
              id: `story-scene:${filePath}:${scene.sceneId}`,
              description: scene.heading,
              navigationData: {
                filePath,
                sceneId: scene.sceneId,
                lineStart: scene.line_start,
                lineEnd: scene.line_end,
              },
              searchText: buildProjectSearchText([
                scene.sceneTitle,
                scene.heading,
                scene.location,
                scene.sceneCharacters,
                filePath,
                'story scene',
              ]),
            }),
          );
        }
      }
    }

    return dedupeById(items);
  }
}

class MediaLibraryProjectSearchAdapter extends BaseProjectSearchAdapter {
  constructor(
    private readonly options: {
      readonly queryMediaLibrary: (
        query: MediaLibraryRuntimeQuery,
      ) => Promise<readonly MediaLibraryRuntimeResult[]>;
      readonly searchProjection?: CompatibilityProjectSearchAdaptersOptions['searchProjection'];
      readonly logger?: ProjectSearchLogger;
    },
  ) {
    super('media-library');
  }

  override async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    const projectRoot = context.projectRoot;
    if (!projectRoot) return [];
    const fromProjection = await this.readMediaSearchProjection(projectRoot, query);
    if (fromProjection.loaded) {
      this.setStatus(
        projectRoot,
        'ready',
        fromProjection.freshness ?? 'fresh',
        fromProjection.items.length,
      );
      return fromProjection.items;
    }
    let fromRuntime: readonly ProjectSearchItem[];
    try {
      fromRuntime = await this.queryMediaLibraryRuntime(projectRoot, query);
    } catch (error) {
      this.options.logger?.warn('Media library runtime search failed', {
        projectRoot,
        error: formatUnknownError(error),
      });
      this.setStatus(projectRoot, 'failed', 'failed', 0, formatUnknownError(error));
      return [];
    }
    this.setStatus(
      projectRoot,
      'ready',
      fromRuntime.length > 0 ? 'fresh' : 'stale',
      fromRuntime.length,
    );
    return fromRuntime;
  }

  private async readMediaSearchProjection(
    projectRoot: string,
    query: ProjectSearchQuery,
  ): Promise<MediaLibraryCacheQueryResult> {
    const projection = this.options.searchProjection;
    if (!projection || !(await projection.hasProjection())) {
      return { loaded: false, items: [] };
    }
    const documents = await projection.repository.query({
      partition: projection.partition,
      text: query.text,
      limit: query.limit ?? 200,
    });
    const items: ProjectSearchItem[] = [];
    for (const document of documents) {
      if (document.partition !== 'media-library' || !document.fileKey) continue;
      const filePath = canonicalMediaLibraryPath(document.fileKey);
      if (!filePath) continue;
      const mediaType = readMediaFileType(document.metadata?.['mediaType']);
      const libraryName = optionalString(document.metadata?.['libraryName']);
      if (
        !matchesMediaLibraryRawItem(projectRoot, filePath, document.label, query, {
          libraryName,
          mediaType,
        })
      ) {
        continue;
      }
      const item = await this.createMediaItem(
        projectRoot,
        filePath,
        document.label,
        document.freshness,
        { libraryName, mediaType },
      );
      if (matchesProjectSearchItem(item, query)) items.push(item);
    }
    return {
      loaded: true,
      items,
      freshness: documents.every((document) => document.freshness === 'fresh') ? 'fresh' : 'stale',
    };
  }

  private async queryMediaLibraryRuntime(
    projectRoot: string,
    query: ProjectSearchQuery,
  ): Promise<readonly ProjectSearchItem[]> {
    const results = await this.options.queryMediaLibrary({
      keyword: query.text,
      limit: query.limit,
      types: queryMediaTypes(query),
      projectRoot,
    });
    const items: ProjectSearchItem[] = [];
    for (const result of results) {
      const filePath = canonicalMediaLibraryPath(result.locator.path);
      if (result.locator.kind !== 'workspace-file') continue;
      if (!filePath) continue;
      const fileName = optionalString(result.fileName) ?? path.basename(filePath);
      const mediaType = readMediaFileType(result.mediaType) ?? detectMediaTypeSafe(filePath);
      if (
        !matchesMediaLibraryRawItem(projectRoot, filePath, fileName, query, {
          libraryName: optionalString(result.libraryName),
          mediaType,
        })
      ) {
        continue;
      }
      const item = this.createMediaItem(projectRoot, filePath, fileName, 'fresh', {
        libraryName: optionalString(result.libraryName),
        mediaType,
      });
      if (matchesProjectSearchItem(item, query)) {
        items.push(item);
      }
    }
    return items;
  }

  private createMediaItem(
    projectRoot: string,
    filePath: string,
    fileName: string,
    freshness: ProjectIndexFreshness,
    input: { readonly libraryName?: string; readonly mediaType?: MediaFileType },
  ): ProjectSearchItem {
    return createMediaItem(projectRoot, {
      filePath,
      fileName,
      freshness,
      ...input,
    });
  }
}

class CreativeEntityProjectSearchAdapter extends BaseProjectSearchAdapter {
  constructor(
    private readonly jsonReader: JsonReader,
    private readonly projection:
      CompatibilityProjectSearchAdaptersOptions['entityAssetProjection'] | undefined,
  ) {
    super('creative-entities');
  }

  override async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    const projectRoot = context.projectRoot;
    if (!projectRoot) return [];
    const layout = resolveStorageLayout(projectRoot, os.homedir());
    const projection = await this.loadProjectionRecords();
    const [registry, requirements] = await Promise.all([
      this.jsonReader.read<CharacterRegistryData>(path.join(projectRoot, 'characters.json')),
      this.jsonReader.read<EntityAssetRequirementData>(
        layout.project.facts.entityAssetRequirements,
      ),
    ]);
    const items = [
      ...(projection ? this.projectionItems(projectRoot, projection.records) : []),
      ...this.registryItems(projectRoot, registry),
      ...this.requirementItems(projectRoot, requirements),
    ].filter((item) => matchesProjectSearchItem(item, query));
    this.setStatus(
      projectRoot,
      'ready',
      projection ? toProjectSearchFreshness(projection.revision.freshness) : 'fresh',
      items.length,
    );
    return dedupeById(items);
  }

  private async loadProjectionRecords(): Promise<{
    readonly records: readonly EntityAssetProjectionRecord[];
    readonly revision: LocalMetadataPartitionRevision;
  } | null> {
    if (!this.projection) return null;
    const revision = await this.projection.readRevision();
    if (!revision) return null;
    return {
      records: await this.projection.repository.list({ partition: this.projection.partition }),
      revision,
    };
  }

  private projectionItems(
    projectRoot: string,
    records: readonly EntityAssetProjectionRecord[],
  ): ProjectSearchItem[] {
    return records.flatMap((record) => {
      if (record.kind === 'asset-graph-node') {
        return this.graphItems(projectRoot, { nodes: [record.value] });
      }
      if (record.kind === 'entity-candidate') {
        const candidate = record.value;
        return [
          {
            id: `entity-projection:${record.projectionId}`,
            kind: 'entity-candidate',
            label: candidate.name,
            description: `${candidate.kind} candidate`,
            icon: iconForGraphKind(candidate.kind),
            source: {
              partition: 'creative-entities',
              sourceId: record.sourceId,
              sourceKind: 'candidate',
              refId: candidate.id,
            },
            projectRoot,
            canonicalName: candidate.name,
            aliases: candidate.aliases,
            searchText: buildProjectSearchText([
              candidate.name,
              candidate.aliases,
              candidate.kind,
              candidate.status,
              candidate.sourceRefs,
            ]),
            navigationData: {
              candidateId: candidate.id,
              kind: candidate.kind,
              source: record.sourceId,
            },
            freshness: record.freshness === 'rebuilding' ? 'building' : record.freshness,
            metadata: {
              entityType: candidate.kind,
              status: candidate.status,
              identityBasis: candidate.identityBasis,
            },
          } satisfies ProjectSearchItem,
        ];
      }
      return [];
    });
  }

  private graphItems(projectRoot: string, data: CreativeGraphData | null): ProjectSearchItem[] {
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    return nodes.flatMap((node) => {
      const id = optionalString(node.id);
      const label = optionalString(node.label);
      const kind = optionalString(node.kind);
      const refId = optionalString(node.refId);
      if (!id || !label || !kind) return [];
      return [
        {
          id: `entity-graph:${id}`,
          kind: kind === 'generated-asset' ? 'generated-asset' : 'creative-entity',
          label,
          description: `Entity: ${kind}`,
          icon: iconForGraphKind(kind),
          source: {
            partition: kind === 'generated-asset' ? 'generated-assets' : 'creative-entities',
            sourceId: id,
            sourceKind: kind,
            refId,
          },
          projectRoot,
          canonicalName: label,
          searchText: buildProjectSearchText([label, kind, refId]),
          navigationData: {
            nodeId: id,
            kind,
            ...(refId ? { refId } : {}),
          },
          freshness: 'fresh',
          metadata: { entityType: kind },
        } satisfies ProjectSearchItem,
      ];
    });
  }

  private registryItems(
    projectRoot: string,
    data: CharacterRegistryData | null,
  ): ProjectSearchItem[] {
    const characters = Array.isArray(data?.characters) ? data.characters : [];
    return characters.flatMap((character) => {
      const id = optionalString(character.id);
      const canonicalName = optionalString(character.canonicalName);
      if (!id || !canonicalName) return [];
      const displayName = optionalString(character.displayName);
      const aliases = readStringArray(character.aliases);
      return [
        {
          id: `creative-entity:${id}`,
          kind: 'creative-entity',
          label: displayName ?? canonicalName,
          description: 'Character',
          icon: '◇',
          source: {
            partition: 'creative-entities',
            sourceId: id,
            sourceKind: 'character',
          },
          projectRoot,
          canonicalName,
          aliases,
          searchText: buildProjectSearchText([canonicalName, displayName, aliases, 'character']),
          navigationData: { entityId: id, kind: 'character' },
          freshness: 'fresh',
          metadata: { entityType: 'character' },
        } satisfies ProjectSearchItem,
      ];
    });
  }

  private requirementItems(
    projectRoot: string,
    data: EntityAssetRequirementData | null,
  ): ProjectSearchItem[] {
    const requirements = Array.isArray(data?.requirements) ? data.requirements : [];
    return requirements.flatMap((requirement) => {
      const id = optionalString(requirement.id);
      const entityId = optionalString(requirement.entityId);
      const entityKind = optionalString(requirement.entityKind);
      if (!id || !entityId || !entityKind) return [];
      const requiredKinds = readStringArray(requirement.requiredKinds);
      return [
        {
          id: `entity-requirement:${id}`,
          kind: 'entity-candidate',
          label: entityId,
          description: `Missing ${requiredKinds.join(', ') || 'representation'}`,
          icon: '◇',
          source: {
            partition: 'creative-entities',
            sourceId: id,
            sourceKind: 'entity-asset-requirement',
            refId: entityId,
          },
          projectRoot,
          canonicalName: entityId,
          searchText: buildProjectSearchText([
            entityId,
            entityKind,
            requiredKinds,
            'missing representation',
          ]),
          navigationData: {
            requirementId: id,
            entityId,
            entityKind,
          },
          freshness: 'fresh',
          metadata: {
            entityType: entityKind,
            requiredKinds,
            status: optionalString(requirement.status),
            sourceRef: optionalString(requirement.sourceRef),
          },
        } satisfies ProjectSearchItem,
      ];
    });
  }
}

function toProjectSearchFreshness(
  freshness: LocalMetadataPartitionRevision['freshness'],
): ProjectIndexFreshness {
  return freshness === 'rebuilding' ? 'building' : freshness;
}

class GeneratedAssetProjectSearchAdapter extends BaseProjectSearchAdapter {
  constructor(
    private readonly options: {
      readonly queryGeneratedAssets?: CompatibilityProjectSearchAdaptersOptions['queryGeneratedAssets'];
      readonly resolveThumbnailUri?: (filePath: string) => string | undefined;
    },
  ) {
    super('generated-assets');
  }

  override async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    const projectRoot = context.projectRoot;
    if (!projectRoot) return [];
    if (!this.options.queryGeneratedAssets) {
      this.setStatus(projectRoot, 'stale', 'stale', 0, 'generated-assets-projection-unavailable');
      return [];
    }
    const assets = await this.options.queryGeneratedAssets();
    const items = assets
      .map((asset) => this.toItem(projectRoot, asset))
      .filter((item) => matchesProjectSearchItem(item, query))
      .slice(0, query.limit ?? 200);
    this.setStatus(projectRoot, 'ready', 'fresh', items.length);
    return items;
  }

  private toItem(projectRoot: string, asset: GeneratedAsset): ProjectSearchItem {
    const filePath = asset.path;
    const fileName = path.basename(filePath);
    const extension = path.extname(fileName);
    const stableRef = `generated-assets/${asset.id}${extension}`;
    const mediaType = generatedMediaFileType(asset.type, asset.mimeType, filePath);
    const thumbnailUri =
      mediaType === 'image' ? this.options.resolveThumbnailUri?.(filePath) : undefined;

    return {
      id: `generated-asset:${asset.id}`,
      kind: 'generated-asset',
      label: asset.prompt ? `${fileName} · ${asset.prompt}` : fileName,
      description: asset.model ? `Generated asset: ${asset.model}` : 'Generated asset',
      icon: iconForGraphKind('generated-asset'),
      source: {
        partition: 'generated-assets',
        sourceId: asset.id,
        sourceKind: asset.type,
        assetId: asset.id,
        refId: stableRef,
      },
      projectRoot,
      filePath,
      canonicalName: fileName,
      searchText: buildProjectSearchText([
        asset.id,
        fileName,
        asset.prompt,
        asset.model,
        asset.mimeType,
        asset.type,
      ]),
      navigationData: {
        assetId: asset.id,
        filePath,
        ref: stableRef,
        type: asset.type,
      },
      ...(thumbnailUri ? { thumbnailUri } : {}),
      freshness: 'fresh',
      metadata: {
        ...(mediaType ? { mediaType } : {}),
        fileType: extension.replace(/^\./, ''),
        generatedAt: asset.generatedAt,
        ...(asset.model ? { model: asset.model } : {}),
      },
    };
  }
}

class VscodeJsonReader implements JsonReader {
  constructor(private readonly logger?: ProjectSearchLogger) {}

  async read<T>(filePath: string): Promise<T | null> {
    let raw: Uint8Array;
    try {
      raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    } catch {
      return null;
    }

    try {
      return JSON.parse(new TextDecoder().decode(raw)) as T;
    } catch (error) {
      this.logger?.warn('Failed to parse project search compatibility JSON', {
        filePath,
        error: formatUnknownError(error),
      });
      return null;
    }
  }
}

class VscodeWorkspaceFileFinder implements WorkspaceFileFinder {
  async findFiles(include: string, exclude?: string): Promise<readonly vscode.Uri[]> {
    return vscode.workspace.findFiles(include, exclude);
  }
}

async function queryMediaLibraryWithAssetsCommand(
  query: MediaLibraryRuntimeQuery,
): Promise<readonly MediaLibraryRuntimeResult[]> {
  const results = await vscode.commands.executeCommand<unknown>(
    'neko.assets.queryMediaLibrary',
    query,
  );
  if (!Array.isArray(results)) return [];
  return results.filter(isMediaLibraryRuntimeResult);
}

function isMediaLibraryRuntimeResult(value: unknown): value is MediaLibraryRuntimeResult {
  if (!isRecord(value)) return false;
  const locator = value.locator;
  return (
    isRecord(locator) &&
    locator.kind === 'workspace-file' &&
    typeof locator.path === 'string' &&
    canonicalMediaLibraryPath(locator.path) === locator.path &&
    (value.fileName === undefined || typeof value.fileName === 'string') &&
    (value.libraryName === undefined || typeof value.libraryName === 'string') &&
    (value.mediaType === undefined || isMediaFileType(value.mediaType))
  );
}

function queryMediaTypes(query: ProjectSearchQuery): readonly MediaFileType[] | undefined {
  const values = query.mediaTypes ?? query.fileTypes;
  if (!values?.length) return undefined;
  const types = values.filter(isMediaFileType);
  return types.length > 0 ? types : undefined;
}

function createStoryItem(
  projectRoot: string,
  filePath: string,
  kind: 'script-role' | 'story-scene' | 'story-section',
  label: string,
  input: {
    readonly id: string;
    readonly description: string;
    readonly navigationData: Record<string, unknown>;
    readonly searchText: string;
  },
): ProjectSearchItem {
  return {
    id: input.id,
    kind,
    label,
    description: input.description,
    icon: kind === 'script-role' ? '@' : kind === 'story-scene' ? '#' : '§',
    source: {
      partition: 'story-symbols',
      sourceId: input.id,
      sourceKind: kind,
      filePath,
      uri: vscode.Uri.file(filePath).toString(),
      projectRelativePath: path.relative(projectRoot, filePath),
    },
    projectRoot,
    filePath,
    canonicalName: label,
    searchText: input.searchText,
    navigationData: input.navigationData,
    freshness: 'fresh',
  };
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function createMediaItem(
  projectRoot: string,
  input: {
    readonly filePath: string;
    readonly fileName: string;
    readonly freshness: ProjectIndexFreshness;
    readonly libraryName?: string;
    readonly mediaType?: MediaFileType;
  },
): ProjectSearchItem {
  const mediaType = input.mediaType;
  const filePath = input.filePath;
  const locator: WorkspaceFileContentLocator = { kind: 'workspace-file', path: filePath };
  return {
    id: `media:${filePath}`,
    kind: mediaType === 'document' || mediaType === 'text' ? 'document' : 'media',
    label: input.fileName,
    description: input.libraryName ? `Media: ${input.libraryName}` : 'Media',
    icon: iconForMediaType(mediaType),
    source: {
      partition: 'media-library',
      sourceId: filePath,
      sourceKind: mediaType,
      filePath,
    },
    projectRoot,
    filePath,
    canonicalName: input.fileName,
    searchText: buildProjectSearchText([input.fileName, filePath, input.libraryName, mediaType]),
    navigationData: {
      filePath,
      portablePath: filePath,
      locator,
      ...(input.libraryName ? { libraryName: input.libraryName } : {}),
    },
    freshness: input.freshness,
    metadata: {
      ...(mediaType ? { mediaType } : {}),
      locator,
    },
  };
}

function canonicalMediaLibraryPath(value: string): string | undefined {
  const normalized = normalizeWorkspaceContentPath(value);
  return normalized === value && value.startsWith('neko/assets/') ? value : undefined;
}

function matchesMediaLibraryRawItem(
  projectRoot: string,
  filePath: string,
  fileName: string,
  query: ProjectSearchQuery,
  input: { readonly libraryName?: string; readonly mediaType?: MediaFileType },
): boolean {
  return matchesProjectSearchItem(
    {
      id: `media:${filePath}`,
      kind: input.mediaType === 'document' || input.mediaType === 'text' ? 'document' : 'media',
      label: fileName,
      source: {
        partition: 'media-library',
        sourceId: filePath,
        sourceKind: input.mediaType,
        filePath,
      },
      projectRoot,
      filePath,
      canonicalName: fileName,
      searchText: buildProjectSearchText([fileName, filePath, input.libraryName, input.mediaType]),
      freshness: 'fresh',
      metadata: {
        ...(input.mediaType ? { mediaType: input.mediaType } : {}),
      },
    },
    query,
  );
}

async function readWorkspaceText(filePath: string): Promise<string> {
  try {
    const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    return new TextDecoder().decode(raw);
  } catch {
    return '';
  }
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function readMediaFileType(value: unknown): MediaFileType | undefined {
  return isMediaFileType(value) ? value : undefined;
}

function detectMediaTypeSafe(filePath: string | undefined): MediaFileType | undefined {
  if (!filePath || (!isMediaFile(filePath) && !isDocumentFile(filePath))) return undefined;
  return detectMediaType(filePath);
}

function generatedMediaFileType(
  type: GeneratedAsset['type'],
  mimeType: string,
  filePath: string,
): MediaFileType | undefined {
  if (type === 'generated-image' || mimeType.startsWith('image/')) return 'image';
  if (type === 'generated-video' || mimeType.startsWith('video/')) return 'video';
  if (type === 'generated-audio' || mimeType.startsWith('audio/')) return 'audio';
  return detectMediaTypeSafe(filePath);
}

function isMediaFileType(value: unknown): value is MediaFileType {
  return (
    value === 'video' ||
    value === 'audio' ||
    value === 'image' ||
    value === 'sequence' ||
    value === 'text' ||
    value === 'document'
  );
}

function iconForMediaType(mediaType: MediaFileType | undefined): string {
  if (mediaType === 'video') return '🎬';
  if (mediaType === 'audio') return '♪';
  if (mediaType === 'image') return '🖼';
  if (mediaType === 'sequence') return '▦';
  if (mediaType === 'text') return 'TXT';
  if (mediaType === 'document') return '📄';
  return '◈';
}

function iconForGraphKind(kind: string): string {
  if (kind === 'entity') return '◇';
  if (kind === 'asset') return '◈';
  if (kind === 'canvas-node') return '⬡';
  if (kind === 'generated-asset') return '✦';
  if (kind === 'script-range') return '¶';
  return '◇';
}

function dedupeById<T extends { readonly id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  return deduped;
}

function isPathInside(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
