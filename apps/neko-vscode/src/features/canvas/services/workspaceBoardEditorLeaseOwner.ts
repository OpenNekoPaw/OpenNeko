import type { CanvasDocumentLifecycleEvent } from '../editor';

interface Disposable {
  dispose(): void;
}

export interface WorkspaceBoardLeaseCoordinator {
  acquireWriterOwnership(): Promise<boolean>;
  releaseWriterOwnership(): Promise<void>;
  flush(): Promise<unknown>;
}

export interface WorkspaceBoardEditorLeaseOwnerOptions {
  readonly workspaceBoardDocumentUri: string;
  readonly coordinator: WorkspaceBoardLeaseCoordinator;
  readonly onDidChangeDocumentLifecycle: (
    listener: (event: CanvasDocumentLifecycleEvent) => void,
  ) => Disposable;
  readonly scheduleRenewal?: (operation: () => void, intervalMs: number) => Disposable;
  readonly renewalIntervalMs?: number;
  readonly logger?: {
    warn(message: string, error?: unknown): void;
  };
}

export class WorkspaceBoardEditorLeaseOwner implements Disposable {
  private readonly lifecycleSubscription: Disposable;
  private renewal: Disposable | undefined;
  private operationQueue: Promise<void> = Promise.resolve();
  private open = false;
  private ready = false;
  private dirty = false;
  private disposed = false;

  constructor(private readonly options: WorkspaceBoardEditorLeaseOwnerOptions) {
    this.lifecycleSubscription = options.onDidChangeDocumentLifecycle((event) =>
      this.handleLifecycleEvent(event),
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifecycleSubscription.dispose();
    this.stopRenewal();
    this.open = false;
    this.ready = false;
    this.dirty = false;
    this.enqueue(async () => this.options.coordinator.releaseWriterOwnership());
  }

  async whenIdle(): Promise<void> {
    await this.operationQueue;
  }

  private handleLifecycleEvent(event: CanvasDocumentLifecycleEvent): void {
    if (event.documentUri !== this.options.workspaceBoardDocumentUri || this.disposed) return;
    switch (event.type) {
      case 'opened':
        this.open = true;
        this.ready = false;
        this.dirty = false;
        this.startRenewal();
        this.acquireAndMaybeDrain(false);
        return;
      case 'ready':
        this.ready = true;
        this.acquireAndMaybeDrain(true);
        return;
      case 'dirty':
        this.dirty = true;
        this.acquireAndMaybeDrain(false);
        return;
      case 'saved':
      case 'reverted':
        this.ready = true;
        this.dirty = false;
        this.acquireAndMaybeDrain(true);
        return;
      case 'closed':
        this.open = false;
        this.ready = false;
        this.dirty = false;
        this.stopRenewal();
        this.enqueue(async () => this.options.coordinator.releaseWriterOwnership());
    }
  }

  private startRenewal(): void {
    if (this.renewal) return;
    const schedule = this.options.scheduleRenewal ?? scheduleRenewal;
    this.renewal = schedule(
      () => this.acquireAndMaybeDrain(true),
      this.options.renewalIntervalMs ?? 5_000,
    );
  }

  private stopRenewal(): void {
    this.renewal?.dispose();
    this.renewal = undefined;
  }

  private acquireAndMaybeDrain(drain: boolean): void {
    this.enqueue(async () => {
      if (!this.open) return;
      const acquired = await this.options.coordinator.acquireWriterOwnership();
      if (acquired && drain && this.ready && !this.dirty) {
        await this.options.coordinator.flush();
      }
    });
  }

  private enqueue(operation: () => Promise<void>): void {
    this.operationQueue = this.operationQueue.then(operation, operation).catch((error: unknown) => {
      this.options.logger?.warn('Workspace Board editor lease operation failed.', error);
    });
  }
}

function scheduleRenewal(operation: () => void, intervalMs: number): Disposable {
  const timer = setInterval(operation, intervalMs);
  return { dispose: () => clearInterval(timer) };
}
