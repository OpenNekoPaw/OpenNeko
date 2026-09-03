import type {
  ModelType,
  ProviderConfig,
  ProviderModelFamily,
  ProviderProtocolProfile,
  ProviderType,
} from '@neko/ai-contracts';
import type { ConfigManager } from './settings/config-manager';
import type { ProviderCredentialAuthority } from './settings/provider-credential-authority';
import type {
  DesktopAiDialogueCapabilityProjection,
  DesktopAiGenerationProviderCapability,
  DesktopAiModelSettingsProjection,
  DesktopAiModelSettingsRequest,
  DesktopAiProviderView,
} from './ai-model-settings-contract';
import { DESKTOP_AI_CUSTOM_DIALOGUE_PROVIDER_TYPES } from './ai-model-settings-contract';
import { requiredDesktopAiModelCapabilities } from './ai-model-provider-presets';

export interface DesktopAiDialogueCapabilityReader {
  read(): Promise<Extract<DesktopAiDialogueCapabilityProjection, { readonly status: 'available' }>>;
}

export interface DesktopAiGenerationCapabilityReader {
  read(): readonly DesktopAiGenerationProviderCapability[];
}

export function resolveDshDialogueProtocol(
  provider: Pick<ProviderConfig, 'protocolProfile' | 'protocolVariant'>,
): string | undefined {
  if (provider.protocolProfile === 'ollama') return 'openai-completions';
  if (provider.protocolProfile === 'openai-responses') return 'openai-responses';
  if (provider.protocolProfile === 'anthropic') return 'anthropic-messages';
  if (provider.protocolProfile === 'newapi' || provider.protocolProfile === 'openai-chat') {
    if (
      provider.protocolVariant?.authType !== undefined &&
      provider.protocolVariant.authType !== 'bearer'
    ) {
      return undefined;
    }
    return 'openai-completions';
  }
  return provider.protocolProfile;
}

export class DesktopAiModelSettingsService {
  constructor(
    private readonly config: ConfigManager,
    private readonly credentials: ProviderCredentialAuthority,
    private readonly dialogueCapabilities: DesktopAiDialogueCapabilityReader,
    private readonly generationCapabilities: DesktopAiGenerationCapabilityReader,
  ) {}

  async project(): Promise<DesktopAiModelSettingsProjection> {
    const dialogueCapabilities = await this.projectDialogueCapabilities();
    const generationCapabilities = this.generationCapabilities.read();
    const providers = await Promise.all(
      this.config
        .getProviders()
        .map((provider) => this.projectProvider(provider.id, dialogueCapabilities)),
    );
    const projectedProviderIds = new Set(providers.map((provider) => provider.id));
    return {
      dialogueCapabilities,
      generationCapabilities,
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
          capabilities: [...model.capabilities],
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
      const generationCapability = request.provider.presetId
        ? findGenerationCapability(this.generationCapabilities.read(), request.provider.presetId)
        : undefined;
      const isDialogue = request.provider.supportedModelFamilies.includes('dialogue');
      if (!existing && !generationCapability && !isDialogue) {
        throw new Error(
          `New Provider ${request.provider.id} requires an explicit Provider preset.`,
        );
      }
      if (request.provider.presetId && !generationCapability) {
        throw new Error(
          `Generation Provider capability ${request.provider.presetId} does not exist.`,
        );
      }
      if (existing && request.provider.presetId) {
        throw new Error(
          `Provider ${existing.id} already exists. Choose another Provider ID or edit the existing record.`,
        );
      }
      if (generationCapability) {
        assertGenerationCapabilityMatchesRequest(generationCapability, request.provider);
      }
      assertProviderFamiliesSupported(request.provider);
      if (isDialogue) {
        const dialogueCapabilities = await this.dialogueCapabilities.read();
        assertDialogueProviderCapability(request.provider, dialogueCapabilities);
        assertDialogueProviderTypeMutation(existing, request.provider, dialogueCapabilities);
      } else {
        if (existing && existing.type !== request.provider.type) {
          throw new Error(
            `Generation Provider ${existing.id} type is immutable (${existing.type}); create another Provider for ${request.provider.type}.`,
          );
        }
        const runtimeCapability =
          generationCapability ??
          findGenerationCapabilityForProvider(
            this.generationCapabilities.read(),
            request.provider.type,
          );
        if (!runtimeCapability) {
          throw new Error(
            `Provider type ${request.provider.type} is not supported by the generation runtime.`,
          );
        }
        if (runtimeCapability.requiresApiUrl && request.provider.apiUrl.length === 0) {
          throw new Error(`Generation Provider ${request.provider.id} requires an API endpoint.`);
        }
      }
      const requiresApiKey = request.provider.requiresApiKey;
      if (generationCapability && requiresApiKey !== generationCapability.requiresApiKey) {
        throw new Error(
          `Generation Provider ${request.provider.id} credential requirement is owned by capability ${generationCapability.id}.`,
        );
      }
      if (request.provider.type === 'ollama' && requiresApiKey) {
        throw new Error(`Ollama Provider ${request.provider.id} must not require an API key.`);
      }
      if (existing && requiresApiKey !== (existing.requiresApiKey ?? existing.type !== 'ollama')) {
        throw new Error(
          `Provider ${existing.id} credential requirement is immutable; create another Provider for the new authentication mode.`,
        );
      }
      if (!requiresApiKey && request.apiKey !== undefined) {
        throw new Error(`Provider ${request.provider.id} does not accept an API key.`);
      }
      if (!existing && requiresApiKey && request.apiKey === undefined) {
        throw new Error(`Provider ${request.provider.id} requires an API key.`);
      }
      await this.config.setProvider({
        id: request.provider.id,
        name: existing?.name ?? request.provider.id,
        displayName: request.provider.displayName,
        type: request.provider.type,
        apiUrl: request.provider.apiUrl,
        enabled: request.provider.enabled,
        connectionKind: request.provider.connectionKind,
        ...(request.provider.protocol === undefined
          ? {}
          : { protocolProfile: request.provider.protocol }),
        supportLevel:
          generationCapability === undefined
            ? (existing?.supportLevel ?? 'custom')
            : request.provider.apiUrl === generationCapability.defaultApiUrl
              ? generationCapability.supportLevel
              : 'custom',
        supportedModelFamilies: request.provider.supportedModelFamilies,
        requiresApiKey,
        supportsBeta: existing?.supportsBeta ?? request.provider.type === 'anthropic',
        useBearerAuth:
          existing?.useBearerAuth ??
          (request.provider.type !== 'ollama' && request.provider.type !== 'anthropic'),
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
      const existingModel = request.model.existingId
        ? this.config.getModel(request.model.existingId)
        : undefined;
      if (request.model.existingId && !existingModel) {
        throw new Error(`Model ${request.model.existingId} does not exist.`);
      }
      if (existingModel && existingModel.providerId !== request.model.providerId) {
        throw new Error(
          `Model ${existingModel.id} belongs to Provider ${existingModel.providerId}, not ${request.model.providerId}.`,
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
      const generationCapability =
        request.model.type === 'llm'
          ? undefined
          : findGenerationCapabilityForProvider(this.generationCapabilities.read(), provider.type);
      if (request.model.type !== 'llm' && !generationCapability) {
        throw new Error(
          `Provider ${provider.id} type ${provider.type} is not supported by the generation runtime.`,
        );
      }
      if (
        generationCapability &&
        request.model.type !== 'llm' &&
        !generationCapability.supportedModelTypes.includes(request.model.type)
      ) {
        throw new Error(
          `Provider ${provider.id} does not support ${request.model.type} generation models.`,
        );
      }
      const template = request.model.templateId
        ? generationCapability?.modelTemplates.find(
            (candidate) => candidate.id === request.model.templateId,
          )
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
        if (!sameCapabilities(request.model.capabilities, template.capabilities)) {
          throw new Error(`Model template ${template.id} owns its capability declaration.`);
        }
      } else {
        assertRequiredModelCapabilities(request.model.type, request.model.capabilities);
      }
      if (
        generationCapability !== undefined &&
        !generationCapability.allowCustomModels &&
        template === undefined
      ) {
        const templateIds = generationCapability.modelTemplates.map((candidate) => candidate.id);
        throw new Error(
          `Provider ${provider.id} supports only builtin model templates: ${templateIds.join(', ')}.`,
        );
      }
      const modelId =
        existingModel?.id ??
        (template
          ? modelIdForTemplate(provider.id, template.id)
          : modelIdForCustomModel(provider.id, request.model.apiName));
      if (!existingModel && this.config.getModel(modelId)) {
        throw new Error(
          `Provider ${provider.id} already has a model derived from '${request.model.apiName}'. Edit that model or choose another model name.`,
        );
      }
      await this.config.setModel({
        id: modelId,
        providerId: request.model.providerId,
        name: request.model.apiName,
        displayName: request.model.displayName,
        type: request.model.type,
        capabilities: template ? [...template.capabilities] : [...request.model.capabilities],
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
      const selected = this.config.getAssistantSettingsSnapshot();
      const clearsRuntimeSelection =
        selected.selectedProviderId === model.providerId && selected.selectedModelId === model.id;
      await this.config.removeModel(model.id);
      if (clearsRuntimeSelection) {
        try {
          await this.config.clearAssistantModelSelection();
        } catch (error) {
          try {
            await this.config.setModel(model);
          } catch (rollbackError) {
            throw new Error(
              `Model ${model.providerId}/${model.id} was removed but the stale Composer selection could not be cleared and the model could not be restored. Selection error: ${describeError(error)}. Restore error: ${describeError(rollbackError)}.`,
              { cause: error },
            );
          }
          throw new Error(
            `Model ${model.providerId}/${model.id} deletion was reverted because its stale Composer selection could not be cleared: ${describeError(error)}.`,
            { cause: error },
          );
        }
      }
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

  private async projectProvider(
    providerId: string,
    capabilities: DesktopAiDialogueCapabilityProjection,
  ): Promise<DesktopAiProviderView> {
    const provider = this.config.getProvider(providerId);
    if (!provider) throw new Error(`Provider ${providerId} disappeared during projection.`);
    const protocol = resolveDshDialogueProtocol(provider);
    const families = this.projectModelFamilies(provider.id);
    const capabilityDiagnostic = families.includes('dialogue')
      ? dialogueProviderDiagnostic(provider.id, protocol, capabilities)
      : undefined;
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
        ...(capabilityDiagnostic === undefined ? {} : { diagnostic: capabilityDiagnostic }),
      };
    }
    try {
      const credential = await this.credentials.read(provider.id);
      return {
        ...base,
        credentialStatus: credential ? 'configured' : 'missing',
        ...(capabilityDiagnostic === undefined ? {} : { diagnostic: capabilityDiagnostic }),
      };
    } catch (error: unknown) {
      return {
        ...base,
        credentialStatus: 'invalid',
        diagnostic: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async projectDialogueCapabilities(): Promise<DesktopAiDialogueCapabilityProjection> {
    try {
      return await this.dialogueCapabilities.read();
    } catch (error) {
      return {
        status: 'unavailable',
        providers: [],
        protocols: [],
        diagnostics: [`DSH Provider capabilities are unavailable: ${describeError(error)}`],
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
}

function assertGenerationCapabilityMatchesRequest(
  capability: DesktopAiGenerationProviderCapability,
  provider: Extract<DesktopAiModelSettingsRequest, { operation: 'save-provider' }>['provider'],
): void {
  if (
    provider.type !== capability.providerType ||
    provider.connectionKind !== capability.connectionKind ||
    provider.requiresApiKey !== capability.requiresApiKey ||
    provider.supportedModelFamilies.length !== 1 ||
    provider.supportedModelFamilies[0] !== 'generation' ||
    provider.protocol !== undefined
  ) {
    throw new Error(
      `Generation Provider capability ${capability.id} does not match the submitted Provider contract.`,
    );
  }
  if (capability.requiresApiUrl && provider.apiUrl.length === 0) {
    throw new Error(`Generation Provider ${provider.id} requires an API endpoint.`);
  }
}

function findGenerationCapability(
  capabilities: readonly DesktopAiGenerationProviderCapability[],
  id: string,
): DesktopAiGenerationProviderCapability | undefined {
  return capabilities.find((capability) => capability.id === id);
}

function findGenerationCapabilityForProvider(
  capabilities: readonly DesktopAiGenerationProviderCapability[],
  providerType: ProviderType,
): DesktopAiGenerationProviderCapability | undefined {
  return capabilities.find((capability) => capability.providerType === providerType);
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
  if (!families.includes('dialogue') && provider.protocol !== undefined) {
    throw new Error(`Generation Provider ${provider.id} must not declare a DSH dialogue protocol.`);
  }
}
function assertDialogueProviderCapability(
  provider: Extract<DesktopAiModelSettingsRequest, { operation: 'save-provider' }>['provider'],
  capabilities: Extract<DesktopAiDialogueCapabilityProjection, { readonly status: 'available' }>,
): void {
  if (provider.protocol !== undefined) {
    if (!DESKTOP_AI_CUSTOM_DIALOGUE_PROVIDER_TYPES.some((type) => type === provider.type)) {
      throw new Error(
        `Dialogue Provider ${provider.id} type '${provider.type}' is not available for a custom DSH route.`,
      );
    }
    if (!capabilities.protocols.includes(provider.protocol)) {
      throw new Error(
        `Dialogue Provider ${provider.id} protocol '${provider.protocol}' is not advertised by the current DSH runtime.`,
      );
    }
    if (provider.apiUrl.trim().length === 0) {
      throw new Error(
        `Dialogue Provider ${provider.id} requires an API endpoint when overriding the DSH protocol.`,
      );
    }
    return;
  }
  const catalog = capabilities.providers.find(
    (candidate) => candidate.providerId === provider.id && candidate.source === 'catalog',
  );
  if (catalog === undefined) {
    throw new Error(
      `Dialogue Provider ${provider.id} must select a protocol advertised by DSH because it is not a DSH catalog route.`,
    );
  }
  if (
    provider.type !== catalog.providerType ||
    provider.connectionKind !== catalog.connectionKind ||
    provider.requiresApiKey !== catalog.requiresApiKey
  ) {
    throw new Error(
      `Dialogue Provider ${provider.id} must preserve its DSH catalog type, connection, and credential requirements.`,
    );
  }
}

function assertDialogueProviderTypeMutation(
  existing: ReturnType<ConfigManager['getProvider']>,
  provider: Extract<DesktopAiModelSettingsRequest, { operation: 'save-provider' }>['provider'],
  capabilities: Extract<DesktopAiDialogueCapabilityProjection, { readonly status: 'available' }>,
): void {
  if (!existing || existing.type === provider.type) return;
  if (capabilities.providers.some((candidate) => candidate.providerId === existing.id)) {
    throw new Error(`DSH catalog Provider ${existing.id} type is immutable (${existing.type}).`);
  }
}

function isNativeGenerationProviderType(type: ProviderType): boolean {
  return type === 'minimax' || type === 'bytedance';
}

function dialogueProviderDiagnostic(
  providerId: string,
  protocol: ProviderProtocolProfile | undefined,
  capabilities: DesktopAiDialogueCapabilityProjection,
): string | undefined {
  if (capabilities.status === 'unavailable') return capabilities.diagnostics.join(' ');
  if (protocol !== undefined) {
    return capabilities.protocols.includes(protocol)
      ? undefined
      : `Protocol '${protocol}' is not advertised by the current DSH runtime.`;
  }
  return capabilities.providers.some(
    (candidate) => candidate.providerId === providerId && candidate.source === 'catalog',
  )
    ? undefined
    : `Provider '${providerId}' is not an executable DSH catalog route and has no explicit protocol.`;
}

function modelFamilyFor(type: ModelType): ProviderModelFamily {
  return type === 'llm' ? 'dialogue' : 'generation';
}

function assertRequiredModelCapabilities(type: ModelType, capabilities: readonly string[]): void {
  const required = requiredDesktopAiModelCapabilities(type);
  const missing = required.filter((capability) => !capabilities.includes(capability));
  if (missing.length > 0) {
    throw new Error(`Model type ${type} requires capabilities: ${missing.join(', ')}.`);
  }
}

function sameCapabilities(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((capability) => right.includes(capability));
}

function modelIdForTemplate(providerId: string, templateId: string): string {
  return `${providerId}-${templateId}`;
}

function modelIdForCustomModel(providerId: string, apiName: string): string {
  const segment = encodeURIComponent(apiName.toLowerCase())
    .replaceAll('%', '')
    .replace(/[^a-z0-9._:-]+/giu, '-')
    .replace(/^-+|-+$/gu, '');
  if (segment.length === 0) {
    throw new Error('Custom model name cannot produce a model identity.');
  }
  return `${providerId}:${segment}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
