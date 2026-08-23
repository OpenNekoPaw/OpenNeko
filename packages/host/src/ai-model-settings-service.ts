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
    return {
      providers,
      models: this.config.getModels().map((model) => ({
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
          existing?.type ?? (request.provider.protocol === 'anthropic' ? 'anthropic' : 'generic'),
        apiUrl: request.provider.apiUrl,
        enabled: request.provider.enabled,
        connectionKind: existing?.connectionKind ?? 'direct',
        protocolProfile,
        supportLevel: existing?.supportLevel ?? 'custom',
        requiresApiKey: existing?.requiresApiKey ?? true,
        builtin: existing?.builtin ?? false,
        supportsBeta: existing?.supportsBeta ?? request.provider.protocol === 'anthropic',
        useBearerAuth: existing?.useBearerAuth ?? request.provider.protocol !== 'anthropic',
      });
      if (request.apiKey !== undefined) {
        await this.credentials.replaceApiKey(request.provider.id, request.apiKey);
      }
      return { projection: await this.project(), restartRequired: true };
    }
    if (request.operation === 'save-model') {
      if (!this.config.getProvider(request.model.providerId)) {
        throw new Error(`Provider ${request.model.providerId} does not exist.`);
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
    await this.config.setDefaultModelRef(request.modelType, request.ref);
    return { projection: await this.project(), restartRequired: false };
  }

  private async projectProvider(providerId: string): Promise<DesktopAiProviderView> {
    const provider = this.config.getProvider(providerId);
    if (!provider) throw new Error(`Provider ${providerId} disappeared during projection.`);
    const protocol = toDesktopProtocol(provider.protocolProfile);
    if (!protocol) throw new Error(`Provider ${providerId} is not supported by DSH settings.`);
    try {
      const credential = await this.credentials.read(provider.id);
      return {
        id: provider.id,
        displayName: provider.displayName,
        apiUrl: provider.apiUrl,
        protocol,
        enabled: provider.enabled,
        credentialStatus: credential ? 'configured' : 'missing',
      };
    } catch (error: unknown) {
      return {
        id: provider.id,
        displayName: provider.displayName,
        apiUrl: provider.apiUrl,
        protocol,
        enabled: provider.enabled,
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
  if (protocol === 'openai-chat' || protocol === 'openai-responses' || protocol === 'anthropic') {
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
