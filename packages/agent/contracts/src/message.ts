/**
 * Message Types — Core message protocol shared across extension, webview, and agent
 *
 * SSOT for: Message, ToolCall, ContentBlock, ContentBlockType, CodeDiff
 */

import type { PerceptionCard, ToolResultBackfillDiagnostic } from './perception-card';
import type { ToolResultAttachment } from './tool';
import { validateContentLocator, type ContentLocator } from '@neko/content';
import type { StoryboardTable, StoryboardValidationDiagnostic } from '@neko/canvas-domain';
import type { StoryboardPlanOverlay } from './storyboard-plan-overlay';
import type { ArtifactExtensionMap } from './composite-artifact';
import type { AgentContextType } from './agent-context';
import { isAgentContextType } from './agent-context';
import type { AgentArtifactTransferPayload } from './artifact-transfer';
import type { MessageAttachment } from './message-attachment';

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

export interface ToolCallProgress {
  readonly summary: string;
  readonly data?: unknown;
}

// ---------------------------------------------------------------------------
// ContentBlock
// ---------------------------------------------------------------------------

/**
 * Content block types for sequential rendering of AI responses.
 * Allows thinking, tool calls, text, and code diffs to be rendered in chronological order.
 */
export type ContentBlockType = 'thinking' | 'text' | 'tool_call' | 'code_diff' | 'composite';

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
  /** Revisioned caller-owned progress projection for the Tool Call. */
  toolProgress?: ToolCallProgress;
  /** For code_diff blocks */
  codeDiff?: CodeDiff;
  /** For composite blocks — structured multimodal presentation intent. */
  composite?: CompositeBlockData;
  /** Present only when the composite is derived from authoritative Markdown source. */
  compositeSource?: MarkdownDerivedCompositeSource;
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
  contentLocator?: ContentLocator;
  navigationData?: Record<string, string>;
}

const MESSAGE_CONTEXT_REFERENCE_FIELDS: ReadonlySet<string> = new Set([
  'type',
  'id',
  'label',
  'summary',
  'thumbnailUri',
  'mediaType',
  'contentLocator',
  'navigationData',
]);

export function parseMessageContextReference(value: unknown): MessageContextReference {
  if (
    !isMessageRecord(value) ||
    !Object.keys(value).every((key) => MESSAGE_CONTEXT_REFERENCE_FIELDS.has(key))
  ) {
    throw new Error('Agent message context reference must use the canonical shape.');
  }
  if (!isAgentContextType(value['type'])) {
    throw new Error(`Unknown Agent message context type '${String(value['type'])}'.`);
  }
  const locator =
    value['contentLocator'] === undefined
      ? undefined
      : validateContentLocator(value['contentLocator']);
  if (locator && !locator.ok) {
    throw new Error('Agent message context reference ContentLocator is invalid.');
  }
  const navigationData = parseMessageContextNavigationData(value['navigationData']);
  return {
    type: value['type'],
    id: requireMessageText(value['id'], 'id'),
    label: requireMessageText(value['label'], 'label'),
    ...(value['summary'] === undefined
      ? {}
      : { summary: requireMessageText(value['summary'], 'summary', true) }),
    ...(value['thumbnailUri'] === undefined
      ? {}
      : { thumbnailUri: requireMessageText(value['thumbnailUri'], 'thumbnailUri') }),
    ...(value['mediaType'] === undefined
      ? {}
      : { mediaType: parseAgentFileReferenceMediaType(value['mediaType']) }),
    ...(locator?.ok ? { contentLocator: locator.locator } : {}),
    ...(navigationData === undefined ? {} : { navigationData }),
  };
}

function parseMessageContextNavigationData(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isMessageRecord(value)) {
    throw new Error('Agent message context reference navigationData must contain strings.');
  }
  const parsed: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      throw new Error('Agent message context reference navigationData must contain strings.');
    }
    parsed[key] = entry;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// AgentFileReference — lightweight @path selection metadata
// ---------------------------------------------------------------------------

export type AgentFileReferenceSource =
  'workspace' | 'media-library' | 'asset-library' | 'entity-graph' | 'story' | 'canvas';

export type AgentFileReferenceMediaType =
  'video' | 'audio' | 'image' | 'sequence' | 'text' | 'document';

export interface AgentFileReference {
  id: string;
  contentLocator: ContentLocator;
  label: string;
  mediaType?: AgentFileReferenceMediaType;
  source?: AgentFileReferenceSource;
  thumbnailUri?: string;
}

export const AGENT_AUTHORIZED_CONTENT_REFERENCE_KIND = 'authorized-content-reference' as const;
const AGENT_FILE_REFERENCE_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'video',
  'audio',
  'image',
  'sequence',
  'text',
  'document',
]);

function parseAgentFileReferenceMediaType(value: unknown): AgentFileReferenceMediaType {
  if (!isAgentFileReferenceMediaType(value)) {
    throw new Error(`Unknown Agent file reference media type '${String(value)}'.`);
  }
  return value;
}

function isAgentFileReferenceMediaType(value: unknown): value is AgentFileReferenceMediaType {
  return typeof value === 'string' && AGENT_FILE_REFERENCE_MEDIA_TYPES.has(value);
}
const AGENT_FILE_REFERENCE_SOURCES: ReadonlySet<string> = new Set([
  'workspace',
  'media-library',
  'asset-library',
  'entity-graph',
  'story',
  'canvas',
]);
const AGENT_AUTHORIZED_CONTENT_REFERENCE_FIELDS = new Set([
  'kind',
  'locator',
  'mediaType',
  'source',
  'text',
]);

export interface AgentAuthorizedContentReferenceContextData {
  readonly kind: typeof AGENT_AUTHORIZED_CONTENT_REFERENCE_KIND;
  readonly locator: ContentLocator;
  readonly mediaType?: AgentFileReferenceMediaType;
  readonly source?: AgentFileReferenceSource;
  readonly text?: string;
}

export function isAgentAuthorizedContentReferenceContextData(
  value: unknown,
): value is AgentAuthorizedContentReferenceContextData {
  if (!isMessageRecord(value)) return false;
  const locator = validateContentLocator(value['locator']);
  const mediaType = value['mediaType'];
  const source = value['source'];
  return (
    Object.keys(value).every((key) => AGENT_AUTHORIZED_CONTENT_REFERENCE_FIELDS.has(key)) &&
    value['kind'] === AGENT_AUTHORIZED_CONTENT_REFERENCE_KIND &&
    locator.ok &&
    (mediaType === undefined ||
      (typeof mediaType === 'string' && AGENT_FILE_REFERENCE_MEDIA_TYPES.has(mediaType))) &&
    (source === undefined ||
      (typeof source === 'string' && AGENT_FILE_REFERENCE_SOURCES.has(source))) &&
    (value['text'] === undefined || typeof value['text'] === 'string')
  );
}

function isMessageRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireMessageText(value: unknown, label: string, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.includes('\u0000')
  ) {
    throw new Error(
      `Agent message context reference ${label} must be ${allowEmpty ? 'valid' : 'non-empty'} text.`,
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export interface MessageTurnTiming {
  /** Earliest visible Timeline item creation time for this Turn. */
  readonly startedAt: number;
  /** Authoritative terminal Timeline completion time when the Turn has settled. */
  readonly completedAt?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  attachments?: MessageAttachment[];
  /** Lightweight context references attached when the user sent this message */
  contextReferences?: MessageContextReference[];
  /** Associated subagent work item IDs. */
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
  /** Canonical Turn timing projected from the owning runtime, never summed from Tool durations. */
  turnTiming?: MessageTurnTiming;
  /**
   * Sequential content blocks for chronological rendering (assistant messages only).
   * Assistant tool calls and thinking content are represented here.
   */
  contentBlocks?: ContentBlock[];
}
