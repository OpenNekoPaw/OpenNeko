/**
 * StatusBar Component
 *
 * Fixed bottom bar showing chat/media models, mode, tokens, and shortcuts.
 * Execution status is shown inline in ChatView (ActivityIndicator).
 *
 * Layout: [mode] │ [chat:model] │ [media:model(s)] │ ... │ [tokens bar] │ [shortcuts]
 */

import React from 'react';
import { Box, Text } from 'ink';
import { resolveAgentTokenBudget } from '@neko/shared';
import {
  useTuiAgentStore as useAgentStore,
  useTuiConfigStore as useConfigStore,
} from '../../runtime/tui-runtime-context';
import { tokens } from '../../theme/tokens';
import type { AgentTerminalPresentationContext } from '../../presentation/context';
import { useAgentTerminalPresentation } from '../../presentation/react-context';
import {
  presentExecutionMode,
  presentMediaCategory,
  presentSessionMode,
} from '../../presentation/terminal-label-presentation';
import type { AgentTerminalMessageKey } from '../../presentation/terminal-messages';
import { TokenUsage } from './TokenUsage';

export function StatusBar(): React.JSX.Element {
  const sessionMode = useAgentStore((s) => s.sessionMode);
  const mode = useAgentStore((s) => s.executionMode);
  const queueSnapshot = useAgentStore((s) => s.messageQueue.snapshot);
  const queuePausedAfterCancel = useAgentStore((s) => s.messageQueue.pausedAfterCancel);
  const usage = useAgentStore((s) => s.usage);
  const contextTokenCount = useAgentStore((s) => s.contextTokens.count);
  const config = useConfigStore((s) => s.config);
  const presentation = useAgentTerminalPresentation();

  const chatModel = truncateModel(
    `${config.chatModel?.providerId ?? config.provider}:${config.chatModel?.modelId ?? config.model}`,
  );
  const mediaModels = formatMediaModels(config.defaultMediaModels, presentation);
  const perceptionModels = formatMediaModels(config.perceptionModels, presentation);
  const tokenBudget = resolveAgentTokenBudget({
    modelId: config.chatModel?.modelId ?? config.model,
    contextWindow: config.chatModel?.contextWindow,
    modelMaxOutputTokens: config.chatModel?.maxOutputTokens,
    defaultMaxOutputTokens: config.maxTokens,
    requestedMaxOutputTokens: config.maxTokens,
  });

  return (
    <Box paddingLeft={1} paddingRight={1}>
      {/* Mode badge — leftmost */}
      <Text color={sessionModeColor(sessionMode)}>
        {presentSessionMode(sessionMode, presentation)}
      </Text>
      <Text dimColor>:</Text>
      <Text color={modeColor(mode)}>{presentExecutionMode(mode, presentation)}</Text>
      <Text dimColor> | </Text>

      {/* Chat model */}
      <Text dimColor>{presentation.t('agent.terminal.chrome.chat')}:</Text>
      <Text>{chatModel}</Text>
      <Text dimColor> | </Text>

      {/* Media models */}
      <Text dimColor>{presentation.t('agent.terminal.chrome.media')}:</Text>
      {mediaModels ? (
        <Text>{mediaModels}</Text>
      ) : (
        <Text color={tokens.muted}>{presentation.t('agent.terminal.chrome.none')}</Text>
      )}

      {perceptionModels ? (
        <>
          <Text dimColor> | </Text>
          <Text dimColor>{presentation.t('agent.terminal.chrome.perception')}:</Text>
          <Text>{perceptionModels}</Text>
        </>
      ) : null}

      {queueSnapshot && queueSnapshot.pendingCount > 0 ? (
        <>
          <Text dimColor> | </Text>
          <Text color={tokens.warning}>{presentation.t('agent.terminal.chrome.queue')}:</Text>
          <Text color={tokens.warning}>{queueSnapshot.pendingCount}</Text>
          {queuePausedAfterCancel ? (
            <Text color={tokens.warning}>
              {' '}
              ({presentation.t('agent.terminal.queue.pausedAfterCancel')})
            </Text>
          ) : null}
        </>
      ) : null}

      {/* Spacer */}
      <Box flexGrow={1} />

      {/* Token usage bar */}
      <TokenUsage
        usage={{
          ...usage,
          input: contextTokenCount ?? usage.input,
        }}
        maxContextTokens={tokenBudget.effectiveInputBudget}
        maxOutputTokens={tokenBudget.effectiveMaxOutputTokens}
        modelMaxOutputTokens={tokenBudget.modelMaxOutputTokens}
      />
    </Box>
  );
}

function sessionModeColor(mode: string): string {
  switch (mode) {
    case 'agent':
      return tokens.info;
    case 'image':
      return tokens.success;
    case 'video':
      return tokens.warning;
    case 'audio':
      return tokens.code.keyword;
    default:
      return tokens.muted;
  }
}

/** Get theme color for execution mode */
function modeColor(mode: string): string {
  switch (mode) {
    case 'auto':
      return tokens.success;
    case 'plan':
      return tokens.warning;
    case 'ask':
      return tokens.info;
    default:
      return tokens.muted;
  }
}

/** Truncate model name: claude-sonnet-4-20250514 → claude-sonnet-4 */
function truncateModel(model: string): string {
  // Remove date suffix like -20250514
  return model.replace(/-\d{8}$/, '');
}

function formatMediaModels(
  mediaModels: { image?: string; video?: string; audio?: string } | undefined,
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string | null {
  if (!mediaModels) return null;
  const values = (['image', 'video', 'audio'] as const)
    .map((category) =>
      mediaModels[category]
        ? `${presentMediaCategory(category, presentation)}:${truncateModel(mediaModels[category])}`
        : undefined,
    )
    .filter((value): value is string => Boolean(value));
  return values.length > 0 ? values.join(',') : null;
}
