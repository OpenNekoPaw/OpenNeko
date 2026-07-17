import { useMemo, type ReactNode } from 'react';
import type { CanvasData, CanvasSubsystemId } from '@neko/shared';
import { CloseIcon } from '@neko/ui/icons';
import { Switch } from '@neko/ui/primitives';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import { t } from '../../i18n';

export interface CanvasSettingsPanelProps {
  canvasData: CanvasData;
  viewportZoom: number;
  nodeTypeSummary: Readonly<Record<string, number>>;
  activeSubsystemIds: readonly CanvasSubsystemId[];
  isGridVisible: boolean;
  onGridVisibleChange: (visible: boolean) => void;
  isHudVisible: boolean;
  onHudVisibleChange: (visible: boolean) => void;
  onClose: () => void;
}

export function CanvasSettingsPanel({
  canvasData,
  viewportZoom,
  nodeTypeSummary,
  activeSubsystemIds,
  isGridVisible,
  onGridVisibleChange,
  isHudVisible,
  onHudVisibleChange,
  onClose,
}: CanvasSettingsPanelProps) {
  const nodeTypeSummaryText = useMemo(
    () => formatNodeTypeSummary(nodeTypeSummary),
    [nodeTypeSummary],
  );
  const activeSubsystemText =
    activeSubsystemIds.length > 0 ? activeSubsystemIds.join(', ') : t('settings.none');
  const overviewItems: readonly InfoGridItem[] = [
    {
      label: t('settings.linkedProject'),
      value: canvasData.linkedProject ?? t('settings.none'),
    },
    {
      label: t('settings.relatedBoards'),
      value: String(canvasData.relatedBoards?.length ?? 0),
    },
    {
      label: t('settings.playback'),
      value: canvasData.playback ? t('settings.enabled') : t('settings.disabled'),
    },
    {
      label: t('settings.projected'),
      value: canvasData.projected ? t('settings.enabled') : t('settings.disabled'),
    },
    { label: t('settings.activeSubsystems'), value: activeSubsystemText },
    { label: t('settings.nodeTypes'), value: nodeTypeSummaryText },
  ];

  return (
    <section
      id="canvas-settings-panel"
      aria-labelledby="canvas-settings-panel-title"
      className="pointer-events-auto absolute bottom-4 left-16 z-30 w-[340px] max-w-[calc(100%-5rem)] overflow-hidden rounded-lg text-xs"
      role="dialog"
      {...getKeyboardBoundaryMetadata({
        scope: 'property-panel',
        ownerId: 'canvas-settings-panel',
        priority: 25,
        ownedKeys: [
          'Enter',
          'Escape',
          'Space',
          'Tab',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
        ],
      })}
      style={{
        backgroundColor: 'var(--toolbar-bg)',
        border: '1px solid var(--toolbar-border)',
        boxShadow: 'var(--neko-shadow-lg)',
        color: 'var(--toolbar-fg)',
      }}
    >
      <header
        className="flex items-start gap-3 px-3 py-2.5"
        style={{
          borderBottom: '1px solid var(--toolbar-border)',
          backgroundColor: 'var(--node-header-bg)',
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2
              id="canvas-settings-panel-title"
              className="min-w-0 flex-1 truncate text-[13px] font-semibold"
            >
              {t('settings.title')}
            </h2>
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: 'var(--control-active)',
                color: 'var(--toolbar-fg)',
              }}
            >
              {canvasData.version}
            </span>
          </div>
          <p
            className="mt-0.5 truncate text-[11px]"
            style={{ color: 'var(--toolbar-fg-secondary)' }}
            title={canvasData.name}
          >
            {canvasData.name}
          </p>
        </div>
        <button
          type="button"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 hover:bg-[var(--control-hover-bg)] focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)]"
          style={{ color: 'var(--toolbar-fg-secondary)' }}
          aria-label={t('settings.close')}
          onClick={onClose}
        >
          <CloseIcon size={14} />
        </button>
      </header>

      <div
        className="grid grid-cols-3"
        style={{
          borderBottom: '1px solid var(--toolbar-border)',
          backgroundColor: 'var(--control-bg)',
        }}
      >
        <SummaryMetric label={t('settings.nodes')} value={String(canvasData.nodes.length)} />
        <SummaryMetric
          label={t('settings.connections')}
          value={String(canvasData.connections.length)}
        />
        <SummaryMetric
          label={t('settings.zoom')}
          value={`${Math.round(viewportZoom * 100)}%`}
          isLast
        />
      </div>

      <div className="max-h-[min(460px,calc(100vh-9rem))] overflow-y-auto px-3 py-2">
        <SettingsSection title={t('settings.overview')}>
          <InfoGrid items={overviewItems} />
        </SettingsSection>

        <SettingsSection title={t('settings.view')}>
          <SettingSwitch
            checked={isGridVisible}
            id="canvas-settings-grid-visible"
            label={t('settings.gridVisible')}
            onCheckedChange={onGridVisibleChange}
          />
          <SettingSwitch
            checked={isHudVisible}
            id="canvas-settings-hud-visible"
            label={t('settings.hudVisible')}
            onCheckedChange={onHudVisibleChange}
          />
        </SettingsSection>
      </div>
    </section>
  );
}

interface InfoGridItem {
  label: string;
  value: string;
}

function SettingsSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section
      className="grid gap-1.5 py-2 first:pt-0"
      style={{ borderTop: '1px solid var(--toolbar-border)' }}
    >
      <h3
        className="text-[10px] font-semibold uppercase tracking-normal"
        style={{ color: 'var(--toolbar-fg-secondary)' }}
      >
        {title}
      </h3>
      <div className="grid gap-1">{children}</div>
    </section>
  );
}

function InfoGrid({ items }: { items: readonly InfoGridItem[] }) {
  return (
    <dl className="grid gap-0.5">
      {items.map((item) => (
        <div
          key={item.label}
          className="grid min-w-0 grid-cols-[104px_minmax(0,1fr)] items-baseline gap-3 py-0.5"
        >
          <dt className="truncate" style={{ color: 'var(--toolbar-fg-secondary)' }}>
            {item.label}
          </dt>
          <dd className="truncate text-right font-medium" title={item.value}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryMetric({ isLast = false, label, value }: InfoGridItem & { isLast?: boolean }) {
  return (
    <div
      className="min-w-0 px-3 py-2"
      style={{ borderRight: isLast ? undefined : '1px solid var(--toolbar-border)' }}
    >
      <div className="truncate text-[10px]" style={{ color: 'var(--toolbar-fg-secondary)' }}>
        {label}
      </div>
      <div className="truncate text-[13px] font-semibold" title={value}>
        {value}
      </div>
    </div>
  );
}

function SettingSwitch({
  checked,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-1">
      <Switch
        checked={checked}
        className="min-w-0 flex-1"
        id={id}
        label={label}
        onCheckedChange={onCheckedChange}
      />
      <span className="shrink-0 text-[11px]" style={{ color: 'var(--toolbar-fg-secondary)' }}>
        {checked ? t('settings.enabled') : t('settings.disabled')}
      </span>
    </div>
  );
}

function formatNodeTypeSummary(summary: Readonly<Record<string, number>>): string {
  const entries = Object.entries(summary).filter(([, count]) => count > 0);
  if (entries.length === 0) return t('settings.none');
  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `${type} ${count}`)
    .join(' / ');
}
