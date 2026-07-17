import type { CanvasLifecycleBlockData, CodeDiff, ContentBlock, ToolCall } from '@neko-agent/types';
import {
  projectCompositeBlockRichContent,
  type CompositeRichContentProjection,
} from './composite-content-presenter';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';

export type ContentBlockRenderKind =
  | 'thinking'
  | 'markdown'
  | 'tool'
  | 'toolGroup'
  | 'diff'
  | 'composite'
  | 'canvasLifecycle'
  | 'empty';

export type ContentBlockHeaderIconKind = 'thinking' | 'response' | 'tool' | 'edit' | 'composite';

export type ContentBlockHeaderTone = 'purple' | 'green' | 'blue' | 'orange' | 'yellow';

export interface ContentBlockHeaderProjection {
  iconKind: ContentBlockHeaderIconKind;
  label: string;
  tone: ContentBlockHeaderTone;
  timestamp: number;
  timestampLabel: string;
  showStreamingBadge: boolean;
  streamingLabel: string;
}

export interface ContentBlockProjectionBase {
  id: string;
  block: ContentBlock;
  header: ContentBlockHeaderProjection;
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

export interface ContentBlockProcessGroupProjection {
  id: string;
  projections: ContentBlockUiProjection[];
  blockCount: number;
  toolCallCount: number;
  thinkingCount: number;
  isStreaming: boolean;
}

export type ContentBlocksDisplayItem =
  | {
      kind: 'projection';
      projection: ContentBlockUiProjection;
    }
  | {
      kind: 'processGroup';
      processGroup: ContentBlockProcessGroupProjection;
    };

export interface ContentBlocksDisplayProjection {
  items: ContentBlocksDisplayItem[];
}

export interface ProjectContentBlockUiInput {
  block: ContentBlock;
  siblingBlocks?: readonly ContentBlock[];
  toolCalls?: readonly ToolCall[];
  ambientToolCalls?: readonly ToolCall[];
  parentIsStreaming?: boolean;
  formatTimestamp?: (timestamp: number) => string;
  plugins?: PluginsAvailable;
}

interface ContentBlockHeaderMetadata {
  iconKind: ContentBlockHeaderIconKind;
  label: string;
  tone: ContentBlockHeaderTone;
}

const USER_FACING_TOOL_NAMES = new Set(['ReadImage']);

const CONTENT_BLOCK_HEADER_METADATA: Record<ContentBlock['type'], ContentBlockHeaderMetadata> = {
  thinking: {
    iconKind: 'thinking',
    label: 'Thinking',
    tone: 'purple',
  },
  text: {
    iconKind: 'response',
    label: 'Response',
    tone: 'green',
  },
  tool_call: {
    iconKind: 'tool',
    label: 'Tool',
    tone: 'blue',
  },
  code_diff: {
    iconKind: 'edit',
    label: 'Edit',
    tone: 'orange',
  },
  composite: {
    iconKind: 'composite',
    label: 'Composite',
    tone: 'blue',
  },
  canvas_lifecycle: {
    iconKind: 'tool',
    label: 'Canvas',
    tone: 'blue',
  },
};

export function projectContentBlockUi(input: ProjectContentBlockUiInput): ContentBlockUiProjection {
  const parentIsStreaming = input.parentIsStreaming ?? false;
  const base = projectContentBlockBase(input.block, parentIsStreaming, input.formatTimestamp);

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
  formatTimestamp?: (timestamp: number) => string,
  siblingBlocks: readonly ContentBlock[] | undefined = blocks,
  toolCalls: readonly ToolCall[] | undefined = deriveToolCallsFromContentBlocks(siblingBlocks),
  plugins?: PluginsAvailable,
  ambientToolCalls?: readonly ToolCall[],
): ContentBlockUiProjection[] {
  if (!blocks || blocks.length === 0) return [];

  const projections = blocks
    .filter((block) => block.compositeSource === undefined)
    .map((block) =>
      projectContentBlockUi({
        block,
        siblingBlocks,
        toolCalls,
        ambientToolCalls,
        parentIsStreaming,
        formatTimestamp,
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

export function projectContentBlocksDisplay(
  projections: readonly ContentBlockUiProjection[],
): ContentBlocksDisplayProjection {
  const hasPrimaryResult = projections.some(isPrimaryResultProjection);
  if (!hasPrimaryResult) {
    return {
      items: projections.map((projection) => ({ kind: 'projection', projection })),
    };
  }

  const items: ContentBlocksDisplayItem[] = [];
  let processProjections: ContentBlockUiProjection[] = [];

  const flushProcessGroup = () => {
    if (processProjections.length === 0) return;
    items.push({
      kind: 'processGroup',
      processGroup: projectProcessGroup(processProjections),
    });
    processProjections = [];
  };

  for (const projection of projections) {
    if (isCollapsibleProcessProjection(projection)) {
      processProjections.push(projection);
      continue;
    }

    flushProcessGroup();
    items.push({ kind: 'projection', projection });
  }

  flushProcessGroup();

  return { items };
}

function formatContentBlockTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function projectContentBlockBase(
  block: ContentBlock,
  parentIsStreaming: boolean,
  formatTimestamp: ((timestamp: number) => string) | undefined,
): ContentBlockProjectionBase {
  const metadata = CONTENT_BLOCK_HEADER_METADATA[block.type];

  return {
    id: block.id,
    block,
    parentIsStreaming,
    header: {
      ...metadata,
      timestamp: block.timestamp,
      timestampLabel: formatTimestamp
        ? formatTimestamp(block.timestamp)
        : formatContentBlockTimestamp(block.timestamp),
      showStreamingBadge: block.isStreaming === true,
      streamingLabel: 'streaming...',
    },
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

function isPrimaryResultProjection(projection: ContentBlockUiProjection): boolean {
  switch (projection.renderKind) {
    case 'markdown':
      return projection.content.trim().length > 0;
    case 'composite':
    case 'canvasLifecycle':
    case 'diff':
      return true;
    case 'thinking':
    case 'tool':
    case 'toolGroup':
    case 'empty':
      return false;
  }
}

function isCollapsibleProcessProjection(projection: ContentBlockUiProjection): boolean {
  switch (projection.renderKind) {
    case 'thinking':
      return true;
    case 'tool':
      return isCollapsibleToolCall(projection.toolCall);
    case 'toolGroup':
      return projection.toolCalls.every(isCollapsibleToolCall);
    case 'markdown':
    case 'diff':
    case 'composite':
    case 'canvasLifecycle':
    case 'empty':
      return false;
  }
}

function isCollapsibleToolCall(toolCall: ToolCall): boolean {
  if (USER_FACING_TOOL_NAMES.has(toolCall.name)) return false;
  if (toolCall.pendingConfirmation === true) return false;
  if (!toolCall.result || toolCall.result.success !== true) return false;
  if ((toolCall.result.attachments?.length ?? 0) > 0) return false;
  if ((toolCall.result.perceptionCards?.length ?? 0) > 0) return false;
  if ((toolCall.result.artifacts?.length ?? 0) > 0) return false;
  return true;
}

function countProjectionToolCalls(projection: ContentBlockUiProjection): number {
  if (projection.renderKind === 'tool') return 1;
  if (projection.renderKind === 'toolGroup') return projection.count;
  return 0;
}

function isStreamingProjection(projection: ContentBlockUiProjection): boolean {
  if (projection.header.showStreamingBadge) return true;
  return projection.renderKind === 'thinking' && projection.isThinkingComplete === false;
}

function projectProcessGroup(
  projections: readonly ContentBlockUiProjection[],
): ContentBlockProcessGroupProjection {
  const first = projections[0];
  if (!first) {
    throw new Error('Cannot project an empty process group');
  }

  return {
    id: `${first.id}-process-records`,
    projections: [...projections],
    blockCount: projections.length,
    toolCallCount: projections.reduce(
      (count, projection) => count + countProjectionToolCalls(projection),
      0,
    ),
    thinkingCount: projections.filter((projection) => projection.renderKind === 'thinking').length,
    isStreaming: projections.some(isStreamingProjection),
  };
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
    header: first.header,
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
    !USER_FACING_TOOL_NAMES.has(toolCall.name) &&
    toolCall.pendingConfirmation !== true &&
    toolCall.result?.success === true &&
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
