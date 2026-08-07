import { type SupportedLocale } from '@neko/ui/i18n';
import { CONTENT_LOCATOR_DRAG_MIME, createContentLocatorDragData } from '@neko/content';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CodeIcon,
  CubeIcon,
  EditIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  PackageIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SuccessIcon,
  TrashIcon,
  VolumeIcon,
  WarningIcon,
  InfoIcon,
} from '@neko/ui/icons';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  RESOURCE_BROWSER_ROUTES,
  createResourceBrowserChildrenRequest,
  createResourceBrowserEntityIntentRequest,
  createResourceBrowserQuickPreviewReleaseRequest,
  createResourceBrowserQuickPreviewRequest,
  createResourceBrowserRecoveryApplyRequest,
  createResourceBrowserRecoveryCancelRequest,
  createResourceBrowserRecoveryPlanRequest,
  createResourceBrowserSearchRequest,
  createResourceBrowserThumbnailRequest,
  type ResourceBrowserFacet,
  type ResourceBrowserHostRuntime,
  type ResourceBrowserItem,
  type ResourceBrowserProjection,
  type ResourceBrowserQuickPreviewResult,
  type ResourceBrowserRecoveryPlanResult,
} from '@neko/assets-domain/resource-browser/contract';
import { getResourceBrowserLabels } from './labels';
import {
  EntityInspector,
  type EntityInspectorDraft,
  type EntityInspectorProps,
} from '@neko/entity-webview/inspector';
import { useResourceBrowserPresentationSnapshotStore } from './presentation-snapshot-context';
import type {
  ResourceBrowserPresentationIdentity,
  ResourceBrowserPresentationSnapshot,
  ResourceBrowserPresentationSnapshotStore,
} from './presentation-snapshot';
import './style.css';

export interface ResourceBrowserRootProps {
  readonly runtime: ResourceBrowserHostRuntime;
  readonly locale: SupportedLocale;
  readonly chrome?: 'standalone' | 'embedded';
  readonly defaultViewMode?: 'list' | 'grid';
  readonly refreshControl?: 'visible' | 'hidden';
  readonly lifecyclePresentation?: 'active' | 'suspended';
  readonly previewTarget?: {
    readonly viewId: string;
    readonly presentation: 'temporary' | 'side';
  };
  readonly onOpenCanvas?: (item: ResourceBrowserItem, presentation: 'main' | 'side') => void;
  readonly renderQuickPreview?: (
    descriptor: ResourceBrowserQuickPreviewResult['descriptor'],
  ) => ReactNode;
}

type ResourceBrowserRootState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly projection: ResourceBrowserProjection }
  | { readonly kind: 'error'; readonly message: string };

export function ResourceBrowserRoot({
  chrome = 'standalone',
  defaultViewMode = 'list',
  locale,
  lifecyclePresentation = 'active',
  onOpenCanvas,
  previewTarget,
  refreshControl = 'visible',
  renderQuickPreview,
  runtime,
}: ResourceBrowserRootProps): ReactElement {
  const labels = getResourceBrowserLabels(locale);
  const presentationSnapshots = useResourceBrowserPresentationSnapshotStore();
  const presentationIdentity = resourceBrowserPresentationIdentity(runtime.identity);
  const displayStateKey = `${runtime.identity.projectId}:${runtime.identity.workspaceId}`;
  const initialDisplayState = useRef(presentationSnapshots?.read(presentationIdentity)).current;
  const [state, setState] = useState<ResourceBrowserRootState>({ kind: 'loading' });
  const [query, setQuery] = useState(initialDisplayState?.query ?? '');
  const [selectedIdByFacet, setSelectedIdByFacet] = useState<
    Readonly<Partial<Record<ResourceBrowserFacet, string>>>
  >(() => initialDisplayState?.selectedResourceIds ?? {});
  const [pending, setPending] = useState(false);
  const [libraryMenuOpen, setLibraryMenuOpen] = useState(false);
  const [recovery, setRecovery] = useState<
    Extract<ResourceBrowserRecoveryPlanResult, { readonly status: 'planned' }> | undefined
  >();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(
    initialDisplayState?.viewMode ?? defaultViewMode,
  );
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(initialDisplayState?.expandedResourceIds ?? []),
  );
  const [activeContainerByFacet, setActiveContainerByFacet] = useState<
    Readonly<Partial<Record<'files' | 'media', string>>>
  >(() => initialDisplayState?.activeContainerResourceIds ?? {});
  const [entityDrafts, setEntityDrafts] = useState<Readonly<Record<string, EntityInspectorDraft>>>(
    () => initialDisplayState?.entityDrafts ?? {},
  );
  const requestSequence = useRef(0);
  const eventSequence = useRef(0);
  const pendingChildrenFacet = useRef<'files' | 'media'>();
  const activeDisplayStateKey = useRef(displayStateKey);
  const activePresentationIdentity = useRef(presentationIdentity);
  const restoringDisplayState = useRef(false);
  const quickPreviewRequestId = useRef<string>();
  const quickPreviewTimer = useRef<ReturnType<typeof setTimeout>>();
  const quickPreviewSession = useRef<string>();
  const libraryMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    readonly x: number;
    readonly y: number;
    readonly facet: ResourceBrowserFacet;
    readonly item?: ResourceBrowserItem;
  }>();
  const [createDirectoryParent, setCreateDirectoryParent] = useState<
    { readonly invocationId: string; readonly item?: ResourceBrowserItem } | undefined
  >();
  const [directoryName, setDirectoryName] = useState('');
  const [quickPreview, setQuickPreview] = useState<{
    readonly resourceId: string;
    readonly result: ResourceBrowserQuickPreviewResult;
  }>();
  useEffect(() => {
    if (!libraryMenuOpen) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !libraryMenuRef.current?.contains(event.target)) {
        setLibraryMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [libraryMenuOpen]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !contextMenuRef.current?.contains(event.target)) {
        setContextMenu(undefined);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setContextMenu(undefined);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    contextMenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu]);

  const releaseQuickPreview = useCallback(
    (surfaceActive = true): void => {
      quickPreviewRequestId.current = undefined;
      if (quickPreviewTimer.current) {
        clearTimeout(quickPreviewTimer.current);
        quickPreviewTimer.current = undefined;
      }
      const previewSessionId = quickPreviewSession.current;
      quickPreviewSession.current = undefined;
      setQuickPreview(undefined);
      if (!previewSessionId) return;
      void runtime
        .releaseQuickPreview(
          createResourceBrowserQuickPreviewReleaseRequest({
            requestId: `resource-quick-preview-release-${globalThis.crypto.randomUUID()}`,
            identity: runtime.identity,
            previewSessionId,
          }),
        )
        .catch((error: unknown) => {
          if (surfaceActive) setState({ kind: 'error', message: describeError(error) });
        });
    },
    [runtime],
  );

  const beginQuickPreview = (item: ResourceBrowserItem): void => {
    if (
      lifecyclePresentation === 'suspended' ||
      !renderQuickPreview ||
      (item.kind !== 'image' && item.kind !== 'video' && item.kind !== 'audio')
    ) {
      return;
    }
    releaseQuickPreview();
    const requestId = `resource-quick-preview-${globalThis.crypto.randomUUID()}`;
    quickPreviewRequestId.current = requestId;
    quickPreviewTimer.current = setTimeout(() => {
      quickPreviewTimer.current = undefined;
      void runtime
        .resolveQuickPreview(
          createResourceBrowserQuickPreviewRequest({
            requestId,
            identity: runtime.identity,
            resourceId: item.resourceId,
          }),
        )
        .then((result) => {
          if (requestId !== quickPreviewRequestId.current) {
            return runtime.releaseQuickPreview(
              createResourceBrowserQuickPreviewReleaseRequest({
                requestId: `resource-quick-preview-stale-${globalThis.crypto.randomUUID()}`,
                identity: runtime.identity,
                previewSessionId: result.previewSessionId,
              }),
            );
          }
          quickPreviewSession.current = result.previewSessionId;
          setQuickPreview({ resourceId: item.resourceId, result });
          return undefined;
        })
        .catch((error: unknown) => {
          if (requestId === quickPreviewRequestId.current) {
            setState({ kind: 'error', message: describeError(error) });
          }
        });
    }, 180);
  };

  useEffect(
    () => () => {
      releaseQuickPreview(false);
    },
    [releaseQuickPreview],
  );

  useEffect(() => {
    if (lifecyclePresentation === 'suspended') releaseQuickPreview();
  }, [lifecyclePresentation, releaseQuickPreview]);

  useEffect(() => {
    let active = true;
    eventSequence.current = 0;
    setState({ kind: 'loading' });
    const unsubscribe = runtime.subscribe((event) => {
      if (!active) return;
      if (event.sequence !== eventSequence.current + 1) {
        setState({
          kind: 'error',
          message: `Resource Browser event sequence ${event.sequence} does not follow ${eventSequence.current}.`,
        });
        return;
      }
      eventSequence.current = event.sequence;
      if (!pendingChildrenFacet.current) {
        reconcileRetainedContainer(event.projection, setActiveContainerByFacet);
      }
      setState({ kind: 'ready', projection: event.projection });
    });
    void runtime
      .getSnapshot()
      .then(async (projection) => {
        const saved = presentationSnapshots?.read(
          resourceBrowserPresentationIdentity(runtime.identity),
        );
        if (
          !saved ||
          (saved.activeFacet === projection.facet && saved.query === projection.query)
        ) {
          return projection;
        }
        return runtime.search(
          createResourceBrowserSearchRequest({
            requestId: `resource-presentation-restore-${globalThis.crypto.randomUUID()}`,
            identity: runtime.identity,
            facet: saved.activeFacet,
            query: saved.query,
          }),
        );
      })
      .then((projection) => {
        if (active) {
          reconcileRetainedContainer(projection, setActiveContainerByFacet);
          reconcilePresentationState(projection, setSelectedIdByFacet, setActiveContainerByFacet);
          setState({ kind: 'ready', projection });
        }
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: 'error', message: describeError(error) });
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [presentationSnapshots, runtime]);

  useEffect(() => {
    if (activeDisplayStateKey.current === displayStateKey) return;
    writePresentationSnapshot(
      presentationSnapshots,
      activePresentationIdentity.current,
      defaultViewMode,
      state,
      query,
      viewMode,
      expandedIds,
      selectedIdByFacet,
      activeContainerByFacet,
      entityDrafts,
    );
    activeDisplayStateKey.current = displayStateKey;
    activePresentationIdentity.current = presentationIdentity;
    restoringDisplayState.current = true;
    const saved = presentationSnapshots?.read(presentationIdentity);
    setQuery(saved?.query ?? '');
    setViewMode(saved?.viewMode ?? defaultViewMode);
    setExpandedIds(new Set(saved?.expandedResourceIds ?? []));
    setSelectedIdByFacet(saved?.selectedResourceIds ?? {});
    setActiveContainerByFacet(saved?.activeContainerResourceIds ?? {});
    setEntityDrafts(saved?.entityDrafts ?? {});
  }, [
    activeContainerByFacet,
    defaultViewMode,
    expandedIds,
    entityDrafts,
    displayStateKey,
    presentationIdentity,
    presentationSnapshots,
    selectedIdByFacet,
    query,
    state,
    viewMode,
  ]);

  useEffect(() => {
    if (restoringDisplayState.current) {
      restoringDisplayState.current = false;
      return;
    }
    writePresentationSnapshot(
      presentationSnapshots,
      activePresentationIdentity.current,
      defaultViewMode,
      state,
      query,
      viewMode,
      expandedIds,
      selectedIdByFacet,
      activeContainerByFacet,
      entityDrafts,
    );
  }, [
    activeContainerByFacet,
    defaultViewMode,
    expandedIds,
    entityDrafts,
    presentationSnapshots,
    query,
    selectedIdByFacet,
    state,
    viewMode,
  ]);

  const runSearch = async (facet: ResourceBrowserFacet, nextQuery: string): Promise<void> => {
    requestSequence.current += 1;
    const requestNumber = requestSequence.current;
    if (facet !== 'media') setLibraryMenuOpen(false);
    setPending(true);
    try {
      const projection = await runtime.search(
        createResourceBrowserSearchRequest({
          requestId: `resource-search-${requestSequence.current}`,
          identity: runtime.identity,
          facet,
          query: nextQuery,
        }),
      );
      if (requestNumber === requestSequence.current) {
        reconcileRetainedContainer(projection, setActiveContainerByFacet);
        setSelectedIdByFacet((current) => {
          const selected = current[facet];
          return !selected || projection.items.some((item) => item.resourceId === selected)
            ? current
            : { ...current, [facet]: undefined };
        });
        setState({ kind: 'ready', projection });
      }
    } catch (error: unknown) {
      if (requestNumber === requestSequence.current) {
        setState({ kind: 'error', message: describeError(error) });
      }
    } finally {
      if (requestNumber === requestSequence.current) setPending(false);
    }
  };

  const execute = async (
    route:
      | 'refresh'
      | 'source.link-global-library'
      | 'source.add-directory-library'
      | 'source.relink'
      | 'source.remove'
      | 'content.create-directory'
      | 'content.import-files'
      | 'content.trash'
      | 'preview'
      | 'cut.open'
      | 'reveal',
    item?: ResourceBrowserItem,
    directoryNameInput?: string,
  ): Promise<void> => {
    requestSequence.current += 1;
    setPending(true);
    try {
      const resultProjection = await runtime.execute({
        requestId: `resource-intent-${requestSequence.current}`,
        identity: runtime.identity,
        route,
        ...(item ? { resourceId: item.resourceId } : {}),
        ...(directoryNameInput ? { directoryName: directoryNameInput } : {}),
        ...(route === RESOURCE_BROWSER_ROUTES.preview && previewTarget
          ? { targetPreview: previewTarget }
          : {}),
      });
      reconcileRetainedContainer(resultProjection, setActiveContainerByFacet);
      reconcileRetainedSelection(resultProjection, setSelectedIdByFacet);
      setState({ kind: 'ready', projection: resultProjection });
    } catch (error: unknown) {
      setState({ kind: 'error', message: describeError(error) });
    } finally {
      setPending(false);
    }
  };

  if (state.kind === 'loading') {
    return <div className="neko-resource-browser-status">{labels.loading}</div>;
  }
  if (state.kind === 'error') {
    return (
      <div className="neko-resource-browser-status is-error">
        <strong>{labels.unavailable}</strong>
        <span>{state.message}</span>
      </div>
    );
  }

  const projection = state.projection;
  const selectedId = selectedIdByFacet[projection.facet];
  const selectedEntity = selectedId
    ? projection.items.find((item) => item.resourceId === selectedId && item.facet === 'entities')
    : undefined;
  const executeEntityIntent = async (
    resourceId: string,
    intent: Parameters<EntityInspectorProps['onIntent']>[0],
  ): Promise<void> => {
    const entity = projection.items.find(
      (item) => item.resourceId === resourceId && item.facet === 'entities',
    );
    if (!entity) {
      throw new Error('Resource Browser Entity selection is stale.');
    }
    requestSequence.current += 1;
    setPending(true);
    try {
      const next = await runtime.execute(
        createResourceBrowserEntityIntentRequest({
          requestId: `resource-entity-${requestSequence.current}`,
          identity: runtime.identity,
          resourceId: entity.resourceId,
          intent,
        }),
      );
      setState({ kind: 'ready', projection: next });
    } catch (error: unknown) {
      setState({ kind: 'error', message: describeError(error) });
    } finally {
      setPending(false);
    }
  };
  const requestRecovery = async (
    item: ResourceBrowserItem,
    candidate: 'existing-global' | 'select-directory',
  ): Promise<void> => {
    const libraryStatus = item.libraryStatus;
    if (!libraryStatus) {
      setState({ kind: 'error', message: 'Media Library recovery status is unavailable.' });
      return;
    }
    requestSequence.current += 1;
    setPending(true);
    try {
      if (candidate === 'select-directory' && recovery) {
        await runtime.cancelRecovery(
          createResourceBrowserRecoveryCancelRequest({
            requestId: `resource-recovery-replace-${requestSequence.current}`,
            identity: runtime.identity,
            planId: recovery.plan.planId,
          }),
        );
        setRecovery(undefined);
      }
      const result = await runtime.planRecovery(
        createResourceBrowserRecoveryPlanRequest({
          requestId: `resource-recovery-plan-${requestSequence.current}`,
          identity: runtime.identity,
          resourceId: item.resourceId,
          expectedOperationFingerprint: libraryStatus.operationFingerprint,
          candidate,
        }),
      );
      if (result.status === 'planned') setRecovery(result);
    } catch (error: unknown) {
      setState({ kind: 'error', message: describeError(error) });
    } finally {
      setPending(false);
    }
  };
  const cancelRecovery = async (): Promise<void> => {
    if (!recovery) return;
    requestSequence.current += 1;
    setPending(true);
    try {
      await runtime.cancelRecovery(
        createResourceBrowserRecoveryCancelRequest({
          requestId: `resource-recovery-cancel-${requestSequence.current}`,
          identity: runtime.identity,
          planId: recovery.plan.planId,
        }),
      );
      setRecovery(undefined);
    } catch (error: unknown) {
      setState({ kind: 'error', message: describeError(error) });
    } finally {
      setPending(false);
    }
  };
  const applyRecovery = async (): Promise<void> => {
    if (!recovery) return;
    requestSequence.current += 1;
    setPending(true);
    try {
      const nextProjection = await runtime.applyRecovery(
        createResourceBrowserRecoveryApplyRequest({
          requestId: `resource-recovery-apply-${requestSequence.current}`,
          identity: runtime.identity,
          planId: recovery.plan.planId,
          expectedOperationFingerprint: recovery.plan.operationFingerprint,
        }),
      );
      setRecovery(undefined);
      setState({ kind: 'ready', projection: nextProjection });
    } catch (error: unknown) {
      setState({ kind: 'error', message: describeError(error) });
    } finally {
      setPending(false);
    }
  };
  const navigableFacet =
    projection.facet === 'files' || projection.facet === 'media' ? projection.facet : undefined;
  const activeContainerId = navigableFacet ? activeContainerByFacet[navigableFacet] : undefined;
  const visibleItems = projectVisibleItems(projection, activeContainerId, expandedIds, viewMode);
  const breadcrumbs = buildBreadcrumbs(projection.items, activeContainerId);
  const submitSearch = (event: FormEvent): void => {
    event.preventDefault();
    void runSearch(projection.facet, query);
  };
  const loadContainerChildren = async (
    facet: 'files' | 'media',
    item: ResourceBrowserItem,
  ): Promise<ResourceBrowserProjection | undefined> => {
    requestSequence.current += 1;
    const requestNumber = requestSequence.current;
    setPending(true);
    try {
      pendingChildrenFacet.current = facet;
      const nextProjection = await runtime.children(
        createResourceBrowserChildrenRequest({
          requestId: `resource-children-${requestNumber}`,
          identity: runtime.identity,
          facet,
          parentResourceId: item.resourceId,
        }),
      );
      if (requestNumber !== requestSequence.current) return undefined;
      setState({ kind: 'ready', projection: nextProjection });
      return nextProjection;
    } catch (error: unknown) {
      if (requestNumber === requestSequence.current) {
        setState({ kind: 'error', message: describeError(error) });
      }
      return undefined;
    } finally {
      if (pendingChildrenFacet.current === facet) pendingChildrenFacet.current = undefined;
      if (requestNumber === requestSequence.current) setPending(false);
    }
  };
  const toggleTreeContainer = async (
    facet: 'files' | 'media',
    item: ResourceBrowserItem,
  ): Promise<void> => {
    if (expandedIds.has(item.resourceId)) {
      setExpandedIds((current) => removeSetMember(current, item.resourceId));
      return;
    }
    const nextProjection = await loadContainerChildren(facet, item);
    if (!nextProjection) return;
    setExpandedIds((current) => addSetMember(current, item.resourceId));
  };
  const openGridContainer = async (
    facet: 'files' | 'media',
    item: ResourceBrowserItem,
  ): Promise<void> => {
    const nextProjection = await loadContainerChildren(facet, item);
    if (!nextProjection) return;
    setActiveContainerByFacet((current) => ({
      ...current,
      [facet]: item.resourceId,
    }));
  };
  const treePresentation =
    viewMode === 'list' && navigableFacet !== undefined && projection.query.length === 0;
  const openContextMenu = (event: ReactMouseEvent, item?: ResourceBrowserItem): void => {
    event.preventDefault();
    if (item) {
      setSelectedIdByFacet((current) => ({ ...current, [projection.facet]: item.resourceId }));
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      facet: projection.facet,
      ...(item ? { item } : {}),
    });
  };

  return (
    <section
      className="neko-resource-browser"
      aria-label={labels.title}
      data-lifecycle-presentation={lifecyclePresentation}
    >
      {chrome === 'standalone' ? (
        <header className="neko-resource-browser__header">
          <strong>{labels.title}</strong>
        </header>
      ) : null}
      <form className="neko-resource-browser__search" onSubmit={submitSearch}>
        <div>
          <SearchIcon size={14} aria-hidden="true" />
          <input
            aria-label={labels.search}
            placeholder={labels.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <div className="neko-resource-browser__toolbar">
          {projection.facet === 'media' ? (
            <div
              className="neko-resource-browser__library-menu"
              ref={libraryMenuRef}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setLibraryMenuOpen(false);
              }}
            >
              <button
                type="button"
                className="neko-resource-browser__icon-button"
                disabled={pending}
                aria-label={labels.configureMediaLibraries}
                aria-haspopup="menu"
                aria-expanded={libraryMenuOpen}
                title={labels.configureMediaLibraries}
                onClick={() => setLibraryMenuOpen((open) => !open)}
              >
                <PlusIcon size={15} />
              </button>
              {libraryMenuOpen ? (
                <div className="neko-resource-browser__library-menu-content" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setLibraryMenuOpen(false);
                      void execute(RESOURCE_BROWSER_ROUTES.linkGlobalLibrary);
                    }}
                  >
                    <PackageIcon size={14} aria-hidden="true" />
                    <span>{labels.linkGlobalLibrary}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setLibraryMenuOpen(false);
                      void execute(RESOURCE_BROWSER_ROUTES.addDirectoryLibrary);
                    }}
                  >
                    <FolderIcon size={14} aria-hidden="true" />
                    <span>{labels.addDirectoryLibrary}</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {refreshControl === 'visible' ? (
            <button
              type="button"
              className="neko-resource-browser__icon-button"
              disabled={pending}
              aria-label={labels.refresh}
              title={labels.refresh}
              onClick={() => void execute(RESOURCE_BROWSER_ROUTES.refresh)}
            >
              <RefreshIcon size={15} />
            </button>
          ) : null}
          <div className="neko-resource-browser__view-modes">
            <button
              type="button"
              aria-label={labels.listView}
              aria-pressed={viewMode === 'list'}
              title={labels.listView}
              onClick={() => setViewMode('list')}
            >
              <FileIcon size={14} />
            </button>
            <button
              type="button"
              aria-label={labels.gridView}
              aria-pressed={viewMode === 'grid'}
              title={labels.gridView}
              onClick={() => setViewMode('grid')}
            >
              <GridIcon size={14} />
            </button>
          </div>
        </div>
      </form>
      <div className="neko-resource-browser__facets" role="tablist">
        {(['files', 'media', 'assets', 'entities'] as const).map((facet) => (
          <button
            type="button"
            role="tab"
            aria-selected={projection.facet === facet}
            disabled={pending}
            key={facet}
            onClick={() => void runSearch(facet, query)}
          >
            {labels[facet]}
          </button>
        ))}
      </div>
      <>
        {navigableFacet && projection.query.length === 0 && viewMode === 'grid' ? (
          <nav className="neko-resource-browser__breadcrumbs" aria-label={labels.breadcrumbs}>
            <button
              type="button"
              aria-current={!activeContainerId ? 'page' : undefined}
              onClick={() =>
                setActiveContainerByFacet((current) => ({
                  ...current,
                  [navigableFacet]: undefined,
                }))
              }
            >
              {projection.facet === 'files' ? labels.workspaceRoot : labels.mediaLibraries}
            </button>
            {breadcrumbs.map((item) => (
              <React.Fragment key={item.resourceId}>
                <ChevronRightIcon size={11} aria-hidden="true" />
                <button
                  type="button"
                  aria-current={item.resourceId === activeContainerId ? 'page' : undefined}
                  onClick={() =>
                    setActiveContainerByFacet((current) => ({
                      ...current,
                      [navigableFacet]: item.resourceId,
                    }))
                  }
                >
                  {item.label}
                </button>
              </React.Fragment>
            ))}
          </nav>
        ) : null}
        {projection.diagnostics?.length ? (
          <div className="neko-resource-browser__diagnostics" role="status">
            {projection.diagnostics.map((diagnostic, index) => (
              <span
                key={`${diagnostic.code}:${diagnostic.recordId ?? diagnostic.message}:${String(index)}`}
              >
                {diagnostic.message}
              </span>
            ))}
          </div>
        ) : null}
        <div
          className="neko-resource-browser__items"
          data-view-mode={viewMode}
          role={treePresentation ? 'tree' : 'list'}
          onContextMenu={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest('.neko-resource-browser__item-row')
            ) {
              return;
            }
            openContextMenu(event);
          }}
        >
          {projection.items.length === 0 ? (
            <div className="neko-resource-browser__empty">{labels.empty}</div>
          ) : (
            visibleItems.map((item) => (
              <React.Fragment key={item.resourceId}>
                <div
                  className="neko-resource-browser__item-row"
                  data-selected={item.resourceId === selectedId ? 'true' : 'false'}
                  onPointerEnter={() => beginQuickPreview(item)}
                  onPointerLeave={() => releaseQuickPreview()}
                  onContextMenu={(event) => openContextMenu(event, item)}
                >
                  <button
                    type="button"
                    className="neko-resource-browser__item"
                    data-role={item.role}
                    data-tree-item={treePresentation ? 'true' : 'false'}
                    draggable={canDragResourceToCanvas(item)}
                    {...(treePresentation
                      ? {
                          role: 'treeitem',
                          'aria-level': item.depth + 1,
                          'aria-selected': item.resourceId === selectedId,
                          ...(item.role === 'directory' || item.role === 'library-root'
                            ? {
                                'aria-expanded': expandedIds.has(item.resourceId),
                              }
                            : {}),
                        }
                      : {})}
                    style={viewMode === 'list' ? { paddingLeft: 7 + item.depth * 14 } : undefined}
                    onClick={(event) => {
                      setSelectedIdByFacet((current) => ({
                        ...current,
                        [projection.facet]: item.resourceId,
                      }));
                      if (event.detail > 1) return;
                      if (item.role === 'directory' || item.role === 'library-root') {
                        return;
                      }
                      if (
                        isWorkspaceDocument(item, '.otio') &&
                        item.capabilities.includes('open-cut') &&
                        !pending
                      ) {
                        void execute(RESOURCE_BROWSER_ROUTES.openCut, item);
                        return;
                      }
                      if (isWorkspaceDocument(item, '.nkc') && onOpenCanvas && !pending) {
                        onOpenCanvas(item, 'main');
                        return;
                      }
                      if (previewTarget && item.capabilities.includes('preview') && !pending) {
                        void execute(RESOURCE_BROWSER_ROUTES.preview, item);
                      }
                    }}
                    onDoubleClick={() => {
                      if (
                        !navigableFacet ||
                        projection.query.length > 0 ||
                        (item.role !== 'directory' && item.role !== 'library-root') ||
                        !canBrowseResourceContainer(item)
                      ) {
                        return;
                      }
                      if (viewMode === 'list') {
                        void toggleTreeContainer(navigableFacet, item);
                      } else {
                        void openGridContainer(navigableFacet, item);
                      }
                    }}
                    onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                        event.preventDefault();
                        const bounds = event.currentTarget.getBoundingClientRect();
                        setContextMenu({
                          x: bounds.left + 12,
                          y: bounds.top + 12,
                          facet: projection.facet,
                          item,
                        });
                        return;
                      }
                      if (
                        !treePresentation ||
                        !navigableFacet ||
                        (item.role !== 'directory' && item.role !== 'library-root')
                      ) {
                        return;
                      }
                      if (event.key === 'ArrowRight' && !expandedIds.has(item.resourceId)) {
                        event.preventDefault();
                        setSelectedIdByFacet((current) => ({
                          ...current,
                          [projection.facet]: item.resourceId,
                        }));
                        void toggleTreeContainer(navigableFacet, item);
                        return;
                      }
                      if (event.key === 'ArrowLeft' && expandedIds.has(item.resourceId)) {
                        event.preventDefault();
                        setSelectedIdByFacet((current) => ({
                          ...current,
                          [projection.facet]: item.resourceId,
                        }));
                        void toggleTreeContainer(navigableFacet, item);
                      }
                    }}
                    onDragStart={(event) => startResourceCanvasDrag(event, item)}
                  >
                    {treePresentation ? (
                      <span
                        className={`neko-resource-browser__disclosure${
                          item.role === 'directory' || item.role === 'library-root'
                            ? ''
                            : ' is-placeholder'
                        }`}
                        aria-hidden="true"
                      >
                        {item.role === 'directory' || item.role === 'library-root' ? (
                          expandedIds.has(item.resourceId) ? (
                            <ChevronDownIcon size={12} />
                          ) : (
                            <ChevronRightIcon size={12} />
                          )
                        ) : null}
                      </span>
                    ) : null}
                    <ResourceBrowserThumbnail
                      item={item}
                      runtime={runtime}
                      unavailableLabel={labels.thumbnailUnavailable}
                      libraryStatusLabel={presentLibraryStatus(item, labels)}
                    />
                    <ResourceBrowserItemCopy
                      item={item}
                      showDescription={!treePresentation}
                      libraryStatusLabel={presentLibraryStatus(item, labels)}
                    />
                  </button>
                  {item.role === 'library-root' ? (
                    <span className="neko-resource-browser__inline-actions">
                      {canRecoverLibrary(item) ? (
                        <button
                          type="button"
                          disabled={pending}
                          aria-label={labels.recoverSource}
                          title={labels.recoverSource}
                          onClick={() => void requestRecovery(item, 'existing-global')}
                        >
                          <RefreshIcon size={13} />
                        </button>
                      ) : null}
                      {hasManagedLibraryLink(item) ? (
                        <>
                          <button
                            type="button"
                            disabled={pending}
                            aria-label={labels.relinkSource}
                            title={labels.relinkSource}
                            onClick={() => void execute(RESOURCE_BROWSER_ROUTES.relinkSource, item)}
                          >
                            <EditIcon size={13} />
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            aria-label={labels.removeSource}
                            title={labels.removeSource}
                            onClick={() => {
                              if (globalThis.confirm(labels.removeSourceConfirm)) {
                                void execute(RESOURCE_BROWSER_ROUTES.removeSource, item);
                              }
                            }}
                          >
                            <TrashIcon size={13} />
                          </button>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                  {quickPreview?.resourceId === item.resourceId && renderQuickPreview ? (
                    <div
                      className="neko-resource-browser__quick-preview"
                      data-preview-kind={quickPreview.result.descriptor.contentKind}
                    >
                      {renderQuickPreview(quickPreview.result.descriptor)}
                    </div>
                  ) : null}
                </div>
              </React.Fragment>
            ))
          )}
        </div>
      </>
      {selectedEntity?.facet === 'entities' ? (
        <EntityInspector
          key={selectedEntity.resourceId}
          disabled={pending}
          initialDraft={entityDrafts[selectedEntity.resourceId]}
          locale={locale}
          onDraftChange={(draft) =>
            setEntityDrafts((current) => ({ ...current, [selectedEntity.resourceId]: draft }))
          }
          projection={selectedEntity.inspector}
          onIntent={(intent) => executeEntityIntent(selectedEntity.resourceId, intent)}
        />
      ) : null}
      {contextMenu ? (
        <ResourceBrowserContextMenu
          menu={contextMenu}
          menuRef={contextMenuRef}
          labels={labels}
          pending={pending}
          previewAvailable={previewTarget !== undefined}
          onAction={(action) => {
            const item = contextMenu.item;
            setContextMenu(undefined);
            if (action === 'create-directory') {
              setDirectoryName('');
              setCreateDirectoryParent({
                invocationId: `create-directory:${globalThis.crypto.randomUUID()}`,
                ...(item ? { item } : {}),
              });
              return;
            }
            if (action === 'import-files') {
              void execute(RESOURCE_BROWSER_ROUTES.importFiles, item);
              return;
            }
            if (action === 'trash-content') {
              if (item && globalThis.confirm(labels.trashContentConfirm)) {
                void execute(RESOURCE_BROWSER_ROUTES.trashContent, item);
              }
              return;
            }
            if (action === 'link-library') {
              void execute(RESOURCE_BROWSER_ROUTES.linkGlobalLibrary);
              return;
            }
            if (action === 'add-library') {
              void execute(RESOURCE_BROWSER_ROUTES.addDirectoryLibrary);
              return;
            }
            if (!item) return;
            if (action === 'preview') void execute(RESOURCE_BROWSER_ROUTES.preview, item);
            if (action === 'open-cut') void execute(RESOURCE_BROWSER_ROUTES.openCut, item);
            if (action === 'reveal') void execute(RESOURCE_BROWSER_ROUTES.reveal, item);
            if (action === 'recover') void requestRecovery(item, 'existing-global');
            if (action === 'relink') void execute(RESOURCE_BROWSER_ROUTES.relinkSource, item);
            if (action === 'remove-library' && globalThis.confirm(labels.removeSourceConfirm)) {
              void execute(RESOURCE_BROWSER_ROUTES.removeSource, item);
            }
          }}
        />
      ) : null}
      {createDirectoryParent ? (
        <div className="neko-resource-browser__dialog-backdrop">
          <form
            className="neko-resource-browser__dialog"
            role="dialog"
            aria-modal="true"
            onSubmit={(event) => {
              event.preventDefault();
              const name = directoryName.trim();
              if (!name) return;
              void execute(
                RESOURCE_BROWSER_ROUTES.createDirectory,
                createDirectoryParent.item,
                name,
              );
              setCreateDirectoryParent(undefined);
            }}
          >
            <strong>{labels.createDirectory}</strong>
            <input
              autoFocus
              aria-label={labels.directoryName}
              value={directoryName}
              onChange={(event) => setDirectoryName(event.currentTarget.value)}
            />
            <div>
              <button type="submit" disabled={pending || !directoryName.trim()}>
                {labels.confirm}
              </button>
              <button type="button" onClick={() => setCreateDirectoryParent(undefined)}>
                {labels.recoveryCancel}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {recovery ? (
        <div className="neko-resource-browser__dialog-backdrop">
          <div
            className="neko-resource-browser__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resource-browser-recovery-title"
          >
            <strong id="resource-browser-recovery-title">{labels.recoveryTitle}</strong>
            <p>{recovery.plan.libraryName}</p>
            <small>
              {recovery.plan.referencedCount} {labels.recoveryReferences}
            </small>
            <div>
              {recovery.plan.candidate.kind === 'directory-selection-required' ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const item = projection.items.find(
                      (candidate) => candidate.resourceId === recovery.resourceId,
                    );
                    if (!item) {
                      setState({
                        kind: 'error',
                        message: 'Media Library recovery item is stale.',
                      });
                      return;
                    }
                    void requestRecovery(item, 'select-directory');
                  }}
                >
                  {labels.recoverySelectDirectory}
                </button>
              ) : (
                <button type="button" disabled={pending} onClick={() => void applyRecovery()}>
                  {labels.recoveryConfirm}
                </button>
              )}
              <button type="button" disabled={pending} onClick={() => void cancelRecovery()}>
                {labels.recoveryCancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type ResourceBrowserContextAction =
  | 'create-directory'
  | 'import-files'
  | 'trash-content'
  | 'link-library'
  | 'add-library'
  | 'preview'
  | 'open-cut'
  | 'reveal'
  | 'recover'
  | 'relink'
  | 'remove-library';

function ResourceBrowserContextMenu({
  labels,
  menu,
  menuRef,
  onAction,
  pending,
  previewAvailable,
}: {
  readonly labels: ReturnType<typeof getResourceBrowserLabels>;
  readonly menu: {
    readonly x: number;
    readonly y: number;
    readonly facet: ResourceBrowserFacet;
    readonly item?: ResourceBrowserItem;
  };
  readonly menuRef: React.RefObject<HTMLDivElement>;
  readonly onAction: (action: ResourceBrowserContextAction) => void;
  readonly pending: boolean;
  readonly previewAvailable: boolean;
}): ReactElement | null {
  const item = menu.item;
  const actions: {
    readonly action: ResourceBrowserContextAction;
    readonly label: string;
    readonly icon: ReactNode;
  }[] = [];
  if (!item) {
    if (menu.facet === 'files') {
      actions.push(
        {
          action: 'create-directory',
          label: labels.createDirectory,
          icon: <FolderIcon size={14} />,
        },
        { action: 'import-files', label: labels.importFiles, icon: <PlusIcon size={14} /> },
      );
    }
    if (menu.facet === 'media') {
      actions.push(
        {
          action: 'link-library',
          label: labels.linkGlobalLibrary,
          icon: <PackageIcon size={14} />,
        },
        {
          action: 'add-library',
          label: labels.addDirectoryLibrary,
          icon: <FolderIcon size={14} />,
        },
      );
    }
  } else {
    if (item.facet === 'files' && item.kind === 'directory') {
      actions.push(
        {
          action: 'create-directory',
          label: labels.createDirectory,
          icon: <FolderIcon size={14} />,
        },
        { action: 'import-files', label: labels.importFiles, icon: <PlusIcon size={14} /> },
      );
    }
    if (previewAvailable && item.capabilities.includes('preview')) {
      actions.push({ action: 'preview', label: labels.preview, icon: <PlayIcon size={14} /> });
    }
    if (item.capabilities.includes('open-cut')) {
      actions.push({ action: 'open-cut', label: labels.openCut, icon: <EditIcon size={14} /> });
    }
    if (item.capabilities.includes('reveal')) {
      actions.push({ action: 'reveal', label: labels.reveal, icon: <FolderIcon size={14} /> });
    }
    if (item.facet === 'files') {
      actions.push({
        action: 'trash-content',
        label: labels.trashContent,
        icon: <TrashIcon size={14} />,
      });
    }
    if (item.facet === 'media' && item.role === 'library-root') {
      if (canRecoverLibrary(item))
        actions.push({
          action: 'recover',
          label: labels.recoverSource,
          icon: <RefreshIcon size={14} />,
        });
      if (hasManagedLibraryLink(item)) {
        actions.push(
          { action: 'relink', label: labels.relinkSource, icon: <EditIcon size={14} /> },
          { action: 'remove-library', label: labels.removeSource, icon: <TrashIcon size={14} /> },
        );
      }
    }
  }
  if (actions.length === 0) return null;
  return (
    <div
      ref={menuRef}
      className="neko-resource-browser__context-menu"
      role="menu"
      style={{
        left: Math.max(4, Math.min(menu.x, globalThis.innerWidth - 210)),
        top: Math.max(4, Math.min(menu.y, globalThis.innerHeight - 260)),
      }}
    >
      {actions.map(({ action, icon, label }) => (
        <button
          key={action}
          type="button"
          role="menuitem"
          disabled={pending}
          onClick={() => onAction(action)}
        >
          {icon}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function canBrowseResourceContainer(item: ResourceBrowserItem): boolean {
  const state = item.libraryStatus?.state;
  return (
    !state ||
    state === 'available' ||
    state === 'unreferenced-linked' ||
    state === 'content-incomplete'
  );
}

function canRecoverLibrary(item: ResourceBrowserItem): boolean {
  const state = item.libraryStatus?.state;
  return (
    state === 'required-unlinked' ||
    state === 'global-connection-missing' ||
    state === 'target-unavailable' ||
    state === 'content-incomplete'
  );
}

function hasManagedLibraryLink(item: ResourceBrowserItem): boolean {
  const state = item.libraryStatus?.state;
  return state !== 'required-unlinked' && state !== 'entry-conflict';
}

function canDragResourceToCanvas(item: ResourceBrowserItem): boolean {
  return (
    item.capabilities.includes('add-to-canvas') &&
    (item.facet === 'entities'
      ? item.entityStatus !== 'candidate' && item.representationLocator !== undefined
      : item.facet !== 'assets')
  );
}

function ResourceBrowserItemCopy({
  item,
  libraryStatusLabel,
  showDescription,
}: {
  readonly item: ResourceBrowserItem;
  readonly libraryStatusLabel?: string;
  readonly showDescription: boolean;
}): ReactElement {
  const description = showDescription
    ? (libraryStatusLabel ?? presentResourceBrowserDescription(item))
    : undefined;
  return (
    <span className="neko-resource-browser__item-copy">
      <strong title={item.label}>{item.label}</strong>
      {description ? <small title={description}>{description}</small> : null}
    </span>
  );
}

function presentLibraryStatus(
  item: ResourceBrowserItem,
  labels: ReturnType<typeof getResourceBrowserLabels>,
): string | undefined {
  switch (item.libraryStatus?.state) {
    case 'available':
      return labels.statusAvailable;
    case 'required-unlinked':
      return labels.statusRequiredUnlinked;
    case 'global-connection-missing':
      return labels.statusGlobalConnectionMissing;
    case 'target-unavailable':
      return labels.statusTargetUnavailable;
    case 'content-incomplete':
      return labels.statusContentIncomplete;
    case 'entry-conflict':
      return labels.statusEntryConflict;
    case 'unreferenced-linked':
      return labels.statusUnreferencedLinked;
    case undefined:
      return undefined;
  }
}

function presentResourceBrowserDescription(item: ResourceBrowserItem): string | undefined {
  const description = item.description?.trim();
  if (!description || description === '.' || description === item.kind) return undefined;
  return description;
}

function resourceBrowserPresentationIdentity(
  identity: ResourceBrowserProjection['identity'],
): ResourceBrowserPresentationIdentity {
  return {
    projectId: identity.projectId,
    workspaceId: identity.workspaceId,
  };
}

function writePresentationSnapshot(
  store: ResourceBrowserPresentationSnapshotStore | undefined,
  identity: ResourceBrowserPresentationIdentity,
  defaultViewMode: 'list' | 'grid',
  state: ResourceBrowserRootState,
  query: string,
  viewMode: 'list' | 'grid',
  expandedIds: ReadonlySet<string>,
  selectedResourceIds: Readonly<Partial<Record<ResourceBrowserFacet, string>>>,
  activeContainerResourceIds: Readonly<Partial<Record<'files' | 'media', string>>>,
  entityDrafts: Readonly<Record<string, EntityInspectorDraft>>,
): void {
  if (!store || state.kind !== 'ready') return;
  if (
    state.projection.identity.projectId !== identity.projectId ||
    state.projection.identity.workspaceId !== identity.workspaceId
  ) {
    return;
  }
  const snapshot: ResourceBrowserPresentationSnapshot = {
    query,
    activeFacet: state.projection.facet,
    viewMode,
    expandedResourceIds: [...expandedIds].sort(),
    selectedResourceIds,
    activeContainerResourceIds,
    entityDrafts,
  };
  const isDefault =
    snapshot.query.length === 0 &&
    snapshot.activeFacet === 'files' &&
    snapshot.viewMode === defaultViewMode &&
    snapshot.expandedResourceIds.length === 0 &&
    !Object.values(snapshot.selectedResourceIds).some(Boolean) &&
    !Object.values(snapshot.activeContainerResourceIds).some(Boolean) &&
    Object.keys(snapshot.entityDrafts).length === 0;
  store.write(identity, isDefault ? undefined : snapshot);
}

function reconcilePresentationState(
  projection: ResourceBrowserProjection,
  setSelectedIdByFacet: React.Dispatch<
    React.SetStateAction<Readonly<Partial<Record<ResourceBrowserFacet, string>>>>
  >,
  setActiveContainerByFacet: React.Dispatch<
    React.SetStateAction<Readonly<Partial<Record<'files' | 'media', string>>>>
  >,
): void {
  reconcileRetainedSelection(projection, setSelectedIdByFacet);
  reconcileRetainedContainer(projection, setActiveContainerByFacet);
}

function addSetMember(current: ReadonlySet<string>, resourceId: string): ReadonlySet<string> {
  const next = new Set(current);
  next.add(resourceId);
  return next;
}

function removeSetMember(current: ReadonlySet<string>, resourceId: string): ReadonlySet<string> {
  const next = new Set(current);
  next.delete(resourceId);
  return next;
}

function reconcileRetainedContainer(
  projection: ResourceBrowserProjection,
  setActiveContainerByFacet: React.Dispatch<
    React.SetStateAction<Readonly<Partial<Record<'files' | 'media', string>>>>
  >,
): void {
  if (
    projection.query.length > 0 ||
    (projection.facet !== 'files' && projection.facet !== 'media')
  ) {
    return;
  }
  const facet = projection.facet;
  setActiveContainerByFacet((current) => {
    const activeContainerId = current[facet];
    if (
      !activeContainerId ||
      projection.items.some((item) => item.parentResourceId === activeContainerId)
    ) {
      return current;
    }
    return { ...current, [facet]: undefined };
  });
}

function reconcileRetainedSelection(
  projection: ResourceBrowserProjection,
  setSelectedIdByFacet: React.Dispatch<
    React.SetStateAction<Readonly<Partial<Record<ResourceBrowserFacet, string>>>>
  >,
): void {
  setSelectedIdByFacet((current) => {
    const selectedId = current[projection.facet];
    if (!selectedId || projection.items.some((item) => item.resourceId === selectedId)) {
      return current;
    }
    return { ...current, [projection.facet]: undefined };
  });
}

function projectExpandedTreeItems(
  items: readonly ResourceBrowserItem[],
  expandedIds: ReadonlySet<string>,
): readonly ResourceBrowserItem[] {
  const itemsById = new Map(items.map((item) => [item.resourceId, item]));
  const childrenByParentId = new Map<string, ResourceBrowserItem[]>();
  const roots: ResourceBrowserItem[] = [];
  for (const item of items) {
    if (!item.parentResourceId) {
      roots.push(item);
      continue;
    }
    if (!itemsById.has(item.parentResourceId)) {
      throw new Error(`Resource Browser hierarchy parent '${item.parentResourceId}' is missing.`);
    }
    const siblings = childrenByParentId.get(item.parentResourceId) ?? [];
    siblings.push(item);
    childrenByParentId.set(item.parentResourceId, siblings);
  }
  for (const item of items) {
    const ancestors = new Set<string>([item.resourceId]);
    let parentId = item.parentResourceId;
    while (parentId) {
      if (ancestors.has(parentId)) {
        throw new Error('Resource Browser hierarchy contains a cycle.');
      }
      ancestors.add(parentId);
      parentId = itemsById.get(parentId)?.parentResourceId;
    }
  }

  const result: ResourceBrowserItem[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (item: ResourceBrowserItem): void => {
    if (visiting.has(item.resourceId)) {
      throw new Error('Resource Browser hierarchy contains a cycle.');
    }
    if (visited.has(item.resourceId)) return;
    visiting.add(item.resourceId);
    visited.add(item.resourceId);
    result.push(item);
    if (expandedIds.has(item.resourceId)) {
      for (const child of childrenByParentId.get(item.resourceId) ?? []) {
        visit(child);
      }
    }
    visiting.delete(item.resourceId);
  };
  for (const root of roots) visit(root);
  return result;
}

function projectVisibleItems(
  projection: ResourceBrowserProjection,
  activeContainerId: string | undefined,
  expandedIds: ReadonlySet<string>,
  viewMode: 'list' | 'grid',
): readonly ResourceBrowserItem[] {
  if (
    (projection.facet === 'files' || projection.facet === 'media') &&
    projection.query.length === 0
  ) {
    if (viewMode === 'list') {
      return projectExpandedTreeItems(projection.items, expandedIds);
    }
    return projection.items.filter((item) => item.parentResourceId === activeContainerId);
  }
  return projection.items;
}

function buildBreadcrumbs(
  items: readonly ResourceBrowserItem[],
  activeContainerId: string | undefined,
): readonly ResourceBrowserItem[] {
  const result: ResourceBrowserItem[] = [];
  const visited = new Set<string>();
  let currentId = activeContainerId;
  while (currentId) {
    if (visited.has(currentId)) {
      throw new Error('Resource Browser hierarchy contains a cycle.');
    }
    visited.add(currentId);
    const current = items.find((item) => item.resourceId === currentId);
    if (!current) return [];
    result.unshift(current);
    currentId = current.parentResourceId;
  }
  return result;
}

function isWorkspaceDocument(item: ResourceBrowserItem, extension: '.nkc' | '.otio'): boolean {
  return (
    (item.facet === 'files' || item.facet === 'media') &&
    item.locator.kind === 'workspace-file' &&
    item.locator.path.toLocaleLowerCase().endsWith(extension)
  );
}

function startResourceCanvasDrag(
  event: DragEvent<HTMLButtonElement>,
  item: ResourceBrowserItem,
): void {
  const locator =
    item.facet === 'entities'
      ? item.entityStatus === 'candidate'
        ? undefined
        : item.representationLocator
      : item.facet === 'assets'
        ? undefined
        : item.locator;
  if (!locator || !item.capabilities.includes('add-to-canvas')) {
    event.preventDefault();
    return;
  }
  event.dataTransfer.effectAllowed = 'copy';
  const payload = JSON.stringify(createContentLocatorDragData({ locator, name: item.label }));
  event.dataTransfer.setData(CONTENT_LOCATOR_DRAG_MIME, payload);
  // Chromium may omit custom MIME types while dragging across independently
  // mounted React roots. application/json keeps the same versioned payload
  // readable without introducing a second drag contract.
  event.dataTransfer.setData('application/json', payload);
}

function ResourceBrowserThumbnail({
  item,
  libraryStatusLabel,
  runtime,
  unavailableLabel,
}: {
  readonly item: ResourceBrowserItem;
  readonly libraryStatusLabel?: string;
  readonly runtime: ResourceBrowserHostRuntime;
  readonly unavailableLabel: string;
}): ReactElement {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [dataUrl, setDataUrl] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!item.thumbnail || !host) {
      setVisible(false);
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: '160px 0px' },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [item.resourceId, item.thumbnail]);

  useEffect(() => {
    const descriptor = item.thumbnail;
    if (!descriptor || !visible) {
      setDataUrl(undefined);
      setUnavailable(false);
      return;
    }
    let active = true;
    setUnavailable(false);
    void runtime
      .resolveThumbnail(
        createResourceBrowserThumbnailRequest({
          requestId: `resource-thumbnail-${item.resourceId}-${descriptor.sourceFingerprint}`,
          identity: runtime.identity,
          resourceId: item.resourceId,
          descriptor,
        }),
      )
      .then((result) => {
        if (active) {
          setDataUrl(result.dataUrl);
          setUnavailable(false);
        }
      })
      .catch(() => {
        if (active) {
          setDataUrl(undefined);
          setUnavailable(true);
        }
      });
    return () => {
      active = false;
    };
  }, [item.resourceId, item.thumbnail, runtime, visible]);

  return (
    <span
      ref={hostRef}
      className={`neko-resource-browser__kind is-${item.kind}`}
      aria-hidden="true"
      data-thumbnail={dataUrl ? 'true' : 'false'}
      title={unavailable ? unavailableLabel : undefined}
    >
      {dataUrl ? (
        <>
          <img alt="" src={dataUrl} />
          {item.kind === 'video' ? (
            <span className="neko-resource-browser__thumbnail-play">
              <PlayIcon size={9} />
            </span>
          ) : null}
        </>
      ) : (
        <ResourceBrowserPlaceholderIcon kind={item.kind} />
      )}
      {item.libraryStatus ? (
        <span
          className="neko-resource-browser__library-status"
          data-state={item.libraryStatus.state}
          title={libraryStatusLabel}
        >
          {item.libraryStatus.state === 'available' ? (
            <SuccessIcon size={10} />
          ) : item.libraryStatus.state === 'unreferenced-linked' ? (
            <InfoIcon size={10} />
          ) : (
            <WarningIcon size={10} />
          )}
        </span>
      ) : null}
    </span>
  );
}

function ResourceBrowserPlaceholderIcon({
  kind,
}: {
  readonly kind: ResourceBrowserItem['kind'];
}): ReactElement {
  switch (kind) {
    case 'directory':
      return <FolderIcon size={17} />;
    case 'video':
      return <PlayIcon size={15} />;
    case 'audio':
      return <VolumeIcon size={15} />;
    case 'file':
      return <FileIcon size={15} />;
    case 'document':
      return <CodeIcon size={15} />;
    case 'asset':
      return <PackageIcon size={15} />;
    case 'character':
      return <CubeIcon size={15} />;
    case 'scene':
    case 'object':
    case 'location':
    case 'style':
      return <PackageIcon size={15} />;
    case 'image':
      return <FileIcon size={15} />;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
