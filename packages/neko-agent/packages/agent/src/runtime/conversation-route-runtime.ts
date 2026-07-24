import { type GlobalErrorMessage } from '@neko-agent/types';

export interface ExplicitConversationMessage {
  readonly conversationId?: unknown;
}

export interface ResolveRequiredConversationRouteInput {
  readonly message: ExplicitConversationMessage;
  readonly action: string;
}

export type ResolveRequiredConversationRouteResult =
  | {
      readonly status: 'resolved';
      readonly conversationId: string;
    }
  | {
      readonly status: 'missing';
      readonly message: GlobalErrorMessage;
    };

export function resolveRequiredConversationRoute(
  input: ResolveRequiredConversationRouteInput,
): ResolveRequiredConversationRouteResult {
  const conversationId = readExplicitConversationId(input.message);
  if (conversationId) {
    return { status: 'resolved', conversationId };
  }

  return {
    status: 'missing',
    message: buildMissingConversationIdMessage(input.action),
  };
}

function readExplicitConversationId(message: ExplicitConversationMessage): string | null {
  return typeof message.conversationId === 'string' && message.conversationId.trim().length > 0
    ? message.conversationId
    : null;
}

function buildMissingConversationIdMessage(action: string): GlobalErrorMessage {
  return {
    type: 'globalError',
    message: `Cannot ${action} without an explicit conversationId.`,
  };
}
