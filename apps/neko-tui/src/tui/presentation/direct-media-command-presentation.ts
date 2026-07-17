import type {
  DirectMediaCommandError,
  DirectMediaCommandResult,
} from '../core/direct-media-command';
import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalMessageKey } from './terminal-messages';

export function presentDirectMediaCommandResult(
  result: DirectMediaCommandResult,
  format: 'text' | 'json',
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  if (format === 'json') return JSON.stringify(result);
  const taskScope = formatTaskScope(result.taskScope);
  const summary = context.t('agent.terminal.directMedia.completed', {
    kind: result.kind,
    taskScope,
    model: `${result.providerId}:${result.modelId}`,
  });
  return result.assetRefs.length > 0 ? [summary, ...result.assetRefs].join('\n') : summary;
}

export function presentDirectMediaCommandError(
  error: DirectMediaCommandError,
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  return context.t(`agent.terminal.directMedia.diagnostic.${error.code}`, {
    detail: error.message,
    taskScope: error.taskScope ? formatTaskScope(error.taskScope) : '-',
  });
}

function formatTaskScope(scope: DirectMediaCommandResult['taskScope']): string {
  return `${scope.conversationId}/${scope.runId}/${scope.parentRunId}/task:${scope.childRunId}`;
}
