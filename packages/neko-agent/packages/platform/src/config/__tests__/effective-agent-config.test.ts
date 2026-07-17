import { describe, expect, it } from 'vitest';
import type { UnifiedConfig } from '@neko/shared';
import type { ConfigReadResult } from '@neko/shared/config/config-reader';
import { resolveEffectiveAgentWorkspaceConfigSnapshot } from '../effective-agent-config';
import type { MCPServerPreset } from '../../types/config';
import type { Model, Provider } from '../../types/provider';

const USER_CONFIG_PATH = '/home/.neko/config.toml';
const WORKSPACE_CONFIG_PATH = '/workspace/.neko/config.toml';

function okConfig(filePath: string, config: UnifiedConfig): ConfigReadResult {
  return { status: 'ok', filePath, config };
}

function invalidTomlConfig(filePath: string): ConfigReadResult {
  return {
    status: 'invalidToml',
    filePath,
    diagnostic: {
      code: 'invalidToml',
      filePath,
      message: 'invalid test TOML',
    },
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
    executionMode: 'ask',
    providers: [
      {
        id: 'explicit-user',
        name: 'explicit-user',
        displayName: 'Explicit User',
        type: 'generic',
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
        capabilities: ['chat', 'function_calling'],
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
    executionMode: 'auto',
    mcpServers: [
      {
        id: 'project-search',
        name: 'Project Search',
        description: 'Project-local search MCP.',
        category: 'development',
        transport: 'stdio',
        command: 'node',
        args: ['${workspaceFolder}/tools/project-search.js'],
        enabled: true,
      },
    ],
  };
}

function explicitProviders(config: UnifiedConfig): readonly Provider[] {
  return (config.providers ?? []) as readonly Provider[];
}

function explicitModels(config: UnifiedConfig): readonly Model[] {
  return (config.models ?? []) as readonly Model[];
}

function mergedMcpServers(
  userConfig: UnifiedConfig,
  workspaceConfig: UnifiedConfig,
): readonly MCPServerPreset[] {
  return [...(userConfig.mcpServers ?? []), ...(workspaceConfig.mcpServers ?? [])];
}

describe('resolveEffectiveAgentWorkspaceConfigSnapshot', () => {
  it('resolves workspace defaults, scalars, media defaults, and merged MCP servers', () => {
    const userConfig = createUserConfig();
    const workspaceConfig = createWorkspaceConfig();

    const snapshot = resolveEffectiveAgentWorkspaceConfigSnapshot({
      userConfigReadResult: okConfig(USER_CONFIG_PATH, userConfig),
      workspaceConfigReadResult: okConfig(WORKSPACE_CONFIG_PATH, workspaceConfig),
      providers: explicitProviders(userConfig),
      models: explicitModels(userConfig),
      mcpServers: mergedMcpServers(userConfig, workspaceConfig),
    });

    expect(snapshot.providerId).toBe('explicit-user');
    expect(snapshot.modelId).toBe('user-chat');
    expect(snapshot.temperature).toBe(0.55);
    expect(snapshot.maxTokens).toBe(2048);
    expect(snapshot.thinkingBudget).toBe(4000);
    expect(snapshot.executionMode).toBe('auto');
    expect(snapshot.defaultMediaModels.image).toBe('explicit-user:user-image');
    expect(snapshot.sources).toEqual(
      expect.objectContaining({
        provider: 'workspace',
        model: 'workspace',
        temperature: 'workspace',
        maxTokens: 'workspace',
        thinkingBudget: 'workspace',
        executionMode: 'workspace',
      }),
    );
    expect(snapshot.mcpServers.map((server) => server.id)).toEqual([
      'user-files',
      'project-search',
    ]);
    expect(snapshot.diagnostics).toEqual([]);
  });

  it('keeps runtime overrides session-only in the resolved snapshot', () => {
    const userConfig = createUserConfig();
    const workspaceConfig = createWorkspaceConfig();

    const snapshot = resolveEffectiveAgentWorkspaceConfigSnapshot({
      userConfigReadResult: okConfig(USER_CONFIG_PATH, userConfig),
      workspaceConfigReadResult: okConfig(WORKSPACE_CONFIG_PATH, workspaceConfig),
      providers: explicitProviders(userConfig),
      models: explicitModels(userConfig),
      mcpServers: mergedMcpServers(userConfig, workspaceConfig),
      runtimeOverrides: {
        selectedProviderId: 'explicit-user',
        selectedModelId: 'user-chat',
        temperature: 0.9,
        maxTokens: 1234,
        thinkingBudget: 64,
        executionMode: 'plan',
        defaultMediaModels: { image: 'runtime:image-model' },
      },
    });

    expect(snapshot.providerId).toBe('explicit-user');
    expect(snapshot.modelId).toBe('user-chat');
    expect(snapshot.temperature).toBe(0.9);
    expect(snapshot.maxTokens).toBe(1234);
    expect(snapshot.thinkingBudget).toBe(64);
    expect(snapshot.executionMode).toBe('plan');
    expect(snapshot.defaultMediaModels.image).toBe('runtime:image-model');
    expect(snapshot.sources).toEqual(
      expect.objectContaining({
        provider: 'runtime',
        model: 'runtime',
        temperature: 'runtime',
        maxTokens: 'runtime',
        thinkingBudget: 'runtime',
        executionMode: 'runtime',
      }),
    );
    expect(userConfig.temperature).toBe(0.3);
    expect(workspaceConfig.temperature).toBe(0.55);
  });

  it('does not silently fall back when workspace selects an invalid default model source', () => {
    const userConfig = createUserConfig();
    const workspaceConfig: UnifiedConfig = {
      ...createWorkspaceConfig(),
      defaultModels: {
        llm: { providerId: 'missing-provider', modelId: 'missing-model' },
      },
    };

    const snapshot = resolveEffectiveAgentWorkspaceConfigSnapshot({
      userConfigReadResult: okConfig(USER_CONFIG_PATH, userConfig),
      workspaceConfigReadResult: okConfig(WORKSPACE_CONFIG_PATH, workspaceConfig),
      providers: explicitProviders(userConfig),
      models: explicitModels(userConfig),
      mcpServers: mergedMcpServers(userConfig, workspaceConfig),
    });

    expect(snapshot.providerId).toBe('missing-provider');
    expect(snapshot.modelId).toBe('missing-model');
    expect(snapshot.provider).toBeUndefined();
    expect(snapshot.model).toBeUndefined();
    expect(snapshot.blockingDiagnostic).toEqual(
      expect.objectContaining({
        code: 'invalidDefaultProvider',
        filePath: WORKSPACE_CONFIG_PATH,
      }),
    );
  });

  it('keeps provider and model unset when no explicit default exists', () => {
    const userConfig = createUserConfig();
    delete userConfig.defaultProvider;
    delete userConfig.defaultModel;
    delete userConfig.defaultModels;

    const snapshot = resolveEffectiveAgentWorkspaceConfigSnapshot({
      userConfigReadResult: okConfig(USER_CONFIG_PATH, userConfig),
      workspaceConfigReadResult: { status: 'missing', filePath: WORKSPACE_CONFIG_PATH },
      providers: explicitProviders(userConfig),
      models: explicitModels(userConfig),
      mcpServers: userConfig.mcpServers as readonly MCPServerPreset[],
    });

    expect(snapshot.providerId).toBeNull();
    expect(snapshot.modelId).toBeNull();
    expect(snapshot.sources.provider).toBe('default');
    expect(snapshot.sources.model).toBe('default');
    expect(snapshot.diagnostics).toEqual([]);
  });

  it('projects config read diagnostics into the shared blocking diagnostic model', () => {
    const userConfig = createUserConfig();

    const snapshot = resolveEffectiveAgentWorkspaceConfigSnapshot({
      userConfigReadResult: okConfig(USER_CONFIG_PATH, userConfig),
      workspaceConfigReadResult: invalidTomlConfig(WORKSPACE_CONFIG_PATH),
      providers: explicitProviders(userConfig),
      models: explicitModels(userConfig),
      mcpServers: userConfig.mcpServers as readonly MCPServerPreset[],
    });

    expect(snapshot.blockingDiagnostic).toEqual(
      expect.objectContaining({
        code: 'invalidToml',
        filePath: WORKSPACE_CONFIG_PATH,
      }),
    );
    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.code)).toContain('invalidToml');
  });

  it('rejects workspace-local provider and model definitions with policy diagnostics', () => {
    const userConfig = createUserConfig();
    const workspaceConfig: UnifiedConfig = {
      ...createWorkspaceConfig(),
      providers: [
        {
          id: 'workspace-provider',
          name: 'Workspace Provider',
          type: 'generic',
          apiUrl: 'https://workspace.example.test/v1',
          apiKey: 'sk-workspace',
          enabled: true,
        },
      ],
      models: [
        {
          id: 'workspace-model',
          name: 'workspace-model',
          providerId: 'workspace-provider',
          type: 'llm',
          capabilities: ['chat'],
          enabled: true,
        },
      ],
    };

    const snapshot = resolveEffectiveAgentWorkspaceConfigSnapshot({
      userConfigReadResult: okConfig(USER_CONFIG_PATH, userConfig),
      workspaceConfigReadResult: okConfig(WORKSPACE_CONFIG_PATH, workspaceConfig),
      providers: explicitProviders(userConfig),
      models: explicitModels(userConfig),
      mcpServers: mergedMcpServers(userConfig, workspaceConfig),
    });

    expect(snapshot.blockingDiagnostic).toEqual(
      expect.objectContaining({
        code: 'unsupportedWorkspaceProviderDefinition',
        filePath: WORKSPACE_CONFIG_PATH,
      }),
    );
    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'unsupportedWorkspaceProviderDefinition',
        'unsupportedWorkspaceModelDefinition',
      ]),
    );
  });

  it('reports non-standard Skill source settings without blocking the config snapshot', () => {
    const userConfig = createUserConfig();
    const workspaceConfig: UnifiedConfig = {
      ...createWorkspaceConfig(),
      skillsDir: '.codex/skills',
    };

    const snapshot = resolveEffectiveAgentWorkspaceConfigSnapshot({
      userConfigReadResult: okConfig(USER_CONFIG_PATH, userConfig),
      workspaceConfigReadResult: okConfig(WORKSPACE_CONFIG_PATH, workspaceConfig),
      providers: explicitProviders(userConfig),
      models: explicitModels(userConfig),
      mcpServers: mergedMcpServers(userConfig, workspaceConfig),
    });

    expect(snapshot.providerId).toBe('explicit-user');
    expect(snapshot.modelId).toBe('user-chat');
    expect(snapshot.blockingDiagnostic).toBeUndefined();
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unsupportedSkillSource',
        filePath: WORKSPACE_CONFIG_PATH,
      }),
    ]);
  });
});
