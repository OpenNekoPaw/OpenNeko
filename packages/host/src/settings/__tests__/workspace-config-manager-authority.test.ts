import { describe, expect, it, vi } from 'vitest';
import type { AssistantRuntimeSettingsPort } from '../assistant-runtime-settings-port';
import type { IUserConfigManager } from '../user-config';
import { WorkspaceConfigManagerAuthority } from '../workspace-config-manager-authority';

describe('WorkspaceConfigManagerAuthority', () => {
  it('returns one ConfigManager for one exact Workspace and one application config', () => {
    const authority = createAuthority();
    const binding = { workspaceId: 'workspace-a', workspacePath: '/workspace/a' };

    expect(authority.getWorkspaceConfig(binding)).toBe(authority.getWorkspaceConfig(binding));
    expect(authority.getApplicationConfig()).toBe(authority.getApplicationConfig());
    expect(authority.getApplicationConfig()).not.toBe(authority.getWorkspaceConfig(binding));
  });

  it('rejects Workspace identity reuse with another path', () => {
    const authority = createAuthority();
    authority.getWorkspaceConfig({ workspaceId: 'workspace-a', workspacePath: '/workspace/a' });

    expect(() =>
      authority.getWorkspaceConfig({
        workspaceId: 'workspace-a',
        workspacePath: '/workspace/other',
      }),
    ).toThrow("Workspace 'workspace-a' is already bound to another configuration path.");
  });

  it('rejects all access after application disposal', () => {
    const authority = createAuthority();
    authority.getApplicationConfig();
    authority.getWorkspaceConfig({ workspaceId: 'workspace-a', workspacePath: '/workspace/a' });

    authority.dispose();
    authority.dispose();

    expect(() => authority.getApplicationConfig()).toThrow(
      'Workspace configuration authority is disposed.',
    );
    expect(() =>
      authority.getWorkspaceConfig({ workspaceId: 'workspace-b', workspacePath: '/workspace/b' }),
    ).toThrow('Workspace configuration authority is disposed.');
  });

  it('reloads every materialized application and Workspace configuration', () => {
    const reload = vi.fn();
    const authority = createAuthority(reload);
    authority.getApplicationConfig();
    authority.getWorkspaceConfig({ workspaceId: 'workspace-a', workspacePath: '/workspace/a' });
    authority.getWorkspaceConfig({ workspaceId: 'workspace-b', workspacePath: '/workspace/b' });
    reload.mockClear();

    authority.reloadAll();

    expect(reload).toHaveBeenCalledTimes(3);
  });
});

function createAuthority(reload?: () => void): WorkspaceConfigManagerAuthority {
  const userConfigManager: IUserConfigManager = {
    load: () => ({ providers: [], models: [] }),
    loadRaw: () => ({ providers: [], models: [] }),
    loadRawResult: () => ({
      status: 'ok',
      filePath: '<workspace-config-authority-test>',
      config: { providers: [], models: [] },
      diagnostics: [],
      providerCredentials: {},
    }),
    save: async () => undefined,
    addProvider: async () => undefined,
    removeProvider: async () => undefined,
    addModel: async () => undefined,
    removeModel: async () => undefined,
    clear: async () => undefined,
    updateScalar: async () => undefined,
    updateScalars: async () => undefined,
    ...(reload ? { reload } : {}),
  };
  let runtimeSettings: ReturnType<AssistantRuntimeSettingsPort['snapshot']> = {};
  const assistantRuntimeSettings: AssistantRuntimeSettingsPort = {
    snapshot: () => runtimeSettings,
    commit: async (next) => {
      runtimeSettings = { ...next };
    },
    reset: async () => {
      runtimeSettings = {};
    },
    diagnostic: () => undefined,
  };
  return new WorkspaceConfigManagerAuthority({ userConfigManager, assistantRuntimeSettings });
}
