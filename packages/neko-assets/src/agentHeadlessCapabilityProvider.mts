/**
 * VSCode-free Neko Assets Agent capability provider.
 *
 * This provider exposes terminal-safe asset query tools and textual reference
 * candidates. Host adapters may wrap it, but the provider itself must remain
 * usable by CLI/TUI runtimes without importing VSCode.
 */

import type {
  AgentCapabilityContext,
  AgentCapabilityProvider,
  AgentReferenceContributor,
  AgentReferenceSearchRequest,
  AgentReferenceSearchResult,
  AssetEntity,
  NekoAssetsAPI,
  Tool,
  ToolParameters,
} from '@neko/shared';
import { TOOL_NAMES_ASSETS } from '@neko/shared';

export function createNekoAssetsHeadlessCapabilityProvider(
  api: NekoAssetsAPI,
): AgentCapabilityProvider {
  return new NekoAssetsHeadlessCapabilityProvider(api);
}

interface AssetSummary {
  readonly id: string;
  readonly name: string;
  readonly category: AssetEntity['category'];
  readonly description?: string;
  readonly tags: readonly string[];
  readonly defaultVariantId?: string;
  readonly variantCount: number;
  readonly fileCount: number;
  readonly mediaTypes: readonly string[];
  readonly assetDimensions: readonly string[];
  readonly mediaKinds: readonly string[];
  readonly storageModes: readonly string[];
}

class NekoAssetsHeadlessCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-assets';
  readonly version = '1.0.0';
  readonly hostRequirements = [{ host: 'tui' }, { host: 'cli' }, { host: 'vscode' }] as const;
  readonly requirements = { contentAccess: true } as const;

  constructor(private readonly api: NekoAssetsAPI) {}

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [
      {
        name: TOOL_NAMES_ASSETS.LIST_ASSETS,
        description:
          'List compact asset library summaries. Use this read-only query before selecting an asset ID for follow-up operations.',
        category: 'file',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description:
                'Optional asset category filter, such as character, object, audio, or document.',
            },
            query: {
              type: 'string',
              description:
                'Optional case-insensitive text filter over name, description, aliases, and tags.',
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of assets to return. Defaults to 50, maximum 200.',
            },
          },
        } satisfies ToolParameters,
        execute: async (args) => {
          try {
            const entities = await this.api.getAllEntities();
            const filtered = filterAssetEntities(entities, {
              category: optionalString(args.category),
              query: optionalString(args.query),
            });
            const limit = clampLimit(args.limit, 50, 200);
            return {
              success: true,
              data: {
                assets: filtered.slice(0, limit).map(toAssetSummary),
                total: filtered.length,
                returned: Math.min(filtered.length, limit),
                truncated: filtered.length > limit,
              },
            };
          } catch (err) {
            return { success: false, error: `Failed to list assets: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_ASSETS.GET_ASSET,
        description:
          'Get one asset entity by stable ID. Returns the stored entity so Agent can inspect variants and file references before using them.',
        category: 'file',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            assetId: { type: 'string', description: 'Stable asset entity ID.' },
          },
          required: ['assetId'],
        } satisfies ToolParameters,
        execute: async (args) => {
          try {
            const assetId = optionalString(args.assetId);
            if (!assetId) {
              return { success: false, error: 'assetId is required' };
            }
            const entity = (await this.api.getAllEntities()).find(
              (candidate) => candidate.id === assetId,
            );
            if (!entity) {
              return { success: false, error: `Asset not found: ${assetId}` };
            }
            return { success: true, data: { asset: entity } };
          } catch (err) {
            return { success: false, error: `Failed to get asset: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_ASSETS.IMPORT_ASSET,
        description:
          'Import a local file into the asset library. This mutates the asset index and should be called only with an explicit file path.',
        category: 'file',
        requirements: { writableProject: true },
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['filePath'],
          allowedFallbacks: ['explicit-user-input'],
        },
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Absolute local file path to import.' },
          },
          required: ['filePath'],
        } satisfies ToolParameters,
        execute: async (args) => {
          try {
            const filePath = optionalString(args.filePath);
            if (!filePath) {
              return { success: false, error: 'filePath is required' };
            }
            const asset = await this.api.importFile({ fsPath: filePath });
            return { success: true, data: { asset } };
          } catch (err) {
            return { success: false, error: `Failed to import asset: ${String(err)}` };
          }
        },
      },
    ];
  }

  getReferenceContributors(_context: AgentCapabilityContext): readonly AgentReferenceContributor[] {
    return [new NekoAssetsReferenceContributor(this.api)];
  }
}

class NekoAssetsReferenceContributor implements AgentReferenceContributor {
  readonly id = 'neko-assets';
  readonly displayName = 'Assets';

  constructor(private readonly api: NekoAssetsAPI) {}

  async search(request: AgentReferenceSearchRequest): Promise<AgentReferenceSearchResult> {
    try {
      const entities = await this.api.getAllEntities();
      const filtered = filterAssetEntities(entities, { query: request.query });
      const limit = clampLimit(request.limit, 20, 100);
      return {
        candidates: filtered.slice(0, limit).map(toReferenceCandidate),
        diagnostics: [],
      };
    } catch (err) {
      return {
        candidates: [],
        diagnostics: [
          {
            level: 'warn',
            providerId: 'neko-assets',
            contributionKind: 'referenceContributor',
            contributionName: this.id,
            code: 'capability.reference.unavailable',
            reason: 'asset-query-failed',
            message: `Failed to search assets: ${String(err)}`,
            host: 'tui',
          },
        ],
      };
    }
  }
}

function filterAssetEntities(
  entities: readonly AssetEntity[],
  filters: { readonly category?: string; readonly query?: string },
): readonly AssetEntity[] {
  const query = filters.query?.trim().toLowerCase();
  return entities.filter((entity) => {
    if (filters.category && entity.category !== filters.category) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [
      entity.name,
      entity.description,
      ...(entity.tags ?? []),
      ...(entity.aliases ?? []),
    ]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join('\n')
      .toLowerCase();
    return haystack.includes(query);
  });
}

function toAssetSummary(entity: AssetEntity): AssetSummary {
  const files = entity.variants.flatMap((variant) => variant.files);
  const mediaTypes = [...new Set(files.map((file) => file.mediaType))].sort();
  const assetDimensions = uniqueSortedStrings(
    files.map((file) => file.characterAsset?.assetDimension),
  );
  const mediaKinds = uniqueSortedStrings(files.map((file) => file.characterAsset?.mediaKind));
  const storageModes = uniqueSortedStrings(files.map((file) => file.characterAsset?.storageMode));
  return {
    id: entity.id,
    name: entity.name,
    category: entity.category,
    ...(entity.description ? { description: entity.description } : {}),
    tags: entity.tags,
    ...(entity.defaultVariantId ? { defaultVariantId: entity.defaultVariantId } : {}),
    variantCount: entity.variants.length,
    fileCount: files.length,
    mediaTypes,
    assetDimensions,
    mediaKinds,
    storageModes,
  };
}

function toReferenceCandidate(entity: AssetEntity) {
  const summary = toAssetSummary(entity);
  return {
    id: `asset:${entity.id}`,
    label: entity.name,
    source: 'assets',
    kind: 'asset' as const,
    insertText: `@asset:${entity.id}`,
    description: formatReferenceDescription(entity),
    metadata: {
      assetId: entity.id,
      category: entity.category,
      tags: entity.tags,
      variantCount: summary.variantCount,
      fileCount: summary.fileCount,
      mediaTypes: summary.mediaTypes,
    },
  };
}

function formatReferenceDescription(entity: AssetEntity): string {
  return [entity.category, entity.description, entity.tags.join(', ')].filter(isString).join(' · ');
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function uniqueSortedStrings(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter(isString))].sort();
}

function clampLimit(value: unknown, defaultValue: number, maxValue: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }
  return Math.min(Math.max(Math.floor(value), 1), maxValue);
}
