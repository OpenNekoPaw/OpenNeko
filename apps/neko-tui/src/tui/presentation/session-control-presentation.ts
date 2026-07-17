import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalCommandProjection } from './model-family-presentation';
import type { AgentTerminalMessageKey } from './terminal-messages';

export type TerminalSessionMode = 'agent' | 'image' | 'video' | 'audio';
export type TerminalExecutionMode = 'plan' | 'ask' | 'auto';

export type SessionControlSemanticResult =
  | Readonly<{ readonly kind: 'exit' }>
  | Readonly<{ readonly kind: 'history-cleared' }>
  | Readonly<{
      readonly kind: 'session-mode-status';
      readonly current: TerminalSessionMode;
      readonly available: readonly TerminalSessionMode[];
    }>
  | Readonly<{ readonly kind: 'session-mode-selected'; readonly mode: TerminalSessionMode }>
  | Readonly<{ readonly kind: 'execution-mode-selected'; readonly mode: TerminalExecutionMode }>
  | Readonly<{
      readonly kind: 'context-compacted';
      readonly originalTokens: number;
      readonly compressedTokens: number;
      readonly ratio: number;
    }>
  | Readonly<{
      readonly kind: 'diagnostic';
      readonly code:
        | 'session-mode-unsupported'
        | 'session-mode-unavailable'
        | 'execution-mode-unavailable'
        | 'context-compaction-unavailable';
      readonly value?: string;
      readonly available?: readonly TerminalSessionMode[];
    }>;

type PresentationContext = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export function presentSessionControlCommand(
  result: SessionControlSemanticResult,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'exit':
      return { kind: 'output', output: context.t('agent.terminal.lifecycle.goodbye') };
    case 'history-cleared':
      return { kind: 'output', output: context.t('agent.terminal.history.cleared') };
    case 'session-mode-status':
      return {
        kind: 'output',
        output: [
          context.t('agent.terminal.sessionMode.current', { mode: result.current }),
          context.t('agent.terminal.sessionMode.available', {
            modes: result.available.join(', '),
          }),
          context.t('agent.terminal.sessionMode.usage'),
        ].join('\n'),
      };
    case 'session-mode-selected':
      return {
        kind: 'output',
        output: context.t('agent.terminal.sessionMode.selected', { mode: result.mode }),
      };
    case 'execution-mode-selected':
      return {
        kind: 'output',
        output: presentExecutionMode(result.mode, context),
      };
    case 'context-compacted':
      return {
        kind: 'output',
        output: context.t('agent.terminal.context.compacted', {
          originalTokens: context.format.count(result.originalTokens),
          compressedTokens: context.format.count(result.compressedTokens),
          percentage: (result.ratio * 100).toFixed(1),
        }),
      };
    case 'diagnostic':
      return presentSessionControlDiagnostic(result, context);
  }
}

function presentSessionControlDiagnostic(
  result: Extract<SessionControlSemanticResult, { readonly kind: 'diagnostic' }>,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.code) {
    case 'session-mode-unsupported':
      return {
        kind: 'error',
        diagnosticCode: 'session-mode.unsupported',
        error: context.t('agent.terminal.diagnostic.sessionMode.unsupported', {
          mode: requiredValue(result.value, result.code),
          modes: requiredModes(result.available, result.code).join(', '),
        }),
      };
    case 'session-mode-unavailable':
      return {
        kind: 'error',
        diagnosticCode: 'session-mode.unavailable',
        error: context.t('agent.terminal.diagnostic.sessionMode.unavailable'),
      };
    case 'execution-mode-unavailable':
      return {
        kind: 'error',
        diagnosticCode: 'execution-mode.unavailable',
        error: context.t('agent.terminal.diagnostic.executionMode.unavailable'),
      };
    case 'context-compaction-unavailable':
      return {
        kind: 'error',
        diagnosticCode: 'context.compaction-unavailable',
        error: context.t('agent.terminal.diagnostic.context.compactionUnavailable'),
      };
  }
}

function requiredValue(value: string | undefined, code: string): string {
  if (value === undefined) {
    throw new Error(`Missing semantic value for terminal diagnostic: ${code}`);
  }
  return value;
}

function requiredModes(
  modes: readonly TerminalSessionMode[] | undefined,
  code: string,
): readonly TerminalSessionMode[] {
  if (modes === undefined) {
    throw new Error(`Missing semantic mode list for terminal diagnostic: ${code}`);
  }
  return modes;
}

function presentExecutionMode(mode: TerminalExecutionMode, context: PresentationContext): string {
  switch (mode) {
    case 'plan':
      return context.t('agent.terminal.executionMode.plan');
    case 'ask':
      return context.t('agent.terminal.executionMode.ask');
    case 'auto':
      return context.t('agent.terminal.executionMode.auto');
  }
}
