import { useEffect, useMemo, useState } from 'react';
import {
  CANVAS_WORKSPACE_INBOX_NODE_ID,
  getContainerChildIds,
  type CanvasViewport,
  type GroupCanvasNode,
  type CanvasNode,
} from '@neko/shared';
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
  const labelPresentation = resolveGroupLabelPresentation(node);
  const [draftLabel, setDraftLabel] = useState(labelPresentation.label);
  const [editingLabel, setEditingLabel] = useState(false);

  useEffect(() => {
    if (!editingLabel) setDraftLabel(labelPresentation.label);
  }, [editingLabel, labelPresentation.label]);

  const commitLabel = (): void => {
    const label = draftLabel.trim() || labelPresentation.label;
    setDraftLabel(label);
    setEditingLabel(false);
    if (labelPresentation.derived && label === labelPresentation.label) return;
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
                  setDraftLabel(labelPresentation.label);
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
            x{childNodes.length}
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

interface GroupLabelPresentation {
  readonly label: string;
  readonly derived: boolean;
}

function resolveGroupLabelPresentation(node: GroupCanvasNode): GroupLabelPresentation {
  const authoredLabel = node.data.label?.trim();
  if (node.id === CANVAS_WORKSPACE_INBOX_NODE_ID) {
    if (!authoredLabel || authoredLabel === 'Inbox') {
      return { label: t('workspaceBoard.inbox'), derived: true };
    }
    return { label: authoredLabel, derived: false };
  }

  const provenance = node.data.provenance;
  if (typeof provenance?.['deliveryId'] !== 'string') {
    return authoredLabel
      ? { label: authoredLabel, derived: false }
      : { label: t('node.group'), derived: false };
  }

  const taskId = readNonEmptyString(provenance['taskId']);
  const runId = readNonEmptyString(provenance['runId']);
  const previousDefaultLabel = taskId
    ? `Agent Task ${taskId}`
    : runId
      ? `Agent Run ${runId}`
      : 'Agent Processing';
  if (authoredLabel && authoredLabel !== previousDefaultLabel) {
    return { label: authoredLabel, derived: false };
  }
  if (taskId) return { label: t('workspaceBoard.task', { id: taskId }), derived: true };
  if (runId) return { label: t('workspaceBoard.run', { id: runId }), derived: true };
  return { label: t('workspaceBoard.processing'), derived: true };
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
