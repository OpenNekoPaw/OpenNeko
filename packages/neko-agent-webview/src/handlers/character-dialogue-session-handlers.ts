/**
 * Character Dialogue session projection handlers.
 */

import { defineHandler } from './types';
import type { HandlerRegistration, MessageHandler } from './types';
import type {
  CharacterDialogueSessionExitedMessage,
  CharacterDialogueSessionStartedMessage,
} from './messages';
import { openConversationTabBinding } from './conversation-tab-session-state';

const handleCharacterDialogueSessionStarted: MessageHandler<'characterDialogueSessionStarted'> = (
  message: CharacterDialogueSessionStartedMessage,
  context,
) => {
  openConversationTabBinding(context, {
    ...message.tab,
    kind: 'character-dialogue',
    characterDialogueSession: message.session,
  });
};

const handleCharacterDialogueSessionExited: MessageHandler<'characterDialogueSessionExited'> = (
  message: CharacterDialogueSessionExitedMessage,
  context,
) => {
  context.setOpenTabs((prev) =>
    prev.map((tab) =>
      tab.kind === 'character-dialogue' &&
      tab.conversationId === message.sessionId &&
      tab.characterDialogueSession
        ? {
            ...tab,
            characterDialogueSession: { ...tab.characterDialogueSession, status: 'exited' },
          }
        : tab,
    ),
  );
};

export const characterDialogueSessionHandlers: HandlerRegistration[] = [
  defineHandler('characterDialogueSessionStarted', handleCharacterDialogueSessionStarted),
  defineHandler('characterDialogueSessionExited', handleCharacterDialogueSessionExited),
];
