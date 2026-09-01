import type {
  CanvasConnectionEndpoint,
  ContainerCapability,
  ContainerSection,
} from './canvas-layered';
import type { CanvasSerializableRecord, CanvasSerializableValue } from './canvas-serializable';
import type { CanvasPlaybackMetadata } from './canvas-playback';
import type { CanvasCreativeScope, CanvasRelatedBoardRef } from './canvas-creative-scope';
import type { ContentLocator } from '@neko/content-domain';
import type { JobRef } from '@neko/shared/job-lifecycle';
import type {
  CanvasEntityRepresentationEvidence,
  CanvasGenerationEvidence,
  CanvasMaterialMediaKind,
} from './canvas-material-contracts';
import type { CanvasGenerationNodeData } from './canvas-generation-node';

// =============================================================================
// Canvas Types - Infinite Canvas Editor Data Model
// =============================================================================

export type { CanvasSerializableRecord, CanvasSerializableValue };

/**
 * Canvas node type discriminator
 */
export const CORE_CANVAS_NODE_TYPES = [
  'markdown',
  'media',
  'group',
  'job',
  'file',
  'canvas-embed',
  'generation',
] as const;

export type CanonicalCanvasNodeType = (typeof CORE_CANVAS_NODE_TYPES)[number];

export const CANVAS_NODE_TYPES = [...CORE_CANVAS_NODE_TYPES] as const;

export type CanvasNodeType = CanonicalCanvasNodeType;

export function isCanvasNodeType(value: unknown): value is CanvasNodeType {
  return typeof value === 'string' && (CANVAS_NODE_TYPES as readonly string[]).includes(value);
}

export type DocumentResourceStatusReason =
  'cache-missing' | 'unauthorized-cache-root' | 'projection-failed';

export interface DocumentResourceStatus {
  state: 'unavailable';
  reason?: DocumentResourceStatusReason;
  message?: string;
}

export function isDocumentResourceStatusReason(
  value: unknown,
): value is DocumentResourceStatusReason {
  return (
    value === 'cache-missing' ||
    value === 'unauthorized-cache-root' ||
    value === 'projection-failed'
  );
}

export function parseDocumentResourceStatus(value: unknown): DocumentResourceStatus | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const status = value as Record<string, unknown>;
  if (status['state'] !== 'unavailable') {
    return undefined;
  }
  const reason = status['reason'];
  const message = status['message'];
  return {
    state: 'unavailable',
    ...(isDocumentResourceStatusReason(reason) ? { reason } : {}),
    ...(typeof message === 'string' ? { message } : {}),
  };
}

/**
 * Connection anchor position on a node
 */
export type ConnectionAnchor = 'top' | 'right' | 'bottom' | 'left';

/**
 * Connection type for styling
 */
export const CORE_CONNECTION_TYPES = ['sequence', 'reference', 'derived-from'] as const;

export type CoreConnectionType = (typeof CORE_CONNECTION_TYPES)[number];

export const CANVAS_CONNECTION_TYPES = [...CORE_CONNECTION_TYPES] as const;

export type ConnectionType = CoreConnectionType;

export function isCanvasConnectionType(value: unknown): value is ConnectionType {
  return (
    typeof value === 'string' && (CANVAS_CONNECTION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Data type that can flow through a port
 */
export type PortDataType = 'image' | 'video' | 'audio' | 'text' | 'any';

/**
 * Port definition for node input/output
 */
export interface PortDefinition {
  /** Unique port identifier within the node */
  id: string;
  /** Port direction */
  type: 'input' | 'output';
  /** Which side of the node the port appears on */
  position: ConnectionAnchor;
  /** Data type this port accepts/produces */
  dataType?: PortDataType;
  /** Display label for the port */
  label?: string;
  /** Maximum number of connections (default: 1 for input, Infinity for output) */
  maxConnections?: number;
}

// =============================================================================
// Node Types
// =============================================================================

/**
 * Base interface for all canvas nodes
 */
export interface CanvasNodeBase<TType extends string = CanvasNodeType> {
  /** Unique node identifier */
  id: string;
  /** Node type discriminator */
  type: TType;
  /** Position in canvas coordinates */
  position: { x: number; y: number };
  /** Size in canvas units */
  size: { width: number; height: number };
  /** Z-index for layering */
  zIndex: number;
  /** Rotation angle in degrees (0-360, default 0) */
  rotation?: number;
  /** Whether node is locked from editing */
  locked?: boolean;
  /** Optional port definitions for data-flow connections. */
  ports?: PortDefinition[];
  /** Optional composable content tree. Nodes without it use the registered default renderer. */
  content?: ContainerSection;
  /** Optional organization parent. Position remains absolute canvas coordinates. */
  parentId?: string;
  /** Optional Group container capability. */
  container?: ContainerCapability;
}

/**
 * Media asset node - references a media file
 */
export interface CanvasMaterialGenerationContext {
  /** Prompt recorded for the generated material. Historical evidence, not editable prompt authority. */
  readonly prompt?: string;
  /** Effective model/provider label when the generating owner supplied one. */
  readonly model?: string;
  /** Upstream Canvas node that owns the editable creative prompt, when known. */
  readonly sourceNodeId?: string;
  /** ISO timestamp copied from the generated asset lifecycle. */
  readonly generatedAt?: string;
  /** Stable creator-facing generation parameters. */
  readonly aspectRatio?: string;
  readonly width?: number;
  readonly height?: number;
  readonly duration?: number;
}

const CANVAS_MATERIAL_GENERATION_CONTEXT_KEYS = new Set([
  'prompt',
  'model',
  'sourceNodeId',
  'generatedAt',
  'aspectRatio',
  'width',
  'height',
  'duration',
]);

export function isCanvasMaterialGenerationContext(
  value: unknown,
): value is CanvasMaterialGenerationContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !CANVAS_MATERIAL_GENERATION_CONTEXT_KEYS.has(key))) {
    return false;
  }
  for (const key of ['prompt', 'model', 'sourceNodeId', 'generatedAt', 'aspectRatio'] as const) {
    const candidate = record[key];
    if (
      candidate !== undefined &&
      (typeof candidate !== 'string' || candidate.trim().length === 0)
    ) {
      return false;
    }
  }
  for (const key of ['width', 'height', 'duration'] as const) {
    const candidate = record[key];
    if (
      candidate !== undefined &&
      (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate <= 0)
    ) {
      return false;
    }
  }
  return Object.keys(record).length > 0;
}

export interface MediaCanvasNode extends CanvasNodeBase {
  type: 'media';
  data: {
    /** Runtime relative path. Canonical persisted nodes use contentLocator. */
    assetPath: string;
    /** Canonical durable content location. */
    contentLocator?: ContentLocator;
    /** Runtime-only document cache status. Not persisted. */
    documentResourceStatus?: DocumentResourceStatus;
    /** Runtime-only preview URI/path materialized from contentLocator. Not persisted. */
    runtimeAssetPath?: string;
    /** Relative path to thumbnail image */
    thumbnailPath?: string;
    /** Runtime-only thumbnail URI/path. Not persisted. */
    runtimeThumbnailPath?: string;
    /** Media type hint */
    mediaType?: 'video' | 'image' | 'audio';
    /** Creator-facing label for generated and imported media. */
    title?: string;
    /** Stable projection lineage. Runtime locations are forbidden. */
    provenance?: CanvasSerializableRecord;
    /** Canonical immutable Generation Job evidence for a generated-output locator. */
    generation?: CanvasGenerationEvidence;
    /** Optional stable Entity identity separate from the representation locator. */
    entityRepresentation?: CanvasEntityRepresentationEvidence;
    /** Duration in seconds (for video/audio) */
    duration?: number;
  };
}

/**
 * Group node - contains other nodes
 */
export interface GroupCanvasNode extends CanvasNodeBase {
  type: 'group';
  data: {
    /** Group label */
    label?: string;
    /** Group color (hex) */
    color?: string;
    /** Stable projection lineage for generated processing groups. */
    provenance?: CanvasSerializableRecord;
  };
}

/**
 * Canonical Markdown node. Canvas stores Markdown source and does not infer
 * domain runtime semantics from its prose.
 */
export interface MarkdownCanvasNode extends CanvasNodeBase {
  type: 'markdown';
  data: {
    content: string;
    title?: string;
    provenance?: CanvasSerializableRecord;
  };
}

export type CanvasJobStatus =
  'draft' | 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';

export type CanvasJobArtifactRef =
  | { kind: 'canvas-node'; nodeId: string }
  | { kind: 'content'; contentLocator: ContentLocator }
  | { kind: 'file'; path: string };

/**
 * Read-only projection of a Job owned by the project/Agent Job service.
 */
export interface JobCanvasNode extends CanvasNodeBase {
  type: 'job';
  data: {
    /** Stable owner identity. */
    jobRef: JobRef;
    title: string;
    objective?: string;
    status: CanvasJobStatus;
    inputRefs: CanvasJobArtifactRef[];
    outputRefs: CanvasJobArtifactRef[];
    diagnostic?: string;
  };
}

/**
 * Generic non-media file reference. Specialized file meaning belongs to the
 * owning artifact rather than the Canvas renderer.
 */
export interface FileCanvasNode extends CanvasNodeBase {
  type: 'file';
  data: {
    path: string;
    title: string;
    /** Explicit material kind. Never inferred from the file name or extension. */
    mediaKind?: CanvasMaterialMediaKind;
    mediaType?: string;
    /** Canonical durable content location for Canvas and creator-visible nodes. */
    contentLocator?: ContentLocator;
    /** Canonical immutable Generation Job evidence for a generated-output locator. */
    generation?: CanvasGenerationEvidence;
    /** Optional stable Entity identity separate from the representation locator. */
    entityRepresentation?: CanvasEntityRepresentationEvidence;
    documentResourceStatus?: DocumentResourceStatus;
    runtimePath?: string;
    /** Base64 cover thumbnail for portable file projections. */
    thumbnailData?: string;
    provenance?: CanvasSerializableRecord;
  };
}

export type CanvasTextDocumentType = 'markdown' | 'text';

export const CANVAS_TEXT_DOCUMENT_MAX_BYTES = 1_000_000;

export interface CanvasTextDocumentReadRequest {
  readonly type: 'textDocument:read';
  readonly requestId: string;
  readonly nodeId: string;
  readonly docPath: string;
  readonly docType: CanvasTextDocumentType;
}

export type CanvasTextDocumentReadErrorCode =
  | 'invalid-request'
  | 'unsupported-type'
  | 'not-found'
  | 'not-a-file'
  | 'too-large'
  | 'invalid-utf8'
  | 'read-failed';

export type CanvasTextDocumentReadResult =
  | {
      readonly type: 'textDocument:readResult';
      readonly requestId: string;
      readonly nodeId: string;
      readonly docPath: string;
      readonly docType: CanvasTextDocumentType;
      readonly status: 'ready';
      readonly text: string;
    }
  | {
      readonly type: 'textDocument:readResult';
      readonly requestId: string;
      readonly nodeId: string;
      readonly docPath: string;
      readonly docType: CanvasTextDocumentType;
      readonly status: 'error';
      readonly code: CanvasTextDocumentReadErrorCode;
      readonly error: string;
    };

export function isCanvasTextDocumentType(value: unknown): value is CanvasTextDocumentType {
  return value === 'markdown' || value === 'text';
}

export function isCanvasTextDocumentReadRequest(
  value: unknown,
): value is CanvasTextDocumentReadRequest {
  if (!isCanvasTextDocumentMessageRecord(value)) return false;
  const message = value;
  return (
    message['type'] === 'textDocument:read' &&
    typeof message['requestId'] === 'string' &&
    message['requestId'].length > 0 &&
    typeof message['nodeId'] === 'string' &&
    message['nodeId'].length > 0 &&
    typeof message['docPath'] === 'string' &&
    message['docPath'].length > 0 &&
    isCanvasTextDocumentType(message['docType'])
  );
}

export function isCanvasTextDocumentReadResult(
  value: unknown,
): value is CanvasTextDocumentReadResult {
  if (!isCanvasTextDocumentMessageRecord(value)) return false;
  const message = value;
  if (
    message['type'] !== 'textDocument:readResult' ||
    typeof message['requestId'] !== 'string' ||
    message['requestId'].length === 0 ||
    typeof message['nodeId'] !== 'string' ||
    message['nodeId'].length === 0 ||
    typeof message['docPath'] !== 'string' ||
    message['docPath'].length === 0 ||
    !isCanvasTextDocumentType(message['docType'])
  ) {
    return false;
  }
  if (message['status'] === 'ready') return typeof message['text'] === 'string';
  return (
    message['status'] === 'error' &&
    isCanvasTextDocumentReadErrorCode(message['code']) &&
    typeof message['error'] === 'string'
  );
}

function isCanvasTextDocumentReadErrorCode(
  value: unknown,
): value is CanvasTextDocumentReadErrorCode {
  return (
    value === 'invalid-request' ||
    value === 'unsupported-type' ||
    value === 'not-found' ||
    value === 'not-a-file' ||
    value === 'too-large' ||
    value === 'invalid-utf8' ||
    value === 'read-failed'
  );
}

function isCanvasTextDocumentMessageRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Canvas embed node - nested .nkc reference with thumbnail
 */
export interface CanvasEmbedCanvasNode extends CanvasNodeBase {
  type: 'canvas-embed';
  data: {
    canvasPath: string;
    canvasTitle: string;
    thumbnailData?: string;
    /** Canonical durable location of the embedded Canvas document. */
    contentLocator?: ContentLocator;
  };
}

export interface GenerationCanvasNode extends CanvasNodeBase {
  type: 'generation';
  data: CanvasGenerationNodeData;
}

/**
 * Union type of all canvas node types
 */
export type CanvasNode =
  | MarkdownCanvasNode
  | MediaCanvasNode
  | GroupCanvasNode
  | JobCanvasNode
  | FileCanvasNode
  | CanvasEmbedCanvasNode
  | GenerationCanvasNode;

// =============================================================================
// Connection Types
// =============================================================================

/**
 * Connection between two nodes
 */
export interface CanvasConnection {
  /** Unique connection identifier */
  id: string;
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Connection type for styling */
  type: ConnectionType;
  /** Optional label on the connection */
  label?: string;
  /** Canonical source endpoint for node/port/block/field references. */
  sourceEndpoint: CanvasConnectionEndpoint;
  /** Canonical target endpoint for node/port/block/field references. */
  targetEndpoint: CanvasConnectionEndpoint;
}

// =============================================================================
// Viewport Types
// =============================================================================

/**
 * Canvas viewport state (pan and zoom)
 */
export interface CanvasViewport {
  /** Pan offset in canvas coordinates */
  pan: { x: number; y: number };
  /** Zoom level (1 = 100%) */
  zoom: number;
}

// =============================================================================
// Canvas Data (File Format)
// =============================================================================

/**
 * Canvas data structure - persisted to .nkc file
 */
export interface CanvasData {
  /** Canvas name */
  name: string;
  /** Whether this Canvas is projected from an external source of truth. */
  projected?: boolean;
  /** Viewport state for restoring view */
  viewport?: CanvasViewport;
  /** All nodes on the canvas */
  nodes: CanvasNode[];
  /** All connections between nodes */
  connections: CanvasConnection[];
  /** Linked video project path (relative) */
  linkedProject?: string;
  /** Optional advisory creative work-unit scope for long-form and interactive production. */
  creativeScope?: CanvasCreativeScope;
  /** Optional durable navigation refs to related Canvas documents. */
  relatedBoards?: readonly CanvasRelatedBoardRef[];
  /** Optional Canvas playback projection metadata. */
  playback?: CanvasPlaybackMetadata;
}

// =============================================================================
// Canvas Constants
// =============================================================================

/** Default canvas data for new files */
export const DEFAULT_CANVAS_DATA: CanvasData = {
  name: 'Untitled Canvas',
  viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  nodes: [],
  connections: [],
};

// =============================================================================
// Type Guards
// =============================================================================

export function isMediaNode(node: CanvasNode): node is MediaCanvasNode {
  return node.type === 'media';
}

export function isGroupNode(node: CanvasNode): node is GroupCanvasNode {
  return node.type === 'group';
}

export function isCanvasEmbedNode(node: CanvasNode): node is CanvasEmbedCanvasNode {
  return node.type === 'canvas-embed';
}

export function isMarkdownNode(node: CanvasNode): node is MarkdownCanvasNode {
  return node.type === 'markdown';
}

export function isJobNode(node: CanvasNode): node is JobCanvasNode {
  return node.type === 'job';
}

export function isFileNode(node: CanvasNode): node is FileCanvasNode {
  return node.type === 'file';
}

export function isGenerationNode(node: CanvasNode): node is GenerationCanvasNode {
  return node.type === 'generation';
}

// =============================================================================
// Port Helpers
// =============================================================================

/** Default ports for Markdown nodes. */
export const MARKDOWN_NODE_PORTS: PortDefinition[] = createPlayableNodePorts();

/** Default ports for media nodes. */
export const MEDIA_NODE_PORTS: PortDefinition[] = createPlayableNodePorts();

/** Default ports for group nodes */
export const GROUP_NODE_PORTS: PortDefinition[] = [
  { id: 'in', type: 'input', position: 'left', dataType: 'any', label: 'Input' },
  { id: 'out', type: 'output', position: 'right', dataType: 'any', label: 'Output' },
];

/**
 * Get default ports for a node type.
 * Returns empty array for types that use node-level endpoints.
 */
export function getDefaultPorts(nodeType: CanvasNodeType): PortDefinition[] {
  switch (nodeType) {
    case 'markdown':
      return MARKDOWN_NODE_PORTS;
    case 'media':
      return MEDIA_NODE_PORTS;
    case 'group':
      return GROUP_NODE_PORTS;
    case 'generation':
      return [
        { id: 'in', type: 'input', position: 'left', dataType: 'any', label: 'Reference' },
        { id: 'out', type: 'output', position: 'right', dataType: 'any', label: 'Output' },
      ];
    default:
      return [];
  }
}

function createPlayableNodePorts(): PortDefinition[] {
  return [
    { id: 'in', type: 'input', position: 'left', dataType: 'any', label: 'Input' },
    { id: 'out', type: 'output', position: 'right', dataType: 'any', label: 'Output' },
  ];
}

/**
 * Check if two port data types are compatible for connection.
 * 'any' is compatible with everything.
 */
export function arePortTypesCompatible(
  sourceType: PortDataType | undefined,
  targetType: PortDataType | undefined,
): boolean {
  if (!sourceType || !targetType) return true;
  if (sourceType === 'any' || targetType === 'any') return true;
  return sourceType === targetType;
}
