import type { TuiConversationIdDiagnostic } from '../core/tui-conversation-id';
import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalMessageKey } from './terminal-messages';
import { formatTerminalDiagnosticLiteral } from './diagnostic-literal';

type PresentationContext = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export function presentTuiConversationIdDiagnostic(
  diagnostic: TuiConversationIdDiagnostic,
  context: PresentationContext,
): string {
  switch (diagnostic.code) {
    case 'non-canonical':
      return context.t('agent.terminal.diagnostic.conversation.nonCanonical', {
        conversationId: formatTerminalDiagnosticLiteral(diagnostic.value),
      });
  }
}
