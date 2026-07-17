import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  SendIcon,
  WarningIcon,
} from '@neko/ui/icons';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import { t } from '../../i18n';
import type {
  RouteStoryboardMatrixCell,
  RouteStoryboardMatrixContainerGroup,
  RouteStoryboardMatrixFamily,
  RouteStoryboardMatrixPlayableCell,
  RouteStoryboardMatrixRow,
  RouteStoryboardMatrixSummaryCell,
  RouteStoryboardMatrixViewModel,
} from './routeStoryboardMatrix';

export interface RouteStoryboardMatrixProps {
  readonly matrix: RouteStoryboardMatrixViewModel;
  readonly selectedRouteId?: string;
  readonly currentUnitId?: string;
  readonly focusedCellId?: string;
  readonly runtimeDiagnostics?: readonly string[];
  readonly onSelectRoute: (row: RouteStoryboardMatrixRow) => void;
  readonly onSelectCell: (cell: RouteStoryboardMatrixPlayableCell) => void;
  readonly onSelectSummaryCell?: (cell: RouteStoryboardMatrixSummaryCell) => void;
  readonly onFocusCell?: (cell: RouteStoryboardMatrixCell) => void;
  readonly onClearFocus?: () => void;
  readonly onSelectColumn: (columnId: string) => void;
  readonly onSelectFamily: (family: RouteStoryboardMatrixFamily) => void;
  readonly onToggleContainerFold: (container: RouteStoryboardMatrixContainerGroup) => void;
  readonly onSendToCut: (row: RouteStoryboardMatrixRow) => void;
  readonly onFocus?: () => void;
}

export function RouteStoryboardMatrix({
  matrix,
  selectedRouteId,
  currentUnitId,
  focusedCellId,
  runtimeDiagnostics = [],
  onSelectRoute,
  onSelectCell,
  onSelectSummaryCell,
  onFocusCell,
  onClearFocus,
  onSelectColumn,
  onSelectFamily,
  onToggleContainerFold,
  onSendToCut,
  onFocus,
}: RouteStoryboardMatrixProps) {
  const [localFocusedCellId, setLocalFocusedCellId] = useState<string | undefined>();
  const selectedRoute =
    matrix.rows.find((row) => row.routeId === selectedRouteId) ?? matrix.rows[0];
  const effectiveFocusedCellId =
    focusedCellId ??
    localFocusedCellId ??
    resolveDefaultFocusedCellId(matrix, currentUnitId, selectedRoute?.routeId);
  const diagnosticMessages = useMemo(
    () => [...runtimeDiagnostics, ...matrix.diagnostics.map((diagnostic) => diagnostic.message)],
    [matrix.diagnostics, runtimeDiagnostics],
  );
  const visibleUnitCount = useMemo(
    () =>
      new Set(
        matrix.rows.flatMap((row) =>
          row.cells.flatMap((cell) => (cell.kind === 'playable' ? [cell.unitId] : [])),
        ),
      ).size,
    [matrix.rows],
  );
  const routeSummary = t('playback.matrix.summary', {
    rows: matrix.rows.length,
    columns: matrix.columns.length,
    durationRange: formatRouteDurationRange(matrix.rows),
  });
  const containerSummary = t('playback.matrix.containerCount', {
    count: matrix.containerGroups.length,
  });
  const durationRange = useMemo(() => formatRouteDurationRange(matrix.rows), [matrix.rows]);

  const focusCell = (cell: RouteStoryboardMatrixCell) => {
    setLocalFocusedCellId(cell.id);
    onFocusCell?.(cell);
  };
  const activateCell = (cell: RouteStoryboardMatrixCell | undefined) => {
    if (!cell) return;
    focusCell(cell);
    if (cell.kind === 'playable') {
      onSelectCell(cell);
      return;
    }
    if (cell.kind === 'summary') {
      onSelectSummaryCell?.(cell);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const handled = handleMatrixKeyboard({
      event,
      matrix,
      focusedCellId: effectiveFocusedCellId,
      onActivateCell: activateCell,
      onFocusCell: focusCell,
      onSelectColumn,
      onClearFocus: () => {
        setLocalFocusedCellId(undefined);
        onClearFocus?.();
      },
    });
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <div
      className="canvas-route-storyboard-matrix"
      data-testid="canvas-route-storyboard-matrix"
      data-row-count={matrix.rows.length}
      data-column-count={matrix.columns.length}
      role="grid"
      aria-label={t('playback.matrix.gridLabel', {
        rows: matrix.rows.length,
        columns: matrix.columns.length,
      })}
      aria-rowcount={matrix.rows.length}
      aria-colcount={matrix.columns.length}
      tabIndex={0}
      {...getKeyboardBoundaryMetadata({
        scope: 'media-preview',
        ownerId: 'canvas-route-storyboard-matrix',
        priority: 25,
        ownedKeys: ['Enter', 'Escape', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'],
      })}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
    >
      <div className="canvas-route-storyboard-matrix-toolbar">
        <div className="canvas-route-storyboard-matrix-heading">
          <div className="canvas-route-storyboard-matrix-title">
            <span>{t('playback.matrix.title')}</span>
            <small>{t('playback.matrix.previewOnly')}</small>
          </div>
          <div className="canvas-route-storyboard-matrix-stats" aria-label={routeSummary}>
            <MatrixStat value={matrix.rows.length} label={t('playback.matrix.statRoutes')} />
            <MatrixStat value={matrix.columns.length} label={t('playback.matrix.statSteps')} />
            <MatrixStat value={visibleUnitCount} label={t('playback.matrix.statVisibleUnits')} />
            <MatrixStat value={durationRange} label={t('playback.matrix.statDurationRange')} />
          </div>
        </div>
        <div
          className="canvas-route-storyboard-matrix-families"
          role="tablist"
          aria-label={t('playback.matrix.familyTabs')}
        >
          {matrix.families.map((family) => (
            <button
              key={family.id}
              type="button"
              className="canvas-route-storyboard-matrix-family"
              data-active={family.id === matrix.activeRouteFamilyId ? 'true' : 'false'}
              title={formatFamilyTitle(family)}
              role="tab"
              aria-selected={family.id === matrix.activeRouteFamilyId}
              aria-label={formatFamilyTitle(family)}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => onSelectFamily(family)}
            >
              <span>{formatFamilyLabel(family)}</span>
              <small>{family.visibleRouteIds.length}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="canvas-route-storyboard-matrix-grid" role="presentation">
        <div className="canvas-route-storyboard-matrix-header" role="presentation">
          <div className="canvas-route-storyboard-matrix-corner" role="rowheader">
            <span>{t('playback.matrix.routes')}</span>
            <small>{containerSummary}</small>
          </div>
          <div className="canvas-route-storyboard-matrix-header-columns" role="presentation">
            <div className="canvas-route-storyboard-matrix-container-row" role="row">
              {matrix.containerGroups.map((container) => (
                <button
                  key={container.id}
                  type="button"
                  className="canvas-route-storyboard-matrix-container"
                  data-folded={container.folded ? 'true' : 'false'}
                  style={{ gridColumn: `span ${container.slotCount}` }}
                  title={formatContainerTitle(container)}
                  role="columnheader"
                  aria-colspan={container.slotCount}
                  aria-label={formatContainerTitle(container)}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => onToggleContainerFold(container)}
                >
                  {container.folded ? (
                    <ChevronRightIcon size={13} />
                  ) : (
                    <ChevronDownIcon size={13} />
                  )}
                  <span>{formatContainerLabel(container)}</span>
                  <small>
                    {t('playback.matrix.containerUnitsShort', { count: container.unitCount })}
                  </small>
                </button>
              ))}
            </div>
            <div className="canvas-route-storyboard-matrix-step-row" role="row">
              {matrix.columns.map((column, index) => (
                <button
                  key={column.id}
                  type="button"
                  className="canvas-route-storyboard-matrix-step"
                  title={t('playback.matrix.stepTitle', {
                    index: index + 1,
                    title: formatMatrixDisplayLabel(column.title),
                  })}
                  role="columnheader"
                  aria-colindex={index + 1}
                  aria-label={t('playback.matrix.stepTitle', {
                    index: index + 1,
                    title: formatMatrixDisplayLabel(column.title),
                  })}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => onSelectColumn(column.id)}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="canvas-route-storyboard-matrix-body" role="presentation">
          {matrix.rows.map((row) => (
            <MatrixRow
              key={row.id}
              row={row}
              selected={row.routeId === selectedRoute?.routeId}
              currentUnitId={currentUnitId}
              focusedCellId={effectiveFocusedCellId}
              onSelectRoute={onSelectRoute}
              onSelectCell={onSelectCell}
              onSelectSummaryCell={onSelectSummaryCell}
              onFocusCell={focusCell}
              onSendToCut={onSendToCut}
            />
          ))}
        </div>
      </div>

      {diagnosticMessages.length > 0 ? (
        <div className="canvas-route-storyboard-matrix-diagnostics" role="status">
          <WarningIcon size={13} />
          <span>{diagnosticMessages.slice(0, 2).join(' · ')}</span>
        </div>
      ) : null}
    </div>
  );
}

function MatrixStat({ value, label }: { readonly value: number | string; readonly label: string }) {
  return (
    <span className="canvas-route-storyboard-matrix-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}

function MatrixRow({
  row,
  selected,
  currentUnitId,
  focusedCellId,
  onSelectRoute,
  onSelectCell,
  onSelectSummaryCell,
  onFocusCell,
  onSendToCut,
}: {
  readonly row: RouteStoryboardMatrixRow;
  readonly selected: boolean;
  readonly currentUnitId?: string;
  readonly focusedCellId?: string;
  readonly onSelectRoute: (row: RouteStoryboardMatrixRow) => void;
  readonly onSelectCell: (cell: RouteStoryboardMatrixPlayableCell) => void;
  readonly onSelectSummaryCell?: (cell: RouteStoryboardMatrixSummaryCell) => void;
  readonly onFocusCell: (cell: RouteStoryboardMatrixCell) => void;
  readonly onSendToCut: (row: RouteStoryboardMatrixRow) => void;
}) {
  const displayRowTitle = formatMatrixDisplayLabel(row.title);
  const routeTitle = t('playback.matrix.rowTitle', {
    title: displayRowTitle,
    units: row.unitIds.length,
    duration: formatDurationMs(row.totalDurationMs),
  });

  return (
    <div
      className="canvas-route-storyboard-matrix-row"
      data-selected={selected ? 'true' : 'false'}
      role="row"
      aria-selected={selected}
    >
      <div className="canvas-route-storyboard-matrix-row-header">
        <button
          type="button"
          className="canvas-route-storyboard-matrix-row-button"
          title={routeTitle}
          aria-label={routeTitle}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => onSelectRoute(row)}
        >
          <span>{displayRowTitle}</span>
          <small>
            <ClockIcon size={11} />
            {t('playback.matrix.rowMeta', {
              units: row.unitIds.length,
              duration: formatDurationMs(row.totalDurationMs),
            })}
          </small>
        </button>
        <button
          type="button"
          className="canvas-route-storyboard-matrix-send"
          title={t('playback.matrix.sendToCut')}
          aria-label={t('playback.matrix.sendRouteToCut', { title: displayRowTitle })}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onSendToCut(row);
          }}
        >
          <SendIcon size={13} />
        </button>
      </div>
      <div className="canvas-route-storyboard-matrix-cells">
        {row.cells.map((cell) => (
          <MatrixCell
            key={cell.id}
            cell={cell}
            current={cell.kind === 'playable' && cell.unitId === currentUnitId}
            focused={cell.id === focusedCellId}
            onSelectCell={onSelectCell}
            onSelectSummaryCell={onSelectSummaryCell}
            onFocusCell={onFocusCell}
          />
        ))}
      </div>
    </div>
  );
}

function MatrixCell({
  cell,
  current,
  focused,
  onSelectCell,
  onSelectSummaryCell,
  onFocusCell,
}: {
  readonly cell: RouteStoryboardMatrixCell;
  readonly current: boolean;
  readonly focused: boolean;
  readonly onSelectCell: (cell: RouteStoryboardMatrixPlayableCell) => void;
  readonly onSelectSummaryCell?: (cell: RouteStoryboardMatrixSummaryCell) => void;
  readonly onFocusCell: (cell: RouteStoryboardMatrixCell) => void;
}) {
  if (cell.kind === 'summary') {
    const displayLabel = formatMatrixDisplayLabel(cell.label);
    const title = t('playback.matrix.summaryCellTitle', {
      label: displayLabel,
      count: cell.playableCount,
      duration: formatDurationMs(cell.durationMs),
    });

    return (
      <button
        type="button"
        className="canvas-route-storyboard-matrix-cell canvas-route-storyboard-matrix-cell-summary"
        data-focused={focused ? 'true' : 'false'}
        role="gridcell"
        aria-colindex={cell.columnStart + 1}
        aria-colspan={cell.columnSpan}
        tabIndex={-1}
        style={{ gridColumn: `span ${cell.columnSpan}` }}
        title={title}
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => {
          onFocusCell(cell);
          onSelectSummaryCell?.(cell);
        }}
      >
        <span>{displayLabel}</span>
        <small>
          {t('playback.matrix.foldedSummary', {
            count: cell.playableCount,
            duration: formatDurationMs(cell.durationMs),
          })}
        </small>
      </button>
    );
  }
  if (cell.kind === 'empty') {
    return (
      <div
        className="canvas-route-storyboard-matrix-cell canvas-route-storyboard-matrix-cell-empty"
        data-focused={focused ? 'true' : 'false'}
        role="gridcell"
        aria-colindex={cell.columnStart + 1}
        tabIndex={-1}
        title={t('playback.matrix.emptyCell')}
        aria-label={t('playback.matrix.emptyCell')}
      >
        <span>{t('playback.matrix.emptyCellShort')}</span>
      </div>
    );
  }

  const displayLabel = formatMatrixDisplayLabel(cell.label);
  const cellTitle = t('playback.matrix.cellTitle', {
    label: displayLabel,
    kind: formatUnitKind(cell.unitKind),
    timing: cell.sourceRange
      ? formatSourceRange(cell.sourceRange)
      : t('playback.matrix.routeTiming', {
          range: formatTimelineRange(cell.startMs, cell.endMs),
          duration: formatDurationMs(cell.durationMs),
        }),
    state: formatMediaState(cell.mediaState),
  });
  const timingLabel = cell.sourceRange
    ? t('playback.matrix.sourceRangeShort', {
        range: formatTimelineRange(cell.sourceRange.startMs, cell.sourceRange.endMs),
        duration: formatDurationMs(cell.sourceRange.durationMs),
      })
    : formatDurationMs(cell.durationMs);

  return (
    <button
      type="button"
      className="canvas-route-storyboard-matrix-cell canvas-route-storyboard-matrix-cell-playable"
      data-current={current ? 'true' : 'false'}
      data-highlight={cell.highlight ? 'true' : 'false'}
      data-media-state={cell.mediaState}
      data-focused={focused ? 'true' : 'false'}
      role="gridcell"
      aria-selected={current}
      aria-colindex={cell.columnStart + 1}
      tabIndex={-1}
      title={cellTitle}
      aria-label={cellTitle}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={() => {
        onFocusCell(cell);
        onSelectCell(cell);
      }}
    >
      <span
        className="canvas-route-storyboard-matrix-thumb"
        data-has-image={cell.thumbnail ? 'true' : 'false'}
      >
        {cell.thumbnail ? (
          <img
            src={cell.thumbnail.src}
            alt={formatMatrixDisplayLabel(cell.thumbnail.alt)}
            draggable={false}
          />
        ) : (
          cell.label.slice(0, 1).toUpperCase()
        )}
      </span>
      <span className="canvas-route-storyboard-matrix-cell-title">{displayLabel}</span>
      <span className="canvas-route-storyboard-matrix-cell-meta">
        <span>{formatUnitKind(cell.unitKind)}</span>
        <span>{timingLabel}</span>
      </span>
    </button>
  );
}

function formatFamilyLabel(family: RouteStoryboardMatrixFamily): string {
  return family.id === 'family:primary'
    ? t('playback.matrix.primaryRoutes')
    : formatMatrixDisplayLabel(family.title);
}

function formatFamilyTitle(family: RouteStoryboardMatrixFamily): string {
  return t('playback.matrix.familyTitle', {
    title: formatFamilyLabel(family),
    count: family.visibleRouteIds.length,
  });
}

function formatContainerLabel(container: RouteStoryboardMatrixContainerGroup): string {
  return container.id === 'container:__root__'
    ? t('playback.matrix.rootContainer')
    : formatMatrixDisplayLabel(container.title);
}

function formatMatrixDisplayLabel(label: string): string {
  const defaultShotMatch = /^Shot\s+(\d+)$/i.exec(label.trim());
  if (defaultShotMatch?.[1]) {
    return t('playback.label.defaultShot', { number: defaultShotMatch[1] });
  }
  return label;
}

function formatContainerTitle(container: RouteStoryboardMatrixContainerGroup): string {
  return t('playback.matrix.containerTitle', {
    title: formatContainerLabel(container),
    units: container.unitCount,
    slots: container.slotCount,
  });
}

function formatUnitKind(kind: RouteStoryboardMatrixPlayableCell['unitKind']): string {
  switch (kind) {
    case 'scene':
      return t('playback.kind.scene');
    case 'shot':
      return t('playback.kind.shot');
    case 'media':
      return t('playback.kind.media');
    case 'container':
      return t('playback.kind.container');
    case 'narrative':
      return t('playback.kind.narrative');
    case 'node':
    default:
      return t('playback.kind.node');
  }
}

function formatMediaState(state: RouteStoryboardMatrixPlayableCell['mediaState']): string {
  switch (state) {
    case 'playable':
      return t('playback.matrix.mediaStatePlayable');
    case 'missing':
      return t('playback.matrix.mediaStateMissing');
    case 'metadata-only':
      return t('playback.matrix.mediaStateMetadataOnly');
    default:
      return state satisfies never;
  }
}

function handleMatrixKeyboard({
  event,
  matrix,
  focusedCellId,
  onActivateCell,
  onFocusCell,
  onSelectColumn,
  onClearFocus,
}: {
  readonly event: KeyboardEvent<HTMLDivElement>;
  readonly matrix: RouteStoryboardMatrixViewModel;
  readonly focusedCellId: string | undefined;
  readonly onActivateCell: (cell: RouteStoryboardMatrixCell | undefined) => void;
  readonly onFocusCell: (cell: RouteStoryboardMatrixCell) => void;
  readonly onSelectColumn: (columnId: string) => void;
  readonly onClearFocus: () => void;
}): boolean {
  const focus = findCellPosition(matrix, focusedCellId);
  switch (event.key) {
    case 'ArrowLeft':
      focusRelativeCell(matrix, focus, 0, -1, onFocusCell);
      return true;
    case 'ArrowRight':
      focusRelativeCell(matrix, focus, 0, 1, onFocusCell);
      return true;
    case 'ArrowUp':
      focusRelativeCell(matrix, focus, -1, 0, onFocusCell);
      return true;
    case 'ArrowDown':
      focusRelativeCell(matrix, focus, 1, 0, onFocusCell);
      return true;
    case 'Enter':
    case ' ':
      onActivateCell(focus ? matrix.rows[focus.rowIndex]?.cells[focus.cellIndex] : undefined);
      return true;
    case 'Escape':
      onClearFocus();
      event.currentTarget.blur();
      return true;
    default:
      if (event.key >= '1' && event.key <= '9') {
        const column = matrix.columns[Number(event.key) - 1];
        if (!column) return true;
        onSelectColumn(column.id);
        return true;
      }
      return false;
  }
}

function focusRelativeCell(
  matrix: RouteStoryboardMatrixViewModel,
  current: MatrixCellPosition | undefined,
  rowDelta: number,
  cellDelta: number,
  onFocusCell: (cell: RouteStoryboardMatrixCell) => void,
): void {
  const fallback = current ?? findCellPosition(matrix, undefined);
  if (!fallback) return;
  const rowIndex = clampIndex(fallback.rowIndex + rowDelta, matrix.rows.length);
  const row = matrix.rows[rowIndex];
  if (!row || row.cells.length === 0) return;
  const cellIndex = clampIndex(fallback.cellIndex + cellDelta, row.cells.length);
  const cell = row.cells[cellIndex];
  if (cell) {
    onFocusCell(cell);
  }
}

interface MatrixCellPosition {
  readonly rowIndex: number;
  readonly cellIndex: number;
}

function findCellPosition(
  matrix: RouteStoryboardMatrixViewModel,
  cellId: string | undefined,
): MatrixCellPosition | undefined {
  for (let rowIndex = 0; rowIndex < matrix.rows.length; rowIndex += 1) {
    const row = matrix.rows[rowIndex];
    if (!row) continue;
    const cellIndex = cellId
      ? row.cells.findIndex((cell) => cell.id === cellId)
      : row.cells.findIndex((cell) => cell.kind !== 'empty');
    if (cellIndex >= 0) {
      return { rowIndex, cellIndex };
    }
  }
  return undefined;
}

function resolveDefaultFocusedCellId(
  matrix: RouteStoryboardMatrixViewModel,
  currentUnitId: string | undefined,
  selectedRouteId: string | undefined,
): string | undefined {
  const currentCell = currentUnitId
    ? matrix.rows
        .flatMap((row) => row.cells)
        .find((cell) => cell.kind === 'playable' && cell.unitId === currentUnitId)
    : undefined;
  if (currentCell) return currentCell.id;
  const selectedRoute = selectedRouteId
    ? matrix.rows.find((row) => row.routeId === selectedRouteId)
    : undefined;
  return (
    selectedRoute?.cells.find((cell) => cell.kind !== 'empty')?.id ??
    matrix.rows[0]?.cells.find((cell) => cell.kind !== 'empty')?.id ??
    matrix.rows[0]?.cells[0]?.id
  );
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

function formatRouteDurationRange(rows: readonly RouteStoryboardMatrixRow[]): string {
  const durations = rows
    .map((row) => row.totalDurationMs)
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  if (durations.length === 0) return formatDurationMs(0);
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  if (min === max) return formatDurationMs(max);
  return `${formatDurationMs(min)}-${formatDurationMs(max)}`;
}

function formatSourceRange(range: RouteStoryboardMatrixPlayableCell['sourceRange']): string {
  if (!range) return '';
  return t('playback.matrix.sourceRangeShort', {
    range: formatTimelineRange(range.startMs, range.endMs),
    duration: formatDurationMs(range.durationMs),
  });
}

function formatTimelineRange(startMs: number, endMs: number): string {
  return `${formatTimelinePointMs(startMs)}-${formatTimelinePointMs(endMs)}`;
}

function formatTimelinePointMs(ms: number): string {
  const totalTenths = Math.max(0, Math.round(ms / 100));
  const totalSeconds = Math.floor(totalTenths / 10);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = totalTenths % 10;
  const base = `${minutes}:${String(seconds).padStart(2, '0')}`;
  if (tenths === 0) return base;
  return `${base}.${tenths}`;
}

function formatDurationMs(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
