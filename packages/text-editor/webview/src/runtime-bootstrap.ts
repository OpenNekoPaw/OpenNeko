import type { TextDocumentProjection } from '@neko/text-editor-domain';
import type { TextEditorHostRuntime } from './host-runtime';

export interface TextEditorRuntimeBootstrap {
  readonly runtime: TextEditorHostRuntime;
  prepare(): void;
  getProjection(): Promise<TextDocumentProjection>;
  retryProjection(): Promise<TextDocumentProjection>;
  subscribe(listener: (projection: TextDocumentProjection) => void): () => void;
  dispose(): void;
}

export function createTextEditorRuntimeBootstrap(
  runtime: TextEditorHostRuntime,
): TextEditorRuntimeBootstrap {
  const listeners = new Set<(projection: TextDocumentProjection) => void>();
  let projection: TextDocumentProjection | undefined;
  let projectionRequest: Promise<TextDocumentProjection> | undefined;
  let unsubscribeRuntime: (() => void) | undefined;
  let runtimeEventObserved = false;
  let disposed = false;

  const publish = (next: TextDocumentProjection): void => {
    projection = next;
    for (const listener of listeners) listener(next);
  };

  const ensureSubscription = (): void => {
    if (disposed) throw new Error('Text Editor runtime bootstrap is disposed.');
    if (unsubscribeRuntime) return;
    unsubscribeRuntime = runtime.subscribe((next) => {
      if (disposed) return;
      runtimeEventObserved = true;
      publish(next);
    });
  };

  const requestProjection = (): Promise<TextDocumentProjection> => {
    if (disposed) return Promise.reject(new Error('Text Editor runtime bootstrap is disposed.'));
    if (projection) return Promise.resolve(projection);
    projectionRequest ??= runtime.project().then((next) => {
      if (!disposed && !runtimeEventObserved) publish(next);
      return projection ?? next;
    });
    return projectionRequest;
  };

  return {
    runtime,
    prepare() {
      ensureSubscription();
      void requestProjection().catch(() => undefined);
    },
    getProjection: requestProjection,
    retryProjection() {
      if (disposed) return Promise.reject(new Error('Text Editor runtime bootstrap is disposed.'));
      projectionRequest = undefined;
      projection = undefined;
      runtimeEventObserved = false;
      return requestProjection();
    },
    subscribe(listener) {
      ensureSubscription();
      listeners.add(listener);
      if (projection) listener(projection);
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
