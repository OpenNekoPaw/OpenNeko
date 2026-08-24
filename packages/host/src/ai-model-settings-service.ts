import type { ModelCapability, ModelType, ProviderProtocolProfile } from '@neko/ai-contracts';
import type { ConfigManager } from './settings/config-manager';
import type { ProviderCredentialAuthority } from './settings/provider-credential-authority';
import type {
  DesktopAiModelProtocol,
  DesktopAiModelSettingsProjection,
  DesktopAiModelSettingsRequest,
  DesktopAiProviderView,
} from './ai-model-settings-contract';

export class DesktopAiModelSettingsService {
  constructor(
    private readonly config: ConfigManager,
    private readonly credentials: ProviderCredentialAuthority,
  ) {}

  async project(): Promise<DesktopAiModelSettingsProjection> {
    const providers = await Promise.all(
      this.config
        .getProviders()
        .filter((provider) => toDesktopProtocol(provider.protocolProfile) !== undefined)
        .map((provider) => this.projectProvider(provider.id)),
    );
    const projectedProviderIds = new Set(providers.map((provider) => provider.id));
    return {
      providers,
      models: this.config
        .getModels()
        .filter((model) => projectedProviderIds.has(model.providerId))
        .map((model) => ({
          id: model.id,
          providerId: model.providerId,
          apiName: model.name,
          displayName: model.displayName ?? model.name,
          type: model.type ?? 'llm',
          enabled: model.enabled,
        })),
      defaults: Object.fromEntries(
        (['llm', 'image', 'video', 'audio'] as const)
          .map((type) => [type, this.config.getDefaultModelRef(type)] as const)
          .filter(
            (entry): entry is readonly [ModelType, NonNullable<(typeof entry)[1]>] =>
              entry[1] !== undefined,
          ),
      ),
    };
  }

  async execute(request: DesktopAiModelSettingsRequest): Promise<{
    readonly projection: DesktopAiModelSettingsProjection;
    readonly restartRequired: boolean;
  }> {
    if (request.operation === 'get')
      return { projection: await this.project(), restartRequired: false };
    if (request.operation === 'save-provider') {
      const existing = this.config.getProvider(request.provider.id);
      const isLocalOllama = request.provider.protocol === 'ollama';
      if (
        existing?.builtin === true &&
        request.provider.protocol !== toDesktopProtocol(existing.protocolProfile)
      ) {
        throw new Error(`Builtin Provider ${existing.id} protocol cannot be changed.`);
      }
      if (isLocalOllama && request.apiKey !== undefined) {
        throw new Error(`Local Ollama Provider ${request.provider.id} does not accept an API key.`);
      }
      const preserveBuiltinMetadata = existing?.builtin === true;
      const protocolProfile =
        existing?.protocolProfile === 'newapi' && request.provider.protocol === 'openai-chat'
          ? 'newapi'
          : request.provider.protocol;
      await this.config.setProvider({
        ...existing,
        id: request.provider.id,
        name: existing?.name ?? request.provider.id,
        displayName: request.provider.displayName,
        type:
          preserveBuiltinMetadata && existing
            ? existing.type
            : isLocalOllama
              ? 'ollama'
              : request.provider.protocol === 'anthropic'
                ? 'anthropic'
                : 'generic',
        apiUrl: request.provider.apiUrl,
        enabled: request.provider.enabled,
        connectionKind:
          preserveBuiltinMetadata && existing
            ? (existing.connectionKind ?? (isLocalOllama ? 'local' : 'direct'))
            : isLocalOllama
              ? 'local'
              : 'direct',
        protocolProfile,
        supportLevel: existing?.supportLevel ?? 'custom',
        requiresApiKey:
          preserveBuiltinMetadata && existing
            ? (existing.requiresApiKey ?? !isLocalOllama)
            : !isLocalOllama,
        builtin: existing?.builtin ?? false,
        supportsBeta:
          preserveBuiltinMetadata && existing
            ? (existing.supportsBeta ?? request.provider.protocol === 'anthropic')
            : request.provider.protocol === 'anthropic',
        useBearerAuth:
          preserveBuiltinMetadata && existing
            ? (existing.useBearerAuth ??
              (!isLocalOllama && request.provider.protocol !== 'anthropic'))
            : !isLocalOllama && request.provider.protocol !== 'anthropic',
      });
      if (request.apiKey !== undefined) {
        await this.credentials.replaceApiKey(request.provider.id, request.apiKey);
      }
      return { projection: await this.project(), restartRequired: true };
    }
    if (request.operation === 'save-model') {
      const provider = this.config.getProvider(request.model.providerId);
      if (!provider) {
        throw new Error(`Provider ${request.model.providerId} does not exist.`);
      }
      if (
        (provider.protocolProfile === 'ollama' || provider.type === 'ollama') &&
        request.model.type !== 'llm'
      ) {
        throw new Error(`Ollama Provider ${provider.id} only supports dialogue models.`);
      }
      await this.config.setModel({
        id: request.model.id,
        providerId: request.model.providerId,
        name: request.model.apiName,
        displayName: request.model.displayName,
        type: request.model.type,
        capabilities: capabilitiesFor(request.model.type),
        enabled: request.model.enabled,
      });
      return { projection: await this.project(), restartRequired: true };
    }
    if (request.operation === 'delete-model') {
      const model = this.config.getModel(request.modelId);
      if (!model) throw new Error(`Model ${request.modelId} does not exist.`);
      for (const type of ['llm', 'image', 'video', 'audio'] as const) {
        const current = this.config.getDefaultModelRef(type);
        if (current?.providerId === model.providerId && current.modelId === model.id) {
          throw new Error(
            `Model ${model.providerId}/${model.id} is the default ${type} model. Choose another default before deleting it.`,
          );
        }
      }
      await this.config.removeModel(model.id);
      return { projection: await this.project(), restartRequired: true };
    }
    if (request.operation === 'delete-provider') {
      const provider = this.config.getProvider(request.providerId);
      if (!provider) throw new Error(`Provider ${request.providerId} does not exist.`);
      if (provider.builtin === true) {
        throw new Error(`Builtin Provider ${provider.id} cannot be deleted.`);
      }
      const models = this.config.getModelsByProvider(provider.id);
      if (models.length > 0) {
        throw new Error(
          `Provider ${provider.id} still owns ${models.length} configured model(s). Delete them first.`,
        );
      }
      await this.config.removeProvider(provider.id);
      try {
        await this.credentials.delete(provider.id);
      } catch (error) {
        try {
          await this.config.setProvider(provider);
        } catch (rollbackError) {
          throw new Error(
            `Provider ${provider.id} was removed but credential cleanup and Provider restoration both failed. Credential error: ${describeError(error)}. Restore error: ${describeError(rollbackError)}.`,
            { cause: error },
          );
        }
        throw new Error(
          `Provider ${provider.id} credential cleanup failed, so its configuration was restored: ${describeError(error)}.`,
          { cause: error },
        );
      }
      return { projection: await this.project(), restartRequired: true };
    }
    await this.config.setDefaultModelRef(request.modelType, request.ref);
    return { projection: await this.project(), restartRequired: false };
  }

  private async projectProvider(providerId: string): Promise<DesktopAiProviderView> {
    const provider = this.config.getProvider(providerId);
    if (!provider) throw new Error(`Provider ${providerId} disappeared during projection.`);
    const protocol = toDesktopProtocol(provider.protocolProfile);
    if (!protocol) throw new Error(`Provider ${providerId} is not supported by DSH settings.`);
    if (provider.requiresApiKey === false) {
      return {
        id: provider.id,
        displayName: provider.displayName,
        apiUrl: provider.apiUrl,
        protocol,
        connectionKind: provider.connectionKind ?? 'direct',
        enabled: provider.enabled,
        builtin: provider.builtin ?? false,
        credentialStatus: 'not-required',
      };
    }
    try {
      const credential = await this.credentials.read(provider.id);
      return {
        id: provider.id,
        displayName: provider.displayName,
        apiUrl: provider.apiUrl,
        protocol,
        connectionKind: provider.connectionKind ?? 'direct',
        enabled: provider.enabled,
        builtin: provider.builtin ?? false,
        credentialStatus: credential ? 'configured' : 'missing',
      };
    } catch (error: unknown) {
      return {
        id: provider.id,
        displayName: provider.displayName,
        apiUrl: provider.apiUrl,
        protocol,
        connectionKind: provider.connectionKind ?? 'direct',
        enabled: provider.enabled,
        builtin: provider.builtin ?? false,
        credentialStatus: 'invalid',
        diagnostic: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function toDesktopProtocol(
  protocol: ProviderProtocolProfile | undefined,
): DesktopAiModelProtocol | undefined {
  if (protocol === 'newapi') return 'openai-chat';
  if (
    protocol === 'openai-chat' ||
    protocol === 'openai-responses' ||
    protocol === 'anthropic' ||
    protocol === 'ollama'
  ) {
    return protocol;
  }
  return undefined;
}

function capabilitiesFor(type: ModelType): ModelCapability[] {
  if (type === 'llm') return ['chat', 'llm.chat', 'streaming'];
  if (type === 'image') return ['text_to_image', 'image.generate'];
  if (type === 'video') return ['text_to_video', 'video.generate'];
  return ['text_to_audio', 'audio.generate'];
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
