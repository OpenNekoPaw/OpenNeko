import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  CanvasMaterialActionDescriptor,
  CanvasMaterialActionEffect,
  CanvasMaterialMediaKind,
  CanvasNode,
  CanvasViewport,
} from '@neko/canvas-domain';
import {
  CANVAS_ADD_TO_CUT_ACTION_ID,
  CANVAS_AUDIO_VOICE_DENOISE_ACTION_ID,
  CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID,
  CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID,
  CANVAS_EDIT_AND_GENERATE_ACTION_ID,
  CANVAS_EDIT_TEXT_ACTION_ID,
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
  selectedCanvasGenerationOutput,
} from '@neko/canvas-domain';
import { Button, IconButton, Popover } from '@neko/ui/primitives';
import {
  CopyIcon,
  CameraIcon,
  EyeIcon,
  EyeOffIcon,
  EditIcon,
  FullscreenIcon,
  GridIcon,
  LayersIcon,
  LoadingIcon,
  MoreHorizontalIcon,
  OpenIcon,
  PlayIcon,
  RefreshIcon,
  RemoveIcon,
  RotateIcon,
  ScissorsIcon,
  SettingsIcon,
  TrashIcon,
  VolumeOffIcon,
  WarningIcon,
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

const STABLE_MATERIAL_ACTION_IDS: Readonly<Record<CanvasMaterialMediaKind, readonly string[]>> = {
  document: [CANVAS_EDIT_TEXT_ACTION_ID, CANVAS_PREVIEW_ACTION_ID],
  image: [
    CANVAS_IMAGE_CROP_ACTION_ID,
    CANVAS_IMAGE_UPSCALE_ACTION_ID,
    CANVAS_IMAGE_REDRAW_ACTION_ID,
    CANVAS_PREVIEW_ACTION_ID,
  ],
  video: [
    CANVAS_ADD_TO_CUT_ACTION_ID,
    CANVAS_VIDEO_SEPARATE_AUDIO_ACTION_ID,
    CANVAS_PREVIEW_ACTION_ID,
  ],
  audio: [
    CANVAS_ADD_TO_CUT_ACTION_ID,
    CANVAS_AUDIO_VOICE_DENOISE_ACTION_ID,
    CANVAS_PREVIEW_ACTION_ID,
  ],
  model: [CANVAS_PREVIEW_ACTION_ID],
  other: [CANVAS_PREVIEW_ACTION_ID],
};

interface SelectionContextToolbarProps {
  readonly nodes: readonly CanvasNode[];
  readonly selectedNodeIds: readonly string[];
  readonly unavailableNodeIds?: ReadonlySet<string>;
  readonly viewport: CanvasViewport;
  readonly viewportSize: { readonly width: number; readonly height: number };
  readonly hidden?: boolean;
  readonly onMarkdownEdit?: (nodeId: string) => void;
}

interface ToolbarAction {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly run?: () => void;
  readonly disabledReason?: string;
  readonly danger?: boolean;
  readonly placement: 'visible' | 'overflow';
  readonly priority: number;
  readonly display: 'icon' | 'label';
  readonly section: 'edit' | 'utility' | 'canvas';
}

type MaterialActionState =
  | { readonly status: 'idle' | 'loading'; readonly descriptors: readonly [] }
  | {
      readonly status: 'ready';
      readonly descriptors: readonly CanvasMaterialActionDescriptor[];
    }
  | {
      readonly status: 'error';
      readonly descriptors: readonly [];
      readonly message: string;
      readonly retry: () => void;
    };

type BeginMaterialActionExecution = (label: string) => (error: unknown) => void;

export function SelectionContextToolbar({
  nodes,
  selectedNodeIds,
  unavailableNodeIds = new Set(),
  viewport,
  viewportSize,
  hidden = false,
  onMarkdownEdit,
}: SelectionContextToolbarProps): ReactNode {
  const host = useOptionalCanvasHost();
  const canvasStore = useCanvasStoreApi();
  const clipboardStore = useClipboardStoreApi();
  const historyStore = useHistoryStoreApi();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [materialActionState, setMaterialActionState] = useState<MaterialActionState>({
    status: 'idle',
    descriptors: [],
  });
  const [executionDiagnostic, setExecutionDiagnostic] = useState<{
    readonly label: string;
    readonly message: string;
  }>();
  const executionFailureReporter = useRef<(error: unknown) => void>();
  const beginExecution = useCallback<BeginMaterialActionExecution>((label) => {
    const reportFailure = (error: unknown): void => {
      if (executionFailureReporter.current !== reportFailure) return;
      setExecutionDiagnostic({
        label,
        message: error instanceof Error ? error.message : String(error),
      });
    };
    executionFailureReporter.current = reportFailure;
    setExecutionDiagnostic(undefined);
    return reportFailure;
  }, []);
  const selectedNodes = useMemo(
    () => selectedNodeIds.flatMap((id) => nodes.find((node) => node.id === id) ?? []),
    [nodes, selectedNodeIds],
  );
  const selectionUnavailable = selectedNodes.some((node) => unavailableNodeIds.has(node.id));
  const materialIdentityKey = useMemo(
    () =>
      selectionUnavailable
        ? `unavailable:${selectedNodes.map((node) => node.id).join('\u0000')}`
        : selectedNodes.map(materialActionIdentityKey).join('\u0000'),
    [selectedNodes, selectionUnavailable],
  );
  const selectedNodeIdsKey = JSON.stringify(selectedNodeIds);
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  selectedNodeIdsRef.current = selectedNodeIds;
  useEffect(() => {
    let current = true;
    const stopObserving = (): void => {
      current = false;
      executionFailureReporter.current = undefined;
    };
    executionFailureReporter.current = undefined;
    setExecutionDiagnostic(undefined);
    const requestNodeIds = selectedNodeIdsRef.current;
    if (!host || requestNodeIds.length === 0 || selectionUnavailable) {
      setMaterialActionState({ status: 'idle', descriptors: [] });
      return stopObserving;
    }
    const resolve = (): void => {
      setMaterialActionState({ status: 'loading', descriptors: [] });
      void host
        .resolveMaterialActions(requestNodeIds)
        .then((descriptors) => {
          if (current) setMaterialActionState({ status: 'ready', descriptors });
        })
        .catch((error: unknown) => {
          if (current) {
            setMaterialActionState({
              status: 'error',
              descriptors: [],
              message: error instanceof Error ? error.message : String(error),
              retry: resolve,
            });
          }
        });
    };
    resolve();
    return stopObserving;
  }, [host, materialIdentityKey, selectedNodeIdsKey, selectionUnavailable]);
  const actions = useMemo(() => {
    if (selectionUnavailable) {
      return [
        {
          key: 'delete-selection',
          label: t('menu.delete'),
          icon: <TrashIcon size={14} />,
          placement: 'visible',
          priority: 10,
          display: 'label',
          section: 'canvas',
          danger: true,
          run: () => canvasStore.getState().deleteSelected(),
        } satisfies ToolbarAction,
      ];
    }
    return resolveActions(
      selectedNodes,
      host,
      materialActionState.descriptors,
      canvasStore,
      clipboardStore,
      historyStore,
      beginExecution,
      onMarkdownEdit,
    );
  }, [
    beginExecution,
    canvasStore,
    clipboardStore,
    historyStore,
    host,
    materialActionState.descriptors,
    onMarkdownEdit,
    selectedNodes,
    selectionUnavailable,
  ]);
  if (hidden || selectedNodes.length === 0 || actions.length === 0) return null;

  const position = resolveToolbarPosition(selectedNodes, viewport, viewportSize);
  const { primary, overflow } = partitionActions(actions);
  const selectionLabel = selectionUnavailable
    ? t('node.unavailableBadge')
    : resolveSelectionLabel(selectedNodes);
  const diagnostic =
    materialActionState.status === 'error'
      ? { label: t('selection.actionsLoadFailed'), message: materialActionState.message }
      : executionDiagnostic
        ? {
            label: t('selection.actionFailed', { action: executionDiagnostic.label }),
            message: executionDiagnostic.message,
          }
        : undefined;

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
      {materialActionState.status === 'loading' ? (
        <span
          className="selection-context-toolbar__status"
          data-material-actions-status="loading"
          title={t('selection.actionsLoading')}
        >
          <LoadingIcon size={14} />
        </span>
      ) : null}
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
              disabled={Boolean(action.disabledReason)}
              title={action.disabledReason}
              data-disabled-reason={action.disabledReason}
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
              disabled={Boolean(action.disabledReason)}
              title={action.disabledReason}
              data-disabled-reason={action.disabledReason}
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
            {overflow.map((action) => (
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
                disabled={Boolean(action.disabledReason)}
                title={action.disabledReason}
                data-disabled-reason={action.disabledReason}
                onClick={() => {
                  action.run?.();
                  setOverflowOpen(false);
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </Popover>
      )}
      {diagnostic ? (
        <span
          className="selection-context-toolbar__diagnostic"
          data-material-actions-status="error"
          role="alert"
          title={diagnostic.message}
        >
          <WarningIcon size={14} />
          <span>{diagnostic.label}</span>
          {materialActionState.status === 'error' ? (
            <Button
              data-material-actions-retry="true"
              size="xs"
              variant="ghost"
              onClick={materialActionState.retry}
            >
              {t('errorBoundary.retry')}
            </Button>
          ) : null}
        </span>
      ) : null}
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
  beginExecution: BeginMaterialActionExecution,
  onMarkdownEdit: ((nodeId: string) => void) | undefined,
): ToolbarAction[] {
  const selectedIds = selectedNodes.map((node) => node.id);
  if (selectedNodes.length > 1) {
    return [
      ...resolveOwnerActions(selectedNodes, ownerDescriptors, selectedIds, host, beginExecution),
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
      createDuplicateAction(selectedIds, canvasStore, clipboardStore, historyStore),
      {
        key: 'delete-selection',
        label: t('menu.delete'),
        icon: <TrashIcon size={14} />,
        placement: 'overflow',
        priority: 100,
        display: 'label',
        section: 'canvas',
        danger: true,
        run: () => canvasStore.getState().deleteSelected(),
      },
    ];
  }

  const node = selectedNodes[0];
  if (!node) return [];
  const actions: ToolbarAction[] = resolveOwnerActions(
    selectedNodes,
    ownerDescriptors,
    selectedIds,
    host,
    beginExecution,
  );
  if (node.type === 'markdown') {
    actions.push({
      key: 'canvas:edit-markdown',
      label: t('action.editMarkdownInCanvas'),
      icon: <FullscreenIcon size={14} />,
      placement: 'visible',
      priority: 10,
      display: 'label',
      section: 'edit',
      run: onMarkdownEdit ? () => onMarkdownEdit(node.id) : undefined,
      disabledReason: onMarkdownEdit ? undefined : t('selection.capabilityUnavailable'),
    });
  }
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
          file: { authority: 'workspace', path },
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
  actions.push(createDuplicateAction([node.id], canvasStore, clipboardStore, historyStore));
  return actions;
}

function resolveOwnerActions(
  selectedNodes: readonly CanvasNode[],
  descriptors: readonly CanvasMaterialActionDescriptor[],
  selectedNodeIds: readonly string[],
  host: ReturnType<typeof useOptionalCanvasHost>,
  beginExecution: BeginMaterialActionExecution,
): ToolbarAction[] {
  const inlineMarkdown = selectedNodes.length === 1 && selectedNodes[0]?.type === 'markdown';
  const availableDescriptors = descriptors.filter(
    (descriptor) =>
      !isResourceManagementAction(descriptor.id) &&
      !(inlineMarkdown && descriptor.id === CANVAS_EDIT_TEXT_ACTION_ID),
  );
  const descriptorById = new Map(
    availableDescriptors.map((descriptor) => [descriptor.id, descriptor] as const),
  );
  const stableIds = stableMaterialActionIds(selectedNodes, descriptors);
  const unavailableReason = t('selection.capabilityUnavailable');
  const stableActions = stableIds.map((actionId) => {
    const descriptor = descriptorById.get(actionId);
    if (!descriptor || !host) {
      const presentation = materialActionPresentation(actionId);
      return {
        key: actionId,
        label: materialActionFallbackLabel(actionId),
        icon: materialActionIcon(actionId, 'read'),
        ...presentation,
        disabledReason: unavailableReason,
      } satisfies ToolbarAction;
    }
    descriptorById.delete(actionId);
    return createOwnerAction(descriptor, selectedNodeIds, host, beginExecution);
  });
  if (!host) return stableActions;
  const overflowActions = availableDescriptors
    .filter((descriptor) => descriptorById.has(descriptor.id))
    .map((descriptor) => createOwnerAction(descriptor, selectedNodeIds, host, beginExecution));
  return [...stableActions, ...overflowActions];
}

function createOwnerAction(
  descriptor: CanvasMaterialActionDescriptor,
  selectedNodeIds: readonly string[],
  host: NonNullable<ReturnType<typeof useOptionalCanvasHost>>,
  beginExecution: BeginMaterialActionExecution,
): ToolbarAction {
  const presentation = materialActionPresentation(descriptor.id);
  return {
    key: descriptor.id,
    label: descriptor.label,
    icon: materialActionIcon(descriptor.id, descriptor.effect),
    ...presentation,
    disabledReason: descriptor.unavailable?.message,
    run: descriptor.unavailable
      ? undefined
      : () => {
          const reportFailure = beginExecution(descriptor.label);
          void host
            .executeMaterialAction(
              descriptor.id,
              selectedNodeIds,
              descriptor.executionPayload ?? {},
            )
            .catch(reportFailure);
        },
  };
}

function stableMaterialActionIds(
  selectedNodes: readonly CanvasNode[],
  descriptors: readonly CanvasMaterialActionDescriptor[],
): readonly string[] {
  if (selectedNodes.length !== 1) return [];
  const node = selectedNodes[0];
  if (!node) return [];
  if (node.type === 'markdown') return [CANVAS_PREVIEW_ACTION_ID];
  if (node.type === 'generation' && selectedCanvasGenerationOutput(node.data)?.kind === 'prompt') {
    return [CANVAS_EDIT_TEXT_ACTION_ID];
  }
  const kind = materialKindForNode(node);
  if (kind === 'document') {
    return descriptors.some((descriptor) => descriptor.id === CANVAS_EDIT_TEXT_ACTION_ID)
      ? [CANVAS_EDIT_TEXT_ACTION_ID]
      : [CANVAS_PREVIEW_ACTION_ID];
  }
  return kind ? STABLE_MATERIAL_ACTION_IDS[kind] : [];
}

function materialKindForNode(node: CanvasNode): CanvasMaterialMediaKind | undefined {
  if (node.type === 'generation') {
    const output = selectedCanvasGenerationOutput(node.data);
    if (!output) return undefined;
    return output.kind === 'prompt' ? 'document' : output.kind;
  }
  if (node.type === 'media') return node.data.mediaType;
  if (node.type === 'file') return node.data.mediaKind ?? 'document';
  if (node.type === 'markdown') return 'document';
  return undefined;
}

function isResourceManagementAction(actionId: string): boolean {
  return (
    actionId === CANVAS_REVEAL_ACTION_ID ||
    actionId === CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID ||
    actionId === CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID
  );
}

function materialActionIcon(actionId: string, effect: CanvasMaterialActionEffect): ReactNode {
  if (actionId === CANVAS_ADD_TO_CUT_ACTION_ID || actionId === CANVAS_OPEN_IN_CUT_ACTION_ID) {
    return <ScissorsIcon size={14} />;
  }
  switch (actionId) {
    case CANVAS_PREVIEW_ACTION_ID:
      return <OpenIcon size={14} />;
    case CANVAS_EDIT_TEXT_ACTION_ID:
      return <EditIcon size={14} />;
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
  return icons[effect];
}

function materialActionFallbackLabel(actionId: string): string {
  const labels: Readonly<Record<string, string>> = {
    [CANVAS_PREVIEW_ACTION_ID]: t('action.openPreview'),
    [CANVAS_EDIT_TEXT_ACTION_ID]: t('action.editText'),
    [CANVAS_ADD_TO_CUT_ACTION_ID]: t('action.addToCut'),
    [CANVAS_AUDIO_VOICE_DENOISE_ACTION_ID]: t('action.voiceDenoise'),
    [CANVAS_VIDEO_SEPARATE_AUDIO_ACTION_ID]: t('action.separateAudio'),
    [CANVAS_IMAGE_CROP_ACTION_ID]: t('action.crop'),
    [CANVAS_IMAGE_UPSCALE_ACTION_ID]: t('action.upscale'),
    [CANVAS_IMAGE_REDRAW_ACTION_ID]: t('action.redraw'),
  };
  const label = labels[actionId];
  if (!label) throw new Error(`Canvas stable action "${actionId}" has no label.`);
  return label;
}

function materialActionPresentation(
  actionId: string,
): Pick<ToolbarAction, 'placement' | 'priority' | 'display' | 'section'> {
  switch (actionId) {
    case CANVAS_ADD_TO_CUT_ACTION_ID:
    case CANVAS_OPEN_IN_CUT_ACTION_ID:
    case CANVAS_EDIT_TEXT_ACTION_ID:
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
    case CANVAS_PREVIEW_ACTION_ID:
      return { placement: 'visible', priority: 100, display: 'icon', section: 'utility' };
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
      };
    default:
      return {
        placement: 'overflow',
        priority: 30,
        display: 'label',
        section: 'utility',
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
  nodeIds: readonly string[],
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
        .duplicate([...nodeIds], canvasData.nodes, canvasData.connections);
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
  if (node.type === 'file') {
    switch (node.data.mediaKind) {
      case 'image':
        return t('node.image');
      case 'audio':
        return t('node.audio');
      case 'video':
        return t('node.video');
      case 'document':
      case 'model':
      case 'other':
      case undefined:
        break;
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
      .sort((left, right) => left.priority - right.priority),
  };
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
