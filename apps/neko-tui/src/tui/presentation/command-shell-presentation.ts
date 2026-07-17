import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalCommandProjection } from './model-family-presentation';
import type { AgentTerminalMessageKey } from './terminal-messages';

export type CommandShellSemanticResult =
  | Readonly<{ readonly kind: 'unknown-command'; readonly input: string }>
  | Readonly<{ readonly kind: 'command-failed'; readonly detail: string }>
  | Readonly<{ readonly kind: 'skill-invocation-failed'; readonly detail: string }>;

export function presentCommandShellDiagnostic(
  result: CommandShellSemanticResult,
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'unknown-command':
      return {
        kind: 'error',
        diagnosticCode: 'command.unknown',
        error: context.t('agent.terminal.diagnostic.command.unknown', { input: result.input }),
      };
    case 'command-failed':
      return {
        kind: 'error',
        diagnosticCode: 'command.failed',
        error: context.t('agent.terminal.diagnostic.command.failed', { detail: result.detail }),
      };
    case 'skill-invocation-failed':
      return {
        kind: 'error',
        diagnosticCode: 'skill.invocation-failed',
        error: context.t('agent.terminal.diagnostic.skill.invocationFailed', {
          detail: result.detail,
        }),
      };
  }
}
