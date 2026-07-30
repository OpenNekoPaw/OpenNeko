import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { UnifiedConfig } from '@neko/shared';
import { serializeUnifiedConfigToToml } from '@neko/shared/config/toml-config';

export interface AgentWorkspaceRuntimeFixturePaths {
  readonly rootDir: string;
  readonly homeDir: string;
  readonly workDir: string;
  readonly userConfigPath: string;
  readonly workspaceConfigPath: string;
  readonly userSkillsDir: string;
  readonly userCommandsDir: string;
  readonly workspaceSkillsDir: string;
  readonly workspaceCommandsDir: string;
  readonly hostPrivateLeasePath: string;
  readonly resourceCacheRoot: string;
  readonly resourceCacheManifestPath: string;
}

export interface AgentWorkspaceRuntimeFixture {
  readonly paths: AgentWorkspaceRuntimeFixturePaths;
  readonly userConfig: UnifiedConfig;
  readonly workspaceConfig: UnifiedConfig;
  readonly files: Readonly<Record<string, string>>;
}

export interface AgentWorkspaceRuntimeFixtureOptions {
  readonly rootDir: string;
  readonly userConfig?: UnifiedConfig;
  readonly workspaceConfig?: UnifiedConfig;
}

export function createAgentWorkspaceRuntimeFixturePaths(
  rootDir: string,
): AgentWorkspaceRuntimeFixturePaths {
  const homeDir = path.join(rootDir, 'home');
  const workDir = path.join(rootDir, 'workspace');
  const userNekoDir = path.join(homeDir, '.neko');
  const workspaceNekoDir = path.join(workDir, '.neko');
  const resourceCacheRoot = path.join(workspaceNekoDir, '.cache', 'resources');

  return {
    rootDir,
    homeDir,
    workDir,
    userConfigPath: path.join(userNekoDir, 'config.toml'),
    workspaceConfigPath: path.join(workspaceNekoDir, 'config.toml'),
    userSkillsDir: path.join(userNekoDir, 'skills'),
    userCommandsDir: path.join(userNekoDir, 'commands'),
    workspaceSkillsDir: path.join(workspaceNekoDir, 'skills'),
    workspaceCommandsDir: path.join(workspaceNekoDir, 'commands'),
    hostPrivateLeasePath: path.join(homeDir, '.neko', 'host-private', 'leases.json'),
    resourceCacheRoot,
    resourceCacheManifestPath: path.join(resourceCacheRoot, 'manifest.json'),
  };
}

export function createAgentWorkspaceRuntimeFixture(
  options: AgentWorkspaceRuntimeFixtureOptions,
): AgentWorkspaceRuntimeFixture {
  const paths = createAgentWorkspaceRuntimeFixturePaths(options.rootDir);
  const userConfig = options.userConfig ?? createDefaultAgentWorkspaceRuntimeUserConfig();
  const workspaceConfig =
    options.workspaceConfig ?? createDefaultAgentWorkspaceRuntimeWorkspaceConfig();
  return {
    paths,
    userConfig,
    workspaceConfig,
    files: {
      [paths.userConfigPath]: serializeUnifiedConfigToToml(userConfig),
      [paths.workspaceConfigPath]: serializeUnifiedConfigToToml(workspaceConfig),
      [path.join(paths.userSkillsDir, 'personal-review', 'SKILL.md')]: createSkillMarkdown(
        'personal-review',
        'Personal review Skill.',
      ),
      [path.join(paths.workspaceSkillsDir, 'project-review', 'SKILL.md')]: createSkillMarkdown(
        'project-review',
        'Project review Skill.',
      ),
      [path.join(paths.userCommandsDir, 'personal-check.md')]:
        '# Personal check\n\nCheck globally.',
      [path.join(paths.workspaceCommandsDir, 'project-check.md')]:
        '# Project check\n\nCheck project.',
      [paths.hostPrivateLeasePath]: JSON.stringify({ leases: [] }, null, 2),
      [paths.resourceCacheManifestPath]: JSON.stringify({ version: 1, entries: [] }, null, 2),
    },
  };
}

export async function writeAgentWorkspaceRuntimeFixture(
  fixture: AgentWorkspaceRuntimeFixture,
): Promise<void> {
  for (const [filePath, content] of Object.entries(fixture.files)) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }
}

export function createDefaultAgentWorkspaceRuntimeUserConfig(): UnifiedConfig {
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
        contextWindow: 128000,
        maxOutputTokens: 8192,
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

export function createDefaultAgentWorkspaceRuntimeWorkspaceConfig(): UnifiedConfig {
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

function createSkillMarkdown(name: string, description: string): string {
  return `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n`;
}
