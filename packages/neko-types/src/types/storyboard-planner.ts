import type { CameraAngle, CameraMovement, ShotCharacter, ShotScale } from './canvas';
import type { CanvasCreativeScope, CanvasRelatedBoardRef } from './canvas-creative-scope';
import type {
  StoryboardMediaRef,
  StoryboardTextCue,
  StoryboardValidationDiagnostic,
  StoryboardVoiceCue,
} from './storyboard-table';
import type { DocumentArchiveResourceRef } from './document-reading';
import type { NekoStoryScriptIndex } from './extension-api';
import type { ResourceRef } from './resource-cache';
import type { ShotImagePrepPlan } from './shot-image-prep';
import type { CanvasStoryboardPromptState } from './canvas-semantic-storyboard';

export type StoryboardImportMode = 'mechanical' | 'semantic';

export interface StoryShotPlan {
  readonly shotId?: string;
  readonly shotNumber?: number;
  readonly duration?: number;
  readonly visualDescription?: string;
  readonly characters?: readonly ShotCharacter[];
  readonly shotScale?: ShotScale;
  readonly cameraMovement?: CameraMovement;
  readonly cameraAngle?: CameraAngle;
  readonly characterAction?: string;
  readonly emotion?: readonly string[];
  readonly sceneTags?: readonly string[];
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly textCues?: readonly StoryboardTextCue[];
  readonly voiceCues?: readonly StoryboardVoiceCue[];
  readonly imagePrompt?: string;
  readonly videoPrompt?: string;
  readonly generationPrompt?: string;
  readonly storyboardPrompt?: CanvasStoryboardPromptState;
  readonly visualStyle?: string;
  readonly referenceImagePath?: string;
  readonly referenceResourceRef?: ResourceRef;
  readonly referenceImageResourceRef?: DocumentArchiveResourceRef;
  readonly vfx?: readonly string[];
  readonly sourceMediaRefs?: readonly StoryboardMediaRef[];
  readonly generatedMediaRefs?: readonly StoryboardMediaRef[];
  readonly mediaRefs?: readonly StoryboardMediaRef[];
  readonly shotImagePrepPlan?: ShotImagePrepPlan;
}

export interface StoryScenePlan {
  readonly sceneId: string;
  readonly sceneTitle?: string;
  readonly summary?: string;
  readonly recommendedShotCount?: number;
  readonly shotPlans?: readonly StoryShotPlan[];
}

export interface CanvasStoryboardShotPlan {
  readonly shotId?: string;
  readonly shotNumber: number;
  readonly duration: number;
  readonly visualDescription: string;
  readonly characters: readonly ShotCharacter[];
  readonly shotScale: ShotScale;
  readonly cameraMovement?: CameraMovement;
  readonly cameraAngle?: CameraAngle;
  readonly characterAction: string;
  readonly emotion: readonly string[];
  readonly sceneTags: readonly string[];
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly textCues?: readonly StoryboardTextCue[];
  readonly voiceCues?: readonly StoryboardVoiceCue[];
  readonly imagePrompt?: string;
  readonly videoPrompt?: string;
  readonly generationPrompt?: string;
  readonly storyboardPrompt?: CanvasStoryboardPromptState;
  readonly visualStyle?: string;
  readonly referenceImagePath?: string;
  readonly referenceResourceRef?: ResourceRef;
  readonly referenceImageResourceRef?: DocumentArchiveResourceRef;
  readonly vfx?: readonly string[];
  readonly sourceMediaRefs?: readonly StoryboardMediaRef[];
  readonly generatedMediaRefs?: readonly StoryboardMediaRef[];
  readonly mediaRefs?: readonly StoryboardMediaRef[];
  readonly shotImagePrepPlan?: ShotImagePrepPlan;
}

export interface CanvasStoryboardScenePlan {
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly sceneNumber: number;
  readonly location?: string;
  readonly timeOfDay?: string | null;
  readonly storyboardPrompt?: CanvasStoryboardPromptState;
  readonly shotPlans: readonly CanvasStoryboardShotPlan[];
}

export interface CanvasStoryboardPayload {
  readonly mode: StoryboardImportMode;
  readonly sourceScriptUri: string;
  /** Canonical Storyboard revision projected into Canvas; Canvas remains read-only projection state. */
  readonly sourceStoryboardRevisionId?: string;
  readonly projectionMode?: 'read-only-projection';
  readonly creativeScope?: CanvasCreativeScope;
  readonly relatedBoards?: readonly CanvasRelatedBoardRef[];
  readonly scenes: readonly CanvasStoryboardScenePlan[];
  readonly diagnostics?: readonly StoryboardValidationDiagnostic[];
}

export interface ApplyCanvasStoryboardOptions {
  readonly startX?: number;
  readonly startY?: number;
  /**
   * Phase 6.3 — Workflow Orchestration plan id.  When provided, every
   * imported shot node gets its `data.workflowPlanId` stamped so timeline
   * import downstream can populate `EngineElement.lineage.planId`.  Omit
   * for manual / non-orchestrated imports.
   */
  readonly workflowPlanId?: string;
}

export interface CreateStoryboardPayloadOptions {
  readonly mode?: StoryboardImportMode;
  readonly scenesLimit?: number;
  readonly scenePlans?: readonly StoryScenePlan[];
  readonly characterBindings?: Readonly<Record<string, string>>;
}

export interface CreatedCanvasStoryboardScene {
  readonly sourceSceneId: string;
  readonly sceneNodeId: string;
  readonly shotIds: readonly string[];
}

export interface CreatedCanvasStoryboard {
  readonly mode: StoryboardImportMode;
  readonly scenesCreated: number;
  readonly totalShots: number;
  readonly scenes: readonly CreatedCanvasStoryboardScene[];
}

export interface CreateStoryboardPayloadResult {
  readonly payload: CanvasStoryboardPayload;
  readonly sourceIndex: NekoStoryScriptIndex;
}

export interface CanonicalCanvasStoryboardProjectionResult {
  readonly payload?: CanvasStoryboardPayload;
  readonly diagnostics: readonly StoryboardValidationDiagnostic[];
}
