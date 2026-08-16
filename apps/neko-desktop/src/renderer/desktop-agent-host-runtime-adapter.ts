import type { AgentHostRuntimeAdapter } from '@neko/agent-contracts';
import type {
  DesktopAgentReadyBootstrapProjection,
  OpenNekoDesktopAgentBridge,
} from '../shared/agent-contract';

export interface DesktopAgentPresentationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ElectronAgentHostRuntimeAdapter extends AgentHostRuntimeAdapter {
  dispose(): Promise<void>;
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
}): ElectronAgentHostRuntimeAdapter {
  const { connection } = input.bootstrap;
  const storage = input.storage ?? window.sessionStorage;
  const subscriptions = new Set<() => void>();
  let disposed = false;
  let disposeOperation: Promise<void> | undefined;
  const stateKey = createDesktopAgentPresentationStateKey(
    `workspace:${connection.workspaceId}`,
    connection.viewId,
  );
  return {
    hostKind: 'electron',
    runtimeId: `neko.agent.webview.electron:${connection.connectionId}`,
    send(message): void {
      if (disposed) throw new Error('Desktop Agent session adapter is disposed.');
      input.bridge.agent.send(connection, message);
    },
    submitMessage(message) {
      if (disposed) return Promise.reject(new Error('Desktop Agent session adapter is disposed.'));
      return input.bridge.agent.submitMessage(connection, message);
    },
    subscribe(listener) {
      if (disposed) throw new Error('Desktop Agent session adapter is disposed.');
      const unsubscribe = input.bridge.agent.subscribe(connection, listener);
      let active = true;
      const disposeSubscription = (): void => {
        if (!active) return;
        active = false;
        subscriptions.delete(disposeSubscription);
        unsubscribe();
      };
      subscriptions.add(disposeSubscription);
      return {
        dispose: disposeSubscription,
      };
    },
    getState(): unknown {
      return readDesktopAgentPresentationState(storage, stateKey);
    },
    setState(state: unknown): void {
      storage.setItem(stateKey, JSON.stringify(state));
    },
    async dispose(): Promise<void> {
      if (!disposeOperation) {
        disposed = true;
        for (const unsubscribe of subscriptions) unsubscribe();
        subscriptions.clear();
        disposeOperation = input.bridge.agent.detach(connection);
      }
      await disposeOperation;
    },
  };
}
