import type {
  CanvasLifecycleBlockData,
  CodeDiff,
  ContentBlock,
  ToolCall,
  ToolCallProgress,
  MessageTurnTiming,
} from '@neko/agent-contracts';
import {
  projectCompositeBlockRichContent,
  type CompositeRichContentProjection,
} from './composite-content-presenter';
import type { PluginsAvailable } from '../components/ChatView/SendToMenu';
import { projectToolCallDisplayState } from './tool-call-presenter';

export type ContentBlockRenderKind =
  | 'thinking'
  | 'markdown'
  | 'tool'
  | 'toolGroup'
  | 'diff'
  | 'composite'
  | 'canvasLifecycle'
  | 'empty';

export interface ContentBlockProjectionBase {
  id: string;
  block: ContentBlock;
  timestamp: number;
  isStreaming: boolean;
  parentIsStreaming: boolean;
}

export interface ThinkingContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'thinking';
  thinking: string;
  isThinkingComplete?: boolean;
}

export interface MarkdownContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'markdown';
  content: string;
  renderStreaming: boolean;
  siblingBlocks?: readonly ContentBlock[];
  toolCalls?: readonly ToolCall[];
}

export interface ToolContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'tool';
  toolCall: ToolCall;
  toolProgress?: ToolCallProgress;
}

export interface ToolGroupContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'toolGroup';
  toolCalls: ToolCall[];
  toolName: string;
  count: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
  targetLabel: string | null;
  durationLabel: string | null;
}

export interface DiffContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'diff';
  codeDiff: CodeDiff;
}

export interface CompositeContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'composite';
  richContent: CompositeRichContentProjection;
}

export interface CanvasLifecycleContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'canvasLifecycle';
  canvasLifecycle: CanvasLifecycleBlockData;
}

export interface EmptyContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'empty';
}

export type ContentBlockUiProjection =
  | ThinkingContentBlockProjection
  | MarkdownContentBlockProjection
  | ToolContentBlockProjection
  | ToolGroupContentBlockProjection
  | DiffContentBlockProjection
  | CompositeContentBlockProjection
  | CanvasLifecycleContentBlockProjection
  | EmptyContentBlockProjection;

export interface AssistantTurnActivitySummary {
  readonly blockCount: number;
  readonly toolCallCount: number;
  readonly thinkingCount: number;
  readonly isRunning: boolean;
  readonly startedAt?: number;
  readonly completedAt?: number;
}

export interface AssistantTurnProjection {
  readonly answer: readonly ContentBlockUiProjection[];
  readonly deliverables: readonly ContentBlockUiProjection[];
  readonly actionable: readonly ContentBlockUiProjection[];
  readonly activity: readonly ContentBlockUiProjection[];
  readonly activitySummary: AssistantTurnActivitySummary;
}

interface ProjectContentBlockUiInput {
  block: ContentBlock;
  siblingBlocks?: readonly ContentBlock[];
  toolCalls?: readonly ToolCall[];
  ambientToolCalls?: readonly ToolCall[];
  parentIsStreaming?: boolean;
  plugins?: PluginsAvailable;
}

function projectContentBlockUi(input: ProjectContentBlockUiInput): ContentBlockUiProjection {
  const parentIsStreaming = input.parentIsStreaming ?? false;
  const base = projectContentBlockBase(input.block, parentIsStreaming);

  switch (input.block.type) {
    case 'thinking':
      return {
        ...base,
        renderKind: 'thinking',
        thinking: input.block.thinking ?? '',
        isThinkingComplete: input.block.isThinkingComplete,
      };
    case 'text':
      if (!input.block.content) {
        return { ...base, renderKind: 'empty' };
      }
      return {
        ...base,
        renderKind: 'markdown',
        content: input.block.content,
        renderStreaming: input.block.isStreaming === true,
        ...(input.siblingBlocks ? { siblingBlocks: input.siblingBlocks } : {}),
        ...(input.toolCalls || input.ambientToolCalls
          ? {
              toolCalls: mergeToolCalls(input.toolCalls, input.ambientToolCalls),
            }
          : {}),
      };
    case 'tool_call':
      if (!input.block.toolCall) {
        return { ...base, renderKind: 'empty' };
      }
      return {
        ...base,
        renderKind: 'tool',
        toolCall: input.block.toolCall,
        ...(input.block.toolProgress ? { toolProgress: input.block.toolProgress } : {}),
      };
    case 'code_diff':
      if (!input.block.codeDiff) {
        return { ...base, renderKind: 'empty' };
      }
      return {
        ...base,
        renderKind: 'diff',
        codeDiff: input.block.codeDiff,
      };
    case 'composite':
      if (!input.block.composite) {
        return { ...base, renderKind: 'empty' };
      }
      return {
        ...base,
        renderKind: 'composite',
        richContent: projectCompositeBlockRichContent({
          composite: input.block.composite,
          siblingBlocks: input.siblingBlocks,
          toolCalls: mergeToolCalls(input.toolCalls, input.ambientToolCalls),
          plugins: input.plugins,
        }),
      };
    case 'canvas_lifecycle':
      if (!input.block.canvasLifecycle) {
        return { ...base, renderKind: 'empty' };
      }
      return {
        ...base,
        renderKind: 'canvasLifecycle',
        canvasLifecycle: input.block.canvasLifecycle,
      };
  }
}

export function projectContentBlocksUi(
  blocks: readonly ContentBlock[] | undefined,
  parentIsStreaming = false,
  siblingBlocks: readonly ContentBlock[] | undefined = blocks,
  toolCalls: readonly ToolCall[] | undefined = deriveToolCallsFromContentBlocks(siblingBlocks),
  plugins?: PluginsAvailable,
  ambientToolCalls?: readonly ToolCall[],
): ContentBlockUiProjection[] {
  if (!blocks || blocks.length === 0) return [];

  const projections = blocks.map((block) =>
    projectContentBlockUi({
      block,
      siblingBlocks,
      toolCalls,
      ambientToolCalls,
      parentIsStreaming,
      plugins,
    }),
  );

  return aggregateConsecutiveToolProjections(projections);
}

export function deriveToolCallsFromContentBlocks(
  blocks: readonly ContentBlock[] | undefined,
): ToolCall[] {
  return (
    blocks
      ?.map((block) => (block.type === 'tool_call' ? block.toolCall : undefined))
      .filter((toolCall): toolCall is ToolCall => toolCall !== undefined) ?? []
  );
}

export function mergeToolCalls(
  primary: readonly ToolCall[] | undefined,
  ambient: readonly ToolCall[] | undefined,
): ToolCall[] | undefined {
  if ((!primary || primary.length === 0) && (!ambient || ambient.length === 0)) {
    return undefined;
  }
  const byId = new Map<string, ToolCall>();
  for (const toolCall of ambient ?? []) {
    byId.set(toolCall.id, toolCall);
  }
  for (const toolCall of primary ?? []) {
    byId.set(toolCall.id, toolCall);
  }
  return Array.from(byId.values());
}

export function projectAssistantTurn(
  projections: readonly ContentBlockUiProjection[],
  turnTiming?: MessageTurnTiming,
): AssistantTurnProjection {
  const visible = projections.filter((projection) => projection.renderKind !== 'empty');
  const parentIsStreaming = visible.some((projection) => projection.parentIsStreaming);
  const lastActivityIndex = findLastIndex(visible, isActivityProjection);
  const activeAnswerIndex = parentIsStreaming
    ? findLastIndex(
        visible,
        (projection) => projection.renderKind === 'markdown' && projection.renderStreaming,
      )
    : -1;
  const answerStartIndex = parentIsStreaming
    ? activeAnswerIndex > lastActivityIndex
      ? activeAnswerIndex
      : visible.length
    : lastActivityIndex + 1;

  const answer: ContentBlockUiProjection[] = [];
  const deliverables: ContentBlockUiProjection[] = [];
  const actionable: ContentBlockUiProjection[] = [];
  const activity: ContentBlockUiProjection[] = [];

  visible.forEach((projection, index) => {
    if (isActionableProjection(projection)) {
      actionable.push(projection);
      return;
    }
    if (isDeliverableProjection(projection)) {
      deliverables.push(projection);
      return;
    }
    if (projection.renderKind === 'markdown' && index >= answerStartIndex) {
      answer.push(projection);
      return;
    }
    activity.push(projection);
  });

  return {
    answer,
    deliverables,
    actionable,
    activity,
    activitySummary: {
      blockCount: activity.length,
      toolCallCount: activity.reduce(
        (count, projection) => count + countProjectionToolCalls(projection),
        0,
      ),
      thinkingCount: activity.filter((projection) => projection.renderKind === 'thinking').length,
      isRunning: parentIsStreaming,
      ...(turnTiming ? { startedAt: turnTiming.startedAt } : {}),
      ...(turnTiming?.completedAt === undefined ? {} : { completedAt: turnTiming.completedAt }),
    },
  };
}

function projectContentBlockBase(
  block: ContentBlock,
  parentIsStreaming: boolean,
): ContentBlockProjectionBase {
  return {
    id: block.id,
    block,
    timestamp: block.timestamp,
    isStreaming: block.isStreaming === true,
    parentIsStreaming,
  };
}

function aggregateConsecutiveToolProjections(
  projections: readonly ContentBlockUiProjection[],
): ContentBlockUiProjection[] {
  const aggregated: ContentBlockUiProjection[] = [];
  let index = 0;

  while (index < projections.length) {
    const projection = projections[index];
    if (!projection || projection.renderKind !== 'tool' || !isAggregatableTool(projection)) {
      if (projection) aggregated.push(projection);
      index += 1;
      continue;
    }

    const group = [projection];
    const key = getToolAggregationKey(projection.toolCall);
    index += 1;

    while (index < projections.length) {
      const next = projections[index];
      if (
        !next ||
        next.renderKind !== 'tool' ||
        !isAggregatableTool(next) ||
        getToolAggregationKey(next.toolCall) !== key
      ) {
        break;
      }
      group.push(next);
      index += 1;
    }

    if (group.length < 2) {
      aggregated.push(...group);
      continue;
    }

    aggregated.push(projectToolGroup(group));
  }

  return aggregated;
}

function isActivityProjection(projection: ContentBlockUiProjection): boolean {
  switch (projection.renderKind) {
    case 'thinking':
    case 'tool':
    case 'toolGroup':
      return true;
    case 'markdown':
    case 'composite':
    case 'canvasLifecycle':
    case 'diff':
    case 'empty':
      return false;
  }
}

function isActionableProjection(projection: ContentBlockUiProjection): boolean {
  switch (projection.renderKind) {
    case 'tool':
      return (
        projection.toolCall.pendingConfirmation === true ||
        projection.toolCall.result?.success === false
      );
    case 'toolGroup':
      return projection.failureCount > 0;
    case 'canvasLifecycle':
      return projection.canvasLifecycle.success === false;
    case 'thinking':
    case 'markdown':
    case 'diff':
    case 'composite':
    case 'empty':
      return false;
  }
}

function isDeliverableProjection(projection: ContentBlockUiProjection): boolean {
  switch (projection.renderKind) {
    case 'diff':
    case 'composite':
    case 'canvasLifecycle':
      return true;
    case 'tool':
      return hasTypedToolDeliverable(projection.toolCall);
    case 'toolGroup':
      return projection.toolCalls.some(hasTypedToolDeliverable);
    case 'thinking':
    case 'markdown':
    case 'empty':
      return false;
  }
}

function hasTypedToolDeliverable(toolCall: ToolCall): boolean {
  if ((toolCall.result?.artifacts?.length ?? 0) > 0) return true;
  if (projectToolCallDisplayState(toolCall).documentThumbnails.length > 0) return false;
  return (
    (toolCall.result?.attachments?.length ?? 0) > 0 &&
    (toolCall.result?.perceptionCards?.length ?? 0) === 0
  );
}

function countProjectionToolCalls(projection: ContentBlockUiProjection): number {
  if (projection.renderKind === 'tool') return 1;
  if (projection.renderKind === 'toolGroup') return projection.count;
  return 0;
}

function projectToolGroup(
  projections: readonly ToolContentBlockProjection[],
): ToolGroupContentBlockProjection {
  const first = projections[0];
  if (!first) {
    throw new Error('Cannot project an empty tool group');
  }
  const toolCalls = projections.map((projection) => projection.toolCall);
  const durations = toolCalls
    .map((toolCall) => toolCall.result?.duration)
    .filter((duration): duration is number => typeof duration === 'number' && duration >= 0);

  return {
    id: `${first.id}-group-${toolCalls.length}`,
    block: first.block,
    timestamp: first.timestamp,
    isStreaming: first.isStreaming,
    parentIsStreaming: first.parentIsStreaming,
    renderKind: 'toolGroup',
    toolCalls,
    toolName: first.toolCall.name,
    count: toolCalls.length,
    successCount: toolCalls.filter((toolCall) => toolCall.result?.success === true).length,
    failureCount: toolCalls.filter((toolCall) => toolCall.result?.success === false).length,
    pendingCount: toolCalls.filter((toolCall) => !toolCall.result).length,
    targetLabel: getToolTargetLabel(first.toolCall),
    durationLabel: formatDurationRange(durations),
  };
}

function isAggregatableTool(projection: ToolContentBlockProjection): boolean {
  const toolCall = projection.toolCall;
  return (
    toolCall.pendingConfirmation !== true &&
    toolCall.result !== undefined &&
    getToolTargetLabel(toolCall) !== null
  );
}

function getToolAggregationKey(toolCall: ToolCall): string {
  return `${toolCall.name}:${getToolTargetLabel(toolCall) ?? ''}`;
}

function getToolTargetLabel(toolCall: ToolCall): string | null {
  return readToolTargetLabel(toolCall.arguments) ?? readToolTargetLabel(toolCall.result?.data);
}

function readToolTargetLabel(value: unknown): string | null {
  if (!isRecord(value)) return null;

  return (
    readToolString(value, 'file_path') ??
    readToolString(value, 'filePath') ??
    readToolString(value, 'path') ??
    readToolString(value, 'url') ??
    readToolString(value, 'cursor_ref') ??
    readToolString(value, 'input_ref') ??
    readToolString(value, 'unit_ref') ??
    readToolString(value.source, 'file_path') ??
    readToolString(value.source, 'filePath') ??
    readToolString(value.source, 'path') ??
    readToolString(value.source, 'url') ??
    null
  );
}

function readToolString(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const field = value[key];
  return typeof field === 'string' && field.trim().length > 0 ? field.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatDurationRange(durations: readonly number[]): string | null {
  if (durations.length === 0) return null;

  const min = Math.min(...durations);
  const max = Math.max(...durations);
  if (min === max) return `${min}ms`;
  return `${min}-${max}ms`;
}

function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item !== undefined && predicate(item)) return index;
  }
  return -1;
}
