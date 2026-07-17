import type { CanvasSerializableRecord, CanvasSerializableValue } from './canvas-serializable';
import type { CanvasPlaybackPlan } from './canvas-playback';
import type { NarrativeAssetRef } from './narrative-asset';
import type { NarrativeProductionBinding } from './narrative-production-binding';

export const STORY_GENRES = [
  'interactive-film',
  'visual-novel',
  'illustrated-text',
  'hybrid',
] as const;

export type StoryGenre = (typeof STORY_GENRES)[number];

export const NARRATIVE_RUNTIME_NODE_TYPES = [
  'narrative-start',
  'narrative-scene',
  'choice',
  'merge',
  'narrative-ending',
] as const;

export type NarrativeRuntimeNodeType = (typeof NARRATIVE_RUNTIME_NODE_TYPES)[number];

export type VariableEffectOperation = 'set' | 'add' | 'subtract' | 'toggle';

export interface VariableEffect {
  readonly variableId: string;
  readonly operation: VariableEffectOperation;
  readonly value: unknown;
}

export interface NarrativeSceneMetadata {
  readonly sceneRef?: string;
  readonly backgroundRef?: NarrativeAssetRef;
  readonly bgm?: NarrativeAssetRef;
  readonly characters?: readonly string[];
  readonly variableEffects?: readonly VariableEffect[];
  readonly productionRefs?: readonly NarrativeProductionBinding[];
}

export interface NarrativeEndingMetadata {
  readonly endingType?: 'good' | 'normal' | 'bad' | 'secret' | 'custom';
  readonly endingLabel?: string;
  readonly statisticsSummary?: boolean;
}

export interface NarrativeVariable {
  id: string;
  name: string;
  value: CanvasSerializableValue;
}

export interface NarrativeMetadata {
  entryNodeId?: string;
  variables: NarrativeVariable[];
  genre?: StoryGenre;
  defaultLocale?: string;
}

export interface NarrativePreviewFeatureToggles {
  readonly preview: boolean;
  readonly typewriterEffect: boolean;
  readonly autoExpressionMatch: boolean;
  readonly showLockedChoices: boolean;
  readonly previewAutoSync: boolean;
  readonly live2dPerformance: boolean;
}

export const DEFAULT_NARRATIVE_PREVIEW_FEATURE_TOGGLES: NarrativePreviewFeatureToggles = {
  preview: true,
  typewriterEffect: true,
  autoExpressionMatch: true,
  showLockedChoices: true,
  previewAutoSync: true,
  live2dPerformance: false,
};

export function normalizeNarrativePreviewFeatureToggles(
  toggles: Partial<NarrativePreviewFeatureToggles> | undefined,
): NarrativePreviewFeatureToggles {
  return {
    ...DEFAULT_NARRATIVE_PREVIEW_FEATURE_TOGGLES,
    ...toggles,
  };
}

export interface NarrativeNodeSnapshot {
  readonly nodeId: string;
  readonly type: NarrativeRuntimeNodeType;
  readonly label?: string;
  readonly data: CanvasSerializableRecord;
  readonly scene?: NarrativeSceneMetadata;
  readonly ending?: NarrativeEndingMetadata;
}

export interface NarrativeConnectionSnapshot {
  readonly connectionId: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly type?: string;
  readonly choiceText?: string;
  readonly condition?: string;
  readonly priority: number;
}

export interface NarrativeGraphSnapshot {
  readonly nodes: readonly NarrativeNodeSnapshot[];
  readonly connections: readonly NarrativeConnectionSnapshot[];
  readonly metadata: NarrativeMetadata;
  readonly revision: number;
  readonly sourceCanvasUri?: string;
  readonly charactersYaml?: string;
  readonly sceneContents?: Readonly<Record<string, string>>;
}

export interface NarrativeMessageEnvelope {
  readonly requestId: string;
  readonly sessionId?: string;
  readonly sourceCanvasUri?: string;
  readonly revision?: number;
}

export type CanvasToPreviewMessage = NarrativeMessageEnvelope &
  (
    | {
        readonly type: 'preview:loadGraph';
        readonly snapshot: NarrativeGraphSnapshot;
        readonly revision: number;
      }
    | {
        readonly type: 'preview:jumpTo';
        readonly nodeId: string;
        readonly revision: number;
      }
    | {
        readonly type: 'preview:refresh';
        readonly snapshot: NarrativeGraphSnapshot;
        readonly revision: number;
      }
    | {
        readonly type: 'preview:loadPlaybackPlan';
        readonly plan: CanvasPlaybackPlan;
        readonly revision: number;
      }
    | {
        readonly type: 'preview:refreshPlaybackPlan';
        readonly plan: CanvasPlaybackPlan;
        readonly revision: number;
      }
    | {
        readonly type: 'preview:setVariables';
        readonly variables: Readonly<Record<string, unknown>>;
        readonly revision: number;
      }
    | {
        readonly type: 'preview:setGenre';
        readonly genre: StoryGenre;
      }
    | {
        readonly type: 'preview:setFeatureToggles';
        readonly toggles: Partial<NarrativePreviewFeatureToggles>;
        readonly revision?: number;
      }
  );

export type PreviewToCanvasMessage = NarrativeMessageEnvelope &
  (
    | {
        readonly type: 'canvas:highlightPath';
        readonly nodeIds: readonly string[];
      }
    | {
        readonly type: 'canvas:highlightNode';
        readonly nodeId: string;
      }
    | {
        readonly type: 'canvas:choiceMade';
        readonly fromNodeId: string;
        readonly toNodeId: string;
      }
  );

export type NarrativePreviewMessage = CanvasToPreviewMessage | PreviewToCanvasMessage;

export function isStoryGenre(value: unknown): value is StoryGenre {
  return typeof value === 'string' && STORY_GENRES.includes(value as StoryGenre);
}
