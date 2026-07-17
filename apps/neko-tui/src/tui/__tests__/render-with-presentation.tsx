import type { ReactElement } from 'react';
import type { SupportedLocale } from '@neko/shared/i18n';
import { InMemoryUserCredentialPersistence } from '@neko/agent/pi';
import { render as renderInk } from 'ink-testing-library';
import { AgentTerminalPresentationProvider } from '../presentation/react-context';
import { createTestAgentTerminalPresentation } from '../presentation/testing';
import { DEFAULT_CLI_CONFIG, type CLIConfig } from '../core/types';
import {
  createAgentTuiApplicationRuntime,
  type AgentTuiApplicationRuntime,
  type TuiConversationRuntime,
} from '../runtime/tui-application-runtime';
import { TuiApplicationRuntimeProvider } from '../runtime/tui-runtime-context';

export interface TuiTestRuntime {
  readonly application: AgentTuiApplicationRuntime;
  readonly conversation: TuiConversationRuntime;
}

export function createTuiTestRuntime(
  config: CLIConfig = DEFAULT_CLI_CONFIG,
  conversationId = 'test-conversation',
): TuiTestRuntime {
  const application = createAgentTuiApplicationRuntime(
    new InMemoryUserCredentialPersistence(),
  );
  const conversation = application.createConversation({ config, conversationId });
  return { application, conversation };
}

export const sharedTuiTestRuntime = createTuiTestRuntime();

export function renderWithPresentation(
  node: ReactElement,
  locale: SupportedLocale = 'en',
  runtime?: TuiTestRuntime,
) {
  const selectedRuntime = runtime ?? sharedTuiTestRuntime;
  const presentation = createTestAgentTerminalPresentation(locale);
  const wrap = (child: ReactElement): ReactElement => (
    <TuiApplicationRuntimeProvider runtime={selectedRuntime.application}>
      <AgentTerminalPresentationProvider value={presentation}>
        {child}
      </AgentTerminalPresentationProvider>
    </TuiApplicationRuntimeProvider>
  );
  const rendered = renderInk(wrap(node));
  const rerender = rendered.rerender;

  return {
    ...rendered,
    rerender(nextNode: ReactElement): void {
      rerender(wrap(nextNode));
    },
  };
}
