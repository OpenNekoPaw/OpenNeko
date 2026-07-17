import React from 'react';
import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { createStrictTranslator } from '@neko/shared/i18n';
import { createAgentTerminalPresentationContext } from './context';
import { presentMediaCommand } from './model-family-presentation';
import { AgentTerminalPresentationProvider, useAgentTerminalPresentation } from './react-context';
import { CLI_TERMINAL_MESSAGE_SOURCE } from './terminal-messages';
import { handleTuiControlCommand, type TuiCommandRouterContext } from '../core/tui-command-router';
import { DEFAULT_CLI_CONFIG } from '../core/types';

function PresentationIdentityProbe(props: {
  readonly capture: (presentation: ReturnType<typeof useAgentTerminalPresentation>) => void;
}): React.JSX.Element {
  const presentation = useAgentTerminalPresentation();
  props.capture(presentation);
  return <Text>{presentation.uiLocale}</Text>;
}

function MediaSelectionNotice(): React.JSX.Element {
  const presentation = useAgentTerminalPresentation();
  const projection = presentMediaCommand(
    { kind: 'selected', category: 'image', modelId: 'openai:gpt-image-1' },
    presentation,
  );
  if (projection.kind !== 'output') {
    throw new Error('Expected output projection.');
  }
  return <Text>{projection.output}</Text>;
}

describe('AgentTerminalPresentationProvider', () => {
  it('shares one invocation presentation object between Ink and the TUI router', async () => {
    const presentation = createAgentTerminalPresentationContext({
      translator: createStrictTranslator('zh-cn', [
        AGENT_COMMAND_MESSAGE_SOURCE,
        CLI_TERMINAL_MESSAGE_SOURCE,
      ] as const),
      formatters: { count: String, dateTime: String, duration: String, bytes: String },
    });
    const routerContext: TuiCommandRouterContext = {
      presentation,
      slash: { locale: presentation.uiLocale, config: DEFAULT_CLI_CONFIG },
      ports: { output: { info: () => undefined, error: () => undefined } },
    };

    let capturedInkPresentation: ReturnType<typeof useAgentTerminalPresentation> | undefined;
    const view = render(
      <AgentTerminalPresentationProvider value={presentation}>
        <PresentationIdentityProbe capture={(value) => (capturedInkPresentation = value)} />
      </AgentTerminalPresentationProvider>,
    );
    const result = await handleTuiControlCommand('/help', routerContext);

    expect(view.lastFrame()).toBe('zh-cn');
    expect(capturedInkPresentation).toBe(presentation);
    expect(routerContext.presentation).toBe(capturedInkPresentation);
    expect(result.output).toContain('可用命令：');
  });

  it('renders first-slice output through the injected Ink presentation context', () => {
    const presentation = createAgentTerminalPresentationContext({
      translator: createStrictTranslator('zh-cn', [
        AGENT_COMMAND_MESSAGE_SOURCE,
        CLI_TERMINAL_MESSAGE_SOURCE,
      ] as const),
      formatters: { count: String, dateTime: String, duration: String, bytes: String },
    });

    const view = render(
      <AgentTerminalPresentationProvider value={presentation}>
        <MediaSelectionNotice />
      </AgentTerminalPresentationProvider>,
    );

    expect(view.lastFrame()).toBe('图像模型已设为：openai:gpt-image-1');
  });
});
