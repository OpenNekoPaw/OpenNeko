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

export interface ProjectOpenNekoToolOptions {
  readonly modelPurpose?: ToolModelPurpose;
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
    ...(options.modelPurposeRequirement === undefined
      ? {}
      : { modelPurposeRequirement: options.modelPurposeRequirement }),
    ...(tool.isConcurrencySafe === true ? { executionMode: 'parallel' as const } : {}),
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
    readonly purposeForTool?: (tool: Tool) => ToolModelPurpose | undefined;
    readonly isPurposeOptionalForTool?: (tool: Tool) => boolean;
  },
): readonly PiCapabilityTool<ToolResult>[] {
  return Object.freeze(
    tools.map((tool) =>
      projectOpenNekoTool(tool, {
        ...(options?.locale === undefined ? {} : { locale: options.locale }),
        ...(options?.metadata === undefined ? {} : { metadata: options.metadata }),
        ...(options?.purposeForTool?.(tool) === undefined
          ? {}
          : { modelPurpose: options.purposeForTool(tool) }),
        ...(options?.isPurposeOptionalForTool?.(tool) === true
          ? { modelPurposeRequirement: 'optional' as const }
          : {}),
      }),
    ),
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
