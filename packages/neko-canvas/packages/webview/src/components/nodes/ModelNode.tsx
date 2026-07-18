/**
 * ModelNode - AI model reference card (LoRA / checkpoint / ControlNet / VAE).
 *
 * Two roles:
 *   - 'reference': info card showing model metadata
 *   - 'workflow':  has an output port → connects to ShotNode to specify generation model
 */

import type { ModelCanvasNode, CanvasViewport } from '@neko/shared';
import { PackageIcon, SettingsIcon, RefreshIcon, LayersIcon } from '@neko/shared/icons';
import { BaseNode } from './BaseNode';

// =============================================================================
// Types
// =============================================================================

export interface ModelNodeProps {
  node: ModelCanvasNode;
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
  onUpdateData?: (nodeId: string, data: Partial<ModelCanvasNode['data']>) => void;
}

// =============================================================================
// Helpers
// =============================================================================

const MODEL_TYPE_COLOR: Record<string, string> = {
  lora: '#a78bfa',
  checkpoint: '#60a5fa',
  controlnet: '#34d399',
  vae: '#fb923c',
};

// =============================================================================
// Component
// =============================================================================

export function ModelNode({
  node,
  viewport,
  isSelected,
  onSelect,
  onDrag,
  onMove,
  onResize,
  onResizeEnd,
  onConnectionStart,
}: ModelNodeProps) {
  const { modelPath, modelName, modelType, role } = node.data;

  const color = MODEL_TYPE_COLOR[modelType] ?? 'var(--node-fg-secondary)';
  const typeLabel = modelType.charAt(0).toUpperCase() + modelType.slice(1);

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
        {/* ── Header ── */}
        <div
          className="flex items-center gap-2 px-2 py-1.5 flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--node-divider)',
            backgroundColor: 'var(--node-header-bg)',
          }}
        >
          <span
            className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded"
            style={{
              border: `1px solid ${color}55`,
              backgroundColor: `${color}18`,
              color,
            }}
          >
            <ModelTypeIcon type={modelType} />
          </span>
          <span className="flex-1 truncate font-medium" style={{ color: 'var(--node-fg)' }}>
            {modelName}
          </span>
          {/* Role badge for workflow mode */}
          {role === 'workflow' && (
            <span
              style={{
                fontSize: 8,
                padding: '1px 4px',
                borderRadius: 2,
                backgroundColor: '#3b82f620',
                color: '#3b82f6',
                flexShrink: 0,
              }}
            >
              WORKFLOW
            </span>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 px-2 py-2 flex flex-col gap-1.5">
          {/* Model type row */}
          <div className="flex items-center gap-1.5">
            <span
              style={{
                fontSize: 8,
                padding: '1px 5px',
                borderRadius: 2,
                backgroundColor: `${color}25`,
                color,
                fontWeight: 600,
              }}
            >
              {typeLabel}
            </span>
          </div>

          {/* File path */}
          <div
            className="truncate"
            style={{ color: 'var(--node-fg-secondary)', opacity: 0.6, fontSize: 9 }}
            title={modelPath}
          >
            {modelPath.split('/').pop() ?? modelPath}
          </div>

          {/* Workflow mode: output port hint */}
          {role === 'workflow' && (
            <div
              className="mt-auto pt-1"
              style={{
                borderTop: '1px solid var(--node-divider)',
                color: 'var(--node-fg-secondary)',
              }}
            >
              Output → connect to ShotNode
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="px-2 py-1 flex items-center justify-between flex-shrink-0"
          style={{
            borderTop: '1px solid var(--node-divider)',
            backgroundColor: 'var(--node-header-bg)',
          }}
        >
          <span style={{ color: 'var(--node-fg-secondary)' }}>MODEL</span>
          <span style={{ color }}>{typeLabel}</span>
        </div>
      </div>
    </BaseNode>
  );
}

function ModelTypeIcon({ type }: { readonly type: string }) {
  const props = { size: 12, strokeWidth: 1.8 };
  if (type === 'lora') {
    return <LayersIcon {...props} />;
  }
  if (type === 'controlnet') {
    return <SettingsIcon {...props} />;
  }
  if (type === 'vae') {
    return <RefreshIcon {...props} />;
  }
  return <PackageIcon {...props} />;
}
