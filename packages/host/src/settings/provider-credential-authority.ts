import type { HostSecretPort } from '../ports';
import type {
  ProviderCredentialSource,
  ProviderCredentialSourceEntry,
} from './provider-credential-source';

const PROVIDER_CREDENTIAL_SECRET_KEY_PREFIX = 'openneko.provider.credential:';

export interface ProviderApiKeyCredential {
  readonly type: 'api_key';
  readonly key: string;
}

export interface ProviderCredentialReader {
  read(providerId: string): Promise<ProviderApiKeyCredential | undefined>;
}

export class ProviderCredentialAuthority implements ProviderCredentialReader {
  constructor(
    private readonly secrets: HostSecretPort,
    private readonly configCredentials: ProviderCredentialSource,
  ) {}

  async read(providerId: string): Promise<ProviderApiKeyCredential | undefined> {
    const identity = requireProviderId(providerId);
    const configured = await this.configCredentials.read(identity);
    if (configured?.status === 'invalid') throw invalidConfigCredential(identity, configured);
    if (configured?.status === 'configured') {
      return Object.freeze({ type: 'api_key', key: configured.apiKey });
    }

    const stored = await this.secrets.get(secretKey(identity));
    if (stored === undefined) return undefined;
    requireApiKey(stored);
    return Object.freeze({ type: 'api_key', key: stored });
  }

  async replaceApiKey(providerId: string, apiKey: string): Promise<void> {
    const identity = requireProviderId(providerId);
    await this.assertSecretStoreOwns(identity);
    await this.secrets.set(secretKey(identity), requireApiKey(apiKey));
  }

  async delete(providerId: string): Promise<void> {
    const identity = requireProviderId(providerId);
    await this.assertSecretStoreOwns(identity);
    await this.secrets.delete(secretKey(identity));
  }

  private async assertSecretStoreOwns(providerId: string): Promise<void> {
    const configured = await this.configCredentials.read(providerId);
    if (configured?.status === 'invalid') throw invalidConfigCredential(providerId, configured);
    if (configured?.status === 'configured') {
      throw new Error(
        `Provider '${providerId}' credential is owned by providers.${providerId}.api_key in user config.`,
      );
    }
  }
}

function requireProviderId(providerId: string): string {
  if (
    providerId.length === 0 ||
    providerId !== providerId.trim() ||
    !/^[a-z0-9][a-z0-9._-]*$/iu.test(providerId)
  ) {
    throw new Error('Provider credential identity is invalid.');
  }
  return providerId;
}

function requireApiKey(apiKey: string): string {
  if (apiKey.length === 0) throw new Error('Provider API-key credential must not be empty.');
  return apiKey;
}

function invalidConfigCredential(
  providerId: string,
  entry: Extract<ProviderCredentialSourceEntry, { readonly status: 'invalid' }>,
): Error {
  return new Error(`Provider '${providerId}' credential source is invalid at ${entry.path}.`);
}

function secretKey(providerId: string): string {
  return `${PROVIDER_CREDENTIAL_SECRET_KEY_PREFIX}${providerId}`;
}
