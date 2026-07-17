import type { AgentQueuedMessageItem, AgentMessageQueueSnapshot } from '@neko-agent/types';
import type { TaskStatus } from '@neko/shared';
import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalCommandProjection } from './model-family-presentation';
import type { AgentTerminalMessageKey } from './terminal-messages';

export type QueueCommandSemanticResult =
  | Readonly<{ readonly kind: 'status'; readonly snapshot: AgentMessageQueueSnapshot }>
  | Readonly<{ readonly kind: 'enqueued'; readonly pendingCount: number }>
  | Readonly<{
      readonly kind: 'promoted';
      readonly item: AgentQueuedMessageItem;
      readonly target: 'user-message' | 'continuation';
    }>
  | Readonly<{
      readonly kind: 'cancelled' | 'discarded' | 'edited';
      readonly itemId: string;
    }>
  | Readonly<{
      readonly kind: 'diagnostic';
      readonly code:
        | 'unavailable'
        | 'usage'
        | 'edit-usage'
        | 'send-now-unsupported'
        | 'discard-unavailable'
        | 'operation-unavailable'
        | 'unknown-command'
        | 'operation-failed';
      readonly command?: string;
      readonly operation?: 'promote' | 'cancel' | 'edit';
      readonly operationCode?: string;
      readonly detail?: string;
    }>;

export interface TaskCommandRow {
  readonly id: string;
  readonly status: TaskStatus;
  readonly progress: number;
  readonly runMode: string;
  readonly title: string;
  readonly error?: string;
  readonly updatedAt: number;
}

export type TaskCommandSemanticResult =
  | Readonly<{
      readonly kind: 'list';
      readonly status?: TaskStatus;
      readonly rows: readonly TaskCommandRow[];
    }>
  | Readonly<{
      readonly kind: 'diagnostic';
      readonly code: 'unavailable' | 'usage';
    }>;

type PresentationContext = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export function presentQueueCommand(
  result: QueueCommandSemanticResult,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'status':
      return { kind: 'output', output: presentQueueSnapshot(result.snapshot, context) };
    case 'enqueued':
      return {
        kind: 'output',
        output: context.t('agent.terminal.queue.enqueued', {
          pendingCount: context.format.count(result.pendingCount),
        }),
      };
    case 'promoted':
      return {
        kind: 'output',
        output: context.t(
          result.target === 'user-message'
            ? 'agent.terminal.queue.promotedUserMessage'
            : 'agent.terminal.queue.promotedContinuation',
          { itemId: result.item.id },
        ),
      };
    case 'cancelled':
      return {
        kind: 'output',
        output: context.t('agent.terminal.queue.cancelled', { itemId: result.itemId }),
      };
    case 'discarded':
      return {
        kind: 'output',
        output: context.t('agent.terminal.queue.discarded', { itemId: result.itemId }),
      };
    case 'edited':
      return {
        kind: 'output',
        output: context.t('agent.terminal.queue.edited', { itemId: result.itemId }),
      };
    case 'diagnostic':
      return presentQueueDiagnostic(result, context);
  }
}

export function presentTaskCommand(
  result: TaskCommandSemanticResult,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'list':
      return { kind: 'output', output: presentTaskList(result, context) };
    case 'diagnostic':
      return {
        kind: 'error',
        diagnosticCode: result.code === 'unavailable' ? 'task.unavailable' : 'task.usage',
        error: context.t(
          result.code === 'unavailable'
            ? 'agent.terminal.diagnostic.task.unavailable'
            : 'agent.terminal.diagnostic.task.usage',
        ),
      };
  }
}

function presentQueueSnapshot(
  snapshot: AgentMessageQueueSnapshot,
  context: PresentationContext,
): string {
  if (snapshot.items.length === 0) {
    return context.t('agent.terminal.queue.status.empty', {
      version: context.format.count(snapshot.version),
    });
  }

  return [
    context.t('agent.terminal.queue.status.header', {
      pendingCount: context.format.count(snapshot.pendingCount),
      version: context.format.count(snapshot.version),
    }),
    ...snapshot.items.map((item, index) =>
      context.t('agent.terminal.queue.status.row', {
        index: context.format.count(index + 1),
        itemId: item.id,
        source: item.source,
        content: item.content,
      }),
    ),
  ].join('\n');
}

function presentQueueDiagnostic(
  result: Extract<QueueCommandSemanticResult, { readonly kind: 'diagnostic' }>,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.code) {
    case 'unavailable':
      return queueError(
        'queue.unavailable',
        'agent.terminal.diagnostic.queue.unavailable',
        context,
      );
    case 'usage':
      return queueError('queue.usage', 'agent.terminal.diagnostic.queue.usage', context);
    case 'edit-usage':
      return queueError('queue.edit-usage', 'agent.terminal.diagnostic.queue.editUsage', context);
    case 'send-now-unsupported':
      return queueError(
        'queue.send-now-unsupported',
        'agent.terminal.diagnostic.queue.sendNowUnsupported',
        context,
      );
    case 'discard-unavailable':
      return queueError(
        'queue.discard-unavailable',
        'agent.terminal.diagnostic.queue.discardUnavailable',
        context,
      );
    case 'operation-unavailable':
      return {
        kind: 'error',
        diagnosticCode: 'queue.operation-unavailable',
        error: context.t('agent.terminal.diagnostic.queue.operationUnavailable', {
          operation: required(result.operation, result.code),
        }),
      };
    case 'unknown-command':
      return {
        kind: 'error',
        diagnosticCode: 'queue.unknown-command',
        error: context.t('agent.terminal.diagnostic.queue.unknownCommand', {
          command: required(result.command, result.code),
        }),
      };
    case 'operation-failed': {
      const detail = required(result.detail, result.code);
      return {
        kind: 'error',
        diagnosticCode: result.operationCode
          ? `queue.operation-failed.${result.operationCode}`
          : 'queue.operation-failed',
        error: result.operationCode
          ? context.t('agent.terminal.diagnostic.queue.operationFailedWithCode', {
              operationCode: result.operationCode,
              detail,
            })
          : context.t('agent.terminal.diagnostic.queue.operationFailed', { detail }),
      };
    }
  }
}

function presentTaskList(
  result: Extract<TaskCommandSemanticResult, { readonly kind: 'list' }>,
  context: PresentationContext,
): string {
  if (result.rows.length === 0) {
    return result.status
      ? context.t('agent.terminal.task.emptyFiltered', {
          status: presentTaskStatus(result.status, context),
        })
      : context.t('agent.terminal.task.empty');
  }

  const rows = [...result.rows].sort((left, right) => right.updatedAt - left.updatedAt);
  return [
    result.status
      ? context.t('agent.terminal.task.headerFiltered', {
          status: presentTaskStatus(result.status, context),
        })
      : context.t('agent.terminal.task.header'),
    ...rows.map((row) => presentTaskRow(row, context)),
    '',
    context.t('agent.terminal.task.usage'),
  ].join('\n');
}

function presentTaskRow(row: TaskCommandRow, context: PresentationContext): string {
  const params = {
    id: row.id,
    status: presentTaskStatus(row.status, context),
    progress: context.format.count(Math.round(row.progress)),
    runMode: row.runMode,
    title: row.title,
  };
  return row.error
    ? context.t('agent.terminal.task.rowWithError', { ...params, error: row.error })
    : context.t('agent.terminal.task.row', params);
}

function presentTaskStatus(status: TaskStatus, context: PresentationContext): string {
  switch (status) {
    case 'pending':
      return context.t('agent.terminal.value.taskStatus.pending');
    case 'running':
      return context.t('agent.terminal.value.taskStatus.running');
    case 'completed':
      return context.t('agent.terminal.value.taskStatus.completed');
    case 'failed':
      return context.t('agent.terminal.value.taskStatus.failed');
    case 'cancelled':
      return context.t('agent.terminal.value.taskStatus.cancelled');
  }
}

function queueError(
  diagnosticCode: string,
  key: AgentTerminalMessageKey,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  return { kind: 'error', diagnosticCode, error: context.t(key) };
}

function required(value: string | undefined, code: string): string {
  if (value === undefined) {
    throw new Error(`Missing semantic value for terminal diagnostic: ${code}`);
  }
  return value;
}
