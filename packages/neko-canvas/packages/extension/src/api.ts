/**
 * NekoCanvas API - Exported interface for other extensions
 */
import * as vscode from 'vscode';
import type {
  ApplyCanvasStoryboardOptions,
  CanvasAgentActiveContextRequest,
  CanvasAgentActiveContextResult,
  CanvasAgentApplyContentResult,
  CanvasAgentContentPayload,
  CanvasWorkspaceProjectionRequest,
  CanvasWorkspaceProjectionResult,
  CanvasCutDraftPayload,
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasCreativeScope,
  CanvasCreateConnectionRequest,
  CanvasCreateConnectionResult,
  CanvasDeriveNodeRequest,
  CanvasDeriveNodeResult,
  CanvasExtractStructuredContentRequest,
  CanvasExtractStructuredContentResult,
  CanvasChangeEvent as SharedCanvasChangeEvent,
  CanvasImportAssetRequest,
  CanvasImportAssetResult,
  NekoCanvasAuthoringAPI,
  CanvasMarkdownCapabilityInput,
  CanvasMarkdownCapabilityResult,
  CanvasNode,
  CanvasNodeType,
  CanvasPlaybackCreateCutDraftRequest,
  CanvasPlaybackSendRouteToCutRequest,
  CanvasPlaybackPlan,
  CanvasPlaybackRevealWorkspaceRequest,
  CanvasPlaybackReorderUnitsRequest,
  CanvasPlaybackReorderUnitsResult,
  CanvasPlaybackRouteCandidate,
  CutRouteHandoffResult,
  CanvasStoryboardExecutionSummary,
  CanvasStoryboardExecutionSummaryRequest,
  CanvasStoryboardPayload,
  CanvasRelatedBoardRef,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
  CreatedCanvasStoryboard,
  ProjectionAdapter,
  ProjectionDisposable,
  ProjectionWriteBack,
  ProjectionWriteBackResult,
  ProjectedCanvasData,
  ProjectedCanvasSource,
} from '@neko/shared';

export interface CanvasConfig {
  name: string;
  width: number;
  height: number;
  backgroundColor?: string;
  creativeScope?: CanvasCreativeScope;
  relatedBoards?: readonly CanvasRelatedBoardRef[];
}

export interface ShapeConfig {
  type: 'rectangle' | 'ellipse' | 'polygon' | 'path' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  properties?: Record<string, unknown>;
}

export type CanvasChangeEvent = SharedCanvasChangeEvent;

/**
 * NekoCanvas API interface exported to other extensions
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

  /**
   * Canvas operations
   */
  canvas: {
    /**
     * Create new canvas
     * @returns Canvas ID
     */
    create(config: CanvasConfig): Promise<string>;

    /**
     * Add shape to canvas
     * @returns Shape ID
     */
    addShape(canvasId: string, shape: ShapeConfig): Promise<string>;

    /**
     * Update shape
     */
    updateShape(canvasId: string, shapeId: string, updates: Partial<ShapeConfig>): Promise<void>;

    /**
     * Delete shape
     */
    deleteShape(canvasId: string, shapeId: string): Promise<void>;
  };

  /**
   * Storyboard operations — scene/shot structure import sink for story/agent.
   */
  storyboard: {
    /**
     * Import a storyboard payload into the active canvas.
     */
    import(
      payload: CanvasStoryboardPayload,
      options?: ApplyCanvasStoryboardOptions,
    ): Promise<CreatedCanvasStoryboard>;

    /**
     * Read-only scene/shot execution summary for Story and Agent consumers.
     */
    getExecutionSummary(
      request?: CanvasStoryboardExecutionSummaryRequest,
    ): Promise<CanvasStoryboardExecutionSummary>;
  };

  /**
   * Markdown capability operations — Canvas owns validation, resource binding,
   * and node creation for Markdown authoring requests.
   */
  markdown: {
    invoke(input: CanvasMarkdownCapabilityInput): Promise<CanvasMarkdownCapabilityResult>;
  };

  /**
   * Playback route operations — derived from Canvas graph state, not Agent-owned order.
   */
  playback: {
    getPlan(sourceCanvasUri?: string): Promise<CanvasPlaybackPlan>;
    getRoutes(sourceCanvasUri?: string): Promise<readonly CanvasPlaybackRouteCandidate[]>;
    revealWorkspace(request?: CanvasPlaybackRevealWorkspaceRequest): Promise<boolean>;
    createCutDraftFromRoute(
      request?: CanvasPlaybackCreateCutDraftRequest,
    ): Promise<CanvasCutDraftPayload>;
    sendRouteToCut(request: CanvasPlaybackSendRouteToCutRequest): Promise<CutRouteHandoffResult>;
    reorderUnits(
      request: CanvasPlaybackReorderUnitsRequest,
    ): Promise<CanvasPlaybackReorderUnitsResult>;
  };

  /**
   * Canvas node operations — primary API for neko-agent Canvas MCP tools
   */
  nodes: {
    /** List all nodes on the active canvas, optionally filtered by type */
    list(type?: CanvasNodeType): Promise<CanvasNode[]>;
    /** Get a single node by ID */
    get(nodeId: string): Promise<CanvasNode | undefined>;
    /** Update a node's data fields */
    update(nodeId: string, data: Record<string, unknown>): Promise<void>;
    /** Create a new node; returns the new node's ID */
    create(
      type: CanvasNodeType,
      position: { x: number; y: number },
      data: object,
      preset?: string,
    ): Promise<string>;
    /** Derive a successor node through registered preset rules */
    derive(request: CanvasDeriveNodeRequest): Promise<CanvasDeriveNodeResult>;
    /** Create a directed connection between existing Canvas nodes */
    createConnection(request: CanvasCreateConnectionRequest): Promise<CanvasCreateConnectionResult>;
    /** Create a container and child nodes as one logical mutation */
    createComposite(request: CanvasCreateCompositeRequest): Promise<CanvasCreateCompositeResult>;
    /** Update a composable block binding or explicit JSON Pointer path */
    updateBlock(request: CanvasUpdateBlockRequest): Promise<CanvasUpdateBlockResult>;
    /** Extract structured Canvas content for Agent context */
    extractStructuredContent(
      request: CanvasExtractStructuredContentRequest,
    ): Promise<CanvasExtractStructuredContentResult>;
    /** Return compact, read-only active Canvas context for Agent planning */
    getActiveContext(
      request?: CanvasAgentActiveContextRequest,
    ): Promise<CanvasAgentActiveContextResult>;
    /** Apply Agent-generated text, prompt, or structured content to a validated Canvas target */
    applyAgentContent(payload: CanvasAgentContentPayload): Promise<CanvasAgentApplyContentResult>;
    /** Trigger image generation for a ShotNode or a gallery child node */
    generateImage(nodeId: string, childNodeId?: string): Promise<void>;
    /** Trigger batch image generation for multiple nodes */
    generateBatch(nodeIds: string[]): Promise<void>;
    /** Fired whenever the canvas selection changes */
    onSelectionChange: vscode.Event<CanvasNode[]>;
  };

  /**
   * Projected Canvas graph operations. Adapters own source-specific JSON mutation.
   */
  projections: {
    registerAdapter(adapter: ProjectionAdapter): ProjectionDisposable;
    open(source: ProjectedCanvasSource): Promise<ProjectedCanvasData>;
    writeBack(
      source: ProjectedCanvasSource,
      changes: readonly ProjectionWriteBack[],
    ): Promise<ProjectionWriteBackResult>;
  };

  /**
   * Event subscriptions
   */
  events: {
    /**
     * Fired when canvas changes
     */
    onDidChangeCanvas: vscode.Event<CanvasChangeEvent>;
  };
}
