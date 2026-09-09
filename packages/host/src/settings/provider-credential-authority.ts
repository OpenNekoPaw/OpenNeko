import { getUserConfigPath, readConfigFileResult } from './config-reader';
import type { ProviderCredentialDeclaration } from './config-core/index';

export interface ProviderApiKeyCredential {
  readonly type: 'api_key';
  readonly key: string;
}

export interface ProviderCredentialReader {
  read(providerId: string): Promise<ProviderApiKeyCredential | undefined>;
}

export class ProviderCredentialAuthority implements ProviderCredentialReader {
  private readonly filePath: string;

  constructor(options: { readonly filePath?: string } = {}) {
    this.filePath = options.filePath ?? getUserConfigPath();
  }

  async read(providerId: string): Promise<ProviderApiKeyCredential | undefined> {
    const declaration = this.readDeclaration(providerId);
    return declaration === undefined ? undefined : { type: 'api_key', key: declaration.apiKey };
  }

  async status(providerId: string): Promise<'configured' | 'missing'> {
    return this.readDeclaration(providerId) === undefined ? 'missing' : 'configured';
  }

  private readDeclaration(
    providerId: string,
  ): Extract<ProviderCredentialDeclaration, { readonly status: 'configured' }> | undefined {
    if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(providerId)) {
      throw new Error('Provider credential identity is invalid.');
    }
    const result = readConfigFileResult(this.filePath);
    if (result.status === 'missing') return undefined;
    if (result.status !== 'ok') {
      throw new Error(`Provider credential configuration is unavailable (${result.status}).`);
    }
    const declaration = result.providerCredentials[providerId];
    if (declaration?.status === 'invalid') {
      throw new Error(
        `Provider '${providerId}' credential is invalid at providers.${providerId}.api_key.`,
      );
    }
    return declaration;
  }
}
