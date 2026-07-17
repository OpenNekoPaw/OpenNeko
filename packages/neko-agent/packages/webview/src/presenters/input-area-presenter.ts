import type { ConversationKind, SessionMode } from '@neko-agent/types';
import type { AmbientCanvasNodeProjection } from './plugin-transfer-presenter';

export interface InputAreaUiProjectionInput {
  inputValue: string;
  attachedFileCount: number;
  contextChipCount: number;
  ambientNodeCount: number;
  mediaModelCallCount: number;
  isThinking: boolean;
  queuedMessageCount?: number;
  disabled: boolean;
  sessionMode: SessionMode;
  conversationKind?: ConversationKind;
  availableMediaModelCount: number;
  currentSessionMediaModelCount: number;
}

export interface InputAreaUiProjection {
  hasText: boolean;
  hasAttachments: boolean;
  hasContextChips: boolean;
  hasAmbientNodes: boolean;
  canSend: boolean;
  canQueue: boolean;
  canCancel: boolean;
  queuedMessageCount: number;
  showQueuedMessages: boolean;
  showSuggestionChips: boolean;
  showContextChips: boolean;
  showAmbientNodes: boolean;
  showMediaCallCount: boolean;
  showExecutionModeSelector: boolean;
  showChatModelSelector: boolean;
  showSessionMediaModelSelector: boolean;
  showSessionModeSelector: boolean;
  showGenerationParams: boolean;
  inputPlaceholderKey:
    | 'chat.input.placeholder'
    | 'chat.input.thinkingPlaceholder'
    | 'chat.input.queuePlaceholder';
  sendTitleKey: 'chat.input.send' | 'chat.input.queue';
}

export type AmbientCanvasContextActionId =
  | 'generate-image'
  | 'batch-generate-images'
  | 'optimize-selection'
  | 'understand-selection';

export interface AmbientCanvasContextActionProjection {
  id: AmbientCanvasContextActionId;
  labelKey: string;
  promptKey: string;
}

export interface AmbientCanvasContextCountProjection {
  type: string;
  count: number;
  labelKey: string;
}

export interface AmbientCanvasContextProjection {
  selectedCount: number;
  titleNodeSummary?: string;
  titleKey: string;
  counts: AmbientCanvasContextCountProjection[];
  previewNodes: AmbientCanvasNodeProjection[];
  actions: AmbientCanvasContextActionProjection[];
  shotCount: number;
  sceneCount: number;
  mediaCount: number;
}

export function projectInputAreaUi(input: InputAreaUiProjectionInput): InputAreaUiProjection {
  const hasText = input.inputValue.trim().length > 0;
  const hasAttachments = input.attachedFileCount > 0;
  const hasContextChips = input.contextChipCount > 0;
  const hasAmbientNodes = input.ambientNodeCount > 0;
  const queuedMessageCount = Math.max(0, input.queuedMessageCount ?? 0);
  const isCharacterRoleSession =
    input.conversationKind === 'character-dialogue' ||
    input.conversationKind === 'embody-character';
  const isAgentMode = input.sessionMode === 'agent';
  const isActionTrigger = /^[/$]/.test(input.inputValue.trimStart());
  const hasQueueableTextOnlyContent =
    hasText && !hasAttachments && !hasContextChips && !hasAmbientNodes && !isActionTrigger;
  const canQueue =
    input.isThinking &&
    !input.disabled &&
    !isCharacterRoleSession &&
    isAgentMode &&
    hasQueueableTextOnlyContent;
  const hasMediaModels = input.availableMediaModelCount > 0;
  const hasCurrentSessionMediaModels = input.currentSessionMediaModelCount > 0;

  return {
    hasText,
    hasAttachments,
    hasContextChips,
    hasAmbientNodes,
    canSend:
      !input.disabled &&
      ((!input.isThinking && (hasText || hasAttachments || hasContextChips)) || canQueue),
    canQueue,
    canCancel: input.isThinking && !input.disabled,
    queuedMessageCount,
    showQueuedMessages: queuedMessageCount > 0,
    showSuggestionChips: hasContextChips,
    showContextChips: hasContextChips,
    showAmbientNodes: hasAmbientNodes,
    showMediaCallCount: !isCharacterRoleSession && input.mediaModelCallCount > 0,
    showExecutionModeSelector: !isCharacterRoleSession && isAgentMode,
    showChatModelSelector: !isCharacterRoleSession && isAgentMode,
    showSessionMediaModelSelector:
      !isCharacterRoleSession && !isAgentMode && hasCurrentSessionMediaModels,
    showSessionModeSelector: !isCharacterRoleSession,
    showGenerationParams:
      !isCharacterRoleSession && (isAgentMode ? hasMediaModels : hasCurrentSessionMediaModels),
    inputPlaceholderKey:
      queuedMessageCount > 0
        ? 'chat.input.queuePlaceholder'
        : input.isThinking
          ? 'chat.input.thinkingPlaceholder'
          : 'chat.input.placeholder',
    sendTitleKey: canQueue ? 'chat.input.queue' : 'chat.input.send',
  };
}

const AMBIENT_CANVAS_COUNT_LABEL_KEYS: Record<string, string> = {
  shot: 'chat.input.canvasContext.count.shots',
  scene: 'chat.input.canvasContext.count.scenes',
  media: 'chat.input.canvasContext.count.media',
  gallery: 'chat.input.canvasContext.count.galleries',
  annotation: 'chat.input.canvasContext.count.notes',
  text: 'chat.input.canvasContext.count.notes',
};

export function projectAmbientCanvasContext(
  nodes: readonly AmbientCanvasNodeProjection[],
): AmbientCanvasContextProjection | null {
  if (nodes.length === 0) return null;

  const countsByType = new Map<string, number>();
  for (const node of nodes) {
    countsByType.set(node.type, (countsByType.get(node.type) ?? 0) + 1);
  }

  const shotCount = countsByType.get('shot') ?? 0;
  const sceneCount = countsByType.get('scene') ?? 0;
  const mediaCount = countsByType.get('media') ?? 0;
  const counts = Array.from(countsByType.entries())
    .map(([type, count]) => ({
      type,
      count,
      labelKey: AMBIENT_CANVAS_COUNT_LABEL_KEYS[type] ?? 'chat.input.canvasContext.count.generic',
    }))
    .sort(compareAmbientCanvasCounts);

  return {
    selectedCount: nodes.length,
    ...(nodes.length === 1 && nodes[0]?.summary ? { titleNodeSummary: nodes[0].summary } : {}),
    titleKey:
      nodes.length === 1
        ? 'chat.input.canvasContext.singleTitle'
        : 'chat.input.canvasContext.multiTitle',
    counts,
    previewNodes: nodes.slice(0, 3),
    actions: createAmbientCanvasActions({ selectedCount: nodes.length, shotCount, sceneCount }),
    shotCount,
    sceneCount,
    mediaCount,
  };
}

function createAmbientCanvasActions(input: {
  selectedCount: number;
  shotCount: number;
  sceneCount: number;
}): AmbientCanvasContextActionProjection[] {
  const actions: AmbientCanvasContextActionProjection[] = [];

  if (input.shotCount > 1) {
    actions.push({
      id: 'batch-generate-images',
      labelKey: 'chat.input.canvasContext.action.batchGenerate',
      promptKey: 'chat.input.canvasContext.prompt.batchGenerate',
    });
  } else if (input.shotCount === 1) {
    actions.push({
      id: 'generate-image',
      labelKey: 'chat.input.canvasContext.action.generateImage',
      promptKey: 'chat.input.canvasContext.prompt.generateImage',
    });
  }

  if (input.selectedCount > 1 || input.sceneCount > 0) {
    actions.push({
      id: 'optimize-selection',
      labelKey: 'chat.input.canvasContext.action.optimize',
      promptKey: 'chat.input.canvasContext.prompt.optimize',
    });
  }

  actions.push({
    id: 'understand-selection',
    labelKey: 'chat.input.canvasContext.action.understand',
    promptKey: 'chat.input.canvasContext.prompt.understand',
  });

  return actions;
}

function compareAmbientCanvasCounts(
  left: AmbientCanvasContextCountProjection,
  right: AmbientCanvasContextCountProjection,
): number {
  const leftPriority = getAmbientCanvasTypePriority(left.type);
  const rightPriority = getAmbientCanvasTypePriority(right.type);
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return left.type.localeCompare(right.type);
}

function getAmbientCanvasTypePriority(type: string): number {
  switch (type) {
    case 'shot':
      return 0;
    case 'scene':
      return 1;
    case 'media':
      return 2;
    default:
      return 10;
  }
}
