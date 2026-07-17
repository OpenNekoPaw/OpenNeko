import type { CreativeEntityChangeEvent } from '@neko/shared';

export interface EntityRuntimeFileStore {
  readJson(filePath: string): Promise<unknown | undefined>;
  writeJson(filePath: string, value: unknown): Promise<void>;
  exists?(filePath: string): Promise<boolean>;
}

export interface EntityRuntimeLock {
  withLock<T>(key: string, operation: () => Promise<T>): Promise<T>;
}

export interface EntityRuntimeLogger {
  info?(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error?(message: string, metadata?: Record<string, unknown>): void;
}

export interface EntityRuntimeClock {
  now(): string;
}

export interface EntityRuntimeEventSink {
  emit(event: CreativeEntityChangeEvent): void;
}

export interface EntityRuntimePorts {
  readonly files: EntityRuntimeFileStore;
  readonly lock?: EntityRuntimeLock;
  readonly logger?: EntityRuntimeLogger;
  readonly clock?: EntityRuntimeClock;
  readonly events?: EntityRuntimeEventSink;
}

export interface EntityDisposable {
  dispose(): void;
}

export type EntityEvent<T> = (listener: (event: T) => void) => EntityDisposable;

export class SerialEntityRuntimeLock implements EntityRuntimeLock {
  private readonly chains = new Map<string, Promise<void>>();

  async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const next = previous.catch(() => undefined).then(() => gate);
    this.chains.set(key, next);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release?.();
      if (this.chains.get(key) === next) {
        this.chains.delete(key);
      }
    }
  }
}

export const SYSTEM_ENTITY_CLOCK: EntityRuntimeClock = {
  now: () => new Date().toISOString(),
};

export const NOOP_ENTITY_LOGGER: EntityRuntimeLogger = {
  warn: () => undefined,
};

export function nowFromPorts(ports: Pick<EntityRuntimePorts, 'clock'>): string {
  return (ports.clock ?? SYSTEM_ENTITY_CLOCK).now();
}
