// =============================================================================
// Sketch AI Result Contracts
//
// Cross-process wire types for Extension Host -> Webview AI result application.
// Binary media stays out-of-band and is referenced by URI or asset handle.
// =============================================================================

import type { SketchBlendMode } from './blendMode';
import type { BrushPreset } from './sketch';

export type SketchAIOperationType =
  | 'generate'
  | 'smart-selection'
  | 'inpaint'
  | 'outpaint'
  | 'style-transfer'
  | 'upscale'
  | 'auto-layer'
  | 'lineart-colorize'
  | 'palette-generate'
  | 'brush-generate';

/** Runtime-only image handles used during one Sketch AI operation. */
export type SketchAIAssetRef =
  | { readonly kind: 'webviewUri'; readonly ref: string; readonly mimeType: string }
  | { readonly kind: 'fileUri'; readonly ref: string; readonly mimeType: string }
  | { readonly kind: 'assetId'; readonly ref: string; readonly mimeType: string }
  | { readonly kind: 'engineHandle'; readonly ref: string; readonly mimeType: string };

export interface SketchAIContext {
  readonly canvas?: {
    readonly width: number;
    readonly height: number;
    readonly dpi?: number;
    readonly backgroundColor?: string;
  };
  readonly activeLayerId?: string | null;
  readonly selectedLayerIds?: readonly string[];
  readonly compositeImage?: SketchAIAssetRef;
  readonly layerImage?: SketchAIAssetRef;
  readonly maskImage?: SketchAIAssetRef;
}

export type SketchAIContextScope = 'canvas' | 'layer';

export type SketchAIStylePreset =
  'anime' | 'oil-painting' | 'watercolor' | 'pixel-art' | 'sketch' | 'comic' | 'ghibli';

export type SketchAIAutoLayerTarget = 'lineart' | 'flatcolor' | 'shadow' | 'highlight';

export interface SketchAIOperationParams {
  readonly scope?: SketchAIContextScope;
  readonly negativePrompt?: string;
  readonly strength?: number;
  readonly scale?: 2 | 4;
  readonly style?: SketchAIStylePreset;
  readonly layerName?: string;
  readonly palette?: readonly string[];
  readonly autoLayerTargets?: readonly SketchAIAutoLayerTarget[];
}

export interface SketchAIOpenAgentMessage {
  readonly type: 'ai:openAgent';
  readonly operation: SketchAIOperationType;
  readonly prompt: string;
  readonly params?: SketchAIOperationParams;
}

export interface SketchRuntimeFeatureFlags {
  readonly psdImportEnabled: boolean;
  readonly aiOps: {
    readonly enabled: boolean;
    readonly operations: Partial<Record<SketchAIOperationType, boolean>>;
  };
}

export interface SketchFeatureFlagsMessage {
  readonly type: 'featureFlags:update';
  readonly flags: SketchRuntimeFeatureFlags;
}

export interface SketchAISelectionBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SketchAIContextSnapshotRequest {
  readonly runId?: string;
  readonly operation?: SketchAIOperationType;
  readonly scope?: SketchAIContextScope;
  readonly layerId?: string;
  readonly includeSelection?: boolean;
}

export interface SketchAIContextSnapshot extends SketchAIContext {
  readonly runId: string;
  readonly operation?: SketchAIOperationType;
  readonly scope: SketchAIContextScope;
  readonly selectionBounds?: SketchAISelectionBounds;
}

interface SketchAIResultBase {
  readonly issues?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export type SketchAIResult =
  | (SketchAIResultBase & {
      readonly kind: 'layer';
      readonly data: SketchAIAssetRef;
      readonly name?: string;
      readonly width?: number;
      readonly height?: number;
      readonly offsetX?: number;
      readonly offsetY?: number;
      readonly opacity?: number;
      readonly blendMode?: SketchBlendMode;
    })
  | (SketchAIResultBase & {
      readonly kind: 'selection';
      readonly data: SketchAIAssetRef;
    })
  | (SketchAIResultBase & {
      readonly kind: 'palette';
      readonly data: readonly string[];
    })
  | (SketchAIResultBase & {
      readonly kind: 'brushPreset';
      readonly data: BrushPreset;
    });

export type SketchAIRunState =
  | 'idle'
  | 'preparing'
  | 'running'
  | 'previewing'
  | 'applying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface SketchAIRun {
  readonly runId: string;
  readonly operation: SketchAIOperationType;
  readonly state: SketchAIRunState;
  readonly progress: number;
  readonly stage?: string;
  readonly metadata: Record<string, unknown>;
}

export interface SketchAIProgressMessage {
  readonly type: 'ai:progress';
  readonly runId: string;
  readonly operation: SketchAIOperationType;
  /** Progress percentage from 0 to 100. */
  readonly percent: number;
  readonly stage?: string;
}

export interface SketchAIResultApplyMessage {
  readonly type: 'ai:resultApply';
  readonly runId: string;
  readonly operation: SketchAIOperationType;
  readonly result: SketchAIResult;
}

export interface SketchAIResultAppliedMessage {
  readonly type: 'ai:resultApplied';
  readonly runId: string;
  readonly success: boolean;
  readonly reason?: string;
}

export interface SketchAIErrorMessage {
  readonly type: 'ai:error';
  readonly runId: string;
  readonly message: string;
  readonly issues?: readonly string[];
}

export interface SketchAICancelMessage {
  readonly type: 'ai:cancel';
  readonly runId: string;
}

export interface SketchAIImageResultRequest {
  readonly runId?: string;
  readonly operation: SketchAIOperationType;
  readonly sourceUrl: string;
  readonly target?: 'layer' | 'selection';
  readonly name?: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly opacity?: number;
  readonly blendMode?: SketchBlendMode;
  readonly metadata?: Record<string, unknown>;
}
