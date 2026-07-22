/**
 * Message Types — Core message protocol shared across extension, webview, and agent
 *
 * SSOT for: Message, ToolCall, ContentBlock, ContentBlockType, CodeDiff
 */

import type {
  AgentCapabilityInvocationResult,
  AgentContextType,
  ArtifactExtensionMap,
  MessageAttachment,
  PerceptionCard,
  StoryboardPlanOverlay,
  StoryboardTable,
  StoryboardValidationDiagnostic,
  ToolResultAttachment,
  ToolResultBackfillDiagnostic,
} from '@neko/shared';
import type { AgentArtifactTransferPayload } from './artifact-transfer';

// ---------------------------------------------------------------------------
// ToolCall (internal format — NOT the LLM wire format in platform/adapter)
// ---------------------------------------------------------------------------

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: {
    success: boolean;
    data: unknown;
    error?: string;
    /** Execution time in milliseconds */
    duration?: number;
    attachments?: readonly ToolResultAttachment[];
    perceptionCards?: readonly PerceptionCard[];
    backfillDiagnostics?: readonly ToolResultBackfillDiagnostic[];
    artifacts?: readonly AgentArtifactTransferPayload[];
  };
  /** For tool confirmation (ask mode) */
  pendingConfirmation?: boolean;
  confirmation?: {
    action: string;
    description: string;
    details: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// ContentBlock
// ---------------------------------------------------------------------------

/**
 * Content block types for sequential rendering of AI responses.
 * Allows thinking, tool calls, text, and code diffs to be rendered in chronological order.
 */
export type ContentBlockType =
  'thinking' | 'text' | 'tool_call' | 'code_diff' | 'composite' | 'canvas_lifecycle';

export type CompositeTemplate = 'storyboard-table' | 'comparison' | 'gallery' | 'report';

export interface MediaRef {
  readonly toolCallId: string;
  readonly assetIndex?: number;
  readonly caption?: string;
  readonly role?: string;
}

export interface CompositeSection {
  readonly heading?: string;
  readonly content?: string;
  readonly mediaRefs?: readonly MediaRef[];
  readonly layout?: 'inline' | 'grid' | 'table-row';
  readonly extensions?: ArtifactExtensionMap;
}

export interface CompositeBlockData {
  readonly template: CompositeTemplate;
  readonly title?: string;
  readonly storyboardTable?: StoryboardTable;
  readonly storyboardPlanOverlays?: readonly StoryboardPlanOverlay[];
  readonly storyboardDiagnostics?: readonly StoryboardValidationDiagnostic[];
  readonly sections: readonly CompositeSection[];
  readonly extensions?: ArtifactExtensionMap;
}

/**
 * Provenance for a semantic composite projected from a normalized Markdown code block.
 * The Markdown text block remains the authoritative visual source; derived blocks are
 * metadata carriers and must not be rendered as a second standalone artifact.
 */
export interface MarkdownDerivedCompositeSource {
  readonly kind: 'normalized-markdown-code-block';
  readonly sourceBlockId: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly language?: string;
  readonly candidateIndex: number;
}

export interface CanvasLifecycleBlockData {
  readonly requestId: string;
  readonly success: boolean;
  readonly result: AgentCapabilityInvocationResult;
  readonly error?: string;
}

/**
 * Code diff information for file edits
 */
export interface CodeDiff {
  filePath: string;
  oldContent: string;
  newContent: string;
  language?: string;
  /** Diff status */
  status: 'pending' | 'accepted' | 'rejected';
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  timestamp: number;
  /** For thinking blocks */
  thinking?: string;
  isThinkingComplete?: boolean;
  /** For text blocks */
  content?: string;
  isStreaming?: boolean;
  /** For tool_call blocks */
  toolCall?: ToolCall;
  /** For code_diff blocks */
  codeDiff?: CodeDiff;
  /** For composite blocks — structured multimodal presentation intent. */
  composite?: CompositeBlockData;
  /** Present only when the composite is derived from authoritative Markdown source. */
  compositeSource?: MarkdownDerivedCompositeSource;
  /** For Canvas lifecycle capability results and follow-up actions. */
  canvasLifecycle?: CanvasLifecycleBlockData;
}

// ---------------------------------------------------------------------------
// MessageContextReference — lightweight context chip stored with user messages
// ---------------------------------------------------------------------------

export interface MessageContextReference {
  type: AgentContextType;
  id: string;
  label: string;
  summary?: string;
  thumbnailUri?: string;
  mediaType?: AgentFileReferenceMediaType;
  navigationData?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// AgentFileReference — lightweight @path selection metadata
// ---------------------------------------------------------------------------

export type AgentFileReferenceSource =
  'workspace' | 'media-library' | 'entity-graph' | 'story' | 'canvas';

export type AgentFileReferenceMediaType =
  'video' | 'audio' | 'image' | 'sequence' | 'text' | 'document';

export interface AgentFileReference {
  id: string;
  path: string;
  label: string;
  mediaType?: AgentFileReferenceMediaType;
  source?: AgentFileReferenceSource;
  thumbnailUri?: string;
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  attachments?: MessageAttachment[];
  /** Lightweight context references attached when the user sent this message */
  contextReferences?: MessageContextReference[];
  /** Associated unified work item IDs (media tasks, tool background tasks, subagents) */
  workItemIds?: string[];
  /** Message feedback */
  feedback?: 'positive' | 'negative';
  editedAt?: number;
  originalContent?: string;
  /** Message cancelled by user (ESC key) */
  isCancelled?: boolean;
  /** Message is an error notification (API failure, timeout, etc.) */
  isError?: boolean;
  /** Message was queued while agent is running */
  isQueued?: boolean;
  /**
   * Sequential content blocks for chronological rendering (assistant messages only).
   * Assistant tool calls and thinking content are represented here.
   */
  contentBlocks?: ContentBlock[];
}
