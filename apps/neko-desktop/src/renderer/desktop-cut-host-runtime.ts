import type {
  CutHostRuntime,
  CutHostRuntimeIdentity,
  CutHostRuntimeRequest,
} from '@neko/cut-domain';

export function createElectronCutHostRuntime(identity: CutHostRuntimeIdentity): CutHostRuntime {
  return {
    identity: { ...identity },
    getSnapshot: () => window.openNekoDesktop.cut.getSnapshot(identity),
    execute: (request: CutHostRuntimeRequest) => window.openNekoDesktop.cut.execute(request),
    subscribe: (listener) => window.openNekoDesktop.cut.subscribe(identity, listener),
  };
}
