import type {
  ProjectSearchAdapter,
  ProjectSearchItem,
  ProjectSearchItemKind,
  ProjectSearchPartitionKind,
  ProjectSearchProviderCapabilities,
  ProjectSearchQuery,
  ProjectSearchQueryContext,
  ProjectSearchSourceRef,
} from '@neko/shared';
import type { ProjectSearchDisposable } from '../core/ports';

export interface ProjectSearchProviderContribution {
  readonly providerId: string;
  readonly displayName?: string;
  readonly adapters: readonly ProjectSearchAdapter[];
  readonly partitions?: readonly ProjectSearchPartitionKind[];
  readonly capabilities?: ProjectSearchProviderCapabilities;
  readonly replacesCompatibilityPartitions?: readonly ProjectSearchPartitionKind[];
}

export interface ProjectSearchProviderRegistry {
  registerProvider(contribution: ProjectSearchProviderContribution): ProjectSearchDisposable;
}

export interface ProjectSearchProviderRegistryOptions {
  readonly onCompatibilityPartitionReplaced?: (
    partitions: readonly ProjectSearchPartitionKind[],
    contribution: ProjectSearchProviderContribution,
  ) => void;
}

export interface StorySearchProjection {
  readonly id: string;
  readonly kind:
    'story-scene' | 'story-section' | 'script-role' | 'creative-entity' | 'entity-candidate';
  readonly label: string;
  readonly projectRoot: string;
  readonly source: ProjectSearchSourceRef;
  readonly searchText: string;
  readonly description?: string;
  readonly filePath?: string;
  readonly canonicalName?: string;
  readonly aliases?: readonly string[];
  readonly navigationData?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

export interface AssetSearchProjection {
  readonly id: string;
  readonly kind?: 'asset' | 'media' | 'document' | 'generated-asset';
  readonly label: string;
  readonly projectRoot: string;
  readonly source: ProjectSearchSourceRef;
  readonly searchText: string;
  readonly description?: string;
  readonly filePath?: string;
  readonly canonicalName?: string;
  readonly aliases?: readonly string[];
  readonly thumbnailUri?: string;
  readonly navigationData?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

export interface DocumentSearchProjection {
  readonly id: string;
  readonly label: string;
  readonly projectRoot: string;
  readonly source: ProjectSearchSourceRef;
  readonly searchText: string;
  readonly description?: string;
  readonly filePath?: string;
  readonly canonicalName?: string;
  readonly aliases?: readonly string[];
  readonly navigationData?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

export interface SearchProjectionAdapterOptions<TProjection> {
  readonly partition: ProjectSearchPartitionKind;
  readonly providerId: string;
  readonly itemKind: ProjectSearchItemKind | ((projection: TProjection) => ProjectSearchItemKind);
  readonly load: (
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ) => Promise<readonly TProjection[]>;
  readonly getItemCount?: (projectRoot: string) => number | undefined;
  readonly capabilities?: ProjectSearchProviderCapabilities;
}

export function createProviderRegistration(
  registerAdapter: (adapter: ProjectSearchAdapter) => ProjectSearchDisposable,
  options: ProjectSearchProviderRegistryOptions = {},
): ProjectSearchProviderRegistry {
  return {
    registerProvider(contribution) {
      if (contribution.replacesCompatibilityPartitions?.length) {
        options.onCompatibilityPartitionReplaced?.(
          contribution.replacesCompatibilityPartitions,
          contribution,
        );
      }
      const disposables = contribution.adapters.map((adapter) => registerAdapter(adapter));
      return {
        dispose() {
          for (const disposable of disposables) {
            disposable.dispose();
          }
        },
      };
    },
  };
}

export function createStorySearchProviderContribution(input: {
  readonly providerId: string;
  readonly displayName?: string;
  readonly adapters: readonly ProjectSearchAdapter[];
  readonly replacesCompatibility?: boolean;
}): ProjectSearchProviderContribution {
  return {
    providerId: input.providerId,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    adapters: input.adapters,
    partitions: ['story-symbols', 'creative-entities'],
    capabilities: {
      providerId: input.providerId,
      modes: ['mention', 'global', 'entity-picker', 'agent-tool'],
      itemKinds: [
        'story-scene',
        'story-section',
        'script-role',
        'creative-entity',
        'entity-candidate',
      ],
      partitions: ['story-symbols', 'creative-entities'],
    },
    ...(input.replacesCompatibility
      ? { replacesCompatibilityPartitions: ['story-symbols', 'creative-entities'] }
      : {}),
  };
}

export function createAssetSearchProviderContribution(input: {
  readonly providerId: string;
  readonly displayName?: string;
  readonly adapters: readonly ProjectSearchAdapter[];
  readonly replacesCompatibility?: boolean;
}): ProjectSearchProviderContribution {
  return {
    providerId: input.providerId,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    adapters: input.adapters,
    partitions: ['asset-library', 'media-library', 'generated-assets'],
    capabilities: {
      providerId: input.providerId,
      modes: ['mention', 'global', 'asset-picker', 'agent-tool'],
      itemKinds: ['asset', 'media', 'document', 'generated-asset'],
      partitions: ['asset-library', 'media-library', 'generated-assets'],
    },
    ...(input.replacesCompatibility
      ? { replacesCompatibilityPartitions: ['asset-library', 'media-library', 'generated-assets'] }
      : {}),
  };
}

export function createDocumentSearchProviderContribution(input: {
  readonly providerId: string;
  readonly displayName?: string;
  readonly adapters: readonly ProjectSearchAdapter[];
  readonly semantic?: boolean;
  readonly replacesCompatibility?: boolean;
}): ProjectSearchProviderContribution {
  return {
    providerId: input.providerId,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    adapters: input.adapters,
    partitions: ['documents'],
    capabilities: {
      providerId: input.providerId,
      semantic: input.semantic,
      modes: ['mention', 'global', 'document', 'agent-tool'],
      itemKinds: ['document'],
      partitions: ['documents'],
    },
    ...(input.replacesCompatibility ? { replacesCompatibilityPartitions: ['documents'] } : {}),
  };
}

export function createSearchProjectionAdapter<TProjection extends SearchProjectionBase>(
  options: SearchProjectionAdapterOptions<TProjection>,
): ProjectSearchAdapter {
  return {
    partition: options.partition,
    ensureInitialized: async () => undefined,
    async query(query, context) {
      const projections = await options.load(query, context);
      return projections.map((projection) =>
        projectionToSearchItem(projection, options.partition, options.itemKind),
      );
    },
    getStatus(projectRoot) {
      const itemCount = options.getItemCount?.(projectRoot);
      return {
        partition: options.partition,
        status: 'ready',
        freshness: 'fresh',
        ...(itemCount !== undefined ? { itemCount } : {}),
        provider: options.capabilities ?? {
          providerId: options.providerId,
          partitions: [options.partition],
        },
      };
    },
  };
}

interface SearchProjectionBase {
  readonly id: string;
  readonly label: string;
  readonly projectRoot: string;
  readonly source: ProjectSearchSourceRef;
  readonly searchText: string;
  readonly description?: string;
  readonly filePath?: string;
  readonly canonicalName?: string;
  readonly aliases?: readonly string[];
  readonly thumbnailUri?: string;
  readonly navigationData?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

function projectionToSearchItem<TProjection extends SearchProjectionBase>(
  projection: TProjection,
  partition: ProjectSearchPartitionKind,
  itemKind: ProjectSearchItemKind | ((projection: TProjection) => ProjectSearchItemKind),
): ProjectSearchItem {
  const kind = typeof itemKind === 'function' ? itemKind(projection) : itemKind;
  return {
    id: projection.id,
    kind,
    label: projection.label,
    ...(projection.description ? { description: projection.description } : {}),
    source: { ...projection.source, partition },
    projectRoot: projection.projectRoot,
    ...(projection.filePath ? { filePath: projection.filePath } : {}),
    ...(projection.canonicalName ? { canonicalName: projection.canonicalName } : {}),
    ...(projection.aliases ? { aliases: projection.aliases } : {}),
    searchText: projection.searchText,
    ...(projection.navigationData ? { navigationData: projection.navigationData } : {}),
    ...(projection.thumbnailUri ? { thumbnailUri: projection.thumbnailUri } : {}),
    freshness: 'fresh',
    ...(projection.metadata ? { metadata: projection.metadata } : {}),
  };
}
