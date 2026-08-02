import type {
  CanvasHostIntentRequest,
  CanvasHostRuntime,
  CanvasHostRuntimeIdentity,
} from '@neko/canvas-domain';

export function createElectronCanvasHostRuntime(
  identity: CanvasHostRuntimeIdentity,
): CanvasHostRuntime {
  return {
    identity: { ...identity },
    getSnapshot: () => window.openNekoDesktop.canvas.getSnapshot(identity),
    resolveMaterialActions: (request) =>
      window.openNekoDesktop.canvas.resolveMaterialActions(request),
    subscribe: (listener) => window.openNekoDesktop.canvas.subscribe(identity, listener),
    executeIntent: (request: CanvasHostIntentRequest) =>
      window.openNekoDesktop.canvas.executeIntent(request),
  };
}
