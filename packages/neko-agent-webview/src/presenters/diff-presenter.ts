import type { DiffLine, DiffStats } from '@neko/shared';
import type { CodeDiff } from '@neko-agent/types';

export type DiffBlockTone = 'default' | 'success' | 'danger';
export type DiffBlockOpacity = 'default' | 'muted';
export type DiffBadgeTone = 'success' | 'danger';
export type DiffLineTone = 'add' | 'remove' | 'context';
export type DiffLineMarker = '+' | '-' | ' ';

export interface DiffBadgeProjection {
  tone: DiffBadgeTone;
  labelKey: 'chat.diff.accepted' | 'chat.diff.rejected';
}

export interface DiffBlockUiProjection {
  fileName: string;
  language: string;
  stats: DiffStats;
  tone: DiffBlockTone;
  opacity: DiffBlockOpacity;
  badge: DiffBadgeProjection | null;
  showActions: boolean;
}

export interface DiffLineUiProjection {
  line: DiffLine;
  tone: DiffLineTone;
  marker: DiffLineMarker;
  showOldLineNumber: boolean;
  showNewLineNumber: boolean;
}

export interface DiffBlockProjectionInput {
  diff: CodeDiff;
  stats: DiffStats;
  canAccept?: boolean;
  canReject?: boolean;
}

export function projectDiffBlockUiState(input: DiffBlockProjectionInput): DiffBlockUiProjection {
  return {
    fileName: getDiffFileName(input.diff.filePath),
    language: input.diff.language || getDiffLanguageFromPath(input.diff.filePath),
    stats: input.stats,
    tone: projectDiffBlockTone(input.diff.status),
    opacity: input.diff.status === 'rejected' ? 'muted' : 'default',
    badge: projectDiffBadge(input.diff.status),
    showActions:
      input.diff.status === 'pending' && (input.canAccept === true || input.canReject === true),
  };
}

function projectDiffBlockTone(status: CodeDiff['status']): DiffBlockTone {
  switch (status) {
    case 'accepted':
      return 'success';
    case 'rejected':
      return 'danger';
    case 'pending':
      return 'default';
  }
}

function projectDiffBadge(status: CodeDiff['status']): DiffBadgeProjection | null {
  switch (status) {
    case 'accepted':
      return { tone: 'success', labelKey: 'chat.diff.accepted' };
    case 'rejected':
      return { tone: 'danger', labelKey: 'chat.diff.rejected' };
    case 'pending':
      return null;
  }
}

function projectDiffLineUi(line: DiffLine): DiffLineUiProjection {
  return {
    line,
    tone: projectDiffLineTone(line.type),
    marker: projectDiffLineMarker(line.type),
    showOldLineNumber: Boolean(line.oldLineNum),
    showNewLineNumber: Boolean(line.newLineNum),
  };
}

export function projectDiffLinesUi(lines: readonly DiffLine[]): DiffLineUiProjection[] {
  return lines.map(projectDiffLineUi);
}

function projectDiffLineTone(type: DiffLine['type']): DiffLineTone {
  switch (type) {
    case 'add':
      return 'add';
    case 'remove':
      return 'remove';
    case 'context':
      return 'context';
  }
}

function projectDiffLineMarker(type: DiffLine['type']): DiffLineMarker {
  switch (type) {
    case 'add':
      return '+';
    case 'remove':
      return '-';
    case 'context':
      return ' ';
  }
}

function getDiffFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

function getDiffLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return DIFF_LANGUAGE_BY_EXTENSION[ext] ?? 'text';
}

const DIFF_LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  css: 'css',
  scss: 'scss',
  html: 'html',
  xml: 'xml',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
};
