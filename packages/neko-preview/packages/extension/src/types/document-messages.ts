/**
 * Document Preview message protocol types
 *
 * Defines the postMessage contract between Extension and Webview
 * for document preview providers (PDF, CBZ, EPUB, DOCX).
 */

import type {
  DocumentContentKind,
  DocumentExcerpt,
  DocumentLocator,
  DocumentRange,
  DocumentRegion,
  DocumentSourceRef,
} from '@neko/shared';

// =============================================================================
// Extension → Webview Messages
// =============================================================================

export interface DocumentDataMessage {
  type: 'document:data';
  payload: {
    /** Direct webview URI exposed by the Extension Host for document viewers. */
    url: string;
    /** File name for display (optional — not sent by all providers) */
    fileName?: string;
    /** File size in bytes (optional — not sent by all providers) */
    fileSize?: number;
  };
}

export interface EpubNavigateMessage {
  type: 'epub:navigate';
  payload: { href: string };
}

export interface DocumentRestoreStateMessage {
  type: 'document:restoreState';
  payload: Record<string, unknown>;
}

export type DocumentExtensionMessage =
  | DocumentDataMessage
  | EpubNavigateMessage
  | DocumentRestoreStateMessage;

// =============================================================================
// Webview → Extension Messages
// =============================================================================

export interface DocumentReadyMessage {
  type: 'ready';
}

export interface DocumentSaveStateMessage {
  type: 'document:saveState';
  payload: Record<string, unknown>;
}

export interface DocumentStatusPayload {
  /** Total page/chapter count for the current document. */
  pageCount?: number;
  /** Current page number or current chapter index (1-based). */
  currentPage?: number;
  /** Current chapter href for chapter-based documents (EPUB). */
  chapterHref?: string;
  /** Current chapter title for chapter-based documents (EPUB). */
  chapterTitle?: string;
  /** File size in bytes. */
  fileSize?: number;
  /** Zoom percentage, e.g. 125. */
  zoom?: number;
}

export interface DocumentStatusUpdateMessage {
  type: 'document:statusUpdate';
  payload: DocumentStatusPayload;
}

export interface DocumentSendToAiMessage {
  type: 'document:sendToAi';
  payload: {
    /** Selected text content (inline) */
    text?: string;
    /** Image base64 data (inline) */
    imageData?: string;
    /** Content type — drives agent intent prompt */
    contentKind: DocumentContentKind;
    /** Location context within the document */
    context?: {
      page?: number;
      chapter?: string;
      region?: DocumentRegion;
    };
    /** Structured source, normally enriched by Extension before forwarding to Agent. */
    source?: DocumentSourceRef;
    /** Stable semantic document locator emitted by the viewer. */
    locator: DocumentLocator;
    /** Semantic document range for follow-up reads. */
    range?: DocumentRange;
    /** Bounded inline excerpt attached to the context payload. */
    excerpt?: DocumentExcerpt;
  };
}

export type DocumentWebviewMessage =
  | DocumentReadyMessage
  | DocumentSaveStateMessage
  | DocumentStatusUpdateMessage
  | DocumentSendToAiMessage;
