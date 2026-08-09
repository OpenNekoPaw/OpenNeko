/**
 * useSlashCommands - Slash command routing
 *
 * Uses a single slash command catalog for menu/help/routing.
 */

import { useCallback } from 'react';
import type { AgentInputCatalogMessage } from '@neko/agent-contracts';
import type { SlashCommand } from '../components/ChatView/InputArea/types';
import { extractSlashCommandArgs } from '../components/ChatView/InputArea/slash-command-catalog';
import { useAgentHostMessages } from '../host-runtime-context';

export interface UseSlashCommandsProps {
  inputCatalog?: AgentInputCatalogMessage;
  inputValue: string;
  activeConversationId: string | null;
  clearInput: () => void;
  reportInputDiagnostic?: (message: string) => void;
}

export interface UseSlashCommandsReturn {
  handleSlashCommand: (command: SlashCommand) => void;
}

export function useSlashCommands({
  inputCatalog,
  inputValue,
  activeConversationId,
  clearInput,
  reportInputDiagnostic,
}: UseSlashCommandsProps): UseSlashCommandsReturn {
  const agentHostMessages = useAgentHostMessages();

  const handleSlashCommand = useCallback(
    (command: SlashCommand) => {
      const args = extractSlashCommandArgs(inputValue, command);

      try {
        if (!activeConversationId || inputCatalog?.conversationId !== activeConversationId) {
          throw new Error('The exact Conversation input catalog is unavailable.');
        }
        const entry = inputCatalog.entries.find((candidate) => candidate.id === command.id);
        if (entry?.trigger !== 'command' || entry.availability.status !== 'available') {
          throw new Error(`Agent command '${command.name}' is stale or unavailable.`);
        }
        clearInput();
        agentHostMessages.invokeAgentInput(
          {
            kind: 'command',
            catalogEntryId: entry.id,
            commandId: entry.executable.commandId,
            handlerId: entry.executable.handlerId,
            ...(args === undefined ? {} : { args }),
          },
          activeConversationId,
        );
      } catch (error) {
        reportInputDiagnostic?.(error instanceof Error ? error.message : String(error));
      }
    },
    [
      activeConversationId,
      agentHostMessages,
      clearInput,
      inputCatalog,
      inputValue,
      reportInputDiagnostic,
    ],
  );

  return { handleSlashCommand };
}
