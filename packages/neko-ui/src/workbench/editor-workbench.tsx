import type React from 'react';
import type { ReactNode } from 'react';
import { cn } from '../utils';

export interface EditorWorkbenchShellProps {
  readonly titleBar: ReactNode;
  readonly activityBar: ReactNode;
  readonly sidebar: ReactNode;
  readonly editor: ReactNode;
  readonly secondarySidebar?: ReactNode;
  readonly activityBarVisible?: boolean;
  readonly sidebarVisible?: boolean;
  readonly secondarySidebarVisible?: boolean;
  readonly inspector?: ReactNode;
  readonly bottomPanel?: ReactNode;
  readonly statusBar?: ReactNode;
  readonly className?: string;
}

export interface WorkbenchActivityItem {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly badge?: string;
}

export interface WorkbenchActivityBarProps {
  readonly items: readonly WorkbenchActivityItem[];
  readonly label: string;
  readonly activeId?: string;
  readonly className?: string;
  readonly onSelect: (id: string) => void;
}

export interface WorkbenchEditorTab {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly title?: string;
  readonly disabled?: boolean;
  readonly closeLabel?: string;
  readonly closable?: boolean;
}

export interface WorkbenchEditorTabsProps {
  readonly tabs: readonly WorkbenchEditorTab[];
  readonly label: string;
  readonly activeId?: string;
  readonly emptyLabel: string;
  readonly className?: string;
  readonly onSelect: (id: string) => void;
  readonly onClose?: (id: string) => void;
  readonly onReorder?: (sourceId: string, targetId: string) => void;
}

export interface WorkbenchPanelHeaderProps {
  readonly title: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly detail?: ReactNode;
  readonly count?: ReactNode;
  readonly className?: string;
}

export interface WorkbenchStatusBarProps {
  readonly items: readonly ReactNode[];
  readonly label: string;
  readonly className?: string;
}

export interface WorkbenchListCardAction {
  readonly id: string;
  readonly label: string;
  readonly onClick: () => void;
}

export interface WorkbenchListCardBadge {
  readonly id: string;
  readonly label: string;
  readonly tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

export interface WorkbenchListCardProps {
  readonly id: string;
  readonly label: string;
  readonly selected?: boolean;
  readonly description?: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly thumbnail?: ReactNode;
  readonly metadata?: readonly ReactNode[];
  readonly badges?: readonly WorkbenchListCardBadge[];
  readonly actions?: readonly WorkbenchListCardAction[];
  readonly className?: string;
  readonly onSelect: (id: string) => void;
}

export interface WorkbenchThumbnailItem {
  readonly id: string;
  readonly label: string;
  readonly title?: string;
  readonly selected?: boolean;
  readonly preview: ReactNode;
}

export interface WorkbenchThumbnailStripProps {
  readonly title: ReactNode;
  readonly count?: ReactNode;
  readonly items: readonly WorkbenchThumbnailItem[];
  readonly label: string;
  readonly className?: string;
  readonly onSelect: (id: string) => void;
}

export interface WorkbenchWebviewRuntimeFrameProps {
  readonly runtimeId: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function EditorWorkbenchShell({
  activityBar,
  activityBarVisible = true,
  bottomPanel,
  className,
  editor,
  inspector,
  secondarySidebar,
  secondarySidebarVisible = true,
  sidebar,
  sidebarVisible = true,
  statusBar,
  titleBar,
}: EditorWorkbenchShellProps): React.ReactElement {
  const secondarySidebarContent = secondarySidebar ?? inspector;
  const hasVisibleSecondarySidebar = Boolean(secondarySidebarContent) && secondarySidebarVisible;

  return (
    <main
      className={cn('neko-editor-workbench-shell', className)}
      data-neko-editor-workbench="true"
      data-activity-visible={activityBarVisible ? 'true' : 'false'}
      data-has-bottom={bottomPanel ? 'true' : 'false'}
      data-secondary-visible={hasVisibleSecondarySidebar ? 'true' : 'false'}
      data-sidebar-visible={sidebarVisible ? 'true' : 'false'}
      data-workbench-layout="docked-editor"
    >
      <div className="neko-editor-workbench-title">{titleBar}</div>
      {activityBarVisible ? (
        <div className="neko-editor-workbench-activity">{activityBar}</div>
      ) : null}
      {sidebarVisible ? <div className="neko-editor-workbench-sidebar">{sidebar}</div> : null}
      <div className="neko-editor-workbench-editor">{editor}</div>
      {hasVisibleSecondarySidebar ? (
        <div className="neko-editor-workbench-secondary-sidebar">{secondarySidebarContent}</div>
      ) : null}
      {bottomPanel ? <div className="neko-editor-workbench-bottom">{bottomPanel}</div> : null}
      {statusBar ? <div className="neko-editor-workbench-status">{statusBar}</div> : null}
    </main>
  );
}

export function WorkbenchWebviewRuntimeFrame({
  children,
  className,
  runtimeId,
}: WorkbenchWebviewRuntimeFrameProps): React.ReactElement {
  return (
    <div
      className={cn('neko-workbench-webview-runtime-frame', className)}
      data-neko-webview-runtime={runtimeId}
    >
      {children}
    </div>
  );
}

export function WorkbenchActivityBar({
  activeId,
  className,
  items,
  label,
  onSelect,
}: WorkbenchActivityBarProps): React.ReactElement {
  return (
    <nav aria-label={label} className={cn('neko-workbench-activity-bar', className)}>
      {items.map((item) => {
        const active = item.active ?? item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            className="neko-workbench-activity-button"
            data-active={active ? 'true' : 'false'}
            disabled={item.disabled}
            title={item.label}
            onClick={() => onSelect(item.id)}
          >
            <span className="neko-workbench-activity-button__icon">{item.icon}</span>
            <span className="neko-workbench-activity-button__label">{item.label}</span>
            {item.badge ? (
              <span className="neko-workbench-activity-button__badge">{item.badge}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export function WorkbenchEditorTabs({
  activeId,
  className,
  emptyLabel,
  label,
  onClose,
  onReorder,
  onSelect,
  tabs,
}: WorkbenchEditorTabsProps): React.ReactElement {
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, tabId: string): void => {
    if (!onReorder) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-neko-workbench-tab', tabId);
    event.dataTransfer.setData('text/plain', tabId);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, targetId: string): void => {
    if (!onReorder) return;
    event.preventDefault();
    const sourceId =
      event.dataTransfer.getData('application/x-neko-workbench-tab') ||
      event.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) return;
    onReorder(sourceId, targetId);
  };

  return (
    <div className={cn('neko-workbench-editor-tabs', className)} role="tablist" aria-label={label}>
      {tabs.length > 0 ? (
        tabs.map((tab) => {
          const active = tab.id === activeId;
          const closable = tab.closable ?? Boolean(onClose);
          return (
            <div
              key={tab.id}
              className="neko-workbench-editor-tab"
              data-active={active ? 'true' : 'false'}
              draggable={Boolean(onReorder) && !tab.disabled}
              role="tab"
              tabIndex={tab.disabled ? -1 : 0}
              aria-selected={active}
              aria-disabled={tab.disabled ? 'true' : undefined}
              title={tab.title ?? tab.label}
              onDragOver={(event) => {
                if (onReorder) event.preventDefault();
              }}
              onDragStart={(event) => handleDragStart(event, tab.id)}
              onDrop={(event) => handleDrop(event, tab.id)}
              onClick={() => {
                if (!tab.disabled) onSelect(tab.id);
              }}
              onKeyDown={(event) => {
                if (tab.disabled || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                onSelect(tab.id);
              }}
            >
              {tab.icon ? (
                <span className="neko-workbench-editor-tab__icon">{tab.icon}</span>
              ) : null}
              <span className="neko-workbench-editor-tab__label">{tab.label}</span>
              {closable && onClose ? (
                <button
                  type="button"
                  aria-label={tab.closeLabel ?? `Close ${tab.label}`}
                  className="neko-workbench-editor-tab__close"
                  title={tab.closeLabel ?? `Close ${tab.label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(tab.id);
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })
      ) : (
        <button
          type="button"
          className="neko-workbench-editor-tab"
          data-active="true"
          role="tab"
          aria-selected
        >
          <span className="neko-workbench-editor-tab__label">{emptyLabel}</span>
        </button>
      )}
    </div>
  );
}

export function WorkbenchPanelHeader({
  className,
  count,
  detail,
  eyebrow,
  title,
}: WorkbenchPanelHeaderProps): React.ReactElement {
  return (
    <header className={cn('neko-workbench-panel-header', className)}>
      <div className="neko-workbench-panel-header__body">
        {eyebrow ? <p className="neko-workbench-panel-header__eyebrow">{eyebrow}</p> : null}
        <h1 className="neko-workbench-panel-header__title">{title}</h1>
        {detail ? <p className="neko-workbench-panel-header__detail">{detail}</p> : null}
      </div>
      {count ? <span className="neko-workbench-panel-header__count">{count}</span> : null}
    </header>
  );
}

export function WorkbenchStatusBar({
  className,
  items,
  label,
}: WorkbenchStatusBarProps): React.ReactElement {
  return (
    <footer aria-label={label} className={cn('neko-workbench-status-bar', className)}>
      {items.map((item, index) => (
        <span key={index} className="neko-workbench-status-bar__item">
          {item}
        </span>
      ))}
    </footer>
  );
}

export function WorkbenchListCard({
  actions,
  badges,
  className,
  description,
  eyebrow,
  id,
  label,
  metadata,
  onSelect,
  selected,
  thumbnail,
}: WorkbenchListCardProps): React.ReactElement {
  return (
    <article
      aria-label={label}
      className={cn('neko-workbench-list-card', className)}
      data-selected={selected ? 'true' : 'false'}
      onClick={() => onSelect(id)}
    >
      {thumbnail ? <div className="neko-workbench-list-card__thumbnail">{thumbnail}</div> : null}
      <div className="neko-workbench-list-card__body">
        <div className="neko-workbench-list-card__title-row">
          <h2>{label}</h2>
          {eyebrow ? <span>{eyebrow}</span> : null}
        </div>
        {description ? (
          <p className="neko-workbench-list-card__description">{description}</p>
        ) : null}
        {metadata?.length ? <WorkbenchInlineMetadata items={metadata} /> : null}
        {badges?.length ? (
          <div className="neko-workbench-list-card__badges">
            {badges.map((badge) => (
              <span
                key={badge.id}
                className="neko-workbench-list-card__badge"
                data-tone={badge.tone ?? 'neutral'}
              >
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {actions?.length ? (
        <div className="neko-workbench-list-card__actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="neko-workbench-list-card__action"
              onClick={(event) => {
                event.stopPropagation();
                action.onClick();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function WorkbenchThumbnailStrip({
  className,
  count,
  items,
  label,
  onSelect,
  title,
}: WorkbenchThumbnailStripProps): React.ReactElement {
  return (
    <section aria-label={label} className={cn('neko-workbench-thumbnail-strip', className)}>
      <header className="neko-workbench-thumbnail-strip__header">
        <span>{title}</span>
        {count ? <strong>{count}</strong> : null}
      </header>
      <div className="neko-workbench-thumbnail-strip__grid">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="neko-workbench-thumbnail-strip__item"
            data-selected={item.selected ? 'true' : 'false'}
            title={item.title ?? item.label}
            onClick={() => onSelect(item.id)}
          >
            <span className="neko-workbench-thumbnail-strip__preview">{item.preview}</span>
            <strong>{item.label}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function WorkbenchInlineMetadata({
  items,
}: {
  readonly items: readonly ReactNode[];
}): React.ReactElement {
  return (
    <dl className="neko-workbench-inline-metadata">
      {items.map((item, index) => (
        <div key={index}>
          <dt>Metadata</dt>
          <dd>{item}</dd>
        </div>
      ))}
    </dl>
  );
}
