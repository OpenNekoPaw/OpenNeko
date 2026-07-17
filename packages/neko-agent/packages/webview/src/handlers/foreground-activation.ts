import type { PendingForegroundConversationActivation } from './types';

export function shouldActivateForegroundConversation(
  pending: PendingForegroundConversationActivation | null | undefined,
  conversationId: string | undefined,
  activation?: { readonly activationId: number; readonly tabStateRevision: number },
): boolean {
  if (!pending || !conversationId) return false;

  switch (pending.reason) {
    case 'switch-conversation':
      return (
        pending.conversationId === conversationId &&
        activation?.activationId === pending.activationId &&
        activation?.tabStateRevision === pending.tabStateRevision
      );
    case 'new-conversation':
      return !pending.previousConversationIds.includes(conversationId);
  }
}
