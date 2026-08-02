import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  LayersIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from '@neko/ui/icons';
import type { SupportedLocale } from '@neko/ui/i18n';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import {
  type GlobalAssetItem,
  type GlobalLibraryBrowserRuntime,
  type GlobalLibraryItem,
  type GlobalLibraryViewMode,
  type GlobalMediaLibraryItem,
  type GlobalMediaLibraryLocationKind,
} from '@neko/assets-domain/global-library/contract';
import { GlobalLibraryController } from '@neko/assets-domain/global-library/controller';
import { getGlobalLibraryLabels } from './labels';
import './style.css';

export interface GlobalLibraryBrowserRootProps {
  readonly runtime: GlobalLibraryBrowserRuntime;
  readonly locale: SupportedLocale;
  readonly defaultViewMode: GlobalLibraryViewMode;
  readonly interactive?: boolean;
  readonly onViewModeChange?: (mode: GlobalLibraryViewMode) => void | Promise<void>;
  readonly confirmAction: (message: string) => boolean | Promise<boolean>;
}

type Catalog = 'media-library' | 'global-asset-library';
type Sort = 'name-ascending' | 'name-descending' | 'modified-descending';
type CatalogState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly items: readonly GlobalLibraryItem[] }
  | { readonly kind: 'error'; readonly message: string };

interface DirectoryContext {
  readonly libraryId: string;
  readonly libraryLabel: string;
  readonly locationKind: GlobalMediaLibraryLocationKind;
  readonly relativePath: string;
}

export function GlobalLibraryBrowserRoot({
  confirmAction,
  defaultViewMode,
  interactive = true,
  locale,
  onViewModeChange,
  runtime,
}: GlobalLibraryBrowserRootProps): ReactElement {
  const labels = getGlobalLibraryLabels(locale);
  const controller = useMemo(() => new GlobalLibraryController(runtime), [runtime]);
  const controllerLifetime = useMemo(() => ({ mounted: false, released: false }), [controller]);
  const [catalog, setCatalog] = useState<Catalog>('media-library');
  const [state, setState] = useState<CatalogState>({ kind: 'loading' });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('name-ascending');
  const [viewMode, setViewMode] = useState(defaultViewMode);
  const [locationKind, setLocationKind] = useState<GlobalMediaLibraryLocationKind>('local');
  const [directory, setDirectory] = useState<DirectoryContext>();
  const [selectedId, setSelectedId] = useState<string>();
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [pendingMutation, setPendingMutation] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [mutationError, setMutationError] = useState<string>();
  const collectionRef = useRef<HTMLDivElement>(null);
  const focusCollectionAfterRead = useRef(false);
  const hoverGeneration = useRef(0);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const [hoverPreview, setHoverPreview] = useState<{
    readonly itemId: string;
    readonly dataUrl: string;
  }>();

  const cancelHoverPreview = useCallback((): void => {
    hoverGeneration.current += 1;
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = undefined;
    }
    setHoverPreview(undefined);
  }, []);

  const readCurrentCatalog = useCallback(() => {
    const input = toSearchInput(query, sort);
    return catalog === 'global-asset-library'
      ? controller.searchAssets(input)
      : directory && query.length === 0
        ? controller.readMediaLibraryChildren({
            ...input,
            libraryId: directory.libraryId,
            relativePath: directory.relativePath,
          })
        : controller.searchMediaLibraries(input);
  }, [catalog, controller, directory, query, sort]);

  useEffect(() => {
    controllerLifetime.mounted = true;
    return () => {
      controllerLifetime.mounted = false;
      cancelHoverPreview();
      queueMicrotask(() => {
        if (!controllerLifetime.mounted && !controllerLifetime.released) {
          controllerLifetime.released = true;
          controller.dispose();
        }
      });
    };
  }, [cancelHoverPreview, controller, controllerLifetime]);

  useEffect(() => {
    setViewMode(defaultViewMode);
  }, [defaultViewMode]);

  useEffect(() => {
    if (!interactive) return;
    let active = true;
    setState({ kind: 'loading' });
    cancelHoverPreview();
    const timeout = setTimeout(() => {
      void readCurrentCatalog().then(
        (projection) => {
          if (!active) return;
          setState({ kind: 'ready', items: projection.items });
          if (focusCollectionAfterRead.current) {
            focusCollectionAfterRead.current = false;
            requestAnimationFrame(() => collectionRef.current?.focus());
          }
        },
        (error: unknown) => {
          if (active) setState({ kind: 'error', message: describeError(error) });
        },
      );
    }, 150);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [cancelHoverPreview, interactive, readCurrentCatalog, refreshSequence]);

  const refresh = (): void => {
    setRefreshSequence((value) => value + 1);
  };

  const selectCatalog = (next: Catalog): void => {
    cancelHoverPreview();
    setCatalog(next);
    setDirectory(undefined);
    setQuery('');
    setSelectedId(undefined);
    setNotice(undefined);
    setMutationError(undefined);
  };

  const activateDirectory = (item: GlobalMediaLibraryItem): void => {
    if (
      item.availability !== 'available' ||
      (item.kind !== 'library' && item.kind !== 'directory')
    ) {
      return;
    }
    cancelHoverPreview();
    setQuery('');
    setSelectedId(undefined);
    setDirectory({
      libraryId: item.libraryId,
      libraryLabel: item.libraryLabel,
      locationKind: item.locationKind,
      relativePath: item.relativePath,
    });
    focusCollectionAfterRead.current = true;
  };

  const beginHoverPreview = (item: GlobalLibraryItem): void => {
    if (!item.thumbnail) return;
    cancelHoverPreview();
    const generation = hoverGeneration.current;
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = undefined;
      void controller.resolveThumbnail(item, 'hover').then(
        (result) => {
          if (
            generation === hoverGeneration.current &&
            result.itemId === item.id &&
            result.thumbnailRevision === item.thumbnail?.revision
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
    let refreshing = false;
    try {
      const nextNotice = await operation();
      refreshing = true;
      setState({ kind: 'loading' });
      cancelHoverPreview();
      const projection = await readCurrentCatalog();
      setState({ kind: 'ready', items: projection.items });
      if (nextNotice) setNotice(nextNotice);
    } catch (error: unknown) {
      const message = describeError(error);
      if (refreshing) setState({ kind: 'error', message });
      setMutationError(message);
    } finally {
      setPendingMutation(false);
    }
  };

  const changeViewMode = (mode: GlobalLibraryViewMode): void => {
    setViewMode(mode);
    void onViewModeChange?.(mode);
  };

  const items = state.kind === 'ready' ? state.items : [];
  const title = catalog === 'media-library' ? labels.titleMedia : labels.titleAssets;
  const description =
    catalog === 'media-library' ? labels.descriptionMedia : labels.descriptionAssets;
  return (
    <section className="global-library-browser" data-owner-root="global-library-browser">
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
                  disabled={pendingMutation}
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
                disabled={!interactive || pendingMutation}
                onClick={() =>
                  void runMutation(async () => {
                    const result = await controller.addMediaLibrary(locationKind);
                    return result.status === 'cancelled' ? labels.cancelled : undefined;
                  })
                }
              >
                <PlusIcon size={15} />
                <span>{labels.addLibrary}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!interactive || pendingMutation}
              onClick={() =>
                void runMutation(async () => {
                  const result = await controller.importAssets();
                  if (result.status === 'cancelled') return labels.cancelled;
                  const failures = result.outcomes.filter((outcome) => outcome.status !== 'added');
                  return failures.length === 0
                    ? labels.imported
                    : `${labels.imported} ${failures
                        .map((outcome) => `${outcome.label}: ${outcome.diagnostic}`)
                        .join(' ')}`;
                })
              }
            >
              <UploadIcon size={15} />
              <span>{labels.importAssets}</span>
            </button>
          )}
        </div>
      </header>

      <div className="global-library-browser__toolbar">
        <label className="global-library-browser__search">
          <SearchIcon size={15} />
          <input
            aria-label={catalog === 'media-library' ? labels.searchMedia : labels.searchAssets}
            placeholder={catalog === 'media-library' ? labels.searchMedia : labels.searchAssets}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <select
          aria-label={labels.sort}
          value={sort}
          onChange={(event) => setSort(requireSort(event.currentTarget.value))}
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
            <LayersIcon size={15} />
          </button>
          <button
            type="button"
            title={labels.grid}
            aria-label={labels.grid}
            aria-pressed={viewMode === 'grid'}
            onClick={() => changeViewMode('grid')}
          >
            <GridIcon size={15} />
          </button>
        </div>
        <button
          type="button"
          title={labels.refresh}
          aria-label={labels.refresh}
          disabled={!interactive || pendingMutation}
          onClick={refresh}
        >
          <RefreshIcon size={15} />
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

      {catalog === 'media-library' && directory && query.length === 0 ? (
        <Breadcrumbs
          directory={directory}
          ariaLabel={labels.breadcrumb}
          rootLabel={labels.root}
          onNavigate={(relativePath) => {
            cancelHoverPreview();
            setSelectedId(undefined);
            setDirectory(relativePath === undefined ? undefined : { ...directory, relativePath });
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

      {state.kind === 'error' ? (
        <p className="global-library-browser__diagnostic" role="alert">
          {state.message}
        </p>
      ) : state.kind === 'loading' ? (
        <div className="global-library-browser__loading" role="status">
          {labels.loading}
        </div>
      ) : items.length === 0 ? (
        <div className="global-library-browser__empty">{labels.empty}</div>
      ) : (
        <div
          ref={collectionRef}
          className="global-library-browser__collection"
          data-view-mode={viewMode}
          tabIndex={-1}
        >
          {items.map((item) => (
            <GlobalLibraryEntry
              key={item.id}
              controller={controller}
              item={item}
              labels={labels}
              locale={locale}
              pendingMutation={pendingMutation}
              selected={selectedId === item.id}
              viewMode={viewMode}
              hoverPreview={hoverPreview?.itemId === item.id ? hoverPreview.dataUrl : undefined}
              onActivate={() => {
                if (item.owner === 'media-library') activateDirectory(item);
              }}
              onHoverStart={() => beginHoverPreview(item)}
              onHoverEnd={cancelHoverPreview}
              onSelect={() => setSelectedId(item.id)}
              onRemoveAsset={(asset) =>
                void runMutation(async () => {
                  if (
                    !(await confirmAction(labels.removeAssetConfirm.replace('{name}', asset.label)))
                  ) {
                    return labels.cancelled;
                  }
                  await controller.removeAsset(asset);
                  return labels.removed;
                })
              }
              onRelinkLibrary={(library) =>
                void runMutation(async () => {
                  const result = await controller.relinkMediaLibrary(library.libraryId);
                  return result.status === 'cancelled' ? labels.cancelled : labels.relinked;
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
                  await controller.removeMediaLibrary(library.libraryId);
                  if (directory?.libraryId === library.libraryId) setDirectory(undefined);
                  return labels.removed;
                })
              }
              onRevealLibrary={(library) =>
                void runMutation(async () => {
                  await controller.revealMediaLibrary(library.libraryId);
                  return labels.revealed;
                })
              }
            />
          ))}
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
  onHoverEnd,
  onHoverStart,
  onRelinkLibrary,
  onRemoveAsset,
  onRemoveLibrary,
  onRevealLibrary,
  onSelect,
  pendingMutation,
  selected,
  viewMode,
}: {
  readonly controller: GlobalLibraryController;
  readonly hoverPreview?: string;
  readonly item: GlobalLibraryItem;
  readonly labels: ReturnType<typeof getGlobalLibraryLabels>;
  readonly locale: SupportedLocale;
  readonly onActivate: () => void;
  readonly onHoverEnd: () => void;
  readonly onHoverStart: () => void;
  readonly onRelinkLibrary: (item: GlobalMediaLibraryItem) => void;
  readonly onRemoveAsset: (item: GlobalAssetItem) => void;
  readonly onRemoveLibrary: (item: GlobalMediaLibraryItem) => void;
  readonly onRevealLibrary: (item: GlobalMediaLibraryItem) => void;
  readonly onSelect: () => void;
  readonly pendingMutation: boolean;
  readonly selected: boolean;
  readonly viewMode: GlobalLibraryViewMode;
}): ReactElement {
  const activate = (): void => {
    if (item.owner === 'media-library' && (item.kind === 'library' || item.kind === 'directory')) {
      onActivate();
    }
  };
  const keyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    activate();
  };
  return (
    <article
      className="global-library-browser__entry"
      data-selected={selected ? 'true' : 'false'}
      tabIndex={0}
      onBlur={onHoverEnd}
      onDoubleClick={activate}
      onFocus={onHoverStart}
      onKeyDown={keyDown}
      onPointerEnter={onHoverStart}
      onPointerLeave={onHoverEnd}
      onClick={onSelect}
    >
      <GlobalLibraryIcon controller={controller} item={item} />
      <span className="global-library-browser__entry-copy">
        <strong>{item.label}</strong>
        <small>
          {item.description ?? item.mediaType ?? item.kind}
          {item.modifiedAt ? ` · ${formatDate(item.modifiedAt, locale)}` : ''}
        </small>
      </span>
      {viewMode === 'list' && item.byteLength !== undefined ? (
        <small className="global-library-browser__size">{formatBytes(item.byteLength)}</small>
      ) : null}
      {item.owner === 'global-asset-library' ? (
        <button
          type="button"
          className="global-library-browser__entry-action"
          title={labels.removeAsset}
          aria-label={`${labels.removeAsset}: ${item.label}`}
          disabled={pendingMutation}
          onClick={(event) => {
            event.stopPropagation();
            onRemoveAsset(item);
          }}
        >
          <TrashIcon size={14} />
        </button>
      ) : item.kind === 'library' ? (
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
}

function GlobalLibraryIcon({
  controller,
  item,
}: {
  readonly controller: GlobalLibraryController;
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
          result.thumbnailRevision === item.thumbnail?.revision
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
  readonly directory: DirectoryContext;
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

function toSearchInput(query: string, sort: Sort) {
  return {
    query,
    sortBy: sort === 'modified-descending' ? ('modifiedAt' as const) : ('name' as const),
    sortDirection:
      sort === 'name-descending' || sort === 'modified-descending'
        ? ('descending' as const)
        : ('ascending' as const),
    limit: 160,
  };
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
