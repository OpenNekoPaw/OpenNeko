import type { AuthEvent } from '@neko/agent-runtime/pi';
import { describe, expect, it, vi } from 'vitest';
import { createAgentCredentialRuntime, type ProtectedAuthPromptPort } from './credential-runtime';

describe('AgentCredentialRuntime', () => {
  it('uses a config-owned API key without reading or writing SecretStorage', async () => {
    const secrets = {
      get: vi.fn(async () => 'must-not-be-read'),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const runtime = createAgentCredentialRuntime({
      secrets,
      configCredentials: {
        read: async () => ({
          status: 'configured',
          apiKey: 'config-owned-secret',
          updatedAt: '2026-08-07T00:00:00.000Z',
        }),
      },
      prompt: cancelledPrompt(),
    });

    await expect(runtime.credentials.read('fixture-provider')).resolves.toEqual({
      type: 'api_key',
      key: 'config-owned-secret',
    });
    await expect(runtime.credentials.status('fixture-provider')).resolves.toMatchObject({
      providerId: 'fixture-provider',
      provenance: 'config',
    });
    await expect(runtime.credentials.delete('fixture-provider')).rejects.toThrow(
      'Failed to delete credential',
    );
    expect(secrets.get).not.toHaveBeenCalled();
    expect(secrets.set).not.toHaveBeenCalled();
    expect(secrets.delete).not.toHaveBeenCalled();
  });

  it('fails closed for an invalid config-owned API key without reading SecretStorage', async () => {
    const secrets = {
      get: vi.fn(async () => 'stored-interactive-secret'),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const runtime = createAgentCredentialRuntime({
      secrets,
      configCredentials: {
        read: async () => ({
          status: 'invalid',
          path: 'providers.fixture-provider.api_key',
        }),
      },
      prompt: cancelledPrompt(),
    });

    const failure = await runtime.credentials.read('fixture-provider').then(
      () => 'unexpected success',
      (error: unknown) => String(error),
    );
    expect(failure).toContain('Failed to read credential');
    expect(failure).not.toContain('stored-interactive-secret');
    expect(secrets.get).not.toHaveBeenCalled();
  });

  it('persists Pi credentials only through HostSecretPort and projects secret-free status', async () => {
    const stored = new Map<string, string>();
    const secrets = {
      get: vi.fn(async (key: string) => stored.get(key)),
      set: vi.fn(async (key: string, value: string) => {
        stored.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        stored.delete(key);
      }),
    };
    const runtime = createAgentCredentialRuntime({
      secrets,
      configCredentials: absentConfigCredentials(),
      prompt: cancelledPrompt(),
    });

    const status = await runtime.credentials.replace('fixture-provider', {
      type: 'api_key',
      key: 'host-only-secret',
    });

    expect(status).toMatchObject({
      providerId: 'fixture-provider',
      type: 'api_key',
      provenance: 'interactive',
    });
    expect(JSON.stringify(status)).not.toContain('host-only-secret');
    expect(secrets.set).toHaveBeenCalledOnce();
    expect(secrets.set.mock.calls[0]?.[0]).toBe('openneko.agent.pi.credential:fixture-provider');
    expect(await runtime.credentials.read('fixture-provider')).toEqual({
      type: 'api_key',
      key: 'host-only-secret',
    });

    const reopened = createAgentCredentialRuntime({
      secrets,
      configCredentials: absentConfigCredentials(),
      prompt: cancelledPrompt(),
    });
    await expect(reopened.credentials.read('fixture-provider')).resolves.toEqual({
      type: 'api_key',
      key: 'host-only-secret',
    });
    await reopened.auth.logout('fixture-provider');
    await expect(reopened.credentials.read('fixture-provider')).resolves.toBeUndefined();
  });

  it('routes secret/select prompts through protected Host UI and rejects cancellation', async () => {
    const text = vi.fn(async () => 'entered-secret');
    const select = vi.fn(async () => 'oauth');
    const notify = vi.fn<(event: AuthEvent) => void>();
    const runtime = createAgentCredentialRuntime({
      secrets: {
        get: async () => undefined,
        set: async () => undefined,
        delete: async () => undefined,
      },
      configCredentials: absentConfigCredentials(),
      prompt: { text, select, notify },
    });

    await expect(
      runtime.interaction.prompt({
        type: 'secret',
        message: 'API key',
        placeholder: 'key',
      }),
    ).resolves.toBe('entered-secret');
    await expect(
      runtime.interaction.prompt({
        type: 'select',
        message: 'Login method',
        options: [{ id: 'oauth', label: 'OAuth' }],
      }),
    ).resolves.toBe('oauth');
    expect(text).toHaveBeenCalledWith({
      message: 'API key',
      placeholder: 'key',
      secret: true,
    });
    expect(select).toHaveBeenCalledWith({
      message: 'Login method',
      options: [{ id: 'oauth', label: 'OAuth' }],
    });

    const cancelled = createAgentCredentialRuntime({
      secrets: {
        get: async () => undefined,
        set: async () => undefined,
        delete: async () => undefined,
      },
      configCredentials: absentConfigCredentials(),
      prompt: cancelledPrompt(),
    });
    await expect(
      cancelled.interaction.prompt({ type: 'text', message: 'Account' }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

function cancelledPrompt(): ProtectedAuthPromptPort {
  return {
    text: async () => null,
    select: async () => null,
    notify: () => undefined,
  };
}

function absentConfigCredentials() {
  return { read: async () => undefined };
}
