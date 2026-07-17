import type { AgentEvent } from '@neko/agent';
import {
  applyToolResultBackfillToResult,
  type AgentTurnTimelineAccumulatorUpdate,
  type BackfillableToolResult,
} from '@neko/agent/runtime';
import type {
  AgentTurnTimelineItem,
  AgentTurnTimelineOperation,
  AgentWorkItem,
  MediaTaskCreatedMessage,
  MediaTaskProgressMessage,
  TaskCreatedMessage,
  TaskUpdatedMessage,
  ToolCall,
} from '@neko-agent/types';
import { getToolSummary } from '@neko-agent/types';
import { collectTuiArtifactReferences } from './artifact-reference-formatter';
import { projectToolResultArtifactFacts } from './artifact-fact-projector';
import type { AgentTerminalPresentationContext } from '../presentation/context';
import { presentArtifactReference } from '../presentation/artifact-presentation';
import type { AgentTerminalMessageKey } from '../presentation/terminal-messages';
import type {
  TerminalTimelineParentAnchor,
  TerminalTimelineRow,
  TerminalTimelineRowStatus,
} from '../types/state';

export type TerminalTimelineMessage =
  | AgentTurnTimelineAccumulatorUpdate
  | MediaTaskCreatedMessage
  | MediaTaskProgressMessage
  | TaskCreatedMessage
  | TaskUpdatedMessage;

export interface TerminalTimelineProjector {
  readonly projectEvent: (event: AgentEvent) => TerminalTimelineRow[];
  readonly projectMessage: (message: TerminalTimelineMessage) => TerminalTimelineRow[];
  readonly reset: () => void;
}

export interface TerminalTimelineProjectorOptions {
  readonly presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>;
  readonly now?: () => number;
}

interface ToolProjectionState {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  readonly rowId: string;
  readonly result?: BackfillableToolResult;
}

interface ActiveTextProjectionState {
  readonly id: string;
  readonly sequence: number;
  readonly kind: 'assistant_text' | 'thinking';
  readonly content: string;
}

interface TimelineItemProjectionState {
  readonly item: AgentTurnTimelineItem;
}

export function createTerminalTimelineProjector(
  options: TerminalTimelineProjectorOptions,
): TerminalTimelineProjector {
  let sequence = 0;
  let activeText: ActiveTextProjectionState | null = null;
  let activeThinking: ActiveTextProjectionState | null = null;
  const toolsById = new Map<string, ToolProjectionState>();
  const rowsByItemId = new Set<string>();
  const timelineItemsById = new Map<string, TimelineItemProjectionState>();

  const nextSequence = (): number => {
    sequence += 1;
    return sequence;
  };

  const now = (): number => options.now?.() ?? Date.now();

  const buildRow = (
    row: Omit<TerminalTimelineRow, 'sequence' | 'timestamp'> & {
      readonly sequence?: number;
      readonly timestamp?: number;
    },
  ): TerminalTimelineRow => ({
    ...row,
    sequence: row.sequence ?? nextSequence(),
    timestamp: row.timestamp ?? now(),
  });

  const diagnostic = (
    code: OwnedTimelineDiagnosticCode,
    parent?: TerminalTimelineParentAnchor,
  ): TerminalTimelineRow => {
    const rowSequence = nextSequence();
    return {
      id: `diagnostic-${rowSequence}`,
      sequence: rowSequence,
      kind: 'diagnostic',
      status: 'error',
      diagnosticCode: code,
      ...(parent ? { parent } : {}),
      timestamp: now(),
    };
  };

  const closeActiveText = (): TerminalTimelineRow[] => {
    const rows: TerminalTimelineRow[] = [];
    if (activeThinking) {
      rows.push(
        buildRow({
          id: activeThinking.id,
          sequence: activeThinking.sequence,
          kind: 'thinking',
          status: 'complete',
          content: activeThinking.content,
        }),
      );
      activeThinking = null;
    }
    if (activeText) {
      rows.push(
        buildRow({
          id: activeText.id,
          sequence: activeText.sequence,
          kind: 'assistant_text',
          status: 'complete',
          content: activeText.content,
        }),
      );
      activeText = null;
    }
    return rows;
  };

  const closeActiveThinking = (): TerminalTimelineRow[] => {
    if (!activeThinking) return [];
    const row = buildRow({
      id: activeThinking.id,
      sequence: activeThinking.sequence,
      kind: 'thinking',
      status: 'complete',
      content: activeThinking.content,
    });
    activeThinking = null;
    return [row];
  };

  return {
    projectEvent(event) {
      switch (event.type) {
        case 'assistant_text_replacement': {
          const rows = closeActiveThinking();
          if (!activeText) {
            const rowSequence = nextSequence();
            activeText = {
              id: `text-${rowSequence}`,
              sequence: rowSequence,
              kind: 'assistant_text',
              content: '',
            };
          } else {
            activeText = {
              ...activeText,
              content: '',
            };
          }
          rows.push(
            buildRow({
              id: activeText.id,
              sequence: activeText.sequence,
              kind: 'assistant_text',
              status: 'streaming',
              content: '',
            }),
          );
          return rows;
        }

        case 'thinking':
        case 'thinking_content': {
          const content = event.thinking ?? event.reasoningContent ?? '';
          if (!activeThinking) {
            const rowSequence = nextSequence();
            activeThinking = {
              id: `thinking-${rowSequence}`,
              sequence: rowSequence,
              kind: 'thinking',
              content: '',
            };
          }
          activeThinking = {
            ...activeThinking,
            content: activeThinking.content + content,
          };
          return [
            buildRow({
              id: activeThinking.id,
              sequence: activeThinking.sequence,
              kind: 'thinking',
              status: 'streaming',
              content: activeThinking.content,
            }),
          ];
        }

        case 'text':
        case 'text_delta': {
          const rows = closeActiveThinking();
          if (!activeText) {
            const rowSequence = nextSequence();
            activeText = {
              id: `text-${rowSequence}`,
              sequence: rowSequence,
              kind: 'assistant_text',
              content: '',
            };
          }
          activeText = {
            ...activeText,
            content: activeText.content + (event.content ?? ''),
          };
          rows.push(
            buildRow({
              id: activeText.id,
              sequence: activeText.sequence,
              kind: 'assistant_text',
              status: event.type === 'text' ? 'complete' : 'streaming',
              content: activeText.content,
            }),
          );
          if (event.type === 'text') {
            activeText = null;
          }
          return rows;
        }

        case 'tool_call': {
          const rows = closeActiveText();
          const toolCall = event.toolCall;
          if (!toolCall) {
            return [...rows, diagnostic('missing-tool-call')];
          }
          const rowId = `tool-${toolCall.id}`;
          toolsById.set(toolCall.id, {
            id: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
            rowId,
          });
          rows.push(
            buildRow({
              id: rowId,
              kind: 'tool',
              status: 'running',
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              toolArguments: toolCall.arguments,
              argsSummary: summarizeArgs(toolCall.name, toolCall.arguments),
            }),
          );
          return rows;
        }

        case 'tool_progress': {
          const progress = event.toolProgress;
          if (!progress?.toolCallId) {
            return [diagnostic('missing-tool-progress-anchor')];
          }
          const tool = toolsById.get(progress.toolCallId);
          if (!tool) {
            return [
              diagnostic('unknown-tool-progress-anchor', { kind: 'tool', id: progress.toolCallId }),
            ];
          }
          return [
            buildRow({
              id: tool.rowId,
              kind: 'tool',
              status: 'running',
              parent: { kind: 'tool', id: progress.toolCallId },
              toolCallId: progress.toolCallId,
              toolName: progress.toolName || tool.name,
              toolArguments: tool.arguments,
              progress: progress.percent,
              details: joinDetails(progress.stage, progress.preview),
            }),
          ];
        }

        case 'tool_confirmation': {
          const confirmation = event.toolConfirmation;
          const toolCallId = confirmation?.toolCall.id;
          if (!toolCallId) {
            return [diagnostic('missing-tool-confirmation-anchor')];
          }
          const tool = toolsById.get(toolCallId);
          if (!tool) {
            return [
              diagnostic('unknown-tool-confirmation-anchor', { kind: 'tool', id: toolCallId }),
            ];
          }
          return [
            buildRow({
              id: tool.rowId,
              kind: 'tool',
              status: 'waiting',
              parent: { kind: 'tool', id: toolCallId },
              toolCallId,
              toolName: confirmation?.toolCall.name ?? tool.name,
              toolArguments: tool.arguments,
              confirmationSummary: joinDetails(confirmation?.action, confirmation?.description),
            }),
          ];
        }

        case 'tool_result': {
          const rows = closeActiveText();
          const result = event.toolResult;
          if (!result?.toolCallId) {
            return [...rows, diagnostic('missing-tool-result-anchor')];
          }
          const tool = toolsById.get(result.toolCallId);
          if (!tool) {
            return [
              ...rows,
              diagnostic('unknown-tool-result-anchor', { kind: 'tool', id: result.toolCallId }),
            ];
          }
          const projectedResult = toBackfillableToolResult(result);
          toolsById.set(result.toolCallId, { ...tool, result: projectedResult });
          rows.push(
            buildRow({
              id: tool.rowId,
              kind: 'tool',
              status: projectedResult.success ? 'success' : 'error',
              parent: { kind: 'tool', id: result.toolCallId },
              toolCallId: result.toolCallId,
              toolName: tool.name,
              toolArguments: tool.arguments,
              toolResult: projectedResult.data,
              ...projectArtifactFacts(result, result.toolCallId),
              ...(projectedResult.error ? { toolError: projectedResult.error } : {}),
              resultSummary: summarizeToolResult(result, options.presentation),
            }),
          );
          return rows;
        }

        case 'tool_result_backfill': {
          const backfill = event.toolResultBackfill;
          if (!backfill?.toolCallId) {
            return [diagnostic('missing-tool-backfill-anchor')];
          }
          const tool = toolsById.get(backfill.toolCallId);
          if (!tool) {
            return [
              diagnostic('unknown-tool-backfill-anchor', { kind: 'tool', id: backfill.toolCallId }),
            ];
          }
          const mergedResult = applyToolResultBackfillToResult(tool.result, backfill).result;
          toolsById.set(backfill.toolCallId, { ...tool, result: mergedResult });
          return [
            buildRow({
              id: tool.rowId,
              kind: 'tool',
              status: mergedResult.success ? 'success' : 'error',
              parent: { kind: 'tool', id: backfill.toolCallId },
              toolCallId: backfill.toolCallId,
              toolName: tool.name,
              toolArguments: tool.arguments,
              toolResult: mergedResult.data,
              ...projectArtifactFacts(mergedResult, backfill.toolCallId),
              ...(mergedResult.error ? { toolError: mergedResult.error } : {}),
              backfillSummary: summarizeBackfill(backfill.dataPatch, options.presentation),
            }),
          ];
        }

        case 'error': {
          const rows = closeActiveText();
          const rowSequence = nextSequence();
          return [
            ...rows,
            {
              id: `error-${rowSequence}`,
              sequence: rowSequence,
              kind: 'error',
              status: 'error',
              ...(event.error?.message?.trim() ? { content: event.error.message } : {}),
              timestamp: now(),
            },
          ];
        }

        case 'done':
          return closeActiveText();

        default:
          return [];
      }
    },

    projectMessage(message) {
      switch (message.type) {
        case 'agentTurnTimelineUpdate':
          return projectTimelineOperations({
            operations: message.operations,
            timelineItemsById,
            rowsByItemId,
            toolsById,
            presentation: options.presentation,
            buildRow,
            diagnostic,
            now,
            observeSequence: (itemSequence) => {
              sequence = Math.max(sequence, itemSequence);
            },
          });
        case 'mediaTaskCreated':
        case 'mediaTaskProgress':
        case 'taskCreated':
        case 'taskUpdated':
          return projectWorkItem(message.workItem, buildRow);
      }
    },

    reset() {
      sequence = 0;
      activeText = null;
      activeThinking = null;
      toolsById.clear();
      rowsByItemId.clear();
      timelineItemsById.clear();
    },
  };
}

interface ProjectTimelineOperationsInput {
  readonly operations: readonly AgentTurnTimelineOperation[];
  readonly timelineItemsById: Map<string, TimelineItemProjectionState>;
  readonly rowsByItemId: Set<string>;
  readonly toolsById: Map<string, ToolProjectionState>;
  readonly presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>;
  readonly buildRow: (
    row: Omit<TerminalTimelineRow, 'sequence' | 'timestamp'> & {
      readonly sequence?: number;
      readonly timestamp?: number;
    },
  ) => TerminalTimelineRow;
  readonly diagnostic: (
    code: OwnedTimelineDiagnosticCode,
    parent?: TerminalTimelineParentAnchor,
  ) => TerminalTimelineRow;
  readonly now: () => number;
  readonly observeSequence: (sequence: number) => void;
}

function projectTimelineOperations(input: ProjectTimelineOperationsInput): TerminalTimelineRow[] {
  const rows: TerminalTimelineRow[] = [];
  for (const operation of input.operations) {
    const applied = applyTimelineOperation(operation, input.timelineItemsById);
    if ('diagnostic' in applied) {
      rows.push(input.diagnostic(applied.diagnostic.code, applied.diagnostic.parent));
      continue;
    }

    const item = applied.item;
    input.observeSequence(item.sequence);
    if (item.kind === 'tool_call') {
      const toolCall = item.payload.toolCall;
      input.toolsById.set(toolCall.id, {
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
        rowId: item.itemId,
        ...(toolCall.result ? { result: toBackfillableToolResult(toolCall.result) } : {}),
      });
    }
    rows.push(
      ...projectTimelineItem(
        item,
        input.rowsByItemId,
        input.buildRow,
        input.presentation,
        input.now,
      ),
    );
  }
  return rows;
}

type OwnedTimelineDiagnosticCode =
  | 'missing-tool-call'
  | 'missing-tool-progress-anchor'
  | 'unknown-tool-progress-anchor'
  | 'missing-tool-confirmation-anchor'
  | 'unknown-tool-confirmation-anchor'
  | 'missing-tool-result-anchor'
  | 'unknown-tool-result-anchor'
  | 'missing-tool-backfill-anchor'
  | 'unknown-tool-backfill-anchor'
  | 'timeline-item-kind-mismatch'
  | 'timeline-append-non-text-item'
  | 'timeline-source-generation-mismatch'
  | 'timeline-complete-missing-item'
  | 'timeline-complete-identity-mismatch'
  | 'timeline-duplicate-item-revision'
  | 'timeline-stale-item-revision'
  | 'unknown-parent-item-anchor';

type TimelineOperationApplyResult =
  | { readonly item: AgentTurnTimelineItem }
  | {
      readonly diagnostic: {
        readonly code: OwnedTimelineDiagnosticCode;
        readonly parent?: TerminalTimelineParentAnchor;
      };
    };

function applyTimelineOperation(
  operation: AgentTurnTimelineOperation,
  itemsById: Map<string, TimelineItemProjectionState>,
): TimelineOperationApplyResult {
  switch (operation.operation) {
    case 'append': {
      const incoming = operation.item;
      const existing = itemsById.get(incoming.itemId)?.item;
      const revisionError = validateNextItemRevision(existing, incoming);
      if (revisionError) return revisionError;
      if (existing && existing.kind !== incoming.kind) {
        return invalidTimelineOperation('timeline-item-kind-mismatch', incoming.itemId);
      }
      if (existing && !isTimelineTextItem(existing)) {
        return invalidTimelineOperation('timeline-append-non-text-item', incoming.itemId);
      }
      if (
        existing &&
        isTimelineTextItem(existing) &&
        existing.payload.sourceGeneration !== incoming.payload.sourceGeneration
      ) {
        return invalidTimelineOperation('timeline-source-generation-mismatch', incoming.itemId);
      }
      const item: typeof incoming = existing
        ? {
            ...incoming,
            payload: {
              ...incoming.payload,
              content: `${existing.payload.content}${incoming.payload.content}`,
            },
          }
        : incoming;
      itemsById.set(item.itemId, { item });
      return { item };
    }
    case 'replace':
    case 'upsert': {
      const item = operation.item;
      const revisionError = validateNextItemRevision(itemsById.get(item.itemId)?.item, item);
      if (revisionError) return revisionError;
      itemsById.set(item.itemId, { item });
      return { item };
    }
    case 'snapshot': {
      const item = operation.item;
      itemsById.set(item.itemId, { item });
      return { item };
    }
    case 'complete': {
      const existing = itemsById.get(operation.itemId)?.item;
      if (!existing || !isTimelineTextItem(existing)) {
        return invalidTimelineOperation('timeline-complete-missing-item', operation.itemId);
      }
      const revisionError = validateMonotonicItemRevision(
        existing.itemRevision,
        operation.itemRevision,
        operation.itemId,
      );
      if (revisionError) return revisionError;
      if (
        operation.kind !== existing.kind ||
        operation.sourceGeneration !== existing.payload.sourceGeneration
      ) {
        return invalidTimelineOperation('timeline-complete-identity-mismatch', operation.itemId);
      }
      const item: typeof existing = {
        ...existing,
        itemRevision: operation.itemRevision,
        status: operation.status,
        updatedAt: operation.updatedAt,
      };
      itemsById.set(item.itemId, { item });
      return { item };
    }
  }
}

function validateNextItemRevision(
  existing: AgentTurnTimelineItem | undefined,
  incoming: AgentTurnTimelineItem,
): TimelineOperationApplyResult | null {
  if (!existing) return null;
  return validateMonotonicItemRevision(
    existing.itemRevision,
    incoming.itemRevision,
    incoming.itemId,
  );
}

function validateMonotonicItemRevision(
  previousRevision: number,
  incomingRevision: number,
  itemId: string,
): TimelineOperationApplyResult | null {
  if (incomingRevision > previousRevision) return null;
  const duplicate = incomingRevision === previousRevision;
  return invalidTimelineOperation(
    duplicate ? 'timeline-duplicate-item-revision' : 'timeline-stale-item-revision',
    itemId,
  );
}

function invalidTimelineOperation(
  code: Extract<OwnedTimelineDiagnosticCode, `timeline-${string}`>,
  itemId: string,
): TimelineOperationApplyResult {
  return {
    diagnostic: {
      code,
      parent: { kind: 'item', id: itemId },
    },
  };
}

function isTimelineTextItem(
  item: AgentTurnTimelineItem,
): item is Extract<AgentTurnTimelineItem, { readonly kind: 'assistant_text' | 'thinking' }> {
  return item.kind === 'assistant_text' || item.kind === 'thinking';
}

function toBackfillableToolResult(result: {
  readonly success: boolean;
  readonly data: unknown;
  readonly error?: string;
}): BackfillableToolResult {
  return {
    success: result.success,
    data: result.data,
    ...(result.error ? { error: result.error } : {}),
  };
}

function projectTimelineItem(
  item: AgentTurnTimelineItem,
  rowsByItemId: Set<string>,
  buildRow: (
    row: Omit<TerminalTimelineRow, 'sequence' | 'timestamp'> & {
      readonly sequence?: number;
      readonly timestamp?: number;
    },
  ) => TerminalTimelineRow,
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
  now: () => number,
): TerminalTimelineRow[] {
  const parent = toParentAnchor(item);
  if (parent?.kind === 'item' && parent.id && !rowsByItemId.has(parent.id)) {
    return [
      {
        id: `diagnostic-${item.itemId}`,
        sequence: item.sequence,
        kind: 'diagnostic',
        status: 'error',
        parent,
        diagnosticCode: 'unknown-parent-item-anchor',
        timestamp: now(),
      },
    ];
  }
  rowsByItemId.add(item.itemId);

  switch (item.kind) {
    case 'assistant_text':
      return [
        buildRow({
          id: item.itemId,
          sequence: item.sequence,
          kind: 'assistant_text',
          status: item.status === 'streaming' ? 'streaming' : 'complete',
          content: item.payload.content,
          ...(parent ? { parent } : {}),
          timestamp: item.updatedAt,
        }),
      ];
    case 'thinking':
      return [
        buildRow({
          id: item.itemId,
          sequence: item.sequence,
          kind: 'thinking',
          status: item.status === 'streaming' ? 'streaming' : 'complete',
          content: item.payload.content,
          ...(parent ? { parent } : {}),
          timestamp: item.updatedAt,
        }),
      ];
    case 'tool_call': {
      const toolCall = item.payload.toolCall;
      return [
        buildRow({
          id: item.itemId,
          sequence: item.sequence,
          kind: 'tool',
          status: toTerminalStatus(item.status),
          ...(parent ? { parent } : {}),
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          toolArguments: toolCall.arguments,
          ...(toolCall.result
            ? {
                toolResult: toolCall.result.data,
                ...projectArtifactFacts(toolCall.result, toolCall.id),
                ...(toolCall.result.error ? { toolError: toolCall.result.error } : {}),
              }
            : {}),
          argsSummary: summarizeArgs(toolCall.name, toolCall.arguments),
          resultSummary: toolCall.result
            ? summarizeTimelineToolResult(toolCall, presentation)
            : undefined,
          timestamp: item.updatedAt,
        }),
      ];
    }
    case 'task':
    case 'media':
      return [
        buildRow({
          id: item.itemId,
          sequence: item.sequence,
          kind: item.kind,
          status: toTerminalStatus(item.status),
          ...(parent ? { parent } : {}),
          ...summarizeWorkItem(item.payload.workItem),
          timestamp: item.updatedAt,
        }),
      ];
    case 'error':
      return [
        buildRow({
          id: item.itemId,
          sequence: item.sequence,
          kind: 'error',
          status: 'error',
          ...(parent ? { parent } : {}),
          ...(item.payload.message ? { content: item.payload.message } : {}),
          ...(item.payload.code ? { diagnosticCode: item.payload.code } : {}),
          ...(item.payload.details ? { details: summarizeUnknown(item.payload.details) } : {}),
          timestamp: item.updatedAt,
        }),
      ];
    case 'composite':
      return [
        buildRow({
          id: item.itemId,
          sequence: item.sequence,
          kind: 'diagnostic',
          status: 'complete',
          ...(parent ? { parent } : {}),
          content: presentation.t('agent.terminal.timeline.compositeReference'),
          timestamp: item.updatedAt,
        }),
      ];
  }
}

function projectWorkItem(
  workItem: AgentWorkItem,
  buildRow: (
    row: Omit<TerminalTimelineRow, 'sequence' | 'timestamp'> & {
      readonly sequence?: number;
      readonly timestamp?: number;
    },
  ) => TerminalTimelineRow,
): TerminalTimelineRow[] {
  const kind = workItem.kind === 'media-task' ? 'media' : 'task';
  return [
    buildRow({
      id: `${kind}-${workItem.id}`,
      kind,
      status: toWorkItemStatus(workItem.status),
      parent: workItem.parentToolCallId
        ? { kind: 'tool', id: workItem.parentToolCallId }
        : { kind: 'turn' },
      ...summarizeWorkItem(workItem),
      timestamp: Date.parse(workItem.updatedAt) || Date.now(),
    }),
  ];
}

function summarizeWorkItem(
  workItem: AgentWorkItem,
): Pick<TerminalTimelineRow, 'taskId' | 'taskTitle' | 'taskKind' | 'progress' | 'details'> {
  const currentStep = workItem.steps?.find((step) => step.id === workItem.currentStepId);
  return {
    taskId: workItem.id,
    taskTitle: workItem.title,
    taskKind: workItem.kind,
    progress: workItem.progress,
    details: joinDetails(currentStep?.name, currentStep?.message, workItem.error),
  };
}

function toParentAnchor(item: AgentTurnTimelineItem): TerminalTimelineParentAnchor | undefined {
  if (item.parentAnchor === 'tool_call') {
    return { kind: 'tool', id: item.parentToolCallId };
  }
  if (item.parentAnchor === 'item') {
    return { kind: 'item', id: item.parentItemId };
  }
  if (item.parentAnchor === 'turn') {
    return { kind: 'turn' };
  }
  return undefined;
}

function toTerminalStatus(status: AgentTurnTimelineItem['status']): TerminalTimelineRowStatus {
  switch (status) {
    case 'streaming':
      return 'streaming';
    case 'pending':
      return 'running';
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'error';
    case 'complete':
      return 'complete';
  }
}

function toWorkItemStatus(status: AgentWorkItem['status']): TerminalTimelineRowStatus {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'processing':
      return 'processing';
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'cancelled':
      return 'cancelled';
  }
}

function summarizeArgs(name: string, args: Record<string, unknown>): string {
  const summary = getToolSummary(name, args);
  return summary || summarizeUnknown(args);
}

function projectArtifactFacts(
  result: Parameters<typeof projectToolResultArtifactFacts>[0],
  toolCallId: string,
): Pick<TerminalTimelineRow, 'artifactFacts'> | Record<string, never> {
  const artifactFacts = projectToolResultArtifactFacts(result, toolCallId);
  return artifactFacts.length > 0 ? { artifactFacts } : {};
}

function summarizeToolResult(
  result: NonNullable<AgentEvent['toolResult']>,
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string | undefined {
  if (!result.success) {
    return result.error ?? presentation.t('agent.terminal.timeline.result.failed');
  }
  const references = collectTuiArtifactReferences({
    attachments: result.attachments,
    perceptionCards: result.perceptionCards,
    artifacts: result.artifacts,
    toolCallId: result.toolCallId,
  });
  if (references.length > 0) {
    return references
      .map((reference) => presentArtifactReference(reference, presentation))
      .join('\n');
  }
  const counts = [
    result.attachments?.length
      ? presentation.t('agent.terminal.timeline.result.attachments', {
          count: presentation.format.count(result.attachments.length),
        })
      : '',
    result.perceptionCards?.length
      ? presentation.t('agent.terminal.timeline.result.perceptionCards', {
          count: presentation.format.count(result.perceptionCards.length),
        })
      : '',
    result.artifacts?.length
      ? presentation.t('agent.terminal.timeline.result.artifacts', {
          count: presentation.format.count(result.artifacts.length),
        })
      : '',
  ].filter(Boolean);
  if (counts.length > 0) {
    return counts.join(' ');
  }
  return summarizeUnknown(result.data);
}

function summarizeTimelineToolResult(
  toolCall: ToolCall,
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string | undefined {
  const result = toolCall.result;
  if (!result) return undefined;
  if (!result.success) {
    return result.error ?? presentation.t('agent.terminal.timeline.result.failed');
  }
  return summarizeUnknown(result.data);
}

function summarizeBackfill(
  dataPatch: Record<string, unknown>,
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  const keys = Object.keys(dataPatch);
  return keys.length > 0
    ? presentation.t('agent.terminal.timeline.backfill.keys', { keys: keys.join(', ') })
    : presentation.t('agent.terminal.timeline.backfill.empty');
}

function summarizeUnknown(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return truncate(value, 96);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `items=${value.length}`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return keys.length > 0 ? keys.slice(0, 4).join(', ') : '{}';
  }
  return String(value);
}

function joinDetails(...parts: readonly (string | undefined)[]): string | undefined {
  const joined = parts.filter((part): part is string => Boolean(part && part.trim())).join(' - ');
  return joined.length > 0 ? truncate(joined, 120) : undefined;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
