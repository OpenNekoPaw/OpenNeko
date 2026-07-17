import type {
  CompressionErrorProjection,
  CompressionResultProjection,
  ContextTokenCountProjection,
  ProjectCompressionErrorInput,
  ProjectCompressionResultInput,
  ProjectContextTokenCountInput,
} from '@neko-agent/types';

export function projectContextTokenCount(
  input: ProjectContextTokenCountInput,
): ContextTokenCountProjection {
  const tokenCounts = new Map(input.tokenCounts);
  tokenCounts.set(input.conversationId, input.tokenCount ?? 0);

  return {
    tokenCounts,
    shouldForceUpdate: isActiveConversation(input.activeConversationId, input.conversationId),
  };
}

export function projectCompressionResult(
  input: ProjectCompressionResultInput,
): CompressionResultProjection {
  const tokenCounts = new Map(input.tokenCounts);
  const compressing = new Map(input.compressing);

  compressing.set(input.conversationId, false);
  tokenCounts.set(input.conversationId, input.compressedTokens ?? 0);

  return {
    tokenCounts,
    compressing,
    shouldForceUpdate: isActiveConversation(input.activeConversationId, input.conversationId),
  };
}

export function projectCompressionError(
  input: ProjectCompressionErrorInput,
): CompressionErrorProjection {
  const compressing = new Map(input.compressing);
  compressing.set(input.conversationId, false);

  return {
    compressing,
    shouldForceUpdate: isActiveConversation(input.activeConversationId, input.conversationId),
  };
}

function isActiveConversation(
  activeConversationId: string | null,
  conversationId: string,
): boolean {
  return activeConversationId === conversationId;
}
