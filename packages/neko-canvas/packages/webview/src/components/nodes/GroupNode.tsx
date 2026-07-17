import { useEffect, useMemo, useState } from 'react';
import type { CanvasViewport, GroupCanvasNode, CanvasNode } from '@neko/shared';
import { getContainerChildIds } from '@neko/shared';
import { toCodiconClassName } from '@neko/ui/icons';
import { BaseNode } from './BaseNode';
import { useCanvasStore } from '../../stores/canvasStore';
import { t } from '../../i18n';

export interface GroupNodeProps {
  node: GroupCanvasNode;
  allNodes: CanvasNode[];
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
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void;
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
}

export function GroupNode({
  node,
  allNodes,
  viewport,
  isSelected,
  onSelect,
  onTransformStart,
  onDrag,
  onMove,
  onResize,
  onResizeEnd,
  onConnectionStart,
  onUpdateData,
}: GroupNodeProps) {
  const setGroupCollapsed = useCanvasStore((state) => state.setGroupCollapsed);
  const childIds = getContainerChildIds(node);
  const childNodes = useMemo(
    () =>
      childIds
        .map((id) => allNodes.find((candidate) => candidate.id === id))
        .filter((candidate): candidate is CanvasNode => Boolean(candidate)),
    [allNodes, childIds],
  );
  const [draftLabel, setDraftLabel] = useState(node.data.label ?? t('node.group'));
  const [editingLabel, setEditingLabel] = useState(false);

  useEffect(() => {
    if (!editingLabel) setDraftLabel(node.data.label ?? t('node.group'));
  }, [editingLabel, node.data.label]);

  const commitLabel = (): void => {
    const label = draftLabel.trim() || t('node.group');
    setDraftLabel(label);
    setEditingLabel(false);
    if (label !== node.data.label) onUpdateData?.(node.id, { label });
  };
  const renderZIndex = Math.min(node.zIndex, ...childNodes.map((child) => child.zIndex)) - 1;
  const collapsed = node.container?.collapsed === true;

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
      onConnectionStart={onConnectionStart}
      className="group-node"
      autoSizeContent={false}
      presentation="spatial-container"
      renderZIndex={renderZIndex}
      renderHeight={collapsed ? 40 : undefined}
    >
      <div
        className="spatial-group-frame h-full w-full"
        data-spatial-group-frame="true"
        data-spatial-group-collapsed={collapsed ? 'true' : 'false'}
        data-spatial-group-empty={childNodes.length === 0 ? 'true' : 'false'}
      >
        <div
          className="spatial-group-label"
          data-spatial-group-label={node.id}
          onMouseDown={(event) => onSelect?.(node.id, event.shiftKey || event.metaKey)}
        >
          <button
            type="button"
            className="spatial-group-label-button"
            data-spatial-group-collapse-toggle={node.id}
            aria-label={collapsed ? t('group.expand') : t('group.collapse')}
            aria-expanded={!collapsed}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setGroupCollapsed(node.id, !collapsed);
            }}
          >
            <span
              className={toCodiconClassName(collapsed ? 'chevron-right' : 'chevron-down')}
              aria-hidden="true"
            />
          </button>
          {editingLabel ? (
            <input
              autoFocus
              className="spatial-group-name-input"
              value={draftLabel}
              aria-label={t('preset.group.label')}
              onChange={(event) => setDraftLabel(event.target.value)}
              onBlur={commitLabel}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitLabel();
                if (event.key === 'Escape') {
                  setDraftLabel(node.data.label ?? t('node.group'));
                  setEditingLabel(false);
                }
              }}
              onMouseDown={(event) => event.stopPropagation()}
            />
          ) : (
            <span
              className="spatial-group-name"
              title={t('group.rename')}
              role="button"
              data-node-drag-allow="true"
              tabIndex={0}
              aria-label={t('group.rename')}
              onDoubleClick={(event) => {
                event.stopPropagation();
                setEditingLabel(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setEditingLabel(true);
                }
              }}
            >
              {draftLabel}
            </span>
          )}
          <span
            className="spatial-group-count"
            aria-label={t('group.childCount', { count: childNodes.length })}
          >
            {childNodes.length}
          </span>
        </div>
        {childNodes.length === 0 && !collapsed && (
          <div className="spatial-group-empty" role="status">
            <span className={toCodiconClassName('add')} aria-hidden="true" />
            <span>{t('group.empty')}</span>
          </div>
        )}
      </div>
    </BaseNode>
  );
}
