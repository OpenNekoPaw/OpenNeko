import type { TodoItem } from '../types/state';

export const MAX_PROJECTED_TODOS = 6;

export function deriveTodoProjection(markdown: string): TodoItem[] {
  const todos: TodoItem[] = [];
  let todoHeadingLevel: number | null = null;
  let hasInProgress = false;
  const appendTodo = (content: string, requestedStatus: TodoItem['status']): void => {
    if (todos.length >= MAX_PROJECTED_TODOS) return;
    let status = requestedStatus;
    if (status === 'in_progress') {
      if (hasInProgress) status = 'pending';
      hasInProgress = true;
    }
    todos.push({ content, status });
  };

  for (const line of markdown.split(/\r?\n/u)) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/u.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 0;
      const title = heading[2] ?? '';
      if (isTodoHeading(title)) {
        todoHeadingLevel = level;
      } else if (todoHeadingLevel !== null && level <= todoHeadingLevel) {
        todoHeadingLevel = null;
      }
      continue;
    }

    if (todoHeadingLevel === null || todos.length >= MAX_PROJECTED_TODOS) continue;
    const checkbox = /^\s*[-*+]\s+\[([ xX!~-])\]\s+(.+?)\s*$/u.exec(line);
    const checkboxContent = checkbox?.[2]?.trim();
    if (checkbox && checkboxContent) {
      appendTodo(checkboxContent, statusForMarker(checkbox[1] ?? ' '));
      continue;
    }

    const cells = parseTableRow(line);
    if (cells.length < 2 || cells.every((cell) => /^:?-{3,}:?$/u.test(cell))) continue;
    if (/状态|status/iu.test(cells[0] ?? '') && /\btodo\b|待办/iu.test(cells[1] ?? '')) {
      continue;
    }
    const tableStatus = statusForLabel(cells[0] ?? '');
    const tableContent = cells[1]?.trim();
    if (tableStatus && tableContent) appendTodo(tableContent, tableStatus);
  }

  return todos;
}

function isTodoHeading(title: string): boolean {
  return /\btodo\b|待办|近期任务/iu.test(title);
}

function statusForMarker(marker: string): TodoItem['status'] {
  if (marker === 'x' || marker === 'X') return 'completed';
  if (marker === '!') return 'blocked';
  if (marker === '-' || marker === '~') return 'in_progress';
  return 'pending';
}

function statusForLabel(label: string): TodoItem['status'] | undefined {
  const normalized = label.trim().toLocaleLowerCase();
  if (/blocked|阻塞|受阻/u.test(normalized)) return 'blocked';
  if (/completed|complete|done|已完成|完成|已确认/u.test(normalized)) return 'completed';
  if (/in[_ -]?progress|running|进行中|执行中/u.test(normalized)) return 'in_progress';
  if (/pending|queued|待|等待/u.test(normalized)) return 'pending';
  return undefined;
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return [];
  return trimmed
    .replace(/^\|/u, '')
    .replace(/\|$/u, '')
    .split('|')
    .map((cell) => cell.trim());
}
