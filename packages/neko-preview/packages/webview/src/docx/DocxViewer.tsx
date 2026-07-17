/**
 * DOCX Viewer — renders DOCX using docx-preview library.
 * Fetches the file from the Preview Node host via an opaque HTTP URL.
 * Native text selection works on the rendered DOM.
 */

import { useState, useEffect, useRef, useCallback, useMemo, type FC } from 'react';
import { renderAsync } from 'docx-preview';
import { useExtensionMessage, postMessage } from '../shared/useVscodeMessage';
import { useDocumentSelection } from '../shared/useDocumentSelection';
import { DocumentContextMenu, useDocumentContextActions } from '../shared/DocumentContextMenu';
import { imgSrcToBase64 } from '../shared/imageToBase64';
import { useTranslation } from '../i18n/I18nContext';

export const DocxViewer: FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const styleContainerRef = useRef<HTMLDivElement>(null);

  const getSelectionLocator = useCallback(() => {
    const locator = resolveDocxSelectionLocator(containerRef.current);
    return locator ?? { kind: 'text-range' as const, startChar: 0 };
  }, []);

  const fileLocator = useMemo(() => ({ kind: 'text-range' as const, startChar: 0 }), []);
  const { selection, sendFileToAgent } = useDocumentSelection({
    locator: fileLocator,
    getLocator: getSelectionLocator,
  });

  useExtensionMessage((msg) => {
    if (msg.type === 'document:data') {
      void loadDocxFromUrl(msg.payload.url);
    }
  });

  useEffect(() => {
    postMessage({ type: 'ready' } as never);
  }, []);

  /** Load DOCX from a localhost URL — fetch full file, then render. */
  const loadDocxFromUrl = useCallback(async (url: string) => {
    try {
      setLoading(true);
      setError(null);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to fetch: ${resp.status}`);
      const buffer = await resp.arrayBuffer();
      await renderDocx(buffer);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  /** Render a complete DOCX ArrayBuffer via docx-preview. */
  const renderDocx = useCallback(async (buffer: ArrayBuffer) => {
    try {
      if (containerRef.current && styleContainerRef.current) {
        await renderAsync(buffer, containerRef.current, styleContainerRef.current, {
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
        });
      }
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.1, 3)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.1, 0.5)), []);

  useEffect(() => {
    if (loading) return;
    postMessage({
      type: 'document:statusUpdate',
      payload: {
        zoom: Math.round(scale * 100),
      },
    });
  }, [loading, scale]);

  const [rightClickedImageSrc, setRightClickedImageSrc] = useState<string | null>(null);

  const handleContextMenuTarget = useCallback((target: HTMLElement) => {
    const imgEl = target.tagName === 'IMG' ? (target as HTMLImageElement) : null;
    setRightClickedImageSrc(imgEl?.src ?? null);
  }, []);

  const sendContentToAgent = useCallback(async () => {
    const hasText = !!selection;
    const hasImage = !!rightClickedImageSrc;
    if (!hasText && !hasImage) return;

    let imageData: string | undefined;
    if (hasImage) {
      try {
        imageData = await imgSrcToBase64(rightClickedImageSrc!);
      } catch {
        // Skip image if conversion fails
      }
    }

    const contentKind = hasText && imageData ? 'mixed' : hasText ? 'text' : 'image';
    const locator = getSelectionLocator();
    postMessage({
      type: 'document:sendToAi',
      payload: {
        text: selection?.text || undefined,
        imageData,
        contentKind,
        locator,
        excerpt: selection?.text
          ? { contentKind, text: selection.text, imageData, truncated: false }
          : undefined,
      },
    } as never);

    window.getSelection()?.removeAllRanges();
    setRightClickedImageSrc(null);
  }, [selection, rightClickedImageSrc, getSelectionLocator]);

  const contextActions = useDocumentContextActions({
    hasContent: !!selection || !!rightClickedImageSrc,
    onSendContentToAgent: sendContentToAgent,
    onSendFileToAgent: () => sendFileToAgent(),
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

  return (
    <DocumentContextMenu actions={contextActions} onContextMenuTarget={handleContextMenuTarget}>
      <div
        data-testid={!loading ? 'docx-preview-ready' : undefined}
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
          <button onClick={zoomOut} className="px-2 py-0.5" title={t('preview.document.zoomOut')}>
            -
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} className="px-2 py-0.5" title={t('preview.document.zoomIn')}>
            +
          </button>
        </div>

        {/* Loading overlay */}
        {loading && (
          <div
            className="flex flex-1 items-center justify-center"
            style={{ color: 'var(--vscode-foreground)' }}
          >
            {t('preview.docx.loading')}
          </div>
        )}

        {/* Style container (docx-preview injects styles here) */}
        <div ref={styleContainerRef} style={{ display: 'none' }} />

        {/* DOCX content */}
        <div
          className="flex-1 overflow-auto"
          style={{
            display: loading ? 'none' : 'block',
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
          }}
        >
          <div ref={containerRef} className="mx-auto" />
        </div>
      </div>
    </DocumentContextMenu>
  );
};

function resolveDocxSelectionLocator(root: HTMLElement | null) {
  const selection = window.getSelection();
  if (!root || !selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer) ||
    selection.toString().length === 0
  ) {
    return null;
  }

  const startRange = document.createRange();
  startRange.setStart(root, 0);
  startRange.setEnd(range.startContainer, range.startOffset);

  const selectedText = selection.toString();
  const startChar = startRange.toString().length;
  const endChar = startChar + selectedText.length;
  startRange.detach();

  return {
    kind: 'text-range' as const,
    startChar,
    endChar,
  };
}
