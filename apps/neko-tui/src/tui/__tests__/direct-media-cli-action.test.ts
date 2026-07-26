import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerationJobSnapshot } from '@neko/generation';
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

      expect(runtime.submitGeneration).toHaveBeenCalledWith({
        lifecycleMode: 'linked',
        generationType:
          kind === 'image' ? 'text-to-image' : kind === 'video' ? 'text-to-video' : 'text-to-audio',
        providerId: 'media',
        modelId: `${kind}-model`,
        request: expect.objectContaining({
          prompt: `${kind} prompt`,
          providerId: 'media',
          modelId: `${kind}-model`,
        }),
      });
      expect(runtimeFactory).toHaveBeenCalledWith({ workDir: process.cwd() });
      expect(dispose).toHaveBeenCalledOnce();
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
        kind,
        status: 'completed',
        resultLocators: [
          expect.objectContaining({ kind: 'generated-output', outputId: `asset-${kind}` }),
        ],
      });
    }, 120_000);
  }

  it('returns a detached Generation Job identity without observing the provider result', async () => {
    const runtime = createTestRuntime('image');
    const dispose = vi.fn(async () => undefined);
    const runtimeFactory = vi.fn(async () => ({ runtime, dispose }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { createCliProgram } = await import('../cli');
    const program = createCliProgram(createTestAgentTerminalInvocationContext('en'), {
      createDirectMediaRuntime: runtimeFactory,
    });
    program.exitOverride();

    await program.parseAsync([
      'node',
      'neko',
      'image',
      'detached prompt',
      '--detach',
      '--json',
    ]);

    expect(runtime.submitGeneration).toHaveBeenCalledOnce();
    expect(runtime.submitGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycleMode: 'detached' }),
    );
    expect(runtime.observeGeneration).not.toHaveBeenCalled();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      kind: 'image',
      status: 'submitted',
      operationId: 'job-image',
      jobRevision: 1,
      resultLocators: [],
    });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('routes exact persistent Generation Job commands through the direct runtime', async () => {
    const runtime = createTestRuntime('image');
    const dispose = vi.fn(async () => undefined);
    const runtimeFactory = vi.fn(async () => ({ runtime, dispose }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { createCliProgram } = await import('../cli');
    const program = createCliProgram(createTestAgentTerminalInvocationContext('en'), {
      createDirectMediaRuntime: runtimeFactory,
    });
    program.exitOverride();

    await program.parseAsync([
      'node',
      'neko',
      'generation',
      'cancel',
      'job-image',
      '2',
    ]);

    expect(runtime.cancelGeneration).toHaveBeenCalledWith({
      ref: { kind: 'generation', jobId: 'job-image' },
      expectedRevision: 2,
    });
    expect(runtime.submitGeneration).not.toHaveBeenCalled();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      ref: { kind: 'generation', jobId: 'job-image' },
    });
    expect(dispose).toHaveBeenCalledOnce();
  });
});

function createTestRuntime(kind: 'image' | 'video' | 'audio') {
  const terminal = createSnapshot(kind);
  return {
    submitGeneration: vi.fn(async () => ({ ...terminal, phase: 'pending' as const, revision: 1 })),
    observeGeneration: vi.fn(() => asyncSnapshots([terminal])),
    describeGeneration: vi.fn(async () => terminal),
    cancelGeneration: vi.fn(async () => terminal),
    retryGeneration: vi.fn(async () => terminal),
    reconcileGeneration: vi.fn(async () => terminal),
  } satisfies DirectMediaCommandRuntime;
}

function createSnapshot(kind: 'image' | 'video' | 'audio'): GenerationJobSnapshot {
  const generationType =
    kind === 'image' ? 'text-to-image' : kind === 'video' ? 'text-to-video' : 'text-to-audio';
  return {
    ref: { kind: 'generation', jobId: `job-${kind}` },
    lifecycleMode: 'linked',
    phase: 'succeeded',
    revision: 2,
    createdAt: 1,
    updatedAt: 2,
    request: {
      generationType,
      providerId: 'media',
      modelId: `${kind}-model`,
      request: { prompt: `${kind} prompt` },
    },
    progress: { stage: 'completed', percent: 100 },
    resultLocators: [createResultLocator(kind)],
  };
}

function createResultLocator(kind: 'image' | 'video' | 'audio') {
  return {
    kind: 'generated-output' as const,
    outputId: `asset-${kind}`,
    revision: `revision-${kind}`,
    digest: `sha256:${kind}`,
    path: `neko/generated/${kind}/asset-${kind}`,
  };
}

async function* asyncSnapshots(snapshots: readonly GenerationJobSnapshot[]) {
  yield* snapshots;
}
