/**
 * CBZ Viewer — renders comic book ZIP archives as image gallery.
 * Supports waterfall (continuous scroll) and single-page modes.
 * Region selection for AI Vision analysis in both modes.
 *
 * Lazy loading strategy:
 * - Single-page: current ±2 pages decompressed as Blob URLs (sliding window)
 * - Waterfall: IntersectionObserver decodes visible ±3 pages, revokes the rest
 */

import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import { type Entry, BlobWriter, ZipReader, HttpReader } from '@zip.js/zip.js';
import { useExtensionMessage, postMessage } from '../shared/useVscodeMessage';
import { useDocumentSelection } from '../shared/useDocumentSelection';
import { DocumentContextMenu, useDocumentContextActions } from '../shared/DocumentContextMenu';
import {
  usePersistedState,
  initPersistedStore,
  notifySubscribers,
} from '../shared/usePersistedState';
import { useTranslation } from '../i18n/I18nContext';

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
// Pages to keep decoded on each side of the current page
const PREFETCH = 2;
// Buffer for waterfall mode (larger since comics are big images)
const WATERFALL_BUFFER = 3;
// Default placeholder height before image is loaded
const DEFAULT_PAGE_HEIGHT = 800;

function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export const CbzViewer: FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Lightweight zip entry references — no image data yet
  const [imageEntries, setImageEntries] = useState<Entry[]>([]);
  // Sparse cache of decoded pages: index → Blob URL
  const [pageCache, setPageCache] = useState<Map<number, string>>(new Map());
  const [currentPage, setCurrentPage] = usePersistedState('currentPage', 0);
  const [viewMode, setViewMode] = usePersistedState<'scroll' | 'single'>('viewMode', 'scroll');
  // Track natural image heights after load (for stable scroll)
  const [imageHeights, setImageHeights] = useState<Map<number, number>>(new Map());
  const persistedPageRef = useRef(currentPage);
  persistedPageRef.current = currentPage;
  const pageCacheRef = useRef(pageCache);
  pageCacheRef.current = pageCache;
  const pendingPageRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Track which pages are currently being decoded to avoid duplicate work
  const decodingRef = useRef<Set<number>>(new Set());
  // Waterfall mode refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  // Track active waterfall images for region selection
  const waterfallImgRefs = useRef<Map<number, HTMLImageElement>>(new Map());

  const getPageLocator = useCallback(
    ({ pageNumber }: { pageNumber?: number }) => {
      const page = pageNumber ?? currentPage + 1;
      return {
        kind: 'page' as const,
        pageNumber: page,
        pageIndex: Math.max(0, page - 1),
        entryName: imageEntries[Math.max(0, page - 1)]?.filename,
      };
    },
    [currentPage, imageEntries],
  );

  const { sendRegionToAgent, sendFileToAgent } = useDocumentSelection({
    pageNumber: currentPage + 1,
    getLocator: getPageLocator,
    enabled: false, // CBZ uses region selection, not text
  });

  // Region selection state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  // Which page index the region selection is on (for waterfall mode)
  const [selectionPageIdx, setSelectionPageIdx] = useState(0);

  useExtensionMessage((msg) => {
    const m = msg as unknown as { type: string; payload: Record<string, unknown> };
    if (m.type === 'document:restoreState') {
      initPersistedStore(m.payload as Record<string, unknown>);
      notifySubscribers();
    } else if (msg.type === 'document:data') {
      void loadCbzFromUrl(msg.payload.url);
    } else if (msg.type === 'document:navigate') {
      const locator = msg.payload.locator;
      const pageNumber =
        locator.kind === 'page' || locator.kind === 'region' ? locator.pageNumber : undefined;
      if (pageNumber !== undefined) {
        if (imageEntries.length === 0) {
          pendingPageRef.current = pageNumber;
          return;
        }
        goToPage(pageNumber - 1);
      }
    }
  });

  useEffect(() => {
    postMessage({ type: 'ready' } as never);
  }, []);

  /** Load CBZ from a localhost URL — zip.js HttpReader uses Range requests. */
  const loadCbzFromUrl = useCallback(async (url: string) => {
    try {
      setLoading(true);
      setError(null);

      const reader = new ZipReader(new HttpReader(url, { useRangeHeader: true }));
      const entries = await reader.getEntries();
      await reader.close();

      const filtered = entries
        .filter((e) => !e.directory && IMAGE_EXTENSIONS.test(e.filename))
        .sort((a, b) => naturalSort(a.filename, b.filename));

      setImageEntries(filtered);
      setPageCache(new Map());
      setImageHeights(new Map());
      const saved = persistedPageRef.current;
      const restoredPage = saved >= 0 && saved < filtered.length ? saved : 0;
      setCurrentPage(restoredPage);
      decodingRef.current.clear();
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  // Decode a single page into a Blob URL
  const decodePage = useCallback(async (index: number, entries: Entry[]) => {
    if (decodingRef.current.has(index)) return;
    const entry = entries[index];
    if (!entry || !('getData' in entry)) return;

    decodingRef.current.add(index);
    try {
      const imgBlob = await entry.getData(new BlobWriter());
      const url = URL.createObjectURL(imgBlob);
      setPageCache((prev) => new Map(prev).set(index, url));
    } finally {
      decodingRef.current.delete(index);
    }
  }, []);

  // =========================================================================
  // Single-page mode: sliding window (original behavior)
  // =========================================================================

  useEffect(() => {
    if (viewMode === 'scroll') return;
    if (imageEntries.length === 0) return;

    const keep = new Set<number>();
    for (let i = currentPage - PREFETCH; i <= currentPage + PREFETCH; i++) {
      if (i >= 0 && i < imageEntries.length) keep.add(i);
    }

    for (const i of keep) {
      if (!pageCacheRef.current.has(i)) {
        void decodePage(i, imageEntries);
      }
    }

    setPageCache((prev) => {
      const next = new Map(prev);
      for (const [idx, url] of prev) {
        if (!keep.has(idx)) {
          URL.revokeObjectURL(url);
          next.delete(idx);
        }
      }
      return next;
    });
  }, [viewMode, currentPage, imageEntries, decodePage]); // pageCache intentionally omitted

  const updateCurrentPageFromScroll = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const anchorY = containerRect.top + containerRect.height / 3;
    let firstVisiblePage: number | null = null;

    for (const [idx, el] of pageRefsMap.current) {
      const rect = el.getBoundingClientRect();
      if (firstVisiblePage == null && rect.bottom >= containerRect.top) {
        firstVisiblePage = idx;
      }
      if (rect.top <= anchorY && rect.bottom >= anchorY) {
        if (idx !== persistedPageRef.current) {
          setCurrentPage(idx);
        }
        return;
      }
    }

    if (firstVisiblePage != null && firstVisiblePage !== persistedPageRef.current) {
      setCurrentPage(firstVisiblePage);
    }
  }, [setCurrentPage]);

  // =========================================================================
  // Waterfall mode: IntersectionObserver
  // =========================================================================

  useEffect(() => {
    if (viewMode !== 'scroll' || imageEntries.length === 0) return;

    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    observerRef.current?.disconnect();

    const visibleSet = new Set<number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset['idx']);
          if (isNaN(idx)) continue;

          if (entry.isIntersecting) {
            visibleSet.add(idx);
            // Decode this page and buffer pages
            const bufferStart = Math.max(0, idx - WATERFALL_BUFFER);
            const bufferEnd = Math.min(imageEntries.length - 1, idx + WATERFALL_BUFFER);
            for (let i = bufferStart; i <= bufferEnd; i++) {
              if (!pageCache.has(i)) {
                void decodePage(i, imageEntries);
              }
            }
          } else {
            visibleSet.delete(idx);
          }
        }

        // Revoke pages far from any visible page
        const allVisible = [...visibleSet];
        if (allVisible.length > 0) {
          const minVisible = Math.min(...allVisible);
          const maxVisible = Math.max(...allVisible);
          const keepStart = Math.max(0, minVisible - WATERFALL_BUFFER);
          const keepEnd = Math.min(imageEntries.length - 1, maxVisible + WATERFALL_BUFFER);

          setPageCache((prev) => {
            const next = new Map(prev);
            let changed = false;
            for (const [idx, url] of prev) {
              if (idx < keepStart || idx > keepEnd) {
                URL.revokeObjectURL(url);
                next.delete(idx);
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        }

        updateCurrentPageFromScroll();
      },
      {
        root: scrollContainer,
        rootMargin: '300% 0px',
      },
    );

    observerRef.current = observer;

    for (const [, el] of pageRefsMap.current) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [viewMode, imageEntries, decodePage, updateCurrentPageFromScroll]);

  useEffect(() => {
    if (viewMode !== 'scroll' || imageEntries.length === 0) return;

    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    let rafId = 0;
    const handleScroll = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        updateCurrentPageFromScroll();
      });
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [viewMode, imageEntries.length, updateCurrentPageFromScroll]);

  // Scroll to restored page after initial load in scroll mode
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (loading || hasRestoredRef.current || imageEntries.length === 0) return;
    if (viewMode === 'scroll' && currentPage > 0) {
      requestAnimationFrame(() => {
        const el = pageRefsMap.current.get(currentPage);
        el?.scrollIntoView({ block: 'start' });
      });
    }
    hasRestoredRef.current = true;
  }, [loading, imageEntries.length > 0]);

  // Revoke all Blob URLs on unmount
  useEffect(() => {
    return () => {
      pageCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = imageEntries.length;

  useEffect(() => {
    if (loading || totalPages === 0) return;
    postMessage({
      type: 'document:statusUpdate',
      payload: {
        pageCount: totalPages,
        currentPage: currentPage + 1,
      },
    });
  }, [loading, totalPages, currentPage]);

  const goToPage = useCallback(
    (page: number) => {
      if (page >= 0 && page < totalPages) {
        pendingPageRef.current = null;
        setCurrentPage(page);
        setSelectionRect(null);
        if (viewMode === 'scroll') {
          const el = pageRefsMap.current.get(page);
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    },
    [totalPages, viewMode],
  );

  useEffect(() => {
    const pendingPage = pendingPageRef.current;
    if (loading || !pendingPage || totalPages === 0) return;
    goToPage(pendingPage - 1);
  }, [loading, totalPages, goToPage]);

  // =========================================================================
  // Region selection (shared between modes)
  // =========================================================================

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>, pageIdx?: number) => {
    const target = e.currentTarget.querySelector('img') as HTMLImageElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    setIsSelecting(true);
    setSelectionPageIdx(pageIdx ?? 0);
    setSelectionRect({
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      endX: e.clientX - rect.left,
      endY: e.clientY - rect.top,
    });
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isSelecting || !selectionRect) return;
      const img =
        viewMode === 'scroll' ? waterfallImgRefs.current.get(selectionPageIdx) : imgRef.current;
      if (!img) return;
      const rect = img.getBoundingClientRect();
      setSelectionRect((prev) =>
        prev ? { ...prev, endX: e.clientX - rect.left, endY: e.clientY - rect.top } : null,
      );
    },
    [isSelecting, selectionRect, viewMode, selectionPageIdx],
  );

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  const captureRegion = useCallback(() => {
    if (!selectionRect) return;
    const img =
      viewMode === 'scroll' ? waterfallImgRefs.current.get(selectionPageIdx) : imgRef.current;
    if (!img) return;

    const x = Math.min(selectionRect.startX, selectionRect.endX);
    const y = Math.min(selectionRect.startY, selectionRect.endY);
    const w = Math.abs(selectionRect.endX - selectionRect.startX);
    const h = Math.abs(selectionRect.endY - selectionRect.startY);

    if (w < 10 || h < 10) {
      setSelectionRect(null);
      return;
    }

    // Scale to natural image coordinates
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    const region = {
      x: Math.round(x * scaleX),
      y: Math.round(y * scaleY),
      width: Math.round(w * scaleX),
      height: Math.round(h * scaleY),
    };

    // Capture region as base64
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = region.width;
      canvas.height = region.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(
          img,
          region.x,
          region.y,
          region.width,
          region.height,
          0,
          0,
          region.width,
          region.height,
        );
        const imageData = canvas.toDataURL('image/png');
        const pageNum = viewMode === 'scroll' ? selectionPageIdx + 1 : currentPage + 1;
        sendRegionToAgent(imageData, region, pageNum);
      }
    }
    setSelectionRect(null);
  }, [selectionRect, viewMode, selectionPageIdx, currentPage, sendRegionToAgent]);

  const sendFullPage = useCallback(() => {
    sendFileToAgent(currentPage + 1);
  }, [currentPage, sendFileToAgent]);

  const cycleViewMode = useCallback(() => {
    setViewMode(viewMode === 'scroll' ? 'single' : 'scroll');
    setSelectionRect(null);
  }, [viewMode]);

  const handleImageLoad = useCallback((idx: number, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageHeights((prev) => {
      const next = new Map(prev);
      next.set(idx, img.naturalHeight * (img.clientWidth / img.naturalWidth));
      return next;
    });
  }, []);

  // Store page ref callback
  const setPageRef = useCallback((idx: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefsMap.current.set(idx, el);
    } else {
      pageRefsMap.current.delete(idx);
    }
  }, []);

  const setWaterfallImgRef = useCallback((idx: number, el: HTMLImageElement | null) => {
    if (el) {
      waterfallImgRefs.current.set(idx, el);
    } else {
      waterfallImgRefs.current.delete(idx);
    }
  }, []);

  const contextActions = useDocumentContextActions({
    hasContent: !!selectionRect && !isSelecting,
    onSendContentToAgent: selectionRect ? captureRegion : undefined,
    onSendFileToAgent: sendFullPage,
  });

  if (error) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ color: 'var(--vscode-errorForeground)' }}
      >
        {t('preview.document.error', { error })}
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ color: 'var(--vscode-foreground)' }}
      >
        {t('preview.cbz.loading')}
      </div>
    );
  }

  const currentUrl = pageCache.get(currentPage);
  const selRectStyle = selectionRect
    ? {
        left: Math.min(selectionRect.startX, selectionRect.endX),
        top: Math.min(selectionRect.startY, selectionRect.endY),
        width: Math.abs(selectionRect.endX - selectionRect.startX),
        height: Math.abs(selectionRect.endY - selectionRect.startY),
      }
    : null;

  return (
    <DocumentContextMenu actions={contextActions}>
      <div
        data-testid="cbz-preview-ready"
        data-page-count={totalPages}
        className="flex h-screen flex-col"
        style={{ background: 'var(--vscode-editor-background)' }}
      >
        {/* Toolbar */}
        <div
          className="flex items-center gap-2 border-b px-3 py-1.5 text-xs"
          style={{
            borderColor: 'var(--vscode-panel-border)',
            color: 'var(--vscode-foreground)',
            background: 'var(--vscode-sideBar-background)',
          }}
        >
          {viewMode !== 'scroll' && (
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 0}
              className="px-2 py-0.5 disabled:opacity-30"
            >
              &lt;
            </button>
          )}
          <span>
            {t('preview.document.pageOf', {
              current: String(currentPage + 1),
              total: String(totalPages),
            })}
          </span>
          {viewMode !== 'scroll' && (
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages - 1}
              className="px-2 py-0.5 disabled:opacity-30"
            >
              &gt;
            </button>
          )}
          <span className="mx-2">|</span>
          {/* View mode cycle */}
          <button
            onClick={cycleViewMode}
            className="rounded px-2 py-0.5"
            title={
              viewMode === 'scroll'
                ? t('preview.document.modePage')
                : t('preview.document.modeScroll')
            }
            style={{
              background:
                viewMode === 'scroll'
                  ? 'var(--vscode-button-background)'
                  : 'var(--vscode-button-secondaryBackground)',
              color:
                viewMode === 'scroll'
                  ? 'var(--vscode-button-foreground)'
                  : 'var(--vscode-button-secondaryForeground)',
            }}
          >
            {viewMode === 'scroll' ? '⇕' : '⊡'}
          </button>
        </div>

        {viewMode === 'scroll' ? (
          /* Waterfall mode */
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-auto"
            style={{ background: 'var(--vscode-editor-background)' }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {imageEntries.map((_, idx) => {
              const blobUrl = pageCache.get(idx);
              const height = imageHeights.get(idx) ?? DEFAULT_PAGE_HEIGHT;
              return (
                <div
                  key={idx}
                  ref={(el) => setPageRef(idx, el)}
                  data-idx={idx}
                  className="relative mx-auto select-none"
                  style={{
                    cursor: 'crosshair',
                    minHeight: blobUrl ? undefined : `${height}px`,
                    maxWidth: '100%',
                    marginBottom: '4px',
                  }}
                  onMouseDown={(e) => handleMouseDown(e, idx)}
                >
                  {blobUrl ? (
                    <img
                      ref={(el) => setWaterfallImgRef(idx, el)}
                      src={blobUrl}
                      alt={t('preview.cbz.pageAlt', { number: String(idx + 1) })}
                      className="mx-auto block max-w-full"
                      draggable={false}
                      onLoad={(e) => handleImageLoad(idx, e)}
                    />
                  ) : (
                    <div
                      className="flex items-center justify-center text-sm"
                      style={{
                        height: `${height}px`,
                        color: 'var(--vscode-descriptionForeground)',
                      }}
                    >
                      {t('preview.cbz.loading')}
                    </div>
                  )}
                  {/* Selection overlay for this page */}
                  {selRectStyle && selectionPageIdx === idx && (
                    <div
                      className="pointer-events-none absolute border-2 border-dashed"
                      style={{
                        ...selRectStyle,
                        borderColor: 'var(--vscode-focusBorder)',
                        backgroundColor: 'rgba(0, 120, 215, 0.15)',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Single-page mode */
          <div className="flex flex-1 items-center justify-center overflow-auto p-4">
            <div
              className="relative select-none"
              onMouseDown={(e) => handleMouseDown(e)}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              style={{ cursor: 'crosshair' }}
            >
              {currentUrl ? (
                <img
                  ref={imgRef}
                  src={currentUrl}
                  alt={t('preview.cbz.pageAlt', { number: String(currentPage + 1) })}
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
              ) : (
                <div
                  className="flex h-48 w-48 items-center justify-center text-sm"
                  style={{ color: 'var(--vscode-descriptionForeground)' }}
                >
                  {t('preview.cbz.loading')}
                </div>
              )}
              {/* Selection overlay */}
              {selRectStyle && (
                <div
                  className="pointer-events-none absolute border-2 border-dashed"
                  style={{
                    ...selRectStyle,
                    borderColor: 'var(--vscode-focusBorder)',
                    backgroundColor: 'rgba(0, 120, 215, 0.15)',
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* Region capture FAB */}
        {selectionRect &&
          !isSelecting &&
          Math.abs(selectionRect.endX - selectionRect.startX) > 10 && (
            <button
              onClick={captureRegion}
              className="fixed bottom-4 right-4 z-50 rounded-lg px-4 py-2 text-sm font-medium shadow-lg"
              style={{
                backgroundColor: 'var(--vscode-button-background)',
                color: 'var(--vscode-button-foreground)',
              }}
            >
              {t('preview.document.sendContentToAgent')}
            </button>
          )}

        {/* Hidden canvas for region capture */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </DocumentContextMenu>
  );
};
