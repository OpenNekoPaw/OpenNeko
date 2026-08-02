import type { AuthEvent } from '@neko-agent/runtime/pi';
import { describe, expect, it, vi } from 'vitest';
import {
  createDesktopAgentCredentialRuntime,
  type DesktopProtectedAuthPromptPort,
} from './desktop-agent-credential-runtime';

describe('DesktopAgentCredentialRuntime', () => {
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
    const runtime = createDesktopAgentCredentialRuntime({
      secrets,
      prompt: cancelledPrompt(),
    });

    const status = await runtime.credentials.replace(
      'fixture-provider',
      { type: 'api_key', key: 'host-only-secret' },
      'interactive',
    );

    expect(status).toMatchObject({
      providerId: 'fixture-provider',
      type: 'api_key',
      provenance: 'interactive',
    });
    expect(JSON.stringify(status)).not.toContain('host-only-secret');
    expect(secrets.set).toHaveBeenCalledOnce();
    expect(secrets.set.mock.calls[0]?.[0]).toBe('openneko.agent.pi.credential.v1:fixture-provider');
    expect(await runtime.credentials.read('fixture-provider')).toEqual({
      type: 'api_key',
      key: 'host-only-secret',
    });

    const reopened = createDesktopAgentCredentialRuntime({
      secrets,
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
    const runtime = createDesktopAgentCredentialRuntime({
      secrets: {
        get: async () => undefined,
        set: async () => undefined,
        delete: async () => undefined,
      },
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

    const cancelled = createDesktopAgentCredentialRuntime({
      secrets: {
        get: async () => undefined,
        set: async () => undefined,
        delete: async () => undefined,
      },
      prompt: cancelledPrompt(),
    });
    await expect(
      cancelled.interaction.prompt({ type: 'text', message: 'Account' }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

function cancelledPrompt(): DesktopProtectedAuthPromptPort {
  return {
    text: async () => null,
    select: async () => null,
    notify: () => undefined,
  };
}
