import { type SupportedLocale } from '@neko/ui/i18n';
import { PositionedContextMenu, type MenuItem } from '@neko/ui/primitives';
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
  CloseIcon,
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
  useId,
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
  ResourceBrowserOperationRejectedError,
  createResourceBrowserChildrenRequest,
  createResourceBrowserEntityIntentRequest,
  createResourceBrowserQuickPreviewReleaseRequest,
  createResourceBrowserQuickPreviewRequest,
  createResourceBrowserRecoveryApplyRequest,
  createResourceBrowserRecoveryCancelRequest,
  createResourceBrowserRecoveryPlanRequest,
  createResourceBrowserSearchRequest,
  createResourceBrowserThumbnailRequest,
  type ResourceBrowserSource,
  type ResourceBrowserHostRuntime,
  type ResourceBrowserItem,
  type ResourceBrowserProjection,
  type ResourceBrowserQuickPreviewResult,
  type ResourceBrowserRecoveryPlanResult,
} from '@neko/assets-domain/resource-browser/contract';
import { QuickPreviewSurface } from '@neko/preview-webview/embedded';
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
  readonly lifecyclePresentation?: 'active' | 'suspended';
  readonly previewTarget?: {
    readonly viewId: string;
    readonly presentation: 'temporary' | 'side';
  };
  readonly characterCreation?: ResourceBrowserCharacterCreation;
}

export type ResourceBrowserCharacterCreationOutcome =
  | { readonly status: 'created' }
  | {
      readonly status: 'incomplete';
      readonly retry: () => Promise<ResourceBrowserCharacterCreationOutcome>;
    };

export interface ResourceBrowserCharacterCreation {
  readonly destinationLabel: string;
  create(
    item: ResourceBrowserItem,
    displayName: string,
  ): Promise<ResourceBrowserCharacterCreationOutcome>;
}

type ResourceBrowserRootState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly projection: ResourceBrowserProjection }
  | { readonly kind: 'error'; readonly message: string };

type ResourceBrowserCreateKind = 'file' | 'directory' | 'canvas' | 'cut';

const FILE_CREATION_KINDS: readonly ResourceBrowserCreateKind[] = [
  'file',
  'directory',
  'canvas',
  'cut',
];

export function ResourceBrowserRoot({
  characterCreation,
  chrome = 'standalone',
  defaultViewMode = 'list',
  locale,
  lifecyclePresentation = 'active',
  previewTarget,
  runtime,
}: ResourceBrowserRootProps): ReactElement {
  const labels = getResourceBrowserLabels(locale);
  const presentationSnapshots = useResourceBrowserPresentationSnapshotStore();
  const presentationIdentity = resourceBrowserPresentationIdentity(runtime.identity);
  const displayStateKey = `${runtime.identity.projectId}:${runtime.identity.workspaceId}`;
  const initialDisplayState = useRef(presentationSnapshots?.read(presentationIdentity)).current;
  const [state, setState] = useState<ResourceBrowserRootState>({ kind: 'loading' });
  const [query, setQuery] = useState(initialDisplayState?.query ?? '');
  const [selectedIdBySource, setSelectedIdBySource] = useState<
    Readonly<Partial<Record<ResourceBrowserSource, string>>>
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
  const [activeContainerBySource, setActiveContainerBySource] = useState<
    Readonly<Partial<Record<'files' | 'media', string>>>
  >(() => initialDisplayState?.activeContainerResourceIds ?? {});
  const [entityDrafts, setEntityDrafts] = useState<Readonly<Record<string, EntityInspectorDraft>>>(
    () => initialDisplayState?.entityDrafts ?? {},
  );
  const requestSequence = useRef(0);
  const eventSequence = useRef(0);
  const pendingChildrenSource = useRef<'files' | 'media'>();
  const activeDisplayStateKey = useRef(displayStateKey);
  const activePresentationIdentity = useRef(presentationIdentity);
  const restoringDisplayState = useRef(false);
  const quickPreviewRequestId = useRef<string>();
  const quickPreviewTimer = useRef<ReturnType<typeof setTimeout>>();
  const quickPreviewSession = useRef<string>();
  const createEntryExtensionId = useId();
  const libraryMenuRef = useRef<HTMLDivElement>(null);
  const libraryMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    readonly x: number;
    readonly y: number;
    readonly source: ResourceBrowserSource;
    readonly item?: ResourceBrowserItem;
    readonly returnFocus: HTMLElement;
  }>();
  const [createEntry, setCreateEntry] = useState<
    | {
        readonly invocationId: string;
        readonly kind: ResourceBrowserCreateKind;
        readonly item?: ResourceBrowserItem;
      }
    | undefined
  >();
  const [entryName, setEntryName] = useState('');
  const [createEntryError, setCreateEntryError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [characterCreationDraft, setCharacterCreationDraft] = useState<{
    readonly item: ResourceBrowserItem;
    readonly displayName: string;
    readonly returnFocus: HTMLElement;
    readonly outcome?: Extract<ResourceBrowserCharacterCreationOutcome, { status: 'incomplete' }>;
    readonly error?: string;
  }>();
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
    libraryMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [libraryMenuOpen]);

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
      if (!pendingChildrenSource.current) {
        reconcileRetainedContainer(event.projection, setActiveContainerBySource);
      }
      setState({ kind: 'ready', projection: event.projection });
      setOperationError(undefined);
    });
    void runtime
      .getSnapshot()
      .then(async (projection) => {
        const saved = presentationSnapshots?.read(
          resourceBrowserPresentationIdentity(runtime.identity),
        );
        if (
          !saved ||
          (saved.activeSource === projection.source && saved.query === projection.query)
        ) {
          return projection;
        }
        return runtime.search(
          createResourceBrowserSearchRequest({
            requestId: `resource-presentation-restore-${globalThis.crypto.randomUUID()}`,
            identity: runtime.identity,
            source: saved.activeSource,
            query: saved.query,
          }),
        );
      })
      .then((projection) => {
        if (active) {
          reconcileRetainedContainer(projection, setActiveContainerBySource);
          reconcilePresentationState(projection, setSelectedIdBySource, setActiveContainerBySource);
          setState({ kind: 'ready', projection });
          setOperationError(undefined);
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
      selectedIdBySource,
      activeContainerBySource,
      entityDrafts,
    );
    activeDisplayStateKey.current = displayStateKey;
    activePresentationIdentity.current = presentationIdentity;
    restoringDisplayState.current = true;
    const saved = presentationSnapshots?.read(presentationIdentity);
    setQuery(saved?.query ?? '');
    setViewMode(saved?.viewMode ?? defaultViewMode);
    setExpandedIds(new Set(saved?.expandedResourceIds ?? []));
    setSelectedIdBySource(saved?.selectedResourceIds ?? {});
    setActiveContainerBySource(saved?.activeContainerResourceIds ?? {});
    setEntityDrafts(saved?.entityDrafts ?? {});
  }, [
    activeContainerBySource,
    defaultViewMode,
    expandedIds,
    entityDrafts,
    displayStateKey,
    presentationIdentity,
    presentationSnapshots,
    selectedIdBySource,
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
      selectedIdBySource,
      activeContainerBySource,
      entityDrafts,
    );
  }, [
    activeContainerBySource,
    defaultViewMode,
    expandedIds,
    entityDrafts,
    presentationSnapshots,
    query,
    selectedIdBySource,
    state,
    viewMode,
  ]);

  const runSearch = async (source: ResourceBrowserSource, nextQuery: string): Promise<void> => {
    requestSequence.current += 1;
    const requestNumber = requestSequence.current;
    if (source !== 'media') setLibraryMenuOpen(false);
    setPending(true);
    try {
      const projection = await runtime.search(
        createResourceBrowserSearchRequest({
          requestId: `resource-search-${requestSequence.current}`,
          identity: runtime.identity,
          source,
          query: nextQuery,
        }),
      );
      if (requestNumber === requestSequence.current) {
        reconcileRetainedContainer(projection, setActiveContainerBySource);
        setSelectedIdBySource((current) => {
          const selected = current[source];
          return !selected || projection.items.some((item) => item.resourceId === selected)
            ? current
            : { ...current, [source]: undefined };
        });
        setState({ kind: 'ready', projection });
        setOperationError(undefined);
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
      | 'source.link-global-library'
      | 'projection.reconcile'
      | 'source.add-directory-library'
      | 'source.relink'
      | 'source.remove'
      | 'workspace-entry.create-file'
      | 'workspace-entry.create-directory'
      | 'creative-document.create'
      | 'creative-document.open'
      | 'content.trash'
      | 'preview'
      | 'text.edit'
      | 'reveal',
    item?: ResourceBrowserItem,
    entryNameInput?: string,
  ): Promise<void> => {
    requestSequence.current += 1;
    setPending(true);
    try {
      const resultProjection = await runtime.execute({
        requestId: `resource-intent-${requestSequence.current}`,
        identity: runtime.identity,
        route,
        ...(item ? { resourceId: item.resourceId } : {}),
        ...(entryNameInput ? { entryName: entryNameInput } : {}),
        ...(route === RESOURCE_BROWSER_ROUTES.preview && previewTarget
          ? { targetPreview: previewTarget }
          : {}),
      });
      reconcileRetainedContainer(resultProjection, setActiveContainerBySource);
      reconcileRetainedSelection(resultProjection, setSelectedIdBySource);
      setState({ kind: 'ready', projection: resultProjection });
      setOperationError(undefined);
    } catch (error: unknown) {
      setOperationError(describeOperationError(error, labels));
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
  const selectedId = selectedIdBySource[projection.source];
  const selectedItem = selectedId
    ? projection.items.find((item) => item.resourceId === selectedId)
    : undefined;
  const creationKinds =
    projection.source === 'files' && projection.query.length === 0 ? FILE_CREATION_KINDS : [];
  const creationTargetLabel = resolveCreationTargetLabel(
    projection.items,
    selectedItem,
    labels.workspaceRoot,
  );

  const beginCreateEntry = (
    kind: ResourceBrowserCreateKind,
    explicitItem?: ResourceBrowserItem | null,
  ): void => {
    const item = explicitItem === null ? undefined : (explicitItem ?? selectedItem);
    if (item?.source === 'files' && item.kind === 'directory') {
      setExpandedIds((current) => new Set(current).add(item.resourceId));
    }
    setEntryName('');
    setCreateEntryError(undefined);
    setCreateEntry({
      invocationId: `create-${kind}:${globalThis.crypto.randomUUID()}`,
      kind,
      ...(item?.source === 'files' ? { item } : {}),
    });
  };

  const submitCreateEntry = async (): Promise<void> => {
    if (!createEntry || !entryName) return;
    const submittedEntryName = `${entryName.normalize('NFC')}${creativeDocumentExtension(
      createEntry.kind,
    )}`;
    requestSequence.current += 1;
    setPending(true);
    setCreateEntryError(undefined);
    try {
      const resultProjection = await runtime.execute({
        requestId: `resource-intent-${requestSequence.current}`,
        identity: runtime.identity,
        route:
          createEntry.kind === 'canvas' || createEntry.kind === 'cut'
            ? RESOURCE_BROWSER_ROUTES.createCreativeDocument
            : createEntry.kind === 'file'
              ? RESOURCE_BROWSER_ROUTES.createFile
              : RESOURCE_BROWSER_ROUTES.createDirectory,
        ...(createEntry.item ? { resourceId: createEntry.item.resourceId } : {}),
        entryName: submittedEntryName,
        ...(createEntry.kind === 'canvas' || createEntry.kind === 'cut'
          ? { documentKind: createEntry.kind }
          : {}),
      });
      reconcileRetainedContainer(resultProjection, setActiveContainerBySource);
      const createdPath = resolveCreatedEntryPath(
        createEntry.item,
        submittedEntryName,
        createEntry.kind,
      );
      const created = resultProjection.items.find(
        (item) =>
          item.source === 'files' &&
          item.locator.kind === 'workspace-file' &&
          item.locator.path === createdPath,
      );
      setSelectedIdBySource((current) => ({
        ...current,
        files: created?.resourceId,
      }));
      setState({ kind: 'ready', projection: resultProjection });
      setCreateEntry(undefined);
      setEntryName('');
    } catch (error: unknown) {
      setCreateEntryError(describeError(error));
    } finally {
      setPending(false);
    }
  };
  const createEntryExtension = createEntry ? creativeDocumentExtension(createEntry.kind) : '';
  const createEntryForm = createEntry ? (
    <form
      className="neko-resource-browser__create-entry"
      style={
        viewMode === 'list'
          ? { paddingLeft: 7 + resolveCreateEntryDepth(createEntry.item) * 14 }
          : undefined
      }
      onSubmit={(event) => {
        event.preventDefault();
        void submitCreateEntry();
      }}
    >
      <span aria-hidden="true">
        {createEntry.kind === 'directory' ? (
          <FolderIcon size={14} />
        ) : createEntry.kind === 'canvas' ? (
          <CodeIcon size={14} />
        ) : createEntry.kind === 'cut' ? (
          <EditIcon size={14} />
        ) : (
          <FileIcon size={14} />
        )}
      </span>
      <label className="neko-resource-browser__create-entry-name">
        <input
          autoFocus
          aria-describedby={createEntryExtension ? createEntryExtensionId : undefined}
          aria-label={labels.entryName}
          value={entryName}
          onChange={(event) => {
            setEntryName(event.currentTarget.value);
            setCreateEntryError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setCreateEntry(undefined);
            setEntryName('');
            setCreateEntryError(undefined);
          }}
        />
        {createEntryExtension ? (
          <span id={createEntryExtensionId}>{createEntryExtension}</span>
        ) : null}
      </label>
      {createEntryError ? <small role="alert">{createEntryError}</small> : null}
    </form>
  ) : null;
  const selectedEntity = selectedId
    ? projection.items.find((item) => item.resourceId === selectedId && item.source === 'entities')
    : undefined;
  const executeEntityIntent = async (
    resourceId: string,
    intent: Parameters<EntityInspectorProps['onIntent']>[0],
  ): Promise<void> => {
    const entity = projection.items.find(
      (item) => item.resourceId === resourceId && item.source === 'entities',
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
  const navigableSource =
    projection.source === 'files' || projection.source === 'media' ? projection.source : undefined;
  const activeContainerId = navigableSource ? activeContainerBySource[navigableSource] : undefined;
  const visibleItems = projectVisibleItems(projection, activeContainerId, expandedIds, viewMode);
  const breadcrumbs = buildBreadcrumbs(projection.items, activeContainerId);
  const submitSearch = (event: FormEvent): void => {
    event.preventDefault();
    void runSearch(projection.source, query);
  };
  const loadContainerChildren = async (
    source: 'files' | 'media',
    item: ResourceBrowserItem,
  ): Promise<ResourceBrowserProjection | undefined> => {
    requestSequence.current += 1;
    const requestNumber = requestSequence.current;
    setPending(true);
    try {
      pendingChildrenSource.current = source;
      const nextProjection = await runtime.children(
        createResourceBrowserChildrenRequest({
          requestId: `resource-children-${requestNumber}`,
          identity: runtime.identity,
          source,
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
      if (pendingChildrenSource.current === source) pendingChildrenSource.current = undefined;
      if (requestNumber === requestSequence.current) setPending(false);
    }
  };
  const toggleTreeContainer = async (
    source: 'files' | 'media',
    item: ResourceBrowserItem,
  ): Promise<void> => {
    if (expandedIds.has(item.resourceId)) {
      setExpandedIds((current) => removeSetMember(current, item.resourceId));
      return;
    }
    const nextProjection = await loadContainerChildren(source, item);
    if (!nextProjection) return;
    setExpandedIds((current) => addSetMember(current, item.resourceId));
  };
  const openGridContainer = async (
    source: 'files' | 'media',
    item: ResourceBrowserItem,
  ): Promise<void> => {
    const nextProjection = await loadContainerChildren(source, item);
    if (!nextProjection) return;
    setActiveContainerBySource((current) => ({
      ...current,
      [source]: item.resourceId,
    }));
  };
  const treePresentation =
    viewMode === 'list' && navigableSource !== undefined && projection.query.length === 0;
  const openContextMenu = (event: ReactMouseEvent, item?: ResourceBrowserItem): void => {
    event.preventDefault();
    if (item) {
      setSelectedIdBySource((current) => ({ ...current, [projection.source]: item.resourceId }));
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      source: projection.source,
      ...(item ? { item } : {}),
      returnFocus: event.currentTarget as HTMLElement,
    });
  };

  const runCharacterCreation = async (
    operation: () => Promise<ResourceBrowserCharacterCreationOutcome>,
  ): Promise<void> => {
    setPending(true);
    try {
      const outcome = await operation();
      if (outcome.status === 'created') {
        setCharacterCreationDraft(undefined);
        return;
      }
      setCharacterCreationDraft((current) =>
        current ? { ...current, outcome, error: undefined } : current,
      );
    } catch (error: unknown) {
      setCharacterCreationDraft((current) =>
        current ? { ...current, error: describeError(error) } : current,
      );
    } finally {
      setPending(false);
    }
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
          {projection.source === 'files' || projection.source === 'media' ? (
            <div
              className="neko-resource-browser__library-menu"
              ref={libraryMenuRef}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                setLibraryMenuOpen(false);
                globalThis.queueMicrotask(() => libraryMenuButtonRef.current?.focus());
              }}
            >
              <button
                ref={libraryMenuButtonRef}
                type="button"
                className="neko-resource-browser__icon-button"
                disabled={pending || (projection.source === 'files' && creationKinds.length === 0)}
                aria-label={
                  projection.source === 'files' ? labels.createMenu : labels.configureMediaLibraries
                }
                aria-haspopup="menu"
                aria-expanded={libraryMenuOpen}
                title={
                  projection.source === 'files' ? labels.createMenu : labels.configureMediaLibraries
                }
                onClick={() => setLibraryMenuOpen((open) => !open)}
              >
                <PlusIcon size={15} />
              </button>
              {libraryMenuOpen ? (
                <div className="neko-resource-browser__library-menu-content" role="menu">
                  {projection.source === 'files' ? (
                    <>
                      <span className="neko-resource-browser__create-target" role="presentation">
                        {labels.createTarget.replace('{target}', creationTargetLabel)}
                      </span>
                      {creationKinds.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setLibraryMenuOpen(false);
                            beginCreateEntry(kind);
                          }}
                        >
                          {createKindIcon(kind)}
                          <span>{createKindLabel(kind, labels)}</span>
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              ) : null}
            </div>
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
      <div className="neko-resource-browser__sources" role="tablist">
        {(['files', 'media', 'assets', 'entities'] as const).map((source) => (
          <button
            type="button"
            role="tab"
            aria-selected={projection.source === source}
            disabled={pending}
            key={source}
            onClick={() => void runSearch(source, query)}
          >
            {labels[source]}
          </button>
        ))}
      </div>
      {operationError ? (
        <div className="neko-resource-browser__operation-error" role="alert">
          <WarningIcon size={14} aria-hidden="true" />
          <span>{operationError}</span>
          <button
            type="button"
            className="neko-resource-browser__icon-button"
            aria-label={labels.dismiss}
            title={labels.dismiss}
            onClick={() => setOperationError(undefined)}
          >
            <CloseIcon size={13} />
          </button>
        </div>
      ) : null}
      <>
        {navigableSource && projection.query.length === 0 && viewMode === 'grid' ? (
          <nav className="neko-resource-browser__breadcrumbs" aria-label={labels.breadcrumbs}>
            <button
              type="button"
              aria-current={!activeContainerId ? 'page' : undefined}
              onClick={() =>
                setActiveContainerBySource((current) => ({
                  ...current,
                  [navigableSource]: undefined,
                }))
              }
            >
              {projection.source === 'files' ? labels.workspaceRoot : labels.mediaLibraries}
            </button>
            {breadcrumbs.map((item) => (
              <React.Fragment key={item.resourceId}>
                <ChevronRightIcon size={11} aria-hidden="true" />
                <button
                  type="button"
                  aria-current={item.resourceId === activeContainerId ? 'page' : undefined}
                  onClick={() =>
                    setActiveContainerBySource((current) => ({
                      ...current,
                      [navigableSource]: item.resourceId,
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
                {diagnostic.code === 'workspace-observation-failed' ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void execute(RESOURCE_BROWSER_ROUTES.reconcile)}
                  >
                    {labels.rescan}
                  </button>
                ) : null}
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
          {createEntry && !createEntry.item && projection.source === 'files'
            ? createEntryForm
            : null}
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
                      setSelectedIdBySource((current) => ({
                        ...current,
                        [projection.source]: item.resourceId,
                      }));
                      if (event.detail > 1) return;
                      if (item.role === 'directory' || item.role === 'library-root') {
                        if (
                          treePresentation &&
                          navigableSource &&
                          event.target instanceof Element &&
                          event.target.closest('.neko-resource-browser__disclosure')
                        ) {
                          void toggleTreeContainer(navigableSource, item);
                        }
                        return;
                      }
                      if (item.capabilities.includes('open-creative-document') && !pending) {
                        void execute(RESOURCE_BROWSER_ROUTES.openCreativeDocument, item);
                        return;
                      }
                      if (item.capabilities.includes('edit-text') && !pending) {
                        void execute(RESOURCE_BROWSER_ROUTES.editText, item);
                        return;
                      }
                      if (previewTarget && item.capabilities.includes('preview') && !pending) {
                        void execute(RESOURCE_BROWSER_ROUTES.preview, item);
                      }
                    }}
                    onDoubleClick={(event) => {
                      if (
                        (event.target instanceof Element &&
                          event.target.closest('.neko-resource-browser__disclosure')) ||
                        !navigableSource ||
                        projection.query.length > 0 ||
                        (item.role !== 'directory' && item.role !== 'library-root') ||
                        !canBrowseResourceContainer(item)
                      ) {
                        return;
                      }
                      if (viewMode === 'list') {
                        void toggleTreeContainer(navigableSource, item);
                      } else {
                        void openGridContainer(navigableSource, item);
                      }
                    }}
                    onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                        event.preventDefault();
                        const bounds = event.currentTarget.getBoundingClientRect();
                        setSelectedIdBySource((current) => ({
                          ...current,
                          [projection.source]: item.resourceId,
                        }));
                        setContextMenu({
                          x: bounds.left + 12,
                          y: bounds.top + 12,
                          source: projection.source,
                          item,
                          returnFocus: event.currentTarget,
                        });
                        return;
                      }
                      if (
                        !treePresentation ||
                        !navigableSource ||
                        (item.role !== 'directory' && item.role !== 'library-root')
                      ) {
                        return;
                      }
                      if (event.key === 'ArrowRight' && !expandedIds.has(item.resourceId)) {
                        event.preventDefault();
                        setSelectedIdBySource((current) => ({
                          ...current,
                          [projection.source]: item.resourceId,
                        }));
                        void toggleTreeContainer(navigableSource, item);
                        return;
                      }
                      if (event.key === 'ArrowLeft' && expandedIds.has(item.resourceId)) {
                        event.preventDefault();
                        setSelectedIdBySource((current) => ({
                          ...current,
                          [projection.source]: item.resourceId,
                        }));
                        void toggleTreeContainer(navigableSource, item);
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
                  {quickPreview?.resourceId === item.resourceId ? (
                    <div
                      className="neko-resource-browser__quick-preview"
                      data-preview-kind={quickPreview.result.descriptor.contentKind}
                    >
                      <QuickPreviewSurface
                        descriptor={quickPreview.result.descriptor}
                        locale={locale}
                      />
                    </div>
                  ) : null}
                </div>
                {createEntry?.item?.resourceId === item.resourceId ? createEntryForm : null}
              </React.Fragment>
            ))
          )}
        </div>
      </>
      {selectedEntity?.source === 'entities' ? (
        <>
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
          <CharacterAssociationCard item={selectedEntity} labels={labels} />
        </>
      ) : null}
      {contextMenu ? (
        <ResourceBrowserContextMenu
          menu={contextMenu}
          labels={labels}
          pending={pending}
          previewAvailable={previewTarget !== undefined}
          characterCreationAvailable={
            characterCreation !== undefined && canCreateCharacterFromResource(contextMenu.item)
          }
          creationKinds={creationKinds}
          onClose={() => {
            const returnFocus = contextMenu.returnFocus;
            setContextMenu(undefined);
            globalThis.queueMicrotask(() => returnFocus.focus());
          }}
          onAction={(action) => {
            const item = contextMenu.item;
            if (action === 'create-character') {
              if (!item || !characterCreation || !canCreateCharacterFromResource(item)) {
                throw new Error('Character creation source is unavailable.');
              }
              setContextMenu(undefined);
              setCharacterCreationDraft({
                item,
                displayName: suggestedCharacterName(item.label),
                returnFocus: contextMenu.returnFocus,
              });
              return;
            }
            if (action === 'create-file') {
              beginCreateEntry('file', item ?? null);
              return;
            }
            if (action === 'create-directory') {
              beginCreateEntry('directory', item ?? null);
              return;
            }
            if (action === 'create-canvas') {
              beginCreateEntry('canvas', item ?? null);
              return;
            }
            if (action === 'create-cut') {
              beginCreateEntry('cut', item ?? null);
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
            if (action === 'edit-text') void execute(RESOURCE_BROWSER_ROUTES.editText, item);
            if (action === 'preview') void execute(RESOURCE_BROWSER_ROUTES.preview, item);
            if (action === 'open-cut') {
              void execute(RESOURCE_BROWSER_ROUTES.openCreativeDocument, item);
            }
            if (action === 'reveal') void execute(RESOURCE_BROWSER_ROUTES.reveal, item);
            if (action === 'recover') void requestRecovery(item, 'existing-global');
            if (action === 'relink') void execute(RESOURCE_BROWSER_ROUTES.relinkSource, item);
            if (action === 'remove-library' && globalThis.confirm(labels.removeSourceConfirm)) {
              void execute(RESOURCE_BROWSER_ROUTES.removeSource, item);
            }
          }}
        />
      ) : null}
      {characterCreationDraft && characterCreation ? (
        <div className="neko-resource-browser__dialog-backdrop">
          <form
            className="neko-resource-browser__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resource-browser-character-create-title"
            onKeyDown={(event) => {
              if (
                event.key !== 'Escape' ||
                pending ||
                characterCreationDraft.outcome !== undefined
              ) {
                return;
              }
              event.preventDefault();
              const returnFocus = characterCreationDraft.returnFocus;
              setCharacterCreationDraft(undefined);
              globalThis.queueMicrotask(() => returnFocus.focus());
            }}
            onSubmit={(event) => {
              event.preventDefault();
              const displayName = characterCreationDraft.displayName.trim();
              if (!displayName) return;
              void runCharacterCreation(() =>
                characterCreation.create(characterCreationDraft.item, displayName),
              );
            }}
          >
            <strong id="resource-browser-character-create-title">{labels.createCharacter}</strong>
            <p>{characterCreationDraft.item.label}</p>
            <small>
              {labels.characterDestination.replace(
                '{destination}',
                characterCreation.destinationLabel,
              )}
            </small>
            <input
              autoFocus
              aria-label={labels.characterName}
              disabled={pending || characterCreationDraft.outcome !== undefined}
              value={characterCreationDraft.displayName}
              onChange={(event) => {
                const displayName = event.currentTarget.value;
                setCharacterCreationDraft((current) =>
                  current
                    ? {
                        ...current,
                        displayName,
                        error: undefined,
                      }
                    : current,
                );
              }}
            />
            {characterCreationDraft.outcome ? (
              <small role="alert">{labels.characterCreationIncomplete}</small>
            ) : null}
            {characterCreationDraft.error ? (
              <small role="alert">{characterCreationDraft.error}</small>
            ) : null}
            <div>
              {characterCreationDraft.outcome ? null : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const returnFocus = characterCreationDraft.returnFocus;
                    setCharacterCreationDraft(undefined);
                    globalThis.queueMicrotask(() => returnFocus.focus());
                  }}
                >
                  {labels.recoveryCancel}
                </button>
              )}
              {characterCreationDraft.outcome ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const outcome = characterCreationDraft.outcome;
                    if (!outcome) return;
                    void runCharacterCreation(outcome.retry);
                  }}
                >
                  {labels.retryCharacterCreation}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={pending || characterCreationDraft.displayName.trim().length === 0}
                >
                  {labels.confirm}
                </button>
              )}
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

function CharacterAssociationCard({
  item,
  labels,
}: {
  readonly item: Extract<ResourceBrowserItem, { readonly source: 'entities' }>;
  readonly labels: ReturnType<typeof getResourceBrowserLabels>;
}): ReactElement | null {
  if (!('characterAssociation' in item) || !item.characterAssociation) return null;
  const association = item.characterAssociation;
  const available = association.availability === 'available';
  return (
    <aside
      className="neko-resource-browser__character-association"
      data-availability={association.availability}
      aria-label={labels.linkedCharacter}
    >
      <header>
        <div>
          <strong>{association.displayName ?? association.characterProjectId}</strong>
          <span>{available ? labels.projectLocalCharacter : labels.characterNeedsAttention}</span>
        </div>
        {available ? <SuccessIcon size={14} /> : <WarningIcon size={14} />}
      </header>
      <dl>
        <div>
          <dt>{labels.entityIdentity}</dt>
          <dd>{association.entityId}</dd>
        </div>
        <div>
          <dt>{labels.characterProjectIdentity}</dt>
          <dd>{association.characterProjectId}</dd>
        </div>
      </dl>
      {association.diagnostic ? <p>{association.diagnostic}</p> : null}
      {available ? (
        <section>
          <div className="neko-resource-browser__character-handoffs">
            {association.handoffs.map((handoff) => (
              <span key={handoff.kind}>
                {handoff.kind === 'open-character'
                  ? labels.openCharacter
                  : labels.openCharacterStudio}
              </span>
            ))}
          </div>
          <small>
            {association.interactionStatus === 'select-version'
              ? labels.selectCharacterVersion
              : labels.noPublishedCharacterVersion}
          </small>
        </section>
      ) : null}
    </aside>
  );
}

function describeOperationError(
  error: unknown,
  labels: ReturnType<typeof getResourceBrowserLabels>,
): string {
  if (
    error instanceof ResourceBrowserOperationRejectedError &&
    error.code === 'main-view-capacity-reached'
  ) {
    return labels.mainViewCapacityReached.replace('{maximum}', String(error.maximum));
  }
  return describeError(error);
}

type ResourceBrowserContextAction =
  | 'create-file'
  | 'create-directory'
  | 'create-canvas'
  | 'create-cut'
  | 'trash-content'
  | 'link-library'
  | 'add-library'
  | 'preview'
  | 'edit-text'
  | 'open-cut'
  | 'reveal'
  | 'recover'
  | 'relink'
  | 'remove-library'
  | 'create-character';

function ResourceBrowserContextMenu({
  creationKinds,
  labels,
  menu,
  onAction,
  onClose,
  pending,
  previewAvailable,
  characterCreationAvailable,
}: {
  readonly creationKinds: readonly ResourceBrowserCreateKind[];
  readonly labels: ReturnType<typeof getResourceBrowserLabels>;
  readonly menu: {
    readonly x: number;
    readonly y: number;
    readonly source: ResourceBrowserSource;
    readonly item?: ResourceBrowserItem;
    readonly returnFocus: HTMLElement;
  };
  readonly onAction: (action: ResourceBrowserContextAction) => void;
  readonly onClose: () => void;
  readonly pending: boolean;
  readonly previewAvailable: boolean;
  readonly characterCreationAvailable: boolean;
}): ReactElement | null {
  const item = menu.item;
  const actions: {
    readonly action: ResourceBrowserContextAction;
    readonly label: string;
    readonly icon: ReactNode;
  }[] = [];
  if (!item) {
    if (menu.source === 'files') {
      actions.push(...createContextActions(creationKinds, labels));
    }
    if (menu.source === 'media') {
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
    if (characterCreationAvailable) {
      actions.push({
        action: 'create-character',
        label: labels.createCharacter,
        icon: <PlusIcon size={14} />,
      });
    }
    if (item.source === 'files' && item.kind === 'directory') {
      actions.push(...createContextActions(creationKinds, labels));
    }
    if (item.capabilities.includes('edit-text')) {
      actions.push({ action: 'edit-text', label: labels.editText, icon: <EditIcon size={14} /> });
    }
    if (previewAvailable && item.capabilities.includes('preview')) {
      actions.push({ action: 'preview', label: labels.preview, icon: <PlayIcon size={14} /> });
    }
    if (
      item.capabilities.includes('open-creative-document') &&
      isWorkspaceDocument(item, '.otio')
    ) {
      actions.push({ action: 'open-cut', label: labels.openCut, icon: <EditIcon size={14} /> });
    }
    if (item.capabilities.includes('reveal')) {
      actions.push({ action: 'reveal', label: labels.reveal, icon: <FolderIcon size={14} /> });
    }
    if (item.source === 'files') {
      actions.push({
        action: 'trash-content',
        label: labels.trashContent,
        icon: <TrashIcon size={14} />,
      });
    }
    if (item.source === 'media' && item.role === 'library-root') {
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
  const items: readonly MenuItem[] = actions.map(({ action, icon, label }) => ({
    label,
    icon,
    disabled: pending,
    danger: action === 'trash-content' || action === 'remove-library',
    onClick: () => onAction(action),
  }));
  return (
    <PositionedContextMenu
      className="neko-resource-browser__context-menu"
      items={items}
      x={Math.max(4, menu.x)}
      y={Math.max(4, menu.y)}
      onClose={onClose}
    />
  );
}

function canCreateCharacterFromResource(item: ResourceBrowserItem | undefined): boolean {
  if (!item) return false;
  if (item.source === 'files' || item.source === 'media') return item.role === 'content';
  return (
    item.source === 'entities' &&
    item.entityStatus === 'confirmed' &&
    !('characterAssociation' in item && item.characterAssociation !== undefined)
  );
}

function suggestedCharacterName(label: string): string {
  const normalized = label.trim();
  const extensionIndex = normalized.lastIndexOf('.');
  return extensionIndex > 0 ? normalized.slice(0, extensionIndex) : normalized;
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
    (item.source === 'entities'
      ? item.entityStatus !== 'candidate' && item.representationLocator !== undefined
      : item.source !== 'assets')
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
  selectedResourceIds: Readonly<Partial<Record<ResourceBrowserSource, string>>>,
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
    activeSource: state.projection.source,
    viewMode,
    expandedResourceIds: [...expandedIds].sort(),
    selectedResourceIds,
    activeContainerResourceIds,
    entityDrafts,
  };
  const isDefault =
    snapshot.query.length === 0 &&
    snapshot.activeSource === 'files' &&
    snapshot.viewMode === defaultViewMode &&
    snapshot.expandedResourceIds.length === 0 &&
    !Object.values(snapshot.selectedResourceIds).some(Boolean) &&
    !Object.values(snapshot.activeContainerResourceIds).some(Boolean) &&
    Object.keys(snapshot.entityDrafts).length === 0;
  store.write(identity, isDefault ? undefined : snapshot);
}

function reconcilePresentationState(
  projection: ResourceBrowserProjection,
  setSelectedIdBySource: React.Dispatch<
    React.SetStateAction<Readonly<Partial<Record<ResourceBrowserSource, string>>>>
  >,
  setActiveContainerBySource: React.Dispatch<
    React.SetStateAction<Readonly<Partial<Record<'files' | 'media', string>>>>
  >,
): void {
  reconcileRetainedSelection(projection, setSelectedIdBySource);
  reconcileRetainedContainer(projection, setActiveContainerBySource);
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
  setActiveContainerBySource: React.Dispatch<
    React.SetStateAction<Readonly<Partial<Record<'files' | 'media', string>>>>
  >,
): void {
  if (
    projection.query.length > 0 ||
    (projection.source !== 'files' && projection.source !== 'media')
  ) {
    return;
  }
  const source = projection.source;
  setActiveContainerBySource((current) => {
    const activeContainerId = current[source];
    if (
      !activeContainerId ||
      projection.items.some((item) => item.parentResourceId === activeContainerId)
    ) {
      return current;
    }
    return { ...current, [source]: undefined };
  });
}

function reconcileRetainedSelection(
  projection: ResourceBrowserProjection,
  setSelectedIdBySource: React.Dispatch<
    React.SetStateAction<Readonly<Partial<Record<ResourceBrowserSource, string>>>>
  >,
): void {
  setSelectedIdBySource((current) => {
    const selectedId = current[projection.source];
    if (!selectedId || projection.items.some((item) => item.resourceId === selectedId)) {
      return current;
    }
    return { ...current, [projection.source]: undefined };
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
    (projection.source === 'files' || projection.source === 'media') &&
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

function resolveCreateEntryDepth(item: ResourceBrowserItem | undefined): number {
  if (!item || item.source !== 'files') return 0;
  return item.kind === 'directory' ? item.depth + 1 : item.depth;
}

function resolveCreationTargetLabel(
  items: readonly ResourceBrowserItem[],
  item: ResourceBrowserItem | undefined,
  workspaceRootLabel: string,
): string {
  if (!item || item.source !== 'files') return workspaceRootLabel;
  if (item.kind === 'directory') return item.label;
  if (!item.parentResourceId) return workspaceRootLabel;
  return (
    items.find(
      (candidate) =>
        candidate.resourceId === item.parentResourceId &&
        candidate.source === 'files' &&
        candidate.kind === 'directory',
    )?.label ?? workspaceRootLabel
  );
}

function createKindLabel(
  kind: ResourceBrowserCreateKind,
  labels: ReturnType<typeof getResourceBrowserLabels>,
): string {
  if (kind === 'file') return labels.createFile;
  if (kind === 'directory') return labels.createDirectory;
  if (kind === 'canvas') return labels.createCanvas;
  return labels.createCut;
}

function creativeDocumentExtension(kind: ResourceBrowserCreateKind): '.nkc' | '.otio' | '' {
  if (kind === 'canvas') return '.nkc';
  if (kind === 'cut') return '.otio';
  return '';
}

function createKindIcon(kind: ResourceBrowserCreateKind): ReactElement {
  if (kind === 'directory') return <FolderIcon size={14} aria-hidden="true" />;
  if (kind === 'canvas') return <CodeIcon size={14} aria-hidden="true" />;
  if (kind === 'cut') return <EditIcon size={14} aria-hidden="true" />;
  return <FileIcon size={14} aria-hidden="true" />;
}

function createContextActions(
  kinds: readonly ResourceBrowserCreateKind[],
  labels: ReturnType<typeof getResourceBrowserLabels>,
): readonly {
  readonly action: Extract<ResourceBrowserContextAction, `create-${string}`>;
  readonly label: string;
  readonly icon: ReactNode;
}[] {
  return kinds.map((kind) => ({
    action: `create-${kind}` as const,
    label: createKindLabel(kind, labels),
    icon: createKindIcon(kind),
  }));
}

function resolveCreatedEntryPath(
  item: ResourceBrowserItem | undefined,
  requestedName: string,
  kind: 'file' | 'directory' | 'canvas' | 'cut',
): string {
  const extension = kind === 'canvas' ? '.nkc' : kind === 'cut' ? '.otio' : '';
  const name =
    extension && !requestedName.toLocaleLowerCase('en-US').endsWith(extension)
      ? `${requestedName}${extension}`
      : requestedName.slice(0, requestedName.length - (extension ? extension.length : 0)) +
        extension;
  if (!item || item.source !== 'files' || item.locator.kind !== 'workspace-file') return name;
  if (item.kind === 'directory') return `${item.locator.path}/${name}`;
  const separator = item.locator.path.lastIndexOf('/');
  return separator < 0 ? name : `${item.locator.path.slice(0, separator)}/${name}`;
}

function isWorkspaceDocument(item: ResourceBrowserItem, extension: '.nkc' | '.otio'): boolean {
  return (
    (item.source === 'files' || item.source === 'media') &&
    item.locator.kind === 'workspace-file' &&
    item.locator.path.toLocaleLowerCase().endsWith(extension)
  );
}

function startResourceCanvasDrag(
  event: DragEvent<HTMLButtonElement>,
  item: ResourceBrowserItem,
): void {
  const locator =
    item.source === 'entities'
      ? item.entityStatus === 'candidate'
        ? undefined
        : item.representationLocator
      : item.source === 'assets'
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
