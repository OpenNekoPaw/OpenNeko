import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MediaTask, MediaTaskView } from '@neko/platform';
import type { TaskRunScope } from '@neko/shared';
import type { CLIConfig } from '../core/types';
import type { DirectMediaCommandRuntime } from '../core/direct-media-command';
import { createTestAgentTerminalInvocationContext } from '../presentation/testing';

const config: CLIConfig = {
  provider: 'chat-provider',
  providerType: 'openai',
  providerRequiresApiKey: false,
  model: 'chat-model',
  mediaModels: ['image-model', 'video-model', 'audio-model'],
  defaultMediaModels: {
    image: 'media:image-model',
    video: 'media:video-model',
    audio: 'media:audio-model',
  },
  maxTokens: 1024,
  temperature: 0,
  verbose: false,
  workDir: process.cwd(),
  mcpServers: [],
  outputFormat: 'text',
  executionMode: 'auto',
  thinkingBudget: 0,
};

vi.mock('../core/config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../core/config')>();
  return {
    ...original,
    loadConfig: vi.fn(() => config),
    validateConfig: vi.fn(() => ({ valid: true, diagnostics: [] })),
    loadDirectMediaCommandConfig: vi.fn(() => ({
      config: {
        defaultProviderId: 'chat-provider',
        defaultMediaModels: config.defaultMediaModels ?? {},
      },
      modelOptions: (['image', 'video', 'audio'] as const).map((category) => ({
        id: `media:${category}-model`,
        label: category,
        providerId: 'media',
        modelId: `${category}-model`,
        category,
      })),
    })),
  };
});

vi.mock('ink', () => ({
  render: () => {
    throw new Error('Agent TUI path must not execute for direct media commands.');
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('direct media CLI actions', () => {
  for (const kind of ['image', 'video', 'audio'] as const) {
    it(`routes neko ${kind} directly and never renders the Agent TUI`, async () => {
      const runtime = createTestRuntime(kind);
      const dispose = vi.fn(async () => undefined);
      const runtimeFactory = vi.fn(async () => ({ runtime, dispose }));
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const { createCliProgram } = await import('../cli');
      const program = createCliProgram(createTestAgentTerminalInvocationContext('en'), {
        createDirectMediaRuntime: runtimeFactory,
      });
      program.exitOverride();

      await program.parseAsync(['node', 'neko', kind, `${kind} prompt`, '--json']);

      expect(runtime.submit).toHaveBeenCalledWith({
        kind,
        prompt: `${kind} prompt`,
        model: { providerId: 'media', modelId: `${kind}-model` },
      });
      expect(runtimeFactory).toHaveBeenCalledWith({ workDir: process.cwd() });
      expect(dispose).toHaveBeenCalledOnce();
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
        kind,
        status: 'completed',
        assetRefs: [`neko-generated://${kind}/asset-1`],
      });
    });
  }

});

function createTestRuntime(kind: 'image' | 'video' | 'audio') {
  const task = createTask(kind, 'pending');
  const terminal = createTask(kind, 'completed');
  return {
    submit: vi.fn(async () => task),
    waitForTask: vi.fn(async () => terminal),
    deliver: vi.fn(async () => createView(kind)),
  } satisfies DirectMediaCommandRuntime;
}

const scope: TaskRunScope = {
  conversationId: 'cli-media-1',
  runId: 'run-1',
  parentRunId: 'run-1',
  childRunId: 'task-1',
  childKind: 'task',
};

function createTask(kind: 'image' | 'video' | 'audio', status: MediaTask['status']): MediaTask {
  return {
    scope,
    id: scope.childRunId,
    type: kind === 'image' ? 'text-to-image' : kind === 'video' ? 'text-to-video' : 'text-to-audio',
    status,
    progress: status === 'completed' ? 100 : 0,
    providerId: 'media',
    modelId: `${kind}-model`,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    request: { prompt: `${kind} prompt` },
  };
}

function createView(kind: 'image' | 'video' | 'audio'): MediaTaskView {
  return {
    scope,
    id: scope.childRunId,
    type: kind,
    status: 'completed',
    progress: 100,
    providerId: 'media',
    modelId: `${kind}-model`,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    result: { urls: [`neko-generated://${kind}/asset-1`] },
    request: { prompt: `${kind} prompt` },
  };
}
