import type { SessionEvent } from '@deepseek-ai/dsh-session';

export function branchSeedThroughAssistantReply(
  events: readonly SessionEvent[],
  messageId: string,
): readonly SessionEvent[] {
  if (messageId.trim().length === 0) throw new Error('Assistant message identity is required.');
  const matches = events.filter(
    (event): event is SessionEvent<'assistant/message'> =>
      event.type === 'assistant/message' && event.data.message.id === messageId,
  );
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new Error(
      `Session branch requires exactly one assistant reply '${messageId}', found ${matches.length}.`,
    );
  }
  const message = matches[0];
  const boundary = events.find(
    (event): event is SessionEvent<'turn/end'> =>
      event.seq > message.seq && event.type === 'turn/end' && event.data.turn === message.data.turn,
  );
  if (boundary === undefined) {
    throw new Error(`Assistant reply '${messageId}' does not belong to a completed Session turn.`);
  }
  return events.slice(0, boundary.seq + 1);
}
