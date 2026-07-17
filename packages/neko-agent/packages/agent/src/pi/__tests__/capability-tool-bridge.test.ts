import {
  Type,
  createAssistantMessageEventStream,
  createModels,
  type AssistantMessage,
} from '@earendil-works/pi-ai';
import { describe, expect, it, vi } from 'vitest';

import {
  bridgePiCapabilityTools,
  resolvePiToolPermissionAction,
  type PiCapabilityTool,
} from '../capability-tool-bridge';
import { resolveAgentModelPolicy, type AgentModelBindingMap } from '../model-policy';

const identity = {
  workspaceId: 'workspace-1',
  conversationId: 'conversation-1',
  branchId: 'branch-main',
  turnId: 'turn-1',
  runId: 'run-1',
} as const;

const models = createModels();

describe('Pi tool permission action', () => {
  it('allows reads without user intervention while retaining risk-based confirmation', () => {
    expect(resolvePiToolPermissionAction('ask', false, true)).toBe('allow');
    expect(resolvePiToolPermissionAction('ask', undefined, true)).toBe('allow');
    expect(resolvePiToolPermissionAction('ask', true, true)).toBe('confirm');
    expect(resolvePiToolPermissionAction('ask', false, false)).toBe('confirm');
    expect(resolvePiToolPermissionAction('auto', false, false)).toBe('allow');
    expect(resolvePiToolPermissionAction('auto', undefined, false)).toBe('allow');
    expect(resolvePiToolPermissionAction('auto', true, false)).toBe('confirm');
    expect(resolvePiToolPermissionAction('plan', false, true)).toBe('deny');
  });
});

function completedStream(message: AssistantMessage) {
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    stream.push({ type: 'start', partial: message });
    if (message.stopReason === 'error' || message.stopReason === 'aborted') {
      stream.push({ type: 'error', reason: message.stopReason, error: message });
      return;
    }
    stream.push({ type: 'done', reason: message.stopReason, message });
  });
  return stream;
}

const mainModel = {
  id: 'main',
  name: 'Main',
  api: 'openai-completions' as const,
  provider: 'openai',
  baseUrl: 'https://api.openai.invalid/v1',
  reasoning: false,
  input: ['text' as const],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8_192,
  maxTokens: 1_024,
};

function policy(withVision = false) {
  return resolveAgentModelPolicy({
    catalog: [
      {
        model: mainModel,
        capabilities: ['llm.chat', 'tools'],
        credentialState: 'configured',
      },
      ...(withVision
        ? [
            {
              model: { ...mainModel, id: 'vision', name: 'Vision' },
              capabilities: ['image.understand'],
              credentialState: 'configured' as const,
            },
          ]
        : []),
    ],
    userBindings: {
      'agent.main': { providerId: 'openai', modelId: 'main' },
      ...(withVision ? { 'image.understand': { providerId: 'openai', modelId: 'vision' } } : {}),
    },
  });
}

describe('bridgePiCapabilityTools', () => {
  it('projects domain tool identities to distinct OpenAI-compatible wire names', async () => {
    const executeDotTool = vi.fn(async () => ({ content: [], details: {} }));
    const executeColonTool = vi.fn(async () => ({ content: [], details: {} }));
    const preflight = vi.fn(() => ({ allowed: true as const }));
    const domainTools: PiCapabilityTool[] = [
      {
        name: 'ReadImage',
        label: 'Read image',
        description: 'Read an image',
        parameters: Type.Object({}),
        execute: async () => ({ content: [], details: {} }),
      },
      {
        name: 'domain.tool',
        label: 'Dot tool',
        description: 'Execute the dotted domain tool',
        parameters: Type.Object({ value: Type.String() }),
        execute: executeDotTool,
      },
      {
        name: 'domain:tool',
        label: 'Colon tool',
        description: 'Execute the colon domain tool',
        parameters: Type.Object({}),
        execute: executeColonTool,
      },
      {
        name: `domain.${'long'.repeat(20)}`,
        label: 'Long tool',
        description: 'Exercise the provider name length boundary',
        parameters: Type.Object({}),
        execute: async () => ({ content: [], details: {} }),
      },
    ];
    const bridge = bridgePiCapabilityTools({
      tools: domainTools,
      identity,
      workspaceTrusted: true,
      modelPolicy: policy(),
      models,
      permissionPolicy: { preflight },
    });

    const wireNames = bridge.tools.map((tool) => tool.name);
    expect(wireNames).toHaveLength(4);
    expect(wireNames.every((name) => /^[a-zA-Z0-9_-]+$/.test(name))).toBe(true);
    expect(wireNames.every((name) => name.length <= 64)).toBe(true);
    expect(wireNames[0]).toBe('ReadImage');
    expect(new Set(wireNames).size).toBe(wireNames.length);
    expect(
      bridgePiCapabilityTools({
        tools: domainTools,
        identity,
        workspaceTrusted: true,
        modelPolicy: policy(),
        models,
        permissionPolicy: { preflight },
      }).tools.map((tool) => tool.name),
    ).toEqual(wireNames);

    const dottedWireTool = bridge.tools[1]!;
    expect(bridge.resolveDomainToolName(dottedWireTool.name)).toBe('domain.tool');
    expect(() => bridge.resolveDomainToolName('missing_wire_tool')).toThrow(
      'unregistered Capability tool',
    );
    await bridge.beforeToolCall({
      assistantMessage: {
        role: 'assistant',
        content: [],
        api: 'openai-completions',
        provider: 'openai',
        model: 'main',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'toolUse',
        timestamp: 1,
      },
      toolCall: {
        type: 'toolCall',
        id: 'tool-call-1',
        name: dottedWireTool.name,
        arguments: { value: 'x' },
      },
      args: { value: 'x' },
      context: { systemPrompt: '', messages: [], tools: [...bridge.tools] },
    });
    await dottedWireTool.execute('tool-call-1', { value: 'x' });

    expect(preflight).toHaveBeenCalledWith(
      expect.objectContaining({ tool: expect.objectContaining({ name: 'domain.tool' }) }),
    );
    expect(executeDotTool).toHaveBeenCalledOnce();
    expect(executeColonTool).not.toHaveBeenCalled();
  });

  it('isolates concurrent purpose tools, cancellation, and immutable model snapshots', async () => {
    const bindings: AgentModelBindingMap = {
      'agent.main': { providerId: 'openai', modelId: 'main' },
      'image.generate': { providerId: 'media-image', modelId: 'image-v1' },
      'video.understand': { providerId: 'media-video', modelId: 'video-v1' },
    };
    const snapshot = resolveAgentModelPolicy({
      catalog: [
        {
          model: mainModel,
          capabilities: ['llm.chat', 'tools'],
          credentialState: 'configured',
        },
        {
          model: {
            ...mainModel,
            provider: 'media-image',
            id: 'image-v1',
            name: 'Image v1',
          },
          capabilities: ['image.generate'],
          credentialState: 'configured',
        },
        {
          model: {
            ...mainModel,
            provider: 'media-video',
            id: 'video-v1',
            name: 'Video v1',
          },
          capabilities: ['video.understand'],
          credentialState: 'configured',
        },
      ],
      userBindings: bindings,
    });
    bindings['image.generate'] = { providerId: 'future-image', modelId: 'image-v2' };
    bindings['video.understand'] = { providerId: 'future-video', modelId: 'video-v2' };
    let finishVideo: (() => void) | undefined;
    const videoGate = new Promise<void>((resolve) => {
      finishVideo = resolve;
    });
    const observed: string[] = [];
    const bridge = bridgePiCapabilityTools({
      tools: [
        {
          name: 'generate_image',
          label: 'Generate image',
          description: 'Submit image generation',
          parameters: Type.Object({ prompt: Type.String() }),
          modelPurpose: 'image.generate',
          execute: async ({ context, signal }) => {
            observed.push(`${context.modelUse?.purpose}:${context.modelUse?.model.provider}`);
            await new Promise<void>((_resolve, reject) => {
              signal?.addEventListener('abort', () => reject(new Error('image cancelled')), {
                once: true,
              });
            });
            return { content: [], details: {} };
          },
        },
        {
          name: 'understand_video',
          label: 'Understand video',
          description: 'Return bounded video evidence',
          parameters: Type.Object({ resource: Type.String() }),
          modelPurpose: 'video.understand',
          execute: async ({ context }) => {
            observed.push(`${context.modelUse?.purpose}:${context.modelUse?.model.provider}`);
            await videoGate;
            return {
              content: [{ type: 'text', text: 'video evidence' }],
              details: { usage: { inputTokens: 4, outputTokens: 2 } },
            };
          },
        },
      ],
      identity,
      workspaceTrusted: true,
      modelPolicy: snapshot,
      models,
      permissionPolicy: { preflight: () => ({ allowed: true }) },
    });
    const imageAbort = new AbortController();
    const imageRun = bridge.tools[0]!.execute('image-call', { prompt: 'cat' }, imageAbort.signal);
    const videoRun = bridge.tools[1]!.execute('video-call', { resource: 'video-1' });

    imageAbort.abort();
    finishVideo?.();

    await expect(imageRun).rejects.toThrow('image cancelled');
    await expect(videoRun).resolves.toMatchObject({
      details: { usage: { inputTokens: 4, outputTokens: 2 } },
    });
    expect(observed).toEqual(['image.generate:media-image', 'video.understand:media-video']);
    expect(snapshot['image.generate']?.model.id).toBe('image-v1');
    expect(snapshot['video.understand']?.model.id).toBe('video-v1');
  });

  it('registers strict schemas and closes over exact identity and purpose model', async () => {
    const execute = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'evidence' }],
      details: { resource: 'resource-1' },
    }));
    const tool: PiCapabilityTool = {
      name: 'understand_image',
      label: 'Understand image',
      description: 'Return bounded evidence',
      parameters: Type.Object({ resource: Type.String() }, { additionalProperties: false }),
      modelPurpose: 'image.understand',
      execute,
    };
    const bridge = bridgePiCapabilityTools({
      tools: [tool],
      identity,
      workspaceTrusted: true,
      modelPolicy: policy(true),
      models,
      permissionPolicy: { preflight: () => ({ allowed: true }) },
    });

    expect(bridge.tools).toHaveLength(1);
    expect(bridge.tools[0]!.parameters).toMatchObject({
      type: 'object',
      additionalProperties: false,
    });
    await bridge.tools[0]!.execute('tool-call-1', { resource: 'resource-1' });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        args: { resource: 'resource-1' },
        context: expect.objectContaining({
          identity: { ...identity, toolCallId: 'tool-call-1' },
          workspaceTrusted: true,
          modelUse: expect.objectContaining({ purpose: 'image.understand' }),
          purposeModel: expect.objectContaining({
            purpose: 'image.understand',
            providerId: 'openai',
            modelId: 'vision',
          }),
        }),
      }),
    );
  });

  it('does not register a purpose tool when its flat binding is absent', () => {
    const bridge = bridgePiCapabilityTools({
      tools: [
        {
          name: 'understand_image',
          label: 'Understand image',
          description: 'Return evidence',
          parameters: Type.Object({ resource: Type.String() }),
          modelPurpose: 'image.understand',
          execute: async () => ({ content: [], details: {} }),
        },
      ],
      identity,
      workspaceTrusted: true,
      modelPolicy: policy(false),
      models,
      permissionPolicy: { preflight: () => ({ allowed: true }) },
    });

    expect(bridge.tools).toEqual([]);
  });

  it("keeps a mixed-domain tool's non-model path when its optional purpose is absent", async () => {
    const execute = vi.fn(async () => ({ content: [], details: { source: 'project-facade' } }));
    const bridge = bridgePiCapabilityTools({
      tools: [
        {
          name: 'quality_check',
          label: 'Quality check',
          description: 'Run project or perception quality checks',
          parameters: Type.Object({ target: Type.Object({}) }),
          modelPurpose: 'image.understand',
          modelPurposeRequirement: 'optional',
          execute,
        },
      ],
      identity,
      workspaceTrusted: true,
      modelPolicy: policy(false),
      models,
      permissionPolicy: { preflight: () => ({ allowed: true }) },
    });

    await expect(bridge.tools[0]!.execute('tool-call-1', { target: {} })).resolves.toMatchObject({
      details: { source: 'project-facade' },
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.not.objectContaining({ purposeModel: expect.anything() }),
      }),
    );
  });

  it('invokes bounded understanding through the exact Pi purpose model snapshot', async () => {
    const purposeModels = createModels();
    const streamSimple = vi.spyOn(purposeModels, 'streamSimple').mockReturnValue(
      completedStream({
        role: 'assistant',
        content: [{ type: 'text', text: '{"score":91}' }],
        api: 'openai-completions',
        provider: 'openai',
        model: 'vision',
        usage: {
          input: 12,
          output: 4,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 16,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: 1,
      }),
    );
    const bridge = bridgePiCapabilityTools({
      tools: [
        {
          name: 'understand_image',
          label: 'Understand image',
          description: 'Return bounded image evidence',
          parameters: Type.Object({ resource: Type.String() }),
          modelPurpose: 'image.understand',
          execute: async ({ context, signal }) => ({
            content: [
              {
                type: 'text',
                text: (
                  await context.purposeModel!.complete({
                    systemPrompt: 'Return JSON evidence.',
                    prompt: 'Inspect image.',
                    images: [{ data: 'AQID', mimeType: 'image/png' }],
                    maxTokens: 800,
                    ...(signal === undefined ? {} : { signal }),
                  })
                ).text,
              },
            ],
            details: {},
          }),
        },
      ],
      identity,
      workspaceTrusted: true,
      modelPolicy: policy(true),
      models: purposeModels,
      permissionPolicy: { preflight: () => ({ allowed: true }) },
    });

    await expect(
      bridge.tools[0]!.execute('tool-call-1', { resource: 'asset-1' }),
    ).resolves.toMatchObject({ content: [{ text: '{"score":91}' }] });
    expect(streamSimple).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', id: 'vision' }),
      expect.objectContaining({
        systemPrompt: 'Return JSON evidence.',
        messages: [
          expect.objectContaining({
            role: 'user',
            content: [
              { type: 'text', text: 'Inspect image.' },
              { type: 'image', data: 'AQID', mimeType: 'image/png' },
            ],
          }),
        ],
      }),
      expect.objectContaining({ maxTokens: 800 }),
    );
  });

  it('rejects a domain-executed image understanding binding instead of inventing a Pi payload', () => {
    const modelPolicy = resolveAgentModelPolicy({
      catalog: [
        {
          model: mainModel,
          capabilities: ['llm.chat'],
          credentialState: 'configured',
        },
        {
          model: { provider: 'media', id: 'vision-domain', name: 'Vision domain' },
          execution: 'domain',
          capabilities: ['image.understand'],
          credentialState: 'ambient',
        },
      ],
      userBindings: {
        'agent.main': { providerId: 'openai', modelId: 'main' },
        'image.understand': { providerId: 'media', modelId: 'vision-domain' },
      },
    });

    expect(() =>
      bridgePiCapabilityTools({
        tools: [
          {
            name: 'understand_image',
            label: 'Understand image',
            description: 'Return bounded image evidence',
            parameters: Type.Object({ resource: Type.String() }),
            modelPurpose: 'image.understand',
            execute: async () => ({ content: [], details: {} }),
          },
        ],
        identity,
        workspaceTrusted: true,
        modelPolicy,
        models,
        permissionPolicy: { preflight: () => ({ allowed: true }) },
      }),
    ).toThrow('Purpose image.understand requires a Pi-executed model binding.');
  });

  it('preflights explicit identity, workspace trust, and product permission', async () => {
    const preflight = vi.fn(() => ({ allowed: false as const, reason: 'user denied' }));
    const bridge = bridgePiCapabilityTools({
      tools: [
        {
          name: 'write_project',
          label: 'Write project',
          description: 'Write project state',
          parameters: Type.Object({ value: Type.String() }),
          requirements: { workspaceTrust: true },
          execute: async () => ({ content: [], details: {} }),
        },
      ],
      identity,
      workspaceTrusted: true,
      modelPolicy: policy(),
      models,
      permissionPolicy: { preflight },
    });
    const piTool = bridge.tools[0]!;
    const result = await bridge.beforeToolCall({
      assistantMessage: {
        role: 'assistant',
        content: [],
        api: 'openai-completions',
        provider: 'openai',
        model: 'main',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'toolUse',
        timestamp: 1,
      },
      toolCall: {
        type: 'toolCall',
        id: 'tool-call-1',
        name: piTool.name,
        arguments: { value: 'x' },
      },
      args: { value: 'x' },
      context: { systemPrompt: '', messages: [], tools: [piTool] },
    });

    expect(result).toEqual({ block: true, reason: 'user denied' });
    expect(preflight).toHaveBeenCalledWith({
      tool: expect.objectContaining({ name: 'write_project' }),
      args: { value: 'x' },
      identity: { ...identity, toolCallId: 'tool-call-1' },
      workspaceTrusted: true,
    });
  });

  it('propagates domain execution failures without converting them to success', async () => {
    const failure = new Error('domain write failed');
    const bridge = bridgePiCapabilityTools({
      tools: [
        {
          name: 'write_project',
          label: 'Write project',
          description: 'Write project state',
          parameters: Type.Object({ value: Type.String() }),
          execute: async () => {
            throw failure;
          },
        },
      ],
      identity,
      workspaceTrusted: true,
      modelPolicy: policy(),
      models,
      permissionPolicy: { preflight: () => ({ allowed: true }) },
    });

    await expect(bridge.tools[0]!.execute('tool-call-1', { value: 'x' })).rejects.toBe(failure);
  });
});
