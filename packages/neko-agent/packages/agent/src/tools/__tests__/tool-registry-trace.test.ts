import { describe, expect, it, vi } from 'vitest';
import {
  CapturedLogTransport,
  ConsoleLogger,
  LogLevel,
  SCENE_RENDER_SERVICE_PORT_ID,
  createAgentTraceContext,
  createTool,
  type ToolExecuteOptions,
} from '@neko/shared';

interface TestJsonSchema {
  readonly description?: string;
  readonly properties?: Readonly<Record<string, TestJsonSchema>>;
  readonly items?: TestJsonSchema;
}

describe('ToolRegistry trace isolation', () => {
  it('logs trace without adding trace to model-authored tool arguments', async () => {
    const transport = new CapturedLogTransport();
    const { setRootLogger } = await import('../../utils/logger');
    setRootLogger(new ConsoleLogger('Agent', LogLevel.Debug, [transport]));
    const { ToolRegistry } = await import('../tool-registry');
    const execute = vi.fn(
      async (_args: Record<string, unknown>, _options?: ToolExecuteOptions) => ({
        success: true,
        data: 'ok',
      }),
    );
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ReadFile',
        description: 'Read a file',
        category: 'file',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
        execute,
      }),
    );

    const args = { path: 'package.json' };
    await registry.execute('ReadFile', args, {
      trace: createAgentTraceContext({
        conversationId: 'conv-1',
        runId: 'run-1',
        turnId: 'turn-1',
        phase: 'tool',
      }),
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const [receivedArgs, receivedOptions] = execute.mock.calls[0] as [
      Record<string, unknown>,
      ToolExecuteOptions,
    ];
    expect(receivedArgs).toEqual(args);
    expect(receivedArgs).not.toHaveProperty('trace');
    expect(receivedOptions.trace).toEqual(
      expect.objectContaining({
        conversationId: 'conv-1',
        phase: 'tool',
      }),
    );

    const requestLog = transport
      .list()
      .find((entry) => entry.message === 'neko.agent.tool.execute.request');
    expect(requestLog?.data).toEqual(
      expect.objectContaining({
        requestId: expect.stringMatching(/^tool-/),
        trace: expect.objectContaining({
          conversationId: 'conv-1',
          toolRequestId: expect.stringMatching(/^tool-/),
        }),
      }),
    );
  });

  it('logs ordinary tool calls by conversation, turn, and tool request without duplicate run id', async () => {
    const transport = new CapturedLogTransport();
    const { setRootLogger } = await import('../../utils/logger');
    setRootLogger(new ConsoleLogger('Agent', LogLevel.Debug, [transport]));
    const { ToolRegistry } = await import('../tool-registry');
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ReadFile',
        description: 'Read a file',
        category: 'file',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
        execute: vi.fn(async () => ({ success: true, data: 'ok' })),
      }),
    );

    await registry.execute(
      'ReadFile',
      { path: 'package.json' },
      {
        trace: createAgentTraceContext({
          conversationId: 'conv-tool-log',
          runId: 'turn-conv-tool-log-a',
          turnId: 'turn-conv-tool-log-a',
          phase: 'tool',
        }),
      },
    );

    const requestLog = transport
      .list()
      .find((entry) => entry.message === 'neko.agent.tool.execute.request');
    const resultLog = transport
      .list()
      .find((entry) => entry.message === 'neko.agent.tool.execute.result');
    const requestData = requestLog?.data as
      { requestId?: string; trace?: Record<string, unknown> } | undefined;
    const resultData = resultLog?.data as
      { requestId?: string; trace?: Record<string, unknown> } | undefined;

    expect(requestData).toBeDefined();
    expect(resultData).toBeDefined();
    expect(requestData!.trace).toEqual(
      expect.objectContaining({
        conversationId: 'conv-tool-log',
        turnId: 'turn-conv-tool-log-a',
        phase: 'tool',
        toolRequestId: requestData!.requestId,
      }),
    );
    expect(requestData!.trace).not.toHaveProperty('runId');
    expect(resultData!.trace).toEqual(
      expect.objectContaining({
        conversationId: 'conv-tool-log',
        turnId: 'turn-conv-tool-log-a',
        phase: 'tool',
        toolRequestId: requestData!.requestId,
      }),
    );
    expect(resultData!.trace).not.toHaveProperty('runId');
  });
});

describe('ToolRegistry argument normalization', () => {
  it('unwraps valid raw JSON object arguments before schema validation', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const execute = vi.fn(async () => ({ success: true, data: 'ok' }));
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ReadDocument',
        description: 'Read a document',
        category: 'document',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          properties: {
            source: { type: 'object' },
          },
          required: ['source'],
        },
        execute,
      }),
    );

    const result = await registry.execute('ReadDocument', {
      _raw: '{"source":{"kind":"file","path":"${A}/book.epub"},"mode":"manifest"}',
    });

    expect(result.success).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      {
        source: { kind: 'file', path: '${A}/book.epub' },
        mode: 'manifest',
      },
      undefined,
    );
  });

  it('unwraps double-encoded raw JSON object arguments before schema validation', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const execute = vi.fn(async () => ({ success: true, data: 'ok' }));
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'canvas.createStoryboardFromMarkdown',
        description: 'Create storyboard nodes',
        category: 'project',
        parameters: {
          type: 'object',
          properties: {
            markdown: { type: 'string' },
            mode: { type: 'string' },
          },
          required: ['markdown'],
        },
        execute,
      }),
    );

    const result = await registry.execute('canvas.createStoryboardFromMarkdown', {
      _raw: JSON.stringify(
        JSON.stringify({
          markdown: '| scene | shot |\\n| --- | --- |\\n| Opening | 1 |',
          mode: 'create-nodes',
        }),
      ),
    });

    expect(result.success).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      {
        markdown: '| scene | shot |\\n| --- | --- |\\n| Opening | 1 |',
        mode: 'create-nodes',
      },
      undefined,
    );
  });

  it('keeps malformed raw arguments fail-visible', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const execute = vi.fn(async () => ({ success: true, data: 'ok' }));
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ReadDocument',
        description: 'Read a document',
        category: 'document',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          properties: {
            source: { type: 'object' },
          },
          required: ['source'],
        },
        execute,
      }),
    );

    const result = await registry.execute('ReadDocument', { _raw: 'not json' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required field: "source"');
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('ToolRegistry external research drift guard', () => {
  it('fails visibly when external research tools are not registered', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const registry = new ToolRegistry();

    await expect(registry.execute('WebSearch', { query: 'current references' })).resolves.toEqual({
      success: false,
      error: 'Tool not found: WebSearch',
    });
    await expect(registry.execute('WebFetch', { url: 'https://example.com' })).resolves.toEqual({
      success: false,
      error: 'Tool not found: WebFetch',
    });
  });
});

describe('ToolRegistry nested schema validation', () => {
  it('rejects array object items that miss required fields before execution', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const execute = vi.fn(async () => ({ success: true, data: 'ok' }));
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ReadImage',
        description: 'Read image content',
        category: 'analysis',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          required: ['images'],
          properties: {
            images: {
              type: 'array',
              items: {
                type: 'object',
                required: ['resourceRef'],
                properties: {
                  entryPath: { type: 'string' },
                  resourceRef: { type: 'object' },
                },
              },
            },
          },
        },
        execute,
      }),
    );

    const result = await registry.execute('ReadImage', {
      images: [{ entryPath: 'OPS/page-1.jpg' }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required field: "images[0].resourceRef"');
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('ToolRegistry provider schema projection', () => {
  it('keeps provider tool parameters as top-level object schemas', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ReadImage',
        description: 'Read image content',
        category: 'analysis',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          required: ['images'],
          properties: {
            images: {
              type: 'array',
              items: { type: 'object' },
            },
            mode: {
              type: 'string',
              enum: ['metadata', 'vision'],
            },
          },
        },
        execute: async () => ({ success: true, data: 'ok' }),
      }),
    );

    const [definition] = registry.toToolDefinitions();
    const parameters = definition?.function.parameters;

    expect(parameters).toEqual(
      expect.objectContaining({
        type: 'object',
        properties: expect.objectContaining({
          mode: expect.objectContaining({
            enum: ['metadata', 'vision'],
          }),
        }),
      }),
    );
    expect(parameters).not.toHaveProperty('anyOf');
    expect(parameters).not.toHaveProperty('oneOf');
    expect(parameters).not.toHaveProperty('allOf');
    expect(parameters).not.toHaveProperty('enum');
    expect(parameters).not.toHaveProperty('not');
  });

  it('projects localized tool descriptions and parameter descriptions for Chinese runtime prompts', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ReadDocument',
        description: 'Read a document file and return text plus image metadata.',
        category: 'document',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          required: ['source'],
          properties: {
            source: {
              type: 'object',
              description: 'Document source. Use a file source with a stable path.',
              properties: {
                path: {
                  type: 'string',
                  description: 'Source path for kind="file"; may be project-relative.',
                },
              },
            },
            mode: {
              type: 'string',
              enum: ['manifest', 'next'],
              description: 'Read mode.',
            },
            range: {
              type: 'object',
              description: 'Semantic document range for mode="range".',
            },
            cursor: {
              type: 'object',
              description: 'Document batch cursor returned by a prior ReadDocument result.',
            },
            include_images: {
              type: 'boolean',
              description: 'Whether to include document image metadata.',
            },
          },
        },
        execute: async () => ({ success: true, data: 'ok' }),
      }),
    );

    const [definition] = registry.toToolDefinitions(undefined, { locale: 'zh' });
    const properties = definition?.function.parameters['properties'] as Readonly<
      Record<string, TestJsonSchema>
    >;

    expect(definition?.function.description).toBe(
      '读取文档文件，返回文本、结构信息和可供 ReadImage 使用的 imageInfo/resourceRef。',
    );
    expect(properties['source']?.description).toBe(
      '文档来源。读取本地文件时使用 { kind: "file", path }，path 可为 ${VAR}/path。',
    );
    expect(properties['source']?.properties?.path?.description).toBe(
      '读取本地文件时使用的 source.path，可为项目相对路径或 ${VAR}/path。',
    );
    expect(properties['mode']?.description).toBe('读取模式，例如 manifest、next 或 text。');
    expect(properties['range']?.description).toBe(
      '语义文档范围，用于 mode="range"；包含 locator、可选 endLocator 和读取限制。',
    );
    expect(properties['cursor']?.description).toBe('先前 ReadDocument 结果返回的批量读取游标。');
    expect(properties['include_images']?.description).toBe(
      '是否返回文档图片元数据和稳定 resourceRef，默认 true。',
    );
  });

  it('localizes nested ReadImage and semantic coverage schema descriptions for Chinese runtime prompts', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ReadImage',
        description: 'Read image content.',
        category: 'analysis',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          required: ['images'],
          properties: {
            images: {
              type: 'array',
              description: 'Structured image inputs.',
              items: {
                type: 'object',
                required: ['resourceRef'],
                properties: {
                  metadata: {
                    type: 'object',
                    description: 'Optional metadata copied from ReadDocument.imageInfo.',
                  },
                  resourceRef: {
                    type: 'object',
                    description: 'Stable resource ref returned by ReadDocument.',
                  },
                },
              },
            },
            prompt: {
              type: 'string',
              description: 'Optional hint for the next native multimodal Agent reasoning step.',
            },
            mode: {
              type: 'string',
              enum: ['metadata'],
              description:
                'metadata reads local file/image metadata and exposes images to the native multimodal Agent turn.',
            },
            max_images: {
              type: 'integer',
              description: 'Maximum number of images to process.',
            },
          },
        },
        execute: async () => ({ success: true, data: 'ok' }),
      }),
    );
    registry.register(
      createTool({
        name: 'QuerySemanticCoverage',
        description: 'Query semantic coverage.',
        category: 'analysis',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          required: ['sourceRef', 'analysisKind'],
          properties: {
            sourceRef: {
              type: 'object',
              description: 'Stable content source reference.',
            },
            range: {
              type: 'object',
              description: 'Optional range using the shared MediaTextRange fields.',
            },
            analysisKind: {
              type: 'string',
              enum: ['storyboard'],
            },
          },
        },
        execute: async () => ({ success: true, data: 'ok' }),
      }),
    );

    const definitions = registry.toToolDefinitions(undefined, { locale: 'zh-CN' });
    const readImage = definitions.find((definition) => definition.function.name === 'ReadImage');
    const semanticCoverage = definitions.find(
      (definition) => definition.function.name === 'QuerySemanticCoverage',
    );
    const readImageProperties = readImage?.function.parameters['properties'] as Readonly<
      Record<string, TestJsonSchema>
    >;
    const imageItemProperties = readImageProperties['images']?.items?.properties;
    const coverageProperties = semanticCoverage?.function.parameters['properties'] as Readonly<
      Record<string, TestJsonSchema>
    >;

    expect(imageItemProperties?.['metadata']?.description).toBe(
      '从 ReadDocument.imageInfo 复制的可选图片元数据。',
    );
    expect(readImageProperties['prompt']?.description).toBe(
      '给下一次原生多模态 Agent 推理使用的可选提示；此工具本身不执行模型分析。',
    );
    expect(readImageProperties['mode']?.description).toBe(
      '读取模式。当前只支持 metadata：读取元数据并把图片暴露给原生多模态 Agent 推理；不要使用 vision。',
    );
    expect(readImageProperties['max_images']?.description).toBe(
      '最多处理的图片数量，默认 4，最大 16。',
    );
    expect(coverageProperties['range']?.description).toBe(
      '可选语义范围，使用共享 MediaTextRange 字段。',
    );
  });

  it('prefers tool-provided localization metadata for dynamically registered tools', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'custom_story_tool',
        description: 'Create story data.',
        category: 'workflow',
        localization: {
          zh: {
            description: '创建剧情数据。',
            parameters: {
              title: '剧情标题。',
            },
          },
        },
        parameters: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', description: 'Story title.' },
          },
        },
        execute: async () => ({ success: true, data: 'ok' }),
      }),
    );

    const [definition] = registry.toToolDefinitions(undefined, { locale: 'zh-CN' });
    const properties = definition?.function.parameters['properties'] as Record<
      string,
      { description?: string }
    >;

    expect(definition?.function.description).toBe('创建剧情数据。');
    expect(properties['title']?.description).toBe('剧情标题。');
  });

  it('projects optional domain metadata outside provider parameters', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ModelInspectScene',
        description: 'Inspect the active 3D scene.',
        category: 'analysis',
        isConcurrencySafe: true,
        isReadOnly: true,
        domain: {
          id: 'scene',
          source: 'engine-tool',
          servicePortId: SCENE_RENDER_SERVICE_PORT_ID,
        },
        parameters: {
          type: 'object',
          properties: {
            nodeId: { type: 'string' },
          },
        },
        execute: async () => ({ success: true, data: 'ok' }),
      }),
    );

    const [definition] = registry.toToolDefinitions();

    expect(definition?.domain).toEqual({
      id: 'scene',
      source: 'engine-tool',
      servicePortId: SCENE_RENDER_SERVICE_PORT_ID,
    });
    expect(definition?.function.parameters).not.toHaveProperty('domain');
  });

  it('projects planning metadata outside provider parameters', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'PuppetSetBone',
        description: 'Move a native puppet bone.',
        category: 'media',
        safetyKind: 'non-destructive-mutation',
        targetRequirements: {
          required: ['puppetId', 'bone'],
          allowedFallbacks: ['selection'],
        },
        queryBeforeMutate: {
          preferredQueryTools: ['InspectPuppet2D'],
          reason: 'Resolve native puppet capability and stable bone ids before editing.',
        },
        parameters: {
          type: 'object',
          properties: {
            puppetId: { type: 'string' },
            bone: { type: 'string' },
          },
          required: ['puppetId', 'bone'],
        },
        execute: async () => ({ success: true, data: 'ok' }),
      }),
    );

    const [definition] = registry.toToolDefinitions();

    expect(definition?.planning).toEqual({
      safetyKind: 'non-destructive-mutation',
      targetRequirements: {
        required: ['puppetId', 'bone'],
        allowedFallbacks: ['selection'],
      },
      queryBeforeMutate: {
        preferredQueryTools: ['InspectPuppet2D'],
        reason: 'Resolve native puppet capability and stable bone ids before editing.',
      },
    });
    expect(definition?.function.parameters).not.toHaveProperty('planning');
    expect(definition?.function.parameters).not.toHaveProperty('safetyKind');
    expect(definition?.function.parameters).not.toHaveProperty('targetRequirements');
    expect(definition?.function.parameters).not.toHaveProperty('queryBeforeMutate');
  });
});
