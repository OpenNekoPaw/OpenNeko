/**
 * Extension API Types
 *
 * Defines the public API interfaces that Neko extensions export
 * for inter-extension communication via VSCode Extension API.
 *
 * Usage:
 * - neko-cut exports NekoCutAPI
 * - neko-canvas exports NekoCanvasAPI
 * - neko-agent discovers and calls these APIs via vscode.extensions.getExtension()
 */

import type {
  CanvasNode,
  CanvasNodeType,
  ShotCanvasNode,
  SceneGroupCanvasNode,
  GalleryCanvasNode,
} from './canvas';
import type {
  CanvasAgentActiveContextRequest,
  CanvasAgentActiveContextResult,
  CanvasAgentApplyContentResult,
  CanvasAgentContentPayload,
  CanvasAgentProvenance,
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasCreateConnectionRequest,
  CanvasCreateConnectionResult,
  CanvasDeriveNodeRequest,
  CanvasDeriveNodeResult,
  CanvasExtractStructuredContentRequest,
  CanvasExtractStructuredContentResult,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
} from './canvas-agent-operations';
import type {
  CanvasWorkspaceProjectionRequest,
  CanvasWorkspaceProjectionResult,
} from './canvas-workspace-board';
import type { CanvasHeadlessAuthoringTarget } from './canvas-headless-authoring';
import type {
  CanvasMarkdownCapabilityInput,
  CanvasMarkdownCapabilityResult,
} from './canvas-markdown-capabilities';
import type { CanvasCutDraftPayload } from './canvas-cut-draft';
import type { CanvasCutDraftDiagnostic } from './canvas-cut-draft';
import type { CanvasTimelineSyncPayload } from './canvas-timeline-sync';
import type { CanvasPlaybackPlan, CanvasPlaybackRouteCandidate } from './canvas-playback';
import type { ProjectData } from './project';
import type {
  ApplyCanvasStoryboardOptions,
  CanvasStoryboardPayload,
  CreatedCanvasStoryboard,
} from './storyboard-planner';
import type { StoryScenePlan, StoryShotPlan } from './storyboard-planner';
import type {
  CanvasStoryboardExecutionSummary,
  CanvasStoryboardExecutionSummaryRequest,
} from './storyboard-readiness';
import type { CharacterRegistryFile, CharacterRecord } from './character-registry';
import type {
  SketchAIContextSnapshot,
  SketchAIContextSnapshotRequest,
  SketchAIImageResultRequest,
  SketchAIProgressMessage,
} from './sketch-ai';
import type { NekoModelAPI } from './model-agent-api';
import type { DocumentArchiveResourceRef } from './document-reading';
import type { SkillCatalogMeta } from './skill';
import type { ProjectSearchVisualResource } from './project-cache-search';
import type { ResourceRef, ResourceVariantRequest } from './resource-cache';

export interface NekoDisposableLike {
  dispose(): void;
}

export type NekoEventLike<T> = (listener: (event: T) => void) => NekoDisposableLike;

// =============================================================================
// NekoEngine API
// =============================================================================

export type NekoEngineRuntimeState = 'idle' | 'starting' | 'ready' | 'error';

export interface NekoEngineConnectionEndpoint {
  /** Host clients should use for local HTTP/WebSocket checks. */
  readonly host: string;
  /** Bound HTTP/WebSocket frame server port. */
  readonly port: number;
  /** Human-readable endpoint, e.g. "127.0.0.1:43123". */
  readonly address: string;
  /** Base HTTP URL for diagnostics and preview clients. */
  readonly url: string;
}

export interface NekoEngineRuntimeStatus {
  readonly state: NekoEngineRuntimeState;
  readonly endpoint?: NekoEngineConnectionEndpoint;
  readonly health?: 'unknown' | 'healthy' | 'unhealthy';
}

// =============================================================================
// NekoCut API
// =============================================================================

/**
 * Timeline element configuration for adding new elements
 */
export interface TimelineElementConfig {
  type: 'video' | 'audio' | 'image' | 'text' | 'shape' | 'subtitle';
  trackId: string;
  startTime: number;
  duration: number;
  source?: string;
  [key: string]: unknown;
}

/**
 * Timeline element update payload
 */
export interface TimelineElementUpdate {
  startTime?: number;
  duration?: number;
  source?: string;
  [key: string]: unknown;
}

/**
 * Timeline information
 */
export interface TimelineInfo {
  documentUri: string;
  projectRevision: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  trackCount: number;
}

export interface CutTimelineRevealRequest {
  readonly projectUri?: string;
  readonly sequenceId?: string;
  readonly clipId?: string;
}

export interface CutCanvasDraftImportResult {
  readonly accepted: boolean;
  readonly status: 'imported' | 'rejected' | 'failed' | 'unavailable' | 'timeout' | 'post-failed';
  readonly projectUri?: string;
  readonly syncPayload?: CanvasTimelineSyncPayload;
  readonly diagnostics?: readonly CanvasCutDraftDiagnostic[];
  readonly error?: string;
}

/**
 * Timeline element representation (for API response)
 */
export interface NekoCutTimelineElement {
  id: string;
  type: string;
  trackId: string;
  startTime: number;
  duration: number;
  source?: string;
  [key: string]: unknown;
}

export interface CutTimelineDocumentTarget {
  readonly documentUri: string;
  readonly expectedProjectRevision?: string;
}

export interface CutTimelineCanvasDraftImportRequest extends CutTimelineDocumentTarget {
  readonly payload: CanvasCutDraftPayload;
}

export interface CutProjectAuthoringCreateOptions {
  readonly name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
}

export interface CutProjectAuthoringImportGeneratedClipRequest {
  readonly target: import('../project-authoring').NekoProjectAuthoringTarget;
  readonly expectedProjectRevision?: string;
  readonly sourcePath?: string;
  readonly bytes?: Uint8Array;
  readonly name?: string;
  readonly mediaType?: 'video' | 'audio' | 'image';
  readonly duration?: number;
  readonly startTime?: number;
  readonly trackId?: string;
  readonly trackIndex?: number;
  readonly requestId?: string;
  readonly createProjectOptions?: CutProjectAuthoringCreateOptions;
}

export interface CutProjectAuthoringImportedClip {
  readonly sourcePath: string;
  readonly mediaType: 'video' | 'audio' | 'image';
  readonly trackId: string;
  readonly elementId: string;
  readonly createdTrack: boolean;
  readonly startTime: number;
  readonly duration: number;
}

export interface NekoCutAuthoringAPI {
  importGeneratedClip(
    request: CutProjectAuthoringImportGeneratedClipRequest,
  ): Promise<
    import('../project-authoring').NekoProjectAuthoringResult<CutProjectAuthoringImportedClip>
  >;
}

/**
 * NekoCut Extension API
 * Exported by neko-cut extension for timeline manipulation
 */
export interface NekoCutAPI {
  /** Package-owned structural, review-render, runtime, and export-readiness facade for .nkv projects. */
  readonly projectQuality: import('../project-authoring/project-quality').ProjectQualityFacade;
  /** Explicit-target, Webview-independent durable .nkv authoring. */
  readonly authoring: NekoCutAuthoringAPI;

  timeline: {
    /**
     * Get information about the current timeline
     */
    getInfo(target: CutTimelineDocumentTarget): Promise<TimelineInfo>;

    /**
     * Add a new element to the timeline
     * @returns The ID of the created element
     */
    addElement(target: CutTimelineDocumentTarget, config: TimelineElementConfig): Promise<string>;

    /**
     * Update an existing timeline element
     */
    updateElement(
      target: CutTimelineDocumentTarget,
      id: string,
      updates: TimelineElementUpdate,
    ): Promise<void>;

    /**
     * Delete an element from the timeline
     */
    deleteElement(target: CutTimelineDocumentTarget, id: string): Promise<void>;

    /**
     * List all elements in the timeline
     */
    listElements(target: CutTimelineDocumentTarget): Promise<NekoCutTimelineElement[]>;

    /**
     * Reveal the owning Cut timeline surface. Playback and timeline focus stay in Cut.
     */
    reveal(request: CutTimelineRevealRequest & { readonly projectUri: string }): Promise<boolean>;

    /**
     * Import a Canvas route snapshot into an explicitly identified Cut project.
     */
    importCanvasDraft(
      request: CutTimelineCanvasDraftImportRequest,
    ): Promise<CutCanvasDraftImportResult>;
  };
}

// =============================================================================
// NekoCanvas API
// =============================================================================

/**
 * Asset filter options
 */
export interface AssetFilter {
  type?: 'video' | 'audio' | 'image' | 'text' | 'other';
  search?: string;
}

/**
 * Asset representation
 */
export interface Asset {
  id: string;
  name: string;
  type: string;
  path: string;
  thumbnail?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Canvas configuration for creation
 */
export interface CanvasConfig {
  name: string;
  width: number;
  height: number;
  backgroundColor?: string;
}

/**
 * Shape configuration for canvas
 */
export interface ShapeConfig {
  type: 'rectangle' | 'ellipse' | 'polygon' | 'path' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  [key: string]: unknown;
}

/** Partial update data for canvas nodes managed by the agent */
export type CanvasNodeUpdateData =
  | Partial<ShotCanvasNode['data']>
  | Partial<SceneGroupCanvasNode['data']>
  | Partial<GalleryCanvasNode['data']>;

export interface CanvasImportAssetRequest {
  readonly path?: string;
  readonly type?: 'image' | 'video' | 'audio' | 'model';
  readonly name?: string;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
  readonly resourceRef?: ResourceRef;
  readonly target?: CanvasHeadlessAuthoringTarget;
  readonly position?: { readonly x: number; readonly y: number };
  readonly provenance?: CanvasAgentProvenance;
}

export interface CanvasImportAssetResult {
  readonly documentUri: string;
  readonly nodeId: string;
  readonly mediaType: 'image' | 'video' | 'audio';
}

export interface CanvasProjectAuthoringImportAssetRequest {
  readonly target: import('../project-authoring').NekoProjectAuthoringTarget;
  readonly asset: Omit<CanvasImportAssetRequest, 'target'>;
}

export interface CanvasProjectAuthoringImportAssetResult extends CanvasImportAssetResult {
  readonly projectRef: import('./media-quality').QualityProjectRef;
}

export interface NekoCanvasAuthoringAPI {
  importAsset(
    request: CanvasProjectAuthoringImportAssetRequest,
  ): Promise<CanvasProjectAuthoringImportAssetResult>;
}

export interface CanvasPlaybackRevealWorkspaceRequest {
  readonly sourceCanvasUri?: string;
  readonly routeId?: string;
  readonly unitId?: string;
}

export interface CanvasPlaybackCreateCutDraftRequest {
  readonly sourceCanvasUri?: string;
  readonly routeId?: string;
  readonly projectName?: string;
}

export interface CanvasPlaybackReorderUnitsRequest {
  readonly sourceCanvasUri?: string;
  readonly routeId?: string;
  readonly orderedUnitIds: readonly string[];
  readonly approvalContext?: 'explicit-user-instruction' | 'agent-confirmed' | 'agent-inferred';
  readonly instructionText?: string;
}

export interface CanvasPlaybackReorderUnitsResult {
  readonly changed: boolean;
  readonly routeId?: string;
  readonly sourceCanvasUri?: string;
  readonly orderedUnitIds: readonly string[];
  readonly plan: CanvasPlaybackPlan;
}

/**
 * Fired when an asset is added, updated, or removed from the canvas asset library.
 * Distinct from the asset-registry AssetChangeEvent to avoid naming conflicts.
 */
export interface NekoCanvasAssetChangeEvent {
  readonly type: 'add' | 'update' | 'delete';
  readonly assetId: string;
}

/**
 * Fired when nodes or shapes on the active canvas change.
 */
export interface CanvasChangeEvent {
  readonly type: 'add' | 'update' | 'delete';
  readonly nodeId?: string;
  readonly nodeIds?: string[];
  readonly shapeId?: string;
  readonly documentUri?: string;
  readonly entityType?: 'node' | 'connection' | 'selection' | 'generation' | 'import' | 'operation';
  readonly reason?: string;
  readonly operationType?: string;
  readonly sourceScriptUri?: string;
  readonly storyboardImport?: CreatedCanvasStoryboard;
}

/**
 * NekoCanvas Extension API
 * Exported by neko-canvas extension for asset and canvas manipulation
 */
export interface NekoCanvasAPI {
  asset: {
    /**
     * Import an asset into the project asset library.
     * This namespace is a proxy to neko-assets; canvas is not the asset source of truth.
     */
    import(path: string): Promise<Asset>;

    /**
     * List assets through the neko-assets proxy.
     */
    list(filter?: AssetFilter): Promise<Asset[]>;

    /**
     * Get an asset by ID through the neko-assets proxy.
     */
    getById(id: string): Promise<Asset | null>;
  };

  /**
   * Import media/resource facts into a Canvas document through headless authoring.
   */
  importAsset(asset: CanvasImportAssetRequest): Promise<CanvasImportAssetResult>;

  /** Explicit-target, Webview-independent durable .nkc authoring. */
  readonly authoring: NekoCanvasAuthoringAPI;

  /** Canvas-owned durable Workspace Board projection. */
  readonly boards: {
    project(input: CanvasWorkspaceProjectionRequest): Promise<CanvasWorkspaceProjectionResult>;
  };

  canvas: {
    /**
     * Create a new canvas
     * @returns The ID of the created canvas
     */
    create(config: CanvasConfig): Promise<string>;

    /**
     * Add a shape to a canvas
     * @returns The ID of the created shape
     */
    addShape(canvasId: string, shape: ShapeConfig): Promise<string>;
  };

  storyboard: {
    /**
     * Import a storyboard payload into the active canvas as scene/shot nodes.
     */
    import(
      payload: CanvasStoryboardPayload,
      options?: ApplyCanvasStoryboardOptions,
    ): Promise<CreatedCanvasStoryboard>;

    /**
     * Return a read-only scene/shot execution summary for Story and Agent consumers.
     */
    getExecutionSummary(
      request?: CanvasStoryboardExecutionSummaryRequest,
    ): Promise<CanvasStoryboardExecutionSummary>;
  };

  markdown: {
    /**
     * Invoke a Canvas-owned Markdown capability. Callers provide Markdown,
     * stable resource refs, target, and intent; Canvas owns validation and
     * node creation.
     */
    invoke(input: CanvasMarkdownCapabilityInput): Promise<CanvasMarkdownCapabilityResult>;
  };

  playback: {
    /**
     * Return the current Canvas playback plan projection. This is derived data, not Agent-owned state.
     */
    getPlan(sourceCanvasUri?: string): Promise<CanvasPlaybackPlan>;

    /**
     * Return effective route candidates derived from the current Canvas playback plan.
     */
    getRoutes(sourceCanvasUri?: string): Promise<readonly CanvasPlaybackRouteCandidate[]>;

    /**
     * Reveal the same-Webview Canvas PlaybackWorkspace.
     */
    revealWorkspace(request?: CanvasPlaybackRevealWorkspaceRequest): Promise<boolean>;

    /**
     * Project a selected Canvas route into a one-way Cut draft snapshot.
     */
    createCutDraftFromRoute(
      request?: CanvasPlaybackCreateCutDraftRequest,
    ): Promise<CanvasCutDraftPayload>;

    /**
     * Reorder Canvas playback units through Canvas graph commands, then return the reprojected plan.
     */
    reorderUnits(
      request: CanvasPlaybackReorderUnitsRequest,
    ): Promise<CanvasPlaybackReorderUnitsResult>;
  };

  nodes: {
    /**
     * List all nodes on the active canvas, optionally filtered by type
     */
    list(type?: CanvasNodeType): Promise<CanvasNode[]>;

    /**
     * Get a single node by ID
     */
    get(nodeId: string): Promise<CanvasNode | undefined>;

    /**
     * Update a node's data fields
     */
    update(nodeId: string, data: CanvasNodeUpdateData): Promise<void>;

    /**
     * Create a new node at the given canvas position
     * @returns The ID of the created node
     */
    create(
      type: CanvasNodeType,
      position: { x: number; y: number },
      data: object,
      preset?: string,
    ): Promise<string>;

    /**
     * Derive a successor node from an existing node through registered preset rules.
     */
    derive(request: CanvasDeriveNodeRequest): Promise<CanvasDeriveNodeResult>;

    /**
     * Create a directed connection between existing Canvas nodes.
     */
    createConnection(request: CanvasCreateConnectionRequest): Promise<CanvasCreateConnectionResult>;

    /**
     * Create a container and its child nodes as one logical canvas mutation.
     */
    createComposite(request: CanvasCreateCompositeRequest): Promise<CanvasCreateCompositeResult>;

    /**
     * Update data bound by a composable block or explicit JSON Pointer path.
     */
    updateBlock(request: CanvasUpdateBlockRequest): Promise<CanvasUpdateBlockResult>;

    /**
     * Extract selected node content as JSON, markdown, or prompt-oriented text.
     */
    extractStructuredContent(
      request: CanvasExtractStructuredContentRequest,
    ): Promise<CanvasExtractStructuredContentResult>;

    /**
     * Return compact, read-only active Canvas context for Agent planning.
     */
    getActiveContext(
      request?: CanvasAgentActiveContextRequest,
    ): Promise<CanvasAgentActiveContextResult>;

    /**
     * Apply Agent-generated text, prompt, or structured content to a validated Canvas target.
     */
    applyAgentContent(payload: CanvasAgentContentPayload): Promise<CanvasAgentApplyContentResult>;

    /**
     * Trigger Canvas-owned typed image generation for a ShotNode.
     */
    generateImage(nodeId: string, childNodeId?: string): Promise<void>;

    /**
     * Trigger batch image generation for multiple nodes
     */
    generateBatch(nodeIds: string[]): Promise<void>;

    /**
     * Fired whenever the canvas selection changes.
     * Ambient context listener for neko-agent.
     */
    onSelectionChange: NekoEventLike<CanvasNode[]>;
  };

  /**
   * Cross-extension event subscriptions.
   * neko-agent subscribes to these to track canvas state for ambient context.
   */
  events: {
    /**
     * Fired whenever an asset is added, updated, or deleted in the project library.
     */
    onDidChangeAssets: NekoEventLike<NekoCanvasAssetChangeEvent>;

    /**
     * Fired whenever nodes or shapes on the active canvas are added, updated, or deleted.
     */
    onDidChangeCanvas: NekoEventLike<CanvasChangeEvent>;
  };
}

// =============================================================================
// NekoStory API
// =============================================================================

/**
 * Structured representation of a scene in a Fountain screenplay.
 * `line_start` / `line_end` are 0-based line numbers enabling
 * `Read(offset=line_start, limit=line_end-line_start+1)` access patterns.
 */
export interface NekoStorySceneEntry {
  /** Stable scene ID derived from semantic content, not raw line numbers alone */
  readonly id: string;
  /** Backward-compatible full heading text, e.g. "INT. OFFICE - DAY" */
  readonly heading: string;
  /** Stable scene ID exposed explicitly for new consumers */
  readonly sceneId: string;
  /** Normalized scene title, same semantic value as heading */
  readonly sceneTitle: string;
  readonly intExt: string | null;
  /** Canonical time-of-day field for new consumers */
  readonly timeOfDay: string | null;
  readonly location: string;
  /** Backward-compatible alias of timeOfDay */
  readonly time: string | null;
  /** Explicit scene number if present in Fountain heading, else null */
  readonly sceneNumber: string | null;
  /** Character names that appear in this scene */
  readonly sceneCharacters: readonly string[];
  /** Short scene-level summary derived from action blocks */
  readonly actionSummary: string;
  /** Estimated scene duration in seconds */
  readonly estimatedDuration: number;
  /** Structured directives from [[KEY: value]] notes within this scene */
  readonly directives: readonly {
    readonly category: string;
    readonly key: string;
    readonly value: string;
  }[];
  readonly line_start: number;
  readonly line_end: number;
}

/**
 * Aggregated character information within a single Fountain file.
 */
export interface NekoStoryCharacterEntry {
  readonly name: string;
  readonly first_line: number;
  readonly scene_ids: readonly string[];
}

/**
 * Agent-accessible structured representation of a Fountain screenplay file.
 */
export interface NekoStoryScriptIndex {
  readonly uri: string;
  readonly total_lines: number;
  readonly scenes: readonly NekoStorySceneEntry[];
  readonly characters: readonly NekoStoryCharacterEntry[];
}

/**
 * Minimal structural representation of a parsed Fountain document.
 * Returned by NekoStoryAPI.parseScript — consumers iterate elements for
 * headings, action lines, dialogue, etc.
 */
export interface NekoStoryParsedScript {
  readonly title?: string;
  readonly elements: ReadonlyArray<{
    readonly type: string;
    readonly text: string;
    readonly [key: string]: unknown;
  }>;
}

/**
 * Result of converting a Fountain screenplay to a neko-cut ProjectData timeline.
 * Returned by NekoStoryAPI.convertToTimeline.
 */
export interface NekoStoryConversionResult {
  /** The generated ProjectData ready to be saved as a .nkv file */
  readonly project: ProjectData;
  /** Number of scene headings found */
  readonly sceneCount: number;
  /** Total estimated timeline duration in seconds */
  readonly totalDurationSec: number;
  /** Deduplicated character names (upper-case) */
  readonly characterNames: readonly string[];
}

export interface NekoStoryResolvedCharacter {
  readonly record: CharacterRecord;
  readonly matchedName: string;
  readonly matchSource: 'canonicalName' | 'displayName' | 'alias' | 'scriptName';
}

/**
 * NekoStory Extension API
 * Exported by neko-story extension for screenplay parsing and index access
 */
export interface NekoStoryAPI {
  /**
   * Parse Fountain screenplay text into a structured document.
   * Useful for inspecting element types before converting to a timeline.
   */
  parseScript(content: string): NekoStoryParsedScript;

  /**
   * Convert a Fountain screenplay to a neko-cut timeline ProjectData.
   * The result's `project` field can be saved directly as a .nkv file.
   */
  convertToTimeline(fountainContent: string, projectName?: string): NekoStoryConversionResult;

  /**
   * Returns a structured ScriptIndex for the given file path or URI string.
   * Returns undefined if the file has not been indexed yet.
   */
  getScriptIndex(uriOrPath: string): NekoStoryScriptIndex | undefined;

  /**
   * Returns every currently indexed Fountain screenplay.
   * Hosts that expose workspace indexing should implement this so terminal
   * reference search can discover scenes without requiring an active editor path.
   */
  getAllScriptIndices?(): readonly NekoStoryScriptIndex[];

  /**
   * Returns the project-level characters.json snapshot for the given file path or URI.
   * When omitted, uses the active workspace folder or the first workspace folder.
   */
  getCharacterRegistry(uriOrPath?: string): CharacterRegistryFile | undefined;

  /**
   * Resolves a character name / alias / script binding against the project registry.
   */
  resolveCharacter(name: string, uriOrPath?: string): NekoStoryResolvedCharacter | undefined;

  /**
   * Builds deterministic scene-level storyboard plans from the indexed screenplay.
   * Returns undefined if the file has not been indexed yet.
   */
  generateScenePlans(
    uriOrPath: string,
    sceneIds?: readonly string[],
  ): readonly StoryScenePlan[] | undefined;

  /**
   * Builds deterministic shot plans for a single scene in the indexed screenplay.
   * Returns undefined if the file or scene has not been indexed yet.
   */
  generateShotPlan(
    uriOrPath: string,
    sceneId: string,
    recommendedShotCount?: number,
  ): readonly StoryShotPlan[] | undefined;
}

// =============================================================================
// NekoSketch API
// =============================================================================

/**
 * Source context for images imported into neko-sketch from other modules.
 * Used to enable round-trip "send back" workflow buttons.
 */
export interface SketchImportContext {
  /** Module that initiated the import */
  source: 'canvas' | 'cut' | 'preview' | 'agent';
  /** Source canvas node ID (ShotNode / GalleryNode) */
  sourceNodeId?: string;
  /** Source cut clip ID */
  sourceClipId?: string;
  /** Additional metadata (prompt, cellId, shotNumber, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Selection state data for AI inpainting operations.
 * Returned by `getSelectionMask()`.
 */
export interface SketchSelectionData {
  /** Bounding box of the selection in canvas coordinates */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Grayscale mask PNG (base64): white = selected, black = unselected */
  mask: string;
  /** Base64 PNG of the composite canvas (used as the source image for inpainting) */
  layerImageData: string;
}

/**
 * NekoSketch Extension API
 * Exported by neko-sketch extension for programmatic canvas access.
 */
export interface NekoSketchAPI {
  /** Package-owned structural, preview, runtime, and export-readiness facade for .nks projects. */
  readonly projectQuality: import('../project-authoring/project-quality').ProjectQualityFacade;

  /**
   * Import an image (base64-encoded PNG/JPEG) into the active sketch canvas
   * as a new raster layer. No-ops silently when no sketch editor is open.
   */
  importImageData(base64: string, name: string): void;

  /**
   * Apply an AI image result through the sketch AI result protocol.
   * The extension host downloads the source asset, converts it to a webview-safe
   * URI, and posts an `ai:resultApply` message to the active editor.
   */
  applyAIImageResult(request: SketchAIImageResultRequest): Promise<boolean>;

  /**
   * Capture current sketch AI context into extension-owned cache files.
   * Returned image references use `fileUri` and are intended for Extension Host
   * / provider side consumption, not direct webview loading.
   */
  createAIContextSnapshot(
    request: SketchAIContextSnapshotRequest,
  ): Promise<SketchAIContextSnapshot | null>;

  /**
   * Delete cached AI files for a run. Implementations should ignore missing
   * files so callers can safely invoke cleanup from success, failure, or cancel
   * paths.
   */
  cleanupAIArtifacts?(runId: string): Promise<void>;

  /**
   * Report AI operation progress to the active sketch webview.
   * Used by capability providers after a media task id is known, so the webview
   * can expose progress and cancellation for long-running tasks.
   */
  reportAIProgress?(message: Omit<SketchAIProgressMessage, 'type'>): Promise<boolean>;

  /**
   * Register a cancellable AI run. The run id should match the media task id
   * whenever possible so UI and logs can correlate progress, cancellation, and
   * result application.
   */
  registerAIRun?(runId: string, cancel: () => Promise<void>): void;

  /** Remove a cancellable AI run registration. */
  unregisterAIRun?(runId: string): void;

  /** Cancel a registered AI run. Returns false when the run is unknown. */
  cancelAIRun?(runId: string): Promise<boolean>;

  /**
   * Import an image with a source context to enable round-trip workflow buttons
   * (Back to Canvas, Send to Timeline). If no sketch editor is currently open,
   * stores the import as pending and injects it once the next editor becomes ready.
   */
  importImageWithContext(base64: string, name: string, context: SketchImportContext): void;

  /**
   * Export the current sketch canvas composite as a base64 PNG.
   * Returns null when no sketch editor is open or canvas data is unavailable.
   */
  exportCanvas(): Promise<string | null>;

  /** Whether a sketch editor is currently open and active. */
  isActive(): boolean;

  /**
   * Get the current rectangular selection mask for AI inpainting.
   * Returns null when there is no active selection in the sketch editor.
   */
  getSelectionMask(): Promise<SketchSelectionData | null>;

  /**
   * Get the pixel data of the specified layer (or the active layer) as base64 PNG.
   * Falls back to the composite canvas when individual layer extraction is unsupported.
   * Returns null when no sketch editor is open.
   */
  getLayerImageData(layerId?: string): Promise<string | null>;

  /**
   * Get the composite canvas image (all visible layers) as base64 PNG.
   * Returns null when no sketch editor is open.
   */
  getCanvasImageData(): Promise<string | null>;
}

// =============================================================================
// NekoPuppet API
// =============================================================================

/**
 * NekoPuppet Extension API
 * Exported by neko-puppet extension for programmatic Live2D/Puppet character parameter access.
 *
 * The standard face parameters are defined in puppet-face-params.ts (32 params).
 * Values are keyed by the stable `PuppetFaceParameter.id` field.
 */
export interface NekoPuppetAPI {
  /** Package-owned structural, preview, runtime, and export-readiness facade for .nkp projects. */
  readonly projectQuality: import('../project-authoring/project-quality').ProjectQualityFacade;

  /**
   * Get the current face parameter values for the active puppet character.
   * Returns a Record keyed by parameter id (e.g. "faceWidth", "eyeOpenL") with numeric values.
   * Returns an empty record when no puppet editor is open.
   */
  getCurrentFaceParams(): Record<string, number>;

  /**
   * Whether a puppet editor/runtime document is active for interactive parameter writes.
   */
  isActive(): boolean;

  /**
   * Set one or more face parameters on the active puppet character.
   * Keys must be valid PuppetFaceParameter ids. Values are clamped to each parameter's [min, max].
   * Throws or fails visibly when no puppet editor/runtime document is active.
   */
  setFaceParams(params: Record<string, number>): Promise<void>;
}

// =============================================================================
// NekoModel API
// =============================================================================

export type { NekoModelAPI };

// =============================================================================
// NekoAssets API
// =============================================================================

/**
 * NekoAssets Extension API
 * Exported by neko-assets extension for programmatic asset library access.
 * Replaces the former command-level proxy pattern (neko.assets.getAllEntities etc.).
 */
export interface NekoAssetsAPI {
  /** Get all asset entities in the library. */
  getAllEntities(): Promise<import('./asset/entity').AssetEntity[]>;

  /**
   * Import a file into the asset library.
   * Returns the created/existing entity and rejects visibly on unavailable source or import failure.
   */
  importFile(uri: { fsPath: string }): Promise<import('./asset/entity').AssetEntity>;

  /** Get the thumbnail file path for a given asset file path. */
  getThumbnailPath(filePath: string): Promise<string | undefined>;

  /** Create a stable resource ref for a media thumbnail without exposing package-local cache paths. */
  createThumbnailResourceRef?(
    filePath: string,
    options?: {
      readonly width?: number;
      readonly height?: number;
      readonly mediaLibraryId?: string;
      readonly projectRelativePath?: string;
    },
  ): Promise<ResourceRef | undefined>;

  /** Return a host-projected or resource-ref-backed visual for search and mention consumers. */
  getThumbnailVisual?(
    filePath: string,
    variant?: ResourceVariantRequest,
  ): Promise<ProjectSearchVisualResource | undefined>;

  /** Get resolved, enabled, and accessible media library roots for Webview authorization. */
  getMediaLibraryRoots(): Promise<string[]>;

  /** Get path variables used by shared PathResolver for portable media/library refs. */
  getPathVariables?(): Promise<ReadonlyArray<readonly [string, string]>>;

  /** Resolve an entity:// URI to a concrete variant file and absolute path. */
  resolveEntityUri(
    uri: string,
  ): Promise<import('../entity-uri/index').ResolvedEntityRef | undefined>;

  /** Resolve a character name to its thumbnail absolute path via CharacterRegistry → AssetEntity. */
  getCharacterThumbnail(name: string): Promise<string | undefined>;

  /** Project an asset entity into binding candidate roles without persisting bindings. */
  getBindingCandidate(entityId: string): Promise<
    | {
        assetEntityId: string;
        assetRef: string;
        suggestedRoles: readonly import('./creative-entity-asset-composition').EntityAssetBindingRole[];
        confidence: number;
        reason: string;
      }
    | undefined
  >;

  /** Project an asset entity into representation package component details. */
  getRepresentationPackageDetail(entityId: string): Promise<
    | {
        assetEntityId: string;
        assetRef: string;
        representationKinds: readonly import('./creative-entity-asset-composition').RepresentationKind[];
        files: readonly import('./creative-entity-asset-composition').ResolvedRepresentationFile[];
        capabilities: readonly string[];
        missingRoles: readonly import('./creative-entity-asset-composition').RepresentationFileRole[];
      }
    | undefined
  >;

  /** Fired when asset entities are added, removed, or modified. */
  onDidChangeEntities: { (listener: () => void): { dispose(): void } };

  /** Fired when media library roots are added, removed, disabled, or overridden. */
  onDidChangeMediaLibraryRoots: { (listener: () => void): { dispose(): void } };
}

// =============================================================================
// NekoAgent API
// =============================================================================

export type NekoAgentGeneratedOutputResolution =
  | {
      readonly status: 'ready';
      readonly assetId: string;
      readonly revision: string;
      readonly contentDigest: string;
      readonly mediaKind: import('./generated-asset').GeneratedAssetMediaKind;
      readonly mimeType: string;
      readonly taskId: string;
      readonly runId?: string;
      /** Extension-host path. This value must never be projected to a Webview or persisted. */
      readonly sourcePath: string;
    }
  | {
      readonly status: 'unavailable';
      readonly diagnostic: string;
    };

/** Public Extension Host facade for Agent-owned generated-output lifecycle state. */
export interface NekoAgentAPI {
  /** Pi Skill catalog owned by the Agent runtime. */
  getSkills(): readonly SkillDef[];
  resolveGeneratedOutput(resourceRef: ResourceRef): Promise<NekoAgentGeneratedOutputResolution>;
  setGeneratedOutputReviewPin(
    resourceRef: ResourceRef,
    input: { readonly pinned: boolean; readonly ownerId: string },
  ): Promise<void>;
}

// =============================================================================
// Extension Discovery Constants
// =============================================================================

/**
 * VSCode extension IDs for Neko suite extensions
 */
export const NEKO_EXTENSION_IDS = {
  NEKO_CUT: 'neko.neko-cut',
  NEKO_CANVAS: 'neko.neko-canvas',
  NEKO_AGENT: 'neko.neko-agent',
  NEKO_STORY: 'neko.neko-story',
  NEKO_SKETCH: 'neko.neko-sketch',
  NEKO_PUPPET: 'neko.neko-puppet',
  NEKO_MODEL: 'neko.neko-model',
  NEKO_AUTH: 'neko.neko-auth',
  NEKO_ASSETS: 'neko.neko-assets',
} as const;

// =============================================================================
// NekoAudio API
// =============================================================================

export interface AudioProjectAuthoringImportSourceRequest {
  readonly target: import('../project-authoring').NekoProjectAuthoringTarget;
  readonly sourcePath: string;
  readonly name?: string;
  readonly trackId?: string;
}

export interface AudioProjectAuthoringImportedSource {
  readonly sourcePath: string;
  readonly trackId: string;
  readonly elementId: string;
  readonly duration: number;
  readonly createdTrack: boolean;
}

export interface NekoAudioAuthoringAPI {
  importSource(
    request: AudioProjectAuthoringImportSourceRequest,
  ): Promise<
    import('../project-authoring').NekoProjectAuthoringResult<AudioProjectAuthoringImportedSource>
  >;
}

export interface NekoAudioAPI {
  readonly projectQuality: import('../project-authoring/project-quality').ProjectQualityFacade;
  /** Explicit-target, Webview-independent durable .nka authoring. */
  readonly authoring: NekoAudioAuthoringAPI;
  readonly isAvailable: boolean;
  readonly port: number | null;
  probeAudio(filePath: string): Promise<{
    readonly duration: number;
    readonly codec: string;
    readonly sampleRate: number;
    readonly channels: number;
    readonly bitrate?: number;
    readonly format: string;
  }>;
  getWaveform(filePath: string): Promise<{
    readonly peaks: number[];
    readonly channelPeaks?: number[][];
    readonly duration: number;
    readonly sampleRate: number;
    readonly channels?: number;
    readonly peaksPerSecond?: number;
  }>;
}

// =============================================================================
// P3: Skill Provider Interface
// =============================================================================

/**
 * Localized display strings for a skill.
 *
 * Extension providers keep `name` / `description` as the fallback contract and
 * add locale overrides only where they have translated text. Locale keys follow
 * VSCode language ids such as `en`, `en-us`, `zh-cn`, or `zh-hans`.
 */
export interface SkillLocalizedText {
  /** Short display name shown in the skill browser */
  readonly name?: string;
  /** One-sentence description for UI display and intent matching */
  readonly description?: string;
  /** Optional localized tags for UI/filter labels */
  readonly tags?: readonly string[];
}

/**
 * A single capability advertised by a plugin for discovery in the agent UI.
 *
 * Skills appear in the agent's skill browser and can be invoked directly by
 * the user. The Agent may inspect Skill metadata and call `ActivateSkill`
 * with a visible reason when a Skill is needed; catalog matches are candidates
 * only and must not activate Skills by themselves.
 */
export interface SkillDef {
  /** Unique within the owning extension, e.g. "batch-generate" */
  readonly id: string;
  /** Short display name shown in the skill browser (e.g. "Batch Generate Images") */
  readonly name: string;
  /** One-sentence description for LLM intent matching */
  readonly description: string;
  /** Optional emoji or codicon name (\$(symbol-name)) for the skill icon */
  readonly icon?: string;
  /**
   * Optional localized display strings keyed by VSCode language id.
   * Consumers should fall back to `name` / `description` when no locale matches.
   */
  readonly locales?: Readonly<Record<string, SkillLocalizedText>>;
  /**
   * VSCode command to invoke when the skill is selected.
   * The agent passes `{ intent?: string }` as the first argument.
   */
  readonly command: string;
  /**
   * Broad capability categories for filtering in the skill browser.
   * @example ['generation', 'image']
   */
  readonly tags?: readonly string[];
  /**
   * Optional UI catalog projection. Older providers may omit this; consumers
   * must project deterministic standalone/plugin defaults.
   */
  readonly catalog?: SkillCatalogMeta;
}
