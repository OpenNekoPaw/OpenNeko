import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  CanvasMaterialActionDescriptor,
  CanvasMaterialActionEffect,
  CanvasNode,
  CanvasViewport,
} from '@neko/canvas-domain';
import {
  CANVAS_ADD_TO_CUT_ACTION_ID,
  CANVAS_AUDIO_VOICE_DENOISE_ACTION_ID,
  CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID,
  CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID,
  CANVAS_EDIT_AND_GENERATE_ACTION_ID,
  CANVAS_IMAGE_COLOR_GRADE_ACTION_ID,
  CANVAS_IMAGE_CROP_ACTION_ID,
  CANVAS_IMAGE_ERASE_ACTION_ID,
  CANVAS_IMAGE_GRID_SPLIT_ACTION_ID,
  CANVAS_IMAGE_OPEN_EDITOR_TOOLS_ACTION_ID,
  CANVAS_IMAGE_OUTPAINT_ACTION_ID,
  CANVAS_IMAGE_REDRAW_ACTION_ID,
  CANVAS_IMAGE_REMOVE_BACKGROUND_ACTION_ID,
  CANVAS_IMAGE_ROTATE_ACTION_ID,
  CANVAS_IMAGE_UPSCALE_ACTION_ID,
  CANVAS_OPEN_IN_CUT_ACTION_ID,
  CANVAS_PREVIEW_ACTION_ID,
  CANVAS_REGENERATE_ACTION_ID,
  CANVAS_REVEAL_ACTION_ID,
  CANVAS_VIDEO_COLOR_GRADE_ACTION_ID,
  CANVAS_VIDEO_ENHANCE_ACTION_ID,
  CANVAS_VIDEO_EXTRACT_FRAME_ACTION_ID,
  CANVAS_VIDEO_GENERATE_SUBTITLES_ACTION_ID,
  CANVAS_VIDEO_OPEN_EDITOR_TOOLS_ACTION_ID,
  CANVAS_VIDEO_REMOVE_SUBTITLES_ACTION_ID,
  CANVAS_VIDEO_SEPARATE_AUDIO_ACTION_ID,
} from '@neko/canvas-domain';
import { Button, IconButton, Popover } from '@neko/ui/primitives';
import {
  CopyIcon,
  CameraIcon,
  EyeIcon,
  EyeOffIcon,
  FullscreenIcon,
  GridIcon,
  LayersIcon,
  MoreHorizontalIcon,
  OpenIcon,
  PackageIcon,
  PlayIcon,
  RefreshIcon,
  RemoveIcon,
  RotateIcon,
  ScissorsIcon,
  SettingsIcon,
  VolumeOffIcon,
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
import { resolveSelectionToolbarTop } from './selectionAttachmentGeometry';

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
  readonly display: 'icon' | 'label';
  readonly section: 'edit' | 'asset' | 'utility' | 'canvas';
  readonly overflowGroup?: 'file' | 'media-edit' | 'media-library' | 'other';
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
  const materialIdentityKey = useMemo(
    () => selectedNodes.map(materialActionIdentityKey).join('\u0000'),
    [selectedNodes],
  );
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
  }, [host, materialIdentityKey, selectionKey]);
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
      {primary.map((action, index) => (
        <Fragment key={action.key}>
          {index > 0 && primary[index - 1]?.section !== action.section ? (
            <span className="selection-context-toolbar__divider" aria-hidden="true" />
          ) : null}
          {action.display === 'label' ? (
            <Button
              data-selection-action={action.key}
              data-selection-action-location="primary"
              size="xs"
              variant="ghost"
              leadingIcon={action.icon}
              className="selection-context-toolbar__text-action"
              onClick={action.run}
            >
              {action.label}
            </Button>
          ) : (
            <IconButton
              data-selection-action={action.key}
              data-selection-action-location="primary"
              size="xs"
              variant="ghost"
              label={action.label}
              icon={action.icon}
              onClick={action.run}
            />
          )}
        </Fragment>
      ))}
      {overflow.length > 0 && (
        <Popover
          align="end"
          side="bottom"
          open={overflowOpen}
          onOpenChange={setOverflowOpen}
          contentClassName="selection-action-overflow-surface"
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
                    variant="ghost"
                    data-danger={action.danger ? 'true' : undefined}
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

function materialActionIdentityKey(node: CanvasNode): string {
  if (node.type === 'generation') {
    const output = node.data.outputs.find(
      (candidate) => candidate.outputId === node.data.selectedOutputId,
    );
    return `${node.id}:generation:${node.data.selectedOutputId ?? ''}:${output?.kind ?? ''}:${JSON.stringify(output?.locator ?? null)}`;
  }
  if (node.type === 'media') {
    return `${node.id}:media:${node.data.mediaType ?? ''}:${JSON.stringify(node.data.contentLocator ?? null)}`;
  }
  if (node.type === 'file') {
    return `${node.id}:file:${node.data.mediaKind ?? ''}:${JSON.stringify(node.data.contentLocator ?? null)}`;
  }
  return `${node.id}:${node.type}`;
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
        display: 'label',
        section: 'canvas',
        run: () => canvasStore.getState().groupNodes(selectedIds),
      },
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
      display: 'label',
      section: 'utility',
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
        display: 'label',
        section: 'canvas',
        run: () => canvasStore.getState().fitGroupToContent(node.id),
      },
      {
        key: 'group:toggle',
        label: node.container?.collapsed ? t('group.expand') : t('group.collapse'),
        icon: <LayersIcon size={14} />,
        placement: 'visible',
        priority: 20,
        display: 'label',
        section: 'canvas',
        run: () =>
          canvasStore.getState().setGroupCollapsed(node.id, node.container?.collapsed !== true),
      },
    );
  }
  actions.push(createDuplicateAction(node.id, canvasStore, clipboardStore, historyStore));
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
  switch (descriptor.id) {
    case CANVAS_PREVIEW_ACTION_ID:
      return <FullscreenIcon size={14} />;
    case CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID:
    case CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID:
      return <PackageIcon size={14} />;
    case CANVAS_AUDIO_VOICE_DENOISE_ACTION_ID:
      return <VolumeOffIcon size={14} />;
    case CANVAS_VIDEO_SEPARATE_AUDIO_ACTION_ID:
      return <LayersIcon size={14} />;
    case CANVAS_VIDEO_ENHANCE_ACTION_ID:
    case CANVAS_IMAGE_UPSCALE_ACTION_ID:
      return <ZoomInIcon size={14} />;
    case CANVAS_VIDEO_EXTRACT_FRAME_ACTION_ID:
      return <CameraIcon size={14} />;
    case CANVAS_VIDEO_REMOVE_SUBTITLES_ACTION_ID:
      return <EyeOffIcon size={14} />;
    case CANVAS_VIDEO_GENERATE_SUBTITLES_ACTION_ID:
      return <EyeIcon size={14} />;
    case CANVAS_VIDEO_COLOR_GRADE_ACTION_ID:
    case CANVAS_IMAGE_COLOR_GRADE_ACTION_ID:
    case CANVAS_VIDEO_OPEN_EDITOR_TOOLS_ACTION_ID:
    case CANVAS_IMAGE_OPEN_EDITOR_TOOLS_ACTION_ID:
      return <SettingsIcon size={14} />;
    case CANVAS_IMAGE_CROP_ACTION_ID:
      return <ScissorsIcon size={14} />;
    case CANVAS_IMAGE_REDRAW_ACTION_ID:
      return <RefreshIcon size={14} />;
    case CANVAS_IMAGE_ERASE_ACTION_ID:
    case CANVAS_IMAGE_REMOVE_BACKGROUND_ACTION_ID:
      return <RemoveIcon size={14} />;
    case CANVAS_IMAGE_OUTPAINT_ACTION_ID:
      return <ZoomInIcon size={14} />;
    case CANVAS_IMAGE_ROTATE_ACTION_ID:
      return <RotateIcon size={14} />;
    case CANVAS_IMAGE_GRID_SPLIT_ACTION_ID:
      return <GridIcon size={14} />;
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
): Pick<ToolbarAction, 'placement' | 'priority' | 'display' | 'section' | 'overflowGroup'> {
  switch (actionId) {
    case CANVAS_ADD_TO_CUT_ACTION_ID:
    case CANVAS_OPEN_IN_CUT_ACTION_ID:
      return {
        placement: 'visible',
        priority: 10,
        display: 'label',
        section: 'edit',
      };
    case CANVAS_IMAGE_CROP_ACTION_ID:
      return { placement: 'visible', priority: 10, display: 'label', section: 'edit' };
    case CANVAS_VIDEO_SEPARATE_AUDIO_ACTION_ID:
    case CANVAS_AUDIO_VOICE_DENOISE_ACTION_ID:
    case CANVAS_IMAGE_UPSCALE_ACTION_ID:
      return { placement: 'visible', priority: 20, display: 'label', section: 'edit' };
    case CANVAS_IMAGE_REDRAW_ACTION_ID:
      return { placement: 'visible', priority: 30, display: 'label', section: 'edit' };
    case CANVAS_REGENERATE_ACTION_ID:
    case CANVAS_EDIT_AND_GENERATE_ACTION_ID:
      return { placement: 'visible', priority: 40, display: 'label', section: 'edit' };
    case CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID:
      return { placement: 'visible', priority: 70, display: 'label', section: 'asset' };
    case CANVAS_PREVIEW_ACTION_ID:
      return { placement: 'visible', priority: 100, display: 'icon', section: 'utility' };
    case CANVAS_REVEAL_ACTION_ID:
      return {
        placement: 'overflow',
        priority: 10,
        display: 'label',
        section: 'utility',
        overflowGroup: 'file',
      };
    case CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID:
      return {
        placement: 'overflow',
        priority: 20,
        display: 'label',
        section: 'asset',
        overflowGroup: 'media-library',
      };
    case CANVAS_VIDEO_ENHANCE_ACTION_ID:
    case CANVAS_VIDEO_EXTRACT_FRAME_ACTION_ID:
    case CANVAS_VIDEO_REMOVE_SUBTITLES_ACTION_ID:
    case CANVAS_VIDEO_GENERATE_SUBTITLES_ACTION_ID:
    case CANVAS_VIDEO_COLOR_GRADE_ACTION_ID:
    case CANVAS_VIDEO_OPEN_EDITOR_TOOLS_ACTION_ID:
    case CANVAS_IMAGE_ERASE_ACTION_ID:
    case CANVAS_IMAGE_OUTPAINT_ACTION_ID:
    case CANVAS_IMAGE_REMOVE_BACKGROUND_ACTION_ID:
    case CANVAS_IMAGE_COLOR_GRADE_ACTION_ID:
    case CANVAS_IMAGE_ROTATE_ACTION_ID:
    case CANVAS_IMAGE_GRID_SPLIT_ACTION_ID:
    case CANVAS_IMAGE_OPEN_EDITOR_TOOLS_ACTION_ID:
      return {
        placement: 'overflow',
        priority: mediaEditOverflowPriority(actionId),
        display: 'label',
        section: 'edit',
        overflowGroup: 'media-edit',
      };
    default:
      return {
        placement: 'overflow',
        priority: 30,
        display: 'label',
        section: 'utility',
        overflowGroup: 'other',
      };
  }
}

function mediaEditOverflowPriority(actionId: string): number {
  const order = [
    CANVAS_VIDEO_ENHANCE_ACTION_ID,
    CANVAS_VIDEO_EXTRACT_FRAME_ACTION_ID,
    CANVAS_VIDEO_REMOVE_SUBTITLES_ACTION_ID,
    CANVAS_VIDEO_GENERATE_SUBTITLES_ACTION_ID,
    CANVAS_VIDEO_COLOR_GRADE_ACTION_ID,
    CANVAS_IMAGE_ERASE_ACTION_ID,
    CANVAS_IMAGE_OUTPAINT_ACTION_ID,
    CANVAS_IMAGE_REMOVE_BACKGROUND_ACTION_ID,
    CANVAS_IMAGE_COLOR_GRADE_ACTION_ID,
    CANVAS_IMAGE_ROTATE_ACTION_ID,
    CANVAS_IMAGE_GRID_SPLIT_ACTION_ID,
    CANVAS_VIDEO_OPEN_EDITOR_TOOLS_ACTION_ID,
    CANVAS_IMAGE_OPEN_EDITOR_TOOLS_ACTION_ID,
  ];
  const index = order.indexOf(actionId);
  if (index < 0) {
    throw new Error(`Unknown Canvas media edit action presentation "${actionId}".`);
  }
  return index + 1;
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
    display: 'icon',
    section: 'canvas',
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
      .sort(
        (left, right) =>
          overflowGroupOrder(left.overflowGroup) - overflowGroupOrder(right.overflowGroup) ||
          left.priority - right.priority,
      ),
  };
}

function overflowGroupOrder(group: ToolbarAction['overflowGroup']): number {
  return ['media-edit', 'file', 'media-library', 'other'].indexOf(group ?? 'other');
}

function groupOverflowActions(actions: readonly ToolbarAction[]): readonly {
  readonly id: NonNullable<ToolbarAction['overflowGroup']>;
  readonly actions: readonly ToolbarAction[];
}[] {
  const order = ['media-edit', 'file', 'media-library', 'other'] as const;
  return order.flatMap((id) => {
    const groupActions = actions.filter((action) => (action.overflowGroup ?? 'other') === id);
    return groupActions.length === 0 ? [] : [{ id, actions: groupActions }];
  });
}

function overflowGroupLabel(group: NonNullable<ToolbarAction['overflowGroup']>): string {
  switch (group) {
    case 'file':
      return t('selection.group.file');
    case 'media-edit':
      return t('selection.group.mediaEdit');
    case 'media-library':
      return t('selection.group.mediaLibrary');
    case 'other':
      return t('selection.group.other');
  }
}

function resolveToolbarPosition(
  nodes: readonly CanvasNode[],
  viewport: CanvasViewport,
  _viewportSize: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number } {
  const left = Math.min(...nodes.map((node) => node.position.x));
  const right = Math.max(...nodes.map((node) => node.position.x + node.size.width));
  const top = Math.min(...nodes.map((node) => node.position.y));
  const centerX = viewport.pan.x + ((left + right) / 2) * viewport.zoom;
  const reservesExternalLabel = nodes.some(
    (node) => node.type === 'media' || node.type === 'file' || node.type === 'generation',
  );
  return {
    x: centerX,
    y: resolveSelectionToolbarTop(
      viewport.pan.y + top * viewport.zoom,
      viewport.zoom,
      reservesExternalLabel,
    ),
  };
}
