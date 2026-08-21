import type { MarkdownCanvasNode } from '@neko/canvas-domain';
import type { MilkdownRichSurfaceState } from '@neko/markdown/rich-surface';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import { CloseIcon } from '@neko/ui/icons';
import { Button } from '@neko/ui/primitives';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../../i18n';

const CanvasMilkdownRichSurface = lazy(async () => {
  const module = await import('@neko/markdown/rich-surface');
  return { default: module.MilkdownRichSurface };
});

export interface CanvasMarkdownEditorOverlayProps {
  readonly nodeId: string;
  readonly node?: MarkdownCanvasNode;
  readonly onUpdateData: (nodeId: string, data: Record<string, unknown>) => void;
  readonly onClose: () => void;
}

export function CanvasMarkdownEditorOverlay({
  nodeId,
  node,
  onUpdateData,
  onClose,
}: CanvasMarkdownEditorOverlayProps): ReactNode {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [richState, setRichState] = useState<MilkdownRichSurfaceState>('loading');
  const [richFailure, setRichFailure] = useState<string>();

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    overlayRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const title = node?.data.title?.trim() || t('node.markdown');
  const failed = richState === 'unavailable' || richState === 'error';

  return (
    <div
      ref={overlayRef}
      className="canvas-markdown-editor-overlay"
      data-canvas-markdown-editor="true"
      data-editor-state={richState}
      role="dialog"
      aria-modal="true"
      aria-label={t('markdownEditor.ariaLabel', { title })}
      tabIndex={-1}
      {...getKeyboardBoundaryMetadata({
        scope: 'modal',
        ownerId: `canvas-markdown-editor:${nodeId}`,
        priority: 0,
        ownedKeys: ['Escape'],
      })}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <header className="canvas-markdown-editor-overlay__toolbar">
        <div className="canvas-markdown-editor-overlay__identity">
          <span className="canvas-markdown-editor-overlay__kind">{t('node.markdown')}</span>
          <span className="canvas-markdown-editor-overlay__divider" aria-hidden="true" />
          <span className="canvas-markdown-editor-overlay__title" title={title}>
            {title}
          </span>
        </div>
        <div className="canvas-markdown-editor-overlay__actions">
          <span className="canvas-markdown-editor-overlay__mode">
            {failed ? t('markdownEditor.unavailable') : t('markdownEditor.richMode')}
          </span>
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<CloseIcon size={14} />}
            data-canvas-markdown-editor-action="close"
            onClick={onClose}
          >
            {t('markdownEditor.done')}
          </Button>
        </div>
      </header>
      <main
        className="canvas-markdown-editor-overlay__body"
        data-canvas-wheel-owner="content"
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="canvas-markdown-editor-overlay__page">
          {node ? (
            <Suspense
              fallback={
                <div className="canvas-markdown-editor-overlay__status" role="status">
                  {t('node.markdownRichLoading')}
                </div>
              }
            >
              <CanvasMilkdownRichSurface
                value={node.data.content}
                ariaLabel={t('node.markdownInput')}
                readOnly={false}
                className="canvas-markdown-editor-surface"
                mountClassName="canvas-markdown-editor-surface__mount"
                onChange={(content) => onUpdateData(node.id, { ...node.data, content })}
                onActions={(actions) => actions?.focus()}
                onStateChange={(nextState, failure) => {
                  setRichState(nextState);
                  setRichFailure(failure);
                }}
              />
            </Suspense>
          ) : (
            <div className="canvas-markdown-editor-overlay__status" role="alert">
              {t('markdownEditor.nodeUnavailable')}
            </div>
          )}
          {node && failed ? (
            <div
              className="canvas-markdown-editor-overlay__status"
              role="alert"
              title={richFailure}
            >
              {richState === 'unavailable'
                ? t('node.markdownRichUnavailable')
                : t('node.markdownRichFailed')}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
