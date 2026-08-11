import {
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  ContextMenu,
  ControlledWorkbenchShell,
  FolderIcon,
  GridIcon,
  IconButton,
  LoadingIcon,
  MessageIcon,
  OpenIcon,
  PackageIcon,
  Popover,
  PlusIcon,
  RemoveIcon,
  SearchIcon,
  SettingsIcon,
  Tooltip,
  TooltipProvider,
  TrashIcon,
  UserIcon,
  UsersIcon,
  WarningIcon,
  WorkbenchEditorTabs,
  toCodiconClassName,
  type ControlledWorkbenchResizeBinding,
  type ControlledWorkbenchShellProps,
  type ContextMenuItem,
} from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type {
  DesktopAgentHomeConversationSummary,
  DesktopConversationNavigationGroup,
  DesktopProjectCatalogItem,
  DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import { resolveActiveDesktopWindowWorkbench } from '@neko/host/desktop-shell-contract';
import {
  DESKTOP_WORKBENCH_LIMITS,
  closeMainView,
  openOrFocusCutView,
  openOrFocusMainView,
  reorderCutView,
  reorderMainView,
  resizeCutPanel,
  setCutPanelPresentation,
  setWorkbenchDisplayMode,
  type DesktopWorkbenchLayoutProjection,
  type DesktopWorkbenchMainGroup,
  type DesktopWorkbenchViewRef,
} from '@neko/host/desktop-workbench-contract';
import { createCutHostSessionId } from '@neko/cut-domain';
import { TEXT_EDITOR_HOST_ROUTES } from '@neko/text-editor-domain';
import {
  DESKTOP_APPLICATION_SIDEBAR_WIDTH_LIMITS,
  type DesktopAgentInteractionSurfaceRef,
  type DesktopApplicationSidebarProjection,
  type DesktopCreativeManagementCatalog,
  type DesktopCharacterPresentationSurfaceRef,
  type DesktopSceneTransitionIntent,
  type DesktopWorkbenchMainSurfaceRef,
  type DesktopWorkbenchSceneProjection,
} from '@neko/host/desktop-scene-contract';
import { DesktopCharacterPresentationSurfaceRegistry } from '@neko/host/character-presentation-surface-registry';
import { DesktopAgentSurface, type DesktopAgentSurfaceProps } from './DesktopAgentSurface';
import { DesktopResourceBrowserSurface } from './DesktopResourceBrowserSurface';
import { DesktopPreviewSurface } from './DesktopPreviewSurface';
import { DesktopTextEditorSurface } from './DesktopTextEditorSurface';
import { DesktopCanvasSurface } from './DesktopCanvasSurface';
import { DesktopCutSurface } from './DesktopCutSurface';
import {
  DesktopSettingsMainSurface,
  DesktopSettingsNavigationSurface,
  parseDesktopSettingsSection,
} from './DesktopSettingsSurface';
import { DesktopAssetManagementSurface } from './DesktopAssetManagementSurface';
import { DesktopExtensionManagementSurface } from './DesktopExtensionManagementSurface';
import { DesktopExtensionManagementRuntime } from './desktop-extension-management-runtime';
import { WorkbenchMainPanelSurface } from './WorkbenchMainPanelSurface';
import {
  ProjectAuthoringTargetSwitchRoot,
  ProjectCatalogRoot,
  type ProjectWritableNavigationItem,
} from '@neko/project-webview/root';
import type { ProjectAuthoringPresentationSnapshotRef } from '@neko/project/contracts';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterAuthoringSnapshot,
  type CharacterDefinition,
} from '@neko/chara/contracts';
import type { WorldAuthoringSnapshot, WorldDefinition } from '@neko/world/contracts';
import { DesktopAssetCenterMainSurface } from './DesktopAssetCenterMainSurface';
import { DesktopAssistantPreviewSurface } from './DesktopAssistantPreviewSurface';
import { DesktopAssetCenterRuntime } from './desktop-asset-center-runtime';
import type { AssetCenterSessionProjection } from '@neko/assets-domain/asset-center/contract';
import { useDesktopApplicationSettings } from './application-settings-context';
import { ProjectPortabilityDialog } from '@neko/assets-webview/project-portability/control';
import type { OpenNekoDesktopProjectPortabilityBridge } from '@neko/assets-domain/contracts';
import {
  DesktopApplicationBrand,
  DesktopApplicationNavigationButton,
} from './DesktopApplicationSidebar';
import {
  createAgentDraftInteraction,
  createAgentSessionInteraction,
  type AgentInteractionProjection,
} from '@neko/agent-contracts';
import type { DesktopWindowCompositionProjection } from '@neko/host/desktop-window-composition-contract';
import { DesktopSurfaceErrorBoundary } from './DesktopSurfaceErrorBoundary';
import {
  CharacterCatalogSurface,
  CharacterDetailSurface,
  CharacterAuthoringStudioRoot,
  CharacterCompanionContinuitySurface,
  CharacterRoomInteractionFeed,
  CharacterRoomTimelineSurface as CharacterRoomTimelineProjectionSurface,
  CharacterStorylineTimelineSurface,
  projectCharacterRoomIdentity,
  type CharacterManagementRuntime,
  useCharacterManagementRuntime,
  useCharacterRoomWorkbenchRuntime,
} from '@neko/chara-webview/root';
import { VrmAvatarSurface } from '@neko/chara-webview/avatar';
import '@neko/chara-webview/style.css';
import {
  WorldAuthoringStudioRoot,
  WorldCatalogSurface,
  WorldDetailSurface,
  useWorldManagementRuntime,
} from '@neko/world-webview/root';
import '@neko/world-webview/style.css';

type ShellState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly projection: DesktopShellProjection }
  | { readonly kind: 'error'; readonly message: string };

type HomeSection = 'create' | 'characters' | 'worlds' | 'assets' | 'extensions' | 'projects';
type TranslationFunction = ReturnType<typeof useTranslation>['t'];
type RetainedMetadataDiagnostic = Extract<
  NonNullable<DesktopShellProjection['stateDiagnostics']>[number],
  { readonly code: 'desktop-stored-state-metadata-retained' }
>;

interface ShellDiagnosticPresentation {
  readonly key: string;
  readonly message: string;
  readonly title: string;
}

export const MANAGEMENT_MAIN_SPLIT_DEFAULT_RATIO = 0.5;
export const MANAGEMENT_MAIN_SPLIT_MIN_RATIO = 0.5;
const SHELL_DIAGNOSTIC_DURATION_MS = 6_000;

type DesktopShellPendingScope =
  'scene' | 'workbench' | 'navigation' | 'sidebar' | 'target-selection';

export interface DesktopShellPendingProjection {
  readonly scene: boolean;
  readonly workbench: boolean;
  readonly navigation: boolean;
  readonly sidebar: boolean;
  readonly targetSelection: boolean;
}

export interface DesktopShellInteractionLocks {
  readonly workbench: boolean;
  readonly navigation: boolean;
  readonly sidebar: boolean;
  readonly targetSelection: boolean;
}

const EMPTY_DESKTOP_SHELL_PENDING: DesktopShellPendingProjection = {
  scene: false,
  workbench: false,
  navigation: false,
  sidebar: false,
  targetSelection: false,
};

function projectDesktopShellPending(
  counts: ReadonlyMap<DesktopShellPendingScope, number>,
): DesktopShellPendingProjection {
  return {
    scene: counts.has('scene'),
    workbench: counts.has('workbench'),
    navigation: counts.has('navigation'),
    sidebar: counts.has('sidebar'),
    targetSelection: counts.has('target-selection'),
  };
}

export function projectDesktopShellInteractionLocks(
  pending: DesktopShellPendingProjection,
): DesktopShellInteractionLocks {
  return {
    workbench: pending.scene || pending.workbench,
    navigation: pending.scene || pending.navigation,
    sidebar: pending.scene || pending.sidebar,
    targetSelection: pending.scene || pending.targetSelection,
  };
}

interface ShellActions {
  readonly onSelectProject: (projectId: string) => void;
  readonly onOpenWorkspaceDirectory: () => void;
  readonly onOpenConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onDeleteConversations: (
    conversations: readonly DesktopAgentHomeConversationSummary[],
  ) => void;
  readonly onRemoveProjects: (projects: readonly DesktopProjectCatalogItem[]) => void;
  readonly onDeleteProjectConversations: (projects: readonly DesktopProjectCatalogItem[]) => void;
  readonly onUpdateWorkbench: (
    workbenchInstanceId: string,
    workbench: DesktopWorkbenchLayoutProjection,
  ) => void;
  readonly onCreateCutDraft: (workbenchInstanceId: string) => void;
  readonly onCloseCutView: (workbenchInstanceId: string, view: DesktopWorkbenchViewRef) => void;
  readonly onCloseWorkbenchView: (
    workbenchInstanceId: string,
    workbench: DesktopWorkbenchLayoutProjection,
    view: DesktopWorkbenchViewRef,
  ) => void;
  readonly onUpdateApplicationSidebar: (sidebar: DesktopApplicationSidebarProjection) => void;
  readonly onTransitionScene: (intent: DesktopSceneTransitionIntent) => void;
  readonly onChooseWorkspaceTarget: () => Promise<
    import('@neko/agent-webview/root').AgentComposerWorkspaceTarget | undefined
  >;
  readonly onSelectWorkspaceProjectTarget: (
    projectId: string,
  ) => Promise<import('@neko/agent-webview/root').AgentComposerWorkspaceTarget | undefined>;
  readonly onLoadAuthoringTargets: () => Promise<
    import('@neko/agent-webview/root').AgentComposerAuthoringCatalog
  >;
  readonly onSelectAuthoringTarget: (
    option: import('@neko/agent-webview/root').AgentComposerAuthoringTargetOption,
  ) => Promise<import('@neko/agent-webview/root').AgentComposerWorkspaceTarget | undefined>;
  readonly onCreateAuthoringTarget: (
    context: import('@neko/agent-webview/root').AgentComposerAuthoringCreationContext,
    name: string,
  ) => Promise<import('@neko/agent-webview/root').AgentComposerWorkspaceTarget | undefined>;
}

export function DesktopApplication(): JSX.Element {
  const { locale, t } = useTranslation();
  const [state, setState] = useState<ShellState>({ kind: 'loading' });
  const [pending, setPending] = useState<DesktopShellPendingProjection>(
    EMPTY_DESKTOP_SHELL_PENDING,
  );
  const pendingScopeCounts = useRef(new Map<DesktopShellPendingScope, number>());
  const [diagnostic, setDiagnostic] = useState<string>();
  const [startupMetadataDiagnostic, setStartupMetadataDiagnostic] =
    useState<RetainedMetadataDiagnostic>();
  const [dismissedPersistedDiagnosticKey, setDismissedPersistedDiagnosticKey] = useState<string>();
  const lastSequence = useRef<number | null>(null);
  const textEditorCloseRequestOrdinal = useRef(0);
  const rendererSessionId = useRef<string>();
  const loadingRendererSessionId = useRef<string>();
  const pendingProjectionRequest = useRef<object>();
  const startupProjectionCaptured = useRef(false);

  const captureStartupMetadataDiagnostic = useCallback((projection: DesktopShellProjection) => {
    if (startupProjectionCaptured.current) return;
    startupProjectionCaptured.current = true;
    setStartupMetadataDiagnostic(
      projection.stateDiagnostics?.find(
        (candidate): candidate is RetainedMetadataDiagnostic =>
          candidate.code === 'desktop-stored-state-metadata-retained',
      ),
    );
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (loadingRendererSessionId.current) return;
    const request = {};
    pendingProjectionRequest.current = request;
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    if (pendingProjectionRequest.current !== request) return;
    rendererSessionId.current = projection.rendererSessionId;
    pendingProjectionRequest.current = undefined;
    lastSequence.current = null;
    captureStartupMetadataDiagnostic(projection);
    setState({ kind: 'ready', projection });
  }, [captureStartupMetadataDiagnostic]);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.openNekoDesktop.shell.subscribe((event) => {
      if (!active) return;
      pendingProjectionRequest.current = undefined;
      if (loadingRendererSessionId.current) return;
      if (
        rendererSessionId.current &&
        event.projection.rendererSessionId !== rendererSessionId.current
      ) {
        setState({ kind: 'error', message: t('shell.endpointChanged') });
        void refresh().catch((error: unknown) => {
          if (active) setState({ kind: 'error', message: describeError(error) });
        });
        return;
      }
      const previousSequence = lastSequence.current;
      if (previousSequence !== null && event.sequence !== previousSequence + 1) {
        setState({ kind: 'error', message: t('shell.sequenceChanged') });
        void refresh().catch((error: unknown) => {
          if (active) setState({ kind: 'error', message: describeError(error) });
        });
        return;
      }
      rendererSessionId.current = event.projection.rendererSessionId;
      lastSequence.current = event.sequence;
      captureStartupMetadataDiagnostic(event.projection);
      setState({ kind: 'ready', projection: event.projection });
    });
    void refresh().catch((error: unknown) => {
      if (active) setState({ kind: 'error', message: describeError(error) });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [captureStartupMetadataDiagnostic, refresh, t]);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.openNekoDesktop.lifecycle.subscribe((event) => {
      if (!active) return;
      if (event.type === 'renderer-loading') {
        loadingRendererSessionId.current = event.rendererSessionId;
        rendererSessionId.current = event.rendererSessionId;
        pendingProjectionRequest.current = undefined;
        lastSequence.current = null;
        setState({ kind: 'loading' });
        return;
      }
      if (
        event.type !== 'renderer-ready' ||
        loadingRendererSessionId.current !== event.rendererSessionId
      ) {
        return;
      }
      loadingRendererSessionId.current = undefined;
      void refresh().catch((error: unknown) => {
        if (active) setState({ kind: 'error', message: describeError(error) });
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [refresh]);

  const persistedDiagnostic = useMemo(
    () =>
      state.kind === 'ready'
        ? createPersistedDiagnosticPresentation(state.projection, t)
        : undefined,
    [state, t],
  );
  const persistedDiagnosticKey = persistedDiagnostic?.key;

  const beginPending = useCallback((scope: DesktopShellPendingScope): (() => void) => {
    const counts = pendingScopeCounts.current;
    counts.set(scope, (counts.get(scope) ?? 0) + 1);
    setPending(projectDesktopShellPending(counts));
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      const count = counts.get(scope);
      if (count === undefined) {
        throw new Error(`Desktop Shell pending scope '${scope}' is not active.`);
      }
      if (count === 1) counts.delete(scope);
      else counts.set(scope, count - 1);
      setPending(projectDesktopShellPending(counts));
    };
  }, []);

  useEffect(() => {
    if (!startupMetadataDiagnostic) return;
    const timeout = window.setTimeout(
      () => setStartupMetadataDiagnostic(undefined),
      SHELL_DIAGNOSTIC_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [startupMetadataDiagnostic]);

  useEffect(() => {
    if (!diagnostic) return;
    const timeout = window.setTimeout(() => setDiagnostic(undefined), SHELL_DIAGNOSTIC_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [diagnostic]);

  useEffect(() => {
    if (!persistedDiagnosticKey || persistedDiagnosticKey === dismissedPersistedDiagnosticKey)
      return;
    const timeout = window.setTimeout(
      () => setDismissedPersistedDiagnosticKey(persistedDiagnosticKey),
      SHELL_DIAGNOSTIC_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [dismissedPersistedDiagnosticKey, persistedDiagnosticKey]);

  const runMutation = useCallback(
    async (
      scope: DesktopShellPendingScope,
      operation: () => Promise<DesktopShellProjection>,
    ): Promise<void> => {
      const finishPending = beginPending(scope);
      setDiagnostic(undefined);
      try {
        const request = {};
        pendingProjectionRequest.current = request;
        const projection = await operation();
        if (rendererSessionId.current !== projection.rendererSessionId) {
          throw new Error(t('shell.staleCommand'));
        }
        if (pendingProjectionRequest.current === request) {
          pendingProjectionRequest.current = undefined;
          setState({ kind: 'ready', projection });
        }
      } catch (error: unknown) {
        setDiagnostic(describeError(error));
        await refresh();
      } finally {
        finishPending();
      }
    },
    [beginPending, refresh, t],
  );

  if (state.kind === 'loading') {
    return <ShellStatus title={t('app.name')} message={t('shell.connecting')} />;
  }
  if (state.kind === 'error') {
    return <ShellStatus title={t('shell.unavailable')} message={state.message} error />;
  }

  const projection = state.projection;
  const visiblePersistedDiagnostic =
    persistedDiagnostic?.key === dismissedPersistedDiagnosticKey ? undefined : persistedDiagnostic;
  const startupMetadataMessage = startupMetadataDiagnostic
    ? t(
        startupMetadataDiagnostic.authorityKey === 'desktop.application-settings'
          ? 'shell.settingsMetadataRetained'
          : 'shell.workspaceMetadataRetained',
        { fields: startupMetadataDiagnostic.fieldNames.join(', ') },
      )
    : undefined;
  const visibleDiagnostic =
    diagnostic ?? visiblePersistedDiagnostic?.message ?? startupMetadataMessage;
  const activeWorkbench = resolveActiveDesktopWindowWorkbench(projection.window);
  const transitionScene = (intent: DesktopSceneTransitionIntent): void => {
    const finishPending = beginPending('scene');
    setDiagnostic(undefined);
    void window.openNekoDesktop.scenes
      .transition(projection.window.windowId, intent, activeWorkbench.scene.sceneId)
      .then((result) => {
        if (result.status !== 'transitioned') {
          setDiagnostic(result.diagnostic.message);
        }
      })
      .catch(async (error: unknown) => {
        setDiagnostic(describeError(error));
        await refresh();
      })
      .finally(finishPending);
  };
  const actions: ShellActions = {
    onSelectProject: (projectId) => transitionScene({ kind: 'open-project-workspace', projectId }),
    onOpenWorkspaceDirectory: () => {
      const finishPending = beginPending('navigation');
      setDiagnostic(undefined);
      void window.openNekoDesktop.workspaceGrants
        .chooseDirectory(projection.window.windowId)
        .then((result) => {
          if (result.status === 'cancelled') return;
          transitionScene({
            kind: 'open-workspace',
            workspaceGrantId: result.grant.workspaceGrantId,
          });
        })
        .catch(async (error: unknown) => {
          setDiagnostic(describeError(error));
          await refresh();
        })
        .finally(finishPending);
    },
    onOpenConversation: (conversation) =>
      transitionScene({
        kind: 'restore-conversation',
        navigation: conversation.navigation,
      }),
    onDeleteConversations: (conversations) => {
      if (conversations.length === 0) {
        throw new Error('At least one Conversation is required for deletion.');
      }
      const confirmation =
        conversations.length === 1 && conversations[0]
          ? t('shell.deleteConversationConfirm', { conversation: conversations[0].title })
          : t('shell.deleteConversationsConfirm', { count: conversations.length });
      if (!globalThis.confirm(confirmation)) {
        return;
      }
      void runMutation('navigation', () =>
        window.openNekoDesktop.conversations.delete(
          conversations.map((conversation) => conversation.navigation),
        ),
      );
    },
    onRemoveProjects: (projects) => {
      if (projects.length === 0) {
        throw new Error('At least one Project is required for removal.');
      }
      const confirmation =
        projects.length === 1 && projects[0]
          ? t('shell.removeProjectConfirm', { project: projects[0].displayName })
          : t('shell.removeProjectsConfirm', { count: projects.length });
      if (!globalThis.confirm(confirmation)) {
        return;
      }
      void runMutation('navigation', () =>
        window.openNekoDesktop.projects.remove(projects.map((project) => project.projectId)),
      );
    },
    onDeleteProjectConversations: (projects) => {
      if (projects.length === 0) {
        throw new Error('At least one Project is required for conversation cleanup.');
      }
      const conversationCount = projects.reduce(
        (count, project) =>
          count +
          projection.agentHome.conversations.filter(
            (conversation) =>
              conversation.navigation.owner.kind === 'workspace' &&
              conversation.navigation.owner.workspaceId === project.workspaceId,
          ).length,
        0,
      );
      if (conversationCount === 0) {
        throw new Error('Selected Projects have no Workspace conversations to delete.');
      }
      const confirmation =
        projects.length === 1 && projects[0]
          ? t('shell.deleteProjectConversationsConfirm', {
              project: projects[0].displayName,
              count: conversationCount,
            })
          : t('shell.deleteProjectsConversationsConfirm', {
              projectCount: projects.length,
              conversationCount,
            });
      if (!globalThis.confirm(confirmation)) return;
      void runMutation('navigation', () =>
        window.openNekoDesktop.projects.deleteConversations(
          projects.map((project) => project.projectId),
        ),
      );
    },
    onUpdateWorkbench: (workbenchInstanceId, workbench) => {
      if (projection.window.workbench.workbenchInstanceId !== workbenchInstanceId) {
        throw new Error(`Desktop Workbench '${workbenchInstanceId}' is unavailable.`);
      }
      void runMutation('workbench', () =>
        window.openNekoDesktop.workbench.update(workbenchInstanceId, workbench),
      );
    },
    onCreateCutDraft: (workbenchInstanceId) => {
      void runMutation('workbench', async () => {
        const result = await window.openNekoDesktop.cut.createDraft({
          requestId: `cut-draft-create:${globalThis.crypto.randomUUID()}`,
          windowId: projection.window.windowId,
          rendererSessionId: projection.rendererSessionId,
          workbenchInstanceId,
        });
        return result.projection;
      });
    },
    onCloseCutView: (workbenchInstanceId, view) => {
      if (!view.documentId) throw new Error('Desktop Cut close requires a document identity.');
      const documentId = view.documentId;
      void runMutation('workbench', async () => {
        const result = await window.openNekoDesktop.cut.closeView({
          requestId: `cut-view-close:${globalThis.crypto.randomUUID()}`,
          windowId: projection.window.windowId,
          rendererSessionId: projection.rendererSessionId,
          workbenchInstanceId,
          identity: {
            projectId: view.projectId,
            workspaceId: view.workspaceId,
            windowId: projection.window.windowId,
            viewId: view.viewId,
            viewInstanceId: view.viewInstanceId,
            documentId,
            sessionId: createCutHostSessionId(view.viewId, view.viewInstanceId),
            rendererSessionId: projection.rendererSessionId,
          },
        });
        return result.projection;
      });
    },
    onCloseWorkbenchView: (workbenchInstanceId, workbench, view) => {
      if (view.kind !== 'text-editor') {
        if (projection.window.workbench.workbenchInstanceId !== workbenchInstanceId) {
          throw new Error(`Desktop Workbench '${workbenchInstanceId}' is unavailable.`);
        }
        void runMutation('workbench', () =>
          window.openNekoDesktop.workbench.update(
            workbenchInstanceId,
            closeMainView(workbench, view.viewId),
          ),
        );
        return;
      }
      const project = projection.catalog.projects.find(
        (candidate) =>
          candidate.projectId === view.projectId && candidate.workspaceId === view.workspaceId,
      );
      if (!project || !view.documentId || !view.editorSessionId) {
        throw new Error(`Desktop Text Editor View '${view.viewId}' has incomplete identity.`);
      }
      textEditorCloseRequestOrdinal.current += 1;
      const identity = {
        projectId: project.projectId,
        workspaceId: project.workspaceId,
        windowId: projection.window.windowId,
        viewId: view.viewId,
        viewInstanceId: view.viewInstanceId,
        documentId: view.documentId,
        sessionId: view.editorSessionId,
        rendererSessionId: projection.rendererSessionId,
      };
      const requestPrefix = `desktop-text-editor:close:${textEditorCloseRequestOrdinal.current}`;
      const finishPending = beginPending('workbench');
      setDiagnostic(undefined);
      void window.openNekoDesktop.textEditor
        .execute({
          route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
          requestId: `${requestPrefix}:projection`,
          identity,
        })
        .then(async (result) => {
          if (result.status === 'rejected') throw new Error(result.diagnostic.code);
          if (result.status !== 'ready') {
            throw new Error('Desktop Text Editor close requires a ready projection.');
          }
          let decision: 'save' | 'discard' | 'cancel' = 'discard';
          if (result.projection.dirty) {
            if (globalThis.confirm(t('workspace.textEditorCloseSave'))) {
              decision = 'save';
            } else if (globalThis.confirm(t('workspace.textEditorCloseDiscard'))) {
              decision = 'discard';
            } else {
              decision = 'cancel';
            }
          }
          if (decision === 'cancel') return;
          const closed = await window.openNekoDesktop.textEditor.execute({
            route: TEXT_EDITOR_HOST_ROUTES.close,
            requestId: `${requestPrefix}:decision`,
            identity,
            decision,
          });
          if (closed.status === 'rejected') throw new Error(closed.diagnostic.code);
          if (closed.status === 'cancelled') return;
          await refresh();
        })
        .catch(async (error: unknown) => {
          setDiagnostic(describeError(error));
          await refresh();
        })
        .finally(finishPending);
    },
    onUpdateApplicationSidebar: (sidebar) =>
      void runMutation('sidebar', () =>
        window.openNekoDesktop.applicationSidebar.update(
          sidebar.windowId,
          sidebar.visible,
          sidebar.width,
        ),
      ),
    onTransitionScene: transitionScene,
    onChooseWorkspaceTarget: async () => {
      const finishPending = beginPending('target-selection');
      setDiagnostic(undefined);
      try {
        const result = await window.openNekoDesktop.workspaceGrants.chooseDirectory(
          projection.window.windowId,
        );
        if (result.status === 'cancelled') return undefined;
        return {
          label: result.grant.label,
          context: {
            kind: 'workspace' as const,
            workspaceId: result.workspaceId,
            workspaceGrantId: result.grant.workspaceGrantId,
          },
        };
      } catch (error: unknown) {
        setDiagnostic(describeError(error));
        await refresh();
        return undefined;
      } finally {
        finishPending();
      }
    },
    onSelectWorkspaceProjectTarget: async (projectId) => {
      const finishPending = beginPending('target-selection');
      setDiagnostic(undefined);
      try {
        const result = await window.openNekoDesktop.workspaceGrants.selectProject(
          projection.window.windowId,
          projectId,
        );
        if (result.status === 'cancelled') return undefined;
        return {
          label: result.grant.label,
          context: {
            kind: 'workspace' as const,
            workspaceId: result.workspaceId,
            workspaceGrantId: result.grant.workspaceGrantId,
          },
          target: {
            kind: 'content-project' as const,
            contentProjectId: projectId,
          },
        };
      } catch (error: unknown) {
        setDiagnostic(describeError(error));
        await refresh();
        return undefined;
      } finally {
        finishPending();
      }
    },
    onLoadAuthoringTargets: async () => {
      const diagnostics: string[] = [];
      const targets: import('@neko/agent-webview/root').AgentComposerAuthoringTargetOption[] =
        projection.catalog.projects
          .filter((project) => !project.unavailable)
          .map((project) => ({
            optionId: `content-project:${project.projectId}`,
            label: project.displayName,
            workspaceLabel: t('home.allProjects'),
            target: { kind: 'content-project' as const, contentProjectId: project.projectId },
            placement: {
              kind: 'content-project' as const,
              contentProjectId: project.projectId,
            },
          }));
      const [characterResult, worldResult, projectCatalogResult] = await Promise.allSettled([
        window.openNekoDesktop.characterFoundation.getSnapshot(),
        window.openNekoDesktop.worldFoundation.getSnapshot(),
        window.openNekoDesktop.projectAuthoring.getCatalog(projection.window.windowId),
      ]);
      if (characterResult.status === 'fulfilled') {
        targets.push(
          ...characterResult.value.character.projects.map((project) => ({
            optionId: `standalone-character:${project.characterProjectId}`,
            label: project.displayName,
            workspaceLabel: t('home.characters'),
            target: {
              kind: 'character-project' as const,
              characterProjectId: project.characterProjectId,
            },
            placement: { kind: 'standalone-library' as const, library: 'character' as const },
          })),
        );
        diagnostics.push(
          ...characterResult.value.diagnostics.map(
            (item) => `Character ${item.recordKind} '${item.recordId}': ${item.message}`,
          ),
        );
      } else {
        diagnostics.push(`Character: ${describeError(characterResult.reason)}`);
      }
      if (worldResult.status === 'fulfilled') {
        targets.push(
          ...worldResult.value.world.projects.map((project) => ({
            optionId: `standalone-world:${project.worldProjectId}`,
            label: project.title,
            workspaceLabel: t('home.worlds'),
            target: { kind: 'world-project' as const, worldProjectId: project.worldProjectId },
            placement: { kind: 'standalone-library' as const, library: 'world' as const },
          })),
        );
        diagnostics.push(
          ...worldResult.value.diagnostics.map(
            (item) => `World ${item.recordKind} '${item.recordId}': ${item.message}`,
          ),
        );
      } else {
        diagnostics.push(`World: ${describeError(worldResult.reason)}`);
      }
      if (projectCatalogResult.status === 'fulfilled') {
        const projectCatalog = projectCatalogResult.value;
        targets.push(
          ...projectCatalog.projects.flatMap((project) =>
            project.navigation.flatMap((item) => {
              if (item.kind !== 'authoring-target' || item.target.kind === 'content-project') {
                return [];
              }
              return [
                {
                  optionId: `${project.contentProjectId}:${item.identity}`,
                  label: item.label,
                  workspaceLabel: project.label,
                  target: item.target,
                  placement: {
                    kind: 'project-local' as const,
                    contentProjectId: project.contentProjectId,
                  },
                  ...(item.diagnostic ? { disabled: true } : {}),
                },
              ];
            }),
          ),
        );
        diagnostics.push(
          ...projectCatalog.diagnostics.map(
            (item) => `Project '${item.contentProjectId}': ${item.message}`,
          ),
          ...projectCatalog.projects.flatMap((project) =>
            project.navigation.flatMap((item) =>
              item.diagnostic ? [`${project.label} / ${item.identity}: ${item.diagnostic}`] : [],
            ),
          ),
        );
      } else {
        diagnostics.push(`Projects: ${describeError(projectCatalogResult.reason)}`);
      }
      return {
        targets,
        creationContexts: [
          {
            creationId: 'content-project',
            label: `${t('home.allProjects')} / ${locale === 'zh-cn' ? '新建' : 'New'}`,
            targetKind: 'content-project' as const,
            placement: { kind: 'new-content-project' as const },
          },
          {
            creationId: 'standalone-character',
            label: `${t('home.characters')} / ${locale === 'zh-cn' ? '新建' : 'New'}`,
            targetKind: 'character-project' as const,
            placement: { kind: 'standalone-library' as const, library: 'character' as const },
          },
          {
            creationId: 'standalone-world',
            label: `${t('home.worlds')} / ${locale === 'zh-cn' ? '新建' : 'New'}`,
            targetKind: 'world-project' as const,
            placement: { kind: 'standalone-library' as const, library: 'world' as const },
          },
          ...projection.catalog.projects.flatMap((project) =>
            project.unavailable
              ? []
              : [
                  {
                    creationId: `${project.projectId}:character`,
                    label: `${project.displayName} / ${t('home.characters')}`,
                    targetKind: 'character-project' as const,
                    placement: {
                      kind: 'project-local' as const,
                      contentProjectId: project.projectId,
                    },
                  },
                  {
                    creationId: `${project.projectId}:world`,
                    label: `${project.displayName} / ${t('home.worlds')}`,
                    targetKind: 'world-project' as const,
                    placement: {
                      kind: 'project-local' as const,
                      contentProjectId: project.projectId,
                    },
                  },
                ],
          ),
        ],
        diagnostics,
      };
    },
    onSelectAuthoringTarget: async (option) => {
      const result =
        option.placement.kind === 'standalone-library'
          ? await window.openNekoDesktop.workspaceGrants.selectAuthoringLibrary(
              projection.window.windowId,
              option.placement.library,
            )
          : await window.openNekoDesktop.workspaceGrants.selectProject(
              projection.window.windowId,
              option.placement.contentProjectId,
            );
      if (result.status === 'cancelled') return undefined;
      return {
        label: `${option.workspaceLabel} / ${option.label}`,
        context: {
          kind: 'workspace' as const,
          workspaceId: result.workspaceId,
          workspaceGrantId: result.grant.workspaceGrantId,
        },
        target: option.target,
      };
    },
    onCreateAuthoringTarget: async (context, name) => {
      if (context.placement.kind === 'new-content-project') {
        if (context.targetKind !== 'content-project') {
          throw new Error('Content Project creation context target kind mismatch.');
        }
        const created = await window.openNekoDesktop.workspaceGrants.createContentProject(
          projection.window.windowId,
        );
        if (created.status === 'cancelled') return undefined;
        if (created.status !== 'authorized-project') {
          throw new Error(`Content Project creation returned '${created.status}'.`);
        }
        return {
          label: created.grant.label,
          context: {
            kind: 'workspace' as const,
            workspaceId: created.workspaceId,
            workspaceGrantId: created.grant.workspaceGrantId,
          },
          target: {
            kind: 'content-project' as const,
            contentProjectId: created.projectId,
          },
        };
      }
      if (context.targetKind === 'content-project') {
        throw new Error('Content Project creation requires its exact creation placement.');
      }
      const targetId = `${context.targetKind}:${crypto.randomUUID()}`;
      const result =
        context.placement.kind === 'standalone-library'
          ? await window.openNekoDesktop.workspaceGrants.selectAuthoringLibrary(
              projection.window.windowId,
              context.placement.library,
            )
          : await window.openNekoDesktop.workspaceGrants.selectProject(
              projection.window.windowId,
              context.placement.contentProjectId,
            );
      if (result.status === 'cancelled') return undefined;
      const target =
        context.targetKind === 'character-project'
          ? { kind: 'character-project' as const, characterProjectId: targetId }
          : { kind: 'world-project' as const, worldProjectId: targetId };
      if (context.placement.kind === 'standalone-library') {
        if (context.targetKind === 'character-project') {
          await window.openNekoDesktop.characterFoundation.execute({
            operation: 'character-project-create',
            input: {
              characterProjectId: targetId,
              displayName: name,
              draft: emptyCharacterDefinition(),
            },
          });
        } else {
          await window.openNekoDesktop.worldFoundation.execute({
            operation: 'world-project-create',
            input: { worldProjectId: targetId, title: name, draft: emptyWorldDefinition() },
          });
        }
      } else {
        await window.openNekoDesktop.projectLocalAuthoring.createTarget(
          projection.window.windowId,
          {
            workspaceId: result.workspaceId,
            workspaceGrantId: result.grant.workspaceGrantId,
            contentProjectId: context.placement.contentProjectId,
          },
          context.targetKind === 'character-project'
            ? {
                kind: 'character-project',
                characterProjectId: targetId,
                displayName: name,
                draft: emptyCharacterDefinition(),
              }
            : {
                kind: 'world-project',
                worldProjectId: targetId,
                title: name,
                draft: emptyWorldDefinition(),
              },
        );
      }
      return {
        label: `${result.grant.label} / ${name}`,
        context: {
          kind: 'workspace' as const,
          workspaceId: result.workspaceId,
          workspaceGrantId: result.grant.workspaceGrantId,
        },
        target,
      };
    },
  };

  return (
    <TooltipProvider>
      <div className="desktop-shell">
        {visibleDiagnostic ? (
          <div
            className="shell-diagnostic"
            role="alert"
            title={
              diagnostic === undefined
                ? (visiblePersistedDiagnostic?.title ?? startupMetadataDiagnostic?.message)
                : undefined
            }
          >
            <WarningIcon size={15} />
            <span>{visibleDiagnostic}</span>
            <IconButton
              className="shell-diagnostic__dismiss"
              icon={<CloseIcon size={14} />}
              label={t('shell.dismissNotification')}
              title={t('shell.dismissNotification')}
              onClick={() => {
                if (diagnostic !== undefined) {
                  setDiagnostic(undefined);
                } else if (visiblePersistedDiagnostic) {
                  setDismissedPersistedDiagnosticKey(visiblePersistedDiagnostic.key);
                } else {
                  setStartupMetadataDiagnostic(undefined);
                }
              }}
            />
          </div>
        ) : null}
        <DesktopSceneWorkbench
          actions={actions}
          pending={pending}
          projection={projection}
          projectPortabilityPort={window.openNekoDesktop.projectPortability}
        />
      </div>
    </TooltipProvider>
  );
}

export function DesktopShellView({
  projection,
}: {
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const actions: ShellActions = {
    onSelectProject: () => undefined,
    onOpenWorkspaceDirectory: () => undefined,
    onOpenConversation: () => undefined,
    onDeleteConversations: () => undefined,
    onRemoveProjects: () => undefined,
    onDeleteProjectConversations: () => undefined,
    onUpdateWorkbench: () => undefined,
    onCreateCutDraft: () => undefined,
    onCloseCutView: () => undefined,
    onCloseWorkbenchView: () => undefined,
    onUpdateApplicationSidebar: () => undefined,
    onTransitionScene: () => undefined,
    onChooseWorkspaceTarget: async () => undefined,
    onSelectWorkspaceProjectTarget: async () => undefined,
    onLoadAuthoringTargets: async () => ({
      targets: [],
      creationContexts: [],
      diagnostics: [],
    }),
    onSelectAuthoringTarget: async () => undefined,
    onCreateAuthoringTarget: async () => undefined,
  };
  return (
    <DesktopSceneWorkbench
      actions={actions}
      pending={EMPTY_DESKTOP_SHELL_PENDING}
      projection={projection}
      interactive={false}
    />
  );
}

function DesktopSceneWorkbench({
  actions,
  interactive = true,
  pending,
  projection,
  projectPortabilityPort,
}: {
  readonly actions: ShellActions;
  readonly interactive?: boolean;
  readonly pending: DesktopShellPendingProjection;
  readonly projection: DesktopShellProjection;
  readonly projectPortabilityPort?: OpenNekoDesktopProjectPortabilityBridge['projectPortability'];
}): JSX.Element {
  const { locale, t } = useTranslation();
  const settings = useDesktopApplicationSettings();
  const activeWorkbench = resolveActiveDesktopWindowWorkbench(projection.window);
  const interactionLocks = projectDesktopShellInteractionLocks(pending);
  const scene = activeWorkbench.scene;
  const [managementSplitRatios, setManagementSplitRatios] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const [extensionDetailOwner, setExtensionDetailOwner] = useState<string>();
  const [portalTargets, setPortalTargets] = useState<ReadonlyMap<string, HTMLDivElement>>(
    () => new Map(),
  );
  const registerPortalTarget = useCallback(
    (
      workbenchInstanceId: string,
      slot: DesktopWorkbenchPortalSlot,
      target: HTMLDivElement | null,
    ) => {
      const key = createDesktopWorkbenchPortalTargetKey(workbenchInstanceId, slot);
      setPortalTargets((current) => {
        if (target && current.get(key) === target) return current;
        if (!target && !current.has(key)) return current;
        const next = new Map(current);
        if (target) next.set(key, target);
        else next.delete(key);
        return next;
      });
    },
    [],
  );
  const sidebar = projection.window.applicationSidebar;
  const compact = !sidebar.visible;
  const activeSection: HomeSection =
    scene.context.kind === 'asset-center'
      ? 'assets'
      : scene.context.kind === 'character-interaction'
        ? 'characters'
        : scene.context.kind === 'creative-management'
          ? scene.context.catalog === 'content-projects'
            ? 'projects'
            : scene.context.catalog
          : scene.context.kind === 'extensions'
            ? 'extensions'
            : 'create';
  const workspaceProject = resolveWorkspaceSceneProject(projection, activeWorkbench);
  const cutCapability = projection.domains.find((candidate) => candidate.surface === 'cut');
  const workspaceScene = scene.context.kind === 'agent' && scene.context.scope.kind === 'workspace';
  const characterInteractionScene = scene.context.kind === 'character-interaction';
  const roomInteractionOwner =
    scene.context.kind === 'character-interaction' && scene.context.owner.kind === 'room'
      ? scene.context.owner
      : undefined;
  const roomWorkbench = useCharacterRoomWorkbenchRuntime({
    active: roomInteractionOwner !== undefined,
    roomRunId: roomInteractionOwner?.roomRunId,
    host:
      roomInteractionOwner === undefined
        ? undefined
        : window.openNekoDesktop.characterRoomWorkbench,
  });
  const characterManagement = useCharacterManagementRuntime({
    active:
      (scene.context.kind === 'creative-management' && scene.context.catalog === 'characters') ||
      scene.context.kind === 'character-interaction',
    host:
      (scene.context.kind === 'creative-management' && scene.context.catalog === 'characters') ||
      scene.context.kind === 'character-interaction'
        ? window.openNekoDesktop.characterFoundation
        : undefined,
  });
  const worldManagement = useWorldManagementRuntime({
    active: scene.context.kind === 'creative-management' && scene.context.catalog === 'worlds',
    host:
      scene.context.kind === 'creative-management' && scene.context.catalog === 'worlds'
        ? window.openNekoDesktop.worldFoundation
        : undefined,
  });
  const characterRoomIdentity =
    roomInteractionOwner && characterManagement.loadState.kind === 'ready'
      ? projectCharacterRoomIdentity(
          characterManagement.loadState.snapshot,
          roomInteractionOwner.roomRunId,
        )
      : undefined;
  const characterTimelineStack =
    characterInteractionScene && scene.slots.cutPanel?.kind === 'character-timeline-stack'
      ? scene.slots.cutPanel
      : undefined;
  const characterTimelineRuns =
    characterInteractionScene && characterManagement.loadState.kind === 'ready'
      ? resolveOwnerCharacterRuns(
          characterManagement.loadState.snapshot,
          scene.context.owner,
        )
      : [];
  const storylineTimelineVisible = Boolean(
    characterTimelineStack?.timelines.some(
      (timeline) => timeline.kind === 'character-storyline-timeline',
    ) && characterTimelineRuns.some((run) => run.runtimeBinding.kind === 'narrative'),
  );
  const roomEventTimelineVisible = Boolean(
    characterTimelineStack?.timelines.some(
      (timeline) => timeline.kind === 'character-room-event-timeline',
    ),
  );
  const launchScope = characterInteractionScene
    ? scene.context.scope
    : scene.context.kind === 'agent' && scene.context.scope.kind !== 'workspace'
      ? scene.context.scope
      : undefined;
  const assistantPreviewVisible =
    launchScope?.kind === 'assistant' && scene.slots.main?.kind === 'assistant-preview';
  const assetPreviewVisible =
    scene.context.kind === 'asset-center' && scene.slots.secondaryMain?.kind === 'asset-preview';
  const characterDetailSelection =
    scene.context.kind === 'creative-management' &&
    scene.context.catalog === 'characters' &&
    scene.slots.secondaryMain?.kind === 'character-detail'
      ? scene.slots.secondaryMain.selection
      : undefined;
  const characterDetailVisible = characterDetailSelection !== undefined;
  const worldDetailSelection =
    scene.context.kind === 'creative-management' &&
    scene.context.catalog === 'worlds' &&
    scene.slots.secondaryMain?.kind === 'world-detail'
      ? scene.slots.secondaryMain.selection
      : undefined;
  const worldDetailVisible = worldDetailSelection !== undefined;
  const activeResourcePresentation = useResourceDockPresentation(
    activeWorkbench.layout.resourceDock.presentation,
  );
  const workspaceAgentSurface =
    workspaceScene && scene.slots.interaction?.kind === 'agent'
      ? scene.slots.interaction
      : undefined;
  const workspaceMainSurface =
    workspaceScene && scene.slots.main && isWorkspaceAuthoringMainSurface(scene.slots.main)
      ? scene.slots.main
      : undefined;
  const cutPanel = workspaceScene ? activeWorkbench.layout.cutPanel : undefined;
  const workspaceCutSurface =
    workspaceScene && scene.slots.cutPanel?.kind === 'workspace-cut'
      ? scene.slots.cutPanel
      : undefined;
  const cutPanelVisible = workspaceCutSurface !== undefined && cutPanel?.presentation === 'docked';
  const workspaceMainVisible =
    workspaceMainSurface !== undefined && isWorkbenchRegionVisible(activeWorkbench.layout, 'main');
  const cutPanelExpanded = cutPanelVisible && !workspaceMainVisible;
  const workspaceAgentVisible =
    workspaceAgentSurface !== undefined &&
    isWorkbenchRegionVisible(activeWorkbench.layout, 'agent');
  const interactionVisible = Boolean(launchScope) || workspaceAgentVisible;
  const interactionPresentation = launchScope
    ? characterInteractionScene
      ? ('docked' as const)
      : assistantPreviewVisible
        ? ('docked' as const)
        : ('main' as const)
    : workspaceAgentVisible
      ? cutPanelExpanded || workspaceMainVisible
        ? ('docked' as const)
        : ('main' as const)
      : ('hidden' as const);
  const interactionPosition =
    characterInteractionScene ||
    (workspaceScene &&
      activeResourcePresentation !== 'hidden' &&
      activeWorkbench.layout.display.chatPosition === 'right')
      ? ('left' as const)
      : activeWorkbench.layout.display.chatPosition;
  const agentSurfaceProps = scene.slots.interaction
    ? createDesktopAgentSurfaceProps({
        projection,
        workbenchInstanceId: activeWorkbench.workbenchInstanceId,
        interaction: scene.slots.interaction,
        onChooseWorkspaceTarget: actions.onChooseWorkspaceTarget,
        onSelectWorkspaceProjectTarget: actions.onSelectWorkspaceProjectTarget,
        onLoadAuthoringTargets: actions.onLoadAuthoringTargets,
        onSelectAuthoringTarget: actions.onSelectAuthoringTarget,
        onCreateAuthoringTarget: actions.onCreateAuthoringTarget,
        workspaceSelectionDisabled: interactionLocks.targetSelection || !interactive,
      })
    : undefined;
  const projectCatalogUnavailable = hasProjectCatalogDiagnostic(projection);
  const interaction = (
    <DesktopSurfaceErrorBoundary surfaceIdentity="agent-interaction">
      <div className="project-dock-panel" data-dock-owner="agent">
        <section
          className="agent-workspace desktop-assistant-agent"
          data-agent-scope={
            scene.context.kind === 'agent'
              ? scene.context.scope.kind
              : characterInteractionScene
                ? scene.context.owner.kind
                : undefined
          }
          data-primary-surface="agent"
        >
          {projectCatalogUnavailable && !agentSurfaceProps ? (
            <SceneSurfaceUnavailable owner="workspace-authority" />
          ) : agentSurfaceProps && interactionVisible ? (
            <DesktopSurfaceErrorBoundary
              surfaceIdentity={`agent:${agentSurfaceProps.agentSurfaceId}`}
            >
              <DesktopAgentSurface
                key={agentSurfaceProps.agentSurfaceId}
                {...agentSurfaceProps}
                conversationFeed={
                  roomInteractionOwner ? (
                    <CharacterRoomInteractionFeed
                      identity={characterRoomIdentity}
                      locale={locale}
                      state={roomWorkbench}
                    />
                  ) : undefined
                }
              />
            </DesktopSurfaceErrorBoundary>
          ) : null}
        </section>
      </div>
    </DesktopSurfaceErrorBoundary>
  );
  const sceneShape = launchScope
    ? characterInteractionScene
      ? 'character-interaction'
      : assistantPreviewVisible
        ? 'assistant'
        : 'agent-only'
    : workspaceScene
      ? 'workspace'
      : 'management';
  const managementSplitRatio =
    managementSplitRatios.get(activeWorkbench.workbenchInstanceId) ??
    MANAGEMENT_MAIN_SPLIT_DEFAULT_RATIO;
  const extensionSceneOwner =
    scene.context.kind === 'extensions'
      ? `${activeWorkbench.workbenchInstanceId}:${scene.sceneId}`
      : undefined;
  const extensionDetailVisible =
    extensionSceneOwner !== undefined &&
    extensionDetailOwner === extensionSceneOwner &&
    scene.slots.secondaryMain?.kind === 'extension-detail';
  const onExtensionDetailVisibilityChange = useCallback(
    (visible: boolean) => {
      if (!extensionSceneOwner) return;
      setExtensionDetailOwner((current) => {
        if (visible) return extensionSceneOwner;
        return current === extensionSceneOwner ? undefined : current;
      });
    },
    [extensionSceneOwner],
  );
  const mainSplit =
    assetPreviewVisible || characterDetailVisible || worldDetailVisible || extensionDetailVisible
      ? ('columns' as const)
      : workspaceScene
        ? (activeWorkbench.layout.main.split?.axis ?? 'none')
        : 'none';
  const secondaryMainVisible =
    assetPreviewVisible ||
    characterDetailVisible ||
    worldDetailVisible ||
    extensionDetailVisible ||
    Boolean(workspaceScene && activeWorkbench.layout.main.groups[1]);
  const mainSplitResize: ControlledWorkbenchResizeBinding | undefined =
    assetPreviewVisible || characterDetailVisible || worldDetailVisible || extensionDetailVisible
      ? createManagementMainSplitResizeBinding({
          label: t('workspace.resizeMainSplit'),
          onResizeEnd: (ratio) => {
            setManagementSplitRatios((current) => {
              const next = new Map(current);
              next.set(activeWorkbench.workbenchInstanceId, ratio);
              return next;
            });
          },
        })
      : undefined;
  const workspaceResourceSurface =
    workspaceScene && scene.slots.rightManager?.kind === 'workspace-resources'
      ? scene.slots.rightManager
      : undefined;
  const resourceDockVisible =
    workspaceResourceSurface !== undefined && activeResourcePresentation !== 'hidden';
  const characterManagerVisible =
    characterInteractionScene && scene.slots.rightManager?.kind === 'character-runtime-manager';
  const rightDockVisible = resourceDockVisible || characterManagerVisible;
  const characterTimelineVisible = storylineTimelineVisible || roomEventTimelineVisible;
  const bottomPanelVisible = cutPanelVisible || characterTimelineVisible;
  const interactionResize =
    workspaceScene && interactionPresentation === 'docked' && !interactionLocks.workbench
      ? createProjectDockResizeBinding({
          actions,
          dock: {
            owner: 'agent',
            presentation: 'docked',
            width: activeWorkbench.layout.display.chatWidth,
            content: <></>,
          },
          workbenchInstanceId: activeWorkbench.workbenchInstanceId,
          label: t('workspace.resizeAgent'),
          workbench: activeWorkbench.layout,
        })
      : undefined;
  const resourceDockResize =
    resourceDockVisible && !interactionLocks.workbench
      ? createProjectDockResizeBinding({
          actions,
          dock: {
            owner: 'resources',
            presentation: activeResourcePresentation,
            width: activeWorkbench.layout.resourceDock.width,
            content: <></>,
          },
          workbenchInstanceId: activeWorkbench.workbenchInstanceId,
          label: t('workspace.resizeRightDock'),
          workbench: activeWorkbench.layout,
        })
      : undefined;
  const cutPanelResize =
    cutPanelVisible && !cutPanelExpanded && !interactionLocks.workbench
      ? {
          label: t('workspace.resizeCutPanel'),
          minSize: DESKTOP_WORKBENCH_LIMITS.cutPanelHeight.min,
          maxSize: DESKTOP_WORKBENCH_LIMITS.cutPanelHeight.max,
          onResizeEnd: (height: number) => {
            if (height === cutPanel.height) return;
            actions.onUpdateWorkbench(
              activeWorkbench.workbenchInstanceId,
              resizeCutPanel(activeWorkbench.layout, height),
            );
          },
        }
      : undefined;
  const portalDeck = (slot: DesktopWorkbenchPortalSlot, visible = true): JSX.Element => (
    <>
      {visible ? (
        <DesktopWorkbenchPortalTarget
          instanceId={activeWorkbench.workbenchInstanceId}
          onTarget={registerPortalTarget}
          slot={slot}
        />
      ) : null}
    </>
  );

  return (
    <>
      <ControlledWorkbenchShell
        className={`project-workspace desktop-scene-workbench desktop-scene-workbench--${sceneShape}`}
        titleBar={
          workspaceProject ? (
            <WorkspaceRegionControls
              actions={actions}
              disabled={interactionLocks.workbench}
              regionState={{
                agent: {
                  available: workspaceAgentSurface !== undefined,
                  selected: workspaceAgentVisible,
                },
                main: {
                  available:
                    workspaceMainSurface !== undefined &&
                    activeWorkbench.layout.main.views.length > 0,
                  selected:
                    workspaceMainSurface !== undefined &&
                    activeWorkbench.layout.main.views.length > 0 &&
                    isWorkbenchRegionVisible(activeWorkbench.layout, 'main'),
                },
                management: {
                  available: workspaceResourceSurface !== undefined,
                  selected: resourceDockVisible,
                },
                cutPanel: {
                  available: cutCapability?.status === 'ready',
                  selected: cutPanelVisible,
                },
              }}
              workbench={activeWorkbench.layout}
              workbenchInstanceId={activeWorkbench.workbenchInstanceId}
            />
          ) : undefined
        }
        primarySidebar={
          <ApplicationPrimarySidebar
            activeSection={activeSection}
            compact={compact}
            disabled={interactionLocks.navigation || interactionLocks.sidebar}
            activeProjectId={workspaceProject?.projectId}
            onDeleteConversations={actions.onDeleteConversations}
            onDeleteProjectConversations={(project) =>
              actions.onDeleteProjectConversations([project])
            }
            onManageProjects={() =>
              actions.onTransitionScene({
                kind: 'open-creative-management',
                catalog: 'content-projects',
              })
            }
            onNavigate={(section) => actions.onTransitionScene(sceneIntentForSection(section))}
            onOpenConversation={actions.onOpenConversation}
            onOpenRecent={actions.onSelectProject}
            onRemoveProject={(project) => actions.onRemoveProjects([project])}
            onOpenSettings={() => actions.onTransitionScene({ kind: 'open-settings' })}
            onToggle={() => actions.onUpdateApplicationSidebar(toggleApplicationSidebar(sidebar))}
            projection={projection}
            projectPortabilityPort={projectPortabilityPort}
          />
        }
        primarySidebarVisible
        primarySidebarWidth={compact ? 64 : sidebar.width}
        primarySidebarResize={createApplicationPrimarySidebarResizeBinding({
          actions,
          disabled: interactionLocks.sidebar || compact,
          t,
          sidebar,
        })}
        interaction={interaction}
        interactionPresentation={interactionPresentation}
        interactionPosition={interactionPosition}
        interactionWidth={activeWorkbench.layout.display.chatWidth}
        interactionResize={interactionResize}
        main={portalDeck('main')}
        secondaryMain={portalDeck('secondaryMain', secondaryMainVisible)}
        secondaryMainVisible={secondaryMainVisible}
        mainComposition="continuous"
        mainSplit={mainSplit}
        mainSplitRatio={
          assetPreviewVisible ||
          characterDetailVisible ||
          worldDetailVisible ||
          extensionDetailVisible
            ? managementSplitRatio
            : activeWorkbench.layout.main.split?.ratio
        }
        mainSplitResize={mainSplitResize}
        bottomPanel={
          cutPanel || characterTimelineVisible
            ? portalDeck('bottomPanel', bottomPanelVisible)
            : undefined
        }
        bottomPanelVisible={bottomPanelVisible}
        bottomPanelPresentation={cutPanelExpanded ? 'expanded' : 'docked'}
        bottomPanelHeight={cutPanel?.height ?? (characterTimelineVisible ? 260 : undefined)}
        bottomPanelResize={cutPanelResize}
        leftDock={portalDeck('leftDock', scene.context.kind === 'settings')}
        leftDockPresentation={scene.context.kind === 'settings' ? 'docked' : 'hidden'}
        leftDockWidth={scene.context.kind === 'settings' ? 300 : undefined}
        rightDock={portalDeck('rightDock', rightDockVisible)}
        rightDockPresentation={
          characterManagerVisible
            ? 'docked'
            : resourceDockVisible
              ? activeResourcePresentation
              : 'hidden'
        }
        rightDockWidth={activeWorkbench.layout.resourceDock.width}
        rightDockResize={resourceDockResize}
      />
      <DesktopSurfaceErrorBoundary
        key={activeWorkbench.workbenchInstanceId}
        surfaceIdentity={`workbench:${activeWorkbench.workbenchInstanceId}`}
      >
        <DesktopWorkbenchRuntimePortals
          actions={actions}
          characterManagement={characterManagement}
          composition={activeWorkbench}
          extensionDetailVisible={extensionDetailVisible}
          interactive={interactive}
          onExtensionDetailVisibilityChange={onExtensionDetailVisibilityChange}
          portalTargets={portalTargets}
          projection={projection}
          roomWorkbench={roomWorkbench}
          resourceBrowserView={settings.projection.preferences.resourceBrowserView}
          worldManagement={worldManagement}
        />
      </DesktopSurfaceErrorBoundary>
    </>
  );
}

type DesktopWorkbenchPortalSlot =
  'main' | 'secondaryMain' | 'leftDock' | 'rightDock' | 'bottomPanel';

function createDesktopWorkbenchPortalTargetKey(
  workbenchInstanceId: string,
  slot: DesktopWorkbenchPortalSlot,
): string {
  return `${workbenchInstanceId}:${slot}`;
}

function DesktopWorkbenchPortalTarget({
  instanceId,
  onTarget,
  slot,
}: {
  readonly instanceId: string;
  readonly onTarget: (
    workbenchInstanceId: string,
    slot: DesktopWorkbenchPortalSlot,
    target: HTMLDivElement | null,
  ) => void;
  readonly slot: DesktopWorkbenchPortalSlot;
}): JSX.Element {
  const setTarget = useCallback(
    (target: HTMLDivElement | null) => onTarget(instanceId, slot, target),
    [instanceId, onTarget, slot],
  );
  return (
    <div ref={setTarget} className="desktop-workbench-slot-target" data-workbench-slot={slot} />
  );
}

function DesktopWorkbenchRuntimePortals({
  actions,
  characterManagement,
  composition,
  extensionDetailVisible,
  interactive,
  onExtensionDetailVisibilityChange,
  portalTargets,
  projection,
  roomWorkbench,
  resourceBrowserView,
  worldManagement,
}: {
  readonly actions: ShellActions;
  readonly characterManagement: CharacterManagementRuntime;
  readonly composition: DesktopWindowCompositionProjection;
  readonly extensionDetailVisible: boolean;
  readonly interactive: boolean;
  readonly onExtensionDetailVisibilityChange: (visible: boolean) => void;
  readonly portalTargets: ReadonlyMap<string, HTMLDivElement>;
  readonly projection: DesktopShellProjection;
  readonly roomWorkbench: ReturnType<typeof useCharacterRoomWorkbenchRuntime>;
  readonly resourceBrowserView: 'list' | 'grid';
  readonly worldManagement: ReturnType<typeof useWorldManagementRuntime>;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const scene = composition.scene;
  const characterDetailSelection =
    scene.context.kind === 'creative-management' &&
    scene.context.catalog === 'characters' &&
    scene.slots.secondaryMain?.kind === 'character-detail'
      ? scene.slots.secondaryMain.selection
      : undefined;
  const worldDetailSelection =
    scene.context.kind === 'creative-management' &&
    scene.context.catalog === 'worlds' &&
    scene.slots.secondaryMain?.kind === 'world-detail'
      ? scene.slots.secondaryMain.selection
      : undefined;
  const assetCenter = useDesktopAssetCenterScene({
    active: true,
    scene,
    viewMode: resourceBrowserView,
  });
  const extensionManagement = useDesktopExtensionManagementScene(scene);
  const workspaceProject = resolveWorkspaceSceneProject(projection, composition);
  const workspaceSlots = useContentProjectWorkbenchSlots({
    actions,
    instance: composition,
    projection,
    project: workspaceProject,
  });
  const settingsSection =
    scene.context.kind === 'settings'
      ? parseDesktopSettingsSection(scene.context.settingsSectionId)
      : undefined;
  const assistantScope =
    scene.context.kind === 'agent' && scene.context.scope.kind === 'assistant'
      ? scene.context.scope
      : undefined;
  const characterInteraction =
    scene.context.kind === 'character-interaction' ? scene.context : undefined;
  const characterPresentation =
    characterInteraction && scene.slots.main?.kind === 'character-presentation'
      ? scene.slots.main
      : undefined;
  const assistantPreviewRef =
    assistantScope && scene.slots.main?.kind === 'assistant-preview' ? scene.slots.main : undefined;
  const assistantPreview =
    assistantPreviewRef && assistantScope?.conversationId ? (
      <DesktopAssistantPreviewSurface
        assistantSpaceId={assistantScope.assistantSpaceId}
        conversationId={assistantScope.conversationId}
        previewSessionId={assistantPreviewRef.previewSessionId}
        scratchArtifactId={assistantPreviewRef.scratchArtifactId}
        windowId={scene.windowId}
      />
    ) : undefined;
  const assetPreviewSession =
    scene.context.kind === 'asset-center' && assetCenter.projection
      ? resolveAssetCenterPreviewSession(scene, assetCenter.projection)
      : undefined;
  const assetPreview =
    typeof assetPreviewSession === 'string' && assetCenter.projection ? (
      <DesktopAssetCenterMainSurface projection={assetCenter.projection} />
    ) : undefined;
  const extensionDetailTarget =
    scene.context.kind === 'extensions' && scene.slots.secondaryMain?.kind === 'extension-detail'
      ? portalTargets.get(
          createDesktopWorkbenchPortalTargetKey(composition.workbenchInstanceId, 'secondaryMain'),
        )
      : undefined;
  const mainContent =
    settingsSection !== undefined ? (
      <DesktopSettingsMainSurface section={settingsSection} />
    ) : scene.context.kind === 'asset-center' ? (
      assetCenter.runtime ? (
        <DesktopAssetManagementSurface interactive={interactive} runtime={assetCenter.runtime} />
      ) : null
    ) : scene.context.kind === 'extensions' ? (
      extensionManagement ? (
        <DesktopExtensionManagementSurface
          detailLabel={t('home.capabilities.configuration')}
          detailTarget={extensionDetailTarget}
          interactive={interactive}
          onDetailVisibilityChange={onExtensionDetailVisibilityChange}
          runtime={extensionManagement}
        />
      ) : null
    ) : scene.context.kind === 'creative-management' ? (
      scene.context.catalog === 'content-projects' ? (
        <ProjectCatalogRoot
          associatedConversationCounts={countProjectConversations(projection)}
          interactive={interactive}
          onOpenDirectory={actions.onOpenWorkspaceDirectory}
          onOpen={actions.onSelectProject}
          onDeleteAssociatedConversations={actions.onDeleteProjectConversations}
          onRemove={actions.onRemoveProjects}
          projects={projection.catalog.projects}
        />
      ) : scene.context.catalog === 'characters' ? (
        <CharacterCatalogSurface
          locale={locale}
          onCreate={() =>
            actions.onTransitionScene({
              kind: 'select-character-detail',
              selection: { kind: 'create' },
            })
          }
          onSelect={(characterProjectId) =>
            actions.onTransitionScene({
              kind: 'select-character-detail',
              selection: { kind: 'project', characterProjectId },
            })
          }
          runtime={characterManagement}
          selectedProjectId={
            characterDetailSelection?.kind === 'project'
              ? characterDetailSelection.characterProjectId
              : undefined
          }
        />
      ) : (
        <WorldCatalogSurface
          locale={locale}
          onCreate={() =>
            actions.onTransitionScene({
              kind: 'select-world-detail',
              selection: { kind: 'create' },
            })
          }
          onSelect={(worldProjectId) =>
            actions.onTransitionScene({
              kind: 'select-world-detail',
              selection: { kind: 'project', worldProjectId },
            })
          }
          runtime={worldManagement}
          selectedProjectId={
            worldDetailSelection?.kind === 'project'
              ? worldDetailSelection.worldProjectId
              : undefined
          }
        />
      )
    ) : characterInteraction ? (
      characterPresentation ? (
        <DesktopCharacterPresentationSurface
          runtime={characterManagement}
          surface={characterPresentation}
          workbenchInstanceId={composition.workbenchInstanceId}
        />
      ) : (
        <SceneSurfaceUnavailable
          owner="character-presentation:unavailable"
        />
      )
    ) : scene.context.kind === 'agent' && scene.context.scope.kind === 'workspace' ? (
      workspaceSlots.main
    ) : assistantScope ? (
      (assistantPreview ?? null)
    ) : scene.context.kind === 'agent' && scene.context.scope.kind === 'unbound' ? null : (
      <SceneSurfaceUnavailable owner="agent" />
    );
  const main =
    scene.context.kind === 'asset-center' ? (
      <StaticWorkbenchMainPanelSurface
        label={t('home.mediaLibrary')}
        panelId="asset-management"
        role="management"
        size={assetPreview ? 'compact' : 'full'}
      >
        {mainContent}
      </StaticWorkbenchMainPanelSurface>
    ) : scene.context.kind === 'extensions' ? (
      <StaticWorkbenchMainPanelSurface
        label={t('home.capabilities')}
        panelId="extension-management"
        role="management"
        size={extensionDetailVisible ? 'compact' : 'full'}
      >
        {mainContent}
      </StaticWorkbenchMainPanelSurface>
    ) : scene.context.kind === 'creative-management' ? (
      <StaticWorkbenchMainPanelSurface
        label={creativeManagementCatalogLabel(scene.context.catalog, t)}
        panelId="creative-management"
        role="management"
        size={characterDetailSelection || worldDetailSelection ? 'compact' : 'full'}
      >
        {mainContent}
      </StaticWorkbenchMainPanelSurface>
    ) : characterInteraction ? (
      <StaticWorkbenchMainPanelSurface
        label={t(
          characterInteraction.owner.kind === 'room'
            ? 'character.workbench.roomScene'
            : 'character.workbench.avatarScene',
        )}
        panelId="character-presentation"
        role="workspace"
      >
        {mainContent}
      </StaticWorkbenchMainPanelSurface>
    ) : (
      mainContent
    );
  const secondaryMain = assetPreview ? (
    <StaticWorkbenchMainPanelSurface
      label={t('workspace.preview')}
      panelId="asset-preview"
      role="detail"
    >
      {assetPreview}
    </StaticWorkbenchMainPanelSurface>
  ) : scene.context.kind === 'creative-management' &&
    scene.context.catalog === 'characters' &&
    characterDetailSelection ? (
    <StaticWorkbenchMainPanelSurface
      label={foundationDetailLabel(locale, characterDetailSelection.kind)}
      panelId="character-detail"
      role="detail"
    >
      <CharacterDetailSurface
        locale={locale}
        onCreated={(characterProjectId) =>
          actions.onTransitionScene({
            kind: 'select-character-detail',
            selection: { kind: 'project', characterProjectId },
          })
        }
        runtime={characterManagement}
        selection={characterDetailSelection}
      />
    </StaticWorkbenchMainPanelSurface>
  ) : scene.context.kind === 'creative-management' &&
    scene.context.catalog === 'worlds' &&
    worldDetailSelection ? (
    <StaticWorkbenchMainPanelSurface
      label={worldDetailLabel(locale, worldDetailSelection.kind)}
      panelId="world-detail"
      role="detail"
    >
      <WorldDetailSurface
        locale={locale}
        onCreated={(worldProjectId) =>
          actions.onTransitionScene({
            kind: 'select-world-detail',
            selection: { kind: 'project', worldProjectId },
          })
        }
        runtime={worldManagement}
        selection={worldDetailSelection}
      />
    </StaticWorkbenchMainPanelSurface>
  ) : scene.context.kind === 'agent' && scene.context.scope.kind === 'workspace' ? (
    workspaceSlots.secondaryMain
  ) : undefined;
  const leftDock =
    settingsSection === undefined ? undefined : (
      <DesktopSettingsNavigationSurface
        activeSection={settingsSection}
        onSectionChange={(section) =>
          actions.onTransitionScene({ kind: 'open-settings', sectionId: section })
        }
      />
    );
  const rightDock =
    scene.context.kind === 'agent' && scene.context.scope.kind === 'workspace' ? (
      workspaceSlots.rightDock
    ) : characterInteraction ? (
      <CharacterRuntimeManagerSurface
        activeConversationId={characterInteraction.scope.conversationId}
        conversations={projection.conversationNavigation.groups.flatMap(
          (group) => group.conversations,
        )}
        onOpenConversation={actions.onOpenConversation}
        owner={characterInteraction.owner}
        runtime={characterManagement}
      />
    ) : undefined;
  const characterSnapshot =
    characterManagement.loadState.kind === 'ready'
      ? characterManagement.loadState.snapshot
      : undefined;
  const characterOwnerRuns =
    characterInteraction && characterSnapshot
      ? resolveOwnerCharacterRuns(characterSnapshot, characterInteraction.owner)
      : [];
  const storylineTimeline =
    characterSnapshot && characterOwnerRuns.some((run) => run.runtimeBinding.kind === 'narrative') ? (
      <CharacterStorylineTimelineSurface
        characterRunIds={characterOwnerRuns.map((run) => run.characterRunId)}
        locale={locale}
        snapshot={characterSnapshot}
      />
    ) : null;
  const characterTimelineStack =
    characterInteraction && scene.slots.cutPanel?.kind === 'character-timeline-stack'
      ? scene.slots.cutPanel
      : undefined;
  const storylineTimelineRef = characterTimelineStack?.timelines.find(
    (timeline) => timeline.kind === 'character-storyline-timeline',
  );
  const roomEventTimelineRef = characterTimelineStack?.timelines.find(
    (timeline) => timeline.kind === 'character-room-event-timeline',
  );
  const bottomPanel =
    characterTimelineStack && (storylineTimeline || roomEventTimelineRef) ? (
      <div data-character-timelines="true">
        {storylineTimelineRef && storylineTimeline ? (
          <div data-character-timeline-id={storylineTimelineRef.timelineId}>
            {storylineTimeline}
          </div>
        ) : null}
        {roomEventTimelineRef ? (
          <div data-character-timeline-id={roomEventTimelineRef.timelineId}>
            <CharacterRoomTimelineProjectionSurface locale={locale} state={roomWorkbench} />
          </div>
        ) : null}
      </div>
    ) : (
      workspaceSlots.bottomPanel
    );
  const contentBySlot: Readonly<Record<DesktopWorkbenchPortalSlot, ReactNode>> = {
    main,
    secondaryMain,
    leftDock,
    rightDock,
    bottomPanel,
  };

  return (
    <>
      {(Object.entries(contentBySlot) as readonly [DesktopWorkbenchPortalSlot, ReactNode][]).map(
        ([slot, content]) => {
          const target = portalTargets.get(
            createDesktopWorkbenchPortalTargetKey(composition.workbenchInstanceId, slot),
          );
          return target
            ? createPortal(
                <DesktopSurfaceErrorBoundary
                  key={`${scene.sceneId}:${slot}`}
                  surfaceIdentity={`${composition.workbenchInstanceId}:${slot}`}
                >
                  {content}
                </DesktopSurfaceErrorBoundary>,
                target,
                slot,
              )
            : null;
        },
      )}
    </>
  );
}

type DesktopCharacterPresentationRenderer = (input: {
  readonly runtime: CharacterManagementRuntime;
  readonly surface: DesktopCharacterPresentationSurfaceRef;
  readonly workbenchInstanceId: string;
}) => ReactNode;

const desktopCharacterPresentationRenderers =
  new DesktopCharacterPresentationSurfaceRegistry<DesktopCharacterPresentationRenderer>();

desktopCharacterPresentationRenderers.register({
  providerId: 'chara.representation',
  surfaceKind: 'avatar',
  resolve: () => ({ runtime, surface, workbenchInstanceId }) => (
    <CharacterAvatarSurface
      owner={surface.owner}
      runtime={runtime}
      workbenchInstanceId={workbenchInstanceId}
    />
  ),
});

function DesktopCharacterPresentationSurface({
  runtime,
  surface,
  workbenchInstanceId,
}: {
  readonly runtime: CharacterManagementRuntime;
  readonly surface: DesktopCharacterPresentationSurfaceRef;
  readonly workbenchInstanceId: string;
}): JSX.Element {
  const render = desktopCharacterPresentationRenderers.resolve(surface);
  return <>{render({ runtime, surface, workbenchInstanceId })}</>;
}

function StaticWorkbenchMainPanelSurface({
  children,
  label,
  panelId,
  role,
  size = 'full',
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly panelId: string;
  readonly role: 'workspace' | 'management' | 'detail';
  readonly size?: 'compact' | 'full';
}): JSX.Element {
  return (
    <WorkbenchMainPanelSurface label={label} panelId={panelId} role={role} size={size}>
      {children}
    </WorkbenchMainPanelSurface>
  );
}

type CharacterInteractionOwner = Extract<
  DesktopWorkbenchSceneProjection['context'],
  { readonly kind: 'character-interaction' }
>['owner'];

function CharacterAvatarSurface({
  owner,
  runtime,
  workbenchInstanceId,
}: {
  readonly owner: CharacterInteractionOwner;
  readonly runtime: CharacterManagementRuntime;
  readonly workbenchInstanceId: string;
}): JSX.Element {
  const { t } = useTranslation();
  const isRoom = owner.kind === 'room';
  const snapshot = runtime.loadState.kind === 'ready' ? runtime.loadState.snapshot : undefined;
  const runs = snapshot ? resolveOwnerCharacterRuns(snapshot, owner) : [];
  const characterRun = owner.kind === 'character' ? runs[0] : undefined;
  const characterPublication =
    characterRun === undefined
      ? undefined
      : snapshot?.character.versions.find(
          (publication) => publication.characterVersionId === characterRun.characterVersionId,
        );
  const avatarRepresentationId =
    characterPublication?.definition.representationDefaults?.avatarRepresentationId;
  const dynamicRepresentation = characterPublication?.definition.representationRefs.find(
    (representation) => representation.representationId === avatarRepresentationId,
  );
  const [avatarResource, setAvatarResource] = useState<
    | { readonly kind: 'idle' }
    | { readonly kind: 'loading' }
    | {
        readonly kind: 'ready';
        readonly descriptor: Extract<
          Awaited<ReturnType<typeof window.openNekoDesktop.characterAvatar.openSurface>>,
          { readonly status: 'ready' }
        >['descriptor'];
      }
    | { readonly kind: 'unavailable'; readonly message: string }
  >({ kind: 'idle' });
  const [runtimeDiagnostic, setRuntimeDiagnostic] = useState<string>();
  const handleRuntimeDiagnostic = useCallback((message: string) => {
    setRuntimeDiagnostic(message);
  }, []);
  const avatarCharacterRunId = characterRun?.characterRunId;
  const selectedAvatarRepresentationId = dynamicRepresentation?.representationId;

  useEffect(() => {
    if (!avatarCharacterRunId || !selectedAvatarRepresentationId) {
      setAvatarResource({ kind: 'idle' });
      return;
    }
    let active = true;
    let avatarResourceLeaseId: string | undefined;
    setRuntimeDiagnostic(undefined);
    setAvatarResource({ kind: 'loading' });
    void window.openNekoDesktop.characterAvatar
      .openSurface({
        workbenchInstanceId,
        characterRunId: avatarCharacterRunId,
        representationId: selectedAvatarRepresentationId,
      })
      .then((result) => {
        if (result.status !== 'ready') {
          if (active) {
            setAvatarResource({
              kind: 'unavailable',
              message:
                result.status === 'unavailable'
                  ? result.diagnostic.message
                  : 'The Character Avatar resource could not be opened.',
            });
          }
          return;
        }
        avatarResourceLeaseId = result.descriptor.avatarResourceLeaseId;
        if (!active) {
          void window.openNekoDesktop.characterAvatar.releaseSurface(avatarResourceLeaseId);
          return;
        }
        setAvatarResource({ kind: 'ready', descriptor: result.descriptor });
      })
      .catch((error: unknown) => {
        if (active) {
          setAvatarResource({
            kind: 'unavailable',
            message:
              error instanceof Error ? error.message : 'The Character Avatar is unavailable.',
          });
        }
      });
    return () => {
      active = false;
      if (avatarResourceLeaseId) {
        void window.openNekoDesktop.characterAvatar.releaseSurface(avatarResourceLeaseId);
      }
    };
  }, [avatarCharacterRunId, selectedAvatarRepresentationId, workbenchInstanceId]);

  const diagnostic =
    runtimeDiagnostic ??
    (avatarResource.kind === 'unavailable' ? avatarResource.message : undefined);
  return (
    <section
      className="character-workbench-avatar"
      data-character-avatar-surface="true"
      data-character-owner-kind={owner.kind}
      data-character-owner-id={owner.kind === 'room' ? owner.roomRunId : owner.characterRunId}
      data-avatar-representation-kind={dynamicRepresentation?.kind}
      data-avatar-resource-ref={dynamicRepresentation?.resourceRef}
    >
      <div className="character-workbench-avatar__stage">
        {avatarResource.kind === 'ready' ? (
          <VrmAvatarSurface
            descriptor={avatarResource.descriptor}
            onDiagnostic={handleRuntimeDiagnostic}
          />
        ) : isRoom ? (
          <UsersIcon aria-hidden="true" size={72} />
        ) : avatarResource.kind === 'loading' ? (
          <LoadingIcon aria-hidden="true" size={32} />
        ) : (
          <UserIcon aria-hidden="true" size={72} />
        )}
      </div>
      {avatarResource.kind !== 'ready' || diagnostic ? (
        <div className="character-workbench-avatar__status" role="status">
          {avatarResource.kind === 'loading' ? (
            <LoadingIcon size={16} />
          ) : (
            <WarningIcon size={16} />
          )}
          <div>
            <strong>
              {t(
                isRoom
                  ? 'character.workbench.roomSceneUnavailable'
                  : 'character.workbench.avatarUnavailable',
              )}
            </strong>
            <span>{diagnostic ?? t('character.workbench.rendererUnavailableDetail')}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CharacterRuntimeManagerSurface({
  activeConversationId,
  conversations,
  onOpenConversation,
  owner,
  runtime,
}: {
  readonly activeConversationId?: string;
  readonly conversations: readonly DesktopAgentHomeConversationSummary[];
  readonly onOpenConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly owner: CharacterInteractionOwner;
  readonly runtime: CharacterManagementRuntime;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const snapshot = runtime.loadState.kind === 'ready' ? runtime.loadState.snapshot : undefined;
  const runs = snapshot ? resolveOwnerCharacterRuns(snapshot, owner) : [];
  const roomRun =
    owner.kind === 'room'
      ? snapshot?.character.roomRuns.find((run) => run.roomRunId === owner.roomRunId)
      : undefined;
  return (
    <section
      className="character-workbench-manager project-dock-panel"
      data-character-context-manager="true"
      data-character-owner-kind={owner.kind}
    >
      <header className="character-workbench-panel-header">
        <UserIcon size={16} />
        <strong>{t('character.workbench.runtimeManager')}</strong>
      </header>
      <div className="character-workbench-manager__identity">
        <span>{t(owner.kind === 'room' ? 'home.room' : 'home.character')}</span>
        <strong>{owner.kind === 'room' ? owner.roomId : owner.characterId}</strong>
      </div>
      <div className="character-workbench-manager__capabilities">
        {runs.map((run) => {
          const publication = snapshot?.character.versions.find(
            (version) => version.characterVersionId === run.characterVersionId,
          );
          const configuration = snapshot?.character.presentationConfigurations.find(
            (item) => item.characterRunId === run.characterRunId,
          );
          const storylineBinding =
            run.runtimeBinding.kind === 'narrative' ? run.runtimeBinding.storyline : undefined;
          const storylineVersion =
            storylineBinding === undefined
              ? undefined
              : snapshot?.character.storylineVersions.find(
                  (version) =>
                    version.characterStorylineVersionId ===
                    storylineBinding.characterStorylineVersionId,
                );
          const storylineNode = storylineVersion?.nodes.find(
            (node) => node.storylineNodeId === storylineBinding?.storylineNodeId,
          );
          const schedulingEligible =
            roomRun?.schedulingPolicy.kind !== 'bounded-autonomous' ||
            roomRun.schedulingPolicy.eligibleParticipantIds.includes(run.participantId);
          const agentSessionId =
            run.controller.kind === 'agent' ? run.controller.primaryAgentSessionId : undefined;
          const agentConversation =
            agentSessionId !== undefined
              ? conversations.find(
                  (conversation) =>
                    conversation.navigation.conversationId === agentSessionId,
                )
              : undefined;
          return (
            <article
              key={run.characterRunId}
              className="character-workbench-manager__participant"
              data-character-participant={run.participantId}
              data-character-mode={run.runtimeBinding.kind}
              data-character-conversation-active={
                agentSessionId !== undefined && agentSessionId === activeConversationId
                  ? 'true'
                  : undefined
              }
            >
              <strong>{publication?.label ?? run.characterVersionId}</strong>
              <code>{run.characterVersionId}</code>
              <span>{run.runtimeBinding.kind}</span>
              <span>{run.controller.kind}</span>
              {run.controller.kind === 'agent' ? (
                <>
                  <code>{run.controller.primaryAgentSessionId}</code>
                  <button
                    type="button"
                    disabled={agentConversation === undefined}
                    onClick={() => {
                      if (!agentConversation) {
                        throw new Error(
                          `Character Agent Conversation '${agentSessionId}' is unavailable.`,
                        );
                      }
                      onOpenConversation(agentConversation);
                    }}
                  >
                    {t('character.workbench.configureParticipant')}
                  </button>
                </>
              ) : null}
              {configuration?.tts.voiceRepresentationId ? (
                <span>{configuration.tts.voiceRepresentationId}</span>
              ) : null}
              {storylineBinding ? (
                <div data-character-storyline-context="true">
                  <code>{storylineBinding.characterStorylineVersionId}</code>
                  <strong>{storylineNode?.title ?? storylineBinding.storylineNodeId}</strong>
                  {storylineNode ? (
                    <>
                      <span>{storylineNode.context.situation}</span>
                      {storylineNode.context.time ? <span>{storylineNode.context.time}</span> : null}
                      {storylineNode.context.location ? (
                        <span>{storylineNode.context.location}</span>
                      ) : null}
                      {storylineNode.context.characterState ? (
                        <span>{storylineNode.context.characterState}</span>
                      ) : null}
                      {storylineNode.context.relationshipState ? (
                        <span>{storylineNode.context.relationshipState}</span>
                      ) : null}
                      {storylineNode.context.knowledgeBoundary.map((boundary) => (
                        <span key={boundary}>{boundary}</span>
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}
              {roomRun ? (
                <span data-character-scheduling-eligible={String(schedulingEligible)}>
                  {schedulingEligible ? 'eligible' : 'paused'}
                </span>
              ) : null}
            </article>
          );
        })}
        {runs.length === 0 ? (
          <div className="character-workbench-manager__row" role="status">
            <span>{t('character.workbench.notConnected')}</span>
          </div>
        ) : null}
      </div>
      {snapshot ? (
        <CharacterCompanionContinuitySurface
          execute={runtime.execute}
          locale={locale}
          runs={runs}
          snapshot={snapshot}
        />
      ) : null}
      {runtime.diagnostic ? <span role="alert">{runtime.diagnostic}</span> : null}
    </section>
  );
}

function resolveOwnerCharacterRuns(
  snapshot: Extract<
    CharacterManagementRuntime['loadState'],
    { readonly kind: 'ready' }
  >['snapshot'],
  owner: CharacterInteractionOwner,
) {
  if (owner.kind === 'character') {
    return snapshot.character.characterRuns.filter(
      (run) => run.characterRunId === owner.characterRunId,
    );
  }
  const room = snapshot.character.roomRuns.find((run) => run.roomRunId === owner.roomRunId);
  const characterRunIds = new Set(
    room?.participants.flatMap((participant) =>
      participant.controller.kind === 'agent' ? [participant.controller.characterRunId] : [],
    ) ?? [],
  );
  return snapshot.character.characterRuns.filter((run) => characterRunIds.has(run.characterRunId));
}
function createLaunchAgentPresentation(
  scope: Extract<DesktopWorkbenchSceneProjection['context'], { readonly kind: 'agent' }>['scope'],
): AgentInteractionProjection {
  if (scope.kind === 'workspace') {
    throw new Error('Launch Agent presentation cannot use Workspace scope.');
  }
  if (scope.kind === 'unbound') {
    return createAgentDraftInteraction({
      draftId: scope.draftId,
      binding: { kind: 'unbound' },
    });
  }
  const binding = {
    kind: 'assistant' as const,
    assistantSpaceId: scope.assistantSpaceId,
    baseGrantIds: [],
  };
  return scope.conversationId
    ? createAgentSessionInteraction({ binding, conversationId: scope.conversationId })
    : createAgentDraftInteraction({ draftId: scope.draftId, binding });
}

function createDesktopAgentSurfaceProps(input: {
  readonly projection: DesktopShellProjection;
  readonly workbenchInstanceId: string;
  readonly project?: DesktopProjectCatalogItem;
  readonly interaction: DesktopAgentInteractionSurfaceRef;
  readonly onChooseWorkspaceTarget?: () => Promise<
    import('@neko/agent-webview/root').AgentComposerWorkspaceTarget | undefined
  >;
  readonly onSelectWorkspaceProjectTarget?: (
    projectId: string,
  ) => Promise<import('@neko/agent-webview/root').AgentComposerWorkspaceTarget | undefined>;
  readonly onLoadAuthoringTargets?: () => Promise<
    import('@neko/agent-webview/root').AgentComposerAuthoringCatalog
  >;
  readonly onSelectAuthoringTarget?: (
    option: import('@neko/agent-webview/root').AgentComposerAuthoringTargetOption,
  ) => Promise<import('@neko/agent-webview/root').AgentComposerWorkspaceTarget | undefined>;
  readonly onCreateAuthoringTarget?: (
    context: import('@neko/agent-webview/root').AgentComposerAuthoringCreationContext,
    name: string,
  ) => Promise<import('@neko/agent-webview/root').AgentComposerWorkspaceTarget | undefined>;
  readonly workspaceSelectionDisabled?: boolean;
}): DesktopAgentSurfaceProps | undefined {
  const { interaction } = input;
  const scope = interaction.scope;
  if (scope.kind === 'workspace') {
    const project =
      input.project ??
      input.projection.catalog.projects.find(
        (candidate) => candidate.workspaceId === scope.workspaceId,
      );
    if (!project) {
      if (hasProjectCatalogDiagnostic(input.projection)) return undefined;
      throw new Error(`Agent Surface '${interaction.agentSurfaceId}' has no Workspace Project.`);
    }
    const tab = input.projection.window.tabs.find(
      (candidate) => candidate.projectId === project.projectId,
    );
    if (!tab || tab.viewId !== interaction.agentViewId) {
      throw new Error(`Agent Surface '${interaction.agentSurfaceId}' has no exact Workspace View.`);
    }
    const binding = {
      kind: 'workspace' as const,
      workspaceId: scope.workspaceId,
      workspaceGrantId: scope.workspaceGrantId,
    };
    const agentPresentation = scope.conversationId
      ? createAgentSessionInteraction({ binding, conversationId: scope.conversationId })
      : createAgentDraftInteraction({ draftId: scope.draftId, binding });
    return {
      binding: 'workspace',
      workbenchInstanceId: input.workbenchInstanceId,
      agentSurfaceId: interaction.agentSurfaceId,
      tab,
      agentPresentation,
      composerWorkspace: { kind: 'workspace', label: project.displayName },
    };
  }
  if (
    !input.onChooseWorkspaceTarget ||
    !input.onSelectWorkspaceProjectTarget ||
    !input.onLoadAuthoringTargets ||
    !input.onSelectAuthoringTarget ||
    !input.onCreateAuthoringTarget
  ) {
    throw new Error(`Agent Surface '${interaction.agentSurfaceId}' has no Workspace chooser.`);
  }
  const agentPresentation = createLaunchAgentPresentation(scope);
  return {
    binding: 'launch',
    workbenchInstanceId: input.workbenchInstanceId,
    agentSurfaceId: interaction.agentSurfaceId,
    viewId: interaction.agentViewId,
    agentPresentation,
    ...(agentPresentation.phase === 'draft' && agentPresentation.binding.kind === 'unbound'
      ? {
          composerWorkspace: {
            kind: 'entry' as const,
            projects: input.projection.catalog.projects.map((project) => ({
              projectId: project.projectId,
              label: project.displayName,
              ...(project.unavailable ? { disabled: true } : {}),
            })),
            onChooseDirectory: input.onChooseWorkspaceTarget,
            onSelectProject: input.onSelectWorkspaceProjectTarget,
            loadAuthoringCatalog: input.onLoadAuthoringTargets,
            onSelectAuthoringTarget: input.onSelectAuthoringTarget,
            onCreateAuthoringTarget: input.onCreateAuthoringTarget,
            ...(input.workspaceSelectionDisabled === undefined
              ? {}
              : { disabled: input.workspaceSelectionDisabled }),
          },
        }
      : {}),
  };
}

function hasProjectCatalogDiagnostic(projection: DesktopShellProjection): boolean {
  return Boolean(
    projection.stateDiagnostics?.some(
      (diagnostic) =>
        diagnostic.code === 'desktop-shell-component-invalid' &&
        diagnostic.component === 'project-catalog',
    ),
  );
}

export function resolveAssetCenterPreviewSession(
  scene: DesktopWorkbenchSceneProjection,
  projection: AssetCenterSessionProjection,
): string | undefined | null {
  if (
    scene.context.kind !== 'asset-center' ||
    scene.context.assetCenterSessionId !== projection.identity.assetCenterSessionId ||
    scene.windowId !== projection.identity.windowId
  ) {
    throw new Error('Asset Center management projection does not match its Scene.');
  }
  if (projection.preview.status !== 'ready') return undefined;
  if (
    scene.slots.secondaryMain?.kind !== 'asset-preview' ||
    scene.slots.secondaryMain.assetCenterSessionId !== projection.identity.assetCenterSessionId ||
    scene.slots.secondaryMain.previewSessionId !== projection.preview.previewSessionId
  ) {
    return null;
  }
  return projection.preview.previewSessionId;
}

function resolveWorkspaceSceneProject(
  projection: DesktopShellProjection,
  instance: DesktopWindowCompositionProjection,
): DesktopProjectCatalogItem | undefined {
  const { context, slots } = instance.scene;
  if (context.kind !== 'agent' || context.scope.kind !== 'workspace') return undefined;
  if (slots.main && !isWorkspaceAuthoringMainSurface(slots.main)) {
    throw new Error('Workspace Scene Main Surface must use an exact authoring Surface ref.');
  }
  const workspaceMain = slots.main;
  const workspaceScope = context.scope;
  if (workspaceMain && workspaceMain.workspaceId !== workspaceScope.workspaceId) {
    throw new Error('Workspace Scene Main Surface does not match its scope.');
  }
  const project = projection.catalog.projects.find(
    (candidate) => candidate.workspaceId === workspaceScope.workspaceId,
  );
  if (!project) return undefined;
  const tab = projection.window.tabs.find((candidate) => candidate.projectId === project.projectId);
  if (!tab) {
    throw new Error('Workspace Scene has no matching Agent Window View.');
  }
  if (
    context.agentViewId !== tab.viewId ||
    slots.interaction?.kind !== 'agent' ||
    slots.interaction.agentViewId !== tab.viewId
  ) {
    throw new Error('Workspace Scene Agent Surface does not match its exact Window View.');
  }
  if (workspaceMain) {
    const mainView = instance.layout.main.views.find((candidate) =>
      matchesWorkspaceAuthoringMainSurface(candidate, workspaceMain, project.projectId),
    );
    if (!mainView) throw new Error('Workspace Scene Main Surface has no exact Workbench View.');
  } else if (instance.layout.main.views.length > 0) {
    throw new Error('Workspace Scene without Main cannot retain Workbench Views.');
  }
  return project;
}

function isWorkspaceAuthoringMainSurface(
  surface: DesktopWorkbenchMainSurfaceRef,
): surface is Extract<
  DesktopWorkbenchMainSurfaceRef,
  { readonly kind: 'workspace-main' | 'character-authoring' | 'world-authoring' }
> {
  return (
    surface.kind === 'workspace-main' ||
    surface.kind === 'character-authoring' ||
    surface.kind === 'world-authoring'
  );
}

export function matchesWorkspaceAuthoringMainSurface(
  view: DesktopWorkbenchViewRef,
  surface: Extract<
    DesktopWorkbenchMainSurfaceRef,
    { readonly kind: 'workspace-main' | 'character-authoring' | 'world-authoring' }
  >,
  projectId: string,
): boolean {
  if (
    view.viewId !== surface.viewId ||
    view.viewInstanceId !== surface.viewInstanceId ||
    view.workspaceId !== surface.workspaceId ||
    view.projectId !== projectId
  ) {
    return false;
  }
  if (surface.kind === 'character-authoring') {
    return (
      view.kind === 'character-authoring' &&
      view.characterProjectId === surface.characterProjectId &&
      surface.projectId === projectId
    );
  }
  if (surface.kind === 'world-authoring') {
    return (
      view.kind === 'world-authoring' &&
      view.worldProjectId === surface.worldProjectId &&
      surface.projectId === projectId
    );
  }
  return view.kind !== 'character-authoring' && view.kind !== 'world-authoring';
}

function sceneIntentForSection(section: HomeSection): DesktopSceneTransitionIntent {
  switch (section) {
    case 'create':
      return { kind: 'open-agent-entry' };
    case 'characters':
      return { kind: 'open-creative-management', catalog: 'characters' };
    case 'worlds':
      return { kind: 'open-creative-management', catalog: 'worlds' };
    case 'assets':
      return { kind: 'open-asset-center' };
    case 'extensions':
      return { kind: 'open-extensions' };
    case 'projects':
      return { kind: 'open-creative-management', catalog: 'content-projects' };
  }
}

function creativeManagementCatalogLabel(
  catalog: DesktopCreativeManagementCatalog,
  translate: (key: 'home.allProjects' | 'home.characters' | 'home.worlds') => string,
): string {
  return catalog === 'content-projects'
    ? translate('home.allProjects')
    : catalog === 'characters'
      ? translate('home.characters')
      : translate('home.worlds');
}

function foundationDetailLabel(locale: string, kind: 'create' | 'project'): string {
  if (locale.startsWith('zh')) return kind === 'create' ? '新建角色' : '角色详情';
  return kind === 'create' ? 'New character' : 'Character detail';
}

function worldDetailLabel(locale: string, kind: 'create' | 'project'): string {
  if (locale.startsWith('zh')) return kind === 'create' ? '新建世界' : '世界详情';
  return kind === 'create' ? 'New world' : 'World detail';
}

function SceneSurfaceUnavailable({ owner }: { readonly owner: string }): JSX.Element {
  return (
    <section className="scene-surface-unavailable" data-scene-surface-unavailable={owner}>
      <WarningIcon size={18} />
      <span>{owner}</span>
    </section>
  );
}

function useDesktopAssetCenterScene(input: {
  readonly active: boolean;
  readonly scene: DesktopWorkbenchSceneProjection;
  readonly viewMode: 'list' | 'grid';
}): {
  readonly runtime?: DesktopAssetCenterRuntime;
  readonly projection?: AssetCenterSessionProjection;
} {
  const assetCenterSessionId =
    input.scene.context.kind === 'asset-center'
      ? input.scene.context.assetCenterSessionId
      : undefined;
  const runtime = useMemo(() => {
    if (!input.active || !assetCenterSessionId || typeof window === 'undefined') return undefined;
    return new DesktopAssetCenterRuntime(
      { assetCenterSessionId, windowId: input.scene.windowId },
      input.viewMode,
      window.openNekoDesktop,
    );
  }, [assetCenterSessionId, input.active, input.scene.windowId, input.viewMode]);
  const [sessionState, setSessionState] = useState<{
    readonly runtime: DesktopAssetCenterRuntime;
    readonly projection: AssetCenterSessionProjection;
  }>();
  useDisposeRuntime(runtime);
  useEffect(() => {
    setSessionState(undefined);
    if (!runtime) return;
    let active = true;
    const unsubscribe = runtime.subscribe((next) => {
      if (active) setSessionState({ runtime, projection: next });
    });
    void runtime.getSnapshot().then((next) => {
      if (active) setSessionState({ runtime, projection: next });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [runtime]);
  const projection =
    sessionState && sessionState.runtime === runtime ? sessionState.projection : undefined;
  return {
    ...(runtime ? { runtime } : {}),
    ...(projection ? { projection } : {}),
  };
}

function useDesktopExtensionManagementScene(
  scene: DesktopWorkbenchSceneProjection,
): DesktopExtensionManagementRuntime | undefined {
  const active = scene.context.kind === 'extensions';
  const runtime = useMemo(() => {
    if (!active || typeof window === 'undefined') return undefined;
    return new DesktopExtensionManagementRuntime(
      { windowId: scene.windowId },
      window.openNekoDesktop,
    );
  }, [active, scene.windowId]);
  useDisposeRuntime(runtime);
  return runtime;
}

function useDisposeRuntime<T extends { dispose(): void }>(runtime: T | undefined): void {
  const disposalTokens = useRef(new Map<T, symbol>());
  useEffect(() => {
    if (!runtime) return;
    const tokens = disposalTokens.current;
    const token = Symbol('desktop-runtime-disposal');
    tokens.set(runtime, token);
    return () => {
      // StrictMode remounts effects without recreating the memoized runtime.
      queueMicrotask(() => {
        if (!Object.is(tokens.get(runtime), token)) return;
        tokens.delete(runtime);
        runtime.dispose();
      });
    };
  }, [runtime]);
}

type ContentProjectWorkbenchSlots = Pick<
  ControlledWorkbenchShellProps,
  'main' | 'secondaryMain' | 'rightDock' | 'bottomPanel'
>;

function useContentProjectWorkbenchSlots({
  actions,
  instance,
  projection,
  project,
}: {
  readonly actions: ShellActions;
  readonly instance: DesktopWindowCompositionProjection;
  readonly projection: DesktopShellProjection;
  readonly project?: DesktopProjectCatalogItem;
}): ContentProjectWorkbenchSlots {
  const { t } = useTranslation();
  const workbench = instance.layout;
  const workspaceScope =
    instance.scene.context.kind === 'agent' && instance.scene.context.scope.kind === 'workspace'
      ? instance.scene.context.scope
      : undefined;
  const resourceDockPresentation = useResourceDockPresentation(workbench.resourceDock.presentation);
  if (!project) {
    return { main: <SceneSurfaceUnavailable owner="workspace-authority" /> };
  }
  const canvasCapability = projection.domains.find((candidate) => candidate.surface === 'canvas');
  const assetsCapability = projection.domains.find(
    (candidate) => candidate.surface === 'media-library',
  );
  const previewCapability = projection.domains.find((candidate) => candidate.surface === 'preview');
  const cutCapability = projection.domains.find((candidate) => candidate.surface === 'cut');
  const tab = projection.window.tabs.find((candidate) => candidate.projectId === project.projectId);
  if (!tab) {
    throw new Error(`Content Project '${project.projectId}' has no Window-owned View.`);
  }
  const primaryGroup = workbench.main.groups[0];
  if (!primaryGroup) {
    throw new Error('Desktop Workbench requires a primary Main Group.');
  }
  const secondaryGroup = workbench.main.groups[1];
  const resourceDock =
    resourceDockPresentation === 'hidden'
      ? undefined
      : createResourceDock(
          workbench,
          resourceDockPresentation,
          <div className="project-resource-dock">
            <header className="project-resource-dock__header">
              <span>
                <FolderIcon size={15} />
                <strong>{t('workspace.projectResources')}</strong>
              </span>
            </header>
            <div className="project-resource-dock__content">
              {assetsCapability?.status === 'ready' ? (
                <DesktopResourceBrowserSurface
                  project={project}
                  projection={projection}
                  tab={tab}
                />
              ) : (
                <ResourceBrowserUnavailable
                  diagnostic={
                    assetsCapability?.status === 'unavailable'
                      ? assetsCapability.diagnosticCode
                      : 'desktop-media-library-not-mounted'
                  }
                />
              )}
            </div>
          </div>,
        );
  const mainSurface = (
    <MainViewGroupSurface
      visible={isWorkbenchRegionVisible(workbench, 'main')}
      actions={actions}
      canvasCapability={canvasCapability}
      group={primaryGroup}
      previewCapability={previewCapability}
      project={project}
      projection={projection}
      workbenchInstanceId={instance.workbenchInstanceId}
      workbench={workbench}
      authoringAuthority={
        workspaceScope
          ? {
              windowId: instance.scene.windowId,
              workspaceId: workspaceScope.workspaceId,
              workspaceGrantId: workspaceScope.workspaceGrantId,
            }
          : undefined
      }
    />
  );
  const bottomPanel = workbench.cutPanel ? (
    cutCapability?.status === 'ready' ? (
      <CutPanelSurface
        actions={actions}
        panel={workbench.cutPanel}
        project={project}
        projection={projection}
        workbench={workbench}
        workbenchInstanceId={instance.workbenchInstanceId}
      />
    ) : (
      <SceneSurfaceUnavailable owner="cut" />
    )
  ) : undefined;

  return {
    main: (
      <div className="project-main-host">
        <div className="project-main-host__content">{mainSurface}</div>
      </div>
    ),
    bottomPanel,
    secondaryMain: secondaryGroup ? (
      <MainViewGroupSurface
        visible={isWorkbenchRegionVisible(workbench, 'main')}
        actions={actions}
        canvasCapability={canvasCapability}
        group={secondaryGroup}
        previewCapability={previewCapability}
        project={project}
        projection={projection}
        workbenchInstanceId={instance.workbenchInstanceId}
        workbench={workbench}
      />
    ) : undefined,
    rightDock: resourceDock?.content,
  };
}

function CutPanelSurface({
  actions,
  panel,
  project,
  projection,
  workbench,
  workbenchInstanceId,
}: {
  readonly actions: ShellActions;
  readonly panel: NonNullable<DesktopWorkbenchLayoutProjection['cutPanel']>;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly workbench: DesktopWorkbenchLayoutProjection;
  readonly workbenchInstanceId: string;
}): JSX.Element {
  const { t } = useTranslation();
  const activeView = panel.views.find((view) => view.viewId === panel.activeViewId);
  if (!activeView) {
    throw new Error(`Desktop Cut Panel active View '${panel.activeViewId}' is unavailable.`);
  }
  return (
    <section className="project-cut-panel" data-workbench-cut-panel="true">
      <header className="project-cut-panel__tabs">
        <WorkbenchEditorTabs
          activeId={panel.activeViewId}
          emptyLabel={t('workspace.cutTabs.empty')}
          label={t('workspace.cutTabs.label')}
          tabs={panel.views.map((view) => ({
            id: view.viewId,
            label: view.displayLabel,
            closeLabel: t('workspace.cutTabs.close', { name: view.displayLabel }),
          }))}
          onClose={(viewId) => {
            const view = panel.views.find((candidate) => candidate.viewId === viewId);
            if (!view) throw new Error(`Desktop Cut Tab '${viewId}' is unavailable.`);
            actions.onCloseCutView(workbenchInstanceId, view);
          }}
          onReorder={(sourceViewId, targetViewId) => {
            actions.onUpdateWorkbench(
              workbenchInstanceId,
              reorderCutView(workbench, sourceViewId, targetViewId),
            );
          }}
          onSelect={(viewId) => {
            const view = panel.views.find((candidate) => candidate.viewId === viewId);
            if (!view) throw new Error(`Desktop Cut Tab '${viewId}' is unavailable.`);
            actions.onUpdateWorkbench(workbenchInstanceId, openOrFocusCutView(workbench, view));
          }}
        />
        <IconButton
          className="project-cut-panel__add"
          data-cut-tab-add="true"
          icon={<PlusIcon size={15} />}
          label={t('workspace.cutTabs.add')}
          size="xs"
          title={t('workspace.cutTabs.add')}
          onClick={() => actions.onCreateCutDraft(workbenchInstanceId)}
        />
      </header>
      <div className="project-cut-panel__content" data-cut-view-id={activeView.viewId}>
        <DesktopCutSurface project={project} projection={projection} view={activeView} />
      </div>
    </section>
  );
}

type ValidatedAuthoringSnapshot =
  | { readonly kind: 'character'; readonly snapshot: CharacterAuthoringSnapshot }
  | { readonly kind: 'world'; readonly snapshot: WorldAuthoringSnapshot };

function projectAuthoringItemForView(
  view: DesktopWorkbenchLayoutProjection['main']['views'][number],
  project: DesktopProjectCatalogItem,
): ProjectWritableNavigationItem {
  if (view.kind === 'cut') {
    throw new Error('Desktop Cut View cannot become a Main authoring target.');
  }
  if (view.kind === 'character-authoring') {
    if (!view.characterProjectId) {
      throw new Error('Character authoring View requires an exact CharacterProject.');
    }
    return {
      kind: 'authoring-target',
      target: { kind: 'character-project', characterProjectId: view.characterProjectId },
      identity: `character-project:${view.characterProjectId}`,
      label: view.displayLabel,
    };
  }
  if (view.kind === 'world-authoring') {
    if (!view.worldProjectId) {
      throw new Error('World authoring View requires an exact WorldProject.');
    }
    return {
      kind: 'authoring-target',
      target: { kind: 'world-project', worldProjectId: view.worldProjectId },
      identity: `world-project:${view.worldProjectId}`,
      label: view.displayLabel,
    };
  }
  return {
    kind: 'authoring-target',
    target: { kind: 'content-project', contentProjectId: project.projectId },
    identity: `content-project:${project.projectId}`,
    label: project.displayName,
  };
}

function MainViewGroupSurface({
  actions,
  authoringAuthority,
  canvasCapability,
  group,
  previewCapability,
  project,
  projection,
  workbenchInstanceId,
  visible,
  workbench,
}: {
  readonly actions: ShellActions;
  readonly authoringAuthority?: {
    readonly windowId: string;
    readonly workspaceId: string;
    readonly workspaceGrantId: string;
  };
  readonly canvasCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly group: DesktopWorkbenchMainGroup;
  readonly previewCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly workbenchInstanceId: string;
  readonly visible: boolean;
  readonly workbench: DesktopWorkbenchLayoutProjection;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const [contextActionsTarget, setContextActionsTarget] = useState<HTMLDivElement | null>(null);
  const targetViews = useRef(
    new Map<string, DesktopWorkbenchLayoutProjection['main']['views'][number]>(),
  );
  const validatedSnapshots = useRef(new Map<string, ValidatedAuthoringSnapshot>());
  const views = group.viewIds.map((viewId) => {
    const view = workbench.main.views.find((candidate) => candidate.viewId === viewId);
    if (!view) {
      throw new Error(`Desktop Main Group references missing View '${viewId}'.`);
    }
    return view;
  });
  const activeView = views.find((view) => view.viewId === group.activeViewId);
  const requestedTarget = activeView ? projectAuthoringItemForView(activeView, project) : undefined;
  if (activeView && requestedTarget) {
    targetViews.current.set(requestedTarget.identity, activeView);
  }
  const commitOutgoingSnapshot = useCallback(
    async (
      item: ProjectWritableNavigationItem,
    ): Promise<ProjectAuthoringPresentationSnapshotRef> => {
      const view = targetViews.current.get(item.identity);
      if (!view) throw new Error(`Authoring target '${item.identity}' has no mounted View.`);
      return {
        owner:
          item.target.kind === 'content-project'
            ? 'content'
            : item.target.kind === 'character-project'
              ? 'character'
              : 'world',
        targetIdentity: item.identity,
        snapshotId: `workbench-view:${view.viewInstanceId}`,
      };
    },
    [],
  );
  const validateIncomingAuthority = useCallback(
    async (item: ProjectWritableNavigationItem): Promise<void> => {
      if (!authoringAuthority) throw new Error('Workspace authoring authority is unavailable.');
      if (item.target.kind === 'content-project') {
        if (item.target.contentProjectId !== project.projectId) {
          throw new Error('Content authoring target belongs to another Project.');
        }
        return;
      }
      if (item.target.kind === 'character-project') {
        const snapshot = await window.openNekoDesktop.characterAuthoring.getSnapshot(
          authoringAuthority.windowId,
          {
            workspaceId: authoringAuthority.workspaceId,
            workspaceGrantId: authoringAuthority.workspaceGrantId,
            contentProjectId: project.projectId,
            characterProjectId: item.target.characterProjectId,
          },
        );
        validatedSnapshots.current.set(item.identity, { kind: 'character', snapshot });
        return;
      }
      const snapshot = await window.openNekoDesktop.worldAuthoring.getSnapshot(
        authoringAuthority.windowId,
        {
          workspaceId: authoringAuthority.workspaceId,
          workspaceGrantId: authoringAuthority.workspaceGrantId,
          contentProjectId: project.projectId,
          worldProjectId: item.target.worldProjectId,
        },
      );
      validatedSnapshots.current.set(item.identity, { kind: 'world', snapshot });
    },
    [
      authoringAuthority?.windowId,
      authoringAuthority?.workspaceGrantId,
      authoringAuthority?.workspaceId,
      project.projectId,
    ],
  );
  return (
    <WorkbenchMainPanelSurface
      active={workbench.main.activeGroupId === group.groupId}
      mainGroupId={group.groupId}
      panelId={`workspace:${group.groupId}`}
      tabs={
        visible ? (
          <WorkbenchEditorTabs
            activeId={group.activeViewId}
            emptyLabel={t('workspace.mainTabs.empty')}
            label={t('workspace.mainTabs.label')}
            contextActionsRef={setContextActionsTarget}
            tabs={views.map((view) => ({
              id: view.viewId,
              label: view.displayLabel,
              closeLabel: t('workspace.mainTabs.close', { name: view.displayLabel }),
            }))}
            onClose={(viewId) => {
              const view = views.find((candidate) => candidate.viewId === viewId);
              if (!view) throw new Error(`Desktop Main Tab '${viewId}' is unavailable.`);
              actions.onCloseWorkbenchView(workbenchInstanceId, workbench, view);
            }}
            onReorder={(sourceViewId, targetViewId) => {
              actions.onUpdateWorkbench(
                workbenchInstanceId,
                reorderMainView(workbench, group.groupId, sourceViewId, targetViewId),
              );
            }}
            onSelect={(viewId) => {
              const view = views.find((candidate) => candidate.viewId === viewId);
              if (!view) throw new Error(`Desktop Main Tab '${viewId}' is unavailable.`);
              actions.onUpdateWorkbench(workbenchInstanceId, openOrFocusMainView(workbench, view));
            }}
          />
        ) : undefined
      }
    >
      {!visible || views.length === 0 ? (
        <EmptyMainSurface />
      ) : activeView && visible ? (
        <div className="project-main-view-stack__item" data-main-view-id={activeView.viewId}>
          <ProjectAuthoringTargetSwitchRoot
            commitOutgoingSnapshot={commitOutgoingSnapshot}
            requested={requestedTarget}
            validateIncomingAuthority={validateIncomingAuthority}
            renderTarget={(item) => {
              const view = targetViews.current.get(item.identity);
              if (!view) {
                throw new Error(`Authoring target '${item.identity}' has no exact Workbench View.`);
              }
              return renderWorkbenchMainView({
                canvasCapability,
                authoringAuthority,
                previewCapability,
                project,
                projection,
                contextActionsTarget,
                locale,
                validatedSnapshot: validatedSnapshots.current.get(item.identity),
                view,
              });
            }}
          />
        </div>
      ) : null}
    </WorkbenchMainPanelSurface>
  );
}

function renderWorkbenchMainView({
  authoringAuthority,
  canvasCapability,
  contextActionsTarget,
  locale,
  previewCapability,
  project,
  projection,
  validatedSnapshot,
  view,
}: {
  readonly authoringAuthority?: {
    readonly windowId: string;
    readonly workspaceId: string;
    readonly workspaceGrantId: string;
  };
  readonly canvasCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly contextActionsTarget: HTMLDivElement | null;
  readonly locale: SupportedLocale;
  readonly previewCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly validatedSnapshot?: ValidatedAuthoringSnapshot;
  readonly view: DesktopWorkbenchLayoutProjection['main']['views'][number];
}): JSX.Element {
  if (view.kind === 'text-editor') {
    return (
      <DesktopTextEditorSurface
        contextActionsTarget={contextActionsTarget}
        project={project}
        projection={projection}
        view={view}
      />
    );
  }
  if (view.kind === 'preview' && previewCapability?.status === 'ready') {
    return <DesktopPreviewSurface project={project} projection={projection} view={view} />;
  }
  if (view.kind === 'canvas' && canvasCapability?.status === 'ready') {
    return <DesktopCanvasSurface project={project} projection={projection} view={view} />;
  }
  if (view.kind === 'character-authoring') {
    if (!authoringAuthority || !view.characterProjectId) {
      return <SceneSurfaceUnavailable owner="character-authoring-authority" />;
    }
    return (
      <CharacterAuthoringStudioRoot
        binding={{
          workspaceId: authoringAuthority.workspaceId,
          workspaceGrantId: authoringAuthority.workspaceGrantId,
          contentProjectId: project.projectId,
          characterProjectId: view.characterProjectId,
        }}
        host={window.openNekoDesktop.characterAuthoring}
        initialSnapshot={
          validatedSnapshot?.kind === 'character' ? validatedSnapshot.snapshot : undefined
        }
        locale={locale}
        windowId={authoringAuthority.windowId}
      />
    );
  }
  if (view.kind === 'world-authoring') {
    if (!authoringAuthority || !view.worldProjectId) {
      return <SceneSurfaceUnavailable owner="world-authoring-authority" />;
    }
    return (
      <WorldAuthoringStudioRoot
        binding={{
          workspaceId: authoringAuthority.workspaceId,
          workspaceGrantId: authoringAuthority.workspaceGrantId,
          contentProjectId: project.projectId,
          worldProjectId: view.worldProjectId,
        }}
        host={window.openNekoDesktop.worldAuthoring}
        initialSnapshot={
          validatedSnapshot?.kind === 'world' ? validatedSnapshot.snapshot : undefined
        }
        locale={locale}
        windowId={authoringAuthority.windowId}
      />
    );
  }
  if (view.kind === 'cut') {
    throw new Error('Desktop Cut Views must render in the Cut Panel, not Main.');
  }
  return (
    <CreativeMainPlaceholder
      canvasDiagnostic={
        canvasCapability?.status === 'unavailable'
          ? canvasCapability.diagnosticCode
          : 'desktop-canvas-not-mounted'
      }
      project={project}
    />
  );
}

type WorkbenchDisplayMode = 'chat-main-left' | 'chat-main-right' | 'chat-only' | 'main-only';

function WorkspaceRegionControls({
  actions,
  disabled,
  regionState,
  workbench,
  workbenchInstanceId,
}: {
  readonly actions: ShellActions;
  readonly disabled: boolean;
  readonly regionState: Readonly<
    Record<WorkbenchRegion, { readonly available: boolean; readonly selected: boolean }>
  >;
  readonly workbench: DesktopWorkbenchLayoutProjection;
  readonly workbenchInstanceId: string;
}): JSX.Element {
  const { t } = useTranslation();
  const [creativePanelsOpen, setCreativePanelsOpen] = useState(false);
  const creativePanelsSelected = regionState.main.selected || regionState.cutPanel.selected;
  return (
    <div
      className="workspace-region-controls"
      role="group"
      aria-label={t('workspace.layoutControls')}
    >
      <IconButton
        className="workbench-region-toggle"
        data-workbench-region-control="agent"
        disabled={
          disabled ||
          !regionState.agent.available ||
          (regionState.agent.selected &&
            !regionState.main.selected &&
            !regionState.cutPanel.selected)
        }
        icon={<span className={toCodiconClassName('layout-sidebar-left')} aria-hidden="true" />}
        label={t('workspace.agent')}
        size="xs"
        title={t('workspace.agent')}
        aria-pressed={regionState.agent.selected}
        onClick={() =>
          actions.onUpdateWorkbench(workbenchInstanceId, toggleWorkbenchRegion(workbench, 'agent'))
        }
      />
      <Popover
        align="end"
        contentClassName="workspace-creative-panels-popover"
        onOpenChange={setCreativePanelsOpen}
        open={creativePanelsOpen}
        trigger={
          <IconButton
            className="workbench-region-toggle"
            data-workbench-region-control="creative-panels"
            disabled={disabled || (!regionState.main.available && !regionState.cutPanel.available)}
            icon={<span className={toCodiconClassName('layout')} aria-hidden="true" />}
            label={t('workspace.creativePanels')}
            size="xs"
            title={t('workspace.creativePanels')}
            aria-expanded={creativePanelsOpen}
            aria-haspopup="menu"
            aria-pressed={creativePanelsSelected}
          />
        }
      >
        <div
          className="workspace-creative-panels-popover__menu"
          role="menu"
          aria-label={t('workspace.creativePanels')}
        >
          <button
            type="button"
            className="workspace-creative-panels-popover__item"
            data-workbench-region-option="main"
            disabled={
              disabled ||
              !regionState.main.available ||
              (regionState.main.selected &&
                !regionState.agent.selected &&
                !regionState.cutPanel.selected)
            }
            role="menuitemcheckbox"
            aria-checked={regionState.main.selected}
            onClick={() =>
              actions.onUpdateWorkbench(
                workbenchInstanceId,
                toggleWorkbenchRegion(workbench, 'main'),
              )
            }
          >
            <span className={toCodiconClassName('layout-centered')} aria-hidden="true" />
            <span>{t('workspace.mainPanel')}</span>
            <span className="workspace-creative-panels-popover__check" aria-hidden="true">
              {regionState.main.selected ? <span className={toCodiconClassName('check')} /> : null}
            </span>
          </button>
          <button
            type="button"
            className="workspace-creative-panels-popover__item"
            data-workbench-region-option="cut-panel"
            disabled={
              disabled ||
              !regionState.cutPanel.available ||
              (regionState.cutPanel.selected &&
                !regionState.agent.selected &&
                !regionState.main.selected)
            }
            role="menuitemcheckbox"
            aria-checked={regionState.cutPanel.selected}
            onClick={() =>
              workbench.cutPanel
                ? actions.onUpdateWorkbench(
                    workbenchInstanceId,
                    toggleWorkbenchRegion(workbench, 'cutPanel'),
                  )
                : actions.onCreateCutDraft(workbenchInstanceId)
            }
          >
            <span className={toCodiconClassName('layout-panel')} aria-hidden="true" />
            <span>{t('workspace.cutPanel')}</span>
            <span className="workspace-creative-panels-popover__check" aria-hidden="true">
              {regionState.cutPanel.selected ? (
                <span className={toCodiconClassName('check')} />
              ) : null}
            </span>
          </button>
        </div>
      </Popover>
      <IconButton
        className="workbench-region-toggle"
        data-workbench-region-control="management"
        disabled={disabled || !regionState.management.available}
        icon={<span className={toCodiconClassName('layout-sidebar-right')} aria-hidden="true" />}
        label={t('workspace.projectResources')}
        size="xs"
        title={t('workspace.projectResources')}
        aria-pressed={regionState.management.selected}
        onClick={() =>
          actions.onUpdateWorkbench(
            workbenchInstanceId,
            toggleWorkbenchRegion(workbench, 'management'),
          )
        }
      />
    </div>
  );
}

function createResourceDock(
  workbench: DesktopWorkbenchLayoutProjection,
  presentation: 'docked' | 'overlay',
  resources: JSX.Element,
): {
  readonly content: JSX.Element;
  readonly owner: 'resources';
  readonly presentation: 'docked' | 'overlay';
  readonly width: number;
} {
  return {
    content: (
      <div className="project-dock-panel" data-dock-owner="resources">
        {resources}
      </div>
    ),
    owner: 'resources',
    presentation,
    width: workbench.resourceDock.width,
  };
}

function useResourceDockPresentation(
  presentation: 'hidden' | 'docked' | 'overlay',
): 'hidden' | 'docked' | 'overlay' {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1100,
  );
  useEffect(() => {
    const update = (): void => setCompact(window.innerWidth < 1100);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return presentation === 'docked' && compact ? 'overlay' : presentation;
}

function createProjectDockResizeBinding({
  actions,
  dock,
  label,
  workbench,
  workbenchInstanceId,
}: {
  readonly actions: ShellActions;
  readonly dock: {
    readonly owner: 'agent' | 'resources';
    readonly presentation: 'docked' | 'overlay';
    readonly width: number;
    readonly content: JSX.Element;
  };
  readonly label: string;
  readonly workbench: DesktopWorkbenchLayoutProjection;
  readonly workbenchInstanceId: string;
}) {
  return {
    label,
    minSize: DESKTOP_WORKBENCH_LIMITS.dockWidth.min,
    maxSize: DESKTOP_WORKBENCH_LIMITS.dockWidth.max,
    onResizeEnd: (width: number) => {
      const currentWidth =
        dock.owner === 'agent' ? workbench.display.chatWidth : workbench.resourceDock.width;
      if (currentWidth === width) return;
      actions.onUpdateWorkbench(
        workbenchInstanceId,
        resizeProjectDockWorkbench(workbench, dock.owner, width),
      );
    },
  };
}

export function createManagementMainSplitResizeBinding({
  label,
  onResizeEnd,
}: {
  readonly label: string;
  readonly onResizeEnd: (ratio: number) => void;
}): ControlledWorkbenchResizeBinding {
  return {
    label,
    minSize: MANAGEMENT_MAIN_SPLIT_MIN_RATIO,
    maxSize: DESKTOP_WORKBENCH_LIMITS.mainSplitRatio.max,
    onResizeEnd,
  };
}

export function resizeApplicationSidebar(
  sidebar: DesktopApplicationSidebarProjection,
  width: number,
): DesktopApplicationSidebarProjection {
  return {
    ...sidebar,
    width,
  };
}

function createApplicationPrimarySidebarResizeBinding({
  actions,
  disabled,
  t,
  sidebar,
}: {
  readonly actions: ShellActions;
  readonly disabled: boolean;
  readonly t: TranslationFunction;
  readonly sidebar: DesktopApplicationSidebarProjection;
}): ControlledWorkbenchResizeBinding | undefined {
  if (disabled) return undefined;
  return {
    label: t('workspace.resizePrimarySidebar'),
    minSize: DESKTOP_APPLICATION_SIDEBAR_WIDTH_LIMITS.min,
    maxSize: DESKTOP_APPLICATION_SIDEBAR_WIDTH_LIMITS.max,
    onResizeEnd: (width) => {
      if (width === sidebar.width) return;
      actions.onUpdateApplicationSidebar(resizeApplicationSidebar(sidebar, width));
    },
  };
}

function toggleApplicationSidebar(
  sidebar: DesktopApplicationSidebarProjection,
): DesktopApplicationSidebarProjection {
  return {
    ...sidebar,
    visible: !sidebar.visible,
  };
}

export function resizeProjectDockWorkbench(
  workbench: DesktopWorkbenchLayoutProjection,
  owner: 'agent' | 'resources',
  width: number,
): DesktopWorkbenchLayoutProjection {
  return {
    ...workbench,
    display:
      owner === 'agent'
        ? {
            ...workbench.display,
            chatWidth: width,
          }
        : workbench.display,
    resourceDock:
      owner === 'resources'
        ? {
            ...workbench.resourceDock,
            width,
          }
        : workbench.resourceDock,
  };
}

export function setResourceDockPresentationWorkbench(
  workbench: DesktopWorkbenchLayoutProjection,
  presentation: 'hidden' | 'docked' | 'overlay',
): DesktopWorkbenchLayoutProjection {
  return {
    ...workbench,
    resourceDock: {
      ...workbench.resourceDock,
      presentation,
    },
  };
}

type WorkbenchRegion = 'agent' | 'main' | 'management' | 'cutPanel';

function isWorkbenchRegionVisible(
  workbench: DesktopWorkbenchLayoutProjection,
  region: WorkbenchRegion,
): boolean {
  if (region === 'agent') {
    return workbench.display.mode === 'chat-main' || workbench.display.mode === 'chat-only';
  }
  if (region === 'main') {
    return (
      workbench.main.views.length > 0 &&
      (workbench.display.mode === 'chat-main' || workbench.display.mode === 'main-only')
    );
  }
  if (region === 'management') return workbench.resourceDock.presentation !== 'hidden';
  return workbench.cutPanel?.presentation === 'docked';
}

export function toggleWorkbenchRegion(
  workbench: DesktopWorkbenchLayoutProjection,
  region: WorkbenchRegion,
): DesktopWorkbenchLayoutProjection {
  const agentVisible = isWorkbenchRegionVisible(workbench, 'agent');
  const mainVisible = isWorkbenchRegionVisible(workbench, 'main');
  const cutPanelVisible = isWorkbenchRegionVisible(workbench, 'cutPanel');
  if (region === 'agent') {
    if (agentVisible) {
      if (mainVisible) return setWorkbenchDisplayMode(workbench, 'main-only');
      if (cutPanelVisible) return setWorkbenchDisplayMode(workbench, 'empty-main');
      throw new Error('Desktop Workbench cannot hide the last visible business region.');
    }
    return setWorkbenchDisplayMode(
      workbench,
      mainVisible ? 'chat-main' : 'chat-only',
      workbench.display.chatPosition,
    );
  }
  if (region === 'main') {
    if (mainVisible) {
      if (agentVisible) return setWorkbenchDisplayMode(workbench, 'chat-only');
      if (cutPanelVisible) return setWorkbenchDisplayMode(workbench, 'empty-main');
      throw new Error('Desktop Workbench cannot hide the last visible business region.');
    }
    return setWorkbenchDisplayMode(
      workbench,
      agentVisible ? 'chat-main' : 'main-only',
      workbench.display.chatPosition,
    );
  }
  if (region === 'management') {
    return setResourceDockPresentationWorkbench(
      workbench,
      isWorkbenchRegionVisible(workbench, 'management') ? 'hidden' : 'docked',
    );
  }
  if (!workbench.cutPanel) {
    throw new Error('Desktop Workbench cannot toggle Cut Panel without an attached Cut View.');
  }
  if (cutPanelVisible && !agentVisible && !mainVisible) {
    throw new Error('Desktop Workbench cannot hide the last visible business region.');
  }
  return setCutPanelPresentation(
    workbench,
    workbench.cutPanel.presentation === 'docked' ? 'hidden' : 'docked',
  );
}

export function applyWorkbenchDisplayMode(
  workbench: DesktopWorkbenchLayoutProjection,
  mode: WorkbenchDisplayMode,
): DesktopWorkbenchLayoutProjection {
  if (mode === 'chat-only') return setWorkbenchDisplayMode(workbench, 'chat-only');
  if (mode === 'main-only') return setWorkbenchDisplayMode(workbench, 'main-only');
  const requestedPosition = mode === 'chat-main-left' ? 'left' : 'right';
  return setWorkbenchDisplayMode(workbench, 'chat-main', requestedPosition);
}

function CreativeMainPlaceholder({
  canvasDiagnostic,
  project,
}: {
  readonly canvasDiagnostic: string;
  readonly project: DesktopProjectCatalogItem;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <section className="creative-main-placeholder dotted-surface">
      <div>
        <GridIcon size={24} />
        <h2>{t('workspace.creativeMain')}</h2>
        <p>{t('workspace.creativeMainDetail', { project: project.displayName })}</p>
        <code>{canvasDiagnostic}</code>
      </div>
    </section>
  );
}

function EmptyMainSurface(): JSX.Element {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('workspace.mainTabs.empty')}
      className="creative-main-placeholder dotted-surface"
      data-empty-main="true"
    >
      <div>
        <GridIcon size={24} />
        <h2>{t('workspace.mainTabs.empty')}</h2>
        <p>{t('workspace.mainTabs.emptyDetail')}</p>
      </div>
    </section>
  );
}

function ResourceBrowserUnavailable({ diagnostic }: { readonly diagnostic: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <section className="resource-browser-unavailable" aria-label={t('workspace.resources')}>
      <header>
        <div>
          <FolderIcon size={15} />
          <strong>{t('workspace.resources')}</strong>
        </div>
        <span>{t('home.unavailable')}</span>
      </header>
      <div className="resource-dock-tabs" role="tablist" aria-label={t('workspace.resourceFacets')}>
        <span role="tab" aria-selected="true">
          {t('workspace.files')}
        </span>
        <span role="tab" aria-selected="false">
          {t('workspace.media')}
        </span>
        <span role="tab" aria-selected="false">
          {t('workspace.entities')}
        </span>
      </div>
      <div className="resource-dock-empty">
        <FolderIcon size={23} />
        <strong>{t('workspace.assets.unavailable')}</strong>
        <p>{t('workspace.assets.detail')}</p>
        <code>{diagnostic}</code>
      </div>
    </section>
  );
}

function ApplicationPrimarySidebar({
  activeProjectId,
  activeSection,
  compact,
  disabled = false,
  onDeleteConversations,
  onDeleteProjectConversations,
  onManageProjects,
  onNavigate,
  onOpenConversation,
  onOpenRecent,
  onRemoveProject,
  onOpenSettings,
  onToggle,
  projection,
  projectPortabilityPort,
}: {
  readonly activeProjectId?: string;
  readonly activeSection?: HomeSection;
  readonly compact: boolean;
  readonly disabled?: boolean;
  readonly onDeleteConversations: (
    conversations: readonly DesktopAgentHomeConversationSummary[],
  ) => void;
  readonly onDeleteProjectConversations: (project: DesktopProjectCatalogItem) => void;
  readonly onManageProjects: () => void;
  readonly onNavigate: (section: HomeSection) => void;
  readonly onOpenConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onOpenRecent: (projectId: string) => void;
  readonly onRemoveProject: (project: DesktopProjectCatalogItem) => void;
  readonly onOpenSettings: () => void;
  readonly onToggle: () => void;
  readonly projection: DesktopShellProjection;
  readonly projectPortabilityPort?: OpenNekoDesktopProjectPortabilityBridge['projectPortability'];
}): JSX.Element {
  const { t } = useTranslation();
  const [portabilityProjectId, setPortabilityProjectId] = useState<string>();
  const portabilityProject = projection.catalog.projects.find(
    (project) => project.projectId === portabilityProjectId,
  );
  return (
    <aside
      className={`home-navigation project-primary-sidebar ${
        compact ? 'home-navigation--compact project-primary-sidebar--compact' : ''
      }`}
      data-primary-sidebar="application"
    >
      <PrimarySidebarBrand compact={compact} disabled={disabled} onToggle={onToggle} />
      <nav className="home-primary-navigation" aria-label={t('workspace.primaryNavigation')}>
        <DesktopApplicationNavigationButton
          active={activeSection === 'create'}
          disabled={disabled}
          label={t('home.overview')}
          icon={<PlusIcon size={17} />}
          onClick={() => onNavigate('create')}
        />
        <DesktopApplicationNavigationButton
          active={activeSection === 'characters'}
          disabled={disabled}
          label={t('home.characters')}
          icon={<UserIcon size={17} />}
          onClick={() => onNavigate('characters')}
        />
        <DesktopApplicationNavigationButton
          active={activeSection === 'worlds'}
          disabled={disabled}
          label={t('home.worlds')}
          icon={<GridIcon size={17} />}
          onClick={() => onNavigate('worlds')}
        />
        <DesktopApplicationNavigationButton
          active={activeSection === 'assets'}
          disabled={disabled}
          label={t('home.mediaLibrary')}
          icon={<SearchIcon size={17} />}
          onClick={() => onNavigate('assets')}
        />
        <DesktopApplicationNavigationButton
          active={activeSection === 'extensions'}
          disabled={disabled}
          label={t('home.capabilities')}
          icon={<PackageIcon size={17} />}
          onClick={() => onNavigate('extensions')}
        />
        <DesktopApplicationNavigationButton
          active={activeSection === 'projects'}
          disabled={disabled}
          label={t('home.allProjects')}
          icon={<FolderIcon size={17} />}
          onClick={() => onNavigate('projects')}
        />
      </nav>
      <PrimaryRecentNavigation
        activeProjectId={activeProjectId}
        disabled={disabled}
        onDeleteConversations={onDeleteConversations}
        onDeleteProjectConversations={onDeleteProjectConversations}
        onManageProjects={onManageProjects}
        onOpenConversation={onOpenConversation}
        onOpenPortability={
          projectPortabilityPort
            ? (project) => setPortabilityProjectId(project.projectId)
            : undefined
        }
        onOpenRecent={onOpenRecent}
        onRemoveProject={onRemoveProject}
        projection={projection}
      />
      <PrimarySidebarFooter onOpenSettings={onOpenSettings} projection={projection} />
      {portabilityProject && projectPortabilityPort ? (
        <ProjectPortabilityDialog
          disabled={disabled}
          onOpenChange={(open) => {
            if (!open) setPortabilityProjectId(undefined);
          }}
          open
          rendererSessionId={projection.rendererSessionId}
          project={portabilityProject}
          port={projectPortabilityPort}
          windowId={projection.window.windowId}
        />
      ) : null}
    </aside>
  );
}

type PrimaryNavigationSectionId = 'projects' | 'conversations' | 'characters' | 'worlds';

type PrimaryNavigationClassification = DesktopConversationNavigationGroup['kind'] | 'world';

const PRIMARY_NAVIGATION_SECTION_BY_CLASSIFICATION = {
  project: 'projects',
  workspace: 'projects',
  assistant: 'conversations',
  character: 'characters',
  room: 'characters',
  world: 'worlds',
} satisfies Readonly<Record<PrimaryNavigationClassification, PrimaryNavigationSectionId>>;

function partitionPrimaryNavigationGroups(groups: readonly DesktopConversationNavigationGroup[]): {
  readonly projects: readonly DesktopConversationNavigationGroup[];
  readonly conversations: readonly DesktopConversationNavigationGroup[];
  readonly characters: readonly DesktopConversationNavigationGroup[];
  readonly worlds: readonly DesktopConversationNavigationGroup[];
} {
  const projects: DesktopConversationNavigationGroup[] = [];
  const conversations: DesktopConversationNavigationGroup[] = [];
  const characters: DesktopConversationNavigationGroup[] = [];
  for (const group of groups) {
    switch (PRIMARY_NAVIGATION_SECTION_BY_CLASSIFICATION[group.kind]) {
      case 'projects':
        projects.push(group);
        break;
      case 'conversations':
        conversations.push(group);
        break;
      case 'characters':
        characters.push(group);
        break;
    }
  }
  return { projects, conversations, characters, worlds: [] };
}

function PrimaryRecentNavigation({
  activeProjectId,
  disabled = false,
  onDeleteConversations,
  onDeleteProjectConversations,
  onManageProjects,
  onOpenConversation,
  onOpenPortability,
  onOpenRecent,
  onRemoveProject,
  projection,
}: {
  readonly activeProjectId?: string;
  readonly disabled?: boolean;
  readonly onDeleteConversations: (
    conversations: readonly DesktopAgentHomeConversationSummary[],
  ) => void;
  readonly onDeleteProjectConversations: (project: DesktopProjectCatalogItem) => void;
  readonly onManageProjects: () => void;
  readonly onOpenConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onOpenPortability?: (project: DesktopProjectCatalogItem) => void;
  readonly onOpenRecent: (projectId: string) => void;
  readonly onRemoveProject: (project: DesktopProjectCatalogItem) => void;
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { t } = useTranslation();
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [showAllGroups, setShowAllGroups] = useState<ReadonlySet<string>>(() => new Set());
  const activeScene = resolveActiveDesktopWindowWorkbench(projection.window).scene;
  const activeConversationId =
    activeScene.context.kind === 'agent' && activeScene.context.scope.kind !== 'unbound'
      ? activeScene.context.scope.conversationId
      : undefined;
  const navigationGroups = partitionPrimaryNavigationGroups(
    projection.conversationNavigation.groups,
  );
  const assistantConversationCount = navigationGroups.conversations.reduce(
    (count, group) => count + group.conversations.length,
    0,
  );
  const characterConversationCount = navigationGroups.characters.reduce(
    (count, group) => count + group.conversations.length,
    0,
  );
  const toggleCollapsed = (group: DesktopConversationNavigationGroup) => {
    const key = conversationGroupKey(group);
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleShowAll = (group: DesktopConversationNavigationGroup) => {
    const key = conversationGroupKey(group);
    setShowAllGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const renderNavigationGroup = (group: DesktopConversationNavigationGroup): JSX.Element => {
    const key = conversationGroupKey(group);
    const collapsed = collapsedGroups.has(key);
    const showAll = showAllGroups.has(key);
    const conversations = showAll
      ? group.conversations
      : group.conversations.slice(0, INITIAL_CONVERSATIONS_PER_GROUP);
    const project =
      group.kind === 'project'
        ? projection.catalog.projects.find((candidate) => candidate.projectId === group.projectId)
        : undefined;
    const projectUnavailable = project?.unavailable;
    const workspaceConversationCount =
      group.kind === 'project'
        ? group.conversations.filter(
            (conversation) =>
              conversation.navigation.owner.kind === 'workspace' &&
              conversation.navigation.owner.workspaceId === group.workspaceId,
          ).length
        : 0;
    if (group.kind === 'project' && !project) {
      throw new Error(`Conversation navigation references missing Project '${group.projectId}'.`);
    }
    return (
      <section
        className="primary-conversation-group"
        data-group-id={key}
        data-group-kind={group.kind}
        key={key}
      >
        {group.kind === 'project' && project ? (
          <ContextMenu
            items={createProjectNavigationMenuItems({
              disabled,
              onDeleteConversations: () => onDeleteProjectConversations(project),
              onManageProjects,
              onOpen: () => onOpenRecent(project.projectId),
              onOpenPortability: onOpenPortability ? () => onOpenPortability(project) : undefined,
              onRemove: () => onRemoveProject(project),
              project,
              t,
              workspaceConversationCount,
            })}
            trigger={
              <div
                className="primary-recent-project-row primary-conversation-group__header"
                data-active={project.projectId === activeProjectId ? 'true' : 'false'}
              >
                {group.conversations.length > 0 ? (
                  <IconButton
                    className="primary-conversation-group__collapse"
                    disabled={disabled}
                    size="xs"
                    label={
                      collapsed
                        ? t('home.expandConversationGroup', { group: project.displayName })
                        : t('home.collapseConversationGroup', { group: project.displayName })
                    }
                    aria-expanded={!collapsed}
                    icon={
                      collapsed ? <ChevronRightIcon size={13} /> : <ChevronDownIcon size={13} />
                    }
                    onClick={() => toggleCollapsed(group)}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="primary-conversation-group__collapse-spacer"
                  />
                )}
                <button
                  type="button"
                  className="home-project-link primary-conversation-group__project-link"
                  disabled={disabled || projectUnavailable !== undefined}
                  title={projectUnavailable?.message}
                  onClick={() => onOpenRecent(project.projectId)}
                >
                  {conversationGroupIcon(group)}
                  <span>{project.displayName}</span>
                </button>
                <span className="primary-conversation-group__count">
                  {group.conversations.length}
                </span>
                <span className="primary-navigation-state">
                  {projectUnavailable ? (
                    <NavigationUnavailableStatus message={projectUnavailable.message} />
                  ) : null}
                </span>
                <span className="primary-navigation-row-actions">
                  {!projectUnavailable ? (
                    <IconButton
                      disabled={disabled}
                      size="xs"
                      label={t('home.newProjectConversation', { project: project.displayName })}
                      title={t('home.newProjectConversation', { project: project.displayName })}
                      icon={<PlusIcon size={13} />}
                      onClick={() => onOpenRecent(project.projectId)}
                    />
                  ) : null}
                  <IconButton
                    disabled={disabled || workspaceConversationCount === 0}
                    size="xs"
                    label={t('shell.deleteProjectConversations', {
                      project: project.displayName,
                    })}
                    title={t('shell.deleteProjectConversations', {
                      project: project.displayName,
                    })}
                    icon={<TrashIcon size={13} />}
                    onClick={() => onDeleteProjectConversations(project)}
                  />
                  <IconButton
                    disabled={disabled}
                    size="xs"
                    label={t('shell.removeProject', { project: project.displayName })}
                    title={t('shell.removeProject', { project: project.displayName })}
                    icon={<RemoveIcon size={13} />}
                    onClick={() => onRemoveProject(project)}
                  />
                </span>
              </div>
            }
          />
        ) : (
          <StandaloneConversationGroupHeader
            collapsed={collapsed}
            disabled={disabled}
            group={group}
            onDeleteConversations={() => onDeleteConversations(group.conversations)}
            onToggle={() => toggleCollapsed(group)}
          />
        )}
        {!collapsed ? (
          <div className="primary-conversation-group__children">
            {conversations.map((conversation) => (
              <ConversationNavigationRow
                active={conversation.navigation.conversationId === activeConversationId}
                conversation={conversation}
                disabled={disabled}
                key={conversation.navigation.conversationId}
                navigationDisabled={
                  disabled || group.kind === 'workspace' || projectUnavailable !== undefined
                }
                onDelete={(conversation) => onDeleteConversations([conversation])}
                onOpen={onOpenConversation}
              />
            ))}
            {group.conversations.length > INITIAL_CONVERSATIONS_PER_GROUP ? (
              <button
                type="button"
                className="primary-conversation-group__expand"
                disabled={disabled}
                onClick={() => toggleShowAll(group)}
              >
                {showAll ? t('home.collapseConversations') : t('home.expandConversations')}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  };
  return (
    <div className="home-recent-navigation">
      <section className="primary-navigation-section" data-navigation-section="projects">
        <div className="home-sidebar-heading">
          <span>{t('home.projects')}</span>
          <span>{navigationGroups.projects.length}</span>
        </div>
        {navigationGroups.projects.map(renderNavigationGroup)}
      </section>
      <section className="primary-navigation-section" data-navigation-section="conversations">
        <div className="home-sidebar-heading">
          <span>{t('home.conversations')}</span>
          <span>{assistantConversationCount}</span>
        </div>
        {navigationGroups.conversations.map(renderNavigationGroup)}
      </section>
      <section className="primary-navigation-section" data-navigation-section="characters">
        <div className="home-sidebar-heading">
          <span>{t('home.characters')}</span>
          <span>{characterConversationCount}</span>
        </div>
        {navigationGroups.characters.map(renderNavigationGroup)}
      </section>
      <section className="primary-navigation-section" data-navigation-section="worlds">
        <div className="home-sidebar-heading">
          <span>{t('home.worlds')}</span>
          <span>{navigationGroups.worlds.length}</span>
        </div>
      </section>
    </div>
  );
}

function StandaloneConversationGroupHeader({
  collapsed,
  disabled,
  group,
  onDeleteConversations,
  onToggle,
}: {
  readonly collapsed: boolean;
  readonly disabled: boolean;
  readonly group: DesktopConversationNavigationGroup;
  readonly onDeleteConversations: () => void;
  readonly onToggle: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  if (group.kind === 'project') {
    throw new Error(`Project group '${group.projectId}' requires a Project navigation header.`);
  }
  const label = formatStandaloneConversationGroup(group, t);
  const header = (
    <div
      className={`primary-conversation-group__standalone-heading ${
        group.kind === 'workspace' ? 'primary-recent-project-row' : ''
      }`}
    >
      <IconButton
        className="primary-conversation-group__collapse"
        disabled={disabled}
        size="xs"
        label={
          collapsed
            ? t('home.expandConversationGroup', { group: label })
            : t('home.collapseConversationGroup', { group: label })
        }
        aria-expanded={!collapsed}
        icon={collapsed ? <ChevronRightIcon size={13} /> : <ChevronDownIcon size={13} />}
        onClick={onToggle}
      />
      {conversationGroupIcon(group)}
      <span className="primary-conversation-group__label">{label}</span>
      <span className="primary-conversation-group__count">{group.conversations.length}</span>
      <span className="primary-navigation-state">
        {group.kind === 'workspace' ? (
          <NavigationUnavailableStatus message={group.message} />
        ) : null}
      </span>
      {group.kind === 'workspace' ? (
        <span className="primary-navigation-row-actions">
          <IconButton
            disabled={disabled}
            size="xs"
            label={t('shell.deleteWorkspaceConversations')}
            title={t('shell.deleteWorkspaceConversations')}
            icon={<TrashIcon size={13} />}
            onClick={onDeleteConversations}
          />
        </span>
      ) : null}
    </div>
  );
  return group.kind === 'workspace' ? (
    <ContextMenu
      items={createWorkspaceNavigationMenuItems({
        disabled,
        onDeleteConversations,
        t,
      })}
      trigger={header}
    />
  ) : (
    header
  );
}

const INITIAL_CONVERSATIONS_PER_GROUP = 5;

function ConversationNavigationRow({
  active,
  conversation,
  disabled,
  navigationDisabled,
  onDelete,
  onOpen,
}: {
  readonly active: boolean;
  readonly conversation: DesktopAgentHomeConversationSummary;
  readonly disabled: boolean;
  readonly navigationDisabled: boolean;
  readonly onDelete: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onOpen: (conversation: DesktopAgentHomeConversationSummary) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <ContextMenu
      items={createConversationNavigationMenuItems({
        conversation,
        disabled,
        navigationDisabled,
        onDelete: () => onDelete(conversation),
        onOpen: () => onOpen(conversation),
        t,
      })}
      trigger={
        <div
          className="primary-recent-project-row primary-recent-conversation-row"
          data-active={active ? 'true' : 'false'}
        >
          <button
            type="button"
            className="home-project-link home-conversation-link"
            disabled={navigationDisabled || conversation.unavailable !== undefined}
            title={conversation.unavailable?.message}
            onClick={() => onOpen(conversation)}
          >
            <MessageIcon
              className="primary-conversation-group__identity-icon is-conversation"
              size={13}
            />
            <span>{conversation.title}</span>
          </button>
          <span className="primary-navigation-state">
            {conversation.unavailable ? (
              <NavigationUnavailableStatus message={conversation.unavailable.message} />
            ) : conversation.attention !== 'none' ? (
              <ConversationAttentionStatus attention={conversation.attention} />
            ) : null}
          </span>
          <span className="primary-navigation-row-actions">
            <IconButton
              disabled={disabled}
              size="xs"
              label={t('shell.deleteConversation', { conversation: conversation.title })}
              icon={<TrashIcon size={13} />}
              onClick={() => onDelete(conversation)}
            />
          </span>
        </div>
      }
    />
  );
}

function ConversationAttentionStatus({
  attention,
}: {
  readonly attention: Exclude<DesktopAgentHomeConversationSummary['attention'], 'none'>;
}): JSX.Element {
  const { t } = useTranslation();
  const label = formatAttention(attention, t);
  return (
    <Tooltip content={label} side="right">
      <span
        className={`home-conversation-status is-${attention}`}
        role="status"
        title={label}
        aria-label={label}
      >
        {conversationAttentionIcon(attention)}
      </span>
    </Tooltip>
  );
}

function conversationAttentionIcon(
  attention: Exclude<DesktopAgentHomeConversationSummary['attention'], 'none'>,
): JSX.Element {
  switch (attention) {
    case 'running':
      return <LoadingIcon size={12} />;
    case 'needs-input':
      return <WarningIcon size={12} />;
    case 'needs-review':
      return <ClockIcon size={12} />;
  }
}

function createProjectNavigationMenuItems(input: {
  readonly disabled: boolean;
  readonly onDeleteConversations: () => void;
  readonly onManageProjects: () => void;
  readonly onOpen: () => void;
  readonly onOpenPortability?: () => void;
  readonly onRemove: () => void;
  readonly project: DesktopProjectCatalogItem;
  readonly t: TranslationFunction;
  readonly workspaceConversationCount: number;
}): readonly ContextMenuItem[] {
  const unavailable = input.project.unavailable !== undefined;
  return [
    {
      id: 'open-project',
      label: (
        <NavigationMenuLabel icon={<OpenIcon size={14} />} text={input.t('home.openProject')} />
      ),
      disabled: input.disabled || unavailable,
      onSelect: input.onOpen,
    },
    {
      id: 'new-project-conversation',
      label: (
        <NavigationMenuLabel
          icon={<PlusIcon size={14} />}
          text={input.t('home.newProjectConversation', { project: input.project.displayName })}
        />
      ),
      disabled: input.disabled || unavailable,
      onSelect: input.onOpen,
    },
    {
      id: 'manage-projects',
      label: (
        <NavigationMenuLabel
          icon={<FolderIcon size={14} />}
          text={input.t('home.projectManagement')}
        />
      ),
      disabled: input.disabled,
      onSelect: input.onManageProjects,
    },
    ...(input.onOpenPortability
      ? [
          {
            id: 'project-portability',
            label: (
              <NavigationMenuLabel
                icon={<PackageIcon size={14} />}
                text={input.t('workspace.portability')}
              />
            ),
            disabled: input.disabled || unavailable,
            onSelect: input.onOpenPortability,
          } satisfies ContextMenuItem,
        ]
      : []),
    { id: 'project-destructive-separator', type: 'separator' },
    {
      id: 'delete-project-conversations',
      label: (
        <NavigationMenuLabel
          icon={<TrashIcon size={14} />}
          text={input.t('shell.deleteProjectConversations', {
            project: input.project.displayName,
          })}
        />
      ),
      disabled: input.disabled || input.workspaceConversationCount === 0,
      danger: true,
      onSelect: input.onDeleteConversations,
    },
    {
      id: 'remove-project',
      label: (
        <NavigationMenuLabel
          icon={<RemoveIcon size={14} />}
          text={input.t('shell.removeProject', { project: input.project.displayName })}
        />
      ),
      disabled: input.disabled,
      danger: true,
      onSelect: input.onRemove,
    },
  ];
}

function createConversationNavigationMenuItems(input: {
  readonly conversation: DesktopAgentHomeConversationSummary;
  readonly disabled: boolean;
  readonly navigationDisabled: boolean;
  readonly onDelete: () => void;
  readonly onOpen: () => void;
  readonly t: TranslationFunction;
}): readonly ContextMenuItem[] {
  return [
    {
      id: 'open-conversation',
      label: (
        <NavigationMenuLabel
          icon={<OpenIcon size={14} />}
          text={input.t('home.openConversation')}
        />
      ),
      disabled:
        input.navigationDisabled || input.conversation.unavailable !== undefined || input.disabled,
      onSelect: input.onOpen,
    },
    { id: 'conversation-destructive-separator', type: 'separator' },
    {
      id: 'delete-conversation',
      label: (
        <NavigationMenuLabel
          icon={<TrashIcon size={14} />}
          text={input.t('home.deleteConversation')}
        />
      ),
      disabled: input.disabled,
      danger: true,
      onSelect: input.onDelete,
    },
  ];
}

function createWorkspaceNavigationMenuItems(input: {
  readonly disabled: boolean;
  readonly onDeleteConversations: () => void;
  readonly t: TranslationFunction;
}): readonly ContextMenuItem[] {
  return [
    {
      id: 'delete-workspace-conversations',
      label: (
        <NavigationMenuLabel
          icon={<TrashIcon size={14} />}
          text={input.t('shell.deleteWorkspaceConversations')}
        />
      ),
      disabled: input.disabled,
      danger: true,
      onSelect: input.onDeleteConversations,
    },
  ];
}

function NavigationMenuLabel({
  icon,
  text,
}: {
  readonly icon: JSX.Element;
  readonly text: string;
}): JSX.Element {
  return (
    <span className="desktop-navigation-menu-label">
      {icon}
      <span>{text}</span>
    </span>
  );
}

function NavigationUnavailableStatus({ message }: { readonly message: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <Tooltip content={message} side="right">
      <span
        className="primary-navigation-unavailable"
        role="status"
        title={message}
        aria-label={`${t('home.unavailable')}: ${message}`}
      >
        <WarningIcon size={12} />
      </span>
    </Tooltip>
  );
}

function conversationGroupKey(group: DesktopConversationNavigationGroup): string {
  switch (group.kind) {
    case 'project':
      return `project:${group.projectId}`;
    case 'workspace':
      return `workspace:${group.workspaceId}`;
    case 'assistant':
      return `assistant:${group.assistantSpaceId}`;
    case 'character':
      return `character:${group.characterId}`;
    case 'room':
      return `room:${group.roomId}`;
  }
}

function conversationGroupIcon(group: DesktopConversationNavigationGroup): JSX.Element {
  switch (group.kind) {
    case 'project':
      return (
        <FolderIcon className="primary-conversation-group__identity-icon is-project" size={15} />
      );
    case 'workspace':
      return (
        <FolderIcon className="primary-conversation-group__identity-icon is-workspace" size={15} />
      );
    case 'assistant':
      return (
        <BotIcon className="primary-conversation-group__identity-icon is-assistant" size={14} />
      );
    case 'character':
      return (
        <UserIcon className="primary-conversation-group__identity-icon is-character" size={14} />
      );
    case 'room':
      return <UsersIcon className="primary-conversation-group__identity-icon is-room" size={14} />;
  }
}

function formatStandaloneConversationGroup(
  group: DesktopConversationNavigationGroup,
  t: TranslationFunction,
): string {
  switch (group.kind) {
    case 'project':
      return group.displayName;
    case 'workspace':
      return t('home.unavailableWorkspace');
    case 'assistant':
      return t('home.personalAssistant');
    case 'character':
      return `${t('home.character')} · ${group.characterId}`;
    case 'room':
      return `${t('character.workbench.roomScene')} · ${group.roomId}`;
  }
}

function PrimarySidebarBrand({
  compact,
  disabled = false,
  onToggle,
}: {
  readonly compact: boolean;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="primary-sidebar-brand">
      <DesktopApplicationBrand showMark={compact} />
      <div className="primary-sidebar-brand__controls">
        <IconButton
          className="primary-sidebar-toggle workbench-region-toggle"
          data-workbench-region-control="primary-sidebar"
          disabled={disabled}
          icon={<span className={toCodiconClassName('layout-sidebar-left')} aria-hidden="true" />}
          label={compact ? t('workspace.expandSidebar') : t('workspace.collapseSidebar')}
          size="xs"
          title={compact ? t('workspace.expandSidebar') : t('workspace.collapseSidebar')}
          aria-pressed={!compact}
          onClick={onToggle}
        />
      </div>
    </div>
  );
}

function PrimarySidebarFooter({
  onOpenSettings,
  projection,
}: {
  readonly onOpenSettings: () => void;
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="home-navigation-footer">
      <AttentionSummary projection={projection} />
      <div className="home-navigation-footer__actions">
        <Tooltip content={t('shell.settingsLabel')}>
          <IconButton
            label={t('shell.settingsLabel')}
            icon={<SettingsIcon size={16} />}
            onClick={onOpenSettings}
          />
        </Tooltip>
      </div>
    </div>
  );
}

function AttentionSummary({
  projection,
}: {
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { t } = useTranslation();
  const total =
    projection.agentHome.attention.needsInput +
    projection.agentHome.attention.needsReview +
    projection.agentHome.attention.running;
  return (
    <Tooltip content={t('shell.activityAttention')}>
      <div className="attention-summary" aria-label={t('shell.attentionItems', { count: total })}>
        <span className={total > 0 ? 'has-attention' : ''} />
        <span>{total}</span>
      </div>
    </Tooltip>
  );
}

function formatAttention(
  attention: DesktopAgentHomeConversationSummary['attention'],
  t: TranslationFunction,
): string {
  return t(`attention.${attention === 'none' ? 'none' : camelCase(attention)}`);
}

function countProjectConversations(
  projection: DesktopShellProjection,
): Readonly<Record<string, number>> {
  const projectIdsByWorkspace = new Map(
    projection.catalog.projects.map((project) => [project.workspaceId, project.projectId] as const),
  );
  const counts: Record<string, number> = {};
  for (const conversation of projection.agentHome.conversations) {
    if (conversation.navigation.owner.kind !== 'workspace') continue;
    const projectId = projectIdsByWorkspace.get(conversation.navigation.owner.workspaceId);
    if (!projectId) continue;
    counts[projectId] = (counts[projectId] ?? 0) + 1;
  }
  return counts;
}

function camelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase());
}

function ShellStatus({
  title,
  message,
  error = false,
}: {
  readonly title: string;
  readonly message: string;
  readonly error?: boolean;
}): JSX.Element {
  return (
    <main className="shell-status">
      <span className="brand-mark" aria-hidden="true">
        N
      </span>
      <h1>{title}</h1>
      <p className={error ? 'is-error' : ''}>{message}</p>
    </main>
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptyCharacterDefinition(): CharacterDefinition {
  return {
    summary: '',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  };
}

function emptyWorldDefinition(): WorldDefinition {
  return {
    background: '',
    worldBook: [],
    locations: [],
    organizations: [],
    rules: [],
    initialFacts: [],
  };
}

function createPersistedDiagnosticPresentation(
  projection: DesktopShellProjection,
  t: TranslationFunction,
): ShellDiagnosticPresentation | undefined {
  const stateDiagnostic = projection.stateDiagnostics?.find(
    (candidate) => candidate.severity === 'error',
  );
  if (stateDiagnostic) {
    const message =
      stateDiagnostic.code === 'desktop-shell-component-invalid'
        ? t('shell.projectCatalogInvalid')
        : stateDiagnostic.code === 'desktop-stored-window-invalid'
          ? t('shell.storedWindowInvalid', { windowId: stateDiagnostic.windowId })
          : stateDiagnostic.authorityKey === 'desktop.application-settings'
            ? t('shell.storedSettingsInvalid')
            : t('shell.storedStateInvalid');
    return {
      key: `state:${stateDiagnostic.code}:${stateDiagnostic.message}`,
      message,
      title: stateDiagnostic.message,
    };
  }

  const conversationDiagnostic = projection.agentHome.diagnostics?.[0];
  if (!conversationDiagnostic) return undefined;
  return {
    key: `conversation:${conversationDiagnostic.workspaceId}:${conversationDiagnostic.conversationId ?? ''}:${conversationDiagnostic.message}`,
    message: conversationDiagnostic.conversationId
      ? t('shell.conversationRecordInvalid', {
          conversationId: conversationDiagnostic.conversationId,
        })
      : t('shell.conversationRecordInvalidUnknown'),
    title: conversationDiagnostic.message,
  };
}
