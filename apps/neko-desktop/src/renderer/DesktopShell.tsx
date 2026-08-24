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
  SuccessIcon,
  ErrorIcon,
  Tooltip,
  TooltipProvider,
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
import { DshComposerPresentationSnapshotProvider } from '@neko/agent-webview/dsh-session/presentation-snapshot';
import type {
  DesktopAgentHomeConversationSummary,
  DesktopConversationNavigationGroup,
  DesktopProjectCatalogItem,
  DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import { resolveActiveDesktopWindowWorkbench } from '@neko/host/desktop-shell-contract';
import {
  DESKTOP_PRIMARY_MAIN_GROUP_ID,
  DESKTOP_SECONDARY_MAIN_GROUP_ID,
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
import { DesktopWorkspaceProjectBrowser } from './DesktopWorkspaceProjectBrowser';
import { DesktopPreviewSurface } from './DesktopPreviewSurface';
import { DesktopTextEditorSurface } from './DesktopTextEditorSurface';
import { DesktopCanvasSurface } from './DesktopCanvasSurface';
import { DesktopCutSurface } from './DesktopCutSurface';
import {
  WorkspaceQuickCreateControl,
  type WorkspaceQuickCreateSubmission,
} from './WorkspaceQuickCreateControl';
import { executeDesktopWorkspaceQuickCreation } from './desktop-workspace-quick-creation';
import { createDesktopResourceBrowserIdentity } from '../shared/resource-browser-bridge-contract';
import type { ResourceBrowserIdentity } from '@neko/assets-domain/resource-browser/contract';
import {
  DesktopSettingsMainSurface,
  DesktopSettingsNavigationSurface,
  parseDesktopSettingsSection,
} from './DesktopSettingsSurface';
import { DesktopAssetManagementSurface } from './DesktopAssetManagementSurface';
import { DesktopExtensionManagementSurface } from './DesktopExtensionManagementSurface';
import { DesktopExtensionManagementRuntime } from './desktop-extension-management-runtime';
import { DesktopProfessionalApplicationRuntime } from './desktop-professional-application-runtime';
import { WorkbenchMainPanelSurface } from './WorkbenchMainPanelSurface';
import {
  ProjectContentRoot,
  ProjectAuthoringTargetSwitchRoot,
  ProjectCatalogRoot,
  ProjectWorkspaceRoot,
  type ProjectWritableNavigationItem,
} from '@neko/project-webview/root';
import type {
  ProjectAuthoringPresentationSnapshotRef,
  ProjectMixedDomainTargetItem,
} from '@neko/project/contracts';
import '@neko/project-webview/style.css';
import {
  type CharacterAuthoringSnapshot,
  type CharacterProductHandoff,
} from '@neko/chara/contracts';
import type { WorldAuthoringSnapshot } from '@neko/world/contracts';
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
  createCharacterDialogueHandoffIntent,
  type CharacterDialogueHandoffIntent,
} from '@neko/agent-contracts';
import type { DesktopWindowCompositionProjection } from '@neko/host/desktop-window-composition-contract';
import { DesktopSurfaceErrorBoundary } from './DesktopSurfaceErrorBoundary';
import {
  CharacterCatalogSurface,
  CharacterDetailSurface,
  CharacterAuthoringSurface,
  CharacterPortableExportScopeSurface,
  CharacterCompanionContinuitySurface,
  CharacterParticipantManagerSurface,
  CharacterParticipantIdentityAvatar,
  CharacterRoomInteractionFeed,
  CharacterRoomTimelineSurface as CharacterRoomTimelineProjectionSurface,
  CharacterStorylineTimelineSurface,
  projectCharacterRoomIdentity,
  projectCharacterParticipantManager,
  type CharacterManagementRuntime,
  type CharacterParticipantProjection,
  type CharacterPortableExportScopePresentation,
  type CharacterPortableExportSelection,
  useCharacterManagementRuntime,
  useCharacterRoomWorkbenchRuntime,
} from '@neko/chara-webview/root';
import { VrmAvatarSurface } from '@neko/chara-webview/avatar';
import '@neko/chara-webview/style.css';
import {
  WorldAuthoringStudioRoot,
  WorldManagementCatalogRoot,
  WorldManagementDetailRoot,
  WorldPortableExportScopeSurface,
  WorldRuntimeInteractionSurface,
  WorldRuntimeMainSurface,
  WorldRuntimeManagerSurface,
  WorldRuntimeStatusSurface,
  WorldRuntimeTimelineSurface,
  useWorldManagementRuntime,
  useWorldRuntimePresentation,
} from '@neko/world-webview/root';
import '@neko/world-webview/style.css';

type ShellState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly projection: DesktopShellProjection }
  | { readonly kind: 'error'; readonly message: string };

type HomeSection = 'create' | 'characters' | 'worlds' | 'assets' | 'extensions' | 'projects';
type TranslationFunction = ReturnType<typeof useTranslation>['t'];
type CharacterPortableWorkflow = {
  readonly kind: 'export';
  readonly binding: import('@neko/chara/contracts').CharacterPortableHostBinding;
  readonly scope: CharacterPortableExportScopePresentation;
};
type WorldPortableWorkflow = {
  readonly kind: 'export';
  readonly binding: import('@neko/world/contracts').WorldPortableHostBinding;
  readonly detail: import('@neko/world/contracts').WorldManagementDetailProjection;
};
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
  readonly onArchiveConversations: (
    conversations: readonly DesktopAgentHomeConversationSummary[],
  ) => void;
  readonly onRemoveProjects: (projects: readonly DesktopProjectCatalogItem[]) => void;
  readonly onArchiveProjectConversations: (projects: readonly DesktopProjectCatalogItem[]) => void;
  readonly onUpdateWorkbench: (
    workbenchInstanceId: string,
    workbench: DesktopWorkbenchLayoutProjection,
  ) => void;
  readonly onQuickCreateWorkspaceContent: (input: {
    readonly identity: ResourceBrowserIdentity;
    readonly workbenchInstanceId: string;
    readonly workbench: DesktopWorkbenchLayoutProjection;
    readonly mainGroupId: string;
    readonly submission: WorkspaceQuickCreateSubmission;
  }) => Promise<void>;
  readonly onCreateCutDraft: (workbenchInstanceId: string) => void;
  readonly onCloseCutView: (workbenchInstanceId: string, view: DesktopWorkbenchViewRef) => void;
  readonly onCloseWorkbenchView: (
    workbenchInstanceId: string,
    workbench: DesktopWorkbenchLayoutProjection,
    view: DesktopWorkbenchViewRef,
  ) => void;
  readonly onUpdateApplicationSidebar: (sidebar: DesktopApplicationSidebarProjection) => void;
  readonly onTransitionScene: (intent: DesktopSceneTransitionIntent) => void;
  readonly onExportCharacterPackage: (globalCharacterId: string) => void;
  readonly onImportCharacterPackage: (
    target?: import('@neko/chara/contracts').CharacterPortableImportTarget,
  ) => void;
  readonly onImportWorldPackage: (
    target?: import('@neko/world/contracts').WorldPortableImportTarget,
  ) => void;
  readonly onExportWorldPackage: (globalWorldId: string) => void;
  readonly onStartGlobalCharacterConversation: (input: {
    readonly globalCharacterId: string;
    readonly characterVersionId: string;
    readonly label: string;
  }) => Promise<void>;
  readonly onFinalizeAndStartCharacterConversation: (input: {
    readonly characterProjectId: string;
    readonly characterVersionId: string;
    readonly label: string;
  }) => Promise<void>;
  readonly onCharacterProductHandoff: (handoff: CharacterProductHandoff) => void;
  readonly onLoadEntryCharacterTargets: NonNullable<
    DesktopAgentSurfaceProps['entryContext']
  >['loadCharacterTargets'];
  readonly onLoadEntryWorldTargets: NonNullable<
    DesktopAgentSurfaceProps['entryContext']
  >['loadWorldTargets'];
}

export function DesktopApplication(): JSX.Element {
  return (
    <DshComposerPresentationSnapshotProvider>
      <DesktopApplicationContent />
    </DshComposerPresentationSnapshotProvider>
  );
}

function DesktopApplicationContent(): JSX.Element {
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
  const [characterDialogueHandoff, setCharacterDialogueHandoff] = useState<{
    readonly draftId: string;
    readonly intent: CharacterDialogueHandoffIntent;
  }>();
  const [characterPortableWorkflow, setCharacterPortableWorkflow] =
    useState<CharacterPortableWorkflow>();
  const [worldPortableWorkflow, setWorldPortableWorkflow] = useState<WorldPortableWorkflow>();
  const [characterManagementReloadToken, setCharacterManagementReloadToken] = useState(0);
  const [worldManagementReloadToken, setWorldManagementReloadToken] = useState(0);
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
      options?: { readonly rethrow?: boolean },
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
        if (options?.rethrow) throw error;
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
    onArchiveConversations: (conversations) => {
      if (conversations.length === 0) {
        throw new Error('At least one Conversation is required for archive.');
      }
      const confirmation =
        conversations.length === 1 && conversations[0]
          ? t('shell.archiveConversationConfirm', { conversation: conversations[0].title })
          : t('shell.archiveConversationsConfirm', { count: conversations.length });
      if (!globalThis.confirm(confirmation)) {
        return;
      }
      void runMutation('navigation', () =>
        window.openNekoDesktop.conversations.archive(
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
    onArchiveProjectConversations: (projects) => {
      if (projects.length === 0) {
        throw new Error('At least one Project is required for Conversation archive.');
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
        throw new Error('Selected Projects have no Workspace conversations to archive.');
      }
      const confirmation =
        projects.length === 1 && projects[0]
          ? t('shell.archiveProjectConversationsConfirm', {
              project: projects[0].displayName,
              count: conversationCount,
            })
          : t('shell.archiveProjectsConversationsConfirm', {
              projectCount: projects.length,
              conversationCount,
            });
      if (!globalThis.confirm(confirmation)) return;
      void runMutation('navigation', () =>
        window.openNekoDesktop.projects.archiveConversations(
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
    onQuickCreateWorkspaceContent: async (input) => {
      if (projection.window.workbench.workbenchInstanceId !== input.workbenchInstanceId) {
        throw new Error(`Desktop Workbench '${input.workbenchInstanceId}' is unavailable.`);
      }
      let retainedDiagnostic: string | undefined;
      await runMutation(
        'workbench',
        async () => {
          const outcome = await executeDesktopWorkspaceQuickCreation(
            {
              requestId: `workspace-quick-create:${globalThis.crypto.randomUUID()}`,
              identity: input.identity,
              workbenchInstanceId: input.workbenchInstanceId,
              workbench: input.workbench,
              mainGroupId: input.mainGroupId,
              kind: input.submission.kind,
              name: input.submission.name,
            },
            {
              updateWorkbench: (workbenchInstanceId, workbench) =>
                window.openNekoDesktop.workbench.update(workbenchInstanceId, workbench),
              search: (request) => window.openNekoDesktop.resources.search(request),
              execute: (request) => window.openNekoDesktop.resources.execute(request),
              getShellSnapshot: () => window.openNekoDesktop.shell.getSnapshot(),
            },
          );
          retainedDiagnostic = outcome.retainedDiagnostic?.message;
          return outcome.projection;
        },
        { rethrow: true },
      );
      if (retainedDiagnostic) setDiagnostic(retainedDiagnostic);
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
      if (!view.projectId) throw new Error('Desktop Cut close requires a Project identity.');
      const documentId = view.documentId;
      const projectId = view.projectId;
      void runMutation('workbench', async () => {
        const result = await window.openNekoDesktop.cut.closeView({
          requestId: `cut-view-close:${globalThis.crypto.randomUUID()}`,
          windowId: projection.window.windowId,
          rendererSessionId: projection.rendererSessionId,
          workbenchInstanceId,
          identity: {
            projectId,
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
          route: TEXT_EDITOR_HOST_ROUTES.close,
          requestId: `${requestPrefix}:probe`,
          identity,
          decision: 'cancel',
        })
        .then(async (result) => {
          if (result.status === 'rejected') throw new Error(result.diagnostic.code);
          if (result.status === 'closed') {
            await refresh();
            return;
          }
          if (result.status !== 'cancelled') {
            throw new Error(`Desktop Text Editor close returned '${result.status}'.`);
          }
          let decision: 'save' | 'discard' | 'cancel';
          if (globalThis.confirm(t('workspace.textEditorCloseSave'))) {
            decision = 'save';
          } else if (globalThis.confirm(t('workspace.textEditorCloseDiscard'))) {
            decision = 'discard';
          } else {
            decision = 'cancel';
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
    onExportCharacterPackage: () => {
      setDiagnostic(
        locale === 'zh-cn'
          ? '请从具体项目的创作工作区导出角色。'
          : 'Export a Character from its exact Project Creative Workspace.',
      );
    },
    onImportCharacterPackage: (target) => {
      const finishPending = beginPending('scene');
      setDiagnostic(undefined);
      void window.openNekoDesktop.characterPortable
        .importPackage(projection.window.windowId, target)
        .then((result) => {
          if (result.status === 'cancelled') return;
          if (result.status !== 'imported') {
            throw new Error(`Character import returned '${result.status}'.`);
          }
          setCharacterManagementReloadToken((current) => current + 1);
        })
        .catch((error: unknown) => setDiagnostic(describeError(error)))
        .finally(finishPending);
    },
    onImportWorldPackage: (target) => {
      const finishPending = beginPending('scene');
      setDiagnostic(undefined);
      void window.openNekoDesktop.worldPortable
        .importPackage(projection.window.windowId, target)
        .then((result) => {
          if (result.status === 'cancelled') return;
          if (result.status !== 'completed' || result.result.kind !== 'import-completed') {
            throw new Error(`World import returned '${result.status}'.`);
          }
          setWorldManagementReloadToken((current) => current + 1);
        })
        .catch((error: unknown) => setDiagnostic(describeError(error)))
        .finally(finishPending);
    },
    onExportWorldPackage: () => {
      setDiagnostic(
        locale === 'zh-cn'
          ? '请从具体项目的创作工作区导出世界。'
          : 'Export a World from its exact Project Creative Workspace.',
      );
    },
    onStartGlobalCharacterConversation: async (input) => {
      const finishPending = beginPending('scene');
      setDiagnostic(undefined);
      try {
        const snapshot = await window.openNekoDesktop.characterFoundation.getSnapshot();
        const character = snapshot.character.globalCharacters.find(
          (candidate) => candidate.globalCharacterId === input.globalCharacterId,
        );
        const version = snapshot.character.versions.find(
          (candidate) => candidate.characterVersionId === input.characterVersionId,
        );
        if (
          !character?.characterVersionIds.includes(input.characterVersionId) ||
          !version ||
          version.globalCharacterId !== input.globalCharacterId
        ) {
          throw new Error(
            `CharacterVersion '${input.characterVersionId}' does not belong to the exact GlobalCharacter '${input.globalCharacterId}'.`,
          );
        }
        const result = await window.openNekoDesktop.scenes.transition(
          projection.window.windowId,
          { kind: 'open-agent-entry' },
          activeWorkbench.scene.sceneId,
        );
        if (result.status !== 'transitioned') throw new Error(result.diagnostic.message);
        if (
          result.scene.context.kind !== 'agent' ||
          result.scene.context.scope.kind !== 'unbound'
        ) {
          throw new Error('Character Conversation launch requires an unbound Agent Draft.');
        }
        setCharacterDialogueHandoff({
          draftId: result.scene.context.scope.draftId,
          intent: createCharacterDialogueHandoffIntent({
            intentId: `character-dialogue:${crypto.randomUUID()}`,
            label: input.label,
            globalCharacterId: input.globalCharacterId,
            characterVersionId: input.characterVersionId,
          }),
        });
      } catch (error) {
        setDiagnostic(describeError(error));
        await refresh();
        throw error;
      } finally {
        finishPending();
      }
    },
    onFinalizeAndStartCharacterConversation: async (input) => {
      const finishPending = beginPending('scene');
      setDiagnostic(undefined);
      try {
        const snapshot = await window.openNekoDesktop.characterFoundation.getSnapshot();
        const version = snapshot.character.versions.find(
          (candidate) => candidate.characterVersionId === input.characterVersionId,
        );
        if (!version) {
          throw new Error(
            `CharacterVersion '${input.characterVersionId}' is not synchronized to the global Character catalog.`,
          );
        }
        const globalCharacter = snapshot.character.globalCharacters.find(
          (candidate) =>
            candidate.globalCharacterId === version.globalCharacterId &&
            candidate.characterVersionIds.includes(input.characterVersionId),
        );
        if (!globalCharacter) {
          throw new Error(
            `CharacterVersion '${input.characterVersionId}' has no exact GlobalCharacter authority.`,
          );
        }
        const result = await window.openNekoDesktop.scenes.transition(
          projection.window.windowId,
          { kind: 'open-agent-entry' },
          activeWorkbench.scene.sceneId,
        );
        if (result.status !== 'transitioned') throw new Error(result.diagnostic.message);
        if (
          result.scene.context.kind !== 'agent' ||
          result.scene.context.scope.kind !== 'unbound'
        ) {
          throw new Error('Character Conversation launch requires an unbound Agent Draft.');
        }
        setCharacterDialogueHandoff({
          draftId: result.scene.context.scope.draftId,
          intent: createCharacterDialogueHandoffIntent({
            intentId: `character-dialogue:${crypto.randomUUID()}`,
            label: input.label,
            globalCharacterId: globalCharacter.globalCharacterId,
            characterVersionId: input.characterVersionId,
          }),
        });
      } catch (error) {
        setDiagnostic(describeError(error));
        await refresh();
        throw error;
      } finally {
        finishPending();
      }
    },
    onLoadEntryCharacterTargets: async () => {
      const catalog =
        await window.openNekoDesktop.characterFoundation.getConversationLaunchCatalog();
      return {
        targets: catalog.targets.map((target) => ({
          globalCharacterId: target.globalCharacterId,
          characterVersionId: target.characterVersionId,
          displayName: target.displayName,
          versionLabel: target.versionLabel,
          lineage: target.lineage,
          storylines: target.storylines.map((storyline) => ({
            storylineVersionId: storyline.characterStorylineVersionId,
            label: storyline.label,
          })),
        })),
        diagnostics: catalog.diagnostics.map((diagnostic) => diagnostic.message),
      };
    },
    onLoadEntryWorldTargets: async () => {
      const catalog = await window.openNekoDesktop.worldManagement.getCatalog({
        search: '',
        sort: 'recently-updated',
      });
      const available = catalog.items.filter((item) => item.status === 'available');
      const details = await Promise.allSettled(
        available.map((item) =>
          window.openNekoDesktop.worldManagement.getDetail(item.globalWorldId),
        ),
      );
      return {
        targets: details.flatMap((result) =>
          result.status === 'fulfilled'
            ? result.value.versions.map((version) => ({
                globalWorldId: result.value.globalWorldId,
                worldVersionId: version.worldVersionId,
                displayName: result.value.title,
                versionLabel: version.label,
              }))
            : [],
        ),
        diagnostics: [
          ...catalog.items.flatMap((item) => (item.status === 'invalid' ? [item.message] : [])),
          ...catalog.diagnostics.map((diagnostic) => diagnostic.message),
          ...details.flatMap((result) =>
            result.status === 'rejected' ? [describeError(result.reason)] : [],
          ),
        ],
      };
    },
    onCharacterProductHandoff: (handoff) => {
      if (handoff.kind === 'open-character-studio') {
        const finishPending = beginPending('scene');
        setDiagnostic(undefined);
        const authority = handoff.authority;
        const selection = window.openNekoDesktop.workspaceGrants.selectProject(
          projection.window.windowId,
          authority.projectId,
        );
        void selection
          .then((result) => {
            if (result.status === 'cancelled') return undefined;
            return window.openNekoDesktop.scenes.transition(
              projection.window.windowId,
              {
                kind: 'open-character-authoring',
                workspaceGrantId: result.grant.workspaceGrantId,
                authority,
                characterProjectId: handoff.characterProjectId,
              },
              activeWorkbench.scene.sceneId,
            );
          })
          .then((result) => {
            if (result && result.status !== 'transitioned') {
              setDiagnostic(result.diagnostic.message);
            }
          })
          .catch(async (error: unknown) => {
            setDiagnostic(describeError(error));
            await refresh();
          })
          .finally(finishPending);
        return;
      }
      if (handoff.kind !== 'open-character') {
        throw new Error(`Character product handoff '${handoff.kind}' has no Desktop handler.`);
      }
      setDiagnostic(
        locale === 'zh-cn'
          ? '工作区角色需要先同步到全局后才能进入角色管理。'
          : 'Synchronize the Workspace Character to the global catalog before managing it.',
      );
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
          characterManagementReloadToken={characterManagementReloadToken}
          worldManagementReloadToken={worldManagementReloadToken}
          characterDialogueHandoff={characterDialogueHandoff}
          onCharacterDialogueHandoffConsumed={(intentId) => {
            setCharacterDialogueHandoff((current) =>
              current?.intent.intentId === intentId ? undefined : current,
            );
          }}
          pending={pending}
          projection={projection}
          projectPortabilityPort={window.openNekoDesktop.projectPortability}
        />
        {characterPortableWorkflow ? (
          <div className="desktop-character-portable-workflow" role="presentation">
            <div
              aria-label={locale === 'zh-cn' ? '角色包' : 'Character package'}
              aria-modal="true"
              className="desktop-character-portable-workflow__surface"
              role="dialog"
            >
              <CharacterPortableExportScopeSurface
                disabled={pending.scene}
                locale={locale}
                scope={characterPortableWorkflow.scope}
                onCancel={() => setCharacterPortableWorkflow(undefined)}
                onExport={(selection: CharacterPortableExportSelection) => {
                  const finishPending = beginPending('scene');
                  setDiagnostic(undefined);
                  void window.openNekoDesktop.characterPortable
                    .exportPackage(
                      projection.window.windowId,
                      characterPortableWorkflow.binding,
                      characterPortableWorkflow.scope.characterProjectId,
                      selection,
                    )
                    .then((result) => {
                      if (result.status !== 'exported' && result.status !== 'cancelled') {
                        throw new Error(`Character export returned '${result.status}'.`);
                      }
                      setCharacterPortableWorkflow(undefined);
                    })
                    .catch((error: unknown) => setDiagnostic(describeError(error)))
                    .finally(finishPending);
                }}
              />
            </div>
          </div>
        ) : null}
        {worldPortableWorkflow ? (
          <div className="desktop-character-portable-workflow" role="presentation">
            <div
              aria-label={locale === 'zh-cn' ? '世界包' : 'World package'}
              aria-modal="true"
              className="desktop-character-portable-workflow__surface"
              role="dialog"
            >
              <WorldPortableExportScopeSurface
                detail={worldPortableWorkflow.detail}
                disabled={pending.scene}
                locale={locale}
                onCancel={() => setWorldPortableWorkflow(undefined)}
                onExport={(selection) => {
                  const workflow = worldPortableWorkflow;
                  const finishPending = beginPending('scene');
                  setDiagnostic(undefined);
                  void window.openNekoDesktop.worldPortable
                    .exportPackage(projection.window.windowId, workflow.binding, selection)
                    .then((result) => {
                      if (result.status !== 'completed' && result.status !== 'cancelled') {
                        throw new Error('World export returned an unsupported result.');
                      }
                      setWorldPortableWorkflow(undefined);
                    })
                    .catch((error: unknown) => setDiagnostic(describeError(error)))
                    .finally(finishPending);
                }}
              />
            </div>
          </div>
        ) : null}
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
    onArchiveConversations: () => undefined,
    onRemoveProjects: () => undefined,
    onArchiveProjectConversations: () => undefined,
    onUpdateWorkbench: () => undefined,
    onQuickCreateWorkspaceContent: async () => undefined,
    onCreateCutDraft: () => undefined,
    onCloseCutView: () => undefined,
    onCloseWorkbenchView: () => undefined,
    onUpdateApplicationSidebar: () => undefined,
    onTransitionScene: () => undefined,
    onExportCharacterPackage: () => undefined,
    onImportCharacterPackage: () => undefined,
    onImportWorldPackage: () => undefined,
    onExportWorldPackage: () => undefined,
    onStartGlobalCharacterConversation: async () => undefined,
    onFinalizeAndStartCharacterConversation: async () => undefined,
    onCharacterProductHandoff: () => undefined,
    onLoadEntryCharacterTargets: async () => ({ targets: [], diagnostics: [] }),
    onLoadEntryWorldTargets: async () => ({ targets: [], diagnostics: [] }),
  };
  return (
    <DshComposerPresentationSnapshotProvider>
      <DesktopSceneWorkbench
        actions={actions}
        pending={EMPTY_DESKTOP_SHELL_PENDING}
        projection={projection}
        interactive={false}
      />
    </DshComposerPresentationSnapshotProvider>
  );
}

function DesktopSceneWorkbench({
  actions,
  characterDialogueHandoff,
  characterManagementReloadToken,
  worldManagementReloadToken,
  interactive = true,
  pending,
  projection,
  projectPortabilityPort,
  onCharacterDialogueHandoffConsumed,
}: {
  readonly actions: ShellActions;
  readonly characterDialogueHandoff?: {
    readonly draftId: string;
    readonly intent: CharacterDialogueHandoffIntent;
  };
  readonly characterManagementReloadToken?: number;
  readonly worldManagementReloadToken?: number;
  readonly interactive?: boolean;
  readonly onCharacterDialogueHandoffConsumed?: (intentId: string) => void;
  readonly pending: DesktopShellPendingProjection;
  readonly projection: DesktopShellProjection;
  readonly projectPortabilityPort?: OpenNekoDesktopProjectPortabilityBridge['projectPortability'];
}): JSX.Element {
  const { locale, t } = useTranslation();
  const settings = useDesktopApplicationSettings();
  const activeWorkbench = resolveActiveDesktopWindowWorkbench(projection.window);
  const interactionLocks = projectDesktopShellInteractionLocks(pending);
  const scene = activeWorkbench.scene;
  const [runtimePanelState, setRuntimePanelState] = useState<{
    readonly sceneId: string;
    readonly values: Partial<Record<RuntimePanelRegion, boolean>>;
  }>(() => ({ sceneId: scene.sceneId, values: {} }));
  const [managementSplitRatios, setManagementSplitRatios] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const [portalTargets, setPortalTargets] = useState<ReadonlyMap<string, HTMLDivElement>>(
    () => new Map(),
  );
  const [characterParticipantSelection, setCharacterParticipantSelection] = useState<{
    readonly sceneId: string;
    readonly participantId: string;
  }>();
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
    reloadToken: characterManagementReloadToken,
  });
  const worldManagement = useWorldManagementRuntime({
    active: scene.context.kind === 'creative-management' && scene.context.catalog === 'worlds',
    host:
      scene.context.kind === 'creative-management' && scene.context.catalog === 'worlds'
        ? window.openNekoDesktop.worldManagement
        : undefined,
    reloadToken: worldManagementReloadToken,
  });
  const worldRuntimeBinding =
    scene.context.kind === 'world-runtime' ? scene.context.binding : undefined;
  const worldRuntime = useWorldRuntimePresentation({
    active: worldRuntimeBinding !== undefined,
    binding: worldRuntimeBinding,
    host: worldRuntimeBinding ? window.openNekoDesktop.worldRuntime : undefined,
    windowId: scene.windowId,
  });
  const characterHasVisual =
    characterInteractionScene && characterManagement.loadState.kind === 'ready'
      ? hasCharacterVisualRepresentation(
          characterManagement.loadState.snapshot,
          scene.context.owner,
        )
      : false;
  const characterPresentationDefaultVisible =
    characterInteractionScene &&
    scene.slots.main?.kind === 'character-presentation' &&
    (scene.slots.main.providerId !== 'chara.representation' || characterHasVisual);
  const runtimeScene = characterInteractionScene || worldRuntimeBinding !== undefined;
  const runtimePanelVisibility = useMemo<RuntimePanelVisibility>(() => {
    const runtimeDefaults: RuntimePanelVisibility = {
      agent: true,
      main: worldRuntimeBinding !== undefined || characterPresentationDefaultVisible,
      manager: true,
    };
    return runtimePanelState.sceneId === scene.sceneId
      ? { ...runtimeDefaults, ...runtimePanelState.values }
      : runtimeDefaults;
  }, [characterPresentationDefaultVisible, runtimePanelState, scene.sceneId, worldRuntimeBinding]);
  const toggleRuntimePanel = useCallback(
    (region: RuntimePanelRegion) => {
      setRuntimePanelState({
        sceneId: scene.sceneId,
        values: { ...runtimePanelVisibility, [region]: !runtimePanelVisibility[region] },
      });
    },
    [runtimePanelVisibility, scene.sceneId],
  );
  const characterRoomIdentity =
    roomInteractionOwner && characterManagement.loadState.kind === 'ready'
      ? projectCharacterRoomIdentity(
          characterManagement.loadState.snapshot,
          roomInteractionOwner.roomRunId,
        )
      : undefined;
  const characterParticipantSnapshot =
    characterManagement.loadState.kind === 'ready'
      ? characterManagement.loadState.snapshot
      : undefined;
  const characterParticipantOwner = characterInteractionScene ? scene.context.owner : undefined;
  const characterParticipantProjection = useMemo(() => {
    if (!characterParticipantSnapshot || !characterParticipantOwner) return undefined;
    try {
      return projectCharacterParticipantManager(
        characterParticipantSnapshot,
        characterParticipantOwner,
      );
    } catch {
      return undefined;
    }
  }, [characterParticipantOwner, characterParticipantSnapshot]);
  const selectedCharacterParticipantId =
    characterParticipantSelection?.sceneId === scene.sceneId
      ? characterParticipantSelection.participantId
      : undefined;
  const characterParticipantPortraits = useCharacterParticipantPortraits({
    participants: characterParticipantProjection?.participants ?? EMPTY_CHARACTER_PARTICIPANTS,
    workbenchInstanceId: activeWorkbench.workbenchInstanceId,
  });
  const selectCharacterParticipant = useCallback(
    (participantId: string) => {
      setCharacterParticipantSelection({ sceneId: scene.sceneId, participantId });
    },
    [scene.sceneId],
  );
  const characterTimelineStack =
    characterInteractionScene && scene.slots.cutPanel?.kind === 'character-timeline-stack'
      ? scene.slots.cutPanel
      : undefined;
  const characterTimelineRuns =
    characterInteractionScene && characterManagement.loadState.kind === 'ready'
      ? resolveOwnerCharacterRuns(characterManagement.loadState.snapshot, scene.context.owner)
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
  const cutPanel = workspaceScene ? activeWorkbench.layout.cutPanel : undefined;
  const workspaceCutSurface =
    workspaceScene && scene.slots.cutPanel?.kind === 'workspace-cut'
      ? scene.slots.cutPanel
      : undefined;
  const cutPanelVisible = workspaceCutSurface !== undefined && cutPanel?.presentation === 'docked';
  const workspaceMainVisible = Boolean(
    workspaceScene && isWorkbenchRegionVisible(activeWorkbench.layout, 'main'),
  );
  const cutPanelExpanded = cutPanelVisible && !workspaceMainVisible;
  const workspaceAgentVisible =
    workspaceAgentSurface !== undefined &&
    isWorkbenchRegionVisible(activeWorkbench.layout, 'agent');
  const worldRuntimeScene = worldRuntimeBinding !== undefined;
  const interactionVisible = runtimeScene
    ? runtimePanelVisibility.agent
    : Boolean(launchScope) || workspaceAgentVisible;
  const interactionPresentation = launchScope
    ? characterInteractionScene
      ? runtimePanelVisibility.agent
        ? runtimePanelVisibility.main
          ? ('docked' as const)
          : ('main' as const)
        : ('hidden' as const)
      : assistantPreviewVisible
        ? ('docked' as const)
        : ('main' as const)
    : worldRuntimeScene
      ? runtimePanelVisibility.agent
        ? runtimePanelVisibility.main
          ? ('docked' as const)
          : ('main' as const)
        : ('hidden' as const)
      : workspaceAgentVisible
        ? cutPanelExpanded || workspaceMainVisible
          ? ('docked' as const)
          : ('main' as const)
        : ('hidden' as const);
  const interactionPosition =
    characterInteractionScene ||
    worldRuntimeScene ||
    (workspaceScene &&
      activeResourcePresentation !== 'hidden' &&
      activeWorkbench.layout.display.chatPosition === 'right')
      ? ('left' as const)
      : activeWorkbench.layout.display.chatPosition;
  const agentSurfaceProps =
    scene.slots.interaction?.kind === 'agent'
      ? createDesktopAgentSurfaceProps({
          workbenchInstanceId: activeWorkbench.workbenchInstanceId,
          sceneId: scene.sceneId,
          interaction: scene.slots.interaction,
          ...(scene.slots.interaction.scope.kind === 'unbound' &&
          characterDialogueHandoff?.draftId === scene.slots.interaction.scope.draftId
            ? {
                characterDialogueHandoff: characterDialogueHandoff.intent,
                onCharacterDialogueHandoffConsumed,
              }
            : {}),
          ...(scene.slots.interaction.scope.kind === 'unbound'
            ? {
                entryContext: {
                  workspace: {
                    projects: projection.catalog.projects.map((project) => ({
                      projectId: project.projectId,
                      label: project.displayName,
                      ...(project.unavailable ? { disabled: true } : {}),
                    })),
                  },
                  loadCharacterTargets: actions.onLoadEntryCharacterTargets,
                  loadWorldTargets: actions.onLoadEntryWorldTargets,
                },
              }
            : {}),
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
          {worldRuntimeScene && worldRuntime.loadState.kind === 'ready' ? (
            <WorldRuntimeInteractionSurface
              createIntentId={() => `world-intent:${crypto.randomUUID()}`}
              locale={locale}
              now={() => new Date().toISOString()}
              operationError={worldRuntime.operationError}
              pending={worldRuntime.pending}
              projection={worldRuntime.loadState.projection}
              submitAction={worldRuntime.submitAction}
            />
          ) : worldRuntimeScene ? (
            <div className="world-runtime__message">
              {worldRuntime.loadState.kind === 'failed'
                ? worldRuntime.loadState.message
                : locale === 'zh-cn'
                  ? '正在连接世界运行...'
                  : 'Connecting to World Runtime...'}
            </div>
          ) : projectCatalogUnavailable && !agentSurfaceProps ? (
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
                      participantProjection={characterParticipantProjection?.participants}
                      renderParticipantIdentity={(participant, placement) => (
                        <DesktopCharacterParticipantIdentity
                          key={`${placement}:${participant.participantId}`}
                          locale={locale}
                          onSelect={selectCharacterParticipant}
                          participant={participant}
                          portrait={characterParticipantPortraits.get(participant.participantId)}
                          profile
                          size="compact"
                        />
                      )}
                      state={roomWorkbench}
                    />
                  ) : undefined
                }
                messageAuthorPresentation={
                  characterInteractionScene && !roomInteractionOwner
                    ? {
                        assistant: characterParticipantProjection?.participants[0] ? (
                          <DesktopCharacterParticipantIdentity
                            locale={locale}
                            onSelect={selectCharacterParticipant}
                            participant={characterParticipantProjection.participants[0]}
                            portrait={characterParticipantPortraits.get(
                              characterParticipantProjection.participants[0].participantId,
                            )}
                            profile
                            size="compact"
                          />
                        ) : undefined,
                      }
                    : undefined
                }
              />
            </DesktopSurfaceErrorBoundary>
          ) : null}
        </section>
      </div>
    </DesktopSurfaceErrorBoundary>
  );
  const sceneShape = worldRuntimeScene
    ? 'world-runtime'
    : launchScope
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
  const mainSplit =
    assetPreviewVisible || characterDetailVisible || worldDetailVisible
      ? ('columns' as const)
      : workspaceScene
        ? (activeWorkbench.layout.main.split?.axis ?? 'none')
        : 'none';
  const secondaryMainVisible =
    assetPreviewVisible ||
    characterDetailVisible ||
    worldDetailVisible ||
    Boolean(workspaceScene && activeWorkbench.layout.main.groups[1]);
  const mainSplitResize: ControlledWorkbenchResizeBinding | undefined =
    assetPreviewVisible || characterDetailVisible || worldDetailVisible
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
  const worldRuntimeManagerVisible =
    worldRuntimeScene && scene.slots.rightManager?.kind === 'world-runtime-manager';
  const rightDockVisible =
    resourceDockVisible ||
    (runtimePanelVisibility.manager && (characterManagerVisible || worldRuntimeManagerVisible));
  const characterTimelineVisible = storylineTimelineVisible || roomEventTimelineVisible;
  const worldRuntimeTimelineVisible =
    worldRuntimeScene && scene.slots.cutPanel?.kind === 'world-runtime-timeline';
  const bottomPanelVisible =
    cutPanelVisible || characterTimelineVisible || worldRuntimeTimelineVisible;
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
                  available: workspaceScene,
                  selected: workspaceMainVisible,
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
          ) : runtimeScene ? (
            <RuntimeRegionControls
              disabled={interactionLocks.workbench}
              onToggle={toggleRuntimePanel}
              visibility={runtimePanelVisibility}
            />
          ) : undefined
        }
        primarySidebar={
          <ApplicationPrimarySidebar
            activeSection={activeSection}
            compact={compact}
            disabled={interactionLocks.navigation || interactionLocks.sidebar}
            activeProjectId={workspaceProject?.projectId}
            onArchiveConversations={actions.onArchiveConversations}
            onArchiveProjectConversations={(project) =>
              actions.onArchiveProjectConversations([project])
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
        interactionWidth={
          runtimeScene
            ? Math.max(activeWorkbench.layout.display.chatWidth, RUNTIME_AGENT_MIN_WIDTH)
            : activeWorkbench.layout.display.chatWidth
        }
        interactionResize={interactionResize}
        main={portalDeck('main')}
        secondaryMain={portalDeck('secondaryMain', secondaryMainVisible)}
        secondaryMainVisible={secondaryMainVisible}
        mainComposition="continuous"
        mainSplit={mainSplit}
        mainSplitRatio={
          assetPreviewVisible || characterDetailVisible || worldDetailVisible
            ? managementSplitRatio
            : activeWorkbench.layout.main.split?.ratio
        }
        mainSplitResize={mainSplitResize}
        bottomPanel={
          cutPanel || characterTimelineVisible || worldRuntimeTimelineVisible
            ? portalDeck('bottomPanel', bottomPanelVisible)
            : undefined
        }
        bottomPanelVisible={bottomPanelVisible}
        bottomPanelPresentation={cutPanelExpanded ? 'expanded' : 'docked'}
        bottomPanelHeight={
          cutPanel?.height ??
          (characterTimelineVisible ? 260 : worldRuntimeTimelineVisible ? 220 : undefined)
        }
        bottomPanelResize={cutPanelResize}
        leftDock={portalDeck('leftDock', scene.context.kind === 'settings')}
        leftDockPresentation={scene.context.kind === 'settings' ? 'docked' : 'hidden'}
        leftDockWidth={scene.context.kind === 'settings' ? 300 : undefined}
        rightDock={portalDeck('rightDock', rightDockVisible)}
        rightDockPresentation={
          resourceDockVisible
            ? activeResourcePresentation
            : runtimePanelVisibility.manager && characterManagerVisible
              ? 'docked'
              : runtimePanelVisibility.manager && worldRuntimeManagerVisible
                ? 'docked'
                : 'hidden'
        }
        rightDockWidth={
          characterManagerVisible || worldRuntimeManagerVisible
            ? RUNTIME_MANAGER_WIDTH
            : activeWorkbench.layout.resourceDock.width
        }
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
          interactive={interactive}
          portalTargets={portalTargets}
          projection={projection}
          roomWorkbench={roomWorkbench}
          characterParticipantPortraits={characterParticipantPortraits}
          selectedCharacterParticipantId={selectedCharacterParticipantId}
          onSelectedCharacterParticipantChange={selectCharacterParticipant}
          resourceBrowserView={settings.projection.preferences.resourceBrowserView}
          worldManagement={worldManagement}
          runtimePanelVisibility={runtimePanelVisibility}
          worldRuntime={worldRuntime}
        />
      </DesktopSurfaceErrorBoundary>
    </>
  );
}

type DesktopWorkbenchPortalSlot =
  'main' | 'secondaryMain' | 'leftDock' | 'rightDock' | 'bottomPanel';

type RuntimePanelRegion = 'agent' | 'main' | 'manager';

type RuntimePanelVisibility = Readonly<Record<RuntimePanelRegion, boolean>>;

const RUNTIME_AGENT_MIN_WIDTH = 440;
const RUNTIME_MANAGER_WIDTH = 280;

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
  characterParticipantPortraits,
  composition,
  interactive,
  portalTargets,
  projection,
  roomWorkbench,
  selectedCharacterParticipantId,
  onSelectedCharacterParticipantChange,
  resourceBrowserView,
  runtimePanelVisibility,
  worldManagement,
  worldRuntime,
}: {
  readonly actions: ShellActions;
  readonly characterManagement: CharacterManagementRuntime;
  readonly characterParticipantPortraits: ReadonlyMap<string, CharacterParticipantPortraitState>;
  readonly composition: DesktopWindowCompositionProjection;
  readonly interactive: boolean;
  readonly portalTargets: ReadonlyMap<string, HTMLDivElement>;
  readonly projection: DesktopShellProjection;
  readonly roomWorkbench: ReturnType<typeof useCharacterRoomWorkbenchRuntime>;
  readonly selectedCharacterParticipantId?: string;
  readonly onSelectedCharacterParticipantChange: (participantId: string) => void;
  readonly resourceBrowserView: 'list' | 'grid';
  readonly runtimePanelVisibility: RuntimePanelVisibility;
  readonly worldManagement: ReturnType<typeof useWorldManagementRuntime>;
  readonly worldRuntime: ReturnType<typeof useWorldRuntimePresentation>;
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
  const professionalApplications = useDesktopProfessionalApplicationScene(scene);
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
  const worldRuntimeProjection =
    scene.context.kind === 'world-runtime' && worldRuntime.loadState.kind === 'ready'
      ? worldRuntime.loadState.projection
      : undefined;
  const characterPresentation =
    characterInteraction && scene.slots.main?.kind === 'character-presentation'
      ? scene.slots.main
      : undefined;
  const runtimeManager = characterInteraction ? (
    <CharacterRuntimeManagerSurface
      owner={characterInteraction.owner}
      onSelectedParticipantChange={onSelectedCharacterParticipantChange}
      participantPortraits={characterParticipantPortraits}
      runtime={characterManagement}
      selectedParticipantId={selectedCharacterParticipantId}
    />
  ) : worldRuntimeProjection ? (
    <WorldRuntimeManagerSurface locale={locale} projection={worldRuntimeProjection} />
  ) : undefined;
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
  const mainContent =
    settingsSection !== undefined ? (
      <DesktopSettingsMainSurface section={settingsSection} />
    ) : scene.context.kind === 'asset-center' ? (
      assetCenter.runtime ? (
        <DesktopAssetManagementSurface interactive={interactive} runtime={assetCenter.runtime} />
      ) : null
    ) : scene.context.kind === 'extensions' ? (
      extensionManagement && professionalApplications ? (
        <DesktopExtensionManagementSurface
          interactive={interactive}
          extensionRuntime={extensionManagement}
          professionalApplicationRuntime={professionalApplications}
        />
      ) : null
    ) : scene.context.kind === 'world-runtime' ? (
      worldRuntimeProjection ? (
        <WorldRuntimeMainSurface locale={locale} projection={worldRuntimeProjection} />
      ) : (
        <div className="world-runtime__message">
          {worldRuntime.loadState.kind === 'failed' ? (
            <>
              <strong>
                {locale === 'zh-cn' ? '无法打开世界运行' : 'Unable to open World Runtime'}
              </strong>
              <span>{worldRuntime.loadState.message}</span>
              <button type="button" onClick={() => void worldRuntime.reload()}>
                {locale === 'zh-cn' ? '重试' : 'Retry'}
              </button>
            </>
          ) : locale === 'zh-cn' ? (
            '正在连接世界运行...'
          ) : (
            'Connecting to World Runtime...'
          )}
        </div>
      )
    ) : scene.context.kind === 'creative-management' ? (
      scene.context.catalog === 'content-projects' ? (
        <ProjectCatalogRoot
          associatedConversationCounts={countProjectConversations(projection)}
          interactive={interactive}
          onOpenDirectory={actions.onOpenWorkspaceDirectory}
          onOpen={actions.onSelectProject}
          onArchiveAssociatedConversations={actions.onArchiveProjectConversations}
          onRemove={actions.onRemoveProjects}
          projects={projection.catalog.projects}
        />
      ) : scene.context.catalog === 'characters' ? (
        <CharacterCatalogSurface
          locale={locale}
          onCreate={() => actions.onTransitionScene({ kind: 'open-agent-entry' })}
          onImport={actions.onImportCharacterPackage}
          onStartFromTemplate={() => actions.onTransitionScene({ kind: 'open-agent-entry' })}
          onSelect={(globalCharacterId) =>
            actions.onTransitionScene({
              kind: 'select-character-detail',
              selection: { kind: 'global', globalCharacterId },
            })
          }
          runtime={characterManagement}
          selectedGlobalCharacterId={characterDetailSelection?.globalCharacterId}
        />
      ) : (
        <WorldManagementCatalogRoot
          actions={{
            onCreate: () => actions.onTransitionScene({ kind: 'open-agent-entry' }),
            onImport: actions.onImportWorldPackage,
            onStartFromTemplate: () => actions.onTransitionScene({ kind: 'open-agent-entry' }),
          }}
          locale={locale}
          onSelect={(globalWorldId) =>
            actions.onTransitionScene({
              kind: 'select-world-detail',
              selection: { kind: 'global', globalWorldId },
            })
          }
          runtime={worldManagement}
          selectedGlobalWorldId={worldDetailSelection?.globalWorldId}
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
        <SceneSurfaceUnavailable owner="character-presentation:unavailable" />
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
        size="full"
      >
        {mainContent}
      </StaticWorkbenchMainPanelSurface>
    ) : scene.context.kind === 'world-runtime' ? (
      mainContent
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
      label={foundationDetailLabel(locale)}
      panelId="character-detail"
      role="detail"
    >
      <CharacterDetailSurface
        actions={{
          onExport: actions.onExportCharacterPackage,
          onImport: () => {
            const character =
              characterManagement.loadState.kind === 'ready'
                ? characterManagement.loadState.snapshot.character.globalCharacters.find(
                    (candidate) =>
                      candidate.globalCharacterId === characterDetailSelection.globalCharacterId,
                  )
                : undefined;
            actions.onImportCharacterPackage(
              character
                ? {
                    kind: 'existing',
                    globalCharacterId: character.globalCharacterId,
                    expectedCurrentCharacterVersionId: character.currentCharacterVersionId,
                  }
                : undefined,
            );
          },
          onStartInteraction: (globalCharacterId, characterVersionId) => {
            const character =
              characterManagement.loadState.kind === 'ready'
                ? characterManagement.loadState.snapshot.character.globalCharacters.find(
                    (candidate) => candidate.globalCharacterId === globalCharacterId,
                  )
                : undefined;
            if (!character?.characterVersionIds.includes(characterVersionId)) {
              throw new Error(
                `CharacterVersion '${characterVersionId}' is unavailable for GlobalCharacter '${globalCharacterId}'.`,
              );
            }
            void actions.onStartGlobalCharacterConversation({
              globalCharacterId,
              characterVersionId,
              label: character.displayName,
            });
          },
        }}
        locale={locale}
        runtime={characterManagement}
        selection={characterDetailSelection}
      />
    </StaticWorkbenchMainPanelSurface>
  ) : scene.context.kind === 'creative-management' &&
    scene.context.catalog === 'worlds' &&
    worldDetailSelection ? (
    <StaticWorkbenchMainPanelSurface
      label={worldDetailLabel(locale)}
      panelId="world-detail"
      role="detail"
    >
      <WorldManagementDetailRoot
        actions={{
          onExport: actions.onExportWorldPackage,
          onImport: () => {
            const world =
              worldManagement.loadState.kind === 'ready'
                ? worldManagement.loadState.catalog.items.find(
                    (candidate) =>
                      candidate.globalWorldId === worldDetailSelection.globalWorldId &&
                      candidate.status === 'available',
                  )
                : undefined;
            actions.onImportWorldPackage(
              world?.status === 'available'
                ? {
                    kind: 'existing',
                    globalWorldId: world.globalWorldId,
                    expectedCurrentWorldVersionId: world.currentWorldVersionId,
                  }
                : undefined,
            );
          },
        }}
        locale={locale}
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
    scene.context.kind === 'agent' && scene.context.scope.kind === 'workspace'
      ? workspaceSlots.rightDock
      : runtimePanelVisibility.manager && runtimeManager
        ? runtimeManager
        : undefined;
  const visibleMain =
    !characterInteraction && scene.context.kind !== 'world-runtime'
      ? main
      : runtimePanelVisibility.main
        ? main
        : null;
  const characterSnapshot =
    characterManagement.loadState.kind === 'ready'
      ? characterManagement.loadState.snapshot
      : undefined;
  const characterOwnerRuns =
    characterInteraction && characterSnapshot
      ? resolveOwnerCharacterRuns(characterSnapshot, characterInteraction.owner)
      : [];
  const storylineTimeline =
    characterSnapshot &&
    characterOwnerRuns.some((run) => run.runtimeBinding.kind === 'narrative') ? (
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
    scene.context.kind === 'world-runtime' ? (
      worldRuntimeProjection ? (
        <div className="world-runtime__bottom-surfaces">
          <WorldRuntimeTimelineSurface locale={locale} projection={worldRuntimeProjection} />
          <WorldRuntimeStatusSurface locale={locale} projection={worldRuntimeProjection} />
        </div>
      ) : undefined
    ) : characterTimelineStack && (storylineTimeline || roomEventTimelineRef) ? (
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
    main: visibleMain,
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
  resolve:
    () =>
    ({ runtime, surface, workbenchInstanceId }) => (
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
        surface: 'avatar',
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
  onSelectedParticipantChange,
  owner,
  participantPortraits,
  runtime,
  selectedParticipantId,
}: {
  readonly onSelectedParticipantChange: (participantId: string) => void;
  readonly owner: CharacterInteractionOwner;
  readonly participantPortraits: ReadonlyMap<string, CharacterParticipantPortraitState>;
  readonly runtime: CharacterManagementRuntime;
  readonly selectedParticipantId?: string;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const snapshot = runtime.loadState.kind === 'ready' ? runtime.loadState.snapshot : undefined;
  const runs = snapshot ? resolveOwnerCharacterRuns(snapshot, owner) : [];
  return (
    <section
      className="character-workbench-manager project-dock-panel"
      data-character-context-manager="true"
      data-character-owner-kind={owner.kind}
    >
      {snapshot ? (
        <CharacterParticipantManagerSurface
          locale={locale}
          onSelectedParticipantChange={onSelectedParticipantChange}
          owner={owner}
          renderParticipantIdentity={(participant, placement) => (
            <DesktopCharacterParticipantIdentity
              key={`${placement}:${participant.participantId}`}
              locale={locale}
              participant={participant}
              portrait={participantPortraits.get(participant.participantId)}
              profile={placement === 'details'}
              size="standard"
            />
          )}
          selectedParticipantId={selectedParticipantId}
          snapshot={snapshot}
        />
      ) : (
        <div className="character-workbench-manager__status" role="status">
          {runtime.loadState.kind === 'failed'
            ? runtime.loadState.message
            : t('character.workbench.notConnected')}
        </div>
      )}
      {snapshot && runs.length > 0 ? (
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

function DesktopCharacterParticipantIdentity({
  locale,
  onSelect,
  participant,
  portrait,
  profile,
  size,
}: {
  readonly locale: SupportedLocale;
  readonly onSelect?: (participantId: string) => void;
  readonly participant: CharacterParticipantProjection;
  readonly portrait?: CharacterParticipantPortraitState;
  readonly profile: boolean;
  readonly size: 'compact' | 'standard';
}): JSX.Element {
  return (
    <CharacterParticipantIdentityAvatar
      locale={locale}
      onSelect={onSelect}
      participant={participant}
      portraitState={
        portrait?.kind ??
        (participant.character?.portraitRepresentationId ? 'loading' : 'unconfigured')
      }
      portraitUrl={portrait?.kind === 'ready' ? portrait.url : undefined}
      profile={profile}
      size={size}
    />
  );
}

type CharacterParticipantPortraitState =
  | { readonly kind: 'unconfigured' | 'loading' | 'unavailable' }
  | { readonly kind: 'ready'; readonly url: string };

const EMPTY_CHARACTER_PARTICIPANTS: readonly CharacterParticipantProjection[] = [];

function useCharacterParticipantPortraits(input: {
  readonly participants: readonly CharacterParticipantProjection[];
  readonly workbenchInstanceId: string;
}): ReadonlyMap<string, CharacterParticipantPortraitState> {
  const portraitRequests = useMemo(
    () =>
      input.participants
        .map((participant) => ({
          participantId: participant.participantId,
          characterRunId: participant.character?.characterRunId,
          representationId: participant.character?.portraitRepresentationId,
        }))
        .filter(
          (
            request,
          ): request is {
            readonly participantId: string;
            readonly characterRunId: string;
            readonly representationId: string;
          } => Boolean(request.characterRunId && request.representationId),
        ),
    [input.participants],
  );
  const [portraits, setPortraits] = useState<
    ReadonlyMap<string, CharacterParticipantPortraitState>
  >(() => new Map());

  useEffect(() => {
    let active = true;
    const leases: string[] = [];
    const initial = new Map<string, CharacterParticipantPortraitState>();
    for (const participant of input.participants) {
      initial.set(
        participant.participantId,
        participant.character?.portraitRepresentationId
          ? { kind: 'loading' }
          : { kind: 'unconfigured' },
      );
    }
    setPortraits(initial);
    for (const request of portraitRequests) {
      void Promise.resolve(
        window.openNekoDesktop.characterAvatar.openSurface({
          characterRunId: request.characterRunId,
          representationId: request.representationId,
          surface: 'portrait',
          workbenchInstanceId: input.workbenchInstanceId,
        }),
      )
        .then((result) => {
          if (!result) {
            if (active) {
              setPortraits((current) =>
                new Map(current).set(request.participantId, { kind: 'unavailable' }),
              );
            }
            return;
          }
          if (!active) {
            if (result.status === 'ready') {
              void window.openNekoDesktop.characterAvatar.releaseSurface(
                result.descriptor.avatarResourceLeaseId,
              );
            }
            return;
          }
          if (result.status !== 'ready' || result.descriptor.kind !== 'portrait') {
            setPortraits((current) =>
              new Map(current).set(request.participantId, { kind: 'unavailable' }),
            );
            return;
          }
          leases.push(result.descriptor.avatarResourceLeaseId);
          setPortraits((current) =>
            new Map(current).set(request.participantId, {
              kind: 'ready',
              url: result.descriptor.url,
            }),
          );
        })
        .catch(() => {
          if (active) {
            setPortraits((current) =>
              new Map(current).set(request.participantId, { kind: 'unavailable' }),
            );
          }
        });
    }
    return () => {
      active = false;
      for (const leaseId of leases) {
        void window.openNekoDesktop.characterAvatar.releaseSurface(leaseId);
      }
    };
  }, [input.participants, input.workbenchInstanceId, portraitRequests]);

  return portraits;
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

function hasCharacterVisualRepresentation(
  snapshot: Extract<
    CharacterManagementRuntime['loadState'],
    { readonly kind: 'ready' }
  >['snapshot'],
  owner: CharacterInteractionOwner,
): boolean {
  if (owner.kind === 'room') return false;
  const run = snapshot.character.characterRuns.find(
    (candidate) => candidate.characterRunId === owner.characterRunId,
  );
  if (!run) return false;
  const publication = snapshot.character.versions.find(
    (candidate) => candidate.characterVersionId === run.characterVersionId,
  );
  const representationId = publication?.definition.representationDefaults?.avatarRepresentationId;
  return Boolean(
    representationId &&
    publication?.definition.representationRefs.some(
      (representation) => representation.representationId === representationId,
    ),
  );
}

export function createDesktopAgentSurfaceProps(input: {
  readonly workbenchInstanceId: string;
  readonly sceneId: string;
  readonly interaction: DesktopAgentInteractionSurfaceRef;
  readonly entryContext?: DesktopAgentSurfaceProps['entryContext'];
  readonly characterDialogueHandoff?: CharacterDialogueHandoffIntent;
  readonly onCharacterDialogueHandoffConsumed?: (intentId: string) => void;
}): DesktopAgentSurfaceProps {
  const { interaction } = input;
  return {
    agentSurfaceId: interaction.agentSurfaceId,
    workbenchInstanceId: input.workbenchInstanceId,
    sceneId: input.sceneId,
    surfaceKind:
      interaction.scope.kind === 'unbound'
        ? 'entry'
        : interaction.scope.kind === 'assistant'
          ? 'assistant'
          : 'workspace',
    ...(input.entryContext === undefined ? {} : { entryContext: input.entryContext }),
    ...(input.characterDialogueHandoff === undefined
      ? {}
      : {
          characterDialogueHandoff: input.characterDialogueHandoff,
          onCharacterDialogueHandoffConsumed: input.onCharacterDialogueHandoffConsumed,
        }),
    ...(interaction.scope.kind === 'unbound' || interaction.scope.conversationId === undefined
      ? {}
      : { conversationId: interaction.scope.conversationId }),
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
  const workspaceMains = [slots.main, slots.secondaryMain].filter(
    (
      surface,
    ): surface is Extract<
      DesktopWorkbenchMainSurfaceRef,
      { readonly kind: 'workspace-main' | 'character-authoring' | 'world-authoring' }
    > => Boolean(surface && isWorkspaceAuthoringMainSurface(surface)),
  );
  if (
    [slots.main, slots.secondaryMain].some(
      (surface) => surface && !isWorkspaceAuthoringMainSurface(surface),
    )
  ) {
    throw new Error('Workspace Scene Main Surface must use an exact authoring Surface ref.');
  }
  const workspaceScope = context.scope;
  if (workspaceMains.some((surface) => surface.workspaceId !== workspaceScope.workspaceId)) {
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
  for (const workspaceMain of workspaceMains) {
    if (
      !instance.layout.main.views.some((candidate) =>
        matchesWorkspaceAuthoringMainSurface(candidate, workspaceMain, project.projectId),
      )
    ) {
      throw new Error('Workspace Scene Main Surface has no exact Workbench View.');
    }
  }
  const activeGroupCount = instance.layout.main.groups.filter(
    (group) => group.activeViewId !== undefined,
  ).length;
  if (workspaceMains.length !== activeGroupCount) {
    throw new Error('Workspace Scene does not project every active Main Group.');
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
      surface.authority.kind === 'project' &&
      surface.authority.projectId === projectId
    );
  }
  if (surface.kind === 'world-authoring') {
    return (
      view.kind === 'world-authoring' &&
      view.worldProjectId === surface.worldProjectId &&
      surface.authority.kind === 'project' &&
      surface.authority.projectId === projectId
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

function foundationDetailLabel(locale: string): string {
  return locale.startsWith('zh') ? '角色详情' : 'Character detail';
}

function worldDetailLabel(locale: string): string {
  return locale.startsWith('zh') ? '世界详情' : 'World detail';
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

function useDesktopProfessionalApplicationScene(
  scene: DesktopWorkbenchSceneProjection,
): DesktopProfessionalApplicationRuntime | undefined {
  const active = scene.context.kind === 'extensions';
  const runtime = useMemo(() => {
    if (!active || typeof window === 'undefined') return undefined;
    return new DesktopProfessionalApplicationRuntime(
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
  const { locale } = useTranslation();
  const workbench = instance.layout;
  const workspaceScope =
    instance.scene.context.kind === 'agent' && instance.scene.context.scope.kind === 'workspace'
      ? instance.scene.context.scope
      : undefined;
  const resourceDockPresentation = useResourceDockPresentation(workbench.resourceDock.presentation);
  const projectAuthoringHost =
    typeof window === 'undefined' ? undefined : window.openNekoDesktop.projectAuthoring;
  if (!project) {
    if (
      workspaceScope &&
      instance.scene.slots.main === undefined &&
      instance.scene.slots.secondaryMain === undefined &&
      instance.scene.slots.rightManager === undefined &&
      workbench.main.views.length === 0
    ) {
      return {
        main: (
          <div className="project-main-host" data-authoring-authority="standalone-empty">
            <div className="project-main-host__content">
              <EmptyMainSurface />
            </div>
          </div>
        ),
      };
    }
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
  const resourceBrowserIdentity = createDesktopResourceBrowserIdentity({
    projectId: project.projectId,
    workspaceId: project.workspaceId,
    windowId: projection.window.windowId,
    projectViewId: tab.viewId,
    projectViewInstanceId: tab.viewInstanceId,
    rendererSessionId: projection.rendererSessionId,
  });
  const primaryGroup = workbench.main.groups[0];
  if (!primaryGroup) {
    throw new Error('Desktop Workbench requires a primary Main Group.');
  }
  const secondaryGroup = workbench.main.groups[1];
  const openWorkspaceTarget = (item: ProjectMixedDomainTargetItem): void => {
    if (item.diagnostic) {
      throw new Error(item.diagnostic);
    }
    const target = item.target;
    if (target.kind === 'content-document') {
      const view = workbench.main.views.find(
        (candidate) =>
          candidate.kind !== 'project-content' &&
          candidate.kind !== 'character-authoring' &&
          candidate.kind !== 'world-authoring' &&
          candidate.documentId === target.documentId,
      );
      if (!view) {
        throw new Error(
          locale === 'zh-cn'
            ? `内容“${item.label}”尚未建立编辑视图，请先从资源中打开。`
            : `Content '${item.label}' has no editor View yet. Open it from Resources first.`,
        );
      }
      actions.onUpdateWorkbench(instance.workbenchInstanceId, openOrFocusMainView(workbench, view));
      return;
    }
    if (target.kind === 'character-project') {
      const characterProjectId = target.characterProjectId;
      const existing = workbench.main.views.find(
        (view) =>
          view.kind === 'character-authoring' && view.characterProjectId === characterProjectId,
      );
      const view: DesktopWorkbenchViewRef = existing ?? {
        viewId: `character-authoring:${characterProjectId}`,
        viewInstanceId: `character-authoring-view:${crypto.randomUUID()}`,
        projectId: project.projectId,
        workspaceId: project.workspaceId,
        kind: 'character-authoring',
        ownerId: characterProjectId,
        displayLabel: item.label,
        characterProjectId,
      };
      actions.onUpdateWorkbench(
        instance.workbenchInstanceId,
        openOrFocusMainView(workbench, view, {
          groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
          splitAxis: 'columns',
        }),
      );
      return;
    }
    const worldProjectId = target.worldProjectId;
    const existing = workbench.main.views.find(
      (view) => view.kind === 'world-authoring' && view.worldProjectId === worldProjectId,
    );
    const view: DesktopWorkbenchViewRef = existing ?? {
      viewId: `world-authoring:${worldProjectId}`,
      viewInstanceId: `world-authoring-view:${crypto.randomUUID()}`,
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      kind: 'world-authoring',
      ownerId: worldProjectId,
      displayLabel: item.label,
      worldProjectId,
    };
    actions.onUpdateWorkbench(
      instance.workbenchInstanceId,
      openOrFocusMainView(workbench, view, {
        groupId: DESKTOP_SECONDARY_MAIN_GROUP_ID,
        splitAxis: 'columns',
      }),
    );
  };
  const resourceDock =
    resourceDockPresentation === 'hidden'
      ? undefined
      : createResourceDock(
          workbench,
          resourceDockPresentation,
          <DesktopWorkspaceProjectBrowser
            locale={locale}
            resources={
              assetsCapability?.status === 'ready' ? (
                <DesktopResourceBrowserSurface
                  characterCreationAuthority={workspaceScope}
                  onCharacterCreated={(characterProjectId, displayName) => {
                    const existing = workbench.main.views.find(
                      (view) =>
                        view.kind === 'character-authoring' &&
                        view.characterProjectId === characterProjectId,
                    );
                    const view: DesktopWorkbenchViewRef = existing ?? {
                      viewId: `character-authoring:${characterProjectId}`,
                      viewInstanceId: `character-authoring-view:${crypto.randomUUID()}`,
                      projectId: project.projectId,
                      workspaceId: project.workspaceId,
                      kind: 'character-authoring',
                      ownerId: characterProjectId,
                      displayLabel: displayName,
                      characterProjectId,
                    };
                    actions.onUpdateWorkbench(
                      instance.workbenchInstanceId,
                      openOrFocusMainView(workbench, view, {
                        groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
                        splitAxis: 'columns',
                      }),
                    );
                  }}
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
              )
            }
            workspace={
              workspaceScope && projectAuthoringHost ? (
                <ProjectWorkspaceRoot
                  binding={{
                    workspaceId: workspaceScope.workspaceId,
                    workspaceGrantId: workspaceScope.workspaceGrantId,
                    projectId: project.projectId,
                  }}
                  host={projectAuthoringHost}
                  locale={locale}
                  onOpenTarget={openWorkspaceTarget}
                  windowId={instance.scene.windowId}
                />
              ) : (
                <SceneSurfaceUnavailable owner="project-content-authority" />
              )
            }
          />,
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
      resourceBrowserIdentity={resourceBrowserIdentity}
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
        resourceBrowserIdentity={resourceBrowserIdentity}
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
  _project: DesktopProjectCatalogItem,
): ProjectWritableNavigationItem | undefined {
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
  if (view.kind === 'project-content') return undefined;
  if (!view.documentId) {
    throw new Error(`Desktop ${view.kind} View requires an exact Content document.`);
  }
  return {
    kind: 'authoring-target',
    target: { kind: 'content-document', documentId: view.documentId },
    identity: `content-document:${view.documentId}`,
    label: view.displayLabel,
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
  resourceBrowserIdentity,
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
  readonly resourceBrowserIdentity: ResourceBrowserIdentity;
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
  const quickCreate = useCallback(
    (submission: WorkspaceQuickCreateSubmission) =>
      actions.onQuickCreateWorkspaceContent({
        identity: resourceBrowserIdentity,
        workbenchInstanceId,
        workbench,
        mainGroupId: group.groupId,
        submission,
      }),
    [
      actions,
      group.groupId,
      resourceBrowserIdentity,
      workbench,
      workbenchInstanceId,
    ],
  );
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
          item.target.kind === 'content-document'
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
      if (item.target.kind === 'content-document') return;
      if (item.target.kind === 'character-project') {
        const snapshot = await window.openNekoDesktop.characterAuthoring.getSnapshot(
          authoringAuthority.windowId,
          {
            workspaceId: authoringAuthority.workspaceId,
            workspaceGrantId: authoringAuthority.workspaceGrantId,
            authority: { kind: 'project', projectId: project.projectId },
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
          authority: { kind: 'project', projectId: project.projectId },
          worldProjectId: item.target.worldProjectId,
        },
      );
      validatedSnapshots.current.set(item.identity, { kind: 'world', snapshot });
    },
    [authoringAuthority, project.projectId],
  );
  return (
    <WorkbenchMainPanelSurface
      active={workbench.main.activeGroupId === group.groupId}
      mainGroupId={group.groupId}
      panelId={`workspace:${group.groupId}`}
      tabs={
        visible ? (
          <>
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
                actions.onUpdateWorkbench(
                  workbenchInstanceId,
                  openOrFocusMainView(workbench, view),
                );
              }}
            />
            <WorkspaceQuickCreateControl onCreate={quickCreate} variant="tab" />
          </>
        ) : undefined
      }
    >
      {!visible || views.length === 0 ? (
        <EmptyMainSurface
          action={
            visible ? (
              <WorkspaceQuickCreateControl onCreate={quickCreate} variant="empty" />
            ) : undefined
          }
        />
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
                onFinalizeAndStartConversation: actions.onFinalizeAndStartCharacterConversation,
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
  onFinalizeAndStartConversation,
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
  readonly onFinalizeAndStartConversation: ShellActions['onFinalizeAndStartCharacterConversation'];
  readonly previewCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly validatedSnapshot?: ValidatedAuthoringSnapshot;
  readonly view: DesktopWorkbenchLayoutProjection['main']['views'][number];
}): JSX.Element {
  if (view.kind === 'project-content') {
    if (!authoringAuthority || typeof window === 'undefined') {
      return <SceneSurfaceUnavailable owner="project-content-authority" />;
    }
    return (
      <ProjectContentRoot
        binding={{
          workspaceId: authoringAuthority.workspaceId,
          workspaceGrantId: authoringAuthority.workspaceGrantId,
          projectId: project.projectId,
        }}
        host={window.openNekoDesktop.projectAuthoring}
        windowId={authoringAuthority.windowId}
      />
    );
  }
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
      <CharacterAuthoringSurface
        binding={{
          workspaceId: authoringAuthority.workspaceId,
          workspaceGrantId: authoringAuthority.workspaceGrantId,
          authority: { kind: 'project', projectId: project.projectId },
          characterProjectId: view.characterProjectId,
        }}
        host={window.openNekoDesktop.characterAuthoring}
        initialSnapshot={
          validatedSnapshot?.kind === 'character' ? validatedSnapshot.snapshot : undefined
        }
        locale={locale}
        onFinalizeAndStartConversation={onFinalizeAndStartConversation}
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
          authority: { kind: 'project', projectId: project.projectId },
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

function RuntimeRegionControls({
  disabled,
  onToggle,
  visibility,
}: {
  readonly disabled: boolean;
  readonly onToggle: (region: RuntimePanelRegion) => void;
  readonly visibility: RuntimePanelVisibility;
}): JSX.Element {
  const { t } = useTranslation();
  const canHide = (region: RuntimePanelRegion): boolean =>
    visibility[region] && Object.values(visibility).filter(Boolean).length > 1;
  return (
    <div
      className="workspace-region-controls"
      role="group"
      aria-label={t('workspace.runtimePanels')}
      data-runtime-region-controls="true"
    >
      <IconButton
        className="workbench-region-toggle"
        data-runtime-region-control="agent"
        disabled={disabled || (visibility.agent && !canHide('agent'))}
        icon={<span className={toCodiconClassName('layout-sidebar-left')} aria-hidden="true" />}
        label={t('workspace.agent')}
        size="xs"
        title={t('workspace.agent')}
        aria-pressed={visibility.agent}
        onClick={() => onToggle('agent')}
      />
      <IconButton
        className="workbench-region-toggle"
        data-runtime-region-control="main"
        disabled={disabled || (visibility.main && !canHide('main'))}
        icon={<span className={toCodiconClassName('layout-centered')} aria-hidden="true" />}
        label={t('workspace.runtimePresentation')}
        size="xs"
        title={t('workspace.runtimePresentation')}
        aria-pressed={visibility.main}
        onClick={() => onToggle('main')}
      />
      <IconButton
        className="workbench-region-toggle"
        data-runtime-region-control="manager"
        disabled={disabled || (visibility.manager && !canHide('manager'))}
        icon={<span className={toCodiconClassName('layout-sidebar-right')} aria-hidden="true" />}
        label={t('workspace.runtimeManager')}
        size="xs"
        title={t('workspace.runtimeManager')}
        aria-pressed={visibility.manager}
        onClick={() => onToggle('manager')}
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
    return workbench.display.mode === 'chat-main' || workbench.display.mode === 'main-only';
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

function EmptyMainSurface({ action }: { readonly action?: ReactNode } = {}): JSX.Element {
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
        {action}
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
      <div
        className="resource-dock-tabs"
        role="tablist"
        aria-label={t('workspace.resourceSources')}
      >
        <span role="tab" aria-selected="true">
          {t('workspace.files')}
        </span>
        <span role="tab" aria-selected="false">
          {t('workspace.media')}
        </span>
        <span role="tab" aria-selected="false">
          {t('workspace.assets')}
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
  onArchiveConversations,
  onArchiveProjectConversations,
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
  readonly onArchiveConversations: (
    conversations: readonly DesktopAgentHomeConversationSummary[],
  ) => void;
  readonly onArchiveProjectConversations: (project: DesktopProjectCatalogItem) => void;
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
        onArchiveConversations={onArchiveConversations}
        onArchiveProjectConversations={onArchiveProjectConversations}
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
  onArchiveConversations,
  onArchiveProjectConversations,
  onManageProjects,
  onOpenConversation,
  onOpenPortability,
  onOpenRecent,
  onRemoveProject,
  projection,
}: {
  readonly activeProjectId?: string;
  readonly disabled?: boolean;
  readonly onArchiveConversations: (
    conversations: readonly DesktopAgentHomeConversationSummary[],
  ) => void;
  readonly onArchiveProjectConversations: (project: DesktopProjectCatalogItem) => void;
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
              onArchiveConversations: () => onArchiveProjectConversations(project),
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
                    label={t('shell.archiveProjectConversations', {
                      project: project.displayName,
                    })}
                    title={t('shell.archiveProjectConversations', {
                      project: project.displayName,
                    })}
                    icon={<PackageIcon size={13} />}
                    onClick={() => onArchiveProjectConversations(project)}
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
            onArchiveConversations={() => onArchiveConversations(group.conversations)}
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
                onArchive={(conversation) => onArchiveConversations([conversation])}
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
  onArchiveConversations,
  onToggle,
}: {
  readonly collapsed: boolean;
  readonly disabled: boolean;
  readonly group: DesktopConversationNavigationGroup;
  readonly onArchiveConversations: () => void;
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
            label={t('shell.archiveWorkspaceConversations')}
            title={t('shell.archiveWorkspaceConversations')}
            icon={<PackageIcon size={13} />}
            onClick={onArchiveConversations}
          />
        </span>
      ) : null}
    </div>
  );
  return group.kind === 'workspace' ? (
    <ContextMenu
      items={createWorkspaceNavigationMenuItems({
        disabled,
        onArchiveConversations,
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
  onArchive,
  onOpen,
}: {
  readonly active: boolean;
  readonly conversation: DesktopAgentHomeConversationSummary;
  readonly disabled: boolean;
  readonly navigationDisabled: boolean;
  readonly onArchive: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onOpen: (conversation: DesktopAgentHomeConversationSummary) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <ContextMenu
      items={createConversationNavigationMenuItems({
        conversation,
        disabled,
        navigationDisabled,
        onArchive: () => onArchive(conversation),
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
            ) : isTerminalConversationActivity(conversation.lastActivity.kind) ? (
              <ConversationTerminalStatus activity={conversation.lastActivity.kind} />
            ) : null}
          </span>
          <span className="primary-navigation-row-actions">
            <IconButton
              disabled={disabled}
              size="xs"
              label={t('shell.archiveConversation', { conversation: conversation.title })}
              icon={<PackageIcon size={13} />}
              onClick={() => onArchive(conversation)}
            />
          </span>
        </div>
      }
    />
  );
}

function ConversationTerminalStatus({
  activity,
}: {
  readonly activity: 'turn-completed' | 'turn-cancelled' | 'turn-failed';
}): JSX.Element {
  const { t } = useTranslation();
  const label = t(`activity.${camelCase(activity)}`);
  return (
    <Tooltip content={label} side="right">
      <span
        className={`home-conversation-status is-${activity}`}
        role="status"
        title={label}
        aria-label={label}
      >
        {activity === 'turn-completed' ? (
          <SuccessIcon size={12} />
        ) : activity === 'turn-cancelled' ? (
          <CloseIcon size={12} />
        ) : (
          <ErrorIcon size={12} />
        )}
      </span>
    </Tooltip>
  );
}

function isTerminalConversationActivity(
  activity: DesktopAgentHomeConversationSummary['lastActivity']['kind'],
): activity is 'turn-completed' | 'turn-cancelled' | 'turn-failed' {
  return (
    activity === 'turn-completed' || activity === 'turn-cancelled' || activity === 'turn-failed'
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
  readonly onArchiveConversations: () => void;
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
    { id: 'project-management-separator', type: 'separator' },
    {
      id: 'archive-project-conversations',
      label: (
        <NavigationMenuLabel
          icon={<PackageIcon size={14} />}
          text={input.t('shell.archiveProjectConversations', {
            project: input.project.displayName,
          })}
        />
      ),
      disabled: input.disabled || input.workspaceConversationCount === 0,
      onSelect: input.onArchiveConversations,
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
  readonly onArchive: () => void;
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
    { id: 'conversation-management-separator', type: 'separator' },
    {
      id: 'archive-conversation',
      label: (
        <NavigationMenuLabel
          icon={<PackageIcon size={14} />}
          text={input.t('home.archiveConversation')}
        />
      ),
      disabled: input.disabled,
      onSelect: input.onArchive,
    },
  ];
}

function createWorkspaceNavigationMenuItems(input: {
  readonly disabled: boolean;
  readonly onArchiveConversations: () => void;
  readonly t: TranslationFunction;
}): readonly ContextMenuItem[] {
  return [
    {
      id: 'archive-workspace-conversations',
      label: (
        <NavigationMenuLabel
          icon={<PackageIcon size={14} />}
          text={input.t('shell.archiveWorkspaceConversations')}
        />
      ),
      disabled: input.disabled,
      onSelect: input.onArchiveConversations,
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
