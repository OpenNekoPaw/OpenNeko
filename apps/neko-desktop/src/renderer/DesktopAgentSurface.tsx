import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ConsoleLogger } from '@neko/shared';
import type {
  DshPermissionHostIdentity,
  DshPermissionHostProjection,
} from '@neko/agent-contracts/dsh-permission-host';
import type {
  DshConversationCreationTarget,
  DshComposerConfigurationProjection,
  DshComposerMentionProjection,
  DshComposerSubmitInput,
  DshSessionHostProjection,
} from '@neko/agent-contracts/dsh-session-host';
import type { DshRuntimeHostProjection } from '@neko/agent-contracts/dsh-runtime-host';
import type {
  CharacterCreationHandoffIntent,
  CharacterDialogueHandoffIntent,
  ProjectTemplateHandoffIntent,
  WorldCreationHandoffIntent,
} from '@neko/agent-contracts';
import {
  DshAgentView,
  type DshEntryContextPresentation,
} from '@neko/agent-webview/dsh-session/root';
import {
  useDshComposerPresentationSnapshotStore,
  type DshComposerCanvasSelectionScope,
} from '@neko/agent-webview/dsh-session/presentation-snapshot';
import { WorkspaceQuickCreateControl } from './WorkspaceQuickCreateControl';

const desktopAgentSurfaceLogger = new ConsoleLogger('DesktopAgentSurface');

export interface DesktopAgentSurfaceProps {
  readonly onCreateCanvas?: (name: string) => Promise<string>;
  readonly agentSurfaceId: string;
  readonly workbenchInstanceId: string;
  readonly sceneId: string;
  readonly conversationId?: string;
  readonly surfaceKind: 'entry' | 'assistant' | 'workspace';
  readonly entryContext?: DshEntryContextPresentation;
  readonly characterCreationHandoff?: CharacterCreationHandoffIntent;
  readonly onCharacterCreationHandoffConsumed?: (intentId: string) => void;
  readonly characterDialogueHandoff?: CharacterDialogueHandoffIntent;
  readonly onCharacterDialogueHandoffConsumed?: (intentId: string) => void;
  readonly projectTemplateHandoff?: ProjectTemplateHandoffIntent;
  readonly onProjectTemplateHandoffConsumed?: (intentId: string) => void;
  readonly worldCreationHandoff?: WorldCreationHandoffIntent;
  readonly onWorldCreationHandoffConsumed?: (intentId: string) => void;
  readonly conversationFeed?: ReactNode;
  readonly messageAuthorPresentation?: {
    readonly assistant?: ReactNode;
    readonly user?: ReactNode;
  };
  readonly onConversationBranched?: (conversationId: string) => void;
  readonly onOpenWrittenFile?: (conversationId: string, toolCallId: string) => void;
}

type DesktopAgentSurfaceState =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly projection: DshSessionHostProjection;
      readonly permissions: readonly DshPermissionHostProjection[];
    }
  | { readonly kind: 'error'; readonly message: string };

export function DesktopAgentSurface({
  agentSurfaceId,
  characterCreationHandoff,
  characterDialogueHandoff,
  conversationFeed,
  conversationId,
  entryContext,
  messageAuthorPresentation,
  onCharacterCreationHandoffConsumed,
  onCharacterDialogueHandoffConsumed,
  onConversationBranched,
  onOpenWrittenFile,
  onCreateCanvas,
  onProjectTemplateHandoffConsumed,
  onWorldCreationHandoffConsumed,
  projectTemplateHandoff,
  sceneId,
  surfaceKind,
  worldCreationHandoff,
  workbenchInstanceId,
}: DesktopAgentSurfaceProps): JSX.Element {
  const [state, setState] = useState<DesktopAgentSurfaceState>({ kind: 'loading' });
  const [runtime, setRuntime] = useState<DshRuntimeHostProjection>();
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [composerConfiguration, setComposerConfiguration] =
    useState<DshComposerConfigurationProjection>();
  const [composerConfigurationError, setComposerConfigurationError] = useState<string>();
  const [mentionItems, setMentionItems] = useState<readonly DshComposerMentionProjection[]>([]);
  const [mentionDiagnostic, setMentionDiagnostic] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [configuring, setConfiguring] = useState(false);
  const composerSnapshots = useDshComposerPresentationSnapshotStore();
  const [createdCanvas, setCreatedCanvas] = useState<{
    readonly scope: DshComposerCanvasSelectionScope;
    readonly canvasId: string;
  }>();
  const submissionCount = useRef(0);
  const refreshSequence = useRef(0);
  const composerRefreshSequence = useRef(0);
  const activeSceneId = useRef(sceneId);
  const mentionRequestSequence = useRef(0);

  useEffect(() => {
    activeSceneId.current = sceneId;
  }, [sceneId]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!conversationId) return;
    const sequence = ++refreshSequence.current;
    try {
      const runtimeProjection = await window.openNekoDesktop.dshRuntime.getStatus();
      if (sequence !== refreshSequence.current) return;
      setRuntime(runtimeProjection);
      if (runtimeProjection.status !== 'running') return;
      const [projection, permissions] = await Promise.all([
        window.openNekoDesktop.dshSessions.getSnapshot(conversationId),
        window.openNekoDesktop.dshPermissions.list(conversationId),
      ]);
      if (sequence !== refreshSequence.current) return;
      setState(requireReadyState(conversationId, projection, permissions));
    } catch (error) {
      if (sequence !== refreshSequence.current) return;
      setState({ kind: 'error', message: describeError(error) });
    }
  }, [conversationId]);

  const refreshComposerConfiguration = useCallback(async (): Promise<void> => {
    const sequence = ++composerRefreshSequence.current;
    const requestedSceneId = sceneId;
    try {
      const configuration = await window.openNekoDesktop.dshSessions.getComposerConfiguration(
        workbenchInstanceId,
        agentSurfaceId,
      );
      if (
        sequence !== composerRefreshSequence.current ||
        requestedSceneId !== activeSceneId.current
      ) {
        return;
      }
      setComposerConfiguration(configuration);
      setComposerConfigurationError(undefined);
    } catch (error) {
      if (
        sequence !== composerRefreshSequence.current ||
        requestedSceneId !== activeSceneId.current
      ) {
        return;
      }
      setComposerConfigurationError(describeError(error));
    }
  }, [agentSurfaceId, sceneId, workbenchInstanceId]);

  const composerWorkspaceId = composerConfiguration?.context?.workspaceId;
  useEffect(() => {
    return window.openNekoDesktop.canvas.subscribeWorkspaceIndex((event) => {
      if (surfaceKind !== 'workspace') return;
      if (composerWorkspaceId !== undefined && event.workspaceId !== composerWorkspaceId) return;
      void refreshComposerConfiguration();
    });
  }, [composerWorkspaceId, refreshComposerConfiguration, surfaceKind]);

  useEffect(() => {
    let active = true;
    let refreshInFlight = false;
    let refreshPending = false;
    let preparationInFlight = false;
    let preparationPending = false;
    const requestRefresh = (): void => {
      refreshPending = true;
      if (refreshInFlight) {
        refreshSequence.current += 1;
        return;
      }
      refreshInFlight = true;
      void (async () => {
        try {
          while (active && refreshPending) {
            refreshPending = false;
            await refresh();
          }
        } finally {
          refreshInFlight = false;
        }
      })();
    };
    const requestPreparation = (): void => {
      preparationPending = true;
      if (preparationInFlight) return;
      preparationInFlight = true;
      void (async () => {
        try {
          while (active && preparationPending) {
            preparationPending = false;
            const projection = await window.openNekoDesktop.dshRuntime.prepareSession();
            if (!active) return;
            setRuntime(projection);
            if (projection.status !== 'running') return;
            await refreshComposerConfiguration();
            if (conversationId) requestRefresh();
          }
        } catch (error) {
          if (active) setState({ kind: 'error', message: describeError(error) });
        } finally {
          preparationInFlight = false;
        }
      })();
    };
    setComposerConfiguration(undefined);
    setComposerConfigurationError(undefined);
    if (conversationId) {
      setState({ kind: 'loading' });
    }
    requestPreparation();
    const unsubscribeSession = conversationId
      ? window.openNekoDesktop.dshSessions.subscribe((event) => {
          if (event.conversationId === conversationId) requestRefresh();
        })
      : () => undefined;
    const unsubscribePermissions = conversationId
      ? window.openNekoDesktop.dshPermissions.subscribe((event) => {
          if (event.conversationId === conversationId) requestRefresh();
        })
      : () => undefined;
    const unsubscribeRuntime = window.openNekoDesktop.dshRuntime.subscribe((projection) => {
      if (!active) return;
      setRuntime(projection);
      if (projection.status !== 'running') return;
      if (conversationId) requestRefresh();
      else if (projection.sessionConfigurationPending === true) requestPreparation();
    });
    return () => {
      active = false;
      refreshSequence.current += 1;
      composerRefreshSequence.current += 1;
      unsubscribeSession();
      unsubscribePermissions();
      unsubscribeRuntime();
    };
  }, [conversationId, refresh, refreshComposerConfiguration]);

  const selectModel = async (modelOptionId: string): Promise<void> => {
    if (configuring) return;
    setConfiguring(true);
    try {
      const configuration = await window.openNekoDesktop.dshSessions.selectComposerModel(
        workbenchInstanceId,
        agentSurfaceId,
        modelOptionId,
      );
      setComposerConfiguration(configuration);
      setComposerConfigurationError(undefined);
    } catch (error) {
      setComposerConfigurationError(describeError(error));
    } finally {
      setConfiguring(false);
    }
  };

  const selectPermissionPreset = async (permissionPresetId: string): Promise<void> => {
    if (configuring) return;
    setConfiguring(true);
    try {
      const configuration = await window.openNekoDesktop.dshSessions.selectComposerPermissionPreset(
        workbenchInstanceId,
        agentSurfaceId,
        permissionPresetId,
      );
      setComposerConfiguration(configuration);
      setComposerConfigurationError(undefined);
    } catch (error) {
      setComposerConfigurationError(describeError(error));
    } finally {
      setConfiguring(false);
    }
  };

  const selectMediaModel = async (
    category: 'image' | 'video' | 'audio' | 'music',
    modelOptionId: string,
  ): Promise<void> => {
    if (configuring) return;
    setConfiguring(true);
    try {
      const configuration = await window.openNekoDesktop.dshSessions.selectComposerMediaModel(
        workbenchInstanceId,
        agentSurfaceId,
        category,
        modelOptionId,
      );
      setComposerConfiguration(configuration);
      setComposerConfigurationError(undefined);
    } catch (error) {
      setComposerConfigurationError(describeError(error));
    } finally {
      setConfiguring(false);
    }
  };

  const submit = async (
    creationTarget: DshConversationCreationTarget,
    input: DshComposerSubmitInput,
  ): Promise<boolean> => {
    const runActive = state.kind === 'ready' && state.projection.currentTurn !== undefined;
    if (submitting && !runActive) return false;
    setOperationError(undefined);
    submissionCount.current += 1;
    setSubmitting(true);
    try {
      const permissionPresetId = composerConfiguration?.permissionPresetId;
      if (permissionPresetId === undefined) {
        throw new Error('DSH permission preset is unavailable.');
      }
      const existingConversationId =
        conversationId ?? (state.kind === 'ready' ? state.projection.conversationId : undefined);
      const projection =
        existingConversationId === undefined
          ? await window.openNekoDesktop.dshSessions.create(
              workbenchInstanceId,
              agentSurfaceId,
              permissionPresetId,
              creationTarget,
              input,
            )
          : (await window.openNekoDesktop.dshSessions.submit(existingConversationId, input))
              .projection;
      const targetConversationId = projection.conversationId;
      const permissions = await window.openNekoDesktop.dshPermissions.list(targetConversationId);
      setState(requireReadyState(targetConversationId, projection, permissions));
      return true;
    } catch (error) {
      setOperationError(describeError(error));
      return false;
    } finally {
      submissionCount.current = Math.max(0, submissionCount.current - 1);
      setSubmitting(submissionCount.current > 0);
    }
  };

  const branchReply = async (messageId: string): Promise<void> => {
    const sourceConversationId =
      conversationId ?? (state.kind === 'ready' ? state.projection.conversationId : undefined);
    if (sourceConversationId === undefined) {
      throw new Error('DSH Conversation branch requires an active Conversation.');
    }
    setOperationError(undefined);
    const projection = await window.openNekoDesktop.dshSessions.branch(
      sourceConversationId,
      messageId,
    );
    if (projection.conversationId === sourceConversationId) {
      throw new Error('DSH Conversation branch returned the source Conversation.');
    }
    onConversationBranched?.(projection.conversationId);
  };

  const removeQueuedMessage = async (messageId: string): Promise<void> => {
    const targetConversationId =
      conversationId ?? (state.kind === 'ready' ? state.projection.conversationId : undefined);
    if (!targetConversationId) return;
    setOperationError(undefined);
    try {
      const projection = await window.openNekoDesktop.dshSessions.removeInboxMessage(
        targetConversationId,
        messageId,
      );
      setState((current) =>
        current.kind === 'ready'
          ? requireReadyState(targetConversationId, projection, current.permissions)
          : current,
      );
    } catch (error) {
      setOperationError(describeError(error));
    }
  };

  const sendQueuedMessageNow = async (messageId: string): Promise<void> => {
    const targetConversationId =
      conversationId ?? (state.kind === 'ready' ? state.projection.conversationId : undefined);
    if (!targetConversationId) {
      throw new Error('DSH Inbox send-now requires an exact Conversation identity.');
    }
    setOperationError(undefined);
    try {
      const projection = await window.openNekoDesktop.dshSessions.sendInboxMessageNow(
        targetConversationId,
        messageId,
      );
      setState((current) =>
        current.kind === 'ready'
          ? requireReadyState(targetConversationId, projection, current.permissions)
          : current,
      );
    } catch (error) {
      setOperationError(describeError(error));
    }
  };

  const requestMentions = async (filter: string): Promise<void> => {
    const sequence = ++mentionRequestSequence.current;
    try {
      const mentions = await window.openNekoDesktop.dshSessions.searchComposerMentions(
        workbenchInstanceId,
        agentSurfaceId,
        filter,
      );
      if (sequence !== mentionRequestSequence.current) return;
      setMentionItems(mentions);
      setMentionDiagnostic(undefined);
    } catch (error) {
      if (sequence !== mentionRequestSequence.current) return;
      setMentionItems([]);
      setMentionDiagnostic(describeError(error));
    }
  };

  const materializeAsset = async (assetId: string) => {
    try {
      const materialized = await window.openNekoDesktop.dshSessions.materializeComposerAsset(
        workbenchInstanceId,
        agentSurfaceId,
        assetId,
      );
      setMentionDiagnostic(undefined);
      return materialized;
    } catch (error) {
      setMentionDiagnostic(describeError(error));
      return undefined;
    }
  };

  const cancelTurn = async (): Promise<void> => {
    const targetConversationId =
      conversationId ?? (state.kind === 'ready' ? state.projection.conversationId : undefined);
    if (!targetConversationId) return;
    setOperationError(undefined);
    setSubmitting(true);
    try {
      const projection = await window.openNekoDesktop.dshSessions.cancel(targetConversationId);
      const permissions = await window.openNekoDesktop.dshPermissions.list(targetConversationId);
      setState(requireReadyState(targetConversationId, projection, permissions));
    } catch (error) {
      setOperationError(describeError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const decidePermission = async (
    permission: DshPermissionHostProjection,
    optionId: string,
  ): Promise<void> => {
    setOperationError(undefined);
    try {
      const permissions = await window.openNekoDesktop.dshPermissions.decide(
        projectPermissionIdentity(permission),
        optionId,
      );
      setState((current) =>
        current.kind === 'ready'
          ? requireReadyState(permission.conversationId, current.projection, permissions)
          : current,
      );
    } catch (error) {
      setOperationError(describeError(error));
    }
  };

  const cancelPermission = async (permission: DshPermissionHostProjection): Promise<void> => {
    setOperationError(undefined);
    try {
      const permissions = await window.openNekoDesktop.dshPermissions.cancel(
        projectPermissionIdentity(permission),
      );
      setState((current) =>
        current.kind === 'ready'
          ? requireReadyState(permission.conversationId, current.projection, permissions)
          : current,
      );
    } catch (error) {
      setOperationError(describeError(error));
    }
  };

  const restartRuntime = async (): Promise<void> => {
    setOperationError(undefined);
    setRuntime({ status: 'restarting' });
    try {
      const projection = await window.openNekoDesktop.dshRuntime.restart();
      setRuntime(projection);
      if (projection.status === 'running') await refresh();
    } catch (error) {
      setOperationError(describeError(error));
    }
  };

  const effectiveConversationId =
    conversationId ?? (state.kind === 'ready' ? state.projection.conversationId : undefined);
  useEffect(() => {
    const catalog = composerConfiguration?.context?.canvas;
    if (
      createdCanvas === undefined ||
      catalog?.workspaceId !== createdCanvas.scope.workspaceId ||
      !catalog.options.some(
        (option) => option.target.canvasId === createdCanvas.canvasId && !option.disabled,
      )
    )
      return;
    composerSnapshots.select(createdCanvas.scope, createdCanvas.canvasId);
    setCreatedCanvas(undefined);
  }, [composerConfiguration, composerSnapshots, createdCanvas]);
  const resolveImageAttachmentPreview = useCallback(
    async (attachmentId: string) => {
      if (effectiveConversationId === undefined) {
        throw new Error('DSH image attachment preview requires an exact Conversation.');
      }
      return window.openNekoDesktop.dshSessions.getImageAttachmentPreview(
        effectiveConversationId,
        attachmentId,
      );
    },
    [effectiveConversationId],
  );
  useEffect(
    () => () => {
      if (effectiveConversationId === undefined) return;
      void window.openNekoDesktop.dshSessions
        .releaseImageAttachmentPreviews(effectiveConversationId)
        .catch((error: unknown) => {
          desktopAgentSurfaceLogger.error('Failed to release DSH image attachment previews.', {
            conversationId: effectiveConversationId,
            error,
          });
        });
    },
    [effectiveConversationId],
  );

  return (
    <DshAgentView
      canvasCreationControl={
        onCreateCanvas && composerWorkspaceId ? (
          <WorkspaceQuickCreateControl
            key={composerWorkspaceId}
            variant="canvas-index"
            onCreate={async ({ name }) => {
              const scope = {
                agentSurfaceId,
                workspaceId: composerWorkspaceId,
                ...(effectiveConversationId === undefined
                  ? {}
                  : { conversationId: effectiveConversationId }),
              };
              const canvasId = await onCreateCanvas(name);
              setCreatedCanvas({ scope, canvasId });
              await refreshComposerConfiguration();
            }}
          />
        ) : undefined
      }
      agentSurfaceId={agentSurfaceId}
      conversationFeed={conversationFeed}
      conversationId={effectiveConversationId}
      surfaceKind={surfaceKind}
      entryContext={entryContext}
      initialCharacterCreationHandoff={characterCreationHandoff}
      initialCharacterDialogueHandoff={characterDialogueHandoff}
      initialProjectTemplateHandoff={projectTemplateHandoff}
      initialWorldCreationHandoff={worldCreationHandoff}
      draft={draft}
      composerConfiguration={composerConfiguration}
      composerConfigurationError={composerConfigurationError}
      mentionItems={mentionItems}
      mentionDiagnostic={mentionDiagnostic}
      messageAuthorPresentation={messageAuthorPresentation}
      configuring={configuring}
      errorMessage={operationError ?? (state.kind === 'error' ? state.message : undefined)}
      loading={state.kind === 'loading'}
      permissions={state.kind === 'ready' && runtime?.status === 'running' ? state.permissions : []}
      projection={state.kind === 'ready' ? state.projection : undefined}
      runtime={runtime}
      submitting={submitting}
      onCancelPermission={(permission) => void cancelPermission(permission)}
      onCharacterCreationHandoffConsumed={onCharacterCreationHandoffConsumed}
      onCharacterDialogueHandoffConsumed={onCharacterDialogueHandoffConsumed}
      onProjectTemplateHandoffConsumed={onProjectTemplateHandoffConsumed}
      onWorldCreationHandoffConsumed={onWorldCreationHandoffConsumed}
      onCancelTurn={() => void cancelTurn()}
      onDecidePermission={(permission, optionId) => void decidePermission(permission, optionId)}
      onDraftChange={(value) => {
        setOperationError(undefined);
        setMentionDiagnostic(undefined);
        setDraft(value);
      }}
      onModelChange={(modelOptionId) => void selectModel(modelOptionId)}
      onMediaModelChange={(category, modelOptionId) =>
        void selectMediaModel(category, modelOptionId)
      }
      onPermissionPresetChange={(permissionPresetId) =>
        void selectPermissionPreset(permissionPresetId)
      }
      onSendQueuedMessageNow={(messageId) => void sendQueuedMessageNow(messageId)}
      onRemoveQueuedMessage={(messageId) => void removeQueuedMessage(messageId)}
      onRestartRuntime={() => void restartRuntime()}
      onRequestMentions={(filter) => void requestMentions(filter)}
      onMaterializeAsset={materializeAsset}
      onBranchReply={branchReply}
      onOpenWrittenFile={
        onOpenWrittenFile && effectiveConversationId !== undefined
          ? (toolCallId) => onOpenWrittenFile(effectiveConversationId, toolCallId)
          : undefined
      }
      onResolveImageAttachmentPreview={resolveImageAttachmentPreview}
      onSubmit={submit}
    />
  );
}

function requireReadyState(
  conversationId: string,
  projection: DshSessionHostProjection,
  permissions: readonly DshPermissionHostProjection[],
): Extract<DesktopAgentSurfaceState, { readonly kind: 'ready' }> {
  if (
    projection.conversationId !== conversationId ||
    permissions.some(
      (permission) =>
        permission.conversationId !== conversationId ||
        permission.dshSessionId !== projection.dshSessionId,
    )
  ) {
    throw new Error('DSH Agent projection owner identity does not match.');
  }
  return { kind: 'ready', projection, permissions };
}

function projectPermissionIdentity(
  permission: DshPermissionHostProjection,
): DshPermissionHostIdentity {
  return {
    conversationId: permission.conversationId,
    dshSessionId: permission.dshSessionId,
    turn: permission.turn,
    toolCallId: permission.toolCallId,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
