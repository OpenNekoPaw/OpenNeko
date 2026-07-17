// =============================================================================
// Storyboard Readiness Contracts
//
// Shared DTOs for Story scene-level video readiness, Canvas execution summaries,
// and backward-compatible Agent handoff payloads.
// =============================================================================

import type {
  CanvasBoardSummary,
  CanvasCreativeScope,
  CanvasRelatedBoardRef,
} from './canvas-creative-scope';

export type StorySceneVideoReadinessStatus =
  | 'unknown'
  | 'needs-input'
  | 'ready'
  | 'in-progress'
  | 'done'
  | 'skipped'
  | 'failed';

export type StoryCreatorStatus = 'pending' | 'processing' | 'attention' | 'done' | 'skipped';

export type StoryCharacterVisualStatus =
  | 'unknown'
  | 'bound'
  | 'generated'
  | 'missing'
  | 'unresolved'
  | 'stale';

export type StoryCharacterMatchSource =
  | 'dialogue-character'
  | 'registry-mention'
  | 'manual'
  | 'unknown';

export type StoryLocalizedTextParams = Readonly<Record<string, string | number>>;

export interface StoryCharacterVisualReadiness {
  readonly name: string;
  readonly characterId?: string;
  readonly matchSource: StoryCharacterMatchSource;
  readonly status: StoryCharacterVisualStatus;
  readonly thumbnailUri?: string;
  readonly assetEntityIds?: readonly string[];
  readonly generatedAssetIds?: readonly string[];
  readonly galleryNodeIds?: readonly string[];
  readonly missingReason?: string;
  readonly missingReasonKey?: string;
  readonly missingReasonParams?: StoryLocalizedTextParams;
}

export type StoryMissingInputKind =
  | 'character-visual'
  | 'unresolved-character'
  | 'location'
  | 'duration'
  | 'canvas-handoff'
  | 'other';

export type StoryMissingInputSeverity = 'info' | 'warning' | 'blocking';

export interface StoryMissingInput {
  readonly kind: StoryMissingInputKind;
  readonly label: string;
  readonly labelKey?: string;
  readonly labelParams?: StoryLocalizedTextParams;
  readonly severity: StoryMissingInputSeverity;
  readonly characterName?: string;
  readonly characterId?: string;
  readonly detail?: string;
  readonly detailKey?: string;
  readonly detailParams?: StoryLocalizedTextParams;
}

export type StoryVideoReadinessAction =
  | 'analyze'
  | 'startVideoCreation'
  | 'sendToCanvas'
  | 'openCanvas'
  | 'retryFailed'
  | 'toggleSkip'
  | 'generateCurrentScene';

export type CanvasExecutionStatus =
  | 'unknown'
  | 'not-available'
  | 'not-found'
  | 'not-started'
  | 'in-progress'
  | 'partial'
  | 'done'
  | 'failed';

export interface CanvasShotExecutionSummary {
  readonly shotId: string;
  readonly shotNumber?: number;
  readonly duration?: number;
  readonly generationStatus?: string;
  readonly selectedAssetRef?: string;
  readonly thumbnailRef?: string;
  readonly generatedVideoRef?: string;
  readonly lastImportedToTimelineAt?: number;
  readonly lastImportedToTimelineProject?: string;
}

export interface CanvasSceneExecutionSummary {
  readonly sourceScriptUri?: string;
  readonly sceneId?: string;
  readonly sceneNodeId: string;
  readonly canvasFileUri?: string;
  readonly shotCount: number;
  readonly generatedShotCount: number;
  readonly failedShotCount: number;
  readonly status: CanvasExecutionStatus;
  readonly selectedThumbnailRef?: string;
  readonly shots: readonly CanvasShotExecutionSummary[];
}

export interface CanvasStoryboardExecutionSummary {
  readonly sourceScriptUri?: string;
  readonly canvasFileUri?: string;
  readonly boardSummary?: CanvasBoardSummary;
  readonly creativeScope?: CanvasCreativeScope;
  readonly relatedBoards?: readonly CanvasRelatedBoardRef[];
  readonly status?: CanvasExecutionStatus;
  readonly scenes: readonly CanvasSceneExecutionSummary[];
  readonly error?: string;
}

export interface CanvasStoryboardExecutionSummaryRequest {
  readonly sourceScriptUri?: string;
  readonly sceneId?: string;
  readonly sceneNodeId?: string;
  readonly canvasFileUri?: string;
}

export interface StorySceneVideoReadiness {
  readonly sceneId: string;
  readonly sourceScriptUri: string;
  readonly sceneTitle: string;
  readonly sceneNumber?: string | null;
  readonly summary?: string;
  readonly location?: string;
  readonly estimatedDuration: number;
  readonly recommendedShotCount?: number;
  readonly characters: readonly StoryCharacterVisualReadiness[];
  readonly missingInputs: readonly StoryMissingInput[];
  readonly readinessStatus: StorySceneVideoReadinessStatus;
  readonly creatorStatus: StoryCreatorStatus;
  readonly agentStatus?: string;
  readonly canvasStatus?: string;
  readonly timelineStatus?: string;
  readonly canvasSummary?: CanvasSceneExecutionSummary;
  readonly allowedActions: readonly StoryVideoReadinessAction[];
}

export interface StorySceneAgentContextData {
  readonly scriptPath?: string | null;
  readonly sourceScriptUri?: string;
  readonly sceneId?: string;
  readonly selectedText?: string;
  readonly range?: {
    readonly start: { readonly line: number; readonly character: number };
    readonly end: { readonly line: number; readonly character: number };
  };
  readonly readinessStatus?: StorySceneVideoReadinessStatus;
  readonly missingInputs?: readonly StoryMissingInput[];
  readonly canvasSummary?: CanvasSceneExecutionSummary;
}

export interface StoryTableAgentContextData {
  readonly scriptPath?: string | null;
  readonly sourceScriptUri?: string;
  readonly sceneIds: readonly string[];
  readonly scriptIndex?: unknown;
  readonly readinessRows?: readonly StorySceneVideoReadiness[];
  readonly selectedText?: string;
  readonly workflowIntent?: 'storyboard-only' | 'full-video-creation' | 'canvas-handoff';
}

export interface StoryCharacterAgentContextData {
  readonly characterName: string;
  readonly scriptPath?: string | null;
  readonly sourceScriptUri?: string;
  readonly sceneId?: string;
  readonly characterId?: string;
  readonly assetEntityIds?: readonly string[];
  readonly generatedAssetIds?: readonly string[];
  readonly galleryNodeIds?: readonly string[];
  readonly thumbnailRef?: string;
  readonly readinessStatus?: StoryCharacterVisualStatus;
  readonly missingInputs?: readonly StoryMissingInput[];
}
