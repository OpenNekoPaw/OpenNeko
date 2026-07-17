import { describe, expect, it, vi } from 'vitest';
import type {
  IToolRegistry,
  Task,
  Tool,
  ToolCategory,
  ToolDefinition,
  ToolResult,
  TaskRunScope,
} from '@neko/shared';
import { createPlatform, type PlatformOptions } from '../index';
import type { IUserConfigManager, UserConfig } from '../config/user-config';

describe('platform task manager startup', () => {
  it('registers media executors before initializing and resuming persisted tasks', async () => {
    const calls: string[] = [];
    const taskManager = createTaskManager(calls);
    const platform = createPlatform({
      toolRegistry: createToolRegistry(),
      taskManager,
      userConfigManager: createUserConfigManager(),
    });

    await Promise.resolve();
    await Promise.resolve();

    const firstRegisterIndex = calls.findIndex((call) => call.startsWith('register:'));
    expect(firstRegisterIndex).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('initialize')).toBeGreaterThan(firstRegisterIndex);
    expect(calls.indexOf('resume')).toBeGreaterThan(calls.indexOf('initialize'));

    platform.dispose();
  });
});

function createTaskManager(calls: string[]): NonNullable<PlatformOptions['taskManager']> {
  return {
    submit: vi.fn(async (_input, owner): Promise<TaskRunScope> => ({
      ...owner,
      childRunId: 'task-1',
      childKind: 'task',
    })),
    get: vi.fn(async () => undefined),
    cancel: vi.fn(async () => false),
    delete: vi.fn(async () => false),
    waitForCompletion: vi.fn(async (): Promise<Task> => {
      throw new Error('not used');
    }),
    list: vi.fn(async () => []),
    onProgress: vi.fn(() => () => undefined),
    registerExecutor: vi.fn((type: string) => {
      calls.push(`register:${type}`);
    }),
    initialize: vi.fn(async () => {
      calls.push('initialize');
    }),
    resumePendingTasks: vi.fn(async () => {
      calls.push('resume');
      return [];
    }),
    dispose: vi.fn(),
  };
}

function createUserConfigManager(): IUserConfigManager {
  const config: UserConfig = {
    providers: [],
    models: [],
    mcpServers: [],
    providerOverrides: {},
    modelOverrides: {},
    mcpServerOverrides: {},
  };

  return {
    load: () => config,
    loadRaw: () => ({}),
    save: vi.fn(async () => undefined),
    updateProviderOverride: vi.fn(async () => undefined),
    addProvider: vi.fn(async () => undefined),
    removeProvider: vi.fn(async () => undefined),
    addModel: vi.fn(async () => undefined),
    removeModel: vi.fn(async () => undefined),
    updateMCPServerOverride: vi.fn(async () => undefined),
    addMCPServer: vi.fn(async () => undefined),
    removeMCPServer: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    updateScalar: vi.fn(async () => undefined),
    updateScalars: vi.fn(async () => undefined),
  };
}

function createToolRegistry(): IToolRegistry {
  const tools = new Map<string, Tool>();
  return {
    register: (tool) => {
      tools.set(tool.name, tool);
    },
    unregister: (name) => {
      tools.delete(name);
    },
    get: (name) => tools.get(name),
    has: (name) => tools.has(name),
    list: () => Array.from(tools.values()),
    listByCategory: (_category: ToolCategory) => [],
    execute: async (): Promise<ToolResult> => ({ success: true, data: null }),
    toToolDefinitions: (): ToolDefinition[] => [],
  };
}
