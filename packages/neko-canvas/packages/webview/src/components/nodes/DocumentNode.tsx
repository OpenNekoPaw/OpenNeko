/**
 * DocumentNode - Reference card for PDF / DOCX / EPUB / CBZ documents.
 * Shows cover thumbnail and metadata; clicking "open" delegates to extension host.
 */

import type { DocumentCanvasNode, CanvasViewport } from '@neko/shared';
import { FileIcon } from '@neko/shared/icons';
import { BaseNode } from './BaseNode';

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
}

// =============================================================================
// Helpers
// =============================================================================

const DOC_TYPE_LABEL: Record<string, string> = {
  pdf: 'PDF',
  docx: 'Word',
  epub: 'EPUB',
  cbz: 'Comic',
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
}: DocumentNodeProps) {
  const { docPath, docType, title, thumbnailData } = node.data;

  const typeLabel = DOC_TYPE_LABEL[docType] ?? docType.toUpperCase();
  const stableRefLabel = node.data.resourceRef?.id ?? node.data.documentResourceRef?.entryPath;
  const fileName = docPath.split('/').pop() || stableRefLabel || title;

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
    >
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
    </BaseNode>
  );
}
