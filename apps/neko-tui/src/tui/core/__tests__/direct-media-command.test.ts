import { describe, expect, it, vi } from 'vitest';
import type { MediaTask, MediaTaskView } from '@neko/platform';
import type { TaskRunScope } from '@neko/shared';
import {
  DirectMediaCommandError,
  executeDirectMediaCommand,
  resolveDirectMediaModel,
  type DirectMediaCommandRuntime,
  type DirectMediaKind,
} from '../direct-media-command';
import type { DirectMediaCommandConfig } from '../direct-media-command';

const scope: TaskRunScope = {
  conversationId: 'cli-media-1',
  runId: 'run-1',
  parentRunId: 'run-1',
  childRunId: 'task-1',
  childKind: 'task',
};

describe('executeDirectMediaCommand', () => {
  for (const kind of ['image', 'video', 'audio'] as const) {
    it(`submits ${kind} directly and delivers a stable asset ref`, async () => {
      const task = createTask(kind, 'pending');
      const terminal = createTask(kind, 'completed');
      const runtime = createRuntime(task, terminal);

      const result = await executeDirectMediaCommand(createInput(kind), runtime);

      expect(runtime.submit).toHaveBeenCalledWith({
        kind,
        prompt: `${kind} prompt`,
        model: { providerId: 'media-provider', modelId: `${kind}-model` },
      });
      expect(runtime.waitForTask).toHaveBeenCalledWith(scope);
      expect(runtime.deliver).toHaveBeenCalledWith(terminal);
      expect(result).toMatchObject({
        kind,
        status: 'completed',
        assetRefs: [`neko-generated://${kind}/asset-1`],
      });
    });
  }

  it('fails visibly when the target media model is missing', async () => {
    const runtime = createRuntime(createTask('image', 'pending'), createTask('image', 'completed'));

    await expect(
      executeDirectMediaCommand(
        {
          ...createInput('image'),
          config: { ...createConfig(), defaultMediaModels: {} },
        },
        runtime,
      ),
    ).rejects.toMatchObject({ code: 'direct-media-model-unavailable' });
    expect(runtime.submit).not.toHaveBeenCalled();
  });

  it('rejects an explicit model from another media category', () => {
    expect(() =>
      resolveDirectMediaModel({ ...createInput('image'), model: 'media-provider:video-model' }),
    ).toThrowError(DirectMediaCommandError);
    try {
      resolveDirectMediaModel({ ...createInput('image'), model: 'media-provider:video-model' });
    } catch (error) {
      expect(error).toMatchObject({ code: 'direct-media-model-kind-mismatch' });
    }
  });

  it('does not deliver or return success for a failed task', async () => {
    const runtime = createRuntime(createTask('audio', 'pending'), createTask('audio', 'failed'));

    await expect(executeDirectMediaCommand(createInput('audio'), runtime)).rejects.toMatchObject({
      code: 'direct-media-task-failed',
      taskScope: scope,
    });
    expect(runtime.deliver).not.toHaveBeenCalled();
  });

  it('rejects completed tasks without stable generated asset refs', async () => {
    const runtime = createRuntime(
      createTask('image', 'pending'),
      createTask('image', 'completed'),
      { ...createView('image'), result: undefined },
    );

    await expect(executeDirectMediaCommand(createInput('image'), runtime)).rejects.toMatchObject({
      code: 'direct-media-result-unavailable',
    });
  });
});

function createInput(kind: DirectMediaKind) {
  return {
    kind,
    prompt: `${kind} prompt`,
    config: createConfig(),
    modelOptions: (['image', 'video', 'audio'] as const).map((category) => ({
      id: `media-provider:${category}-model`,
      label: category,
      providerId: 'media-provider',
      modelId: `${category}-model`,
      category,
    })),
  };
}

function createConfig(): DirectMediaCommandConfig {
  return {
    defaultProviderId: 'chat-provider',
    defaultMediaModels: {
      image: 'media-provider:image-model',
      video: 'media-provider:video-model',
      audio: 'media-provider:audio-model',
    },
  };
}

function createTask(kind: DirectMediaKind, status: MediaTask['status']): MediaTask {
  return {
    scope,
    id: scope.childRunId,
    type: kind === 'image' ? 'text-to-image' : kind === 'video' ? 'text-to-video' : 'text-to-audio',
    status,
    progress: status === 'completed' ? 100 : 0,
    providerId: 'media-provider',
    modelId: `${kind}-model`,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...(status === 'failed'
      ? { error: { code: 'FAILED', message: 'provider failed', retryable: false } }
      : {}),
    request: { prompt: `${kind} prompt` },
  };
}

function createView(kind: DirectMediaKind): MediaTaskView {
  return {
    scope,
    id: scope.childRunId,
    type: kind,
    status: 'completed',
    progress: 100,
    providerId: 'media-provider',
    modelId: `${kind}-model`,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    result: { urls: [`neko-generated://${kind}/asset-1`] },
    request: { prompt: `${kind} prompt` },
  };
}

function createRuntime(
  submitted: MediaTask,
  terminal: MediaTask,
  view: MediaTaskView = createView(
    terminal.type.includes('video') ? 'video' : terminal.type.includes('audio') ? 'audio' : 'image',
  ),
): DirectMediaCommandRuntime & {
  submit: ReturnType<typeof vi.fn>;
  waitForTask: ReturnType<typeof vi.fn>;
  deliver: ReturnType<typeof vi.fn>;
} {
  return {
    submit: vi.fn(async () => submitted),
    waitForTask: vi.fn(async () => terminal),
    deliver: vi.fn(async () => view),
  };
}
