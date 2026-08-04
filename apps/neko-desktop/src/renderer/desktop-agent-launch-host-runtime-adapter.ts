import {
  classifyAgentHostRoute,
  createAgentHostWorkspaceScopeRequiredDiagnostic,
  isAgentLaunchEntryAvailable,
  type AgentHostRuntimeAdapter,
  type AgentHostToWebviewMessage,
  type AgentLaunchCatalogProjection,
} from '@neko/agent-contracts';
import type { OpenNekoAgentLaunchBridge } from '@neko/agent-contracts/agent-launch-host';
import type { DesktopAgentPresentationStorage } from './desktop-agent-host-runtime-adapter';

export interface ElectronAgentLaunchHostRuntimeAdapter extends AgentHostRuntimeAdapter {
  readonly catalog: AgentLaunchCatalogProjection;
  readonly authorizeResource: NonNullable<AgentHostRuntimeAdapter['authorizeResource']>;
  readonly submitDraft: NonNullable<AgentHostRuntimeAdapter['submitDraft']>;
  dispose(): Promise<void>;
}

export function createElectronAgentLaunchHostRuntimeAdapter(input: {
  readonly bridge: OpenNekoAgentLaunchBridge;
  readonly catalog: AgentLaunchCatalogProjection;
  readonly storage?: DesktopAgentPresentationStorage;
}): ElectronAgentLaunchHostRuntimeAdapter {
  const { connection } = input.catalog;
  let catalog = input.catalog;
  const storage = input.storage ?? window.sessionStorage;
  const listeners = new Set<(message: AgentHostToWebviewMessage) => void>();
  const stateKey = [
    'openneko:agent:presentation',
    connection.viewId,
    connection.rendererEpoch,
    connection.connectionEpoch,
  ].join(':');
  let disposed = false;
  const emit = (message: AgentHostToWebviewMessage): void => {
    if (disposed) throw new Error('Agent launch adapter is disposed.');
    for (const listener of listeners) listener(message);
  };
  return {
    hostKind: 'electron',
    runtimeId: `neko.agent.webview.electron.launch:${connection.connectionId}`,
    get catalog() {
      return catalog;
    },
    send(message): void {
      if (disposed) throw new Error('Agent launch adapter is disposed.');
      const authority = classifyAgentHostRoute(message.type);
      if (authority.scope === 'workspace' && connection.scope.kind === 'assistant') {
        emit({
          type: 'globalError',
          message: createAgentHostWorkspaceScopeRequiredDiagnostic(message.type).message,
        });
        return;
      }
      if (authority.connection === 'session') {
        emit({
          type: 'globalError',
          message: `Agent route '${message.type}' requires a committed conversation session.`,
        });
        return;
      }
      switch (message.type) {
        case 'getConfig':
        case 'refreshConfigSnapshot': {
          const models = input.catalog.models.filter((entry) =>
            isAgentLaunchEntryAvailable(entry, connection.scope),
          );
          const selected = models[0];
          emit({
            type: 'configState',
            config: {
              chatModelOptions: models.map((entry) => ({
                id: entry.id,
                label: entry.label,
                providerId: entry.providerId,
                modelId: entry.modelId,
                category: entry.modelType,
              })),
              selectedProviderId: selected?.providerId ?? null,
              selectedModelId: selected?.modelId ?? null,
            },
          });
          return;
        }
        case 'getSkills':
          emit({
            type: 'skillsList',
            skills: input.catalog.skills
              .filter((entry) => isAgentLaunchEntryAvailable(entry, connection.scope))
              .map((entry) => ({
                name: entry.name,
                description: entry.description,
                source: entry.source,
                enabled: true,
                type: 'skill',
              })),
          });
          return;
        case 'getAgentStates':
          emit({ type: 'agentStateSnapshot', agentStates: [] });
          return;
        case 'searchProjectFiles':
          emit({
            type: 'projectFiles',
            filter: message.filter,
            ...(message.purpose === undefined ? {} : { purpose: message.purpose }),
            files: [],
          });
          return;
        case 'webviewKeyboardFocus':
        case 'webviewKeyboardEditable':
          return;
        default:
          emit({
            type: 'globalError',
            message: `Agent launch route '${message.type}' has no launch handler.`,
          });
      }
    },
    subscribe(listener) {
      if (disposed) throw new Error('Agent launch adapter is disposed.');
      listeners.add(listener);
      return {
        dispose(): void {
          listeners.delete(listener);
        },
      };
    },
    getState(): unknown {
      const serialized = storage.getItem(stateKey);
      return serialized === null ? undefined : JSON.parse(serialized);
    },
    setState(state: unknown): void {
      storage.setItem(stateKey, JSON.stringify(state));
    },
    async submitDraft(draftInput) {
      if (disposed) throw new Error('Agent launch adapter is disposed.');
      const contextMatches =
        draftInput.target.kind === 'automatic-assistant'
          ? connection.scope.kind === 'unbound' &&
            connection.scope.draftId === draftInput.target.draftId
          : draftInput.target.context.kind === 'assistant'
            ? connection.scope.kind === 'assistant' &&
              draftInput.target.context.assistantSpaceId === connection.scope.assistantSpaceId &&
              sameIdentities(
                draftInput.target.context.baseGrantIds,
                draftInput.resourceGrantIds,
              )
            : connection.scope.kind === 'workspace' &&
              draftInput.target.context.workspaceId === connection.scope.workspaceId &&
              draftInput.target.context.workspaceGrantId === connection.scope.workspaceGrantId;
      if (!contextMatches) {
        throw new Error('Agent draft submit context does not match its launch connection scope.');
      }
      return input.bridge.agentLaunch.submitDraft(connection, draftInput);
    },
    async authorizeResource(resourceKind) {
      if (disposed) throw new Error('Agent launch adapter is disposed.');
      const previousIds = new Set(catalog.resources.map((resource) => resource.resourceGrantId));
      const next = await input.bridge.agentLaunch.authorizeResource(connection, resourceKind);
      if (!next) return undefined;
      catalog = next;
      const resource = next.resources.find(
        (candidate) =>
          candidate.resourceKind === resourceKind && !previousIds.has(candidate.resourceGrantId),
      );
      if (!resource) {
        throw new Error('Agent resource authorization did not return a new exact grant.');
      }
      return {
        type: resourceKind === 'file' ? 'file' : 'media',
        id: resource.resourceGrantId,
        label: resource.label,
        summary: `Authorized ${resourceKind}: ${resource.label}`,
        data: {
          resourceGrantId: resource.resourceGrantId,
          resourceKind,
        },
      };
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      await input.bridge.agentLaunch.detach(connection);
    },
  };
}

function sameIdentities(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((identity, index) => identity === right[index]);
}
