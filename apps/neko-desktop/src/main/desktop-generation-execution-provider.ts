import type { PromptExecutionProviderResolver } from '@neko/generation-domain/prompt';
import type { ConfigManager, ProviderCredentialReader } from '@neko/host/settings';

export function createDesktopGenerationExecutionProviderResolver(input: {
  readonly config: Pick<ConfigManager, 'getProvider'>;
  readonly credentials: ProviderCredentialReader;
}): PromptExecutionProviderResolver {
  return Object.freeze({
    resolveProvider: async (providerId: string) => {
      const provider = input.config.getProvider(providerId);
      if (provider === undefined || provider.id !== providerId || provider.enabled === false) {
        return undefined;
      }
      if (provider.requiresApiKey === false) return Object.freeze({ ...provider });

      const credential = await input.credentials.read(providerId);
      if (credential === undefined) return undefined;
      return Object.freeze({ ...provider, apiKey: credential.key });
    },
  });
}
