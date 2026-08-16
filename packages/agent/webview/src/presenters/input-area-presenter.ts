import type {
  AgentConfigurationPolicyProjection,
  ConversationKind,
  SessionMode,
} from '@neko/agent-contracts';
import type { AmbientCanvasNodeProjection } from './plugin-transfer-presenter';

export interface InputAreaUiProjectionInput {
  presentation?: 'entry' | 'workspace' | 'conversation';
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
  configurationPolicy?: AgentConfigurationPolicyProjection;
  currentSessionMediaModelCount: number;
  compactControls?: boolean;
  submissionBlocked?: boolean;
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
  showModelConfig: boolean;
  inputPlaceholderKey:
    | 'chat.input.entryPlaceholder'
    | 'chat.input.placeholder'
    | 'chat.input.thinkingPlaceholder'
    | 'chat.input.queuePlaceholder';
  sendTitleKey: 'chat.input.send' | 'chat.input.queue';
}

export type AmbientCanvasContextActionId = 'create-job' | 'understand-selection';

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
  mediaCount: number;
  jobCount: number;
}

export function projectInputAreaUi(input: InputAreaUiProjectionInput): InputAreaUiProjection {
  const isInitialPresentation =
    input.presentation === 'entry' || input.presentation === 'workspace';
  const hasText = input.inputValue.trim().length > 0;
  const hasAttachments = input.attachedFileCount > 0;
  const hasContextChips = input.contextChipCount > 0;
  const hasAmbientNodes = input.ambientNodeCount > 0;
  const queuedMessageCount = Math.max(0, input.queuedMessageCount ?? 0);
  const isCharacterRoleSession =
    input.conversationKind === 'character-dialogue' ||
    input.conversationKind === 'embody-character';
  const isAgentMode = input.sessionMode === 'agent';
  const modelPolicy = input.configurationPolicy?.fields.model.policy.status ?? 'editable';
  const executionModePolicy =
    input.configurationPolicy?.fields.executionMode.policy.status ?? 'editable';
  const hasQueueableContent = hasText || hasAttachments || hasContextChips;
  const canQueue =
    input.isThinking &&
    !input.disabled &&
    !input.submissionBlocked &&
    !isCharacterRoleSession &&
    isAgentMode &&
    hasQueueableContent;
  const hasCurrentSessionMediaModels = input.currentSessionMediaModelCount > 0;

  return {
    hasText,
    hasAttachments,
    hasContextChips,
    hasAmbientNodes,
    canSend:
      !input.disabled &&
      !input.submissionBlocked &&
      ((!input.isThinking && (hasText || hasAttachments || hasContextChips)) || canQueue),
    canQueue,
    canCancel: input.isThinking && !input.disabled,
    queuedMessageCount,
    showQueuedMessages: queuedMessageCount > 0,
    showSuggestionChips: hasContextChips,
    showContextChips: hasContextChips,
    showAmbientNodes: hasAmbientNodes,
    showMediaCallCount: !isCharacterRoleSession && input.mediaModelCallCount > 0,
    showExecutionModeSelector: executionModePolicy !== 'unavailable' && isAgentMode,
    showModelConfig: modelPolicy !== 'unavailable' && (isAgentMode || hasCurrentSessionMediaModels),
    inputPlaceholderKey: isInitialPresentation
      ? 'chat.input.entryPlaceholder'
      : queuedMessageCount > 0
        ? 'chat.input.queuePlaceholder'
        : input.isThinking
          ? 'chat.input.thinkingPlaceholder'
          : 'chat.input.placeholder',
    sendTitleKey: canQueue ? 'chat.input.queue' : 'chat.input.send',
  };
}

const AMBIENT_CANVAS_COUNT_LABEL_KEYS: Record<string, string> = {
  markdown: 'chat.input.canvasContext.count.markdown',
  media: 'chat.input.canvasContext.count.media',
  group: 'chat.input.canvasContext.count.groups',
  job: 'chat.input.canvasContext.count.jobs',
  file: 'chat.input.canvasContext.count.files',
  'canvas-embed': 'chat.input.canvasContext.count.canvases',
};

export function projectAmbientCanvasContext(
  nodes: readonly AmbientCanvasNodeProjection[],
): AmbientCanvasContextProjection | null {
  if (nodes.length === 0) return null;

  const countsByType = new Map<string, number>();
  for (const node of nodes) {
    countsByType.set(node.type, (countsByType.get(node.type) ?? 0) + 1);
  }

  const mediaCount = countsByType.get('media') ?? 0;
  const jobCount = countsByType.get('job') ?? 0;
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
    actions: createAmbientCanvasActions(),
    mediaCount,
    jobCount,
  };
}

function createAmbientCanvasActions(): AmbientCanvasContextActionProjection[] {
  return [
    {
      id: 'create-job',
      labelKey: 'chat.input.canvasContext.action.createJob',
      promptKey: 'chat.input.canvasContext.prompt.createJob',
    },
    {
      id: 'understand-selection',
      labelKey: 'chat.input.canvasContext.action.understand',
      promptKey: 'chat.input.canvasContext.prompt.understand',
    },
  ];
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
    case 'markdown':
      return 0;
    case 'media':
      return 1;
    case 'group':
      return 2;
    case 'job':
      return 3;
    case 'file':
      return 4;
    case 'canvas-embed':
      return 5;
    default:
      return 10;
  }
}
