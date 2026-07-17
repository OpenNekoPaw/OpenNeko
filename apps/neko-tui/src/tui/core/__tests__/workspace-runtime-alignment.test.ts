import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { UnifiedConfig } from '@neko/shared';
import { writeConfigFile } from '@neko/shared/config/config-reader';
import { ConfigManager, FileUserConfigManager } from '@neko/platform';
import { CliConfigLoadError, loadConfig } from '../config';

const originalHome = process.env['HOME'];

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env['HOME'];
  } else {
    process.env['HOME'] = originalHome;
  }
});

describe('TUI/Webview effective workspace runtime alignment', () => {
  it('resolves the same provider, model, scalars, media defaults, and MCP servers', async () => {
    const fixture = await createWorkspaceConfigFixture();
    writeConfigFile(fixture.userConfigPath, createUserConfig());
    writeConfigFile(fixture.workspaceConfigPath, createWorkspaceConfig());
    process.env['HOME'] = fixture.homeDir;

    const webviewConfig = new ConfigManager({
      userConfigManager: new FileUserConfigManager({ filePath: fixture.userConfigPath }),
      workspacePath: fixture.workDir,
    });
    try {
      const webviewSettings = webviewConfig.getAssistantRuntimeSettingsSnapshot();
      const webviewData = webviewConfig.getAssistantSettingsData();
      const tuiConfig = loadConfig(fixture.workDir);

      expect(tuiConfig.provider).toBe(webviewSettings.selectedProviderId);
      expect(tuiConfig.model).toBe(webviewSettings.selectedModelId);
      expect(tuiConfig.temperature).toBe(webviewSettings.temperature);
      expect(tuiConfig.maxTokens).toBe(webviewSettings.maxTokens);
      expect(tuiConfig.thinkingBudget).toBe(webviewSettings.thinkingBudget);
      expect(tuiConfig.defaultMediaModels).toEqual(webviewData.defaultMediaModels);
      expect(tuiConfig.mcpServers.map((server) => server.id)).toEqual([
        'user-files',
        'workspace-search',
      ]);
      expect(webviewData.configDiagnostic).toBeUndefined();
    } finally {
      webviewConfig.dispose();
    }
  });

  it('reports the same invalid workspace default diagnostic category', async () => {
    const fixture = await createWorkspaceConfigFixture();
    writeConfigFile(fixture.userConfigPath, createUserConfig());
    writeConfigFile(fixture.workspaceConfigPath, {
      ...createWorkspaceConfig(),
      defaultModels: {
        llm: { providerId: 'missing-provider', modelId: 'missing-model' },
      },
    });
    process.env['HOME'] = fixture.homeDir;

    const webviewConfig = new ConfigManager({
      userConfigManager: new FileUserConfigManager({ filePath: fixture.userConfigPath }),
      workspacePath: fixture.workDir,
    });
    try {
      const diagnostic = webviewConfig.getAssistantSettingsData().configDiagnostic;

      expect(diagnostic).toEqual(
        expect.objectContaining({
          code: 'invalidDefaultProvider',
          filePath: fixture.workspaceConfigPath,
        }),
      );
      try {
        loadConfig(fixture.workDir);
        expect.fail('Expected configuration loading to fail.');
      } catch (error) {
        expect(error).toBeInstanceOf(CliConfigLoadError);
        expect((error as CliConfigLoadError).diagnostic).toEqual({
          code: 'platform-config-unavailable',
          configCode: 'invalidDefaultProvider',
          filePath: fixture.workspaceConfigPath,
        });
      }
    } finally {
      webviewConfig.dispose();
    }
  });
});

async function createWorkspaceConfigFixture(): Promise<{
  readonly homeDir: string;
  readonly workDir: string;
  readonly userConfigPath: string;
  readonly workspaceConfigPath: string;
}> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-agent-align-'));
  const homeDir = path.join(rootDir, 'home');
  const workDir = path.join(rootDir, 'workspace');
  return {
    homeDir,
    workDir,
    userConfigPath: path.join(homeDir, '.neko', 'config.toml'),
    workspaceConfigPath: path.join(workDir, '.neko', 'config.toml'),
  };
}

function createUserConfig(): UnifiedConfig {
  return {
    defaultModels: {
      llm: { providerId: 'explicit-user', modelId: 'user-chat' },
      image: { providerId: 'explicit-user', modelId: 'user-image' },
    },
    temperature: 0.3,
    maxTokens: 4096,
    thinkingBudget: 8000,
    providers: [
      {
        id: 'explicit-user',
        name: 'explicit-user',
        displayName: 'Explicit User',
        type: 'generic',
        protocolProfile: 'openai-chat',
        apiUrl: 'https://ai.example.test/v1',
        apiKey: 'sk-test',
        enabled: true,
        requiresApiKey: true,
      },
    ],
    models: [
      {
        id: 'user-chat',
        name: 'user-chat',
        displayName: 'User Chat',
        providerId: 'explicit-user',
        type: 'llm',
        capabilities: ['chat'],
        enabled: true,
      },
      {
        id: 'user-image',
        name: 'user-image',
        displayName: 'User Image',
        providerId: 'explicit-user',
        type: 'image',
        capabilities: ['image.generate'],
        enabled: true,
      },
    ],
    mcpServers: [
      {
        id: 'user-files',
        name: 'User Files',
        description: 'User-level filesystem MCP.',
        category: 'filesystem',
        transport: 'stdio',
        command: 'node',
        args: ['user-files.js'],
        enabled: true,
      },
    ],
  };
}

function createWorkspaceConfig(): UnifiedConfig {
  return {
    defaultModels: {
      llm: { providerId: 'explicit-user', modelId: 'user-chat' },
      image: { providerId: 'explicit-user', modelId: 'user-image' },
    },
    temperature: 0.55,
    maxTokens: 2048,
    thinkingBudget: 4000,
    mcpServers: [
      {
        id: 'workspace-search',
        name: 'Workspace Search',
        description: 'Workspace search MCP.',
        category: 'development',
        transport: 'stdio',
        command: 'node',
        args: ['${workspaceFolder}/tools/search.js'],
        enabled: true,
      },
    ],
  };
}
