import type { AgentContinuationMetadata, AgentTurnSource } from '@neko-agent/types';
import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalMessageKey } from './terminal-messages';
import type { TuiMediaBackgroundDiagnostic } from '../core/tui-media-background-tasks';
import type { NodeWorkspaceContentDiagnostic } from '../host/node-workspace-content-host';

type PresentationContext = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export function presentWorkspaceContentDiagnostic(
  diagnostic: NodeWorkspaceContentDiagnostic,
  context: PresentationContext,
): string {
  return context.t(
    diagnostic.code === 'read-failed'
      ? 'agent.terminal.runtime.workspaceContentReadFailed'
      : 'agent.terminal.runtime.workspaceContentParseFailed',
    { path: diagnostic.filePath, detail: diagnostic.detail },
  );
}

export function presentResourceCacheGcFailure(
  detail: string,
  context: PresentationContext,
): string {
  return context.t('agent.terminal.runtime.resourceCacheGcFailed', { detail });
}

export function presentResumeFallback(
  conversationId: string,
  context: PresentationContext,
): string {
  return context.t('agent.terminal.runtime.resumeNotFoundStartingFresh', { conversationId });
}

export function presentContinuationDiscarded(itemId: string, context: PresentationContext): string {
  return context.t('agent.terminal.runtime.continuationDiscarded', { itemId });
}

export function presentSkillInvocationRejected(
  skillName: string,
  context: PresentationContext,
): string {
  return context.t('agent.terminal.runtime.skillInvocationRejected', { skillName });
}

export function presentContinuationReady(
  source: Exclude<AgentTurnSource, 'user'>,
  metadata: AgentContinuationMetadata | undefined,
  context: PresentationContext,
): string {
  switch (source) {
    case 'task-result-continuation':
      return metadata?.taskId
        ? context.t('agent.terminal.runtime.taskContinuationReadyWithId', {
            taskId: metadata.taskId,
          })
        : context.t('agent.terminal.runtime.taskContinuationReady');
    case 'subagent-result-continuation':
      return metadata?.subagentId
        ? context.t('agent.terminal.runtime.subagentContinuationReadyWithId', {
            subagentId: metadata.subagentId,
          })
        : context.t('agent.terminal.runtime.subagentContinuationReady');
    case 'system-continuation':
      return context.t('agent.terminal.runtime.systemContinuationReady');
  }
}

export function presentQueuedContinuation(
  item: import('@neko-agent/types').AgentQueuedMessageItem,
  pendingCount: number,
  context: PresentationContext,
): string {
  switch (item.source) {
    case 'task-result-continuation':
      return context.t('agent.terminal.runtime.taskContinuationQueued', {
        itemId: item.metadata?.taskId ?? item.id,
        pendingCount: context.format.count(pendingCount),
      });
    case 'subagent-result-continuation':
      return context.t('agent.terminal.runtime.subagentContinuationQueued', {
        itemId: item.metadata?.subagentId ?? item.id,
        pendingCount: context.format.count(pendingCount),
      });
    case 'system-continuation':
      return context.t('agent.terminal.runtime.systemContinuationQueued', {
        itemId: item.id,
        pendingCount: context.format.count(pendingCount),
      });
    case 'user':
    case 'composer':
      throw new Error(`User queue item ${item.id} must not be projected into the transcript.`);
  }
}

export function presentTaskStatusRefreshFailure(
  detail: string,
  context: PresentationContext,
): string {
  return context.t('agent.terminal.runtime.taskStatusRefreshFailed', { detail });
}

export function presentTaskResultContinuation(
  prompt: string,
  context: PresentationContext,
): string {
  return context.t('agent.terminal.runtime.taskResultReady', { prompt });
}

export function presentMediaResultPersistenceFailure(
  error: unknown,
  context: PresentationContext,
): string {
  return error === undefined
    ? context.t('agent.terminal.runtime.mediaResultPersistenceFailed')
    : context.t('agent.terminal.runtime.mediaResultPersistenceFailedWithDetail', {
        detail: error instanceof Error ? error.message : String(error),
      });
}

export function presentMediaBackgroundDiagnostic(
  diagnostic: TuiMediaBackgroundDiagnostic,
  context: PresentationContext,
): string {
  switch (diagnostic.code) {
    case 'progress-delivery-failed':
      return diagnostic.error === undefined
        ? context.t('agent.terminal.runtime.mediaProgressDeliveryFailed', {
            taskId: diagnostic.taskId,
          })
        : context.t('agent.terminal.runtime.mediaProgressDeliveryFailedWithDetail', {
            taskId: diagnostic.taskId,
            detail:
              diagnostic.error instanceof Error
                ? diagnostic.error.message
                : String(diagnostic.error),
          });
  }
}
