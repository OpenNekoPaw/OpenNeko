import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  CanvasMaterialActionDescriptor,
  CanvasMaterialActionEffect,
  CanvasNode,
  CanvasViewport,
} from '@neko/canvas-domain';
import {
  CANVAS_ADD_TO_CUT_ACTION_ID,
  CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID,
  CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID,
  CANVAS_EDIT_AND_GENERATE_ACTION_ID,
  CANVAS_OPEN_IN_CUT_ACTION_ID,
  CANVAS_PREVIEW_ACTION_ID,
  CANVAS_REGENERATE_ACTION_ID,
  CANVAS_REVEAL_ACTION_ID,
} from '@neko/canvas-domain';
import { Button, IconButton, Popover } from '@neko/ui/primitives';
import {
  CopyIcon,
  LayersIcon,
  MoreHorizontalIcon,
  OpenIcon,
  PlayIcon,
  RefreshIcon,
  ScissorsIcon,
  TrashIcon,
  ZoomInIcon,
} from '@neko/ui/icons';
import {
  useCanvasStoreApi,
  useClipboardStoreApi,
  useHistoryStoreApi,
} from '../../stores/canvasStoreScope';
import { useOptionalCanvasHost } from '../../host-runtime';
import { t } from '../../i18n';
import { getNodeLabel } from '../nodes/nodeTypeDescriptor';
import { createBuiltInNodeTypeDescriptors } from '../nodes/nodeTypeDescriptors';

const NODE_TYPE_DESCRIPTORS = createBuiltInNodeTypeDescriptors();

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
  readonly placement: 'visible' | 'overflow';
  readonly priority: number;
  readonly overflowGroup?: 'file' | 'media-library' | 'node' | 'other';
}

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
  const [ownerDescriptors, setOwnerDescriptors] = useState<
    readonly CanvasMaterialActionDescriptor[]
  >([]);
  const selectedNodes = useMemo(
    () => selectedNodeIds.flatMap((id) => nodes.find((node) => node.id === id) ?? []),
    [nodes, selectedNodeIds],
  );
  const selectionKey = selectedNodeIds.join('\u0000');
  useEffect(() => {
    let current = true;
    setOwnerDescriptors([]);
    if (!host || selectedNodeIds.length === 0) {
      return () => {
        current = false;
      };
    }
    void host
      .resolveMaterialActions(selectedNodeIds)
      .then((descriptors) => {
        if (current) setOwnerDescriptors(descriptors);
      })
      .catch(() => {
        if (current) setOwnerDescriptors([]);
      });
    return () => {
      current = false;
    };
  }, [host, selectionKey]);
  const actions = useMemo(
    () =>
      resolveActions(
        selectedNodes,
        host,
        ownerDescriptors,
        canvasStore,
        clipboardStore,
        historyStore,
      ),
    [canvasStore, clipboardStore, historyStore, host, ownerDescriptors, selectedNodes],
  );
  if (hidden || selectedNodes.length === 0 || actions.length === 0) return null;

  const position = resolveToolbarPosition(selectedNodes, viewport, viewportSize);
  const { primary, overflow } = partitionActions(actions);
  const overflowGroups = groupOverflowActions(overflow);
  const selectionLabel = resolveSelectionLabel(selectedNodes);

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
      <span className="selection-context-toolbar__label" data-selection-kind-label="true">
        {selectionLabel}
      </span>
      <span className="selection-context-toolbar__divider" aria-hidden="true" />
      {primary.map((action) => (
        <IconButton
          key={action.key}
          data-selection-action={action.key}
          data-selection-action-location="primary"
          size="xs"
          variant={action.danger ? 'danger' : 'ghost'}
          label={action.label}
          icon={action.icon}
          onClick={action.run}
        />
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
          <div className="selection-action-overflow" role="menu">
            {overflowGroups.map((group) => (
              <div
                key={group.id}
                className="selection-action-overflow__group"
                data-selection-overflow-group={group.id}
                role="group"
                aria-label={overflowGroupLabel(group.id)}
              >
                <div className="selection-action-overflow__label">
                  {overflowGroupLabel(group.id)}
                </div>
                {group.actions.map((action) => (
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
  ownerDescriptors: readonly CanvasMaterialActionDescriptor[],
  canvasStore: ReturnType<typeof useCanvasStoreApi>,
  clipboardStore: ReturnType<typeof useClipboardStoreApi>,
  historyStore: ReturnType<typeof useHistoryStoreApi>,
): ToolbarAction[] {
  const selectedIds = selectedNodes.map((node) => node.id);
  if (selectedNodes.length > 1) {
    return [
      ...resolveOwnerActions(ownerDescriptors, selectedIds, host),
      {
        key: 'group-selection',
        label: t('menu.group'),
        icon: <LayersIcon size={14} />,
        placement: 'visible',
        priority: 10,
        run: () => canvasStore.getState().groupNodes(selectedIds),
      },
      createDeleteAction(selectedIds, canvasStore),
    ];
  }

  const node = selectedNodes[0];
  if (!node) return [];
  const actions: ToolbarAction[] = resolveOwnerActions(ownerDescriptors, selectedIds, host);
  if (node.type === 'canvas-embed' && node.data.canvasPath) {
    const path = node.data.canvasPath;
    actions.push({
      key: 'node:open-in-editor',
      label: t('action.open'),
      icon: <OpenIcon size={14} />,
      placement: 'visible',
      priority: 10,
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
        placement: 'visible',
        priority: 10,
        run: () => canvasStore.getState().fitGroupToContent(node.id),
      },
      {
        key: 'group:toggle',
        label: node.container?.collapsed ? t('group.expand') : t('group.collapse'),
        icon: <LayersIcon size={14} />,
        placement: 'visible',
        priority: 20,
        run: () =>
          canvasStore.getState().setGroupCollapsed(node.id, node.container?.collapsed !== true),
      },
    );
  }
  actions.push(
    createDuplicateAction(node.id, canvasStore, clipboardStore, historyStore),
    createDeleteAction([node.id], canvasStore),
  );
  return actions;
}

function resolveOwnerActions(
  descriptors: readonly CanvasMaterialActionDescriptor[],
  selectedNodeIds: readonly string[],
  host: ReturnType<typeof useOptionalCanvasHost>,
): ToolbarAction[] {
  if (!host) return [];
  return descriptors.map((descriptor) => {
    const presentation = materialActionPresentation(descriptor.id);
    return {
      key: descriptor.id,
      label: descriptor.label,
      icon: materialActionIcon(descriptor),
      ...presentation,
      run: () =>
        void host.executeMaterialAction(
          descriptor.id,
          selectedNodeIds,
          descriptor.executionPayload ?? {},
        ),
    };
  });
}

function materialActionIcon(descriptor: CanvasMaterialActionDescriptor): ReactNode {
  if (
    descriptor.id === CANVAS_ADD_TO_CUT_ACTION_ID ||
    descriptor.id === CANVAS_OPEN_IN_CUT_ACTION_ID
  ) {
    return <ScissorsIcon size={14} />;
  }
  const icons: Record<CanvasMaterialActionEffect, ReactNode> = {
    read: <PlayIcon size={14} />,
    derive: <RefreshIcon size={14} />,
    copy: <CopyIcon size={14} />,
    handoff: <OpenIcon size={14} />,
    generate: <RefreshIcon size={14} />,
  };
  return icons[descriptor.effect];
}

function materialActionPresentation(
  actionId: string,
): Pick<ToolbarAction, 'placement' | 'priority' | 'overflowGroup'> {
  switch (actionId) {
    case CANVAS_ADD_TO_CUT_ACTION_ID:
    case CANVAS_OPEN_IN_CUT_ACTION_ID:
      return { placement: 'visible', priority: 10 };
    case CANVAS_REGENERATE_ACTION_ID:
    case CANVAS_EDIT_AND_GENERATE_ACTION_ID:
      return { placement: 'visible', priority: 20 };
    case CANVAS_PREVIEW_ACTION_ID:
      return { placement: 'visible', priority: 30 };
    case CANVAS_REVEAL_ACTION_ID:
      return { placement: 'overflow', priority: 10, overflowGroup: 'file' };
    case CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID:
    case CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID:
      return { placement: 'overflow', priority: 20, overflowGroup: 'media-library' };
    default:
      return { placement: 'overflow', priority: 30, overflowGroup: 'other' };
  }
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
    placement: 'visible',
    priority: 90,
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

function resolveSelectionLabel(selectedNodes: readonly CanvasNode[]): string {
  if (selectedNodes.length !== 1) return t('selection.multiple');
  const node = selectedNodes[0];
  if (!node) return t('selection.multiple');
  if (node.type === 'media') {
    switch (node.data.mediaType) {
      case 'image':
        return t('node.image');
      case 'audio':
        return t('node.audio');
      case 'video':
        return t('node.video');
      case undefined:
        return t('node.media');
    }
  }
  if (node.type !== 'generation') {
    return getNodeLabel(NODE_TYPE_DESCRIPTORS, node.type, t);
  }
  switch (node.data.recipe.kind) {
    case 'prompt':
      return t('node.text');
    case 'image':
      return t('node.image');
    case 'audio':
      return t('node.audio');
    case 'video':
      return t('node.video');
  }
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
    placement: 'overflow',
    priority: 40,
    overflowGroup: 'node',
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
  return {
    primary: actions
      .filter((action) => action.placement === 'visible')
      .sort((left, right) => left.priority - right.priority),
    overflow: actions
      .filter((action) => action.placement === 'overflow')
      .sort((left, right) => left.priority - right.priority),
  };
}

function groupOverflowActions(actions: readonly ToolbarAction[]): readonly {
  readonly id: NonNullable<ToolbarAction['overflowGroup']>;
  readonly actions: readonly ToolbarAction[];
}[] {
  const order = ['file', 'media-library', 'node', 'other'] as const;
  return order.flatMap((id) => {
    const groupActions = actions.filter((action) => (action.overflowGroup ?? 'other') === id);
    return groupActions.length === 0 ? [] : [{ id, actions: groupActions }];
  });
}

function overflowGroupLabel(group: NonNullable<ToolbarAction['overflowGroup']>): string {
  switch (group) {
    case 'file':
      return t('selection.group.file');
    case 'media-library':
      return t('selection.group.mediaLibrary');
    case 'node':
      return t('selection.group.node');
    case 'other':
      return t('selection.group.other');
  }
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
