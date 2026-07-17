import type {
  AgentMessageQueueSnapshot,
  AgentQueuedMessageItem,
  AgentQueuedMessageSource,
} from '@neko-agent/types';

export type TuiQueueRowKind =
  'user-message' | 'task-continuation' | 'subagent-continuation' | 'system-continuation';

export interface TuiQueueRow {
  readonly id: string;
  readonly ordinal: number;
  readonly preview: string;
  readonly kind: TuiQueueRowKind;
  readonly canEdit: boolean;
  readonly canCancel: boolean;
  readonly isPriorityContinuation: boolean;
}

export interface TuiQueuePresentation {
  readonly pendingCount: number;
  readonly rows: readonly TuiQueueRow[];
  readonly hiddenCount: number;
  readonly hasPriorityContinuation: boolean;
}

export interface PresentTuiMessageQueueOptions {
  readonly maxRows?: number;
  readonly maxPreviewCharacters?: number;
}

const DEFAULT_MAX_ROWS = 2;
const DEFAULT_MAX_PREVIEW_CHARACTERS = 72;

export function presentTuiMessageQueue(
  snapshot: AgentMessageQueueSnapshot,
  options: PresentTuiMessageQueueOptions = {},
): TuiQueuePresentation {
  if (snapshot.pendingCount !== snapshot.items.length) {
    throw new Error(
      `Message queue snapshot count mismatch: pendingCount=${snapshot.pendingCount}, items=${snapshot.items.length}`,
    );
  }

  const maxRows = normalizePositiveInteger(options.maxRows, DEFAULT_MAX_ROWS, 'maxRows');
  const maxPreviewCharacters = normalizePositiveInteger(
    options.maxPreviewCharacters,
    DEFAULT_MAX_PREVIEW_CHARACTERS,
    'maxPreviewCharacters',
  );
  const visibleItems = snapshot.items.slice(0, maxRows);
  const rows = visibleItems.map((item, index) =>
    presentQueueItem(item, index + 1, maxPreviewCharacters),
  );

  return {
    pendingCount: snapshot.pendingCount,
    rows,
    hiddenCount: snapshot.items.length - rows.length,
    hasPriorityContinuation: snapshot.items.some((item) => !isUserQueueSource(item.source)),
  };
}

function presentQueueItem(
  item: AgentQueuedMessageItem,
  ordinal: number,
  maxPreviewCharacters: number,
): TuiQueueRow {
  const isUserMessage = isUserQueueSource(item.source);
  return {
    id: item.id,
    ordinal,
    preview: truncateQueueContent(item.content, maxPreviewCharacters),
    kind: queueRowKind(item.source),
    canEdit: isUserMessage,
    canCancel: isUserMessage,
    isPriorityContinuation: !isUserMessage,
  };
}

function queueRowKind(source: AgentQueuedMessageSource): TuiQueueRowKind {
  switch (source) {
    case 'task-result-continuation':
      return 'task-continuation';
    case 'subagent-result-continuation':
      return 'subagent-continuation';
    case 'system-continuation':
      return 'system-continuation';
    case 'composer':
    case 'user':
      return 'user-message';
  }
}

function isUserQueueSource(source: AgentQueuedMessageSource): boolean {
  return source === 'user' || source === 'composer';
}

function truncateQueueContent(content: string, maxCharacters: number): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const characters = Array.from(normalized);
  if (characters.length <= maxCharacters) {
    return normalized;
  }
  return `${characters.slice(0, Math.max(1, maxCharacters - 1)).join('')}…`;
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
