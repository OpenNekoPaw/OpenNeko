import type { CanvasNode, CanvasViewport } from '@neko/shared';
import { BaseNode } from './BaseNode';

export interface UnsupportedNodeProps {
  node: CanvasNode;
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onTransformStart?: (nodeId: string) => void;
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
  onRotate?: (nodeId: string, rotation: number) => void;
  onRotateEnd?: (nodeId: string, rotation: number) => void;
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void;
}

export function UnsupportedNode({
  node,
  viewport,
  isSelected,
  onSelect,
  onTransformStart,
  onDrag,
  onMove,
  onResize,
  onResizeEnd,
  onRotate,
  onRotateEnd,
  onConnectionStart,
}: UnsupportedNodeProps) {
  return (
    <BaseNode
      node={node}
      viewport={viewport}
      isSelected={isSelected}
      onSelect={onSelect}
      onTransformStart={onTransformStart}
      onDrag={onDrag}
      onMove={onMove}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
      onRotate={onRotate}
      onRotateEnd={onRotateEnd}
      onConnectionStart={onConnectionStart}
    >
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--node-border)] bg-[var(--node-header-bg)] px-2 py-1.5">
          <span className="rounded bg-[var(--danger-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--accent-red)]">
            UNSUPPORTED
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-[var(--node-fg-secondary)]">
            {node.type}
          </span>
        </div>

        <div className="flex-1 space-y-2 overflow-hidden p-3 text-xs text-[var(--node-fg)]">
          <div className="text-[var(--node-fg-secondary)]">Unsupported node type</div>
          <pre className="max-h-24 overflow-hidden whitespace-pre-wrap break-words rounded border border-[var(--node-border)] bg-[var(--control-bg)] p-2 text-[11px] leading-4 text-[var(--node-fg-secondary)]">
            {summarizeNodeData(node.data)}
          </pre>
        </div>
      </div>
    </BaseNode>
  );
}

function summarizeNodeData(data: unknown): string {
  try {
    const json = JSON.stringify(data, null, 2);
    if (!json) {
      return '{}';
    }
    return json.length > 420 ? `${json.slice(0, 420)}...` : json;
  } catch {
    return '[unserializable data]';
  }
}
