/**
 * DiffBlock Component
 * Displays code diffs with Accept/Reject actions
 * Compact inline design following Claude Code style
 */

import { useState, useMemo, memo } from 'react';
import { computeDiff, computeDiffStats } from '@neko/shared/utils';
import { CodeDiff } from '@neko-agent/types';
import { useTranslation } from '@/i18n/I18nContext';
import {
  projectDiffLinesUi,
  projectDiffBlockUiState,
  type DiffBadgeTone,
  type DiffBlockOpacity,
  type DiffBlockTone,
  type DiffLineTone,
} from '@/presenters/diff-presenter';

interface DiffBlockProps {
  diff: CodeDiff;
  onAccept?: (filePath: string) => void;
  onReject?: (filePath: string) => void;
}

function DiffBlockComponent({ diff, onAccept, onReject }: DiffBlockProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);

  // Compute diff lines
  const diffLines = useMemo(
    () => computeDiff(diff.oldContent, diff.newContent),
    [diff.oldContent, diff.newContent],
  );
  const diffLineProjections = useMemo(() => projectDiffLinesUi(diffLines), [diffLines]);

  const projection = projectDiffBlockUiState({
    diff,
    stats: computeDiffStats(diffLines),
    canAccept: Boolean(onAccept),
    canReject: Boolean(onReject),
  });
  void projection.language; // Reserved for future syntax highlighting

  return (
    <div
      className={`agent-inline-card my-1 ${diffBlockToneClass(
        projection.tone,
      )} ${diffBlockOpacityClass(projection.opacity)}`}
    >
      {/* Header */}
      <div
        className="agent-inline-header flex cursor-pointer items-center gap-2 px-2 py-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand/Collapse icon */}
        <ChevronIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />

        {/* File icon */}
        <FileIcon className="w-3 h-3 text-[var(--agent-fg-secondary)]" />

        {/* File name */}
        <span className="flex-1 truncate font-mono text-[11px] text-[var(--agent-fg)]">
          {projection.fileName}
        </span>

        {/* Stats */}
        <span className="text-[10px] text-[var(--vscode-gitDecoration-addedResourceForeground)]">
          +{projection.stats.added}
        </span>
        <span className="text-[10px] text-[var(--vscode-gitDecoration-deletedResourceForeground)]">
          -{projection.stats.removed}
        </span>

        {/* Status badge */}
        {projection.badge && (
          <span className={`agent-badge ${diffBadgeToneClass(projection.badge.tone)} text-[9px]`}>
            {t(projection.badge.labelKey)}
          </span>
        )}
      </div>

      {/* Diff content */}
      {isExpanded && (
        <>
          <div className="max-h-[300px] overflow-auto w-full">
            <pre className="text-[11px] font-mono leading-tight w-full min-w-0">
              {diffLineProjections.map((lineProjection, idx) => (
                <div key={idx} className={`flex ${diffLineBackgroundClass(lineProjection.tone)}`}>
                  {/* Line numbers */}
                  <span className="w-8 select-none border-r border-[var(--agent-divider)] px-1 text-right text-[10px] text-[var(--agent-fg-secondary)]">
                    {lineProjection.showOldLineNumber ? lineProjection.line.oldLineNum : ''}
                  </span>
                  <span className="w-8 select-none border-r border-[var(--agent-divider)] px-1 text-right text-[10px] text-[var(--agent-fg-secondary)]">
                    {lineProjection.showNewLineNumber ? lineProjection.line.newLineNum : ''}
                  </span>

                  {/* Diff marker */}
                  <span
                    className={`w-4 text-center select-none ${diffLineMarkerClass(
                      lineProjection.tone,
                    )}`}
                  >
                    {lineProjection.marker}
                  </span>

                  {/* Content */}
                  <span
                    className={`flex-1 px-1 whitespace-pre overflow-x-auto ${diffLineTextClass(
                      lineProjection.tone,
                    )}`}
                  >
                    {lineProjection.line.content}
                  </span>
                </div>
              ))}
            </pre>
          </div>

          {/* Action buttons (only for pending status) */}
          {projection.showActions && (
            <div className="flex items-center gap-2 border-t border-[var(--agent-divider)] px-2 py-1.5">
              {onAccept && (
                <button
                  onClick={() => onAccept(diff.filePath)}
                  className="vscode-button flex items-center gap-1 px-2 py-0.5 text-[11px] leading-4"
                >
                  <CheckIcon className="w-3 h-3" />
                  {t('diff.accept')}
                </button>
              )}
              {onReject && (
                <button
                  onClick={() => onReject(diff.filePath)}
                  className="vscode-button vscode-button-secondary flex items-center gap-1 px-2 py-0.5 text-[11px] leading-4"
                >
                  <XIcon className="w-3 h-3" />
                  {t('diff.reject')}
                </button>
              )}
              <span className="flex-1" />
              <span className="text-[10px] text-[var(--agent-fg-secondary)]">{diff.filePath}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const DiffBlock = memo(DiffBlockComponent);

function diffBlockToneClass(tone: DiffBlockTone): string {
  switch (tone) {
    case 'success':
      return 'is-success';
    case 'danger':
      return 'is-danger';
    case 'default':
      return '';
  }
}

function diffBlockOpacityClass(opacity: DiffBlockOpacity): string {
  return opacity === 'muted' ? 'opacity-70' : '';
}

function diffLineBackgroundClass(tone: DiffLineTone): string {
  switch (tone) {
    case 'add':
      return 'bg-[var(--vscode-diffEditor-insertedLineBackground)]';
    case 'remove':
      return 'bg-[var(--vscode-diffEditor-removedLineBackground)]';
    case 'context':
      return '';
  }
}

function diffLineTextClass(tone: DiffLineTone): string {
  switch (tone) {
    case 'add':
      return 'text-[var(--vscode-gitDecoration-addedResourceForeground)]';
    case 'remove':
      return 'text-[var(--vscode-gitDecoration-deletedResourceForeground)]';
    case 'context':
      return 'text-[var(--agent-fg)]';
  }
}

function diffLineMarkerClass(tone: DiffLineTone): string {
  switch (tone) {
    case 'add':
    case 'remove':
      return diffLineTextClass(tone);
    case 'context':
      return 'text-[var(--agent-fg-secondary)]';
  }
}

function diffBadgeToneClass(tone: DiffBadgeTone): string {
  switch (tone) {
    case 'success':
      return 'is-success';
    case 'danger':
      return 'is-danger';
  }
}

// Icons
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
