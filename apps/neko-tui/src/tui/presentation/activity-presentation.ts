import type { AgentTerminalPresentationContext } from './context';
import type { CliTerminalMessageKey } from './terminal-messages';

interface TimedActivityInput {
  readonly elapsedSeconds: number;
}

interface ProcessingActivityInput extends TimedActivityInput {
  readonly current: number;
  readonly max: number;
}

export function presentProcessingActivity(
  input: ProcessingActivityInput,
  presentation: AgentTerminalPresentationContext<CliTerminalMessageKey>,
): string {
  const hasIteration = input.max > 0;
  const duration = formatElapsed(input.elapsedSeconds, presentation);

  if (hasIteration && duration) {
    return presentation.t('agent.terminal.activity.processingWithIterationAndElapsed', {
      current: input.current,
      max: input.max,
      duration,
    });
  }
  if (hasIteration) {
    return presentation.t('agent.terminal.activity.processingWithIteration', {
      current: input.current,
      max: input.max,
    });
  }
  if (duration) {
    return presentation.t('agent.terminal.activity.processingWithElapsed', { duration });
  }
  return presentation.t('agent.terminal.activity.processing');
}

export function presentThinkingActivity(
  input: TimedActivityInput,
  presentation: AgentTerminalPresentationContext<CliTerminalMessageKey>,
): string {
  const duration = formatElapsed(input.elapsedSeconds, presentation);
  return duration
    ? presentation.t('agent.terminal.activity.thinkingWithElapsed', { duration })
    : presentation.t('agent.terminal.activity.thinking');
}

export function presentGeneratingActivity(
  input: TimedActivityInput,
  presentation: AgentTerminalPresentationContext<CliTerminalMessageKey>,
): string {
  const duration = formatElapsed(input.elapsedSeconds, presentation);
  return duration
    ? presentation.t('agent.terminal.activity.generatingWithElapsed', { duration })
    : presentation.t('agent.terminal.activity.generating');
}

export function presentThinkingBlockHeader(
  input: { readonly isThinking: boolean; readonly lineCount: number },
  presentation: AgentTerminalPresentationContext<CliTerminalMessageKey>,
): string {
  if (input.isThinking) {
    return presentation.t('agent.terminal.activity.thinkingBlock.active');
  }
  return presentation.t(
    input.lineCount === 1
      ? 'agent.terminal.activity.thinkingBlock.thoughtOne'
      : 'agent.terminal.activity.thinkingBlock.thoughtMany',
    { count: input.lineCount },
  );
}

export function presentThinkingBlockMoreLines(
  count: number,
  presentation: AgentTerminalPresentationContext<CliTerminalMessageKey>,
): string {
  return presentation.t(
    count === 1
      ? 'agent.terminal.activity.thinkingBlock.moreOne'
      : 'agent.terminal.activity.thinkingBlock.moreMany',
    { count },
  );
}

function formatElapsed(
  elapsedSeconds: number,
  presentation: AgentTerminalPresentationContext<CliTerminalMessageKey>,
): string | undefined {
  return elapsedSeconds > 0 ? presentation.format.duration(elapsedSeconds * 1_000) : undefined;
}
