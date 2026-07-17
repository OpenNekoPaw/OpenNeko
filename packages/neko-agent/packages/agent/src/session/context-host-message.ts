export interface ContextTokenCountMessage {
  type: 'contextTokenCount';
  conversationId: string;
  tokenCount: number;
}

export interface CompressionResultMessage {
  type: 'compressionResult';
  conversationId: string;
  originalTokens: number;
  compressedTokens: number;
  ratio: number;
}

export interface CompressionErrorMessage {
  type: 'compressionError';
  conversationId: string;
  error: string;
}

export type ContextHostMessage =
  | ContextTokenCountMessage
  | CompressionResultMessage
  | CompressionErrorMessage;

/** Migration alias. Prefer ContextHostMessage. */
export type ContextWebviewMessage = ContextHostMessage;

export interface CompressionResultData {
  originalTokens: number;
  compressedTokens: number;
  ratio: number;
}

export function buildContextTokenCountMessage(input: {
  conversationId: string;
  tokenCount: number;
}): ContextTokenCountMessage {
  return {
    type: 'contextTokenCount',
    conversationId: requireConversationId(input.conversationId, 'contextTokenCount'),
    tokenCount: input.tokenCount,
  };
}

export function buildCompressionResultMessage(input: {
  conversationId: string;
  result: CompressionResultData;
}): CompressionResultMessage {
  return {
    type: 'compressionResult',
    conversationId: requireConversationId(input.conversationId, 'compressionResult'),
    originalTokens: input.result.originalTokens,
    compressedTokens: input.result.compressedTokens,
    ratio: input.result.ratio,
  };
}

export function buildCompressionErrorMessage(input: {
  conversationId: string;
  error: unknown;
}): CompressionErrorMessage {
  return {
    type: 'compressionError',
    conversationId: requireConversationId(input.conversationId, 'compressionError'),
    error:
      input.error instanceof Error
        ? input.error.message
        : typeof input.error === 'string'
          ? input.error
          : 'Unknown error',
  };
}

function requireConversationId(conversationId: string, messageType: string): string {
  if (conversationId.trim().length === 0) {
    throw new Error(`${messageType} requires non-empty conversationId`);
  }
  return conversationId;
}
