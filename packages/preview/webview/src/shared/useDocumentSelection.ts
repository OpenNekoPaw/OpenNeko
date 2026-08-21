/**
 * Hook to capture text selection in document preview webviews.
 *
 * Listens for selectionchange events, debounces, and provides
 * selection state + a callback to send selection to AI agent.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { postMessage } from './useHostMessage';
import type { DocumentViewerCoordinate } from './document-types';

export interface DocumentSelection {
  /** Selected text content */
  text: string;
  /** Bounding rect of the selection (for FAB positioning) */
  rect: DOMRect | null;
}

export interface UseDocumentSelectionOptions {
  /** Current page number (PDF/CBZ) or undefined */
  pageNumber?: number;
  /** Current chapter title (EPUB) or undefined */
  chapterTitle?: string;
  /** Stable coordinate for the current viewer position. */
  coordinate?: DocumentViewerCoordinate;
  /** Resolve a coordinate for the current selection/page at send time. */
  getCoordinate?: (input: {
    pageNumber?: number;
    chapterTitle?: string;
  }) => DocumentViewerCoordinate | undefined;
  /** Whether selection is enabled */
  enabled?: boolean;
}

export function useDocumentSelection(options: UseDocumentSelectionOptions = {}) {
  const { pageNumber, chapterTitle, enabled = true } = options;
  const getCoordinate = options.getCoordinate;
  const explicitCoordinate = options.coordinate;
  const currentCoordinate = useMemo(
    () =>
      getCoordinate?.({ pageNumber, chapterTitle }) ??
      explicitCoordinate ??
      buildDefaultCoordinate(pageNumber, chapterTitle),
    [getCoordinate, explicitCoordinate, pageNumber, chapterTitle],
  );
  const [selection, setSelection] = useState<DocumentSelection | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return;

    const handleSelectionChange = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? '';
        if (text.length > 0) {
          const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
          setSelection({
            text,
            rect: range?.getBoundingClientRect() ?? null,
          });
        } else {
          setSelection(null);
        }
      }, 300);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled]);

  /** Send selected text to agent */
  const sendTextToAgent = useCallback(() => {
    if (!selection) return;
    postMessage({
      type: 'document:sendToAi',
      payload: {
        text: selection.text,
        contentKind: 'text',
        context: {
          page: pageNumber,
          chapter: chapterTitle,
        },
        coordinate: currentCoordinate,
        excerpt: {
          contentKind: 'text',
          text: selection.text,
          truncated: false,
        },
      },
    } as never);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, [selection, pageNumber, chapterTitle, currentCoordinate]);

  /** Send a page region as image (CBZ frame selection) */
  const sendRegionToAgent = useCallback(
    (
      imageData: string,
      region: { x: number; y: number; width: number; height: number },
      page?: number,
    ) => {
      postMessage({
        type: 'document:sendToAi',
        payload: {
          imageData,
          contentKind: 'image',
          context: {
            page: page ?? pageNumber,
            region,
          },
          coordinate: {
            kind: 'region',
            pageNumber: page ?? pageNumber ?? 1,
            pageIndex: Math.max(0, (page ?? pageNumber ?? 1) - 1),
            region,
          },
          excerpt: {
            contentKind: 'image',
            imageData,
            truncated: false,
          },
        },
      } as never);
    },
    [pageNumber],
  );

  /** Send a full page reference — agent reads on demand */
  const sendFileToAgent = useCallback(
    (page?: number) => {
      postMessage({
        type: 'document:sendToAi',
        payload: {
          contentKind: 'image',
          context: {
            page: page ?? pageNumber,
          },
          coordinate:
            getCoordinate?.({ pageNumber: page ?? pageNumber, chapterTitle }) ??
            explicitCoordinate ??
            buildDefaultCoordinate(page ?? pageNumber, chapterTitle),
        },
      } as never);
    },
    [pageNumber, chapterTitle, getCoordinate, explicitCoordinate],
  );

  return {
    selection,
    sendTextToAgent,
    sendRegionToAgent,
    sendFileToAgent,
    clearSelection: () => setSelection(null),
  };
}

function buildDefaultCoordinate(
  pageNumber: number | undefined,
  chapterTitle: string | undefined,
): DocumentViewerCoordinate | undefined {
  if (pageNumber !== undefined) {
    return {
      kind: 'page',
      pageNumber,
      pageIndex: Math.max(0, pageNumber - 1),
    };
  }
  if (chapterTitle) {
    return {
      kind: 'chapter',
      chapterHref: chapterTitle,
      title: chapterTitle,
    };
  }
  return undefined;
}
