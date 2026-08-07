import * as fs from 'node:fs';

import { getUserConfigPath, readConfigFileResult } from './config-reader';

export type ProviderCredentialSourceEntry =
  | {
      readonly status: 'configured';
      readonly apiKey: string;
      readonly updatedAt: string;
    }
  | {
      readonly status: 'invalid';
      readonly path: string;
    };

export interface ProviderCredentialSource {
  read(providerId: string): Promise<ProviderCredentialSourceEntry | undefined>;
}

export interface FileProviderCredentialSourceOptions {
  readonly filePath?: string;
}

export class FileProviderCredentialSource implements ProviderCredentialSource {
  private readonly filePath: string;

  constructor(options: FileProviderCredentialSourceOptions = {}) {
    this.filePath = options.filePath ?? getUserConfigPath();
  }

  async read(providerId: string): Promise<ProviderCredentialSourceEntry | undefined> {
    const result = readConfigFileResult(this.filePath);
    if (result.status === 'missing') return undefined;
    if (result.status !== 'ok') {
      throw new Error(
        `Provider credential configuration is unavailable: ${result.filePath} (${result.status}).`,
      );
    }
    const declaration = result.providerCredentials[providerId];
    if (declaration === undefined) return undefined;
    if (declaration.status === 'invalid') {
      return {
        status: 'invalid',
        path:
          result.diagnostics.find(
            (diagnostic) =>
              diagnostic.code === 'invalidProviderApiKey' &&
              diagnostic.path === `providers.${providerId}.api_key`,
          )?.path ?? `providers.${providerId}.api_key`,
      };
    }
    return {
      status: 'configured',
      apiKey: declaration.apiKey,
      updatedAt: fs.statSync(this.filePath).mtime.toISOString(),
    };
  }
}
