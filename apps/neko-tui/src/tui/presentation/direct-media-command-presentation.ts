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
  const summary = context.t(
    result.status === 'submitted'
      ? 'agent.terminal.directMedia.submitted'
      : 'agent.terminal.directMedia.completed',
    {
    kind: result.kind,
    operationId: result.operationId,
    model: `${result.providerId}:${result.modelId}`,
      revision: result.jobRevision,
    },
  );
  return result.assetRefs.length > 0 ? [summary, ...result.assetRefs].join('\n') : summary;
}

export function presentDirectMediaCommandError(
  error: DirectMediaCommandError,
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  return context.t(`agent.terminal.directMedia.diagnostic.${error.code}`, {
    detail: error.message,
    operationId: error.operationId ?? '-',
  });
}
