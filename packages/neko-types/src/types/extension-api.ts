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
import type { CanvasPlaybackPlan, CanvasPlaybackRouteCandidate } from './canvas-playback';
import type {
  ApplyCanvasStoryboardOptions,
  CanvasStoryboardPayload,
  CreatedCanvasStoryboard,
} from './storyboard-planner';
import type {
  CanvasStoryboardExecutionSummary,
  CanvasStoryboardExecutionSummaryRequest,
} from './storyboard-readiness';
import type { DocumentArchiveResourceRef } from './document-reading';
import type { SkillCatalogMeta } from './skill';
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

export type CutRouteHandoffItem =
  | {
      readonly kind: 'media';
      readonly workspaceRelativePath: string;
      readonly name: string;
      readonly durationSeconds: number;
    }
  | { readonly kind: 'gap'; readonly durationSeconds: number };

export type CutRouteHandoffTarget =
  | { readonly kind: 'new'; readonly projectName: string }
  | {
      readonly kind: 'append';
      readonly documentUri: string;
      readonly expectedRevision: number;
    };

export interface CutRouteHandoffRequest {
  readonly target: CutRouteHandoffTarget;
  readonly items: readonly CutRouteHandoffItem[];
}

export interface CutRouteHandoffResult {
  readonly documentUri: string;
  readonly revision: number;
  readonly created: boolean;
}

/** NekoCut VS Code extension API. */
export interface NekoCutAPI {
  readonly status: 'ready';
  readonly routes: {
    handoff(request: CutRouteHandoffRequest): Promise<CutRouteHandoffResult>;
  };
}

// =============================================================================
// NekoCanvas API
// =============================================================================

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

export interface CanvasPlaybackSendRouteToCutRequest extends CanvasPlaybackCreateCutDraftRequest {
  readonly target: CutRouteHandoffTarget;
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
 * Exported by neko-canvas extension for canvas manipulation
 */
export interface NekoCanvasAPI {
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

    sendRouteToCut(request: CanvasPlaybackSendRouteToCutRequest): Promise<CutRouteHandoffResult>;

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
     * Fired whenever nodes or shapes on the active canvas are added, updated, or deleted.
     */
    onDidChangeCanvas: NekoEventLike<CanvasChangeEvent>;
  };
}

// =============================================================================
// NekoAssets API
// =============================================================================

/**
 * Media representation generation API exported by neko-assets.
 * Consumers receive derived bytes and never observe the owning cache path.
 */
export interface NekoMediaRepresentationAPI {
  /** Generate thumbnail bytes without exposing package-local cache paths. */
  generateThumbnail(
    filePath: string,
    variant?: ResourceVariantRequest,
  ): Promise<
    | {
        readonly bytes: Uint8Array;
        readonly width: number;
        readonly height: number;
        readonly mimeType: 'image/jpeg';
      }
    | undefined
  >;
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
  NEKO_ASSETS: 'neko.neko-assets',
} as const;

export function isNekoMediaRepresentationAPI(value: unknown): value is NekoMediaRepresentationAPI {
  return hasCallableMembers(value, ['generateThumbnail']);
}

export function isNekoCutAPI(value: unknown): value is NekoCutAPI {
  return (
    isExtensionApiRecord(value) &&
    value['status'] === 'ready' &&
    hasCallableMember(value['routes'], 'handoff')
  );
}

export function isNekoCanvasAPI(value: unknown): value is NekoCanvasAPI {
  if (!isExtensionApiRecord(value)) return false;
  return (
    hasCallableMember(value['authoring'], 'importAsset') &&
    hasCallableMember(value['markdown'], 'invoke') &&
    hasCallableMember(value['boards'], 'project') &&
    hasCallableMembers(value['canvas'], ['create', 'addShape']) &&
    hasCallableMembers(value['storyboard'], ['import', 'getExecutionSummary']) &&
    hasCallableMembers(value['playback'], [
      'getPlan',
      'getRoutes',
      'revealWorkspace',
      'createCutDraftFromRoute',
      'reorderUnits',
    ]) &&
    hasCallableMembers(value['nodes'], [
      'list',
      'get',
      'update',
      'create',
      'derive',
      'createConnection',
      'createComposite',
      'updateBlock',
      'extractStructuredContent',
      'getActiveContext',
      'applyAgentContent',
      'generateImage',
      'generateBatch',
      'onSelectionChange',
    ]) &&
    hasCallableMember(value['events'], 'onDidChangeCanvas')
  );
}

function hasCallableMember(value: unknown, key: string): boolean {
  return isExtensionApiRecord(value) && typeof Reflect.get(value, key) === 'function';
}

function hasCallableMembers(value: unknown, keys: readonly string[]): boolean {
  return keys.every((key) => hasCallableMember(value, key));
}

function isExtensionApiRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
