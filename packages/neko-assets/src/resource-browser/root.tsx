import {
  CONTENT_LOCATOR_DRAG_MIME,
  createContentLocatorDragData,
  type SupportedLocale,
} from '@neko/shared';
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
  TrashIcon,
  VolumeIcon,
} from '@neko/shared/icons';
import React, {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import {
  RESOURCE_BROWSER_CONTRACT_VERSION,
  RESOURCE_BROWSER_ROUTES,
  createResourceBrowserChildrenRequest,
  createResourceBrowserSearchRequest,
  createResourceBrowserThumbnailRequest,
  type ResourceBrowserFacet,
  type ResourceBrowserHostRuntime,
  type ResourceBrowserItem,
  type ResourceBrowserProjection,
} from './contract';
import { getResourceBrowserLabels } from './labels';
import './style.css';

export interface ResourceBrowserRootProps {
  readonly runtime: ResourceBrowserHostRuntime;
  readonly locale: SupportedLocale;
  readonly defaultViewMode?: 'list' | 'grid';
  readonly previewTarget?: {
    readonly viewId: string;
    readonly presentation: 'temporary' | 'side';
    readonly expectedWorkbenchRevision: number;
  };
  readonly onOpenCanvas?: (item: ResourceBrowserItem, presentation: 'main' | 'side') => void;
}

type ResourceBrowserRootState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly projection: ResourceBrowserProjection }
  | { readonly kind: 'error'; readonly message: string };

interface ResourceBrowserDisplayState {
  readonly query: string;
  readonly viewMode: 'list' | 'grid';
  readonly expandedIds: ReadonlySet<string>;
  readonly selectedId?: string;
  readonly activeContainerByFacet: Readonly<Partial<Record<'files' | 'media', string>>>;
}

const displayStateByProject = new Map<string, ResourceBrowserDisplayState>();

export function ResourceBrowserRoot({
  defaultViewMode = 'list',
  locale,
  onOpenCanvas,
  previewTarget,
  runtime,
}: ResourceBrowserRootProps): ReactElement {
  const labels = getResourceBrowserLabels(locale);
  const displayStateKey = `${runtime.identity.projectId}:${runtime.identity.workspaceId}`;
  const initialDisplayState = displayStateByProject.get(displayStateKey);
  const [state, setState] = useState<ResourceBrowserRootState>({ kind: 'loading' });
  const [query, setQuery] = useState(initialDisplayState?.query ?? '');
  const [selectedId, setSelectedId] = useState<string | undefined>(initialDisplayState?.selectedId);
  const [pending, setPending] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(
    initialDisplayState?.viewMode ?? defaultViewMode,
  );
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => initialDisplayState?.expandedIds ?? new Set(),
  );
  const [activeContainerByFacet, setActiveContainerByFacet] = useState<
    Readonly<Partial<Record<'files' | 'media', string>>>
  >(() => initialDisplayState?.activeContainerByFacet ?? {});
  const requestSequence = useRef(0);
  const eventSequence = useRef(0);
  const activeDisplayStateKey = useRef(displayStateKey);
  const restoringDisplayState = useRef(false);

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
      setState({ kind: 'ready', projection: event.projection });
    });
    void runtime
      .getSnapshot()
      .then((projection) => {
        if (active) setState({ kind: 'ready', projection });
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: 'error', message: describeError(error) });
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [runtime]);

  useEffect(() => {
    if (activeDisplayStateKey.current === displayStateKey) return;
    displayStateByProject.set(activeDisplayStateKey.current, {
      query,
      viewMode,
      expandedIds: new Set(expandedIds),
      ...(selectedId ? { selectedId } : {}),
      activeContainerByFacet,
    });
    activeDisplayStateKey.current = displayStateKey;
    restoringDisplayState.current = true;
    const saved = displayStateByProject.get(displayStateKey);
    setQuery(saved?.query ?? '');
    setViewMode(saved?.viewMode ?? defaultViewMode);
    setExpandedIds(saved?.expandedIds ?? new Set());
    setSelectedId(saved?.selectedId);
    setActiveContainerByFacet(saved?.activeContainerByFacet ?? {});
  }, [
    activeContainerByFacet,
    defaultViewMode,
    expandedIds,
    displayStateKey,
    selectedId,
    query,
    viewMode,
  ]);

  useEffect(() => {
    if (restoringDisplayState.current) {
      restoringDisplayState.current = false;
      return;
    }
    displayStateByProject.set(activeDisplayStateKey.current, {
      query,
      viewMode,
      expandedIds: new Set(expandedIds),
      ...(selectedId ? { selectedId } : {}),
      activeContainerByFacet,
    });
  }, [activeContainerByFacet, expandedIds, query, selectedId, viewMode]);

  const runSearch = async (facet: ResourceBrowserFacet, nextQuery: string): Promise<void> => {
    requestSequence.current += 1;
    const requestNumber = requestSequence.current;
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
        setSelectedId(undefined);
        if (facet === 'all' || facet === 'entities') {
          setActiveContainerByFacet({});
        }
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
    route: 'refresh' | 'source.add' | 'source.relink' | 'source.remove' | 'preview' | 'cut.open',
    item?: ResourceBrowserItem,
  ): Promise<void> => {
    requestSequence.current += 1;
    setPending(true);
    try {
      const resultProjection = await runtime.execute({
        schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
        requestId: `resource-intent-${requestSequence.current}`,
        identity: runtime.identity,
        route,
        ...(route === RESOURCE_BROWSER_ROUTES.addSource ||
        route === RESOURCE_BROWSER_ROUTES.relinkSource ||
        route === RESOURCE_BROWSER_ROUTES.removeSource
          ? { expectedRevision: projection.revision }
          : {}),
        ...(item ? { resourceId: item.resourceId } : {}),
        ...(route === RESOURCE_BROWSER_ROUTES.preview && previewTarget
          ? { targetPreview: previewTarget }
          : {}),
      });
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

  return (
    <section className="neko-resource-browser" aria-label={labels.title}>
      <header className="neko-resource-browser__header">
        <strong>{labels.title}</strong>
        <div>
          <button
            type="button"
            className="neko-resource-browser__icon-button"
            disabled={pending}
            aria-label={labels.addSource}
            title={labels.addSource}
            onClick={() => void execute(RESOURCE_BROWSER_ROUTES.addSource)}
          >
            <PlusIcon size={15} />
          </button>
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
        </div>
      </header>
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
      </form>
      <div className="neko-resource-browser__facets" role="tablist">
        {(['all', 'files', 'media', 'entities'] as const).map((facet) => (
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
      <div
        className="neko-resource-browser__items"
        data-view-mode={viewMode}
        role={treePresentation ? 'tree' : 'list'}
      >
        {projection.items.length === 0 ? (
          <div className="neko-resource-browser__empty">{labels.empty}</div>
        ) : (
          visibleItems.map((item, index) => (
            <React.Fragment key={item.resourceId}>
              {projection.facet === 'all' &&
              (index === 0 || visibleItems[index - 1]?.facet !== item.facet) ? (
                <div className="neko-resource-browser__section-title">{labels[item.facet]}</div>
              ) : null}
              <div
                className="neko-resource-browser__item-row"
                data-selected={item.resourceId === selectedId ? 'true' : 'false'}
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
                    setSelectedId(item.resourceId);
                    if (event.detail > 1) return;
                    if (item.role === 'directory' || item.role === 'library-root') {
                      if (navigableFacet && projection.query.length === 0) {
                        if (viewMode === 'list') {
                          void toggleTreeContainer(navigableFacet, item);
                        } else {
                          void openGridContainer(navigableFacet, item);
                        }
                      }
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
                  onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                    if (
                      !treePresentation ||
                      !navigableFacet ||
                      (item.role !== 'directory' && item.role !== 'library-root')
                    ) {
                      return;
                    }
                    if (event.key === 'ArrowRight' && !expandedIds.has(item.resourceId)) {
                      event.preventDefault();
                      setSelectedId(item.resourceId);
                      void toggleTreeContainer(navigableFacet, item);
                      return;
                    }
                    if (event.key === 'ArrowLeft' && expandedIds.has(item.resourceId)) {
                      event.preventDefault();
                      setSelectedId(item.resourceId);
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
                  />
                  <ResourceBrowserItemCopy item={item} showDescription={!treePresentation} />
                </button>
                {item.role === 'library-root' ? (
                  <span className="neko-resource-browser__inline-actions">
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
                      onClick={() => void execute(RESOURCE_BROWSER_ROUTES.removeSource, item)}
                    >
                      <TrashIcon size={13} />
                    </button>
                  </span>
                ) : null}
              </div>
            </React.Fragment>
          ))
        )}
      </div>
    </section>
  );
}

function canDragResourceToCanvas(item: ResourceBrowserItem): boolean {
  return (
    item.capabilities.includes('add-to-canvas') &&
    (item.facet === 'entities' ? item.representationLocator !== undefined : true)
  );
}

function ResourceBrowserItemCopy({
  item,
  showDescription,
}: {
  readonly item: ResourceBrowserItem;
  readonly showDescription: boolean;
}): ReactElement {
  const description = showDescription ? presentResourceBrowserDescription(item) : undefined;
  return (
    <span className="neko-resource-browser__item-copy">
      <strong title={item.label}>{item.label}</strong>
      {description ? <small title={description}>{description}</small> : null}
    </span>
  );
}

function presentResourceBrowserDescription(item: ResourceBrowserItem): string | undefined {
  const description = item.description?.trim();
  if (!description || description === '.' || description === item.kind) return undefined;
  return description;
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
    item.facet !== 'entities' &&
    item.locator.kind === 'workspace-file' &&
    item.locator.path.toLocaleLowerCase().endsWith(extension)
  );
}

function startResourceCanvasDrag(
  event: DragEvent<HTMLButtonElement>,
  item: ResourceBrowserItem,
): void {
  const locator = item.facet === 'entities' ? item.representationLocator : item.locator;
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
  runtime,
  unavailableLabel,
}: {
  readonly item: ResourceBrowserItem;
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
          requestId: `resource-thumbnail-${item.resourceId}-${descriptor.revision}`,
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
        <ResourceBrowserFallbackIcon kind={item.kind} />
      )}
    </span>
  );
}

function ResourceBrowserFallbackIcon({
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
