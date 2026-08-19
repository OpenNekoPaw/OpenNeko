export interface ProjectContextTokenCountInput {
  tokenCounts: ReadonlyMap<string, number>;
  activeConversationId: string | null;
  conversationId: string;
  tokenCount?: number;
}

export interface ProjectCompressionResultInput {
  tokenCounts: ReadonlyMap<string, number>;
  compressing: ReadonlyMap<string, boolean>;
  activeConversationId: string | null;
  conversationId: string;
  compressedTokens?: number;
}

export interface ProjectCompressionErrorInput {
  compressing: ReadonlyMap<string, boolean>;
  activeConversationId: string | null;
  conversationId: string;
}

export interface ContextTokenCountProjection {
  tokenCounts: Map<string, number>;
  shouldForceUpdate: boolean;
}

export interface CompressionResultProjection {
  tokenCounts: Map<string, number>;
  compressing: Map<string, boolean>;
  shouldForceUpdate: boolean;
}

export interface CompressionErrorProjection {
  compressing: Map<string, boolean>;
  shouldForceUpdate: boolean;
}
