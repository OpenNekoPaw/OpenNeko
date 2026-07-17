/**
 * Tool Registry — Tool execution dispatch (one of four registries in agent)
 *
 * Responsibility: Register tools by name, dispatch execution, produce LLM tool definitions.
 * This is the ONLY registry that actually executes tools.
 *
 * Registry landscape:
 * - ToolRegistry (this)       → execution dispatch (register/execute/toToolDefinitions)
 * Tool categories are descriptive Capability metadata. Skills are discovered and
 * invoked by the Pi Skill Host and never mutate this registry.
 */

import type {
  Tool,
  ToolCategory,
  ToolResult,
  ToolExecuteOptions,
  ToolExecutionConfig,
  ToolFilterOptions,
  ToolDefinitionProjectionOptions,
  IToolRegistry,
  AgentTraceContext,
} from '@neko/shared';
import { deriveAgentTraceContext, withAgentTrace } from '@neko/shared';
import { AgentError } from '../errors';
import { getLogger } from '../utils/logger';
import { validateSchema, formatValidationErrors } from './schema-validator';

const logger = getLogger('ToolRegistry');

/**
 * Default tool execution config
 */
const DEFAULT_EXECUTION_CONFIG: ToolExecutionConfig = {
  timeout: 30000,
  retry: {
    maxRetries: 0,
    retryableErrors: [],
  },
};

/**
 * Tool Registry implementation
 */
export class ToolRegistry implements IToolRegistry {
  /** Registered tools by name */
  private tools: Map<string, Tool> = new Map();
  /** Per-tool execution configs */
  private executionConfigs: Map<string, ToolExecutionConfig> = new Map();

  /**
   * Register a tool
   *
   * @param tool Tool to register
   * @throws Error if tool with same name already exists
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      logger.warn('Tool already registered, overwriting', { toolName: tool.name });
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool by name
   *
   * @param name Tool name to unregister
   */
  unregister(name: string): void {
    this.tools.delete(name);
    this.executionConfigs.delete(name);
  }

  /**
   * Get tool by name
   *
   * @param name Tool name
   * @returns Tool or undefined if not found
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   *
   * @param name Tool name
   * @returns true if tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all registered tools
   *
   * @returns Array of all tools
   */
  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * List tools by category
   *
   * @param category Tool category to filter by
   * @returns Array of tools in category
   */
  listByCategory(category: ToolCategory): Tool[] {
    return this.list().filter((tool) => tool.category === category);
  }

  /**
   * Execute a tool by name
   *
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool execution result
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    options?: ToolExecuteOptions,
  ): Promise<ToolResult> {
    const normalizedArgs = normalizeToolArguments(args);
    const requestId = createToolExecutionRequestId();
    const startedAt = Date.now();
    const logger = getToolRegistryLogger();
    const trace = normalizeOrdinaryToolLogTrace(
      deriveAgentTraceContext(options?.trace, {
        phase: 'tool',
        toolRequestId: requestId,
      }),
    );
    logger.debug('neko.agent.tool.execute.request', {
      ...withAgentTrace(trace, {
        requestId,
        toolName: name,
        argSummary: summarizeRecordShape(normalizedArgs),
        hasOptions: options !== undefined,
        metadataSummary: summarizeRecordShape(options?.metadata),
      }),
    });
    logger.debug('neko.agent.tool.execute.request.raw', {
      ...withAgentTrace(trace, {
        requestId,
        toolName: name,
        args: normalizedArgs,
        options: summarizeToolExecuteOptionsForDebug(options),
      }),
    });

    const tool = this.get(name);

    if (!tool) {
      logger.warn('neko.agent.tool.execute.failed', {
        ...withAgentTrace(trace, {
          requestId,
          toolName: name,
          durationMs: Date.now() - startedAt,
          reason: 'not-found',
        }),
      });
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    // Schema validation: catch parameter errors before execution
    if (tool.parameters) {
      const validationErrors = validateSchema(normalizedArgs, tool.parameters);
      if (validationErrors.length > 0) {
        logger.warn('neko.agent.tool.execute.failed', {
          ...withAgentTrace(trace, {
            requestId,
            toolName: name,
            category: tool.category,
            durationMs: Date.now() - startedAt,
            reason: 'validation',
            validationErrorCount: validationErrors.length,
            validationErrors,
          }),
        });
        return {
          success: false,
          error: formatValidationErrors(validationErrors),
          validationErrors,
        };
      }
    }

    try {
      const result = await tool.execute(normalizedArgs, options);
      const duration = Date.now() - startedAt;
      const resultWithDuration = {
        ...result,
        duration,
      };

      logger.debug('neko.agent.tool.execute.result', {
        ...withAgentTrace(trace, {
          requestId,
          toolName: name,
          category: tool.category,
          kind: tool.kind,
          durationMs: duration,
          success: resultWithDuration.success,
          resultSummary: summarizeToolResult(resultWithDuration),
        }),
      });
      logger.debug('neko.agent.tool.execute.result.raw', {
        ...withAgentTrace(trace, {
          requestId,
          toolName: name,
          result: resultWithDuration,
        }),
      });

      return resultWithDuration;
    } catch (error) {
      const duration = Date.now() - startedAt;
      logger.warn('neko.agent.tool.execute.failed', {
        ...withAgentTrace(trace, {
          requestId,
          toolName: name,
          category: tool.category,
          kind: tool.kind,
          durationMs: duration,
          reason: 'exception',
          error: summarizeUnknownError(error),
        }),
      });
      if (error instanceof AgentError) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Convert tools to LLM tool definitions
   *
   * Returns tools in the format expected by Claude/OpenAI API.
   * Supports filtering by include/exclude lists and categories.
   *
   * @param filter Optional filter to limit which tools are included
   * @returns Array of tool definitions
   */
  toToolDefinitions(
    filter?: ToolFilterOptions,
    options?: ToolDefinitionProjectionOptions,
  ): ReturnType<IToolRegistry['toToolDefinitions']> {
    let tools = this.list();
    const locale = normalizeToolDefinitionLocale(options?.locale);

    if (filter) {
      if (filter.include && filter.include.length > 0) {
        const includeSet = new Set(filter.include);
        tools = tools.filter((tool) => includeSet.has(tool.name));
      }
      if (filter.exclude && filter.exclude.length > 0) {
        const excludeSet = new Set(filter.exclude);
        tools = tools.filter((tool) => !excludeSet.has(tool.name));
      }
      if (filter.categories && filter.categories.length > 0) {
        tools = tools.filter((tool) => filter.categories!.includes(tool.category));
      }
    }

    return tools.map((tool) => {
      const localization = readToolDefinitionLocalization(tool, locale);
      return {
        type: 'function' as const,
        ...(tool.domain ? { domain: tool.domain } : {}),
        ...(tool.safetyKind || tool.targetRequirements || tool.queryBeforeMutate
          ? {
              planning: {
                ...(tool.safetyKind ? { safetyKind: tool.safetyKind } : {}),
                ...(tool.targetRequirements ? { targetRequirements: tool.targetRequirements } : {}),
                ...(tool.queryBeforeMutate ? { queryBeforeMutate: tool.queryBeforeMutate } : {}),
              },
            }
          : {}),
        function: {
          name: tool.name,
          description: localizeToolDescription(tool, localization, locale),
          parameters: toProviderToolParameters(tool.parameters, {
            toolName: tool.name,
            locale,
            localization,
          }),
        },
      };
    });
  }

  /**
   * Set execution config for a tool
   */
  setExecutionConfig(name: string, config: ToolExecutionConfig): void {
    this.executionConfigs.set(name, config);
  }

  /**
   * Get execution config for a tool
   */
  getExecutionConfig(name: string): ToolExecutionConfig {
    return this.executionConfigs.get(name) ?? DEFAULT_EXECUTION_CONFIG;
  }

  /**
   * Get tool count
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.executionConfigs.clear();
  }

  /**
   * Register multiple tools at once
   *
   * @param tools Array of tools to register
   */
  registerMany(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }
}

let toolExecutionSequence = 0;

function getToolRegistryLogger() {
  return getLogger('ToolRegistry');
}

function normalizeOrdinaryToolLogTrace(trace: AgentTraceContext): AgentTraceContext {
  if (trace.runId === undefined || trace.runId !== trace.turnId) {
    return trace;
  }
  return {
    conversationId: trace.conversationId,
    ...(trace.turnId !== undefined ? { turnId: trace.turnId } : {}),
    ...(trace.iteration !== undefined ? { iteration: trace.iteration } : {}),
    ...(trace.phase !== undefined ? { phase: trace.phase } : {}),
    ...(trace.parentRequestId !== undefined ? { parentRequestId: trace.parentRequestId } : {}),
    ...(trace.llmRequestId !== undefined ? { llmRequestId: trace.llmRequestId } : {}),
    ...(trace.toolRequestId !== undefined ? { toolRequestId: trace.toolRequestId } : {}),
  };
}

function createToolExecutionRequestId(now = Date.now()): string {
  toolExecutionSequence =
    toolExecutionSequence >= Number.MAX_SAFE_INTEGER ? 1 : toolExecutionSequence + 1;
  return `tool-${now.toString(36)}-${toolExecutionSequence.toString(36)}`;
}

function summarizeRecordShape(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) {
    return {
      keyCount: 0,
      keys: [],
    };
  }

  const keys = Object.keys(value);
  return {
    keyCount: keys.length,
    keys,
    fieldTypes: Object.fromEntries(keys.map((key) => [key, summarizeValueType(value[key])])),
  };
}

function summarizeToolExecuteOptionsForDebug(
  options: ToolExecuteOptions | undefined,
): Record<string, unknown> | undefined {
  if (!options) {
    return undefined;
  }

  return {
    hasOnProgress: options.onProgress !== undefined,
    metadata: options.metadata,
  };
}

function summarizeToolResult(result: ToolResult): Record<string, unknown> {
  return {
    hasData: result.data !== undefined,
    dataType: summarizeValueType(result.data),
    errorChars: result.error?.length ?? 0,
    duration: result.duration,
    validationErrorCount: result.validationErrors?.length ?? 0,
    attachmentCount: result.attachments?.length ?? 0,
    perceptionCardCount: result.perceptionCards?.length ?? 0,
    backfillDiagnosticCount: result.backfillDiagnostics?.length ?? 0,
  };
}

function summarizeValueType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  return typeof value;
}

function summarizeUnknownError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
}

function normalizeToolArguments(args: Record<string, unknown>): Record<string, unknown> {
  if (Object.keys(args).length !== 1 || typeof args['_raw'] !== 'string') {
    return args;
  }

  const parsed = parseRawToolArgumentObject(args['_raw'], 0);
  return parsed ?? args;
}

function parseRawToolArgumentObject(
  raw: string,
  depth: number,
): Record<string, unknown> | undefined {
  if (depth > 1) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (isPlainRecord(parsed)) return parsed;
    if (typeof parsed === 'string') return parseRawToolArgumentObject(parsed, depth + 1);
    return undefined;
  } catch {
    return undefined;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Create a tool registry instance
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

type ToolDefinitionLocale = 'en' | 'zh';

interface ProviderToolParameterProjectionOptions {
  readonly toolName: string;
  readonly locale: ToolDefinitionLocale;
  readonly localization?: ToolDefinitionLocalization;
}

interface ToolDefinitionLocalization {
  readonly description?: string;
  readonly parameters?: Readonly<Record<string, string>>;
}

const ZH_TOOL_DEFINITION_LOCALIZATIONS: Readonly<Record<string, ToolDefinitionLocalization>> = {
  ReadDocument: {
    description: '读取文档文件，返回文本、结构信息和可供 ReadImage 使用的 imageInfo/resourceRef。',
    parameters: {
      source: '文档来源。读取本地文件时使用 { kind: "file", path }，path 可为 ${VAR}/path。',
      'source.path': '读取本地文件时使用的 source.path，可为项目相对路径或 ${VAR}/path。',
      mode: '读取模式，例如 manifest、next 或 text。',
      pageRange: '可选页码范围；需要图片证据时优先使用 ReadDocument 返回的 imageInfo。',
      range: '语义文档范围，用于 mode="range"；包含 locator、可选 endLocator 和读取限制。',
      cursor: '先前 ReadDocument 结果返回的批量读取游标。',
      start_batch: 'mode="manifest" 时是否同时返回第一个按 manifest 顺序读取的游标。',
      max_chars: '最多返回的文本字符数，默认 20000，最大 100000。',
      include_metadata: '是否返回提取到的文档元数据，默认 true。',
      include_manifest: 'range/next 结果是否包含完整文档 manifest，默认 false。',
      include_images: '是否返回文档图片元数据和稳定 resourceRef，默认 true。',
      max_images: '最多返回的文档图片引用数量，默认 50，最大 500。',
      limit: '最多读取的条目数量。',
    },
  },
  ReadImage: {
    description:
      '读取图片内容。EPUB/PDF/CBZ 图片必须使用 ReadDocument.imageInfo 返回的 resourceRef，不能自行拼接路径。',
    parameters: {
      images: '要读取的图片列表。',
      'images.[].metadata': '从 ReadDocument.imageInfo 复制的可选图片元数据。',
      'images.[].resourceRef':
        '稳定资源引用，必须原样来自 ReadDocument.imageInfo[].resourceRef 或统一内容访问结果。',
      resourceRef: '稳定资源引用，必须来自 ReadDocument.imageInfo 或统一内容访问结果。',
      mode: '读取模式。当前只支持 metadata：读取元数据并把图片暴露给原生多模态 Agent 推理；不要使用 vision。',
      analysis: '希望图片分析回答的问题或分析类型。',
      prompt: '给下一次原生多模态 Agent 推理使用的可选提示；此工具本身不执行模型分析。',
      max_images: '最多处理的图片数量，默认 4，最大 16。',
    },
  },
  QuerySemanticCoverage: {
    description: '查询文档或资源的语义覆盖情况，用于判断哪些页面/图片已有可用理解结果。',
    parameters: {
      query: '覆盖查询条件。',
      sourceRef: '文档或资源来源引用。',
      range: '可选语义范围，使用共享 MediaTextRange 字段。',
      analysisKind: '要查询的语义分析类型。',
    },
  },
  Read: {
    description: '读取文件内容并返回带行号的文本。大文件可使用 offset/limit 分段读取。',
    parameters: {
      file_path: '要读取的文件绝对路径。',
      offset: '起始行号，从 1 开始。',
      limit: '最多读取的行数。',
    },
  },
  Write: {
    description: '写入文件内容；必要时创建父目录。仅在用户明确要求修改文件时使用。',
    parameters: {
      file_path: '要写入的文件路径；相对路径按工作区根目录解析。',
      content: '要写入的文本内容。',
      append: '是否追加到文件末尾，而不是覆盖。',
    },
  },
  ListDirectory: {
    description: '列出目录内容，返回文件名、类型和大小。',
    parameters: {
      path: '要列出的目录绝对路径。',
      recursive: '是否递归列出，默认最多 3 层。',
    },
  },
  Grep: {
    description: '使用正则搜索文件内容，返回匹配行、文件路径和行号。',
    parameters: {
      pattern: '用于搜索的正则表达式。',
      path: '要搜索的目录或文件。',
      include: '用于过滤文件的 glob，例如 *.ts 或 *.{ts,tsx}。',
      context: '匹配行前后附带的上下文行数。',
    },
  },
  GetContext: {
    description:
      '获取当前 Agent 上下文：已激活/已注册 Skill、注册的工具组目录，以及当前实际可调用 Tool 列表。注册目录不等于当前可调用或受支持。',
    parameters: {
      includeTools: '是否包含按运行时分类分组的当前可调用 Tool 名称。',
    },
  },
  ActivateSkill: {
    description:
      '在普通 Agent 理解并确认当前任务需要领域 Skill 后激活。不要只靠关键词匹配；调用前先简要说明原因并显式选择 lifecycle slot。主任务或明确替换使用 domainSkill，补充指导使用 referenceSkill。',
    parameters: {
      skillName: '要激活的技能名称。',
      reason: '基于当前对话和已收集上下文的简短原因，说明为什么现在需要该技能。',
      slot: '必填 lifecycle slot；主任务或明确替换使用 domainSkill，补充指导使用 referenceSkill。',
    },
  },
  DeactivateSkill: {
    description: '停用当前激活技能，移除其专用指导。',
    parameters: {
      recordId: '可选的生命周期记录 ID。',
      slot: '可选的生命周期槽位。',
      skillName: '可选的技能名称；仅在不会歧义时使用。',
    },
  },
  GenerateImage: {
    description:
      '提交生成式异步图片 Task，只产出 generated 草稿；等待稳定结果并观察实际图片和 Quality 证据后再接受或修复，不代表项目或交付完成。',
    parameters: {
      prompt: '图片生成提示词。',
      referenceImageUri: '可选宿主已解析的参考图片。',
      providerId: '可选当前媒体 Provider ID。',
      modelId: '可选当前图片模型 ID；必须与 Provider 成对提供。',
      size: '输出图片尺寸。',
    },
  },
  GenerateVideo: {
    description:
      '提交生成式异步单片段视频 Task；仅在当前 Provider/model 支持所需控制且该技术适合镜头时使用，结果不是时间线、成片或交付证明。',
    parameters: {
      prompt: '视频生成提示词。',
      referenceImageUri: '可选宿主已解析的参考图或首帧。',
      startFrameRef: '稳定首帧 ResourceRef。',
      endFrameRef: '稳定尾帧 ResourceRef。',
      duration: '视频时长，单位秒。',
      fps: '帧率。',
      aspectRatio: '画幅比例。',
      providerId: '可选当前媒体 Provider ID。',
      modelId: '可选当前视频模型 ID；必须与 Provider 成对提供。',
    },
  },
  GenerateMusic: {
    description: '根据场景、情绪或风格提示生成音乐。',
    parameters: {
      prompt: '音乐生成提示词。',
      duration: '音乐时长，单位秒。',
      model: '音频模型 ID。',
    },
  },
  GenerateTTS: {
    description: '根据文本和声音配置生成语音。',
    parameters: {
      text: '要朗读的文本。',
      voice: '声音或说话人配置。',
      model: '语音模型 ID。',
    },
  },
};

function toProviderToolParameters(
  toolParameters: Tool['parameters'],
  options: ProviderToolParameterProjectionOptions,
): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...toolParameters };
  delete rest['anyOf'];
  delete rest['oneOf'];
  delete rest['allOf'];
  delete rest['enum'];
  delete rest['not'];

  const parameters = {
    ...rest,
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(toolParameters.properties).map(([name, property]) => [
        name,
        cloneSchemaValue(property),
      ]),
    ),
    ...(toolParameters.required ? { required: [...toolParameters.required] } : {}),
  };

  return localizeToolParameters(parameters, options);
}

function normalizeToolDefinitionLocale(locale: string | undefined): ToolDefinitionLocale {
  return locale?.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function localizeToolDescription(
  tool: Tool,
  localization: ToolDefinitionLocalization | undefined,
  locale: ToolDefinitionLocale,
): string {
  if (locale === 'en') return localization?.description ?? tool.description;
  return (
    localization?.description ??
    ZH_TOOL_DEFINITION_LOCALIZATIONS[tool.name]?.description ??
    tool.description
  );
}

function localizeToolParameters(
  parameters: Record<string, unknown>,
  options: ProviderToolParameterProjectionOptions,
): Record<string, unknown> {
  const localizedDescriptions =
    options.localization?.parameters ??
    (options.locale === 'zh'
      ? ZH_TOOL_DEFINITION_LOCALIZATIONS[options.toolName]?.parameters
      : undefined);
  if (!localizedDescriptions) return parameters;
  return localizeSchemaDescriptions(parameters, localizedDescriptions, []);
}

function readToolDefinitionLocalization(
  tool: Tool,
  locale: ToolDefinitionLocale,
): ToolDefinitionLocalization | undefined {
  if (!tool.localization) return undefined;
  const localeKeys = locale === 'zh' ? ['zh', 'zh-cn', 'zh-hans'] : ['en', 'en-us'];
  for (const localeKey of localeKeys) {
    const localized = tool.localization[localeKey];
    if (localized) return localized;
  }
  return undefined;
}

function localizeSchemaDescriptions(
  value: Record<string, unknown>,
  descriptions: Readonly<Record<string, string>>,
  path: readonly string[],
): Record<string, unknown> {
  const localized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'properties' && isPlainRecord(child)) {
      localized[key] = Object.fromEntries(
        Object.entries(child).map(([propertyName, propertySchema]) => [
          propertyName,
          localizeSchemaProperty(propertySchema, descriptions, [...path, propertyName]),
        ]),
      );
      continue;
    }

    if (key === 'items' && isPlainRecord(child)) {
      localized[key] = localizeSchemaDescriptions(child, descriptions, [...path, '[]']);
      continue;
    }

    localized[key] = child;
  }
  return localized;
}

function localizeSchemaProperty(
  value: unknown,
  descriptions: Readonly<Record<string, string>>,
  path: readonly string[],
): unknown {
  if (!isPlainRecord(value)) return value;
  const localized = localizeSchemaDescriptions(value, descriptions, path);
  const propertyName = path[path.length - 1];
  const description =
    descriptions[path.join('.')] ?? (propertyName ? descriptions[propertyName] : undefined);
  return description ? { ...localized, description } : localized;
}

function cloneSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneSchemaValue);
  }
  if (!isPlainRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneSchemaValue(child)]),
  );
}
