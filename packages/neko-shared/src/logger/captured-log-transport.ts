/**
 * Captured log transport for tests and diagnostics.
 *
 * Keeps structured LogEntry objects in memory so callers can assert payload
 * shape without depending on console output.
 */

import type { ILogTransport, LogEntry } from './types';

export class CapturedLogTransport implements ILogTransport {
  private readonly entries: LogEntry[] = [];

  write(entry: LogEntry): void {
    this.entries.push({
      ...entry,
      data: cloneLogData(entry.data),
    });
  }

  list(): readonly LogEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries.length = 0;
  }

  findByMessage(message: string): LogEntry | undefined {
    return this.entries.find((entry) => entry.message === message);
  }

  filterBySource(source: string): readonly LogEntry[] {
    return this.entries.filter((entry) => entry.source === source);
  }
}

function cloneLogData(data: unknown): unknown {
  if (data === undefined || data instanceof Error) return data;
  try {
    return JSON.parse(JSON.stringify(data)) as unknown;
  } catch {
    return data;
  }
}
