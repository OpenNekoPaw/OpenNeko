import { watch, type FSWatcher } from 'node:fs';

export interface WorkspaceDirectoryWatchHandle {
  close(): void;
  on(event: 'error', listener: (error: Error) => void): this;
}

export type WorkspaceDirectoryWatchFactory = (
  root: string,
  listener: () => void,
) => WorkspaceDirectoryWatchHandle;

export interface WorkspaceDirectoryObserverOptions {
  readonly root: string;
  readonly debounceMs?: number;
  readonly onInvalidated: () => Promise<void>;
  readonly onError: (error: Error) => void;
  readonly watchFactory?: WorkspaceDirectoryWatchFactory;
}

export class WorkspaceDirectoryObserver {
  private readonly watcher: WorkspaceDirectoryWatchHandle;
  private readonly debounceMs: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private reconciling = false;
  private invalidatedWhileReconciling = false;
  private disposed = false;

  constructor(private readonly options: WorkspaceDirectoryObserverOptions) {
    this.debounceMs = options.debounceMs ?? 75;
    if (!Number.isInteger(this.debounceMs) || this.debounceMs < 0) {
      throw new Error('Workspace directory observer debounce must be a non-negative integer.');
    }
    this.watcher = (options.watchFactory ?? nodeWatchFactory)(options.root, () => this.schedule());
    this.watcher.on('error', (error) => {
      if (!this.disposed) this.options.onError(error);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.watcher.close();
  }

  private schedule(): void {
    if (this.disposed) return;
    if (this.reconciling) {
      this.invalidatedWhileReconciling = true;
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.reconcile();
    }, this.debounceMs);
  }

  private async reconcile(): Promise<void> {
    if (this.disposed || this.reconciling) return;
    this.reconciling = true;
    try {
      await this.options.onInvalidated();
    } catch (error) {
      if (!this.disposed) this.options.onError(asError(error));
    } finally {
      this.reconciling = false;
      if (this.invalidatedWhileReconciling && !this.disposed) {
        this.invalidatedWhileReconciling = false;
        this.schedule();
      }
    }
  }
}

function nodeWatchFactory(root: string, listener: () => void): FSWatcher {
  return watch(root, { recursive: true }, listener);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
