/**
 * Document preview message types shared by document webviews.
 * Mirrors the extension-side protocol in extension/src/types/document-messages.ts.
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
// Extension → Webview
// =============================================================================

export interface DocumentDataMessage {
  type: 'document:data';
  payload: {
    url: string;
    fileName?: string;
    fileSize?: number;
  };
}

export interface DocumentRestoreStateMessage {
  type: 'document:restoreState';
  payload: Record<string, unknown>;
}

export interface DocumentNavigateMessage {
  type: 'document:navigate';
  payload: { locator: DocumentLocator };
}

export interface EpubNavigateMessage {
  type: 'epub:navigate';
  payload: { href: string };
}

export type DocumentExtensionMessage =
  | DocumentDataMessage
  | DocumentRestoreStateMessage
  | DocumentNavigateMessage
  | EpubNavigateMessage;

// =============================================================================
// Webview → Extension
// =============================================================================

export interface DocumentReadyMessage {
  type: 'ready';
}

export interface DocumentSaveStateMessage {
  type: 'document:saveState';
  payload: Record<string, unknown>;
}

export interface DocumentStatusPayload {
  pageCount?: number;
  currentPage?: number;
  chapterHref?: string;
  chapterTitle?: string;
  fileSize?: number;
  zoom?: number;
}

export interface DocumentStatusUpdateMessage {
  type: 'document:statusUpdate';
  payload: DocumentStatusPayload;
}

export interface DocumentSendToAiMessage {
  type: 'document:sendToAi';
  payload: {
    text?: string;
    imageData?: string;
    contentKind: DocumentContentKind;
    context?: {
      page?: number;
      chapter?: string;
      region?: DocumentRegion;
    };
    source?: DocumentSourceRef;
    locator: DocumentLocator;
    range?: DocumentRange;
    excerpt?: DocumentExcerpt;
  };
}

export type DocumentWebviewMessage =
  | DocumentReadyMessage
  | DocumentSaveStateMessage
  | DocumentStatusUpdateMessage
  | DocumentSendToAiMessage;
