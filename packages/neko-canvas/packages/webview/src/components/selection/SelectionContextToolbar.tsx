import { useMemo, useState, type ReactNode } from 'react';
import { isContentLocator, type CanvasNode, type CanvasViewport } from '@neko/shared';
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
import {
  useCanvasStoreApi,
  useClipboardStoreApi,
  useHistoryStoreApi,
} from '../../stores/canvasStoreScope';
import { useOptionalCanvasHost } from '../../host-runtime';
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
  const host = useOptionalCanvasHost();
  const canvasStore = useCanvasStoreApi();
  const clipboardStore = useClipboardStoreApi();
  const historyStore = useHistoryStoreApi();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const selectedNodes = useMemo(
    () => selectedNodeIds.flatMap((id) => nodes.find((node) => node.id === id) ?? []),
    [nodes, selectedNodeIds],
  );
  const actions = useMemo(
    () => resolveActions(selectedNodes, host, canvasStore, clipboardStore, historyStore),
    [canvasStore, clipboardStore, historyStore, host, selectedNodes],
  );
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

function resolveActions(
  selectedNodes: readonly CanvasNode[],
  host: ReturnType<typeof useOptionalCanvasHost>,
  canvasStore: ReturnType<typeof useCanvasStoreApi>,
  clipboardStore: ReturnType<typeof useClipboardStoreApi>,
  historyStore: ReturnType<typeof useHistoryStoreApi>,
): ToolbarAction[] {
  const selectedIds = selectedNodes.map((node) => node.id);
  if (selectedNodes.length > 1) {
    return [
      ...(host?.supportsMessage('sendToAgent')
        ? [createQuickGenerateAction(selectedIds, host)]
        : []),
      {
        key: 'group-selection',
        label: t('menu.group'),
        icon: <LayersIcon size={14} />,
        run: () => canvasStore.getState().groupNodes(selectedIds),
      },
      createDeleteAction(selectedIds, canvasStore),
    ];
  }

  const node = selectedNodes[0];
  if (!node) return [];
  const actions: ToolbarAction[] = host?.supportsMessage('sendToAgent')
    ? [createQuickGenerateAction([node.id], host)]
    : [];
  if (
    node.type === 'media' &&
    (node.data.runtimeAssetPath ||
      node.data.assetPath ||
      node.data.resourceRef ||
      node.data.documentResourceRef)
  ) {
    const contentLocator = isContentLocator(node.data.contentLocator)
      ? node.data.contentLocator
      : undefined;
    actions.push({
      key: 'node:open-media-preview',
      label: t('action.openPreview'),
      icon: <PlayIcon size={14} />,
      run: () => {
        if (contentLocator) {
          void host?.previewResource(contentLocator);
          return;
        }
        if (!host?.supportsMessage('openMediaPreview')) return;
        host?.postMessage({
          type: 'openMediaPreview',
          nodeId: node.id,
          assetPath: node.data.runtimeAssetPath || node.data.assetPath,
          mediaType: node.data.mediaType,
          ...(node.data.resourceRef ? { resourceRef: node.data.resourceRef } : {}),
          ...(node.data.documentResourceRef
            ? { documentResourceRef: node.data.documentResourceRef }
            : {}),
        });
      },
    });
  }
  if (node.type === 'file' && node.data.path) {
    const path = node.data.path;
    actions.push({
      key: 'node:open-in-editor',
      label: t('action.open'),
      icon: <OpenIcon size={14} />,
      run: () => void host?.previewResource({ kind: 'workspace-file', path }),
    });
  }
  if (node.type === 'canvas-embed' && node.data.canvasPath) {
    const path = node.data.canvasPath;
    actions.push({
      key: 'node:open-in-editor',
      label: t('action.open'),
      icon: <OpenIcon size={14} />,
      run: () =>
        void host?.previewResource({
          kind: 'workspace-file',
          path,
        }),
    });
  }
  if (node.type === 'group') {
    actions.push(
      {
        key: 'group:fit',
        label: t('group.fitToContent'),
        icon: <ZoomInIcon size={14} />,
        run: () => canvasStore.getState().fitGroupToContent(node.id),
      },
      {
        key: 'group:toggle',
        label: node.container?.collapsed ? t('group.expand') : t('group.collapse'),
        icon: <LayersIcon size={14} />,
        run: () =>
          canvasStore.getState().setGroupCollapsed(node.id, node.container?.collapsed !== true),
      },
    );
  }
  actions.push(createDuplicateAction(node.id, canvasStore, clipboardStore, historyStore), {
    ...createDeleteAction([node.id], canvasStore),
    overflowOnly: true,
  });
  return actions;
}

function createQuickGenerateAction(
  nodeIds: readonly string[],
  host: ReturnType<typeof useOptionalCanvasHost>,
): ToolbarAction {
  return {
    key: 'selection:quick-generate',
    label: t('action.quickGenerate'),
    icon: <RefreshIcon size={14} />,
    run: () =>
      host?.postMessage({
        type: 'sendToAgent',
        nodeIds: [...nodeIds],
        action: 'generate',
      }),
  };
}

function createDuplicateAction(
  nodeId: string,
  canvasStore: ReturnType<typeof useCanvasStoreApi>,
  clipboardStore: ReturnType<typeof useClipboardStoreApi>,
  historyStore: ReturnType<typeof useHistoryStoreApi>,
): ToolbarAction {
  return {
    key: 'node:duplicate',
    label: t('action.duplicateShort'),
    icon: <CopyIcon size={14} />,
    run: () => {
      const canvasState = canvasStore.getState();
      const canvasData = canvasState.canvasData;
      if (!canvasData) return;
      const result = clipboardStore
        .getState()
        .duplicate([nodeId], canvasData.nodes, canvasData.connections);
      if (!result) return;
      historyStore.getState().pushState(canvasData);
      canvasState.setCanvasData({
        ...canvasData,
        nodes: [...canvasData.nodes, ...result.nodes],
        connections: [...canvasData.connections, ...result.connections],
      });
      canvasState.selectNodes(result.nodes.map((node) => node.id));
    },
  };
}

function createDeleteAction(
  nodeIds: readonly string[],
  canvasStore: ReturnType<typeof useCanvasStoreApi>,
): ToolbarAction {
  return {
    key: 'delete-selection',
    label: t('menu.delete'),
    icon: <TrashIcon size={14} />,
    danger: true,
    run: () => {
      const store = canvasStore.getState();
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
