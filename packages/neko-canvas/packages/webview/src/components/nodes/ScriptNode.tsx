/**
 * ScriptNode - TOC-mode reference to a .fountain screenplay.
 * Shows scene structure only (no full text), loaded via getScriptIndex.
 * Clicking a scene can navigate to the linked SceneGroupNode.
 */

import { useEffect } from 'react';
import type { ScriptCanvasNode, CanvasViewport } from '@neko/shared';
import { FileIcon } from '@neko/shared/icons';
import { BaseNode } from './BaseNode';
import type { ScriptIndexRuntimeState } from './nodeRendererTypes';
import { normalizeScriptScenes } from '../../utils/scriptScenes';

// =============================================================================
// Types
// =============================================================================

export interface ScriptNodeProps {
  node: ScriptCanvasNode;
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
  onUpdateData?: (nodeId: string, data: Partial<ScriptCanvasNode['data']>) => void;
  /** Called to load scenes from the retained Fountain content service. */
  onLoadScenes?: (nodeId: string, scriptPath: string) => void;
  indexState?: ScriptIndexRuntimeState;
  /** Called when user clicks "open script" button */
  onOpenScript?: (scriptPath: string) => void;
  /** Called when user clicks a scene row (navigate to SceneGroupNode) */
  onNavigateToScene?: (linkedSceneGroupId: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export function ScriptNode({
  node,
  viewport,
  isSelected,
  onSelect,
  onDrag,
  onMove,
  onResize,
  onResizeEnd,
  onConnectionStart,
  onLoadScenes,
  indexState,
  onOpenScript,
  onNavigateToScene,
}: ScriptNodeProps) {
  const { scriptPath, scriptTitle, linkedSceneGroupId } = node.data;
  const scenes = normalizeScriptScenes(node.data.scenes);
  const runtimeState: ScriptIndexRuntimeState =
    indexState ?? (scenes.length > 0 ? { status: 'ready' } : { status: 'idle' });

  useEffect(() => {
    if (runtimeState.status === 'idle' && scriptPath) {
      onLoadScenes?.(node.id, scriptPath);
    }
  }, [node.id, onLoadScenes, runtimeState.status, scriptPath]);

  const fileName = scriptPath.split('/').pop() ?? scriptPath;

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
      onActivate={scriptPath ? () => onOpenScript?.(scriptPath) : undefined}
    >
      <div className="flex h-full min-h-0 flex-col text-xs" data-script-node-layout="low-chrome">
        <div className="flex min-w-0 flex-shrink-0 items-center gap-2 px-1 pb-1">
          <span style={{ color: 'var(--node-fg-secondary)' }} aria-hidden="true">
            <FileIcon size={14} strokeWidth={1.8} />
          </span>
          <span className="flex-1 truncate font-medium" style={{ color: 'var(--node-fg)' }}>
            {scriptTitle || fileName}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-1 py-1">
          {runtimeState.status === 'idle' || runtimeState.status === 'loading' ? (
            <ScriptState message="正在读取剧本…" />
          ) : runtimeState.status === 'error' ? (
            <ScriptState message={runtimeState.error} tone="error" />
          ) : runtimeState.status === 'empty' ? (
            <ScriptState message="剧本中没有可索引的场景。" />
          ) : (
            <div className="flex flex-col gap-0.5">
              {scenes.map((scene) => (
                <button
                  key={scene.id}
                  className="flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/5 transition-colors"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: onNavigateToScene && linkedSceneGroupId ? 'pointer' : 'default',
                    width: '100%',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (linkedSceneGroupId) onNavigateToScene?.(linkedSceneGroupId);
                  }}
                >
                  <span style={{ color: 'var(--node-fg-secondary)', fontSize: 9, flexShrink: 0 }}>
                    L{scene.lineStart}
                  </span>
                  <span className="flex-1 truncate" style={{ color: 'var(--node-fg)' }}>
                    {scene.title}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
}

function ScriptState({ message, tone = 'muted' }: { message: string; tone?: 'muted' | 'error' }) {
  return (
    <div
      className="flex h-full min-h-20 items-center justify-center px-3 text-center"
      style={{
        color: tone === 'error' ? 'var(--danger-fg)' : 'var(--node-fg-secondary)',
        opacity: tone === 'error' ? 1 : 0.7,
      }}
      data-script-index-state={tone}
    >
      {message}
    </div>
  );
}
