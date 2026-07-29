import { describe, expect, it, vi } from 'vitest';
import {
  runProviderCredentialConfigFileChangeRuntime,
  runProviderCredentialConfigFileImportRuntime,
  type ProviderCredentialConfigFileImportRuntime,
} from '../config-file-import';

function createConfig(): ProviderCredentialConfigFileImportRuntime & {
  importProviderCredentialsFromConfigFiles: ReturnType<typeof vi.fn>;
} {
  return {
    importProviderCredentialsFromConfigFiles: vi.fn().mockResolvedValue({
      imported: [],
      failed: [],
    }),
  };
}

describe('provider credential config file import runtime', () => {
  it('imports provider credentials from config files with workspace path', async () => {
    const config = createConfig();

    const result = await runProviderCredentialConfigFileImportRuntime(
      { workspacePath: '/repo' },
      { config },
    );

    expect(config.importProviderCredentialsFromConfigFiles).toHaveBeenCalledWith({
      workspacePath: '/repo',
    });
    expect(result).toEqual({
      status: 'completed',
      result: { imported: [], failed: [] },
    });
  });

  it('logs per-provider import failures without failing the whole import', async () => {
    const config = createConfig();
    const logger = { error: vi.fn() };
    const failureError = new Error('bad key');
    config.importProviderCredentialsFromConfigFiles.mockResolvedValue({
      imported: [],
      failed: [{ id: 'openai', error: failureError }],
    });

    const result = await runProviderCredentialConfigFileImportRuntime({}, { config, logger });

    expect(result.status).toBe('completed');
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to import provider openai from config file:',
      failureError,
    );
  });

  it('captures top-level import exceptions', async () => {
    const config = createConfig();
    const logger = { error: vi.fn() };
    const error = new Error('read failed');
    config.importProviderCredentialsFromConfigFiles.mockRejectedValue(error);

    const result = await runProviderCredentialConfigFileImportRuntime({}, { config, logger });

    expect(result).toEqual({ status: 'failed', error });
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to import providers from config files:',
      error,
    );
  });

  it('does not notify config changed after config file change import', async () => {
    const config = createConfig();
    const notifyConfigChanged = vi.fn();

    const result = await runProviderCredentialConfigFileChangeRuntime(
      { workspacePath: '/repo' },
      { config, notifyConfigChanged },
    );

    expect(config.importProviderCredentialsFromConfigFiles).toHaveBeenCalledWith({
      workspacePath: '/repo',
    });
    expect(notifyConfigChanged).not.toHaveBeenCalled();
    expect(result.notified).toBe(false);
    expect(result.importResult.status).toBe('completed');
  });
});
