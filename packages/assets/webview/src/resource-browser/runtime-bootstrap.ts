import type {
  ResourceBrowserHostRuntime,
  ResourceBrowserProjection,
  ResourceBrowserProjectionEvent,
} from '@neko/assets-domain/resource-browser/contract';

export interface PreparedResourceBrowserHostRuntime extends ResourceBrowserHostRuntime {
  prepare(): void;
  dispose(): void;
}

export function createResourceBrowserRuntimeBootstrap(
  runtime: ResourceBrowserHostRuntime,
): PreparedResourceBrowserHostRuntime {
  const listeners = new Map<(event: ResourceBrowserProjectionEvent) => void, number>();
  let projection: ResourceBrowserProjection | undefined;
  let snapshotRequest: Promise<ResourceBrowserProjection> | undefined;
  let unsubscribeRuntime: (() => void) | undefined;
  let runtimeEventObserved = false;
  let disposed = false;

  const publish = (next: ResourceBrowserProjection): void => {
    projection = next;
    for (const [listener, sequence] of listeners) {
      const nextSequence = sequence + 1;
      listeners.set(listener, nextSequence);
      listener({ sequence: nextSequence, projection: next });
    }
  };

  const ensureSubscription = (): void => {
    if (disposed) throw new Error('Resource Browser runtime bootstrap is disposed.');
    if (unsubscribeRuntime) return;
    unsubscribeRuntime = runtime.subscribe((event) => {
      if (disposed) return;
      runtimeEventObserved = true;
      publish(event.projection);
    });
  };

  const getSnapshot = (): Promise<ResourceBrowserProjection> => {
    if (disposed)
      return Promise.reject(new Error('Resource Browser runtime bootstrap is disposed.'));
    if (projection) return Promise.resolve(projection);
    snapshotRequest ??= runtime.getSnapshot().then((next) => {
      if (!disposed && !runtimeEventObserved) projection = next;
      return projection ?? next;
    });
    return snapshotRequest;
  };

  return {
    identity: runtime.identity,
    getSnapshot,
    resolveThumbnail: (request) => runtime.resolveThumbnail(request),
    resolveQuickPreview: (request) => runtime.resolveQuickPreview(request),
    releaseQuickPreview: (request) => runtime.releaseQuickPreview(request),
    planRecovery: (request) => runtime.planRecovery(request),
    applyRecovery: (request) => runtime.applyRecovery(request),
    cancelRecovery: (request) => runtime.cancelRecovery(request),
    children: (request) => runtime.children(request),
    search: (request) => runtime.search(request),
    execute: (request) => runtime.execute(request),
    prepare() {
      ensureSubscription();
      void getSnapshot().catch(() => undefined);
    },
    subscribe(listener) {
      ensureSubscription();
      listeners.set(listener, 0);
      if (projection) {
        listeners.set(listener, 1);
        listener({ sequence: 1, projection });
      }
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeRuntime?.();
      unsubscribeRuntime = undefined;
      listeners.clear();
    },
  };
}
