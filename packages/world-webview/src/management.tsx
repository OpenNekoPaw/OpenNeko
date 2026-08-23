import type {
  OpenNekoDesktopWorldManagementBridge,
  WorldManagementCatalogProjection,
  WorldManagementCatalogQuery,
  WorldManagementDetailProjection,
  WorldManagementSort,
  WorldManagementVersionSummary,
  WorldPortableImportPreview,
} from '@neko/world/contracts';
import {
  CubeIcon,
  EmptyState,
  GridIcon,
  PackageIcon,
  PanoramaIcon,
  RefreshIcon,
  SearchIcon,
  WarningIcon,
} from '@neko/ui';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export type WorldManagementCatalogLoadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly catalog: WorldManagementCatalogProjection };

export interface WorldManagementRuntime {
  readonly loadState: WorldManagementCatalogLoadState;
  readonly reload: (query?: WorldManagementCatalogQuery) => Promise<void>;
  readonly readDetail: (globalWorldId: string) => Promise<WorldManagementDetailProjection>;
}

export type WorldDetailSelection = { readonly kind: 'global'; readonly globalWorldId: string };

export interface WorldManagementCreateActions {
  readonly onImport: () => void;
}

interface WorldManagementCatalogActions extends WorldManagementCreateActions {
  readonly onStartFromTemplate: () => void;
}

export interface WorldManagementDetailActions extends WorldManagementCreateActions {
  readonly onExport: (globalWorldId: string) => void;
}

export function WorldPortableExportScopeSurface({
  detail,
  disabled,
  locale,
  onCancel,
  onExport,
}: {
  readonly detail: WorldManagementDetailProjection;
  readonly disabled: boolean;
  readonly locale: SupportedLocale;
  readonly onCancel: () => void;
  readonly onExport: (selection: {
    readonly worldProjectId: string;
    readonly worldVersionId: string;
    readonly embeddedResourceIds: readonly string[];
  }) => void;
}): JSX.Element {
  const [selectedWorldVersionId, setSelectedWorldVersionId] = useState(
    () => detail.versions[0]?.worldVersionId ?? '',
  );
  return (
    <section className="world-management__portable-preview">
      <header>
        <span>{text(locale, '导出范围', 'Export scope')}</span>
        <h2>{detail.title}</h2>
        <p>
          {text(
            locale,
            '选择要写入世界包的不可变版本。运行、存档、分支与 Agent 数据始终排除。',
            'Choose immutable versions for the package. Runs, Saves, branches, and Agent data are always excluded.',
          )}
        </p>
      </header>
      <div className="world-management__portable-version-selection">
        {detail.versions.length === 0 ? (
          <p>
            {text(locale, '当前没有可导出的世界版本。', 'No WorldVersion is available to export.')}
          </p>
        ) : (
          <select
            aria-label={text(locale, '世界版本', 'World version')}
            disabled={disabled}
            value={selectedWorldVersionId}
            onChange={(event) => setSelectedWorldVersionId(event.currentTarget.value)}
          >
            {detail.versions.map((version) => (
              <option key={version.worldVersionId} value={version.worldVersionId}>
                {version.label} · {formatDate(version.publishedAt, locale)}
              </option>
            ))}
          </select>
        )}
      </div>
      <footer>
        <button disabled={disabled} type="button" onClick={onCancel}>
          {text(locale, '取消', 'Cancel')}
        </button>
        <button
          className="is-primary"
          disabled={disabled}
          type="button"
          onClick={() =>
            onExport({
              worldProjectId: detail.versions[0]?.worldProjectId ?? '',
              worldVersionId: selectedWorldVersionId,
              embeddedResourceIds: [],
            })
          }
        >
          {text(locale, '选择位置并导出', 'Choose location and export')}
        </button>
      </footer>
    </section>
  );
}

export function WorldPortableImportSurface({
  disabled,
  locale,
  onCancel,
  onCommit,
  preview,
}: {
  readonly disabled: boolean;
  readonly locale: SupportedLocale;
  readonly onCancel: () => void;
  readonly onCommit: () => void;
  readonly preview: WorldPortableImportPreview;
}): JSX.Element {
  return (
    <section className="world-management__portable-preview">
      <header>
        <span>{text(locale, '导入预览', 'Import preview')}</span>
        <h2>{text(locale, '确认世界包内容', 'Confirm World package')}</h2>
        <p>
          {text(
            locale,
            '仅导入一个精确世界版本到全局目录；运行、存档与 Agent 数据不会进入包。',
            'Only one exact World version is imported into the global catalog. Runs, Saves, and Agent data stay excluded.',
          )}
        </p>
      </header>
      <dl>
        <div>
          <dt>WorldProject</dt>
          <dd>{preview.worldProjectId}</dd>
        </div>
        <div>
          <dt>{text(locale, '世界版本', 'World version')}</dt>
          <dd>{preview.worldVersionId}</dd>
        </div>
        <div>
          <dt>{text(locale, '嵌入资源', 'Embedded resources')}</dt>
          <dd>{preview.embeddedResources.length}</dd>
        </div>
        <div>
          <dt>{text(locale, '外部依赖', 'External dependencies')}</dt>
          <dd>{preview.externalDependencies.length}</dd>
        </div>
      </dl>
      {preview.conflicts.length > 0 ? (
        <div className="world-management__portable-conflicts" role="alert">
          <strong>{text(locale, '全局对象存在冲突', 'Global object conflicts')}</strong>
          <ul>
            {preview.conflicts.map((conflict) => (
              <li key={`${conflict.kind}:${conflict.recordId}`}>
                {conflict.kind}: {conflict.recordId}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <footer>
        <button disabled={disabled} type="button" onClick={onCancel}>
          {text(locale, '取消', 'Cancel')}
        </button>
        <button
          className="is-primary"
          disabled={disabled || !preview.canCommit}
          type="button"
          onClick={onCommit}
        >
          {text(locale, '导入到全局目录', 'Import to global catalog')}
        </button>
      </footer>
    </section>
  );
}

const DEFAULT_QUERY: WorldManagementCatalogQuery = {
  search: '',
  sort: 'recently-updated',
};

export function useWorldManagementRuntime(input: {
  readonly active: boolean;
  readonly host?: OpenNekoDesktopWorldManagementBridge['worldManagement'];
  readonly reloadToken?: number;
}): WorldManagementRuntime {
  const [loadState, setLoadState] = useState<WorldManagementCatalogLoadState>({ kind: 'idle' });
  const activeRef = useRef(input.active);
  const queryRef = useRef(DEFAULT_QUERY);
  const requestRef = useRef(0);

  const reload = useCallback(
    async (query = queryRef.current) => {
      queryRef.current = query;
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setLoadState({ kind: 'loading' });
      try {
        if (!input.host) throw new Error('World Management Host port is unavailable.');
        const catalog = await input.host.getCatalog(query);
        if (activeRef.current && requestRef.current === requestId) {
          setLoadState({ kind: 'ready', catalog });
        }
      } catch (error) {
        if (activeRef.current && requestRef.current === requestId) {
          setLoadState({ kind: 'failed', message: describeError(error) });
        }
      }
    },
    [input.host],
  );

  useEffect(() => {
    activeRef.current = input.active;
    if (input.active) {
      void reload(queryRef.current);
    } else {
      requestRef.current += 1;
      setLoadState({ kind: 'idle' });
    }
    return () => {
      activeRef.current = false;
      requestRef.current += 1;
    };
  }, [input.active, input.reloadToken, reload]);

  const readDetail = useCallback(
    async (globalWorldId: string) => {
      if (!input.host) throw new Error('World Management Host port is unavailable.');
      return input.host.getDetail(globalWorldId);
    },
    [input.host],
  );

  return { loadState, reload, readDetail };
}

export function WorldManagementCatalogRoot({
  actions,
  locale,
  onSelect,
  runtime,
  selectedGlobalWorldId,
}: {
  readonly actions: WorldManagementCatalogActions;
  readonly locale: SupportedLocale;
  readonly onSelect: (globalWorldId: string) => void;
  readonly runtime: WorldManagementRuntime;
  readonly selectedGlobalWorldId?: string;
}): JSX.Element {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<WorldManagementSort>('recently-updated');
  const query = { search, sort } satisfies WorldManagementCatalogQuery;
  const catalog = runtime.loadState.kind === 'ready' ? runtime.loadState.catalog : undefined;

  useEffect(() => {
    const timer = window.setTimeout(() => void runtime.reload(query), 120);
    return () => window.clearTimeout(timer);
  }, [runtime.reload, search, sort]);

  return (
    <section
      className="world-management world-management--catalog"
      data-world-management-catalog-root="true"
    >
      <div className="world-management__content">
        <header className="world-management__hero">
          <div className="world-management__hero-copy">
            <h1>{text(locale, '世界', 'Worlds')}</h1>
            <p>
              {text(
                locale,
                '管理可用于互动的全局世界版本与运行记录。',
                'Manage global World versions and their runtime history.',
              )}
            </p>
            <button type="button" onClick={actions.onImport}>
              <PackageIcon size={15} />
              <span>{text(locale, '导入世界包', 'Import package')}</span>
            </button>
          </div>
          <div className="world-management__hero-visual" aria-hidden="true">
            <span className="world-management__hero-connector" />
            <span className="world-management__hero-tile is-world">
              <GridIcon size={25} />
            </span>
            <span className="world-management__hero-tile is-environment">
              <PanoramaIcon size={23} />
            </span>
            <span className="world-management__hero-tile is-object">
              <CubeIcon size={21} />
            </span>
          </div>
        </header>

        <section className="world-management__collection" aria-labelledby="my-worlds-heading">
          <header className="world-management__collection-header">
            <div className="world-management__collection-title">
              <h2 id="my-worlds-heading">{text(locale, '我的世界', 'My Worlds')}</h2>
              <span
                aria-label={text(
                  locale,
                  `${catalog?.items.length ?? 0} 个世界`,
                  `${catalog?.items.length ?? 0} worlds`,
                )}
              >
                {catalog?.items.length ?? 0}
              </span>
            </div>
            <div className="world-management__controls">
              <label className="world-management__search">
                <SearchIcon size={16} />
                <input
                  aria-label={text(locale, '搜索世界', 'Search worlds')}
                  placeholder={text(locale, '搜索世界', 'Search worlds')}
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                />
              </label>
              <select
                aria-label={text(locale, '世界排序', 'World sort')}
                value={sort}
                onChange={(event) =>
                  setSort(event.currentTarget.value === 'title' ? 'title' : 'recently-updated')
                }
              >
                <option value="recently-updated">
                  {text(locale, '最近更新', 'Recently updated')}
                </option>
                <option value="title">{text(locale, '名称', 'Title')}</option>
              </select>
              <button
                aria-label={text(locale, '刷新世界', 'Refresh worlds')}
                disabled={runtime.loadState.kind === 'loading'}
                title={text(locale, '刷新', 'Refresh')}
                type="button"
                onClick={() => void runtime.reload(query)}
              >
                <RefreshIcon size={16} />
              </button>
            </div>
          </header>

          {runtime.loadState.kind === 'idle' || runtime.loadState.kind === 'loading' ? (
            <ManagementStatus>
              {text(locale, '正在读取世界资料...', 'Loading worlds...')}
            </ManagementStatus>
          ) : runtime.loadState.kind === 'failed' ? (
            <ManagementStatus error>
              <span>{runtime.loadState.message}</span>
              <button type="button" onClick={() => void runtime.reload(query)}>
                {text(locale, '重试', 'Retry')}
              </button>
            </ManagementStatus>
          ) : (
            <div
              className="world-management__catalog-grid"
              data-world-management-card-catalog="true"
            >
              {catalog?.items.length === 0 ? (
                <EmptyState
                  fill
                  icon={<GridIcon size={22} />}
                  title={
                    search
                      ? text(locale, '没有匹配的世界', 'No matching worlds')
                      : text(locale, '导入第一个世界包', 'Import your first World package')
                  }
                  description={
                    search
                      ? text(locale, '尝试更换搜索内容。', 'Try another search.')
                      : text(
                          locale,
                          '工作区世界同步或 ZIP 导入后会显示在这里。',
                          'Worlds appear here after Workspace synchronization or ZIP import.',
                        )
                  }
                  action={
                    search ? undefined : (
                      <button type="button" onClick={actions.onImport}>
                        {text(locale, '导入世界包', 'Import package')}
                      </button>
                    )
                  }
                />
              ) : null}
              {catalog?.items.map((item) =>
                item.status === 'invalid' ? (
                  <article
                    className="world-management__world-card is-invalid"
                    data-world-management-invalid-card="true"
                    key={item.globalWorldId}
                  >
                    <span className="world-management__world-icon">
                      <WarningIcon size={19} />
                    </span>
                    <div className="world-management__world-card-copy">
                      <strong>{item.globalWorldId}</strong>
                      <p>{item.message}</p>
                      <span>{text(locale, '全局目录', 'Global catalog')}</span>
                    </div>
                  </article>
                ) : (
                  <button
                    aria-pressed={item.globalWorldId === selectedGlobalWorldId}
                    className="world-management__world-card"
                    data-world-management-world-card="true"
                    key={item.globalWorldId}
                    type="button"
                    onClick={() => onSelect(item.globalWorldId)}
                  >
                    <span className="world-management__world-icon">
                      <GridIcon size={20} />
                    </span>
                    <span className="world-management__world-card-copy">
                      <span className="world-management__world-card-heading">
                        <strong>{item.title}</strong>
                        <span>{text(locale, '当前版本', 'Current')}</span>
                      </span>
                      <p>{item.summary || text(locale, '暂无世界简介', 'No world summary')}</p>
                      <span className="world-management__world-card-meta">
                        <span>{text(locale, '全局目录', 'Global catalog')}</span>
                        <span>
                          {item.versionCount} {text(locale, '个版本', 'versions')}
                        </span>
                        <span>
                          {item.runtimeCount} {text(locale, '次运行', 'runs')}
                        </span>
                        {item.attentionCount > 0 ? (
                          <span className="is-attention">
                            {item.attentionCount} {text(locale, '项待处理', 'need attention')}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                ),
              )}
            </div>
          )}
        </section>

        <section className="world-management__templates" aria-labelledby="world-templates-heading">
          <h2 id="world-templates-heading">
            {text(locale, '从世界模板创建', 'Create from a World template')}
          </h2>
          <div className="world-management__template-grid">
            <button
              className="world-management__template-card"
              data-world-template="world-bible"
              type="button"
              onClick={actions.onStartFromTemplate}
            >
              <span className="world-management__template-preview" aria-hidden="true">
                <span className="world-management__template-pattern">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="world-management__template-icon">
                  <GridIcon size={26} />
                </span>
              </span>
              <span className="world-management__template-body">
                <span className="world-management__template-copy">
                  <strong>{text(locale, '建立世界设定集', 'Build a world bible')}</strong>
                  <small>
                    {text(
                      locale,
                      '梳理地理、规则、势力、历史与互动基础。',
                      'Define geography, rules, factions, history, and interaction foundations.',
                    )}
                  </small>
                </span>
                <span className="world-management__template-action">
                  {text(locale, '开始创作', 'Start creating')}
                </span>
              </span>
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

type DetailLoadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly detail: WorldManagementDetailProjection };

export function WorldManagementDetailRoot({
  actions,
  locale,
  runtime,
  selection,
}: {
  readonly actions: WorldManagementDetailActions;
  readonly locale: SupportedLocale;
  readonly runtime: WorldManagementRuntime;
  readonly selection?: WorldDetailSelection;
}): JSX.Element {
  const [loadState, setLoadState] = useState<DetailLoadState>({ kind: 'idle' });
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (!selection) {
      setLoadState({ kind: 'idle' });
      return;
    }
    setLoadState({ kind: 'loading' });
    void runtime
      .readDetail(selection.globalWorldId)
      .then((detail) => {
        if (requestRef.current === requestId) setLoadState({ kind: 'ready', detail });
      })
      .catch((error: unknown) => {
        if (requestRef.current === requestId) {
          setLoadState({ kind: 'failed', message: describeError(error) });
        }
      });
    return () => {
      requestRef.current += 1;
    };
  }, [runtime.readDetail, selection]);

  return (
    <section
      className="world-management world-management--detail"
      data-world-management-detail-root="true"
    >
      {!selection ? (
        <div className="world-management__detail-empty">
          <GridIcon size={26} />
          <strong>{text(locale, '选择一个世界', 'Select a world')}</strong>
          <span>
            {text(locale, '世界详情和可用操作会显示在这里。', 'Details and actions appear here.')}
          </span>
        </div>
      ) : loadState.kind === 'loading' || loadState.kind === 'idle' ? (
        <ManagementStatus>
          {text(locale, '正在读取世界详情...', 'Loading world details...')}
        </ManagementStatus>
      ) : loadState.kind === 'failed' ? (
        <ManagementStatus error>{loadState.message}</ManagementStatus>
      ) : (
        <WorldDetailContent actions={actions} detail={loadState.detail} locale={locale} />
      )}
    </section>
  );
}

function WorldDetailContent({
  actions,
  detail,
  locale,
}: {
  readonly actions: WorldManagementDetailActions;
  readonly detail: WorldManagementDetailProjection;
  readonly locale: SupportedLocale;
}): JSX.Element {
  return (
    <div className="world-management__detail-scroll" data-world-management-detail-scroll="true">
      <DetailSection eyebrow={text(locale, '全局目录', 'Global catalog')} title={detail.title}>
        <p>{detail.summary || text(locale, '暂无世界简介。', 'No world summary.')}</p>
        <dl className="world-management__facts">
          <div>
            <dt>{text(locale, '当前版本', 'Current version')}</dt>
            <dd>{detail.currentWorldVersionId}</dd>
          </div>
          <div>
            <dt>{text(locale, '更新时间', 'Updated')}</dt>
            <dd>{formatDate(detail.updatedAt, locale)}</dd>
          </div>
          <div>
            <dt>{text(locale, '可用版本', 'Usable versions')}</dt>
            <dd>{detail.versions.length}</dd>
          </div>
        </dl>
        <div className="world-management__primary-actions">
          <button type="button" onClick={() => actions.onExport(detail.globalWorldId)}>
            {text(locale, '导出', 'Export')}
          </button>
        </div>
      </DetailSection>

      <DetailSection
        eyebrow={text(locale, '生命周期', 'Lifecycle')}
        title={text(locale, '可用版本', 'Usable versions')}
      >
        {detail.versions.length === 0 ? (
          <p>{text(locale, '尚未创建可运行的本地版本。', 'No runnable local version yet.')}</p>
        ) : (
          <div className="world-management__version-list">
            {detail.versions.map((version) => (
              <VersionRow key={version.worldVersionId} locale={locale} version={version} />
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection
        eyebrow={text(locale, '依赖与引用', 'Dependencies and references')}
        title={text(locale, '诊断', 'Diagnostics')}
      >
        {detail.diagnostics.length === 0 ? (
          <p>
            {text(locale, '当前没有待处理的依赖或记录问题。', 'No dependency or record issues.')}
          </p>
        ) : (
          <ul className="world-management__diagnostic-list">
            {detail.diagnostics.map((item) => (
              <li key={`${item.recordKind}:${item.recordId}`}>
                <WarningIcon size={14} />
                <span>{item.message}</span>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      <DetailSection
        eyebrow={text(locale, '运行记录', 'Runtime history')}
        title={text(locale, '最近运行', 'Recent runs')}
      >
        {detail.recentRuntimes.length === 0 ? (
          <p>{text(locale, '尚未运行这个世界。', 'This world has not been run yet.')}</p>
        ) : (
          <div className="world-management__runtime-list">
            {detail.recentRuntimes.map((runtime) => (
              <div key={runtime.worldRunId}>
                <strong>{runtime.saveLabel}</strong>
                <span>{formatDate(runtime.updatedAt, locale)}</span>
                <small>{runtime.worldVersionId}</small>
              </div>
            ))}
          </div>
        )}
      </DetailSection>
    </div>
  );
}

function VersionRow({
  locale,
  version,
}: {
  readonly locale: SupportedLocale;
  readonly version: WorldManagementVersionSummary;
}): JSX.Element {
  return (
    <div>
      <span>
        <strong>{version.label}</strong>
        <small>{formatDate(version.publishedAt, locale)}</small>
      </span>
      <span>
        <small>
          {version.runtimeCount} {text(locale, '次运行', 'runs')}
        </small>
      </span>
    </div>
  );
}

function DetailSection({
  children,
  eyebrow,
  title,
}: {
  readonly children: ReactNode;
  readonly eyebrow: string;
  readonly title: string;
}): JSX.Element {
  return (
    <section className="world-management__detail-section">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ManagementStatus({
  children,
  error = false,
}: {
  readonly children: ReactNode;
  readonly error?: boolean;
}): JSX.Element {
  return (
    <div
      className={`world-management__status${error ? ' is-error' : ''}`}
      role={error ? 'alert' : undefined}
    >
      {children}
    </div>
  );
}

function formatDate(value: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale === 'zh-cn' ? 'zh-CN' : 'en', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function text(locale: SupportedLocale, zh: string, en: string): string {
  return locale === 'zh-cn' ? zh : en;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
