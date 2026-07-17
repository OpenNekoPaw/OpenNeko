/**
 * DocumentNode - File-backed document reference.
 */

import { useEffect } from 'react';
import type { CanvasTextDocumentType, DocumentCanvasNode, CanvasViewport } from '@neko/shared';
import { FileIcon } from '@neko/shared/icons';
import { MarkdownDocumentView } from '@neko/ui/markdown';
import { BaseNode } from './BaseNode';
import type { TextDocumentRuntimeProjection } from './nodeRendererTypes';

// =============================================================================
// Types
// =============================================================================

export interface DocumentNodeProps {
  node: DocumentCanvasNode;
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void;
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onResize?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onResizeEnd?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void;
  onUpdateData?: (nodeId: string, data: Partial<DocumentCanvasNode['data']>) => void;
  /** Called when user clicks "open document" button */
  onOpenDocument?: (docPath: string) => void;
  onLoadText?: (nodeId: string, docPath: string, docType: CanvasTextDocumentType) => void;
  textProjection?: TextDocumentRuntimeProjection;
}

// =============================================================================
// Helpers
// =============================================================================

const DOC_TYPE_LABEL: Record<string, string> = {
  pdf: 'PDF',
  docx: 'Word',
  epub: 'EPUB',
  cbz: 'Comic',
  markdown: 'Markdown',
  text: 'Text',
  file: 'File',
};

// =============================================================================
// Component
// =============================================================================

export function DocumentNode({
  node,
  viewport,
  isSelected,
  onSelect,
  onDrag,
  onMove,
  onResize,
  onResizeEnd,
  onConnectionStart,
  onOpenDocument,
  onLoadText,
  textProjection,
}: DocumentNodeProps) {
  const { docPath, docType, title, thumbnailData } = node.data;

  const typeLabel = DOC_TYPE_LABEL[docType] ?? docType.toUpperCase();
  const stableRefLabel = node.data.resourceRef?.id ?? node.data.documentResourceRef?.entryPath;
  const fileName = docPath.split('/').pop() || stableRefLabel || title;
  const isTextDocument = docType === 'markdown' || docType === 'text';
  const currentTextProjection =
    textProjection?.docPath === docPath && textProjection.docType === docType
      ? textProjection
      : undefined;

  useEffect(() => {
    if (isTextDocument && docPath && !currentTextProjection) {
      onLoadText?.(node.id, docPath, docType);
    }
  }, [currentTextProjection, docPath, docType, isTextDocument, node.id, onLoadText]);

  return (
    <BaseNode
      node={node}
      viewport={viewport}
      isSelected={isSelected}
      onSelect={onSelect}
      onDrag={onDrag}
      onMove={onMove}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
      onConnectionStart={onConnectionStart}
      presentation="foundational"
      opaqueSurface
      onActivate={docPath ? () => onOpenDocument?.(docPath) : undefined}
    >
      {isTextDocument ? (
        <div className="flex h-full min-h-0 flex-col text-xs" data-document-node-layout="text">
          <div className="flex min-w-0 flex-shrink-0 items-center gap-2 px-1 pb-1">
            <span style={{ color: 'var(--node-fg-secondary)' }} aria-hidden="true">
              <FileIcon size={14} strokeWidth={1.7} />
            </span>
            <span
              className="min-w-0 flex-1 truncate text-sm font-medium"
              style={{ color: 'var(--node-fg)' }}
              title={fileName || title}
            >
              {fileName || title}
            </span>
          </div>
          <div
            className="min-h-0 flex-1 overflow-auto px-3 py-2 select-text"
            data-document-text-surface={docType}
            data-node-drag-block="true"
          >
            {!docPath ? (
              <TextDocumentState message="文本资源缺少可读取的文件路径。" tone="error" />
            ) : !currentTextProjection || currentTextProjection.status === 'loading' ? (
              <TextDocumentState message="正在读取…" />
            ) : currentTextProjection.status === 'error' ? (
              <TextDocumentState message={currentTextProjection.error} tone="error" />
            ) : docType === 'markdown' ? (
              <MarkdownDocumentView value={currentTextProjection.text} />
            ) : (
              <div className="whitespace-pre-wrap break-words text-sm leading-6">
                {currentTextProjection.text}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-full text-xs">
          {/* ── Cover thumbnail ── */}
          <div
            className="flex-1 relative overflow-hidden flex items-center justify-center"
            style={{ backgroundColor: 'var(--node-surface)', minHeight: 80 }}
          >
            {thumbnailData ? (
              <img
                src={thumbnailData}
                alt={title}
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <span style={{ color: 'var(--node-fg-secondary)', opacity: 0.58 }}>
                <FileIcon size={38} strokeWidth={1.5} />
              </span>
            )}

            {/* Type badge */}
            <div
              className="absolute top-1.5 right-1.5"
              style={{
                fontSize: 8,
                padding: '1px 4px',
                borderRadius: 2,
                backgroundColor: '#00000080',
                color: '#fff',
              }}
            >
              {typeLabel}
            </div>
          </div>

          {/* ── Footer ── */}
          <div
            className="px-2 py-1.5 flex items-center gap-2 flex-shrink-0"
            style={{
              borderTop: '1px solid var(--node-divider)',
              backgroundColor: 'var(--node-header-bg)',
            }}
          >
            <span className="flex-1 truncate font-medium" style={{ color: 'var(--node-fg)' }}>
              {title || fileName}
            </span>
            <button
              disabled={!docPath}
              onClick={(e) => {
                e.stopPropagation();
                onOpenDocument?.(docPath);
              }}
              style={{
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 3,
                border: '1px solid var(--node-border)',
                backgroundColor: 'transparent',
                color: 'var(--neko-fg-secondary)',
                cursor: docPath ? 'pointer' : 'default',
                opacity: docPath ? 1 : 0.55,
                flexShrink: 0,
              }}
            >
              打开
            </button>
          </div>

          {/* ── Type label bar ── */}
          <div
            className="px-2 py-0.5 flex-shrink-0"
            style={{
              borderTop: '1px solid var(--node-divider)',
              backgroundColor: 'var(--node-header-bg)',
            }}
          >
            <span style={{ color: 'var(--node-fg-secondary)' }}>DOC · {typeLabel}</span>
          </div>
        </div>
      )}
    </BaseNode>
  );
}

function TextDocumentState({
  message,
  tone = 'muted',
}: {
  message: string;
  tone?: 'muted' | 'error';
}) {
  return (
    <div
      className="flex h-full min-h-20 items-center justify-center px-3 text-center text-xs"
      style={{
        color: tone === 'error' ? 'var(--danger-fg)' : 'var(--node-fg-secondary)',
        opacity: tone === 'error' ? 1 : 0.7,
      }}
      data-document-text-state={tone}
    >
      {message}
    </div>
  );
}
