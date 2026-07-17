/**
 * Embody Character session projection handlers.
 */

import { discardConversationSnapshotProjection } from '@/render-lifecycle/conversation-render-state-adapter';
import { defineHandler } from './types';
import type { HandlerRegistration, MessageHandler } from './types';
import type {
  EmbodyCharacterSessionExitedMessage,
  EmbodyCharacterSessionStartedMessage,
} from './messages';
import { openConversationTabBinding } from './conversation-tab-session-state';

const handleEmbodyCharacterSessionStarted: MessageHandler<'embodyCharacterSessionStarted'> = (
  message: EmbodyCharacterSessionStartedMessage,
  context,
) => {
  discardConversationSnapshotProjection({
    conversationId: message.session.sessionId,
    conversationMessagesRef: context.conversationMessagesRef,
    conversationStreamingRef: context.conversationStreamingRef,
  });
  openConversationTabBinding(context, {
    ...message.tab,
    kind: 'embody-character',
    embodyCharacterSession: message.session,
  });
};

const handleEmbodyCharacterSessionExited: MessageHandler<'embodyCharacterSessionExited'> = (
  message: EmbodyCharacterSessionExitedMessage,
  context,
) => {
  context.setOpenTabs((prev) =>
    prev.map((tab) =>
      tab.kind === 'embody-character' &&
      tab.conversationId === message.sessionId &&
      tab.embodyCharacterSession
        ? {
            ...tab,
            embodyCharacterSession: { ...tab.embodyCharacterSession, status: 'exited' },
          }
        : tab,
    ),
  );
};

export const embodyCharacterSessionHandlers: HandlerRegistration[] = [
  defineHandler('embodyCharacterSessionStarted', handleEmbodyCharacterSessionStarted),
  defineHandler('embodyCharacterSessionExited', handleEmbodyCharacterSessionExited),
];
