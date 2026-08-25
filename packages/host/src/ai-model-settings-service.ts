import type {
  ModelCapability,
  ModelType,
  ProviderModelFamily,
  ProviderProtocolProfile,
  ProviderType,
} from '@neko/ai-contracts';
import type { ConfigManager } from './settings/config-manager';
import type { ProviderCredentialAuthority } from './settings/provider-credential-authority';
import type {
  DesktopAiModelProtocol,
  DesktopAiModelSettingsProjection,
  DesktopAiModelSettingsRequest,
  DesktopAiProviderView,
} from './ai-model-settings-contract';
import {
  DESKTOP_AI_PROVIDER_PRESETS,
  getDesktopAiModelTemplate,
  getDesktopAiProviderPreset,
  type DesktopAiProviderPreset,
} from './ai-model-provider-presets';

export class DesktopAiModelSettingsService {
  constructor(
    private readonly config: ConfigManager,
    private readonly credentials: ProviderCredentialAuthority,
  ) {}

  async project(): Promise<DesktopAiModelSettingsProjection> {
    const providers = await Promise.all(
      this.config
        .getProviders()
        .filter((provider) => this.isProjectableProvider(provider.id))
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
    readonly executionConfigurationChanged: boolean;
  }> {
    if (request.operation === 'get')
      return { projection: await this.project(), executionConfigurationChanged: false };
    if (request.operation === 'save-provider') {
      const existing = this.config.getProvider(request.provider.id);
      const preset = request.provider.presetId
        ? getDesktopAiProviderPreset(request.provider.presetId)
        : undefined;
      if (!existing && !preset) {
        throw new Error(
          `New Provider ${request.provider.id} requires an explicit Provider preset.`,
        );
      }
      if (request.provider.presetId && !preset) {
        throw new Error(`Provider preset ${request.provider.presetId} does not exist.`);
      }
      if (existing && existing.type !== request.provider.type) {
        throw new Error(
          `Provider ${existing.id} type is immutable (${existing.type}); create another Provider for ${request.provider.type}.`,
        );
      }
      if (existing && request.provider.presetId) {
        throw new Error(
          `Provider ${existing.id} already exists. Choose another Provider ID or edit the existing record.`,
        );
      }
      if (preset) assertPresetMatchesRequest(preset, request.provider);
      assertProviderFamiliesSupported(request.provider);
      assertProviderProtocolMatchesType(request.provider);
      const isLocalOllama = request.provider.type === 'ollama';
      const requiresApiKey = preset?.requiresApiKey ?? existing?.requiresApiKey ?? !isLocalOllama;
      if (!requiresApiKey && request.apiKey !== undefined) {
        throw new Error(`Provider ${request.provider.id} does not accept an API key.`);
      }
      const protocolProfile = toCanonicalProtocolProfile(
        request.provider.type,
        request.provider.protocol,
      );
      await this.config.setProvider({
        id: request.provider.id,
        name: existing?.name ?? request.provider.id,
        displayName: request.provider.displayName,
        type: request.provider.type,
        apiUrl: request.provider.apiUrl,
        enabled: request.provider.enabled,
        connectionKind:
          preset?.connectionKind ??
          existing?.connectionKind ??
          (isLocalOllama ? 'local' : 'direct'),
        ...(protocolProfile === undefined ? {} : { protocolProfile }),
        supportLevel:
          preset === undefined
            ? (existing?.supportLevel ?? 'custom')
            : request.provider.apiUrl === preset.defaultApiUrl
              ? preset.supportLevel
              : 'custom',
        supportedModelFamilies: request.provider.supportedModelFamilies,
        requiresApiKey,
        supportsBeta: existing?.supportsBeta ?? request.provider.type === 'anthropic',
        useBearerAuth:
          existing?.useBearerAuth ?? (!isLocalOllama && request.provider.type !== 'anthropic'),
        ...(existing?.options ? { options: existing.options } : {}),
        ...(existing?.protocolVariant ? { protocolVariant: existing.protocolVariant } : {}),
      });
      if (request.apiKey !== undefined) {
        await this.credentials.replaceApiKey(request.provider.id, request.apiKey);
      }
      return { projection: await this.project(), executionConfigurationChanged: true };
    }
    if (request.operation === 'save-model') {
      const provider = this.config.getProvider(request.model.providerId);
      if (!provider) {
        throw new Error(`Provider ${request.model.providerId} does not exist.`);
      }
      const existingModel = this.config.getModel(request.model.id);
      if (existingModel && existingModel.providerId !== request.model.providerId) {
        throw new Error(
          `Model ${request.model.id} already belongs to Provider ${existingModel.providerId}. Choose another model ID.`,
        );
      }
      if (
        (provider.protocolProfile === 'ollama' || provider.type === 'ollama') &&
        request.model.type !== 'llm'
      ) {
        throw new Error(`Ollama Provider ${provider.id} only supports dialogue models.`);
      }
      const modelFamily = modelFamilyFor(request.model.type);
      if (
        provider.supportedModelFamilies !== undefined &&
        !provider.supportedModelFamilies.includes(modelFamily)
      ) {
        throw new Error(
          `Provider ${provider.id} does not support ${modelFamily} models. Add the model to a matching Provider instead.`,
        );
      }
      const template = request.model.templateId
        ? getDesktopAiModelTemplate(request.model.templateId)
        : undefined;
      if (request.model.templateId && !template) {
        throw new Error(`Model template ${request.model.templateId} does not exist.`);
      }
      if (template) {
        if (
          template.providerType !== provider.type ||
          template.apiName !== request.model.apiName ||
          template.type !== request.model.type
        ) {
          throw new Error(
            `Model template ${template.id} does not match ${provider.type}/${request.model.apiName}.`,
          );
        }
      }
      const matchingPresets = DESKTOP_AI_PROVIDER_PRESETS.filter(
        (preset) => preset.providerType === provider.type && preset.family === modelFamily,
      );
      if (
        matchingPresets.length > 0 &&
        matchingPresets.every((preset) => !preset.allowCustomModels) &&
        template === undefined
      ) {
        const templateIds = matchingPresets.flatMap((preset) =>
          preset.modelTemplates.map((candidate) => candidate.id),
        );
        throw new Error(
          `Provider ${provider.id} supports only builtin model templates: ${templateIds.join(', ')}.`,
        );
      }
      await this.config.setModel({
        id: request.model.id,
        providerId: request.model.providerId,
        name: request.model.apiName,
        displayName: request.model.displayName,
        type: request.model.type,
        capabilities: template ? [...template.capabilities] : capabilitiesFor(request.model.type),
        enabled: request.model.enabled,
      });
      return { projection: await this.project(), executionConfigurationChanged: true };
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
      return { projection: await this.project(), executionConfigurationChanged: true };
    }
    if (request.operation === 'delete-provider') {
      const provider = this.config.getProvider(request.providerId);
      if (!provider) throw new Error(`Provider ${request.providerId} does not exist.`);
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
      return { projection: await this.project(), executionConfigurationChanged: true };
    }
    await this.config.setDefaultModelRef(request.modelType, request.ref);
    return { projection: await this.project(), executionConfigurationChanged: true };
  }

  private async projectProvider(providerId: string): Promise<DesktopAiProviderView> {
    const provider = this.config.getProvider(providerId);
    if (!provider) throw new Error(`Provider ${providerId} disappeared during projection.`);
    const protocol = toDesktopProtocol(provider.protocolProfile);
    const families = this.projectModelFamilies(provider.id);
    if (families.includes('dialogue') && !protocol) {
      throw new Error(`Dialogue Provider ${providerId} is not supported by DSH settings.`);
    }
    const base = {
      id: provider.id,
      displayName: provider.displayName,
      type: provider.type,
      apiUrl: provider.apiUrl,
      ...(families.includes('dialogue') && protocol !== undefined ? { protocol } : {}),
      connectionKind: provider.connectionKind ?? 'direct',
      enabled: provider.enabled,
      supportedModelFamilies: families,
    } as const;
    if (provider.requiresApiKey === false) {
      return {
        ...base,
        credentialStatus: 'not-required',
      };
    }
    try {
      const credential = await this.credentials.read(provider.id);
      return {
        ...base,
        credentialStatus: credential ? 'configured' : 'missing',
      };
    } catch (error: unknown) {
      return {
        ...base,
        credentialStatus: 'invalid',
        diagnostic: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private projectModelFamilies(providerId: string): readonly ProviderModelFamily[] {
    const provider = this.config.getProvider(providerId);
    if (!provider) throw new Error(`Provider ${providerId} disappeared during projection.`);
    if (provider.supportedModelFamilies && provider.supportedModelFamilies.length > 0) {
      return provider.supportedModelFamilies;
    }
    const families = new Set(
      this.config
        .getModelsByProvider(providerId)
        .map((model) => modelFamilyFor(model.type ?? 'llm')),
    );
    if (families.size > 0) {
      return (['dialogue', 'generation'] as const).filter((family) => families.has(family));
    }
    if (isNativeGenerationProviderType(provider.type)) return ['generation'];
    return ['dialogue'];
  }

  private isProjectableProvider(providerId: string): boolean {
    const provider = this.config.getProvider(providerId);
    if (!provider) return false;
    const families = this.projectModelFamilies(providerId);
    return (
      (families.includes('dialogue') &&
        toDesktopProtocol(provider.protocolProfile) !== undefined) ||
      families.includes('generation')
    );
  }
}

function assertPresetMatchesRequest(
  preset: DesktopAiProviderPreset,
  provider: Extract<DesktopAiModelSettingsRequest, { operation: 'save-provider' }>['provider'],
): void {
  if (
    provider.type !== preset.providerType ||
    provider.supportedModelFamilies.length !== 1 ||
    provider.supportedModelFamilies[0] !== preset.family ||
    provider.protocol !== preset.protocol
  ) {
    throw new Error(`Provider preset ${preset.id} does not match the submitted Provider contract.`);
  }
}

function assertProviderFamiliesSupported(
  provider: Extract<DesktopAiModelSettingsRequest, { operation: 'save-provider' }>['provider'],
): void {
  const families = provider.supportedModelFamilies;
  if (families.length !== 1) {
    throw new Error(
      `Provider ${provider.id} must belong to exactly one dialogue or generation directory.`,
    );
  }
  if (provider.type === 'ollama' && (families.length !== 1 || families[0] !== 'dialogue')) {
    throw new Error(`Ollama Provider ${provider.id} only supports dialogue models.`);
  }
  if (
    isNativeGenerationProviderType(provider.type) &&
    (families.length !== 1 || families[0] !== 'generation')
  ) {
    throw new Error(`Provider ${provider.id} only supports generation models in Desktop Settings.`);
  }
  if (families.includes('dialogue') && provider.protocol === undefined) {
    throw new Error(`Dialogue Provider ${provider.id} requires an explicit DSH protocol.`);
  }
  if (!families.includes('dialogue') && provider.protocol !== undefined) {
    throw new Error(`Generation Provider ${provider.id} must not declare a DSH dialogue protocol.`);
  }
}

function assertProviderProtocolMatchesType(
  provider: Extract<DesktopAiModelSettingsRequest, { operation: 'save-provider' }>['provider'],
): void {
  const canonicalProtocol =
    provider.type === 'anthropic'
      ? 'anthropic'
      : provider.type === 'ollama'
        ? 'ollama'
        : provider.type === 'newapi'
          ? 'openai-chat'
          : undefined;
  if (canonicalProtocol !== undefined && provider.protocol !== canonicalProtocol) {
    throw new Error(
      `Provider ${provider.id} type ${provider.type} requires protocol ${canonicalProtocol}.`,
    );
  }
}

function toCanonicalProtocolProfile(
  providerType: ProviderType,
  protocol: DesktopAiModelProtocol | undefined,
): ProviderProtocolProfile | undefined {
  if (providerType === 'newapi') return 'newapi';
  if (providerType === 'ollama') return 'ollama';
  if (providerType === 'anthropic') return 'anthropic';
  return protocol;
}

function isNativeGenerationProviderType(type: ProviderType): boolean {
  return type === 'minimax' || type === 'bytedance';
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

function modelFamilyFor(type: ModelType): ProviderModelFamily {
  return type === 'llm' ? 'dialogue' : 'generation';
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
