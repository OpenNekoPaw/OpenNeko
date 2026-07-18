import { useMemo, useState, type ReactNode } from 'react';
import type { CanvasNode, CanvasViewport } from '@neko/shared';
import { getContainerChildIds, getNodeParentId } from '@neko/shared';
import { Button, IconButton, Popover } from '@neko/ui/primitives';
import {
  CopyIcon,
  LayersIcon,
  MoreHorizontalIcon,
  OpenIcon,
  PackageIcon,
  PlayIcon,
  RefreshIcon,
  TrashIcon,
  ZoomInIcon,
} from '@neko/shared/icons';
import { useCanvasStore } from '../../stores/canvasStore';
import { useClipboardStore } from '../../stores/clipboardStore';
import { useHistoryStore } from '../../stores/historyStore';
import { getGlobalVSCodeApi } from '../../utils/vscode';
import { t } from '../../i18n';
import {
  createBuiltInNodeCardPolicyRegistry,
  evaluateActionCondition,
  getContainerActionDescriptors,
  getNodeCardPolicy,
  NODE_CARD_ACTION_DISPATCHER,
} from '../content/node-card';
import {
  CONTAINER_ACTION_DISPATCHER,
  dispatchContainerAction,
  dispatchNodeCardAction,
} from '../content/node-card/actionDispatcher';
import { isContainerActionVisible } from '../content/node-card/containerActions';
import type {
  CardActionDescriptor,
  ContainerActionDescriptor,
  NodeCardActionId,
} from '../content/node-card';
import { createBuiltInNodeTypeDescriptors } from '../nodes/nodeTypeDescriptors';
import { resolveNodeFullscreenPresentation } from '../nodes/nodeTypeDescriptor';
import { resolveCanvasMaterialPresentation } from './materialPresentation';

interface SelectionContextToolbarProps {
  readonly nodes: readonly CanvasNode[];
  readonly selectedNodeIds: readonly string[];
  readonly viewport: CanvasViewport;
  readonly viewportSize: { readonly width: number; readonly height: number };
  readonly hidden?: boolean;
}

interface ToolbarAction {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly run: () => void;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly overflowOnly?: boolean;
}

const POLICY_REGISTRY = createBuiltInNodeCardPolicyRegistry();
const NODE_TYPE_DESCRIPTORS = createBuiltInNodeTypeDescriptors();
const MAX_PRIMARY_ACTIONS = 5;

export function SelectionContextToolbar({
  nodes,
  selectedNodeIds,
  viewport,
  viewportSize,
  hidden = false,
}: SelectionContextToolbarProps): ReactNode {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const selectedNodes = useMemo(
    () => selectedNodeIds.flatMap((id) => nodes.find((node) => node.id === id) ?? []),
    [nodes, selectedNodeIds],
  );
  const actions = useMemo(
    () => resolveToolbarActions(selectedNodes, nodes),
    [nodes, selectedNodes],
  );
  if (hidden || selectedNodes.length === 0 || actions.length === 0) return null;

  const position = resolveToolbarPosition(selectedNodes, viewport, viewportSize);
  const { primary, overflow } = partitionToolbarActions(actions);

  return (
    <div
      className="selection-context-toolbar"
      data-selection-context-toolbar="true"
      data-selection-count={selectedNodes.length}
      role="toolbar"
      aria-label={t('selection.toolbar', { count: selectedNodes.length })}
      style={{ left: position.x, top: position.y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {primary.map((action) => (
        <Button
          key={action.key}
          data-selection-action={action.key}
          data-selection-action-location="primary"
          size="xs"
          variant={action.danger ? 'danger' : 'ghost'}
          disabled={action.disabled}
          leadingIcon={action.icon}
          onClick={action.run}
        >
          {action.label}
        </Button>
      ))}
      {overflow.length > 0 && (
        <Popover
          align="end"
          side="bottom"
          open={overflowOpen}
          onOpenChange={setOverflowOpen}
          trigger={
            <IconButton
              data-selection-overflow="true"
              data-selection-overflow-actions={overflow.map((action) => action.key).join(' ')}
              size="xs"
              variant="ghost"
              label={t('selection.moreActions')}
              icon={<MoreHorizontalIcon size={14} />}
            />
          }
        >
          <div className="flex min-w-44 flex-col gap-1" role="menu">
            {overflow.map((action) => (
              <Button
                key={action.key}
                data-selection-action={action.key}
                data-selection-action-location="overflow"
                size="xs"
                variant={action.danger ? 'danger' : 'ghost'}
                disabled={action.disabled}
                leadingIcon={action.icon}
                className="justify-start"
                role="menuitem"
                onClick={() => {
                  action.run();
                  setOverflowOpen(false);
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

function partitionToolbarActions(actions: readonly ToolbarAction[]): {
  primary: ToolbarAction[];
  overflow: ToolbarAction[];
} {
  const primary: ToolbarAction[] = [];
  const overflow: ToolbarAction[] = [];
  let overflowStarted = false;
  for (const action of actions) {
    overflowStarted =
      overflowStarted || action.overflowOnly === true || primary.length >= MAX_PRIMARY_ACTIONS;
    (overflowStarted ? overflow : primary).push(action);
  }
  return { primary, overflow };
}

function resolveToolbarActions(
  selectedNodes: readonly CanvasNode[],
  allNodes: readonly CanvasNode[],
): ToolbarAction[] {
  if (selectedNodes.length > 1) return resolveMultiSelectionActions(selectedNodes);
  const node = selectedNodes[0];
  if (!node) return [];
  const parentId = getNodeParentId(node);
  const policy = getNodeCardPolicy(POLICY_REGISTRY, node);
  const previewSource = policy.resolvePreviewSource(node);
  const policyActions =
    policy
      .resolveActions?.(
        node,
        parentId ? allNodes.find((candidate) => candidate.id === parentId) : undefined,
      )
      .filter((action) => action.id !== 'remove' || Boolean(parentId)) ?? [];
  const material = resolveCanvasMaterialPresentation(node, allNodes);
  const materialActions = material
    ? [
        ...(material.canPreview
          ? [
              createNodeAction(
                node,
                parentId,
                {
                  id: 'open-media-preview',
                  label: 'action.openPreview',
                  position: 'bottom',
                  visibleWhen: 'always',
                },
                previewSource,
              ),
            ]
          : []),
        createNodeAction(
          node,
          parentId,
          {
            id: 'duplicate',
            label: 'action.duplicateShort',
            position: 'bottom',
            visibleWhen: 'always',
          },
          previewSource,
        ),
        ...(material.canPromoteToAssetLibrary
          ? [
              createNodeAction(
                node,
                parentId,
                {
                  id: 'save-to-asset-library',
                  label: 'action.saveToAssetLibrary',
                  position: 'bottom',
                  visibleWhen: 'always',
                },
                previewSource,
              ),
            ]
          : []),
      ]
    : [];
  const nodeActions = [
    ...(material
      ? materialActions
      : policyActions.map((action) => createNodeAction(node, parentId, action, previewSource))),
    ...(!material
      ? [
          createNodeAction(
            node,
            parentId,
            {
              id: 'duplicate',
              label: 'action.duplicateShort',
              position: 'bottom',
              visibleWhen: 'always',
            },
            previewSource,
          ),
        ]
      : []),
    ...(resolveNodeFullscreenPresentation(NODE_TYPE_DESCRIPTORS[node.type], node)
      ? [
          createNodeAction(
            node,
            parentId,
            {
              id: 'open-content-overlay',
              label: 'action.fullscreen',
              position: 'bottom',
              visibleWhen: 'always',
            },
            previewSource,
          ),
        ]
      : []),
    { ...createDeleteAction([node.id]), overflowOnly: true },
  ];
  const containerActions = node.container
    ? resolveContainerActions(
        node,
        allNodes,
        selectedNodes.map((candidate) => candidate.id),
      )
    : [];
  return dedupeActions(node.container ? [...containerActions, ...nodeActions] : nodeActions);
}

function resolveMultiSelectionActions(selectedNodes: readonly CanvasNode[]): ToolbarAction[] {
  const selectedIds = selectedNodes.map((node) => node.id);
  return [
    {
      key: 'group-selection',
      label: t('menu.group'),
      icon: <LayersIcon size={14} />,
      run: () => useCanvasStore.getState().groupNodes(selectedIds),
    },
    createDeleteAction(selectedIds),
  ];
}

function createNodeAction(
  node: CanvasNode,
  parentNodeId: string | undefined,
  descriptor: CardActionDescriptor,
  previewSource: ReturnType<ReturnType<typeof getNodeCardPolicy>['resolvePreviewSource']>,
): ToolbarAction {
  const enabled = evaluateActionCondition(descriptor.enabledWhen, {
    node,
    parentNode: parentNodeId
      ? useCanvasStore
          .getState()
          .canvasData?.nodes.find((candidate) => candidate.id === parentNodeId)
      : undefined,
    selection: { nodeIds: [node.id] },
    previewSource,
  });
  return {
    key: `node:${descriptor.id}`,
    label: t(descriptor.label),
    icon: nodeActionIcon(descriptor.id),
    danger: descriptor.danger,
    disabled: !enabled,
    run: () => {
      if (!enabled) return;
      dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, descriptor.id, {
        nodeId: node.id,
        node,
        parentNodeId,
        canvasStore: useCanvasStore.getState(),
        clipboardStore: useClipboardStore.getState(),
        historyStore: useHistoryStore.getState(),
        postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
      });
    },
  };
}

function resolveContainerActions(
  node: CanvasNode,
  allNodes: readonly CanvasNode[],
  selectedNodeIds: readonly string[],
): ToolbarAction[] {
  const childIdSet = new Set(getContainerChildIds(node));
  const childNodes = allNodes.filter((candidate) => childIdSet.has(candidate.id));
  return getContainerActionDescriptors(node)
    .filter((action) =>
      isContainerActionVisible(action, {
        node,
        childNodes,
        selection: { nodeIds: selectedNodeIds },
        isSelected: true,
      }),
    )
    .filter((action) =>
      action.id === 'collapse-group'
        ? node.container?.collapsed !== true
        : action.id === 'expand-group'
          ? node.container?.collapsed === true
          : true,
    )
    .map((action) => createContainerAction(node, childNodes, selectedNodeIds, action));
}

function createContainerAction(
  node: CanvasNode,
  childNodes: readonly CanvasNode[],
  selectedNodeIds: readonly string[],
  descriptor: ContainerActionDescriptor,
): ToolbarAction {
  const enabled = evaluateActionCondition(descriptor.enabledWhen, {
    node,
    childNodes,
    selection: { nodeIds: selectedNodeIds },
  });
  return {
    key: `container:${descriptor.id}`,
    label: t(descriptor.label),
    icon: containerActionIcon(descriptor.id),
    danger: descriptor.danger,
    disabled: !enabled,
    run: () => {
      if (!enabled) return;
      dispatchContainerAction(CONTAINER_ACTION_DISPATCHER, descriptor.id, {
        containerId: node.id,
        node,
        childNodes,
        selection: { nodeIds: selectedNodeIds },
        canvasStore: useCanvasStore.getState(),
        postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
      });
    },
  };
}

function createDeleteAction(nodeIds: readonly string[]): ToolbarAction {
  return {
    key: 'delete-selection',
    label: t('menu.delete'),
    icon: <TrashIcon size={14} />,
    danger: true,
    run: () => {
      const store = useCanvasStore.getState();
      store.selectNodes([...nodeIds]);
      store.deleteSelected();
    },
  };
}

function dedupeActions(actions: readonly ToolbarAction[]): ToolbarAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.key)) return false;
    seen.add(action.key);
    return true;
  });
}

function resolveToolbarPosition(
  nodes: readonly CanvasNode[],
  viewport: CanvasViewport,
  viewportSize: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number } {
  const left = Math.min(...nodes.map((node) => node.position.x));
  const right = Math.max(...nodes.map((node) => node.position.x + node.size.width));
  const top = Math.min(...nodes.map((node) => node.position.y));
  const centerX = viewport.pan.x + ((left + right) / 2) * viewport.zoom;
  const preferredY = viewport.pan.y + top * viewport.zoom - 42;
  const horizontalInset = Math.min(170, Math.max(0, (viewportSize.width - 24) / 2));
  return {
    x: Math.max(12 + horizontalInset, Math.min(viewportSize.width - 12 - horizontalInset, centerX)),
    y: Math.max(10, Math.min(viewportSize.height - 42, preferredY)),
  };
}

function nodeActionIcon(actionId: NodeCardActionId): ReactNode {
  switch (actionId) {
    case 'open-media-preview':
      return <PlayIcon size={14} />;
    case 'open-content-overlay':
      return <ZoomInIcon size={14} />;
    case 'open-in-editor':
      return <OpenIcon size={14} />;
    case 'duplicate':
      return <CopyIcon size={14} />;
    case 'save-to-asset-library':
      return <PackageIcon size={14} />;
    case 'generate':
      return <RefreshIcon size={14} />;
    case 'remove':
      return <TrashIcon size={14} />;
  }
}

function containerActionIcon(actionId: ContainerActionDescriptor['id']): ReactNode {
  switch (actionId) {
    case 'fit-to-content':
      return <ZoomInIcon size={14} />;
    case 'collapse-group':
    case 'expand-group':
      return <LayersIcon size={14} />;
    default:
      return <RefreshIcon size={14} />;
  }
}
