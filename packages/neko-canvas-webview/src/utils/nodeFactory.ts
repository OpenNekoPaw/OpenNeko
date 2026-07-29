import type {
  CanonicalCanvasNodeType,
  CanvasJobArtifactRef,
  CanvasNode,
  CanvasNodeType,
  CanvasSerializableRecord,
  CanvasSerializableValue,
} from '@neko/shared';
import {
  isCanvasMaterialGenerationContext,
  isCanvasNodeType,
  isDocumentArchiveResourceRef,
  isResourceRef,
  parseDocumentResourceStatus,
} from '@neko/shared';
import { createBuiltInNodeTypeDescriptors } from '../components/nodes/nodeTypeDescriptors';

type CanvasNodeDraft = CanvasNode extends infer TNode
  ? TNode extends CanvasNode
    ? Omit<TNode, 'id'>
    : never
  : never;

interface BuildCanvasNodeOptions {
  type: CanvasNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  zIndex: number;
  preset?: string;
}

type NodeDefaultSize = { width: number; height: number };

export const NODE_DEFAULT_SIZES: Partial<Record<CanvasNodeType, NodeDefaultSize>> =
  Object.fromEntries(
    Object.entries(createBuiltInNodeTypeDescriptors()).map(([type, descriptor]) => [
      type,
      descriptor.defaultSize,
    ]),
  ) as Partial<Record<CanvasNodeType, NodeDefaultSize>>;

export function buildCanvasNode(options: BuildCanvasNodeOptions): CanvasNodeDraft {
  const { position, data, zIndex } = options;
  if (!isCanvasNodeType(options.type)) {
    throw new Error(`Unsupported Canvas node type "${options.type}"`);
  }
  if (options.preset) {
    throw new Error(`Canvas node presets are not supported: "${options.preset}"`);
  }
  const type = options.type as CanonicalCanvasNodeType;
  const base = {
    type,
    position,
    size: getNodeDefaultSize(type),
    zIndex,
  };

  switch (type) {
    case 'markdown':
      return {
        ...base,
        type,
        data: {
          content: asString(data.content),
          title: optionalString(data.title),
          provenance: asSerializableRecord(data.provenance),
        },
      };
    case 'media': {
      const mediaType = readMediaType(data.mediaType);
      const assetPath = asString(data.assetPath);
      const documentResourceRef = isDocumentArchiveResourceRef(data.documentResourceRef)
        ? data.documentResourceRef
        : undefined;
      const resourceRef = isResourceRef(data.resourceRef) ? data.resourceRef : undefined;
      if (!assetPath && !documentResourceRef && !resourceRef) {
        throw new Error('Canvas Media creation requires a durable source');
      }
      return {
        ...base,
        type,
        size: {
          width: base.size.width,
          height: mediaType === 'audio' ? 120 : base.size.height,
        },
        data: {
          assetPath,
          documentResourceRef,
          resourceRef,
          documentResourceStatus: parseDocumentResourceStatus(data.documentResourceStatus),
          runtimeAssetPath: optionalString(data.runtimeAssetPath),
          thumbnailPath: optionalString(data.thumbnailPath),
          runtimeThumbnailPath: optionalString(data.runtimeThumbnailPath),
          mediaType,
          title: optionalString(data.title),
          provenance: asSerializableRecord(data.provenance),
          generationContext: isCanvasMaterialGenerationContext(data.generationContext)
            ? data.generationContext
            : undefined,
          duration: optionalFiniteNumber(data.duration),
        },
      };
    }
    case 'group':
      return {
        ...base,
        type,
        data: {
          label: optionalString(data.label),
          color: optionalString(data.color),
          provenance: asSerializableRecord(data.provenance),
        },
        container: {
          policy: 'group',
          childIds: [],
          layout: { mode: 'manual' },
          deleteBehavior: 'release-children',
        },
      };
    case 'job':
      return {
        ...base,
        type,
        data: {
          jobId: requiredString(data.jobId, 'jobId'),
          revision: readRequiredRevision(data.revision),
          title: requiredString(data.title, 'title'),
          objective: optionalString(data.objective),
          status: readRequiredJobStatus(data.status),
          inputRefs: readJobArtifactRefs(data.inputRefs),
          outputRefs: readJobArtifactRefs(data.outputRefs),
          diagnostic: optionalString(data.diagnostic),
        },
      };
    case 'file': {
      const path = asString(data.path);
      const resourceRef = isResourceRef(data.resourceRef) ? data.resourceRef : undefined;
      const documentResourceRef = isDocumentArchiveResourceRef(data.documentResourceRef)
        ? data.documentResourceRef
        : undefined;
      if (!path && !resourceRef && !documentResourceRef) {
        throw new Error('Canvas File creation requires a durable source');
      }
      return {
        ...base,
        type,
        data: {
          path,
          title: optionalString(data.title) ?? path.split('/').pop() ?? 'File',
          mediaType: optionalString(data.mediaType),
          resourceRef,
          documentResourceRef,
          documentResourceStatus: parseDocumentResourceStatus(data.documentResourceStatus),
          runtimePath: optionalString(data.runtimePath),
          provenance: asSerializableRecord(data.provenance),
        },
      };
    }
    case 'canvas-embed': {
      const canvasPath = requiredString(data.canvasPath, 'canvasPath');
      return {
        ...base,
        type,
        data: {
          canvasPath,
          canvasTitle:
            optionalString(data.canvasTitle) ?? canvasPath.split('/').pop() ?? canvasPath,
          thumbnailData: optionalString(data.thumbnailData),
        },
      };
    }
  }

  throw new Error(`Unsupported Canvas node type "${String(type)}"`);
}

function getNodeDefaultSize(type: CanonicalCanvasNodeType): NodeDefaultSize {
  const size = NODE_DEFAULT_SIZES[type];
  if (!size) {
    throw new Error(`Missing default size for Canvas node type "${type}"`);
  }
  return size;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requiredString(value: unknown, field: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new Error(`Canvas ${field} must be a non-empty string`);
  }
  return result;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readRequiredRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('Canvas Job revision must be a non-negative integer');
  }
  return value;
}

function readMediaType(value: unknown): 'image' | 'video' | 'audio' {
  return value === 'video' || value === 'audio' ? value : 'image';
}

function readRequiredJobStatus(
  value: unknown,
): 'draft' | 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' {
  switch (value) {
    case 'queued':
    case 'running':
    case 'waiting':
    case 'completed':
    case 'failed':
    case 'cancelled':
      return value;
    default:
      throw new Error(`Unsupported Canvas Job status "${String(value)}"`);
  }
}

function readJobArtifactRefs(value: unknown): CanvasJobArtifactRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is CanvasJobArtifactRef => {
    if (!isRecord(candidate)) return false;
    if (candidate.kind === 'canvas-node') {
      return typeof candidate.nodeId === 'string' && candidate.nodeId.length > 0;
    }
    if (candidate.kind === 'resource') {
      return isResourceRef(candidate.resourceRef);
    }
    return (
      candidate.kind === 'file' && typeof candidate.path === 'string' && candidate.path.length > 0
    );
  });
}

function asSerializableRecord(value: unknown): CanvasSerializableRecord | undefined {
  return isRecord(value) ? toSerializableRecord(value) : undefined;
}

function toSerializableRecord(data: Record<string, unknown>): CanvasSerializableRecord {
  const record: CanvasSerializableRecord = {};
  for (const [key, value] of Object.entries(data)) {
    const serializable = toSerializableValue(value);
    if (serializable !== undefined) {
      record[key] = serializable;
    }
  }
  return record;
}

function toSerializableValue(value: unknown): CanvasSerializableValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toSerializableValue(item) ?? null);
  }
  return isRecord(value) ? toSerializableRecord(value) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
