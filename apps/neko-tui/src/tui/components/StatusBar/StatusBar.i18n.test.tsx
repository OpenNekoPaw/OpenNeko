import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import { createStrictTranslator, type SupportedLocale } from '@neko/shared/i18n';
import React from 'react';
import { render as inkRender } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CLI_CONFIG } from '../../core/types';
import { createAgentTerminalPresentationContext } from '../../presentation/context';
import { createAgentTerminalFormatters } from '../../presentation/formatters';
import { AgentTerminalPresentationProvider } from '../../presentation/react-context';
import { CLI_TERMINAL_MESSAGE_SOURCE } from '../../presentation/terminal-messages';
import { testAgentStore as useAgentStore } from '../../__tests__/test-runtime';
import { testConfigStore as useConfigStore } from '../../__tests__/test-runtime';
import { SharedTuiTestRuntimeProvider } from '../../__tests__/test-runtime';
import { StatusBar } from './StatusBar';

afterEach(() => {
  useAgentStore.getState().reset();
});

function renderWithPresentation(node: React.ReactElement, locale: SupportedLocale = 'en') {
  const presentation = createAgentTerminalPresentationContext({
    translator: createStrictTranslator(locale, [
      AGENT_COMMAND_MESSAGE_SOURCE,
      CLI_TERMINAL_MESSAGE_SOURCE,
    ] as const),
    formatters: createAgentTerminalFormatters({ locale, timeZone: 'UTC' }),
  });
  return inkRender(
    <SharedTuiTestRuntimeProvider>
      <AgentTerminalPresentationProvider value={presentation}>
        {node}
      </AgentTerminalPresentationProvider>
    </SharedTuiTestRuntimeProvider>,
  );
}

describe('StatusBar i18n', () => {
  it('uses Chinese chrome labels when TUI locale is zh', () => {
    useConfigStore.getState().replaceConfig({
      ...DEFAULT_CLI_CONFIG,
      provider: 'nekoapi-chat',
      providerType: 'newapi',
      providerRequiresApiKey: true,
      model: 'gpt-5.5',
      chatModel: { providerId: 'nekoapi-chat', modelId: 'gpt-5.5' },
      defaultMediaModels: {
        image: 'nekoapi-media:gpt-image-2',
      },
    });

    const { lastFrame } = renderWithPresentation(<StatusBar />, 'zh-cn');

    expect(lastFrame()).toContain('智能体:自动');
    expect(lastFrame()).toContain('对话:');
    expect(lastFrame()).toContain('媒体:图像:');
  });

  it('uses the live context token estimate instead of completed provider usage', () => {
    useConfigStore.getState().replaceConfig({
      ...DEFAULT_CLI_CONFIG,
      provider: 'nekoapi-chat',
      providerType: 'newapi',
      providerRequiresApiKey: true,
      model: 'gpt-5.5',
      chatModel: {
        providerId: 'nekoapi-chat',
        modelId: 'gpt-5.5',
        contextWindow: 256000,
        maxOutputTokens: 128000,
      },
      maxTokens: 8192,
    });
    useAgentStore.getState().updateUsage({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
    useAgentStore.getState().setContextTokenCount(12345);

    const { lastFrame } = renderWithPresentation(<StatusBar />);

    expect(lastFrame()).toContain('ctx:12.3K/384.0K');
    expect(lastFrame()).not.toContain('ctx:0/384.0K');
  });

  it('shows when pending messages are paused after active-turn cancellation', () => {
    useConfigStore.getState().replaceConfig(DEFAULT_CLI_CONFIG);
    useAgentStore.getState().setMessageQueueSnapshot({
      conversationId: 'conv-1',
      pendingCount: 1,
      version: 1,
      items: [
        {
          id: 'queue-1',
          conversationId: 'conv-1',
          content: 'Pending follow-up',
          createdAt: 1,
          source: 'user',
        },
      ],
    });
    useAgentStore.getState().setMessageQueuePausedAfterCancel(true);

    const { lastFrame } = renderWithPresentation(<StatusBar />);

    expect(lastFrame()).toContain('Queue paused after');
    expect(lastFrame()).toContain('cancellation');
  });
});
