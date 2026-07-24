import type { AgentContinuationMetadata, AgentTurnSource } from '@neko-agent/types';
import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalMessageKey } from './terminal-messages';
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
