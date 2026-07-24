import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from '@neko/agent';
import type { ResourceRef } from '@neko/shared';
import type { GenerationJobSnapshot, SubmitGenerationJobInput } from '@neko/generation';
import { registerMediaAgentTools } from '../media-agent-tools';

function createMediaMock() {
  const terminals = new Map<string, GenerationJobSnapshot>();
  const generateImage = vi.fn(async (request: SubmitGenerationJobInput['request']) =>
    createResult('text-to-image', request),
  );
  const generateVideo = vi.fn(async (request: SubmitGenerationJobInput['request']) =>
    createResult('text-to-video', request),
  );
  const generateAudio = vi.fn(async (request: SubmitGenerationJobInput['request']) =>
    createResult('text-to-audio', request),
  );
  let sequence = 0;
  const submitGeneration = vi.fn(async (input: SubmitGenerationJobInput) => {
    const result = input.generationType.includes('video')
      ? await generateVideo(input.request)
      : input.generationType.includes('image')
        ? await generateImage(input.request)
        : await generateAudio(input.request);
    const jobId = `generation-job-${++sequence}`;
    const ref = { kind: 'generation' as const, jobId };
    const initial: GenerationJobSnapshot = {
      ref,
      lifecycleMode: input.lifecycleMode,
      phase: 'pending',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      request: input,
      progress: { stage: 'queued', percent: 0 },
    };
    terminals.set(jobId, {
      ...initial,
      phase: 'succeeded',
      revision: 3,
      updatedAt: 3,
      progress: { stage: 'completed', percent: 100 },
      resultRefs: result.outputs.map((output, index) =>
        createGeneratedResourceRef(`${jobId}:${output.type}:${index}`),
      ),
    });
    return initial;
  });
  const observeGeneration = vi.fn(async function* (ref: { readonly jobId: string }) {
    const terminal = terminals.get(ref.jobId);
    if (!terminal) throw new Error(`Unknown Generation Job ${ref.jobId}`);
    yield {
      ...terminal,
      phase: 'running' as const,
      revision: 2,
      updatedAt: 2,
      progress: { stage: 'waiting-provider' as const, percent: 45 },
      resultRefs: undefined,
    };
    yield terminal;
  });
  return {
    generateImage,
    generateVideo,
    generateAudio,
    submitGeneration,
    describeGeneration: vi.fn(async (ref: { readonly jobId: string }) => {
      const terminal = terminals.get(ref.jobId);
      if (!terminal) throw new Error(`Unknown Generation Job ${ref.jobId}`);
      return terminal;
    }),
    observeGeneration,
    cancelGeneration: vi.fn(),
    retryGeneration: vi.fn(),
    reconcileGeneration: vi.fn(),
  };
}

function createResult(
  type: 'text-to-image' | 'text-to-video' | 'text-to-audio',
  request: SubmitGenerationJobInput['request'],
) {
  const outputType =
    type === 'text-to-image' ? 'image' : type === 'text-to-video' ? 'video' : 'audio';
  return {
    type,
    providerId: (request.providerId as string | undefined) ?? 'default-provider',
    modelId: (request.modelId as string | undefined) ?? 'default-model',
    outputs: [{ type: outputType, url: `https://example.test/result.${outputType}` }],
    request,
  };
}

type ToolExecuteOptions = NonNullable<Parameters<ToolRegistry['execute']>[2]>;

function executeAgentTool(
  registry: ToolRegistry,
  name: string,
  args: Record<string, unknown>,
  options: ToolExecuteOptions = {},
) {
  const providerId = typeof args.providerId === 'string' ? args.providerId : undefined;
  const modelId = typeof args.modelId === 'string' ? args.modelId : undefined;
  const purpose = mediaPurposeForTool(name);
  const legacyModels = options.metadata?.mediaModels as
    Record<string, { providerId?: string; modelId?: string }> | undefined;
  const legacyCategory = purpose?.startsWith('image.')
    ? 'image'
    : purpose?.startsWith('video.')
      ? 'video'
      : 'audio';
  const runtimeModel = legacyModels?.[legacyCategory];
  const hasCompleteArgsTarget = providerId !== undefined && modelId !== undefined;
  const canonicalProviderId = providerId ?? runtimeModel?.providerId;
  const canonicalModelId = modelId ?? runtimeModel?.modelId;
  const toolArgs = hasCompleteArgsTarget
    ? Object.fromEntries(
        Object.entries(args).filter(([key]) => key !== 'providerId' && key !== 'modelId'),
      )
    : args;
  return registry.execute(name, toolArgs, {
    ...options,
    metadata: {
      ...options.metadata,
      turnId: options.metadata?.turnId ?? 'turn-1',
      toolCallId: options.metadata?.toolCallId ?? `${name}-call-1`,
      ...(purpose && canonicalProviderId && canonicalModelId
        ? {
            modelPurpose: purpose,
            modelProviderId: canonicalProviderId,
            modelId: canonicalModelId,
          }
        : {}),
    },
    trace: {
      conversationId: 'conv-1',
      runId: 'run-1',
      ...options.trace,
    },
  });
}

function mediaPurposeForTool(name: string): string | undefined {
  switch (name) {
    case 'GenerateImage':
      return 'image.generate';
    case 'TransformImage':
      return 'image.edit';
    case 'GenerateVideo':
      return 'video.generate';
    case 'GenerateMusic':
      return 'audio.music.generate';
    case 'GenerateTTS':
      return 'audio.tts';
    default:
      return undefined;
  }
}

describe('registerMediaAgentTools', () => {
  it('registers exact Generation Job management tools on the owning domain port', async () => {
    const registry = new ToolRegistry();
    const jobs = createMediaMock();
    registerMediaAgentTools(registry, jobs as never);

    const names = registry.toToolDefinitions().map((tool) => tool.function.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'SubmitGenerationJob',
        'DescribeGenerationJob',
        'ObserveGenerationJob',
        'CancelGenerationJob',
        'RetryGenerationJob',
        'ReconcileGenerationJob',
      ]),
    );

    await jobs.submitGeneration({
      lifecycleMode: 'linked',
      generationType: 'text-to-image',
      providerId: 'image-provider',
      modelId: 'image-model',
      request: { prompt: 'cat' },
    });
    const ref = { kind: 'generation' as const, jobId: 'generation-job-1' };
    const terminal = await jobs.describeGeneration(ref);
    jobs.cancelGeneration.mockResolvedValue({ ...terminal, phase: 'cancelled' });
    jobs.retryGeneration.mockResolvedValue({
      ...terminal,
      ref: { kind: 'generation', jobId: 'generation-job-2' },
      phase: 'pending',
      revision: 1,
    });
    jobs.reconcileGeneration.mockResolvedValue(terminal);

    await expect(
      executeAgentTool(registry, 'DescribeGenerationJob', { jobId: ref.jobId }),
    ).resolves.toMatchObject({
      success: true,
      data: { jobId: ref.jobId, phase: 'succeeded', revision: 3 },
    });
    await expect(
      executeAgentTool(registry, 'ObserveGenerationJob', {
        jobId: ref.jobId,
        afterRevision: 1,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: { jobId: ref.jobId, phase: 'running', revision: 2 },
    });
    await executeAgentTool(registry, 'CancelGenerationJob', {
      jobId: ref.jobId,
      expectedRevision: 3,
    });
    await executeAgentTool(registry, 'RetryGenerationJob', {
      jobId: ref.jobId,
      expectedRevision: 3,
    });
    await executeAgentTool(registry, 'ReconcileGenerationJob', {
      jobId: ref.jobId,
      expectedRevision: 3,
    });

    expect(jobs.observeGeneration).toHaveBeenCalledWith(ref, 1);
    expect(jobs.cancelGeneration).toHaveBeenCalledWith({ ref, expectedRevision: 3 });
    expect(jobs.retryGeneration).toHaveBeenCalledWith({ ref, expectedRevision: 3 });
    expect(jobs.reconcileGeneration).toHaveBeenCalledWith({ ref, expectedRevision: 3 });
  });

  it('submits one detached Generation Job through the Host-bound purpose target', async () => {
    const registry = new ToolRegistry();
    const jobs = createMediaMock();
    registerMediaAgentTools(registry, jobs as never);

    const result = await registry.execute(
      'SubmitGenerationJob',
      { kind: 'image', prompt: '  a red paper kite  ' },
      {
        metadata: {
          turnId: 'turn-detached',
          toolCallId: 'submit-generation-call',
          modelPurpose: 'image.generate',
          modelProviderId: 'host-image-provider',
          modelId: 'host-image-model',
        },
        trace: {
          conversationId: 'conversation-detached',
          runId: 'run-detached',
        },
      },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        jobKind: 'generation',
        jobId: 'generation-job-1',
        phase: 'pending',
        revision: 1,
        progress: { stage: 'queued', percent: 0 },
      },
    });
    expect(jobs.submitGeneration).toHaveBeenCalledTimes(1);
    expect(jobs.submitGeneration).toHaveBeenCalledWith({
      lifecycleMode: 'detached',
      generationType: 'text-to-image',
      providerId: 'host-image-provider',
      modelId: 'host-image-model',
      request: {
        prompt: 'a red paper kite',
        providerId: 'host-image-provider',
        modelId: 'host-image-model',
        metadata: {
          detached: true,
          source: 'agent-generation-job-tool',
          conversationId: 'conversation-detached',
          runId: 'run-detached',
          turnId: 'turn-detached',
          toolCallId: 'submit-generation-call',
        },
      },
    });
    expect(jobs.observeGeneration).not.toHaveBeenCalled();
    expect(jobs.describeGeneration).not.toHaveBeenCalled();
    expect(jobs.generateImage).toHaveBeenCalledTimes(1);
  });

  it('rejects model-authored routing for detached Generation Job submission', async () => {
    const registry = new ToolRegistry();
    const jobs = createMediaMock();
    registerMediaAgentTools(registry, jobs as never);

    await expect(
      registry.execute(
        'SubmitGenerationJob',
        {
          kind: 'image',
          prompt: 'a red paper kite',
          providerId: 'model-authored-provider',
          modelId: 'model-authored-model',
        },
        {
          metadata: {
            turnId: 'turn-detached',
            toolCallId: 'submit-generation-call',
          },
          trace: {
            conversationId: 'conversation-detached',
            runId: 'run-detached',
          },
        },
      ),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('rejects model-authored providerId/modelId'),
    });
    expect(jobs.submitGeneration).not.toHaveBeenCalled();
  });

  it('exposes numeric fps enum values in the GenerateVideo tool schema', () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const generateVideo = registry
      .toToolDefinitions()
      .find((tool) => tool.function.name === 'GenerateVideo');
    const parameters = generateVideo?.function.parameters as
      { properties?: Record<string, unknown> } | undefined;

    expect(parameters?.properties?.fps).toEqual(
      expect.objectContaining({
        type: 'number',
        enum: [24, 30, 60],
      }),
    );
    expect(parameters?.properties).not.toHaveProperty('providerId');
    expect(parameters?.properties).not.toHaveProperty('modelId');
  });

  it('projects Chinese media tool schema text for model-facing definitions', () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const definitions = registry.toToolDefinitions(undefined, { locale: 'zh-CN' });
    const byName = new Map(definitions.map((tool) => [tool.function.name, tool.function]));
    const image = byName.get('GenerateImage');
    const transform = byName.get('TransformImage');
    const video = byName.get('GenerateVideo');
    const music = byName.get('GenerateMusic');
    const tts = byName.get('GenerateTTS');

    expect(image?.description).toContain('Tool Call 返回终态结果');
    expect(image?.description).toContain('generated 草稿');
    expect(image?.description).toContain('Quality');
    expect(getPropertyDescription(image, 'prompt')).toBe('图像生成或编辑提示词。');
    expect(getPropertyDescription(image, 'referenceImageUri')).toContain('宿主已解析');
    expect(getPropertyDescription(image, 'editInstruction')).toContain('编辑指令');
    expect(getPropertyDescription(image, 'prompt')).not.toContain('Text description');

    expect(transform?.description).toContain('Tool Call 返回终态结果');
    expect(transform?.description).toContain('不是确定性裁切');
    expect(getPropertyDescription(transform, 'sourceImageUri')).toContain('源图像');
    expect(getPropertyDescription(transform, 'operationPlan')).toContain('可审阅');

    expect(video?.description).toContain('Tool Call 返回终态结果');
    expect(video?.description).toContain('generated clip 草稿');
    expect(getPropertyDescription(video, 'prompt')).toBe('视频生成或编辑提示词。');
    expect(getPropertyDescription(video, 'referenceImageUri')).toContain('图生视频');
    expect(getPropertyDescription(video, 'editInstruction')).toContain('视频编辑');

    expect(music?.description).toContain('Tool Call 返回终态音频结果');
    expect(getPropertyDescription(music, 'mood')).toContain('音乐情绪');

    expect(tts?.description).toContain('Tool Call 返回终态音频结果');
    expect(getPropertyDescription(tts, 'text')).toBe('要朗读的文本。');
    expect(getPropertyDescription(tts, 'sourceCueId')).toContain('对白 cue ID');
  });

  it('declares owner-side runtime, cost, mutation, and result-review semantics', () => {
    const registry = new ToolRegistry();
    registerMediaAgentTools(registry, createMediaMock() as never);

    const image = registry.get('GenerateImage');
    const transform = registry.get('TransformImage');
    const video = registry.get('GenerateVideo');

    expect(image).toMatchObject({
      safetyKind: 'non-destructive-mutation',
      requirements: { generationJob: true },
      traits: { cost: 'moderate', reversible: true, locality: 'network', impactLevel: 'low' },
    });
    expect(image?.description).toContain('generated draft');
    expect(image?.description).toContain('current model support');
    expect(image?.description).toContain('actual image');

    expect(transform).toMatchObject({
      safetyKind: 'non-destructive-mutation',
      requirements: { generationJob: true, contentAccess: true },
      traits: { cost: 'moderate', reversible: true, locality: 'network', impactLevel: 'low' },
    });
    expect(transform?.description).toContain('not deterministic crop');

    expect(video).toMatchObject({
      safetyKind: 'non-destructive-mutation',
      requirements: { generationJob: true, contentAccess: true },
      traits: { cost: 'expensive', reversible: true, locality: 'network', impactLevel: 'low' },
    });
    expect(video?.description).toContain('terminal result');
    expect(video?.description).toContain('generated clip draft');
  });

  it('describes linked terminal execution without Task continuation in English definitions', () => {
    const registry = new ToolRegistry();
    registerMediaAgentTools(registry, createMediaMock() as never);

    for (const name of ['GenerateImage', 'GenerateVideo', 'GenerateMusic', 'GenerateTTS']) {
      const definition = registry
        .toToolDefinitions()
        .find((tool) => tool.function.name === name)?.function;
      expect(definition?.description).toContain('linked Tool Call');
      expect(definition?.description).not.toContain('taskId');
      expect(definition?.description).not.toContain('Task observation/continuation');
    }
  });

  it('keeps GenerateImage prompt mode compatible and uses turn-purpose routing', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(registry, 'GenerateImage', {
      prompt: 'A lighthouse at dusk',
      providerId: 'openai-provider',
      modelId: 'dalle-model',
      size: '512x512',
    });

    expect(result.success).toBe(true);
    expect(media.generateImage.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        prompt: 'A lighthouse at dusk',
        providerId: 'openai-provider',
        modelId: 'dalle-model',
        width: 512,
        height: 512,
        metadata: expect.objectContaining({
          providerAdaptation: expect.objectContaining({
            providerId: 'openai-provider',
            modelId: 'dalle-model',
          }),
        }),
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        status: 'completed',
        toolCallId: 'GenerateImage-call-1',
        outputs: [expect.objectContaining({ type: 'image' })],
        routedTo: expect.objectContaining({
          provider: 'openai-provider',
          model: 'dalle-model',
        }),
        providerAdaptation: expect.objectContaining({
          providerId: 'openai-provider',
          modelId: 'dalle-model',
          resolvedTarget: { providerId: 'openai-provider', modelId: 'dalle-model' },
        }),
      }),
    );
  });

  it('waits for terminal media, forwards progress, and returns outputs under one toolCallId', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    const controller = new AbortController();
    const progress = vi.fn();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(
      registry,
      'GenerateImage',
      {
        prompt: 'A lighthouse at dusk',
        providerId: 'openai-provider',
        modelId: 'dalle-model',
      },
      {
        signal: controller.signal,
        onProgress: progress,
        metadata: { turnId: 'turn-linked', toolCallId: 'tool-linked' },
      },
    );

    expect(progress).toHaveBeenCalledWith({
      percent: 45,
      stage: 'waiting-provider',
    });
    expect(result).toMatchObject({
      success: true,
      data: {
        turnId: 'turn-linked',
        toolCallId: 'tool-linked',
        status: 'completed',
        jobId: 'generation-job-1',
        outputs: [
          {
            type: 'image',
            resourceRef: expect.objectContaining({ id: 'generation-job-1:image:0' }),
          },
        ],
      },
      attachments: [
        expect.objectContaining({
          type: 'image',
          path: 'generation-job-1:image:0',
          assetRef: expect.objectContaining({
            resourceRef: expect.objectContaining({ id: 'generation-job-1:image:0' }),
          }),
        }),
      ],
    });
    expect(result.data).not.toHaveProperty('backgroundMode');
    expect(result.data).not.toHaveProperty('taskId');
    expect(result.data).not.toHaveProperty('taskRef');
  });

  it('preserves the runtime conversation id in GenerateImage request metadata', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(
      registry,
      'GenerateImage',
      {
        prompt: 'A playful cat',
        providerId: 'openai-provider',
        modelId: 'dalle-model',
      },
      {
        trace: {
          conversationId: 'conv-1',
          runId: 'run-1',
          turnId: 'turn-1',
        },
      },
    );

    expect(result.success).toBe(true);
    expect(media.generateImage.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          conversationId: 'conv-1',
          runId: 'run-1',
          turnId: 'turn-1',
          toolCallId: 'GenerateImage-call-1',
        }),
      }),
    );
  });

  it('preserves runtime understanding model overrides in GenerateImage request metadata', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(
      registry,
      'GenerateImage',
      {
        prompt: 'A playful cat',
        providerId: 'openai-provider',
        modelId: 'dalle-model',
      },
      {
        metadata: {
          understandingModels: {
            image: { providerId: 'google', modelId: 'gemini-flash', category: 'llm' },
          },
        },
      },
    );

    expect(result.success).toBe(true);
    expect(media.generateImage.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          understandingModels: {
            image: { providerId: 'google', modelId: 'gemini-flash', category: 'llm' },
          },
        }),
      }),
    );
  });

  it('fails visibly when an Agent media tool has no run ownership', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute(
      'GenerateImage',
      {
        prompt: 'A moonlit studio',
      },
      {
        metadata: {
          modelPurpose: 'image.generate',
          modelProviderId: 'openai-provider',
          modelId: 'dalle-model',
        },
        trace: {
          conversationId: 'conv-turn-only',
          turnId: 'turn-conv-turn-only-1',
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('runId ownership');
    expect(media.generateImage).not.toHaveBeenCalled();
  });

  it('preserves explicit concurrent run ownership without generating fallback ids', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const [first, second] = await Promise.all([
      executeAgentTool(
        registry,
        'GenerateImage',
        {
          prompt: 'First frame',
          providerId: 'openai-provider',
          modelId: 'dalle-model',
        },
        { trace: { conversationId: 'conv-concurrent', runId: 'run-a' } },
      ),
      executeAgentTool(
        registry,
        'GenerateImage',
        {
          prompt: 'Second frame',
          providerId: 'openai-provider',
          modelId: 'dalle-model',
        },
        { trace: { conversationId: 'conv-concurrent', runId: 'run-b' } },
      ),
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.data).toEqual(expect.objectContaining({ runId: 'run-a' }));
    expect(second.data).toEqual(expect.objectContaining({ runId: 'run-b' }));
    expect(media.generateImage.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({ conversationId: 'conv-concurrent', runId: 'run-a' }),
      }),
    );
    expect(media.generateImage.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({ conversationId: 'conv-concurrent', runId: 'run-b' }),
      }),
    );
  });

  it('binds Agent audio execution to the exact Tool Call without continuation metadata', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(
      registry,
      'GenerateMusic',
      {
        prompt: 'Gentle piano theme',
        providerId: 'music-provider',
        modelId: 'music-model',
      },
      {
        trace: {
          conversationId: 'conv-1',
          runId: 'run-1',
          turnId: 'turn-1',
        },
      },
    );

    expect(result.success).toBe(true);
    expect(media.generateAudio.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          conversationId: 'conv-1',
          runId: 'run-1',
          turnId: 'turn-1',
          toolCallId: 'GenerateMusic-call-1',
        }),
      }),
    );
  });

  it('extracts generation intent from task markdown and records providerAdaptation metadata', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(registry, 'GenerateVideo', {
      taskRef: 'docs/tasks/cat-detective.md',
      taskMarkdown: [
        '# Task: Cat Detective Video',
        '',
        '## Goal',
        'cat detective walking through a neon rainy alley',
        '',
        '## Style',
        '- anime',
        '- cyberpunk',
        '',
        '## Must Include',
        '- slow tracking shot',
        '',
        '## Avoid',
        '- blurry',
        '',
        '## Output',
        '- duration: 6',
        '- resolution: 720p',
      ].join('\n'),
      providerId: 'new-video-model',
      modelId: 'new-video-model-v1',
    });

    expect(result.success).toBe(true);
    expect(media.generateVideo.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        prompt:
          'cat detective walking through a neon rainy alley, anime, cyberpunk, slow tracking shot, avoid blurry',
        providerId: 'new-video-model',
        modelId: 'new-video-model-v1',
        metadata: expect.objectContaining({
          providerAdaptation: expect.objectContaining({
            mode: 'agentic',
            source: expect.objectContaining({
              kind: 'task-markdown',
              uri: 'docs/tasks/cat-detective.md',
            }),
            extractedIntent: expect.objectContaining({
              styleFamily: 'anime',
              mustInclude: ['slow tracking shot'],
              avoid: ['blurry'],
              output: { duration: 6, resolution: '720p' },
            }),
          }),
        }),
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        providerAdaptation: expect.objectContaining({
          mode: 'agentic',
          source: expect.objectContaining({ kind: 'task-markdown' }),
        }),
      }),
    );
  });

  it('honors native provider adaptation mode for structured task markdown', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(registry, 'GenerateImage', {
      taskRef: 'docs/tasks/native-image.md',
      taskMarkdown: ['# Task', '', '## Goal', 'A quiet forest shrine'].join('\n'),
      providerAdaptationMode: 'native',
      providerId: 'image-provider',
      modelId: 'image-model',
    });

    expect(result.success).toBe(true);
    expect(media.generateImage.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        prompt: 'A quiet forest shrine',
        metadata: expect.objectContaining({
          providerAdaptation: expect.objectContaining({
            mode: 'native',
            adaptationMetadata: expect.objectContaining({
              riskFlags: ['provider-adaptation-bypassed'],
            }),
          }),
        }),
      }),
    );
  });

  it('rejects GenerateImage without explicit args or Agent runtime media model routing', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(registry, 'GenerateImage', {
      prompt: 'A lighthouse at dusk',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('explicit Agent image purpose model');
    expect(media.generateImage).not.toHaveBeenCalled();
  });

  it('does not expose legacy semanticPrompt fields in media tool results', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(registry, 'GenerateImage', {
      prompt: 'A lighthouse at dusk',
      providerId: 'openai-provider',
      modelId: 'dalle-model',
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('semanticPrompt');
    const request = media.generateImage.mock.calls[0]?.[0];
    expect(request).not.toHaveProperty('semanticPrompt');
  });

  it('passes GenerateImage reference, mask, control, and edit fields to media routing', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(registry, 'GenerateImage', {
      prompt: 'Clean the panel',
      negativePrompt: 'speech bubbles',
      referenceImageUri: '${PROJECT}/refs/panel.png',
      maskUri: '${PROJECT}/masks/speech-bubble.png',
      controlImageUri: '${PROJECT}/controls/lineart.png',
      controlMode: 'lineart',
      controlStrength: 0.7,
      inpaintStrength: 0.8,
      editInstruction: 'Remove text and reconstruct the background.',
      aspectRatio: '16:9',
      providerId: 'image-provider',
      modelId: 'image-model',
    });

    expect(result.success).toBe(true);
    expect(media.generateImage.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        prompt: 'Clean the panel',
        negativePrompt: 'speech bubbles',
        referenceImageUri: '${PROJECT}/refs/panel.png',
        maskUri: '${PROJECT}/masks/speech-bubble.png',
        controlImageUri: '${PROJECT}/controls/lineart.png',
        controlMode: 'lineart',
        controlStrength: 0.7,
        inpaintStrength: 0.8,
        editInstruction: 'Remove text and reconstruct the background.',
        aspectRatio: '16:9',
      }),
    );
  });

  it('blocks TransformImage when only stable refs are provided without host-resolved input', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(registry, 'TransformImage', {
      editInstruction: 'Remove dialogue bubbles.',
      providerId: 'edit-provider',
      modelId: 'edit-model',
      sourceImageRef: {
        refId: 'source-panel-1',
        role: 'source',
        locator: { type: 'tool-result', toolCallId: 'read-comic', assetIndex: 0 },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('host-resolved');
    expect(media.generateImage).not.toHaveBeenCalled();
  });

  it('registers TransformImage as a source-bound facade over image generation', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const transformTool = registry.get('TransformImage');
    expect(transformTool?.parameters.properties.sourceImageRef).toEqual(
      expect.objectContaining({ type: 'object' }),
    );
    expect(transformTool?.parameters.properties.maskRefs).toEqual(
      expect.objectContaining({ type: 'array' }),
    );

    const result = await executeAgentTool(registry, 'TransformImage', {
      planId: 'prep-1',
      sceneId: 'scene-1',
      shotId: 'shot-1',
      editInstruction: 'Remove dialogue bubbles and fill the wall.',
      sourceImageRef: {
        refId: 'source-panel-1',
        role: 'source',
        locator: { type: 'tool-result', toolCallId: 'read-comic', assetIndex: 0 },
      },
      sourceImageUri: '${PROJECT}/resolved/source-panel-1.png',
      maskUri: '${PROJECT}/resolved/speech-mask.png',
      operationPlan: ['crop-panel', 'remove-text', 'inpaint'],
      targetAspectRatio: '16:9',
      targetStyle: 'natural',
      providerId: 'edit-provider',
      modelId: 'edit-model',
    });

    expect(result.success).toBe(true);
    expect(media.generateImage.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        prompt: 'Remove dialogue bubbles and fill the wall.',
        providerId: 'edit-provider',
        modelId: 'edit-model',
        referenceImageUri: '${PROJECT}/resolved/source-panel-1.png',
        maskUri: '${PROJECT}/resolved/speech-mask.png',
        aspectRatio: '16:9',
        style: 'natural',
        editInstruction: 'Remove dialogue bubbles and fill the wall.',
        metadata: expect.objectContaining({
          transformImage: expect.objectContaining({
            planId: 'prep-1',
            sceneId: 'scene-1',
            shotId: 'shot-1',
            operationPlan: ['crop-panel', 'remove-text', 'inpaint'],
          }),
        }),
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        type: 'image-transform',
        transformImage: expect.objectContaining({ planId: 'prep-1' }),
      }),
    );
  });

  it('passes explicit provider/model routing to GenerateVideo', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(registry, 'GenerateVideo', {
      prompt: 'A spaceship launch',
      providerId: 'runway-provider',
      modelId: 'runway-model',
    });

    expect(result.success).toBe(true);
    expect(media.generateVideo.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        prompt: 'A spaceship launch',
        providerId: 'runway-provider',
        modelId: 'runway-model',
      }),
    );
  });

  it('passes GenerateVideo image-to-video reference and motion fields to media routing', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(registry, 'GenerateVideo', {
      prompt: 'Animate the prepared comic keyframe',
      referenceImageUri: '${PROJECT}/resolved/keyframe-1.png',
      aspectRatio: '16:9',
      motionStrength: 0.4,
      cameraMovement: 'zoom-in',
      cameraAngle: 'eye-level',
      shotScale: 'MS',
      editInstruction: 'Subtle breathing motion and drifting dust.',
      duration: 4,
      resolution: '720p',
      fps: 24,
      providerId: 'runway-provider',
      modelId: 'runway-model',
    });

    expect(result.success).toBe(true);
    expect(media.generateVideo.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        prompt: 'Animate the prepared comic keyframe',
        referenceImageUri: '${PROJECT}/resolved/keyframe-1.png',
        aspectRatio: '16:9',
        motionStrength: 0.4,
        cameraMovement: 'zoom-in',
        cameraAngle: 'eye-level',
        shotScale: 'MS',
        editInstruction: 'Subtle breathing motion and drifting dust.',
        duration: 4,
        resolution: '720p',
        fps: 24,
      }),
    );
  });

  it('passes canonical keyframe operation and stable ResourceRefs to GenerateVideo', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);
    const startFrameRef = createResourceRef('asset:image:first-frame');
    const endFrameRef = createResourceRef('asset:image:end-frame');

    const result = await executeAgentTool(registry, 'GenerateVideo', {
      prompt: 'Animate between the approved keyframes',
      operation: 'generate-from-keyframes',
      startFrameRef,
      endFrameRef,
      providerId: 'dashscope-provider',
      modelId: 'wan-keyframe-model',
    });

    expect(result.success).toBe(true);
    expect(media.generateVideo.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        operation: 'generate-from-keyframes',
        startFrameRef,
        endFrameRef,
      }),
    );
  });

  it('fails visibly for malformed stable video refs instead of dropping them', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(registry, 'GenerateVideo', {
      prompt: 'Animate the shot',
      operation: 'generate-from-keyframes',
      startFrameRef: { id: 'canvas-node-runtime-handle' },
      endFrameRef: createResourceRef('asset:image:end-frame'),
      providerId: 'dashscope-provider',
      modelId: 'wan-keyframe-model',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('startFrameRef must be a structurally valid ResourceRef');
    expect(media.generateVideo).not.toHaveBeenCalled();
  });

  it('uses runtime media model metadata when GenerateImage omits provider/model args', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(
      registry,
      'GenerateImage',
      { prompt: 'A mountain village' },
      {
        metadata: {
          mediaModels: {
            image: { providerId: 'flux-provider', modelId: 'flux-model', category: 'image' },
          },
        },
      },
    );

    expect(result.success).toBe(true);
    expect(media.generateImage.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        providerId: 'flux-provider',
        modelId: 'flux-model',
      }),
    );
  });

  it('rejects model-authored media routing args instead of falling back to defaults', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(registry, 'GenerateVideo', {
      prompt: 'A spaceship launch',
      providerId: 'runway-provider',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('rejects model-authored providerId/modelId');
    expect(media.generateVideo).not.toHaveBeenCalled();
  });

  it('uses runtime audio model metadata for GenerateTTS', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await executeAgentTool(
      registry,
      'GenerateTTS',
      { text: 'hello' },
      {
        metadata: {
          mediaModels: {
            audio: { providerId: 'tts-provider', modelId: 'tts-model', category: 'audio' },
          },
        },
      },
    );

    expect(result.success).toBe(true);
    expect(media.generateAudio.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        providerId: 'tts-provider',
        modelId: 'tts-model',
      }),
    );
  });
});

function createResourceRef(id: string): ResourceRef {
  return {
    id,
    scope: 'project',
    provider: 'workspace',
    kind: 'media',
    source: { kind: 'file', projectRelativePath: `assets/${id.replaceAll(':', '-')}.png` },
    fingerprint: { strategy: 'hash', value: `sha256:${id}` },
  };
}

function createGeneratedResourceRef(id: string): ResourceRef {
  return {
    id,
    scope: 'project',
    provider: 'generated-asset',
    kind: 'generated',
    source: { kind: 'generated-asset', generatedAssetId: id },
    fingerprint: { strategy: 'hash', value: `sha256:${id}` },
  };
}

function getPropertyDescription(
  tool: { parameters: Record<string, unknown> } | undefined,
  name: string,
): string | undefined {
  const properties = tool?.parameters['properties'] as
    Record<string, { description?: string }> | undefined;
  return properties?.[name]?.description;
}
