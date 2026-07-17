/**
 * Conversation Compressor Types
 *
 * Defines types for compressing conversation history using
 * sliding window and summarization strategies.
 *
 * Note: Types are prefixed with "Conversation" to avoid conflicts with
 * the simpler compression types in memory.ts.
 */

import type { ChatMessage } from './platform';

/**
 * Conversation compression strategy types
 */
export type ConversationCompressionStrategy = 'sliding_window' | 'summarize' | 'hybrid';

/**
 * Tool result compression configuration
 */
export interface ToolResultCompressionConfig {
  /** Maximum token length for a single tool result */
  maxLength: number;
  /** Fields to keep in compressed result */
  keepFields: string[];
  /** Fields to discard */
  discardFields: string[];
}

/**
 * Conversation window configuration
 */
export interface ConversationWindowConfig {
  /** Number of recent turns to keep in full */
  recentTurns: number;
  /** How to handle older turns: 'summary' | 'discard' */
  olderTurnsStrategy: 'summary' | 'discard';
  /** Maximum tokens for older turns summary */
  olderTurnsSummaryMaxTokens: number;
}

/**
 * Skill context compression configuration
 */
export interface SkillCompressionConfig {
  /** How to handle inactive skills: 'index-only' | 'keep' */
  inactiveSkillsStrategy: 'index-only' | 'keep';
  /** Turns without use before skill is considered inactive */
  activeSkillAge: number;
}

/**
 * Compression triggers configuration
 */
export interface CompressionTriggersConfig {
  /** Token threshold to trigger compression */
  tokenThreshold: number;
  /** Turn threshold to trigger compression */
  turnThreshold: number;
}

/**
 * Full compressor configuration
 */
export interface ConversationCompressorConfig {
  /** Tool result compression settings */
  toolResultCompression: ToolResultCompressionConfig;
  /** Conversation window settings */
  conversationWindow: ConversationWindowConfig;
  /** Skill compression settings */
  skillCompression: SkillCompressionConfig;
  /** Compression triggers */
  triggers: CompressionTriggersConfig;
}

/**
 * Default compressor configuration
 */
export const DEFAULT_COMPRESSOR_CONFIG: ConversationCompressorConfig = {
  toolResultCompression: {
    maxLength: 500,
    keepFields: ['status', 'summary', 'error', 'result'],
    discardFields: ['rawData', 'debug', 'trace', 'stackTrace'],
  },
  conversationWindow: {
    recentTurns: 10,
    olderTurnsStrategy: 'summary',
    olderTurnsSummaryMaxTokens: 2000,
  },
  skillCompression: {
    inactiveSkillsStrategy: 'index-only',
    activeSkillAge: 5,
  },
  triggers: {
    tokenThreshold: 80000,
    turnThreshold: 20,
  },
};

/**
 * Compressed message with metadata
 */
export interface CompressedMessage {
  /** Original message or summary */
  message: ChatMessage;
  /** Source message indexes in the pre-compression history */
  sourceIndexes?: number[];
  /** Whether this is a summary of multiple messages */
  isSummary: boolean;
  /** Original message count if summary */
  originalCount?: number;
  /** Original token count before compression */
  originalTokens?: number;
  /** Compressed token count */
  compressedTokens: number;
  /** Turn range if summary (e.g., "turns 1-5") */
  turnRange?: string;
}

/**
 * Conversation compression result
 */
export interface ConversationCompressionResult {
  /** Compressed messages */
  messages: CompressedMessage[];
  /** Total tokens before compression */
  originalTokens: number;
  /** Total tokens after compression */
  compressedTokens: number;
  /** Compression ratio (0-1, lower = more compression) */
  compressionRatio: number;
  /** Number of messages removed */
  messagesRemoved: number;
  /** Number of summaries created */
  summariesCreated: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Turn information for compression
 */
export interface TurnInfo {
  /** Turn number */
  turnNumber: number;
  /** Messages in this turn */
  messages: ChatMessage[];
  /** Total tokens in this turn */
  tokenCount: number;
  /** Skills used in this turn */
  skillsUsed: string[];
  /** Tools called in this turn */
  toolsCalled: string[];
  /** Timestamp */
  timestamp: number;
}

/**
 * Summarization request
 */
export interface SummarizationRequest {
  /** Messages to summarize */
  messages: ChatMessage[];
  /** Maximum tokens for summary */
  maxTokens: number;
  /** Prompt language for model-facing summarization wrappers */
  locale?: string;
  /** Context hint for summarization */
  contextHint?: string;
}

/**
 * Summarization result
 */
export interface SummarizationResult {
  /** Summary text */
  summary: string;
  /** Source path that produced the summary */
  source?: 'llm' | 'fallback';
  /** Whether the summary was produced by a degraded/local path */
  degraded?: boolean;
  /** Token count of summary */
  tokenCount: number;
  /** Key points extracted */
  keyPoints: string[];
  /** Important entities mentioned */
  entities: string[];
}

/**
 * Summarizer interface (to be implemented by LLM service)
 */
export interface ISummarizer {
  /**
   * Summarize messages
   */
  summarize(request: SummarizationRequest): Promise<SummarizationResult>;
}

/**
 * Conversation compressor interface
 */
// ────────────────────────────────────────────
// Core compressor interface
// ────────────────────────────────────────────

export interface IConversationCompressor {
  /**
   * Configure the compressor
   */
  configure(config: Partial<ConversationCompressorConfig>): void;

  /**
   * Get current configuration
   */
  getConfig(): ConversationCompressorConfig;

  /**
   * Check if compression should be triggered
   */
  shouldCompress(messages: ChatMessage[], currentTokens: number): boolean;

  /**
   * Compress conversation history
   */
  compress(
    messages: ChatMessage[],
    options?: {
      /** Force compression even if threshold not met */
      force?: boolean;
      /** Target token count */
      targetTokens?: number;
      /** Active skills to preserve context for */
      activeSkills?: string[];
    },
  ): Promise<ConversationCompressionResult>;

  /**
   * Compress a single tool result
   */
  compressToolResult(result: Record<string, unknown>): Record<string, unknown>;

  /**
   * Get turn information from messages
   */
  getTurns(messages: ChatMessage[]): TurnInfo[];

  /**
   * Estimate token count for messages
   */
  estimateTokens(messages: ChatMessage[]): number;
}
