import type { AgentHostRuntimeAdapter } from '@neko/agent-contracts';
import type {
  DesktopAgentReadyBootstrapProjection,
  OpenNekoDesktopAgentBridge,
} from '../shared/agent-contract';

export interface DesktopAgentPresentationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const INVALID_PRESENTATION_STATE = Object.freeze({ stateReadFailure: 'invalid-json' as const });

export function createDesktopAgentPresentationStateKey(
  ownerIdentity: string,
  viewId: string,
): string {
  return `openneko:agent:presentation:${ownerIdentity}:${viewId}`;
}

export function readDesktopAgentPresentationState(
  storage: DesktopAgentPresentationStorage,
  stateKey: string,
): unknown {
  const serialized = storage.getItem(stateKey);
  if (serialized === null) return undefined;
  try {
    const state: unknown = JSON.parse(serialized);
    return state;
  } catch {
    return INVALID_PRESENTATION_STATE;
  }
}

export function createElectronAgentHostRuntimeAdapter(input: {
  readonly bridge: OpenNekoDesktopAgentBridge;
  readonly bootstrap: DesktopAgentReadyBootstrapProjection;
  readonly storage?: DesktopAgentPresentationStorage;
}): AgentHostRuntimeAdapter {
  const { connection } = input.bootstrap;
  const storage = input.storage ?? window.sessionStorage;
  const stateKey = createDesktopAgentPresentationStateKey(
    `workspace:${connection.workspaceId}`,
    connection.viewId,
  );
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
      return readDesktopAgentPresentationState(storage, stateKey);
    },
    setState(state: unknown): void {
      storage.setItem(stateKey, JSON.stringify(state));
    },
  };
}
