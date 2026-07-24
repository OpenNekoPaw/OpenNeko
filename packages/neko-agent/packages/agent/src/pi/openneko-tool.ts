import {
  TOOL_NAMES_MEDIA,
  TOOL_NAMES_PERCEPTION,
  TOOL_NAMES_QUALITY,
  type Tool,
  type ToolParameters,
  type ToolResult,
} from '@neko/shared';
import { Type, type TObjectOptions } from 'typebox';
import type { AgentToolResult, AgentToolUpdateCallback } from '@earendil-works/pi-agent-core';

import type {
  PiCapabilityTool,
  PiCapabilityToolContext,
  PiCapabilityToolRequirements,
} from './capability-tool-bridge';
import type { AgentModelPurpose } from './model-policy';

type ToolModelPurpose = Exclude<AgentModelPurpose, 'agent.main'>;
const DETACHED_GENERATION_MODEL_PURPOSES = Object.freeze([
  'image.generate',
  'video.generate',
  'audio.generate',
] as const satisfies readonly ToolModelPurpose[]);

export interface ProjectOpenNekoToolOptions {
  readonly modelPurpose?: ToolModelPurpose;
  readonly modelPurposes?: readonly ToolModelPurpose[];
  readonly resolveModelPurpose?: (args: unknown) => ToolModelPurpose;
  readonly modelPurposeRequirement?: 'required' | 'optional';
  readonly locale?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export function resolveOpenNekoToolModelPurpose(
  tool: Pick<Tool, 'name'>,
): ToolModelPurpose | undefined {
  switch (tool.name) {
    case TOOL_NAMES_QUALITY.QUALITY_CHECK:
    case TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND:
      return 'image.understand';
    case TOOL_NAMES_MEDIA.GENERATE_IMAGE:
      return 'image.generate';
    case TOOL_NAMES_MEDIA.TRANSFORM_IMAGE:
      return 'image.edit';
    case TOOL_NAMES_MEDIA.GENERATE_VIDEO:
      return 'video.generate';
    case TOOL_NAMES_MEDIA.GENERATE_MUSIC:
      return 'audio.music.generate';
    case TOOL_NAMES_MEDIA.GENERATE_TTS:
      return 'audio.tts';
    default:
      return undefined;
  }
}

export function resolveOpenNekoToolModelPurposes(
  tool: Pick<Tool, 'name'>,
): readonly ToolModelPurpose[] {
  if (tool.name === 'SubmitGenerationJob') {
    return DETACHED_GENERATION_MODEL_PURPOSES;
  }
  const purpose = resolveOpenNekoToolModelPurpose(tool);
  return purpose === undefined ? [] : [purpose];
}

export function resolveOpenNekoToolCallModelPurpose(
  tool: Pick<Tool, 'name'>,
  args: unknown,
): ToolModelPurpose | undefined {
  const staticPurpose = resolveOpenNekoToolModelPurpose(tool);
  if (staticPurpose !== undefined) return staticPurpose;
  if (tool.name !== 'SubmitGenerationJob') return undefined;
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new Error('SubmitGenerationJob requires object arguments.');
  }
  switch (Reflect.get(args, 'kind')) {
    case 'image':
      return 'image.generate';
    case 'video':
      return 'video.generate';
    case 'audio':
      return 'audio.generate';
    default:
      throw new Error('SubmitGenerationJob requires kind image, video, or audio.');
  }
}

export class OpenNekoPiToolExecutionError extends Error {
  constructor(
    readonly toolName: string,
    readonly result: ToolResult,
  ) {
    super(result.error ?? `OpenNeko tool ${toolName} failed without an error message.`);
    this.name = 'OpenNekoPiToolExecutionError';
  }
}

export function projectOpenNekoTool(
  tool: Tool,
  options: ProjectOpenNekoToolOptions = {},
): PiCapabilityTool<ToolResult> {
  const parameters = Type.Object({}, toTypeBoxObjectOptions(tool.parameters));
  const requirements = projectRequirements(tool);
  return Object.freeze({
    name: tool.name,
    label: tool.name,
    description: resolveDescription(tool, options.locale),
    parameters,
    ...(options.modelPurpose === undefined ? {} : { modelPurpose: options.modelPurpose }),
    ...(options.modelPurposes === undefined
      ? {}
      : { modelPurposes: Object.freeze([...options.modelPurposes]) }),
    ...(options.resolveModelPurpose === undefined
      ? {}
      : { resolveModelPurpose: options.resolveModelPurpose }),
    ...(options.modelPurposeRequirement === undefined
      ? {}
      : { modelPurposeRequirement: options.modelPurposeRequirement }),
    ...(tool.isConcurrencySafe === true ? { executionMode: 'parallel' as const } : {}),
    ...(tool.isReadOnly === true ? { isReadOnly: true } : {}),
    ...(tool.requiresConfirmation === undefined
      ? {}
      : { requiresConfirmation: tool.requiresConfirmation }),
    ...(requirements === undefined ? {} : { requirements }),
    execute: async (input: {
      readonly args: unknown;
      readonly context: PiCapabilityToolContext;
      readonly signal?: AbortSignal;
      readonly onUpdate?: AgentToolUpdateCallback<ToolResult>;
    }): Promise<AgentToolResult<ToolResult>> => {
      const { args, context, signal, onUpdate } = input;
      const record = requireArgumentsRecord(tool.name, args);
      const result = await tool.execute(record, {
        ...(signal === undefined ? {} : { signal }),
        ...(context.purposeModel === undefined ? {} : { purposeModel: context.purposeModel }),
        metadata: createExecutionMetadata(context, options.metadata),
        trace: {
          conversationId: context.identity.conversationId,
          runId: context.identity.runId,
          turnId: context.identity.turnId,
          toolRequestId: context.identity.toolCallId,
          phase: 'tool',
        },
        ...(onUpdate === undefined
          ? {}
          : {
              onProgress: (progress) =>
                onUpdate({
                  content: [{ type: 'text', text: progress.stage }],
                  details: {
                    success: true,
                    data: progress,
                  },
                }),
            }),
      });
      if (signal?.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new Error(`OpenNeko tool ${tool.name} was cancelled.`);
      }
      if (!result.success) throw new OpenNekoPiToolExecutionError(tool.name, result);
      return {
        content: [{ type: 'text', text: formatToolResultForModel(result) }],
        details: structuredClone(result),
      };
    },
  });
}

export function projectOpenNekoTools(
  tools: readonly Tool[],
  options?: {
    readonly locale?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
    readonly purposesForTool?: (tool: Tool) => readonly ToolModelPurpose[];
    readonly purposeForToolCall?: (tool: Tool, args: unknown) => ToolModelPurpose | undefined;
    readonly isPurposeOptionalForTool?: (tool: Tool) => boolean;
  },
): readonly PiCapabilityTool<ToolResult>[] {
  return Object.freeze(
    tools.map((tool) => {
      const purposes = options?.purposesForTool?.(tool) ?? [];
      const purposeForToolCall = options?.purposeForToolCall;
      if (purposes.length > 1 && purposeForToolCall === undefined) {
        throw new Error(
          `OpenNeko tool ${tool.name} declares multiple model purposes without call-time routing.`,
        );
      }
      return projectOpenNekoTool(tool, {
        ...(options?.locale === undefined ? {} : { locale: options.locale }),
        ...(options?.metadata === undefined ? {} : { metadata: options.metadata }),
        ...(purposes.length === 0
          ? {}
          : purposes.length === 1
            ? { modelPurpose: purposes[0] }
            : {
                modelPurposes: purposes,
                resolveModelPurpose: (args: unknown) => {
                  const purpose = purposeForToolCall?.(tool, args);
                  if (purpose === undefined) {
                    throw new Error(
                      `OpenNeko tool ${tool.name} did not resolve a model purpose for this call.`,
                    );
                  }
                  return purpose;
                },
              }),
        ...(options?.isPurposeOptionalForTool?.(tool) === true
          ? { modelPurposeRequirement: 'optional' as const }
          : {}),
      });
    }),
  );
}

function projectRequirements(tool: Tool): PiCapabilityToolRequirements | undefined {
  if (tool.requirements?.writableProject === true) {
    return Object.freeze({ workspaceTrust: true });
  }
  return undefined;
}

function toTypeBoxObjectOptions(parameters: ToolParameters): TObjectOptions {
  return {
    properties: structuredClone(parameters.properties),
    ...(parameters.required === undefined ? {} : { required: [...parameters.required] }),
    ...(parameters.anyOf === undefined ? {} : { anyOf: structuredClone(parameters.anyOf) }),
    ...(parameters.additionalProperties === undefined
      ? {}
      : { additionalProperties: parameters.additionalProperties }),
  };
}

function resolveDescription(tool: Tool, locale: string | undefined): string {
  if (locale === undefined) return tool.description;
  return tool.localization?.[locale]?.description ?? tool.description;
}

function requireArgumentsRecord(toolName: string, args: unknown): Record<string, unknown> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new Error(`OpenNeko tool ${toolName} requires object arguments.`);
  }
  return Object.fromEntries(Object.entries(args));
}

function createExecutionMetadata(
  context: PiCapabilityToolContext,
  metadata: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    workspaceId: context.identity.workspaceId,
    conversationId: context.identity.conversationId,
    branchId: context.identity.branchId,
    turnId: context.identity.turnId,
    runId: context.identity.runId,
    toolCallId: context.identity.toolCallId,
    workspaceTrusted: context.workspaceTrusted,
    ...(context.modelUse === undefined
      ? {}
      : {
          modelPurpose: context.modelUse.purpose,
          modelProviderId: context.modelUse.model.provider,
          modelId: context.modelUse.model.id,
          modelParameters: context.modelUse.parameters,
        }),
  };
}

function formatToolResultForModel(result: ToolResult): string {
  if (typeof result.data === 'string') return result.data;
  if (result.data === undefined) return 'Tool completed successfully.';
  return JSON.stringify(result.data);
}
