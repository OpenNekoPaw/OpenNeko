import type { CanvasEmbedCanvasNode, CanvasViewport } from '@neko/shared';
import { LayersIcon } from '@neko/shared/icons';
import { BaseNode } from './BaseNode';
import { t } from '../../i18n';

export interface CanvasEmbedNodeProps {
  node: CanvasEmbedCanvasNode;
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
  onOpenCanvas?: (canvasPath: string) => void;
}

export function CanvasEmbedNode({
  node,
  viewport,
  isSelected,
  onSelect,
  onDrag,
  onMove,
  onResize,
  onResizeEnd,
  onConnectionStart,
  onOpenCanvas,
}: CanvasEmbedNodeProps) {
  const { canvasPath, canvasTitle, thumbnailData } = node.data;
  const fileName = canvasPath.split('/').pop() ?? canvasPath;

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
        <div
          className="flex-1 relative overflow-hidden flex items-center justify-center"
          style={{ backgroundColor: 'var(--node-surface)', minHeight: 80 }}
        >
          {thumbnailData ? (
            <img
              src={thumbnailData}
              alt={canvasTitle}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <span style={{ color: 'var(--node-fg-secondary)', opacity: 0.58 }}>
              <LayersIcon size={36} strokeWidth={1.45} />
            </span>
          )}

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
            NKC
          </div>
        </div>

        <div
          className="px-2 py-1.5 flex items-center gap-2 flex-shrink-0"
          style={{
            borderTop: '1px solid var(--node-divider)',
            backgroundColor: 'var(--node-header-bg)',
          }}
        >
          <span className="flex-1 truncate font-medium" style={{ color: 'var(--node-fg)' }}>
            {canvasTitle || fileName || t('canvasEmbed.defaultTitle')}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenCanvas?.(canvasPath);
            }}
            style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 3,
              border: '1px solid var(--node-border)',
              backgroundColor: 'transparent',
              color: 'var(--neko-fg-secondary)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {t('canvasEmbed.open')}
          </button>
        </div>

        <div
          className="px-2 py-0.5 flex-shrink-0"
          style={{
            borderTop: '1px solid var(--node-divider)',
            backgroundColor: 'var(--node-header-bg)',
          }}
        >
          <span style={{ color: 'var(--node-fg-secondary)' }}>{t('canvasEmbed.badge')}</span>
        </div>
      </div>
    </BaseNode>
  );
}
