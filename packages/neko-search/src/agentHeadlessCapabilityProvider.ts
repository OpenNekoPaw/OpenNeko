import type {
  AgentCapabilityContext,
  AgentCapabilityProvider,
  ProjectIndexFreshness,
  ProjectSearchItem,
  ProjectSearchItemKind,
  ProjectSearchMode,
  ProjectSearchPartitionStatusSnapshot,
  ProjectSearchQuery,
  ProjectSearchResult,
  ProjectSearchSourceRef,
  Tool,
  ToolParameters,
} from '@neko/shared';
import {
  isProjectSearchItemKind,
  isProjectSearchMode,
  isProjectSearchPartitionKind,
  TOOL_NAMES_SEARCH,
} from '@neko/shared';

export interface ProjectSearchHeadlessRuntime {
  query(query: ProjectSearchQuery): Promise<ProjectSearchResult>;
  getStatus?(projectRoot?: string): readonly ProjectSearchPartitionStatusSnapshot[];
}

export function createProjectSearchHeadlessCapabilityProvider(
  runtime: ProjectSearchHeadlessRuntime,
): AgentCapabilityProvider {
  return new ProjectSearchHeadlessCapabilityProvider(runtime);
}

interface SanitizedProjectSearchItem {
  readonly id: string;
  readonly kind: ProjectSearchItemKind;
  readonly label: string;
  readonly description?: string;
  readonly icon?: string;
  readonly source: ProjectSearchSourceRef;
  readonly projectRoot: string;
  readonly filePath?: string;
  readonly canonicalName?: string;
  readonly aliases?: readonly string[];
  readonly freshness: ProjectIndexFreshness;
  readonly navigationData?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

class ProjectSearchHeadlessCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-search';
  readonly version = '1.0.0';
  readonly hostRequirements = [
    { host: 'tui' as const },
    { host: 'cli' as const },
    { host: 'vscode' as const },
  ];
  readonly requirements = { contentAccess: false } as const;

  constructor(private readonly runtime: ProjectSearchHeadlessRuntime) {}

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [
      {
        name: TOOL_NAMES_SEARCH.QUERY_PROJECT_SEARCH,
        description:
          'Query the project search runtime and return sanitized search hits. Does not expose search index files, cache manifests, Webview URIs, or managed .neko backing paths.',
        category: 'file',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search text. Empty string returns provider-ranked project context.',
            },
            mode: {
              type: 'string',
              description: 'Optional project search mode.',
              enum: [
                'mention',
                'global',
                'asset-picker',
                'entity-picker',
                'document',
                'agent-tool',
              ],
            },
            kinds: {
              type: 'array',
              description: 'Optional ProjectSearchItemKind filters.',
              items: { type: 'string' },
            },
            partitions: {
              type: 'array',
              description: 'Optional ProjectSearchPartitionKind filters.',
              items: { type: 'string' },
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of search hits to return. Defaults to 20, maximum 100.',
            },
            freshOnly: {
              type: 'boolean',
              description: 'When true, omit stale hits.',
            },
          },
        } satisfies ToolParameters,
        execute: async (args) => this.queryProjectSearch(args),
      },
    ];
  }

  private async queryProjectSearch(args: Record<string, unknown>) {
    const query = readSearchQuery(args);
    try {
      const result = await this.runtime.query(query);
      const items = result.items.map(sanitizeProjectSearchItem);
      return {
        success: true,
        data: {
          query: result.query,
          items,
          itemCount: result.items.length,
          partitions: result.partitions.map(sanitizePartitionStatus),
          freshness: result.freshness,
          ...(result.generation !== undefined ? { generation: result.generation } : {}),
        },
      };
    } catch (error) {
      return { success: false, error: `Project search failed: ${String(error)}` };
    }
  }
}

function readSearchQuery(args: Record<string, unknown>): ProjectSearchQuery {
  const text = optionalString(args['query']) ?? '';
  const mode = readSearchMode(args['mode']) ?? 'agent-tool';
  const kinds = readArray(args['kinds']).filter(isProjectSearchItemKind);
  const partitions = readArray(args['partitions']).filter(isProjectSearchPartitionKind);
  const limit = clampLimit(args['limit'], 20, 100);
  return {
    text,
    mode,
    ...(kinds.length > 0 ? { kinds } : {}),
    ...(partitions.length > 0 ? { partitions } : {}),
    limit,
    freshness: args['freshOnly'] === true ? 'fresh-only' : 'allow-stale',
  };
}

function sanitizeProjectSearchItem(item: ProjectSearchItem): SanitizedProjectSearchItem {
  const source = sanitizeSource(item.source);
  const navigationData = sanitizeRecord(item.navigationData);
  const metadata = sanitizeRecord(item.metadata);
  return {
    id: item.id,
    kind: item.kind,
    label: item.label,
    ...(item.description ? { description: item.description } : {}),
    ...(item.icon ? { icon: item.icon } : {}),
    source,
    projectRoot: item.projectRoot,
    ...(isSafeVisiblePath(item.filePath) ? { filePath: item.filePath } : {}),
    ...(item.canonicalName ? { canonicalName: item.canonicalName } : {}),
    ...(item.aliases ? { aliases: item.aliases } : {}),
    freshness: item.freshness,
    ...(navigationData ? { navigationData } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function sanitizeSource(source: ProjectSearchSourceRef): ProjectSearchSourceRef {
  const metadata = sanitizeRecord(source.metadata);
  return {
    partition: source.partition,
    ...(source.sourceId ? { sourceId: source.sourceId } : {}),
    ...(source.sourceKind ? { sourceKind: source.sourceKind } : {}),
    ...(source.refId && isSafeVisibleValue(source.refId) ? { refId: source.refId } : {}),
    ...(source.evidenceId ? { evidenceId: source.evidenceId } : {}),
    ...(source.assetId ? { assetId: source.assetId } : {}),
    ...(source.segmentId ? { segmentId: source.segmentId } : {}),
    ...(source.observationId ? { observationId: source.observationId } : {}),
    ...(source.textKind ? { textKind: source.textKind } : {}),
    ...(source.semanticSourceKind ? { semanticSourceKind: source.semanticSourceKind } : {}),
    ...(source.confidence !== undefined ? { confidence: source.confidence } : {}),
    ...(isSafeVisiblePath(source.filePath) ? { filePath: source.filePath } : {}),
    ...(isSafeVisibleUri(source.uri) ? { uri: source.uri } : {}),
    ...(isSafeVisiblePath(source.projectRelativePath)
      ? { projectRelativePath: source.projectRelativePath }
      : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function sanitizePartitionStatus(
  status: ProjectSearchPartitionStatusSnapshot,
): ProjectSearchPartitionStatusSnapshot {
  return {
    partition: status.partition,
    status: status.status,
    freshness: status.freshness,
    ...(status.itemCount !== undefined ? { itemCount: status.itemCount } : {}),
    ...(status.generation !== undefined ? { generation: status.generation } : {}),
    ...(status.updatedAt ? { updatedAt: status.updatedAt } : {}),
    ...(status.error ? { error: status.error } : {}),
    ...(status.provider ? { provider: status.provider } : {}),
    ...(status.semantic
      ? {
          semantic: {
            providerId: status.semantic.providerId,
            ...(status.semantic.model ? { model: status.semantic.model } : {}),
            ...(status.semantic.modelVersion ? { modelVersion: status.semantic.modelVersion } : {}),
            ...(status.semantic.chunkingVersion
              ? { chunkingVersion: status.semantic.chunkingVersion }
              : {}),
            ...(status.semantic.schemaVersion
              ? { schemaVersion: status.semantic.schemaVersion }
              : {}),
            ...(status.semantic.skillId ? { skillId: status.semantic.skillId } : {}),
            ...(status.semantic.skillVersion ? { skillVersion: status.semantic.skillVersion } : {}),
          },
        }
      : {}),
  };
}

function sanitizeRecord(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const entries = Object.entries(value).flatMap(([key, entry]) => {
    if (isSensitiveKey(key) || !isSafeVisibleValue(entry)) {
      return [];
    }
    return [[key, entry] as const];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function isSensitiveKey(key: string): boolean {
  return /(?:path|uri|cache|index|manifest|token|secret|file)$/i.test(key);
}

function isSafeVisibleValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return !containsManagedStorage(value) && !isWebviewUri(value);
  }
  if (Array.isArray(value)) {
    return value.every(isSafeVisibleValue);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).every(
      ([key, entry]) => !isSensitiveKey(key) && isSafeVisibleValue(entry),
    );
  }
  return true;
}

function isSafeVisiblePath(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && !containsManagedStorage(value);
}

function isSafeVisibleUri(value: string | undefined): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !containsManagedStorage(value) &&
    !isWebviewUri(value)
  );
}

function containsManagedStorage(value: string): boolean {
  return /(^|[\\/])\.neko([\\/]|$)/i.test(value);
}

function isWebviewUri(value: string): boolean {
  return /^vscode-webview:/i.test(value) || /^blob:/i.test(value);
}

function readSearchMode(value: unknown): ProjectSearchMode | undefined {
  return isProjectSearchMode(value) ? value : undefined;
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function clampLimit(value: unknown, defaultValue: number, maxValue: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }
  return Math.min(Math.max(Math.floor(value), 1), maxValue);
}
