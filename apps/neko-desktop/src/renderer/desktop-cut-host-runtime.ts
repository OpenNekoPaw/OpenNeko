import type {
  CutHostRuntime,
  CutHostRuntimeIdentity,
  CutHostRuntimeRequest,
} from '@neko/cut-domain';

export function createElectronCutHostRuntime(identity: CutHostRuntimeIdentity): CutHostRuntime {
  let current = { ...identity };
  return {
    get identity() {
      return { ...current };
    },
    async getSnapshot() {
      const snapshot = await window.openNekoDesktop.cut.getSnapshot(current);
      current = { ...snapshot.identity };
      return snapshot;
    },
    async execute(request: CutHostRuntimeRequest) {
      const result = await window.openNekoDesktop.cut.execute({ ...request, identity: current });
      current = { ...result.snapshot.identity };
      return result;
    },
    subscribe: (listener) => window.openNekoDesktop.cut.subscribe(current, listener),
  };
}
