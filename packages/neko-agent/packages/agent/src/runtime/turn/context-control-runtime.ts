import {
  buildCompressionErrorMessage,
  buildCompressionResultMessage,
  buildContextTokenCountMessage,
  type CompressionResultData,
  type ContextHostMessage,
} from '../../session/context-host-message';

export type AgentContextControlAction = 'getTokenCount' | 'compressContext';

export interface AgentContextControlBaseInput {
  readonly conversationId: string;
  readonly postMessage: (message: ContextHostMessage) => void;
  readonly onMissingConversationId?: (action: AgentContextControlAction) => void;
}

export interface SendAgentContextTokenCountInput extends AgentContextControlBaseInput {
  readonly getTokenCount?: (conversationId: string) => number;
}

export interface CompressAgentContextInput extends AgentContextControlBaseInput {
  readonly compressContext?: (conversationId: string) => Promise<CompressionResultData>;
}

export type AgentContextControlResult =
  | { readonly status: 'sent' }
  | { readonly status: 'rejected'; readonly reason: 'missing-conversation-id' }
  | { readonly status: 'failed'; readonly error: unknown };

export function sendAgentContextTokenCount(
  input: SendAgentContextTokenCountInput,
): AgentContextControlResult {
  if (!input.conversationId) {
    input.onMissingConversationId?.('getTokenCount');
    return { status: 'rejected', reason: 'missing-conversation-id' };
  }

  input.postMessage(
    buildContextTokenCountMessage({
      conversationId: input.conversationId,
      tokenCount: input.getTokenCount?.(input.conversationId) ?? 0,
    }),
  );
  return { status: 'sent' };
}

export async function compressAgentContext(
  input: CompressAgentContextInput,
): Promise<AgentContextControlResult> {
  if (!input.conversationId) {
    input.onMissingConversationId?.('compressContext');
    return { status: 'rejected', reason: 'missing-conversation-id' };
  }

  if (!input.compressContext) {
    input.postMessage(
      buildCompressionErrorMessage({
        conversationId: input.conversationId,
        error: 'No active conversation or agent manager',
      }),
    );
    return { status: 'failed', error: 'No active conversation or agent manager' };
  }

  try {
    const result = await input.compressContext(input.conversationId);
    input.postMessage(
      buildCompressionResultMessage({ conversationId: input.conversationId, result }),
    );
    return { status: 'sent' };
  } catch (error) {
    input.postMessage(
      buildCompressionErrorMessage({ conversationId: input.conversationId, error }),
    );
    return { status: 'failed', error };
  }
}
