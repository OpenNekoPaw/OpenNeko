import type {
  AgentArtifactTransferPayload,
  Message,
  ToolCall,
  ToolResultBackfillMessage,
} from '@neko-agent/types';
import type {
  PerceptionCard,
  ToolResultAttachment,
  ToolResultBackfillDiagnostic,
} from '@neko/shared';
import { DEFAULT_TOOL_RESULT_BACKFILL_OVERWRITE_KEYS } from '@neko/shared';
import { updateToolCallInBlocks } from './message-presenter';

export interface ToolResultBackfillMessageProjectionInput {
  readonly messages: readonly Message[];
  readonly streamingMessageId: string | null;
  readonly message: ToolResultBackfillMessage;
}

export interface ToolResultBackfillMessageProjectionResult {
  readonly messages: Message[];
  readonly updated: boolean;
  readonly targetMessageId?: string;
}

export function projectToolResultBackfillIntoMessages(
  input: ToolResultBackfillMessageProjectionInput,
): ToolResultBackfillMessageProjectionResult {
  const targetMessageId = input.message.messageId ?? input.streamingMessageId ?? undefined;
  let targetIndex = targetMessageId
    ? input.messages.findIndex((message) => message.id === targetMessageId)
    : -1;

  if (targetIndex === -1) {
    targetIndex = findMessageIndexByToolCallId(input.messages, input.message.toolCallId);
  }

  if (targetIndex === -1) {
    return { messages: [...input.messages], updated: false };
  }

  let updated = false;
  let resolvedTargetMessageId: string | undefined;
  const messages = input.messages.map((message, index) => {
    if (index !== targetIndex) return message;

    updated = true;
    resolvedTargetMessageId = message.id;
    const contentBlocks = updateToolCallInBlocks(
      message.contentBlocks ?? [],
      input.message.toolCallId,
      (toolCall) => ({
        ...toolCall,
        result: applyBackfillToResult(toolCall.result, input.message),
      }),
    );

    return {
      ...message,
      contentBlocks,
    };
  });

  return {
    messages,
    updated,
    ...(resolvedTargetMessageId ? { targetMessageId: resolvedTargetMessageId } : {}),
  };
}

function applyBackfillToResult(
  existing: ToolCall['result'],
  message: ToolResultBackfillMessage,
): ToolCall['result'] {
  if (!existing) {
    return {
      success: false,
      data: {},
      backfillDiagnostics: [
        ...(message.backfillDiagnostics ?? []),
        {
          path: message.toolCallId,
          reason: 'missing-tool-call',
          incoming: message.dataPatch,
        },
      ],
    };
  }

  const merge = mergeDataPatch(existing.data, message.dataPatch);
  const diagnostics = [...(message.backfillDiagnostics ?? []), ...merge.diagnostics];
  return {
    ...existing,
    data: merge.data,
    ...(message.attachments
      ? { attachments: mergeAttachments(existing.attachments, message.attachments) }
      : {}),
    ...(message.perceptionCards
      ? {
          perceptionCards: mergePerceptionCards(existing.perceptionCards, message.perceptionCards),
        }
      : {}),
    ...(message.artifacts
      ? { artifacts: mergeArtifacts(existing.artifacts, message.artifacts) }
      : {}),
    ...(diagnostics.length > 0
      ? {
          backfillDiagnostics: [...(existing.backfillDiagnostics ?? []), ...diagnostics],
        }
      : {}),
  };
}

function mergeDataPatch(
  existingData: unknown,
  dataPatch: Record<string, unknown>,
): {
  readonly data: Record<string, unknown>;
  readonly diagnostics: readonly ToolResultBackfillDiagnostic[];
} {
  const existing = isRecord(existingData) ? existingData : {};
  const overwriteKeys = new Set<string>(DEFAULT_TOOL_RESULT_BACKFILL_OVERWRITE_KEYS);
  const data: Record<string, unknown> = { ...existing };
  const diagnostics: ToolResultBackfillDiagnostic[] = [];

  for (const [key, incoming] of Object.entries(dataPatch)) {
    if (!hasOwn(existing, key) || overwriteKeys.has(key)) {
      data[key] = incoming;
      continue;
    }

    if (existing[key] !== incoming) {
      diagnostics.push({
        path: key,
        reason: 'conflict',
        existing: existing[key],
        incoming,
      });
    }
  }

  return { data, diagnostics };
}

function mergeAttachments(
  existing: readonly ToolResultAttachment[] | undefined,
  incoming: readonly ToolResultAttachment[],
): readonly ToolResultAttachment[] {
  const byKey = new Map<string, ToolResultAttachment>();
  for (const attachment of [...(existing ?? []), ...incoming]) {
    byKey.set([attachment.type, attachment.path, attachment.mimeType ?? ''].join(':'), attachment);
  }
  return Array.from(byKey.values());
}

function mergePerceptionCards(
  existing: readonly PerceptionCard[] | undefined,
  incoming: readonly PerceptionCard[],
): readonly PerceptionCard[] {
  const byKey = new Map<string, PerceptionCard>();
  for (const card of [...(existing ?? []), ...incoming]) {
    byKey.set([card.assetId, card.version, card.cacheKey ?? ''].join(':'), card);
  }
  return Array.from(byKey.values()).sort((left, right) => left.createdAt - right.createdAt);
}

function mergeArtifacts(
  existing: readonly AgentArtifactTransferPayload[] | undefined,
  incoming: readonly AgentArtifactTransferPayload[],
): readonly AgentArtifactTransferPayload[] {
  const byKey = new Map<string, AgentArtifactTransferPayload>();
  for (const artifact of existing ?? []) {
    byKey.set(getArtifactTransferKey(artifact), artifact);
  }
  for (const artifact of incoming) {
    byKey.set(getArtifactTransferKey(artifact), artifact);
  }
  return Array.from(byKey.values());
}

function getArtifactTransferKey(artifact: AgentArtifactTransferPayload): string {
  switch (artifact.type) {
    case 'artifactSnapshot':
      return `snapshot:${artifact.artifact.artifactId}`;
    case 'artifactBlockPage':
      return `page:${artifact.artifactId}:${artifact.cursor ?? 'start'}`;
    case 'artifactBackfill':
      return `backfill:${artifact.artifact.artifactId}`;
    case 'artifactExecutionSummary':
      return `summary:${artifact.summary.summaryId}`;
  }
}

function findMessageIndexByToolCallId(messages: readonly Message[], toolCallId: string): number {
  return messages.findIndex((message) =>
    message.contentBlocks?.some(
      (block) => block.type === 'tool_call' && block.toolCall?.id === toolCallId,
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
