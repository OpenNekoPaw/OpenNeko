import type { AgentCredentialRuntime } from '@neko/agent-runtime/pi';
import type { MediaExecutionProviderResolver, MediaProvider } from '@neko/generation/media';
import type { ConfigManager } from '@neko/host/settings';

export function createDesktopMediaExecutionProviderResolver(input: {
  readonly config: Pick<ConfigManager, 'getProvider'>;
  readonly credentials: Pick<AgentCredentialRuntime['credentials'], 'read'>;
}): MediaExecutionProviderResolver {
  return Object.freeze({
    resolveProvider: async (providerId: string): Promise<MediaProvider | undefined> => {
      const provider = input.config.getProvider(providerId);
      if (provider === undefined || provider.id !== providerId || provider.enabled === false) {
        return undefined;
      }
      if (provider.requiresApiKey === false) return Object.freeze({ ...provider });

      const credential = await input.credentials.read(providerId);
      if (credential === undefined) return undefined;
      if (credential.type !== 'api_key') {
        throw new Error(`Media provider '${providerId}' requires an API-key credential.`);
      }
      return Object.freeze({ ...provider, apiKey: credential.key });
    },
  });
}
