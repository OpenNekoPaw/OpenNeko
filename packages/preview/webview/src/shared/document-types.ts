/**
 * Document preview message types shared by document webviews.
 * Mirrors the extension-side protocol in extension/src/types/document-messages.ts.
 */

import type {
  ContentPageSelector,
  ContentTextRangeSelector,
  DocumentContentKind,
  DocumentExcerpt,
  DocumentRange,
  DocumentRegion,
  DocumentSourceRef,
} from '@neko/content-domain';

export type DocumentViewerCoordinate =
  | ContentPageSelector
  | ContentTextRangeSelector
  | {
      readonly kind: 'chapter';
      readonly chapterHref: string;
      readonly spineIndex?: number;
      readonly title?: string;
      readonly cfi?: string;
    }
  | {
      readonly kind: 'slide';
      readonly slideNumber: number;
      readonly slideIndex: number;
    }
  | {
      readonly kind: 'region';
      readonly pageNumber: number;
      readonly pageIndex?: number;
      readonly entryName?: string;
      readonly region: DocumentRegion;
    };

// =============================================================================
// Desktop host → Webview
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
  payload: { coordinate: DocumentViewerCoordinate };
}

export interface EpubNavigateMessage {
  type: 'epub:navigate';
  payload: { href: string };
}

export type DocumentHostMessage =
  DocumentDataMessage | DocumentRestoreStateMessage | DocumentNavigateMessage | EpubNavigateMessage;

// =============================================================================
// Webview → Desktop host
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
    coordinate: DocumentViewerCoordinate;
    range?: DocumentRange;
    excerpt?: DocumentExcerpt;
  };
}

export type DocumentWebviewMessage =
  | DocumentReadyMessage
  | DocumentSaveStateMessage
  | DocumentStatusUpdateMessage
  | DocumentSendToAiMessage;
