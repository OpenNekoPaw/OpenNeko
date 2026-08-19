import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  DshPermissionHostIdentity,
  DshPermissionHostProjection,
} from '@neko/agent-contracts/dsh-permission-host';
import type {
  DshComposerConfigurationProjection,
  DshSessionHostProjection,
} from '@neko/agent-contracts/dsh-session-host';
import type { DshRuntimeHostProjection } from '@neko/agent-contracts/dsh-runtime-host';
import {
  DshAgentView,
  type DshEntryContextPresentation,
} from '@neko/agent-webview/dsh-session/root';

export interface DesktopAgentSurfaceProps {
  readonly agentSurfaceId: string;
  readonly workbenchInstanceId: string;
  readonly conversationId?: string;
  readonly surfaceKind: 'entry' | 'assistant' | 'workspace';
  readonly entryContext?: DshEntryContextPresentation;
  readonly conversationFeed?: ReactNode;
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
  conversationFeed,
  conversationId,
  entryContext,
  surfaceKind,
  workbenchInstanceId,
}: DesktopAgentSurfaceProps): JSX.Element {
  const [state, setState] = useState<DesktopAgentSurfaceState>({ kind: 'loading' });
  const [runtime, setRuntime] = useState<DshRuntimeHostProjection>();
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [composerConfiguration, setComposerConfiguration] =
    useState<DshComposerConfigurationProjection>();
  const [composerConfigurationError, setComposerConfigurationError] = useState<string>();
  const [configuring, setConfiguring] = useState(false);
  const refreshSequence = useRef(0);
  const composerRefreshSequence = useRef(0);

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
    try {
      const configuration = await window.openNekoDesktop.dshSessions.getComposerConfiguration(
        workbenchInstanceId,
        agentSurfaceId,
      );
      if (sequence !== composerRefreshSequence.current) return;
      setComposerConfiguration(configuration);
      setComposerConfigurationError(undefined);
    } catch (error) {
      if (sequence !== composerRefreshSequence.current) return;
      setComposerConfigurationError(describeError(error));
    }
  }, [agentSurfaceId, workbenchInstanceId]);

  useEffect(() => {
    let active = true;
    void refreshComposerConfiguration();
    if (conversationId) {
      setState({ kind: 'loading' });
      void refresh();
    } else {
      void window.openNekoDesktop.dshRuntime.getStatus().then(
        (projection) => {
          if (active) setRuntime(projection);
        },
        (error: unknown) => {
          if (active) setState({ kind: 'error', message: describeError(error) });
        },
      );
    }
    const unsubscribeSession = conversationId
      ? window.openNekoDesktop.dshSessions.subscribe((event) => {
          if (event.conversationId === conversationId) void refresh();
        })
      : () => undefined;
    const unsubscribePermissions = conversationId
      ? window.openNekoDesktop.dshPermissions.subscribe((event) => {
          if (event.conversationId === conversationId) void refresh();
        })
      : () => undefined;
    const unsubscribeRuntime = window.openNekoDesktop.dshRuntime.subscribe((projection) => {
      if (!active) return;
      setRuntime(projection);
      if (projection.status === 'running') void refresh();
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
      const configuration =
        await window.openNekoDesktop.dshSessions.selectComposerPermissionPreset(
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
    category: 'image' | 'video' | 'audio',
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

  const submit = async (): Promise<void> => {
    if (submitting) return;
    const text = draft.trim();
    if (text.length === 0) return;
    setSubmitting(true);
    try {
      const permissionPresetId = composerConfiguration?.permissionPresetId;
      if (permissionPresetId === undefined) {
        throw new Error('DSH permission preset is unavailable.');
      }
      const targetConversationId =
        conversationId ??
        (state.kind === 'ready' ? state.projection.conversationId : undefined) ??
        (await window.openNekoDesktop.dshSessions.create(
          workbenchInstanceId,
          agentSurfaceId,
          permissionPresetId,
        ))
          .conversationId;
      const result = await window.openNekoDesktop.dshSessions.prompt(targetConversationId, text);
      const permissions = await window.openNekoDesktop.dshPermissions.list(targetConversationId);
      setDraft('');
      setState(requireReadyState(targetConversationId, result.projection, permissions));
    } catch (error) {
      setState({ kind: 'error', message: describeError(error) });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelTurn = async (): Promise<void> => {
    const targetConversationId =
      conversationId ?? (state.kind === 'ready' ? state.projection.conversationId : undefined);
    if (!targetConversationId || submitting) return;
    setSubmitting(true);
    try {
      const projection = await window.openNekoDesktop.dshSessions.cancel(targetConversationId);
      const permissions = await window.openNekoDesktop.dshPermissions.list(targetConversationId);
      setState(requireReadyState(targetConversationId, projection, permissions));
    } catch (error) {
      setState({ kind: 'error', message: describeError(error) });
    } finally {
      setSubmitting(false);
    }
  };

  const decidePermission = async (
    permission: DshPermissionHostProjection,
    optionId: string,
  ): Promise<void> => {
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
      setState({ kind: 'error', message: describeError(error) });
    }
  };

  const cancelPermission = async (permission: DshPermissionHostProjection): Promise<void> => {
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
      setState({ kind: 'error', message: describeError(error) });
    }
  };

  const restartRuntime = async (): Promise<void> => {
    setRuntime({ status: 'restarting' });
    try {
      const projection = await window.openNekoDesktop.dshRuntime.restart();
      setRuntime(projection);
      if (projection.status === 'running') await refresh();
    } catch (error) {
      setState({ kind: 'error', message: describeError(error) });
    }
  };

  return (
    <DshAgentView
      agentSurfaceId={agentSurfaceId}
      conversationFeed={conversationFeed}
      conversationId={
        conversationId ?? (state.kind === 'ready' ? state.projection.conversationId : undefined)
      }
      surfaceKind={surfaceKind}
      entryContext={entryContext}
      draft={draft}
      composerConfiguration={composerConfiguration}
      composerConfigurationError={composerConfigurationError}
      configuring={configuring}
      errorMessage={state.kind === 'error' ? state.message : undefined}
      loading={state.kind === 'loading'}
      permissions={state.kind === 'ready' && runtime?.status === 'running' ? state.permissions : []}
      projection={state.kind === 'ready' ? state.projection : undefined}
      runtime={runtime}
      submitting={submitting}
      onCancelPermission={(permission) => void cancelPermission(permission)}
      onCancelTurn={() => void cancelTurn()}
      onDecidePermission={(permission, optionId) => void decidePermission(permission, optionId)}
      onDraftChange={setDraft}
      onModelChange={(modelOptionId) => void selectModel(modelOptionId)}
      onMediaModelChange={(category, modelOptionId) =>
        void selectMediaModel(category, modelOptionId)
      }
      onPermissionPresetChange={(permissionPresetId) =>
        void selectPermissionPreset(permissionPresetId)
      }
      onRestartRuntime={() => void restartRuntime()}
      onSubmit={() => void submit()}
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
