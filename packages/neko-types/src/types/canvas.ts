import type {
  CanvasConnectionEndpoint,
  ContainerCapability,
  ContainerSection,
  NodePreviewDescriptor,
} from './canvas-layered';
import type { CanvasSerializableRecord, CanvasSerializableValue } from './canvas-serializable';
import type { NkProjectType } from './canvas-drop';
import type { CanvasPlaybackMetadata } from './canvas-playback';
import type { CanvasCreativeScope, CanvasRelatedBoardRef } from './canvas-creative-scope';
import type { CreativeEntityRef } from './creative-entity-asset-composition';
import type { DocumentArchiveResourceRef } from './document-reading';
import type {
  NarrativeEndingMetadata,
  NarrativeMetadata,
  NarrativeSceneMetadata,
  NarrativeVariable,
  StoryGenre,
  VariableEffect,
} from './narrative-preview';
import type { ResourceRef } from './resource-cache';
import type { CanvasStoryboardPromptState } from './canvas-semantic-storyboard';
import type { StoryboardMediaRef, StoryboardTextCue, StoryboardVoiceCue } from './storyboard-table';
import type {
  BatchExecutionPlan,
  ComicAnimationDiagnostic,
  VisualOccurrence,
} from './comic-animation-indexing';
import type {
  CreativeTablePromptMediaType,
  CreativeTablePromptOperation,
  CreativeTablePromptScope,
} from './creative-table-profile';

// =============================================================================
// Canvas Types - Infinite Canvas Editor Data Model
// =============================================================================

export type { CanvasSerializableRecord, CanvasSerializableValue };

/**
 * Canvas node type discriminator
 */
export const CORE_CANVAS_NODE_TYPES = [
  // Core nodes
  'media',
  'storyboard',
  'annotation',
  'group',
  // Rich content nodes
  'text',
  'artboard',
  'table',
  // Storyboard system
  'shot',
  'scene',
  'gallery',
  // Content reference nodes
  'script',
  'document',
  'model',
  'canvas-embed',
  'project',
] as const;

export type CoreCanvasNodeType = (typeof CORE_CANVAS_NODE_TYPES)[number];

/**
 * Built-in subsystem node types registered by shared Canvas contracts.
 */
export const REGISTERED_CANVAS_NODE_TYPES = [
  // Narrative subsystem
  'narrative-start',
  'choice',
  'merge',
  'narrative-scene',
  'narrative-note',
  'narrative-ending',
  // Behavior subsystem
  'state',
  'trigger',
  'action',
  'condition',
  'composite',
  // Entity graph subsystem
  'entity',
  'representation-slot',
  'occurrence',
  'generated-asset',
  // Memory graph subsystem
  'memory',
  'conversation',
  'fact',
] as const;

export type RegisteredCanvasNodeType = (typeof REGISTERED_CANVAS_NODE_TYPES)[number];

export const CANVAS_NODE_TYPES = [
  ...CORE_CANVAS_NODE_TYPES,
  ...REGISTERED_CANVAS_NODE_TYPES,
] as const;

export type CanvasNodeType = CoreCanvasNodeType | RegisteredCanvasNodeType;

export function isCanvasNodeType(value: unknown): value is CanvasNodeType {
  return typeof value === 'string' && CANVAS_NODE_TYPES.includes(value as CanvasNodeType);
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
export const CORE_CONNECTION_TYPES = ['default', 'sequence', 'reference'] as const;

export type CoreConnectionType = (typeof CORE_CONNECTION_TYPES)[number];

/**
 * Built-in subsystem connection types registered by shared Canvas contracts.
 */
export const REGISTERED_CONNECTION_TYPES = [
  'choice',
  'transition',
  'child',
  'association',
  'derived-from',
] as const;

export type RegisteredConnectionType = (typeof REGISTERED_CONNECTION_TYPES)[number];

export const CANVAS_CONNECTION_TYPES = [
  ...CORE_CONNECTION_TYPES,
  ...REGISTERED_CONNECTION_TYPES,
] as const;

export type ConnectionType = CoreConnectionType | RegisteredConnectionType;

export function isCanvasConnectionType(value: unknown): value is ConnectionType {
  return typeof value === 'string' && CANVAS_CONNECTION_TYPES.includes(value as ConnectionType);
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
export interface CanvasNodeBase {
  /** Unique node identifier */
  id: string;
  /** Node type discriminator */
  type: CanvasNodeType;
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
  /** Port definitions for data-flow connections (optional, backward compatible) */
  ports?: PortDefinition[];
  /** Optional composable content tree. Nodes without it use the registered default renderer. */
  content?: ContainerSection;
  /** Optional organization parent. Position remains absolute canvas coordinates. */
  parentId?: string;
  /** Optional generic container capability for Scene, Group, Artboard, and future policies. */
  container?: ContainerCapability;
  /** Optional stable node summary descriptor for child slots, minimaps, and Agent context. */
  preview?: NodePreviewDescriptor;
  /** Optional subsystem or feature extension data. Base Canvas semantics remain owned by core fields. */
  extension?: CanvasSerializableRecord;
  /** Optional registered preset that assembled this node's capabilities. */
  preset?: string;
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
    /** Relative path to the media file. Empty when documentResourceRef is the persistent source. */
    assetPath: string;
    /** Stable reference to a document/archive entry when the media is linked from a container. */
    documentResourceRef?: DocumentArchiveResourceRef;
    /** Stable unified cache resource identity. Preferred over documentResourceRef for new payloads. */
    resourceRef?: ResourceRef;
    /** Runtime-only document cache status. Not persisted. */
    documentResourceStatus?: DocumentResourceStatus;
    /** Runtime-only preview URI/path materialized from documentResourceRef. Not persisted. */
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
    /** Portable generation provenance shown by Canvas material action surfaces. */
    generationContext?: CanvasMaterialGenerationContext;
    /** Duration in seconds (for video/audio) */
    duration?: number;
  };
}

/**
 * Storyboard/scene node - represents a scene or shot
 */
export interface StoryboardCanvasNode extends CanvasNodeBase {
  type: 'storyboard';
  data: {
    /** Scene title */
    title: string;
    /** Scene description */
    description?: string;
    /** Estimated duration in seconds */
    duration?: number;
    /** Color for visual grouping (hex) */
    color?: string;
  };
}

/**
 * Text annotation node
 */
export interface AnnotationCanvasNode extends CanvasNodeBase {
  type: 'annotation';
  data: {
    /** Annotation text content */
    content: string;
    /** Text style options */
    style?: {
      fontSize?: number;
      color?: string;
      backgroundColor?: string;
    };
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

// =============================================================================
// Rich Content Nodes (text / artboard)
// =============================================================================

export interface TextNodeStyle {
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  color?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
  padding?: number;
}

/**
 * Rich text node - supports plain text and Markdown
 */
export interface TextCanvasNode extends CanvasNodeBase {
  type: 'text';
  data: {
    content: string;
    format?: 'plain' | 'markdown';
    style?: TextNodeStyle;
    title?: string;
    provenance?: CanvasSerializableRecord;
  };
}

export type ArtboardPreset = 'custom' | '1080p' | '4k' | 'instagram' | 'story' | 'youtube';

/**
 * Artboard node - fixed-size exportable canvas region
 */
export interface ArtboardCanvasNode extends CanvasNodeBase {
  type: 'artboard';
  data: {
    name: string;
    description?: string;
    backgroundColor?: string;
    showBorder?: boolean;
    preset?: ArtboardPreset;
  };
}

/**
 * Table column definition
 */
export interface TableColumnDef {
  id: string;
  label: string;
  width: number;
}

/**
 * Table node - grid container for organizing mixed content in rows and columns
 */
export interface TableCanvasNode extends CanvasNodeBase {
  type: 'table';
  data: {
    label?: string;
    columns: TableColumnDef[];
    rowCount: number;
    columnCount: number;
    showHeader: boolean;
    /**
     * Canvas-owned Markdown review metadata. This keeps parsed rows, original
     * Markdown, resource status, and diagnostics behind the Canvas node boundary
     * without making the shared capability DTO a fixed storyboard-row protocol.
     */
    markdown?: CanvasSerializableRecord;
  };
}

// =============================================================================
// Storyboard System (shot / scene / gallery)
// =============================================================================

/** Shot scale codes following cinematography conventions */
export type ShotScale = 'ECU' | 'CU' | 'MCU' | 'MS' | 'MLS' | 'LS' | 'VLS' | 'ELS' | 'OTS' | 'POV';

/** Camera movement type */
export type CameraMovement =
  | 'static'
  | 'pan'
  | 'tilt'
  | 'zoom-in'
  | 'zoom-out'
  | 'dolly'
  | 'dolly-in'
  | 'dolly-out'
  | 'handheld'
  | 'crane';

/** Camera angle */
export type CameraAngle = 'eye-level' | 'high-angle' | 'low-angle' | 'bird-eye' | 'dutch';

/** Generation status for a shot or gallery cell */
export type ShotGenerationStatus = 'idle' | 'pending' | 'generating' | 'done' | 'error';

/** A single generated image candidate */
export interface GeneratedImageVersion {
  id: string;
  /** Base64 data URL or asset path */
  dataUrl: string;
  prompt: string;
  timestamp: number;
  /** Whether this is the currently selected candidate */
  selected: boolean;
  /** GeneratedAsset ID reference (ADR-4 migration — present for new assets) */
  assetId?: string;
}

/** Character reference within a shot */
export interface ShotCharacter {
  characterId?: string;
  characterName: string;
  /** Stable creative entity identity when the character is resolved. */
  entityRef?: CreativeEntityRef;
  /** Stable unresolved entity candidate identity used for later confirmation backfill. */
  candidateId?: string;
  /** Shot-local participation role such as primary, secondary, or background. */
  role?: string;
  /** Shot-local character action used by storyboard and generation projections. */
  action?: string;
  /** GalleryNode id used for IP-Adapter reference */
  referenceNodeId?: string;
  /**
   * Phase 5 reference chain — ordered list of *prior* shot ids whose
   * generated output should also be threaded in as reference images.
   * Populated by PlanBuilder; consumed by PipelineExecutor.
   *
   * See docs/architecture/creative-consistency.md §4.
   */
  referenceChain?: string[];
  emotion?: string;
  /** Notes that help preserve character continuity across shots. */
  continuityNotes?: string;
  /** Bounded appearance/costume hints for this shot; durable details belong in character memory. */
  appearanceNotes?: string;
}

/** Review-only candidate identity surfaced by comic-to-animation indexing. */
export interface ShotCharacterCandidate {
  readonly candidateId: string;
  readonly entityRef?: CreativeEntityRef;
  readonly displayName?: string;
  readonly role?: string;
  readonly confidence?: number;
  readonly sourceRefId?: string;
  readonly diagnostics?: readonly ComicAnimationDiagnostic[];
}

export interface CanvasCreativePromptSlot {
  readonly fieldId: string;
  readonly scope: CreativeTablePromptScope;
  readonly mediaType: CreativeTablePromptMediaType;
  readonly operation: CreativeTablePromptOperation;
  readonly prompt: string;
}

/**
 * Shot node - a single storyboard panel with full production metadata
 */
export interface ShotCanvasNode extends CanvasNodeBase {
  type: 'shot';
  data: {
    shotNumber: number;
    /** Estimated duration in seconds */
    duration: number;
    visualDescription: string;
    characters: ShotCharacter[];
    shotScale: ShotScale;
    cameraMovement?: CameraMovement;
    cameraAngle?: CameraAngle;
    characterAction: string;
    emotion: string[];
    sceneTags: string[];
    /** GalleryNode id for background/IP-Adapter reference */
    referenceNodeId?: string;
    /** Stable Canvas node / slot references used as generation or review references. */
    referenceRefs?: string[];
    /** Currently displayed image (data URL or asset path) @deprecated Use generatedAsset.path */
    generatedImage?: string;
    /** AI-generated video URL — result of keyframe/video generation @deprecated Use generatedVideoAsset */
    generatedVideo?: string;
    /** GeneratedAsset reference (ADR-4 — replaces generatedImage) */
    generatedAsset?: import('./generated-asset').GeneratedImage;
    /** GeneratedAsset reference for video (ADR-4 — replaces generatedVideo) */
    generatedVideoAsset?: import('./generated-asset').GeneratedVideo;
    generationStatus: ShotGenerationStatus;
    generationHistory: GeneratedImageVersion[];
    /** Script dialogue line */
    dialogue?: string;
    /** Voice-over text */
    voiceOver?: string;
    /** Sound effect cue */
    soundCue?: string;
    /** Structured OCR/dialogue/narration/caption text cues projected from StoryboardTable. */
    textCues?: readonly StoryboardTextCue[];
    /** Structured voice/dialogue cues with speaker and voice asset bindings. */
    voiceCues?: readonly StoryboardVoiceCue[];
    /** Semantic prompt-first storyboard authority for image/video/voice prompt authoring. */
    storyboardPrompt?: CanvasStoryboardPromptState;
    /** @deprecated Migration/import input only. Use storyboardPrompt prompt documents as authority. */
    generationPrompt?: string;
    /** Provider-neutral prompt slots imported from Creative Tables. */
    promptSlots?: readonly CanvasCreativePromptSlot[];
    /** Canonical Storyboard revision projected into this shot. */
    sourceStoryboardRevisionId?: string;
    /** Canvas is a projection and does not become a second Storyboard authority. */
    storyboardProjectionMode?: 'read-only-projection';
    /** Visual style directive (e.g. "noir", "cyberpunk") */
    visualStyle?: string;
    /** Reference image asset path from [[REF: path]] */
    referenceImagePath?: string;
    /** Runtime-safe document resource backing the reference image, when imported from a document. */
    referenceImageResourceRef?: DocumentArchiveResourceRef;
    /** Stable unified cache resource identity for the reference image. */
    referenceResourceRef?: ResourceRef;
    /** Runtime-only webview URI/path materialized from referenceImageResourceRef. Not persisted. */
    runtimeReferenceImagePath?: string;
    /** Visual effects cues */
    vfx?: string[];
    /** Source/reference media refs used to derive this shot. */
    sourceMediaRefs?: readonly StoryboardMediaRef[];
    /** Media refs generated from this shot. */
    generatedMediaRefs?: readonly StoryboardMediaRef[];
    /** Additional storyboard media refs retained for review and diagnostics. */
    mediaRefs?: readonly StoryboardMediaRef[];
    /** Comic-to-animation image preparation plan attached to this shot for review/execution. */
    shotImagePrepPlan?: import('./shot-image-prep').ShotImagePrepPlan;
    /** Review-only visual evidence refs projected from host-side semantic indexing. */
    visualOccurrences?: readonly VisualOccurrence[];
    /** Review-only candidate character bindings projected from host-side entity/memory matching. */
    characterCandidates?: readonly ShotCharacterCandidate[];
    /** Review-only continuity diagnostics for this shot's current story position. */
    continuityDiagnostics?: readonly ComicAnimationDiagnostic[];
    /** Review-only batch approval/execution envelope for this shot or its scene. */
    batchExecutionPlan?: BatchExecutionPlan;
    /** Last successful storyboard import into neko-cut timeline */
    lastImportedToTimelineAt?: number;
    /** Target project name used during the last storyboard import */
    lastImportedToTimelineProject?: string;
    /**
     * Phase 6.3 — NkPlan id that produced or currently owns this shot.
     * Set when the shot was created through Workflow Orchestration
     * (PlanBuilder → batch-generate / render-engine stage).  Optional so
     * manually-authored shots remain schema-compatible.  Read by timeline
     * import to stamp EngineElement.lineage.planId.
     */
    workflowPlanId?: string;
  };
}

/**
 * Scene group node - semantic container for a sequence of ShotNodes
 */
export interface SceneGroupCanvasNode extends CanvasNodeBase {
  type: 'scene';
  data: {
    /** Stable script scene ID binding (populated on storyboard import) */
    sceneId?: string;
    /** Source script URI that produced this scene binding, when imported from Story. */
    sourceScriptUri?: string;
    sceneTitle: string;
    sceneNumber: number;
    location?: string;
    timeOfDay?: string;
    /** Scene-scoped semantic prompt authority, especially continuous video generation prompts. */
    storyboardPrompt?: CanvasStoryboardPromptState;
    /** Provider-neutral scene prompt slots imported from Creative Tables. */
    promptSlots?: readonly CanvasCreativePromptSlot[];
    /** Canonical Storyboard revision projected into this scene container. */
    sourceStoryboardRevisionId?: string;
    /** Canvas is a projection and does not become a second Storyboard authority. */
    storyboardProjectionMode?: 'read-only-projection';
  };
}

/** Gallery preset layout */
export type GalleryPreset =
  | 'character-3view'
  | 'character-4view'
  | 'expression-9'
  | 'turnaround-8'
  | 'scene-views'
  | 'custom';

/**
 * Gallery node - multi-view character reference sheet (3-view, 9-expression, etc.)
 */
export interface CharacterProfile {
  description?: string;
  tags?: string[];
  referenceAssetId?: string;
}

export interface GalleryCanvasNode extends CanvasNodeBase {
  type: 'gallery';
  data: {
    preset: GalleryPreset;
    rows: number;
    cols: number;
    globalPromptPrefix?: string;
    characterId?: string;
    characterName?: string;
    characterProfile?: CharacterProfile;
  };
}

// =============================================================================
// Content Reference Nodes (script / document / model / canvas-embed)
// =============================================================================

/** A scene entry returned by the retained Fountain content index. */
export interface ScriptScene {
  id: string;
  title: string;
  lineStart: number;
  lineEnd: number;
}

/**
 * Script node - TOC-mode reference to a .fountain screenplay
 */
export interface ScriptCanvasNode extends CanvasNodeBase {
  type: 'script';
  data: {
    /** Relative or absolute path to script file */
    scriptPath: string;
    scriptTitle: string;
    /** Scene list from getScriptIndex() — structure only, no full text */
    scenes: ScriptScene[];
    /** Linked SceneGroupNode id for scene → shot navigation */
    linkedSceneGroupId?: string;
  };
}

/**
 * Document node - thumbnail preview for PDF/DOCX/EPUB files
 */
export interface DocumentCanvasNode extends CanvasNodeBase {
  type: 'document';
  data: {
    /** Portable source path. Empty when a stable resource reference owns the source. */
    docPath: string;
    docType: 'pdf' | 'docx' | 'epub' | 'cbz' | 'markdown' | 'text' | 'file';
    title: string;
    mimeType?: string;
    documentResourceRef?: DocumentArchiveResourceRef;
    resourceRef?: ResourceRef;
    /** Base64 cover thumbnail */
    thumbnailData?: string;
    provenance?: CanvasSerializableRecord;
  };
}

export type CanvasTextDocumentType = Extract<
  DocumentCanvasNode['data']['docType'],
  'markdown' | 'text'
>;

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
 * Model node - AI model reference card or workflow connector
 */
export interface ModelCanvasNode extends CanvasNodeBase {
  type: 'model';
  data: {
    modelPath: string;
    modelName: string;
    modelType: 'lora' | 'checkpoint' | 'controlnet' | 'vae';
    /** reference: info card; workflow: has output port → connects to ShotNode */
    role: 'reference' | 'workflow';
    installedVersion?: string;
  };
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
  };
}

/**
 * Project node — reference to a retained .nkv project file
 */
export interface ProjectCanvasNode extends CanvasNodeBase {
  type: 'project';
  data: {
    projectPath: string;
    projectTitle: string;
    projectType: NkProjectType;
    thumbnailData?: string;
  };
}

/**
 * Generic node shape for built-in subsystem nodes before their domain-specific
 * data interfaces are introduced.
 */
export interface RegisteredCanvasNode extends CanvasNodeBase {
  type: RegisteredCanvasNodeType;
  data: CanvasSerializableRecord;
}

/**
 * Union type of all canvas node types
 */
export type CanvasNode =
  | MediaCanvasNode
  | StoryboardCanvasNode
  | AnnotationCanvasNode
  | GroupCanvasNode
  | TextCanvasNode
  | ArtboardCanvasNode
  | TableCanvasNode
  | ShotCanvasNode
  | SceneGroupCanvasNode
  | GalleryCanvasNode
  | ScriptCanvasNode
  | DocumentCanvasNode
  | ModelCanvasNode
  | CanvasEmbedCanvasNode
  | ProjectCanvasNode
  | RegisteredCanvasNode;

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
  type?: ConnectionType;
  /** Optional label on the connection */
  label?: string;
  /** Canonical source endpoint for node/port/block/field references. */
  sourceEndpoint: CanvasConnectionEndpoint;
  /** Canonical target endpoint for node/port/block/field references. */
  targetEndpoint: CanvasConnectionEndpoint;
  /** Optional subsystem extension data. Edge ownership remains top-level. */
  extension?: CanvasSerializableRecord;
  /** Narrative choice label rendered on branch connections. */
  choiceText?: string;
  /** Subsystem condition expression for narrative or behavior connections. */
  condition?: string;
  /** Priority used by default path or transition ordering. */
  priority?: number;
  /** Memory association weight. */
  weight?: number;
  /** Memory association decay factor. */
  decay?: number;
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
// Subsystem Metadata
// =============================================================================

export type {
  NarrativeEndingMetadata,
  NarrativeMetadata,
  NarrativeSceneMetadata,
  NarrativeVariable,
  StoryGenre,
  VariableEffect,
};

export interface BlackboardVariable {
  id: string;
  name: string;
  value: CanvasSerializableValue;
}

export interface BehaviorMetadata {
  rootNodeId?: string;
  blackboard: BlackboardVariable[];
}

export type EntityGraphScope = 'character' | 'scene' | 'object' | 'location' | 'style';

export interface EntityGraphMetadata {
  entityScope: EntityGraphScope[];
  bindingSource: string;
}

export interface MemoryGraphTimeRange {
  start: string;
  end: string;
}

export interface MemoryGraphMetadata {
  queryContext?: string;
  timeRange?: MemoryGraphTimeRange;
}

// =============================================================================
// Canvas Data (File Format)
// =============================================================================

/**
 * Canvas data structure - persisted to .nkc file
 */
export interface CanvasData {
  /** File format version */
  version: string;
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
  /** Optional durable navigation refs to related Canvas boards. */
  relatedBoards?: readonly CanvasRelatedBoardRef[];
  /** Narrative subsystem metadata. */
  narrative?: NarrativeMetadata;
  /** Behavior subsystem metadata. */
  behavior?: BehaviorMetadata;
  /** Entity graph subsystem metadata. */
  entityGraph?: EntityGraphMetadata;
  /** Memory graph subsystem metadata. */
  memoryGraph?: MemoryGraphMetadata;
  /** Optional Canvas playback projection metadata. */
  playback?: CanvasPlaybackMetadata;
}

// =============================================================================
// Canvas Constants
// =============================================================================

/** Current canvas file format version */
export const CANVAS_VERSION = '2.1';

/** Default canvas data for new files */
export const DEFAULT_CANVAS_DATA: CanvasData = {
  version: CANVAS_VERSION,
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

export function isStoryboardNode(node: CanvasNode): node is StoryboardCanvasNode {
  return node.type === 'storyboard';
}

export function isAnnotationNode(node: CanvasNode): node is AnnotationCanvasNode {
  return node.type === 'annotation';
}

export function isGroupNode(node: CanvasNode): node is GroupCanvasNode {
  return node.type === 'group';
}

export function isTextNode(node: CanvasNode): node is TextCanvasNode {
  return node.type === 'text';
}

export function isArtboardNode(node: CanvasNode): node is ArtboardCanvasNode {
  return node.type === 'artboard';
}

export function isShotNode(node: CanvasNode): node is ShotCanvasNode {
  return node.type === 'shot';
}

export function isSceneGroupNode(node: CanvasNode): node is SceneGroupCanvasNode {
  return node.type === 'scene';
}

export function isGalleryNode(node: CanvasNode): node is GalleryCanvasNode {
  return node.type === 'gallery';
}

export function isScriptNode(node: CanvasNode): node is ScriptCanvasNode {
  return node.type === 'script';
}

export function isDocumentNode(node: CanvasNode): node is DocumentCanvasNode {
  return node.type === 'document';
}

export function isModelNode(node: CanvasNode): node is ModelCanvasNode {
  return node.type === 'model';
}

export function isCanvasEmbedNode(node: CanvasNode): node is CanvasEmbedCanvasNode {
  return node.type === 'canvas-embed';
}

// =============================================================================
// Port Helpers
// =============================================================================

/** Default ports for media nodes */
export const MEDIA_NODE_PORTS: PortDefinition[] = [
  { id: 'out', type: 'output', position: 'right', dataType: 'any', label: 'Output' },
];

/** Default ports for storyboard nodes */
export const STORYBOARD_NODE_PORTS: PortDefinition[] = [
  { id: 'in', type: 'input', position: 'left', dataType: 'any', label: 'Input' },
  { id: 'out', type: 'output', position: 'right', dataType: 'any', label: 'Output' },
];

/** Default ports for annotation nodes. Empty means node-level endpoint handles are used. */
export const ANNOTATION_NODE_PORTS: PortDefinition[] = [];

/** Default ports for group nodes */
export const GROUP_NODE_PORTS: PortDefinition[] = [
  { id: 'in', type: 'input', position: 'left', dataType: 'any', label: 'Input' },
  { id: 'out', type: 'output', position: 'right', dataType: 'any', label: 'Output' },
];

/** Shot node: output image port for IP-Adapter reference */
export const SHOT_NODE_PORTS: PortDefinition[] = [
  { id: 'img-out', type: 'output', position: 'right', dataType: 'image', label: 'Image' },
];

/** Scene group node: pass-through ports */
export const SCENE_NODE_PORTS: PortDefinition[] = [
  { id: 'in', type: 'input', position: 'left', dataType: 'any', label: 'Input' },
  { id: 'out', type: 'output', position: 'right', dataType: 'any', label: 'Output' },
];

/** Gallery node: output image port (cell images → IP-Adapter) */
export const GALLERY_NODE_PORTS: PortDefinition[] = [
  { id: 'img-out', type: 'output', position: 'right', dataType: 'image', label: 'Reference' },
];

/** Model node (workflow role): output port → ShotNode model selector */
export const MODEL_WORKFLOW_PORTS: PortDefinition[] = [
  { id: 'model-out', type: 'output', position: 'right', dataType: 'any', label: 'Model' },
];

/**
 * Get default ports for a node type.
 * Returns empty array for types that use node-level endpoints.
 */
export function getDefaultPorts(nodeType: CanvasNodeType): PortDefinition[] {
  switch (nodeType) {
    case 'media':
      return MEDIA_NODE_PORTS;
    case 'storyboard':
      return STORYBOARD_NODE_PORTS;
    case 'annotation':
      return ANNOTATION_NODE_PORTS;
    case 'group':
      return GROUP_NODE_PORTS;
    case 'shot':
      return SHOT_NODE_PORTS;
    case 'scene':
      return SCENE_NODE_PORTS;
    case 'gallery':
      return GALLERY_NODE_PORTS;
    // text, artboard, script, document, canvas-embed: no default ports
    default:
      return [];
  }
}

// =============================================================================
// Rich Content Constants
// =============================================================================

export const DEFAULT_TEXT_STYLE: Required<TextNodeStyle> = {
  fontSize: 14,
  fontWeight: 'normal',
  color: '#e5e5e5',
  backgroundColor: 'transparent',
  textAlign: 'left',
  lineHeight: 1.5,
  padding: 12,
};

export const ARTBOARD_PRESETS: Record<
  ArtboardPreset,
  { width: number; height: number; label: string }
> = {
  custom: { width: 800, height: 600, label: 'Custom' },
  '1080p': { width: 1920, height: 1080, label: '1080p (16:9)' },
  '4k': { width: 3840, height: 2160, label: '4K (16:9)' },
  instagram: { width: 1080, height: 1080, label: 'Instagram (1:1)' },
  story: { width: 1080, height: 1920, label: 'Story (9:16)' },
  youtube: { width: 1280, height: 720, label: 'YouTube (16:9)' },
};

/** Pre-defined gallery presets with layout and cell labels */
export const GALLERY_PRESET_CONFIGS: Record<
  GalleryPreset,
  { rows: number; cols: number; labels: string[] }
> = {
  'character-3view': { rows: 1, cols: 3, labels: ['正面', '侧面', '背面'] },
  'character-4view': { rows: 1, cols: 4, labels: ['正面', '3/4 正面', '侧面', '背面'] },
  'expression-9': {
    rows: 3,
    cols: 3,
    labels: ['开心', '悲伤', '愤怒', '恐惧', '惊讶', '厌恶', '平静', '轻蔑', '困惑'],
  },
  'turnaround-8': {
    rows: 2,
    cols: 4,
    labels: ['0°', '45°', '90°', '135°', '180°', '225°', '270°', '315°'],
  },
  'scene-views': { rows: 1, cols: 3, labels: ['全景', '中景', '特写'] },
  custom: { rows: 2, cols: 2, labels: [] },
};

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
