/**
 * TimelineDiffViewer Component
 *
 * Renders timeline (JVI project) diff results:
 * - Summary statistics (tracks/elements added/removed/modified)
 * - Project metadata comparison
 * - Collapsible track change list with element details
 * - Lazy-loaded element thumbnails via mediaDiff:inspectElement
 */

import { memo, useState, useCallback } from 'react';
import type {
  TimelineDiffDetails,
  TrackChange,
  ElementChange,
  PropertyChange,
  TimelineChangeType,
} from '@neko/shared';
import type { TimelineDiffViewerProps } from './types';

// =============================================================================
// Constants
// =============================================================================

const CHANGE_TYPE_CONFIG: Record<TimelineChangeType, { label: string; color: string; bg: string }> =
  {
    added: {
      label: 'Added',
      color: 'text-green-400',
      bg: 'bg-green-900/30',
    },
    removed: {
      label: 'Removed',
      color: 'text-red-400',
      bg: 'bg-red-900/30',
    },
    modified: {
      label: 'Modified',
      color: 'text-yellow-400',
      bg: 'bg-yellow-900/30',
    },
    moved: {
      label: 'Moved',
      color: 'text-blue-400',
      bg: 'bg-blue-900/30',
    },
    unchanged: {
      label: 'Unchanged',
      color: 'text-[var(--vscode-descriptionForeground)]',
      bg: 'bg-transparent',
    },
  };

// =============================================================================
// ChangeTypeBadge
// =============================================================================

const ChangeTypeBadge = memo(function ChangeTypeBadge({ type }: { type: TimelineChangeType }) {
  const config = CHANGE_TYPE_CONFIG[type] ?? CHANGE_TYPE_CONFIG.unchanged;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${config.color} ${config.bg}`}
    >
      {config.label}
    </span>
  );
});

// =============================================================================
// SummaryCard
// =============================================================================

interface SummaryCardProps {
  label: string;
  added: number;
  removed: number;
  modified: number;
}

const SummaryCard = memo(function SummaryCard({
  label,
  added,
  removed,
  modified,
}: SummaryCardProps) {
  const total = added + removed + modified;
  return (
    <div className="flex flex-col gap-1 p-3 rounded-lg bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)]">
      <div className="text-xs text-[var(--vscode-descriptionForeground)] uppercase tracking-wider">
        {label}
      </div>
      <div className="text-lg font-semibold text-[var(--vscode-foreground)]">{total} changes</div>
      <div className="flex gap-3 text-xs">
        {added > 0 && <span className="text-green-400">+{added}</span>}
        {removed > 0 && <span className="text-red-400">-{removed}</span>}
        {modified > 0 && <span className="text-yellow-400">~{modified}</span>}
      </div>
    </div>
  );
});

// =============================================================================
// PropertyChangeRow
// =============================================================================

const PropertyChangeRow = memo(function PropertyChangeRow({ change }: { change: PropertyChange }) {
  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  return (
    <div className="flex items-center gap-2 py-1 text-xs font-mono">
      <span className="text-[var(--vscode-descriptionForeground)] min-w-[120px] truncate">
        {change.property}
      </span>
      <span className="text-red-400 line-through truncate max-w-[200px]">
        {formatValue(change.previous)}
      </span>
      <span className="text-[var(--vscode-descriptionForeground)]">→</span>
      <span className="text-green-400 truncate max-w-[200px]">{formatValue(change.current)}</span>
    </div>
  );
});

// =============================================================================
// ElementChangeItem
// =============================================================================

interface ElementChangeItemProps {
  element: ElementChange;
  onInspectElement?: (src: string) => void;
  thumbnailSrc?: string;
}

const ElementChangeItem = memo(function ElementChangeItem({
  element,
  onInspectElement,
  thumbnailSrc,
}: ElementChangeItemProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = (element.propertyChanges && element.propertyChanges.length > 0) || element.src;

  const handleThumbnailRequest = useCallback(() => {
    if (element.src && onInspectElement) {
      onInspectElement(element.src);
    }
  }, [element.src, onInspectElement]);

  return (
    <div className="ml-4 border-l border-[var(--vscode-panel-border)] pl-3 py-1">
      <div
        className={`flex items-center gap-2 ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {hasDetails && (
          <span className="text-xs text-[var(--vscode-descriptionForeground)]">
            {expanded ? '▼' : '▶'}
          </span>
        )}
        <ChangeTypeBadge type={element.changeType} />
        <span className="text-sm text-[var(--vscode-foreground)] truncate">
          {element.elementName}
        </span>
        <span className="text-xs text-[var(--vscode-descriptionForeground)]">
          ({element.elementType})
        </span>
        {element.startTime !== undefined && (
          <span className="text-xs text-[var(--vscode-descriptionForeground)] ml-auto">
            {element.startTime.toFixed(2)}s
            {element.duration !== undefined && ` / ${element.duration.toFixed(2)}s`}
          </span>
        )}
      </div>

      {expanded && (
        <div className="mt-1 ml-4 space-y-1">
          {element.src && (
            <div className="flex items-center gap-2">
              {thumbnailSrc ? (
                <img
                  src={thumbnailSrc}
                  alt={element.elementName}
                  className="w-16 h-12 object-cover rounded border border-[var(--vscode-panel-border)]"
                />
              ) : (
                <button
                  onClick={handleThumbnailRequest}
                  className="text-xs px-2 py-1 rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
                >
                  Load thumbnail
                </button>
              )}
              <span className="text-xs text-[var(--vscode-descriptionForeground)] truncate">
                {element.src}
              </span>
            </div>
          )}
          {element.propertyChanges?.map((pc, i) => (
            <PropertyChangeRow key={`${pc.property}-${i}`} change={pc} />
          ))}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// TrackChangeItem
// =============================================================================

interface TrackChangeItemProps {
  track: TrackChange;
  onInspectElement?: (src: string) => void;
  elementThumbnails?: Map<string, string>;
}

const TrackChangeItem = memo(function TrackChangeItem({
  track,
  onInspectElement,
  elementThumbnails,
}: TrackChangeItemProps) {
  const [expanded, setExpanded] = useState(track.changeType !== 'unchanged');
  const elementCount = track.elementChanges?.length ?? 0;
  const propCount = track.propertyChanges?.length ?? 0;
  const hasDetails = elementCount > 0 || propCount > 0;

  return (
    <div className="border border-[var(--vscode-panel-border)] rounded-lg overflow-hidden">
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] ${
          CHANGE_TYPE_CONFIG[track.changeType]?.bg ?? ''
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xs text-[var(--vscode-descriptionForeground)]">
          {expanded ? '▼' : '▶'}
        </span>
        <ChangeTypeBadge type={track.changeType} />
        <span className="text-sm font-medium text-[var(--vscode-foreground)] truncate">
          {track.trackName}
        </span>
        <span className="text-xs text-[var(--vscode-descriptionForeground)]">
          ({track.trackType})
        </span>
        {hasDetails && (
          <span className="text-xs text-[var(--vscode-descriptionForeground)] ml-auto">
            {elementCount > 0 && `${elementCount} elements`}
            {elementCount > 0 && propCount > 0 && ', '}
            {propCount > 0 && `${propCount} props`}
          </span>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="px-3 py-2 space-y-1 border-t border-[var(--vscode-panel-border)]">
          {track.propertyChanges?.map((pc, i) => (
            <PropertyChangeRow key={`${pc.property}-${i}`} change={pc} />
          ))}
          {track.elementChanges?.map((el) => (
            <ElementChangeItem
              key={el.elementId}
              element={el}
              onInspectElement={onInspectElement}
              thumbnailSrc={el.src ? elementThumbnails?.get(el.src) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// ProjectMetadata
// =============================================================================

const ProjectMetadata = memo(function ProjectMetadata({
  details,
}: {
  details: TimelineDiffDetails;
}) {
  const { project, duration } = details;

  const MetaRow = ({ label, prev, curr }: { label: string; prev: string; curr: string }) => (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-[var(--vscode-descriptionForeground)] min-w-[80px]">{label}</span>
      <span
        className={prev !== curr ? 'text-red-400 line-through' : 'text-[var(--vscode-foreground)]'}
      >
        {prev}
      </span>
      {prev !== curr && (
        <>
          <span className="text-[var(--vscode-descriptionForeground)]">→</span>
          <span className="text-green-400">{curr}</span>
        </>
      )}
    </div>
  );

  return (
    <div className="p-3 rounded-lg bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] space-y-1">
      <div className="text-xs text-[var(--vscode-descriptionForeground)] uppercase tracking-wider mb-2">
        Project
      </div>
      <MetaRow label="Name" prev={project.name.previous} curr={project.name.current} />
      <MetaRow
        label="Resolution"
        prev={`${project.resolution.previous.width}×${project.resolution.previous.height}`}
        curr={`${project.resolution.current.width}×${project.resolution.current.height}`}
      />
      <MetaRow label="FPS" prev={String(project.fps.previous)} curr={String(project.fps.current)} />
      <MetaRow
        label="Duration"
        prev={`${duration.previous.toFixed(2)}s`}
        curr={`${duration.current.toFixed(2)}s`}
      />
    </div>
  );
});

// =============================================================================
// Main TimelineDiffViewer
// =============================================================================

export const TimelineDiffViewer = memo(function TimelineDiffViewer({
  details,
  onInspectElement,
  elementThumbnails,
}: TimelineDiffViewerProps) {
  if (!details) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--vscode-descriptionForeground)]">
        No timeline diff data
      </div>
    );
  }

  const { summary, trackChanges } = details;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          label="Tracks"
          added={summary.tracksAdded}
          removed={summary.tracksRemoved}
          modified={summary.tracksModified}
        />
        <SummaryCard
          label="Elements"
          added={summary.elementsAdded}
          removed={summary.elementsRemoved}
          modified={summary.elementsModified}
        />
      </div>

      {/* Project metadata */}
      <ProjectMetadata details={details} />

      {/* Media source changes note */}
      {summary.mediaSourceChanges > 0 && (
        <div className="text-xs text-yellow-400 px-3 py-2 rounded bg-yellow-900/20 border border-yellow-800/30">
          {summary.mediaSourceChanges} element(s) have changed media sources — click to load
          thumbnails
        </div>
      )}

      {/* Track changes */}
      <div className="space-y-2">
        <div className="text-xs text-[var(--vscode-descriptionForeground)] uppercase tracking-wider">
          Track Changes ({trackChanges.length})
        </div>
        {trackChanges.map((track) => (
          <TrackChangeItem
            key={track.trackId}
            track={track}
            onInspectElement={onInspectElement}
            elementThumbnails={elementThumbnails}
          />
        ))}
        {trackChanges.length === 0 && (
          <div className="text-sm text-[var(--vscode-descriptionForeground)] text-center py-4">
            No track changes detected
          </div>
        )}
      </div>
    </div>
  );
});
