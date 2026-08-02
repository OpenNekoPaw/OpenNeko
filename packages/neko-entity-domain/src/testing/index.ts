import type { EntityRuntimeFileStore } from '../core/ports';

export class MemoryEntityFileStore implements EntityRuntimeFileStore {
  readonly writes: Array<{ readonly filePath: string; readonly value: unknown }> = [];
  private readonly files = new Map<string, unknown>();

  constructor(initialFiles: Record<string, unknown> = {}) {
    for (const [filePath, value] of Object.entries(initialFiles)) {
      this.files.set(normalize(filePath), clone(value));
    }
  }

  async readJson(filePath: string): Promise<unknown | undefined> {
    const value = this.files.get(normalize(filePath));
    return value === undefined ? undefined : clone(value);
  }

  async writeJson(filePath: string, value: unknown): Promise<void> {
    const normalized = normalize(filePath);
    const cloned = clone(value);
    this.files.set(normalized, cloned);
    this.writes.push({ filePath: normalized, value: clone(cloned) });
  }

  async exists(filePath: string): Promise<boolean> {
    return this.files.has(normalize(filePath));
  }

  get(filePath: string): unknown | undefined {
    const value = this.files.get(normalize(filePath));
    return value === undefined ? undefined : clone(value);
  }
}

export function createFixedClock(now: string) {
  return { now: () => now };
}

function normalize(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
