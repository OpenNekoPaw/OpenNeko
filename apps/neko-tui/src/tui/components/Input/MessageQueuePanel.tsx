import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { TuiQueueRowKind } from '../../core/message-queue-presenter';
import { presentTuiMessageQueue } from '../../core/message-queue-presenter';
import { useAgentTerminalPresentation } from '../../presentation/react-context';
import type { AgentTerminalPresentationContext } from '../../presentation/context';
import type { AgentTerminalMessageKey } from '../../presentation/terminal-messages';
import { useTuiAgentStore as useAgentStore } from '../../runtime/tui-runtime-context';
import { tokens } from '../../theme/tokens';

export interface MessageQueuePanelProps {
  readonly disabled?: boolean;
  readonly notice?: string | null;
  readonly onSendNext?: (queueItemId: string) => void;
  readonly onEdit?: (queueItemId: string) => void;
  readonly onCancel?: (queueItemId: string) => void;
}

export function MessageQueuePanel({
  disabled = false,
  notice,
  onSendNext,
  onEdit,
  onCancel,
}: MessageQueuePanelProps): React.JSX.Element | null {
  const snapshot = useAgentStore((state) => state.messageQueue.snapshot);
  const pausedAfterCancel = useAgentStore((state) => state.messageQueue.pausedAfterCancel);
  const terminal = useAgentTerminalPresentation();
  const presentation =
    snapshot && snapshot.pendingCount > 0 ? presentTuiMessageQueue(snapshot) : null;
  const actionableRow = presentation?.rows.find((row) => row.canEdit && row.canCancel);

  useInput(
    (input, key) => {
      if (!actionableRow || !key.ctrl) {
        return;
      }
      if (input === 'n') {
        onSendNext?.(actionableRow.id);
      } else if (input === 'e') {
        onEdit?.(actionableRow.id);
      } else if (input === 'x') {
        onCancel?.(actionableRow.id);
      }
    },
    { isActive: !disabled && Boolean(actionableRow) },
  );

  if (!presentation) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      marginLeft={1}
      marginRight={1}
      paddingLeft={1}
      paddingRight={1}
      borderStyle="single"
      borderColor={tokens.warning}
    >
      <Box>
        <Text color={tokens.warning} bold>
          {terminal.t('agent.terminal.queue.nextTurn')} · {presentation.pendingCount}
        </Text>
        {presentation.hasPriorityContinuation ? (
          <Text color={tokens.muted}>
            {' '}
            · {terminal.t('agent.terminal.queue.continuationPriority')}
          </Text>
        ) : null}
        {pausedAfterCancel ? (
          <Text color={tokens.warning}>
            {' '}
            · {terminal.t('agent.terminal.queue.pausedAfterCancel')}
          </Text>
        ) : null}
      </Box>
      {presentation.rows.map((row) => (
        <Box key={row.id}>
          <Text color={row.isPriorityContinuation ? tokens.info : tokens.muted}>
            {row.ordinal}. {queueKindLabel(row.kind, terminal)}:{' '}
          </Text>
          <Text>{row.preview}</Text>
        </Box>
      ))}
      {presentation.hiddenCount > 0 ? (
        <Text color={tokens.muted}>
          +{presentation.hiddenCount} {terminal.t('agent.terminal.queue.moreItems')}
        </Text>
      ) : null}
      {actionableRow ? (
        <Text color={tokens.muted}>
          {terminal.t('agent.terminal.queue.keyboardActions')}: ^N{' '}
          {terminal.t('agent.terminal.queue.sendNext')}
          {presentation.hasPriorityContinuation
            ? ` (${terminal.t('agent.terminal.queue.nextUserMessage')})`
            : ''}{' '}
          · ^E {terminal.t('agent.terminal.queue.edit')} · ^X{' '}
          {terminal.t('agent.terminal.queue.cancel')}
        </Text>
      ) : null}
      {notice ? <Text color={tokens.warning}>{notice}</Text> : null}
      <Text color={tokens.muted}>{terminal.t('agent.terminal.queue.commandHint')}</Text>
    </Box>
  );
}

function queueKindLabel(
  kind: TuiQueueRowKind,
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  switch (kind) {
    case 'user-message':
      return presentation.t('agent.terminal.queue.userMessage');
    case 'task-continuation':
      return presentation.t('agent.terminal.queue.taskContinuation');
    case 'subagent-continuation':
      return presentation.t('agent.terminal.queue.subagentContinuation');
    case 'system-continuation':
      return presentation.t('agent.terminal.queue.systemContinuation');
  }
}
