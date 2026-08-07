import {
  ChevronRightIcon,
  CloseIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  LayersIcon,
  MoreHorizontalIcon,
  MoveIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from '@neko/ui/icons';
import { ContextMenu, EmptyState, type ContextMenuItem } from '@neko/ui/primitives';
import type { SupportedLocale } from '@neko/ui/i18n';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import {
  type GlobalAssetItem,
  type GlobalLibraryItem,
  type GlobalLibraryViewMode,
  type GlobalMediaLibraryItem,
  type GlobalMediaLibraryLocationKind,
} from '@neko/assets-domain/global-library/contract';
import type {
  AssetCenterDirectoryContext,
  AssetCenterFilterProjection,
  AssetCenterSessionProjection,
} from '@neko/assets-domain/asset-center/contract';
import type { AssetCenterManagementRuntime } from '@neko/assets-domain/asset-center/controller';
import { getGlobalLibraryLabels } from './labels';
import {
  applyItemSelection,
  createSelectionRectangle,
  getSelectionCapabilities,
  isActionableLibraryItem,
  reconcileSelection,
  rectanglesIntersect,
  selectAllItems,
  type SelectionRectangle,
} from './selection';
import './style.css';

export interface AssetManagementRootProps {
  readonly runtime: AssetCenterManagementRuntime;
  readonly locale: SupportedLocale;
  readonly interactive?: boolean;
  readonly confirmAction: (message: string) => boolean | Promise<boolean>;
}

type Catalog = 'media-library' | 'global-asset-library';
type Sort = 'name-ascending' | 'name-descending' | 'modified-descending';

interface MarqueeGesture {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly additive: boolean;
  readonly initialSelection: ReadonlySet<string>;
  moved: boolean;
}

interface SelectionModifiers {
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
}

export function AssetManagementRoot({
  confirmAction,
  interactive = true,
  locale,
  runtime,
}: AssetManagementRootProps): ReactElement {
  const labels = getGlobalLibraryLabels(locale);
  const [projection, setProjection] = useState<AssetCenterSessionProjection>();
  const [locationKind, setLocationKind] = useState<GlobalMediaLibraryLocationKind>('local');
  const [pendingMutation, setPendingMutation] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [mutationError, setMutationError] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState<string>();
  const [marqueeRectangle, setMarqueeRectangle] = useState<SelectionRectangle>();
  const marqueeGesture = useRef<MarqueeGesture>();
  const collectionRef = useRef<HTMLDivElement>(null);
  const focusCollectionAfterRead = useRef(false);
  const hoverRequest = useRef<object>({});
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const [hoverPreview, setHoverPreview] = useState<{
    readonly itemId: string;
    readonly dataUrl: string;
  }>();
  const items =
    projection?.catalog.status === 'ready'
      ? projection.catalog.entries.map((entry) => entry.item)
      : [];
  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const selectionCapabilities = getSelectionCapabilities(selectedItems);

  const cancelHoverPreview = useCallback((): void => {
    hoverRequest.current = {};
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = undefined;
    }
    setHoverPreview(undefined);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve(runtime.getSnapshot()).then((snapshot) => {
      if (active) setProjection(snapshot);
    });
    const unsubscribe = runtime.subscribe(setProjection);
    return () => {
      active = false;
      cancelHoverPreview();
      unsubscribe();
    };
  }, [cancelHoverPreview, runtime]);

  useEffect(() => {
    if (!interactive || !projection || projection.catalog.status !== 'loading') return;
    let active = true;
    cancelHoverPreview();
    const timeout = setTimeout(() => {
      void runtime.refresh().then(
        () => {
          if (active) {
            if (focusCollectionAfterRead.current) {
              focusCollectionAfterRead.current = false;
              requestAnimationFrame(() => collectionRef.current?.focus());
            }
          }
        },
        () => undefined,
      );
    }, 150);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [cancelHoverPreview, interactive, projection, runtime]);

  useEffect(() => {
    const reconciled = reconcileSelection(selectedIds, items);
    if (!sameSelection(selectedIds, reconciled)) setSelectedIds(reconciled);
    if (selectionAnchorId && !items.some((item) => item.id === selectionAnchorId)) {
      setSelectionAnchorId(undefined);
    }
  }, [items, selectedIds, selectionAnchorId]);

  const refresh = (): void => {
    if (!projection) return;
    setPendingMutation(true);
    void runtime.refresh().finally(() => setPendingMutation(false));
  };

  const updateFilter = (filter: AssetCenterFilterProjection): void => {
    if (!projection) return;
    void Promise.resolve(runtime.updateFilter(filter))
      .then(setProjection)
      .catch((error: unknown) => setMutationError(describeError(error)));
  };

  const selectCatalog = (next: Catalog): void => {
    if (!projection) return;
    cancelHoverPreview();
    updateFilter({
      ...projection.filter,
      catalog: next,
      query: '',
      directory: undefined,
    });
    setNotice(undefined);
    setMutationError(undefined);
  };

  const activateDirectory = (item: GlobalMediaLibraryItem): void => {
    if (!projection) return;
    if (
      item.availability !== 'available' ||
      (item.kind !== 'library' && item.kind !== 'directory')
    ) {
      return;
    }
    cancelHoverPreview();
    updateFilter({
      ...projection.filter,
      query: '',
      directory: {
        libraryId: item.libraryId,
        libraryLabel: item.libraryLabel,
        locationKind: item.locationKind,
        relativePath: item.relativePath,
      },
    });
    focusCollectionAfterRead.current = true;
  };

  const beginHoverPreview = (item: GlobalLibraryItem): void => {
    if (item.availability !== 'available' || !item.thumbnail) return;
    cancelHoverPreview();
    const request = hoverRequest.current;
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = undefined;
      void runtime.resolveThumbnail(item, 'hover').then(
        (result) => {
          if (
            request === hoverRequest.current &&
            result.itemId === item.id &&
            result.sourceFingerprint === item.thumbnail?.sourceFingerprint
          ) {
            setHoverPreview({ itemId: item.id, dataUrl: result.dataUrl });
          }
        },
        () => {
          // A thumbnail failure intentionally leaves the stable typed icon visible.
        },
      );
    }, 180);
  };

  const runMutation = async (operation: () => Promise<string | undefined>): Promise<void> => {
    setPendingMutation(true);
    setMutationError(undefined);
    setNotice(undefined);
    try {
      const nextNotice = await operation();
      cancelHoverPreview();
      await runtime.refresh();
      setSelectedIds(new Set());
      setSelectionAnchorId(undefined);
      if (nextNotice) setNotice(nextNotice);
    } catch (error: unknown) {
      const message = describeError(error);
      setMutationError(message);
    } finally {
      setPendingMutation(false);
    }
  };

  const changeViewMode = (mode: GlobalLibraryViewMode): void => {
    if (projection) updateFilter({ ...projection.filter, viewMode: mode });
  };

  const selectItem = (item: GlobalLibraryItem, event: SelectionModifiers): void => {
    if (!isActionableLibraryItem(item)) return;
    const update = applyItemSelection({
      items,
      selectedIds,
      anchorId: selectionAnchorId,
      itemId: item.id,
      toggle: event.metaKey || event.ctrlKey,
      range: event.shiftKey,
    });
    setSelectedIds(update.selectedIds);
    setSelectionAnchorId(update.anchorId);
    if (
      item.availability === 'available' &&
      update.selectedIds.size === 1 &&
      update.selectedIds.has(item.id)
    ) {
      void runtime
        .select({ owner: item.owner, itemId: item.id })
        .catch((error: unknown) => setMutationError(describeError(error)));
    }
  };

  const selectItemForContextMenu = (item: GlobalLibraryItem): void => {
    if (!isActionableLibraryItem(item) || selectedIds.has(item.id)) return;
    setSelectedIds(new Set([item.id]));
    setSelectionAnchorId(item.id);
    if (item.availability === 'available') {
      void runtime
        .select({ owner: item.owner, itemId: item.id })
        .catch((error: unknown) => setMutationError(describeError(error)));
    }
  };

  const clearSelection = (): void => {
    setSelectedIds(new Set());
    setSelectionAnchorId(undefined);
  };

  const moveSelected = (): void => {
    if (!selectionCapabilities.canMove) return;
    void runMutation(async () => {
      await runtime.moveItems(selectedItems);
      return labels.moved;
    });
  };

  const removeSelected = (): void => {
    if (!selectionCapabilities.canRemoveAssets) return;
    void (async () => {
      const confirmed = await confirmAction(
        labels.removeSelectedConfirm.replace('{count}', String(selectedItems.length)),
      );
      if (!confirmed) {
        setNotice(labels.cancelled);
        return;
      }
      await runMutation(async () => {
        await runtime.removeAssets(
          selectedItems.filter(
            (item): item is GlobalAssetItem => item.owner === 'global-asset-library',
          ),
        );
        return labels.removed;
      });
    })();
  };

  const handleCollectionKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'a') {
      event.preventDefault();
      setSelectedIds(selectAllItems(items));
      setSelectionAnchorId(items.find(isActionableLibraryItem)?.id);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      clearSelection();
      return;
    }
    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      selectionCapabilities.canRemoveAssets
    ) {
      event.preventDefault();
      removeSelected();
    }
  };

  const handleMarqueePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    marqueeGesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      additive,
      initialSelection: additive ? selectedIds : new Set(),
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleMarqueePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const gesture = marqueeGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (
      !gesture.moved &&
      Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 5
    ) {
      return;
    }
    gesture.moved = true;
    const rectangle = createSelectionRectangle(
      gesture.startX,
      gesture.startY,
      event.clientX,
      event.clientY,
    );
    const intersecting = new Set<string>();
    for (const element of event.currentTarget.querySelectorAll<HTMLElement>(
      '[data-library-item-id]',
    )) {
      const itemId = element.dataset['libraryItemId'];
      const item = itemId ? items.find((candidate) => candidate.id === itemId) : undefined;
      if (!item || !isActionableLibraryItem(item)) continue;
      const bounds = element.getBoundingClientRect();
      if (
        rectanglesIntersect(rectangle, {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
        })
      ) {
        intersecting.add(item.id);
      }
    }
    setSelectedIds(new Set([...gesture.initialSelection, ...intersecting]));
    setMarqueeRectangle(rectangle);
  };

  const finishMarquee = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean): void => {
    const gesture = marqueeGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (cancelled) setSelectedIds(gesture.initialSelection);
    else if (!gesture.moved && !gesture.additive) clearSelection();
    marqueeGesture.current = undefined;
    setMarqueeRectangle(undefined);
  };

  if (!projection) {
    return (
      <section className="global-library-browser" data-owner-root="asset-management">
        <div className="global-library-browser__loading" role="status">
          {labels.loading}
        </div>
      </section>
    );
  }
  const { catalog, directory, query, viewMode } = projection.filter;
  const sort = toSort(projection.filter);
  const title = catalog === 'media-library' ? labels.titleMedia : labels.titleAssets;
  const description =
    catalog === 'media-library' ? labels.descriptionMedia : labels.descriptionAssets;
  return (
    <section
      className="global-library-browser"
      data-owner-root="asset-management"
      data-asset-center-session-id={projection.identity.assetCenterSessionId}
      data-catalog-status={projection.catalog.status}
    >
      <header className="global-library-browser__header">
        <div className="global-library-browser__header-copy">
          <p className="section-label">{labels.eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="global-library-browser__commands">
          {catalog === 'media-library' ? (
            <>
              <label>
                <span className="global-library-browser__visually-hidden">{labels.location}</span>
                <select
                  aria-label={labels.location}
                  value={locationKind}
                  disabled={pendingMutation || projection.catalog.status !== 'ready'}
                  onChange={(event) =>
                    setLocationKind(requireLocationKind(event.currentTarget.value))
                  }
                >
                  <option value="local">{labels.local}</option>
                  <option value="nas">{labels.nas}</option>
                  <option value="cloud">{labels.cloud}</option>
                </select>
              </label>
              <button
                type="button"
                disabled={!interactive || pendingMutation || projection.catalog.status !== 'ready'}
                onClick={() =>
                  void runMutation(async () => {
                    await runtime.addMediaLibrary(locationKind);
                    return undefined;
                  })
                }
              >
                <PlusIcon size={14} />
                <span>{labels.addLibrary}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!interactive || pendingMutation || projection.catalog.status !== 'ready'}
              onClick={() =>
                void runMutation(async () => {
                  await runtime.importAssets();
                  return labels.imported;
                })
              }
            >
              <UploadIcon size={14} />
              <span>{labels.importAssets}</span>
            </button>
          )}
        </div>
      </header>

      <div className="global-library-browser__toolbar">
        <label className="global-library-browser__search">
          <SearchIcon size={16} />
          <input
            aria-label={catalog === 'media-library' ? labels.searchMedia : labels.searchAssets}
            placeholder={catalog === 'media-library' ? labels.searchMedia : labels.searchAssets}
            value={query}
            onChange={(event) =>
              updateFilter({
                ...projection.filter,
                query: event.currentTarget.value,
              })
            }
          />
        </label>
        <select
          aria-label={labels.sort}
          value={sort}
          onChange={(event) =>
            updateFilter(withSort(projection.filter, requireSort(event.currentTarget.value)))
          }
        >
          <option value="name-ascending">{labels.nameAscending}</option>
          <option value="name-descending">{labels.nameDescending}</option>
          <option value="modified-descending">{labels.newest}</option>
        </select>
        <div className="global-library-browser__view-switcher">
          <button
            type="button"
            title={labels.list}
            aria-label={labels.list}
            aria-pressed={viewMode === 'list'}
            onClick={() => changeViewMode('list')}
          >
            <LayersIcon size={14} />
          </button>
          <button
            type="button"
            title={labels.grid}
            aria-label={labels.grid}
            aria-pressed={viewMode === 'grid'}
            onClick={() => changeViewMode('grid')}
          >
            <GridIcon size={14} />
          </button>
        </div>
        <button
          type="button"
          title={labels.refresh}
          aria-label={labels.refresh}
          disabled={!interactive || pendingMutation || projection.catalog.status !== 'ready'}
          onClick={refresh}
        >
          <RefreshIcon size={14} />
        </button>
        <div className="global-library-browser__facets">
          <button
            type="button"
            aria-pressed={catalog === 'media-library'}
            onClick={() => selectCatalog('media-library')}
          >
            {labels.titleMedia}
          </button>
          <button
            type="button"
            aria-pressed={catalog === 'global-asset-library'}
            onClick={() => selectCatalog('global-asset-library')}
          >
            {labels.titleAssets}
          </button>
        </div>
      </div>

      {selectedItems.length > 0 ? (
        <div
          className="global-library-browser__batch-toolbar"
          role="toolbar"
          aria-label={labels.selectedCount.replace('{count}', String(selectedItems.length))}
        >
          <strong>{labels.selectedCount.replace('{count}', String(selectedItems.length))}</strong>
          <span className="global-library-browser__batch-spacer" />
          <button
            type="button"
            disabled={pendingMutation || !selectionCapabilities.canMove}
            onClick={moveSelected}
          >
            <MoveIcon size={14} />
            <span>{labels.moveTo}</span>
          </button>
          <button
            type="button"
            disabled={pendingMutation || !selectionCapabilities.canRemoveAssets}
            onClick={removeSelected}
          >
            <TrashIcon size={14} />
            <span>{labels.removeSelected}</span>
          </button>
          <button
            type="button"
            title={labels.clearSelection}
            aria-label={labels.clearSelection}
            disabled={pendingMutation}
            onClick={clearSelection}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      ) : null}

      {catalog === 'media-library' && directory && query.length === 0 ? (
        <Breadcrumbs
          directory={directory}
          ariaLabel={labels.breadcrumb}
          rootLabel={labels.root}
          onNavigate={(relativePath) => {
            cancelHoverPreview();
            updateFilter({
              ...projection.filter,
              directory: relativePath === undefined ? undefined : { ...directory, relativePath },
            });
          }}
        />
      ) : null}

      {mutationError ? (
        <p className="global-library-browser__diagnostic" role="alert">
          {mutationError}
        </p>
      ) : notice ? (
        <p className="global-library-browser__notice" role="status">
          {notice}
        </p>
      ) : null}

      {projection.catalog.status === 'unavailable' ? (
        <p className="global-library-browser__diagnostic" role="alert">
          {projection.catalog.diagnostic.message}
        </p>
      ) : projection.catalog.status === 'loading' ? (
        <div className="global-library-browser__loading" role="status">
          {labels.loading}
        </div>
      ) : items.length === 0 ? (
        <EmptyState fill icon={<LayersIcon size={24} />} title={labels.empty} />
      ) : (
        <div
          ref={collectionRef}
          className="global-library-browser__collection"
          data-view-mode={viewMode}
          tabIndex={0}
          onKeyDown={handleCollectionKeyDown}
          onPointerCancel={(event) => finishMarquee(event, true)}
          onPointerDown={handleMarqueePointerDown}
          onPointerMove={handleMarqueePointerMove}
          onPointerUp={(event) => finishMarquee(event, false)}
        >
          {items.map((item) => (
            <GlobalLibraryEntry
              key={item.id}
              controller={runtime}
              item={item}
              labels={labels}
              locale={locale}
              pendingMutation={pendingMutation}
              selected={selectedIds.has(item.id)}
              selectionCapabilities={selectionCapabilities}
              viewMode={viewMode}
              hoverPreview={hoverPreview?.itemId === item.id ? hoverPreview.dataUrl : undefined}
              onActivate={() => {
                if (item.owner === 'media-library') activateDirectory(item);
              }}
              onHoverStart={() => beginHoverPreview(item)}
              onHoverEnd={cancelHoverPreview}
              onSelect={(event) => selectItem(item, event)}
              onContextMenu={() => selectItemForContextMenu(item)}
              onMoveSelected={moveSelected}
              onRemoveSelected={removeSelected}
              onClearSelection={clearSelection}
              onSelectAll={() => {
                setSelectedIds(selectAllItems(items));
                setSelectionAnchorId(items.find(isActionableLibraryItem)?.id);
              }}
              onRelinkLibrary={(library) =>
                void runMutation(async () => {
                  await runtime.relinkMediaLibrary(library.libraryId);
                  return labels.relinked;
                })
              }
              onRemoveLibrary={(library) =>
                void runMutation(async () => {
                  if (
                    !(await confirmAction(
                      labels.removeConnectionConfirm.replace('{name}', library.label),
                    ))
                  ) {
                    return labels.cancelled;
                  }
                  await runtime.removeMediaLibrary(library.libraryId);
                  return labels.removed;
                })
              }
              onRevealLibrary={(library) =>
                void runMutation(async () => {
                  await runtime.revealMediaLibrary(library.libraryId);
                  return labels.revealed;
                })
              }
            />
          ))}
          {marqueeRectangle ? (
            <span
              className="global-library-browser__marquee"
              aria-hidden="true"
              style={{
                left: marqueeRectangle.left,
                top: marqueeRectangle.top,
                width: marqueeRectangle.right - marqueeRectangle.left,
                height: marqueeRectangle.bottom - marqueeRectangle.top,
              }}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function GlobalLibraryEntry({
  controller,
  hoverPreview,
  item,
  labels,
  locale,
  onActivate,
  onClearSelection,
  onContextMenu,
  onHoverEnd,
  onHoverStart,
  onMoveSelected,
  onRelinkLibrary,
  onRemoveSelected,
  onRemoveLibrary,
  onRevealLibrary,
  onSelectAll,
  onSelect,
  pendingMutation,
  selected,
  selectionCapabilities,
  viewMode,
}: {
  readonly controller: Pick<AssetCenterManagementRuntime, 'resolveThumbnail'>;
  readonly hoverPreview?: string;
  readonly item: GlobalLibraryItem;
  readonly labels: ReturnType<typeof getGlobalLibraryLabels>;
  readonly locale: SupportedLocale;
  readonly onActivate: () => void;
  readonly onClearSelection: () => void;
  readonly onContextMenu: () => void;
  readonly onHoverEnd: () => void;
  readonly onHoverStart: () => void;
  readonly onMoveSelected: () => void;
  readonly onRelinkLibrary: (item: GlobalMediaLibraryItem) => void;
  readonly onRemoveSelected: () => void;
  readonly onRemoveLibrary: (item: GlobalMediaLibraryItem) => void;
  readonly onRevealLibrary: (item: GlobalMediaLibraryItem) => void;
  readonly onSelect: (modifiers: SelectionModifiers) => void;
  readonly onSelectAll: () => void;
  readonly pendingMutation: boolean;
  readonly selected: boolean;
  readonly selectionCapabilities: ReturnType<typeof getSelectionCapabilities>;
  readonly viewMode: GlobalLibraryViewMode;
}): ReactElement {
  const activate = (): void => {
    if (item.owner === 'media-library' && (item.kind === 'library' || item.kind === 'directory')) {
      onActivate();
    }
  };
  const keyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      activate();
    } else if (event.key === ' ' && isActionableLibraryItem(item)) {
      event.preventDefault();
      onSelect(event);
    }
  };
  const contextMenuItems: readonly ContextMenuItem[] = isActionableLibraryItem(item)
    ? [
        {
          id: 'move',
          label: <MenuLabel icon={<MoveIcon size={14} />} text={labels.moveTo} />,
          disabled: pendingMutation || !selectionCapabilities.canMove,
          onSelect: onMoveSelected,
        },
        ...(item.owner === 'global-asset-library'
          ? [
              {
                id: 'remove',
                label: <MenuLabel icon={<TrashIcon size={14} />} text={labels.removeSelected} />,
                danger: true,
                disabled: pendingMutation || !selectionCapabilities.canRemoveAssets,
                onSelect: onRemoveSelected,
              } as const,
            ]
          : []),
        { id: 'selection-separator', type: 'separator' as const },
        {
          id: 'select-all',
          label: labels.selectAll,
          shortcut: '⌘A',
          onSelect: onSelectAll,
        },
        {
          id: 'clear-selection',
          label: labels.clearSelection,
          shortcut: 'Esc',
          onSelect: onClearSelection,
        },
      ]
    : item.owner === 'media-library' && item.kind === 'library'
      ? [
          { id: 'reveal', label: labels.reveal, onSelect: () => onRevealLibrary(item) },
          { id: 'relink', label: labels.relink, onSelect: () => onRelinkLibrary(item) },
          {
            id: 'remove-connection',
            label: labels.removeConnection,
            danger: true,
            onSelect: () => onRemoveLibrary(item),
          },
        ]
      : [];
  const entry = (
    <article
      className="global-library-browser__entry"
      data-library-item-id={isActionableLibraryItem(item) ? item.id : undefined}
      data-selected={selected ? 'true' : 'false'}
      tabIndex={0}
      onBlur={onHoverEnd}
      onDoubleClick={activate}
      onFocus={onHoverStart}
      onKeyDown={keyDown}
      onPointerEnter={onHoverStart}
      onPointerLeave={onHoverEnd}
      onClick={(event) => onSelect(event)}
      onContextMenu={onContextMenu}
    >
      <GlobalLibraryIcon controller={controller} item={item} />
      <span className="global-library-browser__entry-copy">
        <strong>{item.label}</strong>
        <small>
          {item.description ?? item.mediaType ?? item.kind}
          {item.modifiedAt ? ` · ${formatDate(item.modifiedAt, locale)}` : ''}
        </small>
        {item.unavailable ? (
          <small className="global-library-browser__entry-diagnostic" role="status">
            {item.unavailable.fieldNames.join(', ')}: {item.unavailable.message}
          </small>
        ) : null}
      </span>
      {viewMode === 'list' && item.byteLength !== undefined ? (
        <small className="global-library-browser__size">{formatBytes(item.byteLength)}</small>
      ) : null}
      {item.owner === 'media-library' && item.kind === 'library' ? (
        <details
          className="global-library-browser__menu"
          onClick={(event) => event.stopPropagation()}
        >
          <summary title={labels.actions} aria-label={`${labels.actions}: ${item.label}`}>
            <MoreHorizontalIcon size={16} />
          </summary>
          <div>
            <button type="button" disabled={pendingMutation} onClick={() => onRevealLibrary(item)}>
              {labels.reveal}
            </button>
            <button type="button" disabled={pendingMutation} onClick={() => onRelinkLibrary(item)}>
              {labels.relink}
            </button>
            <button type="button" disabled={pendingMutation} onClick={() => onRemoveLibrary(item)}>
              {labels.removeConnection}
            </button>
          </div>
        </details>
      ) : null}
      {hoverPreview ? (
        <div className="global-library-browser__hover-preview" role="presentation">
          <img src={hoverPreview} alt="" />
        </div>
      ) : null}
    </article>
  );
  return contextMenuItems.length > 0 ? (
    <ContextMenu trigger={entry} items={contextMenuItems} />
  ) : (
    entry
  );
}

function MenuLabel({
  icon,
  text,
}: {
  readonly icon: ReactElement;
  readonly text: string;
}): ReactElement {
  return (
    <span className="global-library-browser__menu-label">
      {icon}
      <span>{text}</span>
    </span>
  );
}

function GlobalLibraryIcon({
  controller,
  item,
}: {
  readonly controller: Pick<AssetCenterManagementRuntime, 'resolveThumbnail'>;
  readonly item: GlobalLibraryItem;
}): ReactElement {
  const [visible, setVisible] = useState(false);
  const [dataUrl, setDataUrl] = useState<string>();
  const hostRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !item.thumbnail) return;
    let active = true;
    setDataUrl(undefined);
    void controller.resolveThumbnail(item, 'icon').then(
      (result) => {
        if (
          active &&
          result.itemId === item.id &&
          result.sourceFingerprint === item.thumbnail?.sourceFingerprint
        ) {
          setDataUrl(result.dataUrl);
        }
      },
      () => {
        if (active) setDataUrl(undefined);
      },
    );
    return () => {
      active = false;
    };
  }, [controller, item, visible]);
  return (
    <span ref={hostRef} className="global-library-browser__thumbnail" aria-hidden="true">
      {dataUrl ? <img src={dataUrl} alt="" /> : <TypedIcon item={item} />}
    </span>
  );
}

function TypedIcon({ item }: { readonly item: GlobalLibraryItem }): ReactElement {
  if (item.owner === 'media-library' && (item.kind === 'library' || item.kind === 'directory')) {
    return <FolderIcon size={22} />;
  }
  return item.mediaType === 'image' || item.mediaType === 'video' ? (
    <GridIcon size={21} />
  ) : (
    <FileIcon size={21} />
  );
}

function Breadcrumbs({
  ariaLabel,
  directory,
  onNavigate,
  rootLabel,
}: {
  readonly ariaLabel: string;
  readonly directory: AssetCenterDirectoryContext;
  readonly onNavigate: (relativePath: string | undefined) => void;
  readonly rootLabel: string;
}): ReactElement {
  const segments = directory.relativePath.split('/').filter(Boolean);
  return (
    <nav className="global-library-browser__breadcrumbs" aria-label={ariaLabel}>
      <button type="button" onClick={() => onNavigate(undefined)}>
        {rootLabel}
      </button>
      <ChevronRightIcon size={13} />
      <button type="button" onClick={() => onNavigate('')}>
        {directory.libraryLabel}
      </button>
      {segments.map((segment, index) => (
        <React.Fragment key={`${segment}:${index}`}>
          <ChevronRightIcon size={13} />
          <button type="button" onClick={() => onNavigate(segments.slice(0, index + 1).join('/'))}>
            {segment}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}

function withSort(filter: AssetCenterFilterProjection, sort: Sort): AssetCenterFilterProjection {
  return {
    ...filter,
    sortBy: sort === 'modified-descending' ? ('modifiedAt' as const) : ('name' as const),
    sortDirection:
      sort === 'name-descending' || sort === 'modified-descending'
        ? ('descending' as const)
        : ('ascending' as const),
  };
}

function toSort(filter: AssetCenterFilterProjection): Sort {
  return filter.sortBy === 'modifiedAt'
    ? 'modified-descending'
    : filter.sortDirection === 'descending'
      ? 'name-descending'
      : 'name-ascending';
}

function requireSort(value: string): Sort {
  if (
    value !== 'name-ascending' &&
    value !== 'name-descending' &&
    value !== 'modified-descending'
  ) {
    throw new Error(`Unknown Global Library sort '${value}'.`);
  }
  return value;
}

function requireLocationKind(value: string): GlobalMediaLibraryLocationKind {
  if (value !== 'local' && value !== 'nas' && value !== 'cloud') {
    throw new Error(`Unknown Global Library location kind '${value}'.`);
  }
  return value;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDate(value: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale === 'zh-cn' ? 'zh-CN' : 'en', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function sameSelection(first: ReadonlySet<string>, second: ReadonlySet<string>): boolean {
  return first.size === second.size && [...first].every((itemId) => second.has(itemId));
}
