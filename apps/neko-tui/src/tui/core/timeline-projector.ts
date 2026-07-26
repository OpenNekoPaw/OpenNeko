import type {
  AgentTurnTimelineItem,
  AgentTurnTimelineOperation,
  ConversationProjectionPatch,
  ToolCall,
} from '@neko-agent/types';
import { getToolSummary } from '@neko-agent/types';
import { projectToolResultArtifactFacts } from './artifact-fact-projector';
import type { AgentTerminalPresentationContext } from '../presentation/context';
import type { AgentTerminalMessageKey } from '../presentation/terminal-messages';
import type {
  TerminalTimelineParentAnchor,
  TerminalTimelineRow,
  TerminalTimelineRowStatus,
} from '../types/state';

export type TerminalTimelineMessage = ConversationProjectionPatch;

export interface TerminalTimelineProjector {
  readonly projectMessage: (message: TerminalTimelineMessage) => TerminalTimelineRow[];
  readonly reset: () => void;
}

export interface TerminalTimelineProjectorOptions {
  readonly presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>;
  readonly now?: () => number;
}

interface TimelineItemProjectionState {
  readonly item: AgentTurnTimelineItem;
}

export function createTerminalTimelineProjector(
  options: TerminalTimelineProjectorOptions,
): TerminalTimelineProjector {
  let sequence = 0;
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

  return {
    projectMessage(message) {
      switch (message.type) {
        case 'conversationProjectionPatch':
          return projectTimelineOperations({
            operations: message.operations,
            timelineItemsById,
            rowsByItemId,
            presentation: options.presentation,
            buildRow,
            diagnostic,
            now,
            observeSequence: (itemSequence) => {
              sequence = Math.max(sequence, itemSequence);
            },
          });
      }
    },

    reset() {
      sequence = 0;
      rowsByItemId.clear();
      timelineItemsById.clear();
    },
  };
}

interface ProjectTimelineOperationsInput {
  readonly operations: readonly AgentTurnTimelineOperation[];
  readonly timelineItemsById: Map<string, TimelineItemProjectionState>;
  readonly rowsByItemId: Set<string>;
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

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
