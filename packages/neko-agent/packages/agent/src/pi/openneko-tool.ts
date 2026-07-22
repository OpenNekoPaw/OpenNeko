import {
  AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES,
  AGENT_IMAGE_TRANSPORT_MAX_PAYLOADS,
  AGENT_IMAGE_TRANSPORT_MAX_SOURCE_IMAGES,
  AGENT_IMAGE_TRANSPORT_MAX_TOTAL_BYTES,
  TOOL_NAMES_MEDIA,
  TOOL_NAMES_PERCEPTION,
  TOOL_NAMES_QUALITY,
  type PerceptualAssetRef,
  type Tool,
  type ToolParameters,
  type ToolResult,
} from '@neko/shared';
import { Type, type TObjectOptions } from 'typebox';
import type { AgentToolResult, AgentToolUpdateCallback } from '@earendil-works/pi-agent-core';
import type { ImageContent, TextContent } from '@earendil-works/pi-ai';

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
  readonly assetLoader?: PiToolResultAssetLoader;
}

export interface PiToolResultAssetPayload {
  readonly kind: 'image' | 'audio' | 'video';
  readonly url: string;
  readonly mimeType?: string;
}

export type PiToolResultImageBatchLayout = 'overview' | 'detail';

export interface PiToolResultImageBatchItem {
  readonly payload: PiToolResultAssetPayload;
  /** Zero-based indexes into the input ref array, in the same order as labeled tiles. */
  readonly sourceIndexes: readonly number[];
}

export interface PiToolResultImageBatchOptions {
  readonly layout: PiToolResultImageBatchLayout;
}

export interface PiToolResultAssetLoader {
  load(ref: PerceptualAssetRef): Promise<PiToolResultAssetPayload>;
  loadBatch?(
    refs: readonly PerceptualAssetRef[],
    options: PiToolResultImageBatchOptions,
  ): Promise<readonly PiToolResultImageBatchItem[]>;
}

export const MAX_PI_TOOL_RESULT_SOURCE_IMAGES = AGENT_IMAGE_TRANSPORT_MAX_SOURCE_IMAGES;
export const MAX_PI_TOOL_RESULT_IMAGE_PAYLOADS = AGENT_IMAGE_TRANSPORT_MAX_PAYLOADS;
export const MAX_PI_TOOL_RESULT_IMAGE_PAYLOAD_BYTES = AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES;
export const MAX_PI_TOOL_RESULT_IMAGE_TOTAL_BYTES = AGENT_IMAGE_TRANSPORT_MAX_TOTAL_BYTES;

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
        content: await projectToolResultContent(result, options.assetLoader),
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
    readonly assetLoader?: PiToolResultAssetLoader;
  },
): readonly PiCapabilityTool<ToolResult>[] {
  return Object.freeze(
    tools.map((tool) =>
      projectOpenNekoTool(tool, {
        ...(options?.locale === undefined ? {} : { locale: options.locale }),
        ...(options?.metadata === undefined ? {} : { metadata: options.metadata }),
        ...(options?.assetLoader === undefined ? {} : { assetLoader: options.assetLoader }),
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

async function projectToolResultContent(
  result: ToolResult,
  assetLoader: PiToolResultAssetLoader | undefined,
): Promise<(TextContent | ImageContent)[]> {
  const content: (TextContent | ImageContent)[] = [
    { type: 'text', text: formatToolResultForModel(result) },
  ];
  const imageAttachments = (result.attachments ?? []).filter(
    (attachment) => attachment.type === 'image',
  );
  if (imageAttachments.length === 0) return content;
  if (!assetLoader) {
    throw new Error('Pi image Tool result requires a Host asset loader.');
  }

  if (imageAttachments.length > MAX_PI_TOOL_RESULT_SOURCE_IMAGES) {
    throw new Error(
      `Pi image Tool result contains ${imageAttachments.length} source images; maximum is ${MAX_PI_TOOL_RESULT_SOURCE_IMAGES}.`,
    );
  }
  const refs = imageAttachments.map((attachment) => {
    if (!attachment.assetRef) {
      throw new Error('Pi image Tool result requires a stable attachment assetRef.');
    }
    return attachment.assetRef;
  });
  const projected = await projectProviderImagePayloads(result, refs, assetLoader);
  if (refs.length > 1) {
    content.push({ type: 'text', text: formatImageBatchManifest(projected, refs) });
  }
  let totalBytes = 0;
  for (const item of projected) {
    if (item.payload.kind !== 'image') {
      throw new Error(`Pi image Tool result loader returned ${item.payload.kind} content.`);
    }
    const parsed = parsePiImageContent(item.payload);
    if (parsed.byteLength > MAX_PI_TOOL_RESULT_IMAGE_PAYLOAD_BYTES) {
      throw new Error(
        `Pi image Tool result payload is ${parsed.byteLength} bytes; maximum is ${MAX_PI_TOOL_RESULT_IMAGE_PAYLOAD_BYTES}.`,
      );
    }
    totalBytes += parsed.byteLength;
    if (totalBytes > MAX_PI_TOOL_RESULT_IMAGE_TOTAL_BYTES) {
      throw new Error(
        `Pi image Tool result batch is ${totalBytes} bytes; maximum is ${MAX_PI_TOOL_RESULT_IMAGE_TOTAL_BYTES}.`,
      );
    }
    content.push(parsed.content);
  }
  return content;
}

async function projectProviderImagePayloads(
  result: ToolResult,
  refs: readonly PerceptualAssetRef[],
  assetLoader: PiToolResultAssetLoader,
): Promise<readonly PiToolResultImageBatchItem[]> {
  if (refs.length === 1) {
    return [{ payload: await assetLoader.load(refs[0]!), sourceIndexes: [0] }];
  }
  if (!assetLoader.loadBatch) {
    throw new Error('Pi multi-image Tool result requires a Host batch image projector.');
  }
  const batches = await assetLoader.loadBatch(refs, {
    layout: resolveImageBatchLayout(result.data),
  });
  if (batches.length === 0 || batches.length > MAX_PI_TOOL_RESULT_IMAGE_PAYLOADS) {
    throw new Error(
      `Pi image Tool result produced ${batches.length} provider payloads; expected 1-${MAX_PI_TOOL_RESULT_IMAGE_PAYLOADS}.`,
    );
  }
  validateBatchCoverage(batches, refs.length);
  return batches;
}

function resolveImageBatchLayout(data: unknown): PiToolResultImageBatchLayout {
  const analysis =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)['analysis']
      : undefined;
  return analysis === 'ocr' || analysis === 'panels' || analysis === 'custom'
    ? 'detail'
    : 'overview';
}

function validateBatchCoverage(
  batches: readonly PiToolResultImageBatchItem[],
  sourceCount: number,
): void {
  const indexes = batches.flatMap((batch) => [...batch.sourceIndexes]);
  const expected = Array.from({ length: sourceCount }, (_, index) => index);
  if (indexes.length !== expected.length || indexes.some((index, position) => index !== position)) {
    throw new Error('Pi image Tool result batch projection did not preserve every source image.');
  }
}

function formatImageBatchManifest(
  batches: readonly PiToolResultImageBatchItem[],
  refs: readonly PerceptualAssetRef[],
): string {
  const lines = ['Contact-sheet tile manifest (labels are local to each sheet):'];
  batches.forEach((batch, batchIndex) => {
    batch.sourceIndexes.forEach((sourceIndex, tileIndex) => {
      const ref = refs[sourceIndex];
      if (!ref) throw new Error(`Missing image source ${sourceIndex + 1} for batch manifest.`);
      lines.push(
        `sheet ${batchIndex + 1}, tile ${tileIndex + 1} = ${ref.label ?? ref.assetId} [${ref.assetId}]`,
      );
    });
  });
  return lines.join('\n');
}

function parsePiImageContent(payload: PiToolResultAssetPayload): {
  readonly content: ImageContent;
  readonly byteLength: number;
} {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(payload.url);
  if (!match) {
    throw new Error('Pi image Tool result requires a base64 data URL.');
  }
  const data = match[2];
  const mimeType = payload.mimeType ?? match[1];
  if (!data || !mimeType?.startsWith('image/')) {
    throw new Error('Pi image Tool result requires image MIME type and base64 data.');
  }
  return {
    content: { type: 'image', data, mimeType },
    byteLength: Buffer.byteLength(data, 'base64'),
  };
}
