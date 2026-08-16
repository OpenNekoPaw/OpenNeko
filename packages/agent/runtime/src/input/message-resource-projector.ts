import {
  contentLocatorKey,
  isContentLocator,
  isContentRepresentationLocator,
  type ContentLocator,
  type ContentRepresentationLocator,
} from '@neko/content';
import type {
  AgentTurnTimelineItem,
  AgentTurnTimelineOperation,
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
  Message,
  ToolCall,
} from '@neko/agent-contracts';
import type { PreviewMediaDescriptor } from '@neko/preview-domain';

const MEDIA_FILE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  '.mp3',
  '.wav',
  '.ogg',
  '.aac',
  '.flac',
  '.m4a',
  '.pdf',
] as const;

const SINGLE_RESOURCE_KEYS = new Set([
  'path',
  'src',
  'url',
  'uri',
  'previewUri',
  'renderUri',
  'poster',
  'thumbnailUrl',
  'imageUrl',
  'videoUrl',
  'audioUrl',
]);

export interface MessageResourceProjectionContext {
  readonly mediaType?: string;
}

export type MessageResourceDisplayResolution =
  | { readonly status: 'ready'; readonly descriptor: PreviewMediaDescriptor }
  | {
      readonly status: 'unavailable';
      readonly diagnostic: { readonly code: string; readonly message: string };
    };

export interface MessageResourceProjectionOptions {
  resolveDisplayLocator?: (
    locator: ContentLocator | ContentRepresentationLocator,
    context: MessageResourceProjectionContext,
  ) => Promise<MessageResourceDisplayResolution>;
}

export function isLocalMediaFilePath(value: string): boolean {
  if (!isAbsolutePath(value)) return false;
  const normalized = value.toLowerCase();
  return MEDIA_FILE_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export async function projectMessagesForResourceDisplay(
  messages: readonly Message[],
  options: MessageResourceProjectionOptions = {},
): Promise<Message[]> {
  return Promise.all(messages.map((message) => projectMessageForResourceDisplay(message, options)));
}

export async function projectMessageForResourceDisplay(
  message: Message,
  options: MessageResourceProjectionOptions = {},
): Promise<Message> {
  const projectedMessage = { ...message } as Message & { toolCalls?: ToolCall[] };
  if (hasToolCallArray(message)) {
    projectedMessage.toolCalls = await Promise.all(
      message.toolCalls.map((toolCall) => projectToolCallForResourceDisplay(toolCall, options)),
    );
  }
  if (message.contentBlocks && message.contentBlocks.length > 0) {
    projectedMessage.contentBlocks = await Promise.all(
      message.contentBlocks.map(async (block) => {
        if (block.type !== 'tool_call' || !block.toolCall) return block;
        return {
          ...block,
          toolCall: await projectToolCallForResourceDisplay(block.toolCall, options),
        };
      }),
    );
  }
  return projectedMessage;
}

export async function projectConversationProjectionSnapshotForResourceDisplay(
  snapshot: ConversationProjectionSnapshot,
  options: MessageResourceProjectionOptions = {},
): Promise<ConversationProjectionSnapshot> {
  return {
    ...snapshot,
    turns: await Promise.all(
      snapshot.turns.map(async (turn) => ({
        ...turn,
        items: await Promise.all(
          turn.items.map((item) => projectTimelineItemForResourceDisplay(item, options)),
        ),
      })),
    ),
  };
}

export async function projectConversationProjectionPatchForResourceDisplay(
  patch: ConversationProjectionPatch,
  options: MessageResourceProjectionOptions = {},
): Promise<ConversationProjectionPatch> {
  return {
    ...patch,
    operations: await Promise.all(
      patch.operations.map((operation) =>
        projectTimelineOperationForResourceDisplay(operation, options),
      ),
    ),
  };
}

export async function projectResourceValue(
  value: unknown,
  options: MessageResourceProjectionOptions = {},
): Promise<unknown> {
  return projectResourceValueInternal(value, options, new WeakSet<object>());
}

function hasToolCallArray(message: Message): message is Message & { toolCalls: ToolCall[] } {
  const value = (message as { toolCalls?: unknown }).toolCalls;
  return Array.isArray(value);
}

async function projectTimelineItemForResourceDisplay(
  item: AgentTurnTimelineItem,
  options: MessageResourceProjectionOptions,
): Promise<AgentTurnTimelineItem> {
  if (item.kind !== 'tool_call') return item;
  return {
    ...item,
    payload: {
      ...item.payload,
      toolCall: await projectToolCallForResourceDisplay(item.payload.toolCall, options),
    },
  };
}

async function projectTimelineOperationForResourceDisplay(
  operation: AgentTurnTimelineOperation,
  options: MessageResourceProjectionOptions,
): Promise<AgentTurnTimelineOperation> {
  switch (operation.operation) {
    case 'complete':
    case 'append':
    case 'replace':
      return operation;
    case 'snapshot':
      return {
        ...operation,
        item: await projectTimelineItemForResourceDisplay(operation.item, options),
      };
    case 'upsert':
      if (operation.item.kind !== 'tool_call') return operation;
      return {
        ...operation,
        item: {
          ...operation.item,
          payload: {
            ...operation.item.payload,
            toolCall: await projectToolCallForResourceDisplay(
              operation.item.payload.toolCall,
              options,
            ),
          },
        },
      };
  }
}

async function projectToolCallForResourceDisplay(
  toolCall: ToolCall,
  options: MessageResourceProjectionOptions,
): Promise<ToolCall> {
  const projectedResultData =
    toolCall.result?.data === undefined
      ? undefined
      : await projectResourceValue(toolCall.result.data, options);
  const projectedResultAttachments =
    toolCall.result?.attachments === undefined
      ? undefined
      : await projectResourceValue(toolCall.result.attachments, options);
  const projectedResultPerceptionCards =
    toolCall.result?.perceptionCards === undefined
      ? undefined
      : await projectResourceValue(toolCall.result.perceptionCards, options);
  return {
    ...toolCall,
    ...(toolCall.result
      ? {
          result: {
            ...toolCall.result,
            ...(projectedResultData === undefined ? {} : { data: projectedResultData }),
            ...(projectedResultAttachments === undefined
              ? {}
              : {
                  attachments: projectedResultAttachments as typeof toolCall.result.attachments,
                }),
            ...(projectedResultPerceptionCards === undefined
              ? {}
              : {
                  perceptionCards:
                    projectedResultPerceptionCards as typeof toolCall.result.perceptionCards,
                }),
          },
        }
      : {}),
  };
}

async function projectResourceValueInternal(
  value: unknown,
  options: MessageResourceProjectionOptions,
  visited: WeakSet<object>,
): Promise<unknown> {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (isContentLocator(value) || isContentRepresentationLocator(value)) return value;
  if (visited.has(value)) return value;
  visited.add(value);

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => projectResourceValueInternal(item, options, visited)));
  }

  if (!isRecord(value)) return value;
  const owner = value;
  const contentLocator = isContentLocator(owner['contentLocator'])
    ? owner['contentLocator']
    : undefined;
  const representationLocator = isContentRepresentationLocator(owner['representationLocator'])
    ? owner['representationLocator']
    : undefined;
  const displayLocator = representationLocator ?? contentLocator;
  const mediaType = typeof owner['mimeType'] === 'string' ? owner['mimeType'] : undefined;
  const projected: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(owner)) {
    if (key === 'renderUri' || key === 'previewUri') {
      if (!displayLocator) appendProjectionDiagnostic(projected, key, 'missing-content-locator');
      continue;
    }
    if (typeof item === 'string' && isUnsafeMediaDisplayField(key, item)) {
      if (displayLocator) {
        projected[key] = portableContentPath(
          displayLocator.kind === 'content-representation' ? displayLocator.source : displayLocator,
        );
      } else {
        appendProjectionDiagnostic(projected, key, 'missing-content-locator');
      }
      continue;
    }
    if (key === 'urls' && Array.isArray(item)) {
      const retained: unknown[] = [];
      for (const url of item) {
        if (typeof url === 'string' && isUnsafeMediaDisplaySource(url)) {
          appendProjectionDiagnostic(projected, key, 'missing-content-locator');
        } else {
          retained.push(await projectResourceValueInternal(url, options, visited));
        }
      }
      projected[key] = retained;
      continue;
    }
    projected[key] = await projectResourceValueInternal(item, options, visited);
  }

  if (displayLocator) {
    const resolution = await resolveDisplayLocator(displayLocator, mediaType, options);
    if (resolution.status === 'ready') {
      projected['previewDescriptor'] = resolution.descriptor;
    } else {
      appendProjectionDiagnostic(
        projected,
        representationLocator ? 'representationLocator' : 'contentLocator',
        'authorization-denied',
        resolution.diagnostic,
      );
    }
  }
  return projected;
}

function isUnsafeMediaDisplayField(key: string, value: string): boolean {
  return SINGLE_RESOURCE_KEYS.has(key) && isUnsafeMediaDisplaySource(value);
}

function isUnsafeMediaDisplaySource(value: string): boolean {
  if (isLocalMediaFilePath(value)) return true;
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/u.exec(value)?.[1]?.toLocaleLowerCase();
  return scheme !== undefined && scheme !== 'http' && scheme !== 'https';
}

async function resolveDisplayLocator(
  locator: ContentLocator | ContentRepresentationLocator,
  mediaType: string | undefined,
  options: MessageResourceProjectionOptions,
): Promise<MessageResourceDisplayResolution> {
  const resolve = options.resolveDisplayLocator;
  if (!resolve) {
    return {
      status: 'unavailable',
      diagnostic: {
        code: 'resource-projection-denied',
        message: 'Content display projection is unavailable.',
      },
    };
  }
  return resolve(locator, {
    ...(mediaType ? { mediaType } : {}),
  });
}

function portableContentPath(locator: ContentLocator): string {
  switch (locator.kind) {
    case 'workspace-file':
      return locator.path;
    case 'media-library':
      return `${locator.libraryName}/${locator.relativePath}`;
    case 'document-entry':
      return locator.entryPath;
    case 'generated-output':
      return locator.path;
    case 'package-resource':
      return `${locator.packageId}/${locator.resourcePath}`;
  }
}

function appendProjectionDiagnostic(
  projected: Record<string, unknown>,
  field: string,
  reason: 'missing-content-locator' | 'authorization-denied',
  diagnostic?: { readonly code: string; readonly message: string },
): void {
  const diagnostics = Array.isArray(projected['resourceProjectionDiagnostics'])
    ? [...projected['resourceProjectionDiagnostics']]
    : [];
  diagnostics.push({
    code: diagnostic?.code ?? 'resource-projection-denied',
    severity: 'error',
    field,
    sourceKind: reason,
    message:
      reason === 'missing-content-locator'
        ? 'Local media display requires a validated ContentLocator.'
        : (diagnostic?.message ?? 'Content could not be authorized for Webview display.'),
  });
  projected['resourceProjectionDiagnostics'] = diagnostics;
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function messageResourceProjectionKey(
  locator: ContentLocator | ContentRepresentationLocator,
): string {
  return locator.kind === 'content-representation'
    ? JSON.stringify(['content-representation', locator.id, locator.sourceFingerprint])
    : contentLocatorKey(locator);
}
