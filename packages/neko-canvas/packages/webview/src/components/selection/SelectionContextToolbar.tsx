import { useMemo, useState, type ReactNode } from 'react';
import type { CanvasNode, CanvasViewport } from '@neko/shared';
import { Button, IconButton, Popover } from '@neko/ui/primitives';
import {
  CopyIcon,
  LayersIcon,
  MoreHorizontalIcon,
  OpenIcon,
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
  readonly overflowOnly?: boolean;
}

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
  const actions = useMemo(() => resolveActions(selectedNodes), [selectedNodes]);
  if (hidden || selectedNodes.length === 0 || actions.length === 0) return null;

  const position = resolveToolbarPosition(selectedNodes, viewport, viewportSize);
  const { primary, overflow } = partitionActions(actions);

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

function resolveActions(selectedNodes: readonly CanvasNode[]): ToolbarAction[] {
  const selectedIds = selectedNodes.map((node) => node.id);
  if (selectedNodes.length > 1) {
    return [
      createQuickGenerateAction(selectedIds),
      {
        key: 'group-selection',
        label: t('menu.group'),
        icon: <LayersIcon size={14} />,
        run: () => useCanvasStore.getState().groupNodes(selectedIds),
      },
      createDeleteAction(selectedIds),
    ];
  }

  const node = selectedNodes[0];
  if (!node) return [];
  const actions: ToolbarAction[] = [createQuickGenerateAction([node.id])];
  if (
    node.type === 'media' &&
    (node.data.runtimeAssetPath ||
      node.data.assetPath ||
      node.data.resourceRef ||
      node.data.documentResourceRef)
  ) {
    actions.push({
      key: 'node:open-media-preview',
      label: t('action.openPreview'),
      icon: <PlayIcon size={14} />,
      run: () =>
        getGlobalVSCodeApi()?.postMessage({
          type: 'openMediaPreview',
          nodeId: node.id,
          assetPath: node.data.runtimeAssetPath || node.data.assetPath,
          mediaType: node.data.mediaType,
          ...(node.data.resourceRef ? { resourceRef: node.data.resourceRef } : {}),
          ...(node.data.documentResourceRef
            ? { documentResourceRef: node.data.documentResourceRef }
            : {}),
        }),
    });
  }
  if (node.type === 'file' && node.data.path) {
    actions.push({
      key: 'node:open-in-editor',
      label: t('action.open'),
      icon: <OpenIcon size={14} />,
      run: () =>
        getGlobalVSCodeApi()?.postMessage({ type: 'openDocument', docPath: node.data.path }),
    });
  }
  if (node.type === 'canvas-embed' && node.data.canvasPath) {
    actions.push({
      key: 'node:open-in-editor',
      label: t('action.open'),
      icon: <OpenIcon size={14} />,
      run: () =>
        getGlobalVSCodeApi()?.postMessage({
          type: 'openDocument',
          docPath: node.data.canvasPath,
        }),
    });
  }
  if (node.type === 'group') {
    actions.push(
      {
        key: 'group:fit',
        label: t('group.fitToContent'),
        icon: <ZoomInIcon size={14} />,
        run: () => useCanvasStore.getState().fitGroupToContent(node.id),
      },
      {
        key: 'group:toggle',
        label: node.container?.collapsed ? t('group.expand') : t('group.collapse'),
        icon: <LayersIcon size={14} />,
        run: () =>
          useCanvasStore.getState().setGroupCollapsed(node.id, node.container?.collapsed !== true),
      },
    );
  }
  actions.push(createDuplicateAction(node.id), {
    ...createDeleteAction([node.id]),
    overflowOnly: true,
  });
  return actions;
}

function createQuickGenerateAction(nodeIds: readonly string[]): ToolbarAction {
  return {
    key: 'selection:quick-generate',
    label: t('action.quickGenerate'),
    icon: <RefreshIcon size={14} />,
    run: () =>
      getGlobalVSCodeApi()?.postMessage({
        type: 'sendToAgent',
        nodeIds: [...nodeIds],
        action: 'generate',
      }),
  };
}

function createDuplicateAction(nodeId: string): ToolbarAction {
  return {
    key: 'node:duplicate',
    label: t('action.duplicateShort'),
    icon: <CopyIcon size={14} />,
    run: () => {
      const canvasStore = useCanvasStore.getState();
      const canvasData = canvasStore.canvasData;
      if (!canvasData) return;
      const result = useClipboardStore
        .getState()
        .duplicate([nodeId], canvasData.nodes, canvasData.connections);
      if (!result) return;
      useHistoryStore.getState().pushState(canvasData);
      canvasStore.setCanvasData({
        ...canvasData,
        nodes: [...canvasData.nodes, ...result.nodes],
        connections: [...canvasData.connections, ...result.connections],
      });
      canvasStore.selectNodes(result.nodes.map((node) => node.id));
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

function partitionActions(actions: readonly ToolbarAction[]): {
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
