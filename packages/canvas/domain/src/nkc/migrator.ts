// =============================================================================
// NKC Format SDK — Migrator
//
// One-way load-boundary migration into the AI workspace Canvas model.
// =============================================================================

import {
  CANVAS_VERSION,
  type CanvasConnection,
  type CanvasData,
  type CanvasJobArtifactRef,
  type CanvasJobStatus,
  type CanvasNode,
  type CanvasSerializableRecord,
  type CanvasSerializableValue,
  type ConnectionType,
} from '../types/canvas';
import type { ContainerCapability } from '../types/canvas-layered';
import { isContentLocator, validateContentLocator } from '@neko/content';
import {
  isCanvasMaterialMediaKind,
  type CanvasMaterialMediaKind,
} from '../types/canvas-material-contracts';
import { isJobRef, type JobRef } from '@neko/shared/job-lifecycle';

export type NkcVersion = '1.0' | '2.0' | '2.1' | '3.0';

export const CURRENT_NKC_VERSION: NkcVersion = CANVAS_VERSION;

export interface NkcMigrationStep {
  from: string;
  to: string;
  description: string;
}

export interface NkcMigrationResult {
  data: CanvasData;
  fromVersion: string;
  toVersion: NkcVersion;
  migrated: boolean;
  steps: NkcMigrationStep[];
  warnings: string[];
}

const CANONICAL_NODE_TYPES = new Set(['markdown', 'media', 'group', 'job', 'file', 'canvas-embed']);
const CANONICAL_CONNECTION_TYPES = new Set<ConnectionType>([
  'sequence',
  'reference',
  'derived-from',
]);

export function detectNkcVersion(data: unknown): string | undefined {
  if (isRecord(data) && typeof data['version'] === 'string') {
    return data['version'];
  }
  return undefined;
}

export function migrateNkc(data: unknown): NkcMigrationResult {
  assertMigratableCanvasRoot(data);
  const fromVersion = detectNkcVersion(data) ?? '1.0';
  if (fromVersion === CURRENT_NKC_VERSION) {
    return {
      data: data as unknown as CanvasData,
      fromVersion,
      toVersion: CURRENT_NKC_VERSION,
      migrated: false,
      steps: [],
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const migrated = migrateLegacyCanvas(data, warnings);
  return {
    data: migrated,
    fromVersion,
    toVersion: CURRENT_NKC_VERSION,
    migrated: true,
    steps: [
      {
        from: fromVersion,
        to: CURRENT_NKC_VERSION,
        description:
          'Replaced legacy Canvas domain nodes with Markdown, Media, Group, Job, File, and CanvasEmbed.',
      },
    ],
    warnings,
  };
}

/** Retained exports for callers that explicitly exercised the historical steps. */
export function migrateNkcV1ToV2(data: CanvasData): CanvasData {
  return migrateNkc(data).data;
}

export function migrateNkcV2ToV2_1(data: CanvasData): CanvasData {
  return migrateNkc(data).data;
}

function migrateLegacyCanvas(value: unknown, warnings: string[]): CanvasData {
  assertMigratableCanvasRoot(value);
  const source = value;
  const sourceNodes = Array.isArray(source['nodes']) ? source['nodes'] : [];
  const nodes = sourceNodes.flatMap((node, index) => migrateLegacyNode(node, index, warnings));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const sourceConnections = Array.isArray(source['connections']) ? source['connections'] : [];
  const connections = sourceConnections
    .map((connection, index) => migrateLegacyConnection(connection, index, warnings))
    .filter(
      (connection): connection is CanvasConnection =>
        connection !== undefined &&
        nodeIds.has(connection.sourceId) &&
        nodeIds.has(connection.targetId),
    );

  return {
    version: CURRENT_NKC_VERSION,
    name: typeof source['name'] === 'string' ? source['name'] : '',
    ...readViewport(source['viewport']),
    ...(source['projected'] === true ? { projected: true } : {}),
    nodes,
    connections,
    ...(typeof source['linkedProject'] === 'string'
      ? { linkedProject: source['linkedProject'] }
      : {}),
  };
}

function migrateLegacyNode(value: unknown, index: number, warnings: string[]): CanvasNode[] {
  if (!isRecord(value)) {
    warnings.push(`Skipped malformed legacy node at index ${index}.`);
    return [];
  }
  const type = typeof value['type'] === 'string' ? value['type'] : 'unknown';
  if (CANONICAL_NODE_TYPES.has(type)) {
    return [normalizeCanonicalNode(value, index)];
  }

  const base = readNodeBase(value, index);
  const data = isRecord(value['data']) ? value['data'] : {};
  switch (type) {
    case 'text':
    case 'annotation':
    case 'storyboard':
    case 'narrative-note':
    case 'table':
      return [
        {
          ...base,
          type: 'markdown',
          data: {
            content: readLegacyMarkdown(type, data),
            ...readOptionalTitle(data),
            provenance: { migratedFromType: type },
          },
        },
      ];
    case 'script':
      return [
        createFileNode(base, {
          path: readString(data, 'scriptPath'),
          title: readString(data, 'scriptTitle') || 'Script',
          mediaType: 'text/fountain',
          migratedFromType: type,
        }),
      ];
    case 'document':
      return [
        createFileNode(base, {
          path: readString(data, 'docPath'),
          title: readString(data, 'title') || 'Document',
          mediaKind: 'document',
          mediaType: readString(data, 'mimeType') || readString(data, 'docType'),
          migratedFromType: type,
          contentLocator: isRecord(data['contentLocator']) ? data['contentLocator'] : undefined,
        }),
      ];
    case 'model':
      return [
        createFileNode(base, {
          path: readString(data, 'modelPath'),
          title: readString(data, 'modelName') || 'Model',
          mediaKind: 'model',
          mediaType: 'model',
          migratedFromType: type,
        }),
      ];
    case 'project':
      return [
        createFileNode(base, {
          path: readString(data, 'projectPath'),
          title: readString(data, 'projectTitle') || 'Project',
          mediaKind: 'other',
          mediaType: 'application/x-openneko-project',
          migratedFromType: type,
        }),
      ];
    case 'shot':
      return migrateShotNode(base, data);
    case 'scene':
    case 'artboard':
    case 'gallery':
      warnings.push(`Migrated legacy ${type} node "${base.id}" to a generic Group.`);
      return [
        {
          ...base,
          type: 'group',
          container: normalizeGroupContainer(value['container'], type),
          data: {
            label: readLegacyGroupLabel(type, data),
            provenance: { migratedFromType: type },
          },
        },
      ];
    case 'media':
    case 'generated-asset':
      return [normalizeMediaNode(base, data, type, warnings)];
    case 'canvas-embed':
      return [
        {
          ...base,
          type: 'canvas-embed',
          data: {
            canvasPath: readString(data, 'canvasPath'),
            canvasTitle: readString(data, 'canvasTitle') || 'Canvas',
            ...readOptionalContentLocator(data['contentLocator']),
          },
        },
      ];
    default:
      warnings.push(
        `Legacy ${type} node "${base.id}" had no canonical runtime meaning and was preserved as Markdown.`,
      );
      return [
        {
          ...base,
          type: 'markdown',
          data: {
            title: `Migrated ${type}`,
            content: formatUnsupportedLegacyNode(type, data),
            provenance: { migratedFromType: type, unsupportedRuntimeState: true },
          },
        },
      ];
  }
}

function normalizeCanonicalNode(value: Record<string, unknown>, index: number): CanvasNode {
  const base = readNodeBase(value, index);
  const data = isRecord(value['data']) ? value['data'] : {};
  switch (value['type']) {
    case 'markdown':
      return {
        ...base,
        type: 'markdown',
        data: {
          content: readString(data, 'content'),
          ...readOptionalTitle(data),
          ...(isRecord(data['provenance'])
            ? { provenance: toCanvasSerializableRecord(data['provenance']) }
            : {}),
        },
      };
    case 'media':
      return normalizeMediaNode(base, data, 'media', []);
    case 'group':
      return {
        ...base,
        type: 'group',
        container: normalizeGroupContainer(value['container'], 'group'),
        data: {
          ...(typeof data['label'] === 'string' ? { label: data['label'] } : {}),
          ...(typeof data['color'] === 'string' ? { color: data['color'] } : {}),
          ...(isRecord(data['provenance'])
            ? { provenance: toCanvasSerializableRecord(data['provenance']) }
            : {}),
        },
      };
    case 'job':
      return {
        ...base,
        type: 'job',
        data: {
          jobRef: readMigratedJobRef(data),
          revision: readFiniteNumber(data, 'revision', 0),
          title: readString(data, 'title') || 'Job',
          ...(typeof data['objective'] === 'string' ? { objective: data['objective'] } : {}),
          status: readJobStatus(data['status']),
          inputRefs: readJobArtifactRefs(data['inputRefs']),
          outputRefs: readJobArtifactRefs(data['outputRefs']),
          ...(typeof data['diagnostic'] === 'string' ? { diagnostic: data['diagnostic'] } : {}),
        },
      };
    case 'file':
      return createFileNode(base, {
        path: readString(data, 'path'),
        title: readString(data, 'title') || 'File',
        mediaKind: isCanvasMaterialMediaKind(data['mediaKind']) ? data['mediaKind'] : undefined,
        mediaType: readString(data, 'mediaType'),
        contentLocator: isRecord(data['contentLocator']) ? data['contentLocator'] : undefined,
      });
    case 'canvas-embed':
      return {
        ...base,
        type: 'canvas-embed',
        data: {
          canvasPath: readString(data, 'canvasPath'),
          canvasTitle: readString(data, 'canvasTitle') || 'Canvas',
          ...(typeof data['thumbnailData'] === 'string'
            ? { thumbnailData: data['thumbnailData'] }
            : {}),
          ...readOptionalContentLocator(data['contentLocator']),
        },
      };
    default:
      throw new Error(`Unsupported canonical Canvas node type "${String(value['type'])}".`);
  }
}

function readMigratedJobRef(data: Record<string, unknown>): JobRef {
  if (isJobRef(data['jobRef'])) return data['jobRef'];
  const legacyJobId = readString(data, 'jobId');
  if (legacyJobId) {
    return { kind: 'legacy', jobId: legacyJobId };
  }
  throw new Error('Canvas Job migration requires either jobRef or legacy jobId.');
}

function readOptionalContentLocator(
  value: unknown,
): { readonly contentLocator: import('@neko/content').ContentLocator } | undefined {
  if (value === undefined) return undefined;
  const result = validateContentLocator(value);
  if (!result.ok) {
    throw new Error('Canvas embed contentLocator is invalid.');
  }
  return { contentLocator: result.locator };
}

function migrateShotNode(
  base: ReturnType<typeof readNodeBase>,
  data: Record<string, unknown>,
): CanvasNode[] {
  const generatedAsset = isRecord(data['generatedAsset']) ? data['generatedAsset'] : undefined;
  const assetPath =
    readString(generatedAsset ?? {}, 'path') ||
    readString(data, 'generatedImage') ||
    readString(data, 'referenceImagePath');
  if (assetPath) {
    return [
      {
        ...base,
        type: 'media',
        data: {
          assetPath,
          mediaType: 'image',
          title:
            readString(data, 'visualDescription') || `Shot ${String(data['shotNumber'] ?? '')}`,
          provenance: { migratedFromType: 'shot' },
        },
      },
    ];
  }
  return [
    {
      ...base,
      type: 'markdown',
      data: {
        title: `Shot ${String(data['shotNumber'] ?? '')}`.trim(),
        content: readLegacyMarkdown('shot', data),
        provenance: { migratedFromType: 'shot' },
      },
    },
  ];
}

function normalizeMediaNode(
  base: ReturnType<typeof readNodeBase>,
  data: Record<string, unknown>,
  migratedFromType: string,
  warnings: string[],
): CanvasNode {
  const contentLocator = isContentLocator(data['contentLocator'])
    ? data['contentLocator']
    : undefined;
  const mediaType = readMediaType(data);
  if (!mediaType) {
    warnings.push(`Media node "${base.id}" had no media type; migration classified it as image.`);
  }
  return {
    ...base,
    type: 'media',
    data: {
      assetPath:
        readString(data, 'assetPath') ||
        readString(data, 'path') ||
        readString(data, 'generatedPath'),
      mediaType: mediaType ?? 'image',
      ...(contentLocator ? { contentLocator } : {}),
      ...(typeof data['title'] === 'string' ? { title: data['title'] } : {}),
      provenance: {
        ...(isRecord(data['provenance']) ? toCanvasSerializableRecord(data['provenance']) : {}),
        ...(migratedFromType !== 'media' ? { migratedFromType } : {}),
      },
    },
  };
}

function createFileNode(
  base: ReturnType<typeof readNodeBase>,
  input: {
    path: string;
    title: string;
    mediaKind?: CanvasMaterialMediaKind;
    mediaType?: string;
    migratedFromType?: string;
    contentLocator?: Record<string, unknown>;
  },
): CanvasNode {
  return {
    ...base,
    type: 'file',
    data: {
      path: input.path,
      title: input.title,
      ...(input.mediaKind ? { mediaKind: input.mediaKind } : {}),
      ...(input.mediaType ? { mediaType: input.mediaType } : {}),
      ...(input.contentLocator && isContentLocator(input.contentLocator)
        ? { contentLocator: input.contentLocator }
        : {}),
      ...(input.migratedFromType
        ? { provenance: { migratedFromType: input.migratedFromType } }
        : {}),
    },
  };
}

function migrateLegacyConnection(
  value: unknown,
  index: number,
  warnings: string[],
): CanvasConnection | undefined {
  if (!isRecord(value)) {
    warnings.push(`Skipped malformed legacy connection at index ${index}.`);
    return undefined;
  }
  const sourceId = readString(value, 'sourceId');
  const targetId = readString(value, 'targetId');
  if (!sourceId || !targetId) {
    warnings.push(`Skipped legacy connection ${index} without explicit endpoints.`);
    return undefined;
  }
  const legacyType = readString(value, 'type');
  const type: ConnectionType = CANONICAL_CONNECTION_TYPES.has(legacyType as ConnectionType)
    ? (legacyType as ConnectionType)
    : legacyType === 'child'
      ? 'reference'
      : 'reference';
  if (legacyType && !CANONICAL_CONNECTION_TYPES.has(legacyType as ConnectionType)) {
    warnings.push(`Mapped legacy connection type "${legacyType}" to "${type}".`);
  }
  return {
    id: readString(value, 'id') || `connection-${index}`,
    sourceId,
    targetId,
    type,
    ...(typeof value['label'] === 'string' ? { label: value['label'] } : {}),
    sourceEndpoint: normalizeEndpoint(value['sourceEndpoint'], sourceId),
    targetEndpoint: normalizeEndpoint(value['targetEndpoint'], targetId),
  };
}

function normalizeEndpoint(value: unknown, nodeId: string): CanvasConnection['sourceEndpoint'] {
  if (isRecord(value) && value['scope'] === 'node' && typeof value['nodeId'] === 'string') {
    return { scope: 'node', nodeId: value['nodeId'] };
  }
  return { scope: 'node', nodeId };
}

function readNodeBase(value: Record<string, unknown>, index: number) {
  const position = isRecord(value['position']) ? value['position'] : {};
  const size = isRecord(value['size']) ? value['size'] : {};
  return {
    id: readString(value, 'id') || `migrated-node-${index}`,
    position: {
      x: readFiniteNumber(position, 'x', index * 32),
      y: readFiniteNumber(position, 'y', index * 24),
    },
    size: {
      width: readFiniteNumber(size, 'width', 320),
      height: readFiniteNumber(size, 'height', 200),
    },
    zIndex: readFiniteNumber(value, 'zIndex', index),
    ...(typeof value['rotation'] === 'number' ? { rotation: value['rotation'] } : {}),
    ...(value['locked'] === true ? { locked: true } : {}),
    ...(typeof value['parentId'] === 'string' ? { parentId: value['parentId'] } : {}),
  };
}

function normalizeGroupContainer(value: unknown, migratedFromType: string): ContainerCapability {
  const container = isRecord(value) ? value : {};
  return {
    policy: 'group',
    childIds: Array.isArray(container['childIds'])
      ? container['childIds'].filter((id): id is string => typeof id === 'string')
      : [],
    ...(isRecord(container['layout'])
      ? {
          layout: {
            ...container['layout'],
            mode: normalizeLayoutMode(container['layout']['mode']),
          },
        }
      : { layout: { mode: 'manual' as const } }),
    deleteBehavior: 'release-children' as const,
    metadata: { migratedFromPolicy: readString(container, 'policy') || migratedFromType },
  };
}

function normalizeLayoutMode(value: unknown): 'manual' | 'grid' | 'sequence' | 'stack' {
  return value === 'grid' || value === 'sequence' || value === 'stack' ? value : 'manual';
}

function readViewport(value: unknown): { viewport?: CanvasData['viewport'] } {
  if (!isRecord(value) || !isRecord(value['pan'])) return {};
  const zoom = value['zoom'];
  const x = value['pan']['x'];
  const y = value['pan']['y'];
  if (
    typeof zoom !== 'number' ||
    !Number.isFinite(zoom) ||
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y)
  ) {
    return {};
  }
  return { viewport: { pan: { x, y }, zoom } };
}

function readJobStatus(value: unknown): CanvasJobStatus {
  return value === 'draft' ||
    value === 'queued' ||
    value === 'running' ||
    value === 'waiting' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
    ? value
    : 'draft';
}

function readJobArtifactRefs(value: unknown): CanvasJobArtifactRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is CanvasJobArtifactRef => {
    if (!isRecord(candidate)) return false;
    if (candidate['kind'] === 'canvas-node') {
      return typeof candidate['nodeId'] === 'string' && candidate['nodeId'].length > 0;
    }
    if (candidate['kind'] === 'content') {
      return isContentLocator(candidate['contentLocator']);
    }
    return (
      candidate['kind'] === 'file' &&
      typeof candidate['path'] === 'string' &&
      candidate['path'].length > 0
    );
  });
}

function toCanvasSerializableRecord(value: Record<string, unknown>): CanvasSerializableRecord {
  const result: CanvasSerializableRecord = {};
  for (const [key, item] of Object.entries(value)) {
    const serializable = toCanvasSerializableValue(item);
    if (serializable !== undefined) result[key] = serializable;
  }
  return result;
}

function toCanvasSerializableValue(value: unknown): CanvasSerializableValue | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const items: CanvasSerializableValue[] = [];
    for (const item of value) {
      const serializable = toCanvasSerializableValue(item);
      if (serializable !== undefined) items.push(serializable);
    }
    return items;
  }
  return isRecord(value) ? toCanvasSerializableRecord(value) : undefined;
}

function readLegacyMarkdown(type: string, data: Record<string, unknown>): string {
  for (const key of ['content', 'description', 'visualDescription', 'title', 'label']) {
    const candidate = data[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return formatUnsupportedLegacyNode(type, data);
}

function formatUnsupportedLegacyNode(type: string, data: Record<string, unknown>): string {
  return `> Migrated from legacy \`${type}\` node. Unsupported runtime-only fields were not activated.\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
}

function readLegacyGroupLabel(type: string, data: Record<string, unknown>): string {
  return (
    readString(data, 'label') ||
    readString(data, 'sceneTitle') ||
    readString(data, 'name') ||
    readString(data, 'characterName') ||
    `Migrated ${type}`
  );
}

function readOptionalTitle(data: Record<string, unknown>): { title?: string } {
  return typeof data['title'] === 'string' && data['title'].trim() ? { title: data['title'] } : {};
}

function readMediaType(data: Record<string, unknown>): 'image' | 'audio' | 'video' | undefined {
  const value = data['mediaType'];
  return value === 'image' || value === 'audio' || value === 'video' ? value : undefined;
}

function readString(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === 'string' ? record[key] : '';
}

function readFiniteNumber(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertMigratableCanvasRoot(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Invalid NKC root: data must be an object');
  }
  if (
    typeof value['name'] !== 'string' ||
    !Array.isArray(value['nodes']) ||
    !Array.isArray(value['connections'])
  ) {
    throw new Error('Invalid NKC root: name, nodes, and connections are required');
  }
}
