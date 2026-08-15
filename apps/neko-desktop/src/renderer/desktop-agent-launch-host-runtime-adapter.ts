import {
  classifyAgentHostRoute,
  createAgentHostWorkspaceScopeRequiredDiagnostic,
  parseAgentCharacterDialogueTargetOptions,
  parseAgentWorldExperienceTargetOptions,
  type AgentDraftHostRuntimeAdapter,
  type AgentHostToWebviewMessage,
  type AgentLaunchCatalogProjection,
} from '@neko/agent-contracts';
import type { OpenNekoAgentLaunchBridge } from '@neko/agent-contracts/agent-launch-host';
import type { OpenNekoDesktopCharacterBridge } from '@neko/chara/contracts';
import type { OpenNekoDesktopWorldManagementBridge } from '@neko/world/contracts';
import {
  createDesktopAgentPresentationStateKey,
  readDesktopAgentPresentationState,
  type DesktopAgentPresentationStorage,
} from './desktop-agent-host-runtime-adapter';

export interface ElectronAgentLaunchHostRuntimeAdapter extends AgentDraftHostRuntimeAdapter {
  readonly catalog: AgentLaunchCatalogProjection;
  dispose(): Promise<void>;
}

export function createElectronAgentLaunchHostRuntimeAdapter(input: {
  readonly bridge: OpenNekoAgentLaunchBridge &
    OpenNekoDesktopCharacterBridge &
    Partial<OpenNekoDesktopWorldManagementBridge>;
  readonly catalog: AgentLaunchCatalogProjection;
  readonly draftId: string;
  readonly storage?: DesktopAgentPresentationStorage;
}): ElectronAgentLaunchHostRuntimeAdapter {
  const { connection } = input.catalog;
  let catalog = input.catalog;
  let entryIntent = projectInitialEntryIntent(catalog.interaction.binding.kind);
  const storage = input.storage ?? window.sessionStorage;
  const listeners = new Set<(message: AgentHostToWebviewMessage) => void>();
  const stateKey = createDesktopAgentPresentationStateKey(
    `window:${connection.windowId}:draft:${input.draftId}`,
    connection.viewId,
  );
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
    readLaunchCatalog() {
      if (disposed) throw new Error('Agent launch adapter is disposed.');
      return catalog;
    },
    readEntryIntent() {
      if (disposed) throw new Error('Agent launch adapter is disposed.');
      return entryIntent;
    },
    async loadCharacterDialogueTargets() {
      if (disposed) throw new Error('Agent launch adapter is disposed.');
      const catalog = await input.bridge.characterFoundation.getConversationLaunchCatalog();
      return parseAgentCharacterDialogueTargetOptions(
        catalog.targets.map((target) => ({
          globalCharacterId: target.globalCharacterId,
          characterVersionId: target.characterVersionId,
          displayName: target.displayName,
          versionLabel: target.versionLabel,
          lineage: target.lineage,
          storylines: target.storylines.map((storyline) => ({
            storylineVersionId: storyline.characterStorylineVersionId,
            label: storyline.label,
          })),
        })),
      );
    },
    async loadWorldExperienceTargets() {
      if (disposed) throw new Error('Agent launch adapter is disposed.');
      const worldManagement = input.bridge.worldManagement;
      if (!worldManagement) throw new Error('World Experience target catalog is unavailable.');
      const catalog = await worldManagement.getCatalog({
        search: '',
        sort: 'recently-updated',
      });
      const eligible = catalog.items.filter(
        (item) => item.status === 'available' && item.runtimeEligible,
      );
      const details = await Promise.all(
        eligible.map((item) => worldManagement.getDetail(item.globalWorldId)),
      );
      return parseAgentWorldExperienceTargetOptions(
        details.flatMap((detail) =>
          detail.versions.map((version) => ({
            globalWorldId: detail.globalWorldId,
            worldVersionId: version.worldVersionId,
            displayName: detail.title,
            versionLabel: version.label,
          })),
        ),
      );
    },
    async configureEntryTarget(mode, binding) {
      if (disposed) throw new Error('Agent launch adapter is disposed.');
      catalog = { ...catalog, inputs: [] };
      emit({ type: 'projectFiles', filter: '', purpose: 'entry', files: [], mentionExtras: [] });
      const configured = await input.bridge.agentLaunch.configureEntryTarget(
        connection,
        mode,
        binding,
      );
      entryIntent = configured.intent;
      catalog = configured.catalog;
      return entryIntent;
    },
    async bindTarget(binding) {
      if (disposed) throw new Error('Agent launch adapter is disposed.');
      catalog = { ...catalog, inputs: [] };
      emit({ type: 'projectFiles', filter: '', purpose: 'entry', files: [], mentionExtras: [] });
      catalog = await input.bridge.agentLaunch.bindTarget(connection, binding);
      return catalog;
    },
    async updateDraftConfiguration(configuration) {
      if (disposed) throw new Error('Agent launch adapter is disposed.');
      catalog = await input.bridge.agentLaunch.updateConfiguration(connection, configuration);
      return catalog;
    },
    send(message): void {
      if (disposed) throw new Error('Agent launch adapter is disposed.');
      if (message.type === 'searchProjectFiles') {
        if (message.purpose === 'roleplay') {
          emit({
            type: 'globalError',
            message:
              'Workspace roleplay search is unavailable. Choose published Characters in Character Dialogue.',
          });
          return;
        }
        const receipt = catalog.interaction.bindingReceipt;
        if (catalog.interaction.binding.kind !== 'workspace' || !receipt) {
          emit({
            type: 'globalError',
            message: createAgentHostWorkspaceScopeRequiredDiagnostic(message.type).message,
          });
          return;
        }
        const bindingReceiptId = receipt.bindingReceiptId;
        void input.bridge.agentLaunch
          .searchWorkspaceMentions(connection, bindingReceiptId, message.filter)
          .then((projection) => {
            if (
              disposed ||
              catalog.interaction.bindingReceipt?.bindingReceiptId !== bindingReceiptId
            ) {
              return;
            }
            emit({
              type: 'projectFiles',
              filter: projection.filter,
              purpose: 'entry',
              files: [...projection.files],
              mentionExtras: [...projection.mentionExtras],
            });
          })
          .catch((error: unknown) => {
            if (
              disposed ||
              catalog.interaction.bindingReceipt?.bindingReceiptId !== bindingReceiptId
            ) {
              return;
            }
            emit({
              type: 'globalError',
              message: error instanceof Error ? error.message : String(error),
            });
          });
        return;
      }
      const authority = classifyAgentHostRoute(message.type);
      if (authority.scope === 'workspace' && catalog.interaction.binding.kind !== 'workspace') {
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
          const models = catalog.models.filter(
            (entry) => entry.availability.status === 'available',
          );
          const selected = catalog.configuration.fields.model.effectiveValue;
          emit({
            type: 'configState',
            config: {
              chatModelOptions: models.map((entry) => ({
                id: entry.id,
                label: entry.label,
                providerId: entry.providerId,
                modelId: entry.modelId,
                category: entry.modelType,
                capabilities: [...entry.purposeCapabilities],
                ...(entry.contextWindow === null ? {} : { contextWindow: entry.contextWindow }),
                ...(entry.maximumOutputTokens === null
                  ? {}
                  : { maxOutputTokens: entry.maximumOutputTokens }),
              })),
              defaultMediaModels: { ...catalog.defaultMediaModels },
              mediaUnderstandingModels: structuredClone(catalog.mediaUnderstandingModels),
              selectedProviderId: selected?.providerId ?? null,
              selectedModelId: selected?.modelId ?? null,
              temperature: catalog.configuration.fields.temperature.effectiveValue ?? undefined,
              maxTokens:
                catalog.configuration.fields.maximumOutputTokens.effectiveValue ?? undefined,
              executionMode: catalog.configuration.fields.executionMode.effectiveValue ?? undefined,
              agentConfiguration: catalog.configuration,
            },
          });
          return;
        }
        case 'getAgentStates':
          emit({ type: 'agentStateSnapshot', agentStates: [] });
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
      return readDesktopAgentPresentationState(storage, stateKey);
    },
    setState(state: unknown): void {
      storage.setItem(stateKey, JSON.stringify(state));
    },
    async submitDraft(draftInput) {
      if (disposed) throw new Error('Agent launch adapter is disposed.');
      const contextMatches =
        draftInput.draft.draftId === connection.draftId &&
        draftInput.draft.draftId === input.draftId &&
        draftInput.draft.bindingReceipt?.bindingReceiptId ===
          catalog.interaction.bindingReceipt?.bindingReceiptId &&
        JSON.stringify(draftInput.draft.binding) === JSON.stringify(catalog.interaction.binding);
      if (!contextMatches) {
        throw new Error('Agent draft submit context does not match its launch connection scope.');
      }
      return input.bridge.agentLaunch.submitDraft(connection, draftInput);
    },
    async authorizeResource(resourceKind) {
      if (disposed) throw new Error('Agent launch adapter is disposed.');
      const previousIds = new Set(
        catalog.inputs
          .filter((entry) => entry.trigger === 'mention')
          .map((entry) => entry.executable.referenceId),
      );
      const next = await input.bridge.agentLaunch.authorizeResource(connection, resourceKind);
      if (!next) return undefined;
      catalog = next;
      const resource = next.inputs.find(
        (candidate) =>
          candidate.trigger === 'mention' && !previousIds.has(candidate.executable.referenceId),
      );
      if (!resource || resource.trigger !== 'mention') {
        throw new Error('Agent resource authorization did not return a new exact grant.');
      }
      return {
        type: resourceKind === 'file' ? 'file' : 'media',
        id: resource.executable.referenceId,
        label: resource.name,
        summary: resource.description,
        data: {
          catalogEntryId: resource.id,
          resourceGrantId: resource.executable.referenceId,
          resourceKind,
          ownerKind: resource.executable.ownerKind,
          ownerId: resource.executable.ownerId,
          ...(catalog.interaction.bindingReceipt === null
            ? {}
            : {
                bindingReceiptId: catalog.interaction.bindingReceipt.bindingReceiptId,
              }),
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

function projectInitialEntryIntent(
  bindingKind: AgentLaunchCatalogProjection['interaction']['binding']['kind'],
): import('@neko/agent-contracts').AgentEntryIntentProjection {
  return {
    mode:
      bindingKind === 'workspace'
        ? 'authoring'
        : bindingKind === 'character'
          ? 'character-dialogue'
          : bindingKind === 'world'
            ? 'world-experience'
            : 'assistant',
    targetReceipt: null,
  };
}
