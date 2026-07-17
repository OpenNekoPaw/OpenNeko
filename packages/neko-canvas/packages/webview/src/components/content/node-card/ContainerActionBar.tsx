import { useMemo, type ReactNode } from 'react';
import { getContainerChildIds, type CanvasNode } from '@neko/shared';
import { useCanvasStore } from '../../../stores/canvasStore';
import { getGlobalVSCodeApi } from '../../../utils/vscode';
import { t } from '../../../i18n';
import { CONTAINER_ACTION_DISPATCHER, dispatchContainerAction } from './actionDispatcher';
import { getContainerActionDescriptors, isContainerActionVisible } from './containerActions';
import type { ContainerActionDescriptor } from './types';
import { evaluateActionCondition } from './utils';

export interface ContainerActionBarProps {
  node: CanvasNode;
  allNodes: readonly CanvasNode[];
  selectedNodeIds: readonly string[];
  isSelected: boolean;
}

export function ContainerActionBar({
  node,
  allNodes,
  selectedNodeIds,
  isSelected,
}: ContainerActionBarProps): ReactNode {
  const resolvedChildNodes = useMemo(
    () => resolveContainerChildNodes(node, allNodes),
    [allNodes, node],
  );
  const actions = getContainerActionDescriptors(node).filter((action) =>
    isContainerActionVisible(action, {
      node,
      childNodes: resolvedChildNodes,
      selection: { nodeIds: selectedNodeIds },
      isSelected,
    }),
  );

  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-row flex-wrap gap-2 p-2">
      {actions.map((action) => {
        const enabled = evaluateActionCondition(action.enabledWhen, {
          node,
          childNodes: resolvedChildNodes,
          selection: { nodeIds: selectedNodeIds },
        });
        return (
          <ContainerActionButton
            key={action.id}
            action={action}
            disabled={!enabled}
            onClick={() => {
              if (!enabled) {
                return;
              }
              dispatchContainerAction(CONTAINER_ACTION_DISPATCHER, action.id, {
                containerId: node.id,
                node,
                childNodes: resolvedChildNodes,
                selection: { nodeIds: selectedNodeIds },
                canvasStore: useCanvasStore.getState(),
                postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
              });
            }}
          />
        );
      })}
    </div>
  );
}

function ContainerActionButton({
  action,
  disabled,
  onClick,
}: {
  action: ContainerActionDescriptor;
  disabled: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      className="self-start rounded border border-[var(--node-border)] px-2 py-1 text-xs text-[var(--node-fg)] hover:border-[var(--node-selected)] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {resolveLabel(action.label)}
    </button>
  );
}

function resolveContainerChildNodes(
  node: CanvasNode,
  allNodes: readonly CanvasNode[],
): CanvasNode[] {
  const childIds = getContainerChildIds(node);
  if (childIds.length === 0) {
    return [];
  }
  return childIds
    .map((childId) => allNodes.find((candidate) => candidate.id === childId))
    .filter((child): child is CanvasNode => Boolean(child));
}

function resolveLabel(label: string): string {
  return label.startsWith('preset.') ? t(label) : label;
}
