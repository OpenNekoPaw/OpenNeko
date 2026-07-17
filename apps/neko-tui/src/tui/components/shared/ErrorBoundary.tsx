/**
 * ErrorBoundary Component
 *
 * React error boundary for the TUI. Catches rendering errors
 * and displays a user-friendly fallback instead of crashing.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { tokens } from '../../theme/tokens';
import type { AgentTerminalPresentationContext } from '../../presentation/context';
import { useAgentTerminalPresentation } from '../../presentation/react-context';
import type { AgentTerminalMessageKey } from '../../presentation/terminal-messages';

interface ErrorBoundaryProps {
  readonly children: React.ReactNode;
  /** Optional stable label for identifying the failing region. */
  readonly label?: string;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

type PresentationContext = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export function ErrorBoundary(props: ErrorBoundaryProps): React.JSX.Element {
  return <StatefulErrorBoundary {...props} presentation={useAgentTerminalPresentation()} />;
}

class StatefulErrorBoundary extends React.Component<
  ErrorBoundaryProps & { readonly presentation: PresentationContext },
  ErrorBoundaryState
> {
  public constructor(props: ErrorBoundaryProps & { readonly presentation: PresentationContext }) {
    super(props);
    this.state = { error: null };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public override render(): React.ReactNode {
    if (this.state.error) {
      const label = this.props.label ?? 'Component';
      return (
        <Box flexDirection="column" borderStyle="single" borderColor={tokens.error} paddingX={1}>
          <Text color={tokens.error} bold>
            {this.props.presentation.t('agent.terminal.errorBoundary.crashed', { label })}
          </Text>
          <Text dimColor>{this.state.error.message}</Text>
          <Text dimColor>{this.props.presentation.t('agent.terminal.errorBoundary.recovery')}</Text>
        </Box>
      );
    }

    return this.props.children;
  }
}
