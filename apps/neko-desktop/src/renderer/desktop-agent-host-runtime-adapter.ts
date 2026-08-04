import type { AgentHostRuntimeAdapter } from '@neko/agent-contracts';
import type {
  DesktopAgentReadyBootstrapProjection,
  OpenNekoDesktopAgentBridge,
} from '../shared/agent-contract';

export interface DesktopAgentPresentationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createElectronAgentHostRuntimeAdapter(input: {
  readonly bridge: OpenNekoDesktopAgentBridge;
  readonly bootstrap: DesktopAgentReadyBootstrapProjection;
  readonly storage?: DesktopAgentPresentationStorage;
}): AgentHostRuntimeAdapter {
  const { connection } = input.bootstrap;
  const storage = input.storage ?? window.sessionStorage;
  const stateKey = `openneko:agent:presentation:${connection.viewId}:${connection.viewEpoch}`;
  return {
    hostKind: 'electron',
    runtimeId: `neko.agent.webview.electron:${connection.connectionId}`,
    send(message): void {
      input.bridge.agent.send(connection, message);
    },
    subscribe(listener) {
      const unsubscribe = input.bridge.agent.subscribe(connection, listener);
      return {
        dispose(): void {
          unsubscribe();
        },
      };
    },
    getState(): unknown {
      const serialized = storage.getItem(stateKey);
      if (serialized === null) return undefined;
      const state: unknown = JSON.parse(serialized);
      return state;
    },
    setState(state: unknown): void {
      storage.setItem(stateKey, JSON.stringify(state));
    },
  };
}
