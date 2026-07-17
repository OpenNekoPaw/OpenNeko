import type {
  PerceptionCard,
  ToolResultArtifactTransfer,
  ToolResultAttachment,
  ToolResultBackfillDiagnostic,
  ToolResultBackfillMergePolicy,
  ToolResultBackfillPayload,
} from '@neko/shared';
import { DEFAULT_TOOL_RESULT_BACKFILL_OVERWRITE_KEYS } from '@neko/shared';

export interface BackfillableToolResult {
  readonly success: boolean;
  readonly data: unknown;
  readonly error?: string;
  readonly duration?: number;
  readonly attachments?: readonly ToolResultAttachment[];
  readonly perceptionCards?: readonly PerceptionCard[];
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
  readonly backfillDiagnostics?: readonly ToolResultBackfillDiagnostic[];
}

export interface ApplyToolResultBackfillResult {
  readonly result: BackfillableToolResult;
  readonly diagnostics: readonly ToolResultBackfillDiagnostic[];
}

export function applyToolResultBackfillToResult(
  existing: BackfillableToolResult | undefined,
  payload: ToolResultBackfillPayload,
): ApplyToolResultBackfillResult {
  if (!existing) {
    const diagnostic: ToolResultBackfillDiagnostic = {
      path: payload.toolCallId,
      reason: 'missing-tool-call',
      incoming: payload,
    };
    return {
      result: {
        success: false,
        data: {},
        backfillDiagnostics: mergeDiagnostics(payload.diagnostics, [diagnostic]),
      },
      diagnostics: [diagnostic],
    };
  }

  const dataMerge = mergeDataPatch(existing.data, payload.dataPatch, payload.mergePolicy);
  const diagnostics = mergeDiagnostics(payload.diagnostics, dataMerge.diagnostics);
  return {
    result: {
      ...existing,
      data: dataMerge.data,
      ...(payload.attachments
        ? { attachments: mergeAttachments(existing.attachments, payload.attachments) }
        : {}),
      ...(payload.perceptionCards
        ? {
            perceptionCards: mergePerceptionCards(
              existing.perceptionCards,
              payload.perceptionCards,
            ),
          }
        : {}),
      ...(payload.artifacts
        ? { artifacts: mergeArtifacts(existing.artifacts, payload.artifacts) }
        : {}),
      ...(diagnostics.length > 0
        ? {
            backfillDiagnostics: mergeDiagnostics(existing.backfillDiagnostics, diagnostics),
          }
        : {}),
    },
    diagnostics,
  };
}

export function mergeToolResultBackfillData(
  existingData: unknown,
  dataPatch: Record<string, unknown>,
  mergePolicy?: ToolResultBackfillMergePolicy,
): {
  readonly data: Record<string, unknown>;
  readonly diagnostics: readonly ToolResultBackfillDiagnostic[];
} {
  return mergeDataPatch(existingData, dataPatch, mergePolicy);
}

export function mergeToolResultAttachments(
  existing: readonly ToolResultAttachment[] | undefined,
  incoming: readonly ToolResultAttachment[] | undefined,
): readonly ToolResultAttachment[] | undefined {
  if (!incoming) return existing;
  return mergeAttachments(existing, incoming);
}

export function mergeToolResultPerceptionCards(
  existing: readonly PerceptionCard[] | undefined,
  incoming: readonly PerceptionCard[] | undefined,
): readonly PerceptionCard[] | undefined {
  if (!incoming) return existing;
  return mergePerceptionCards(existing, incoming);
}

export function mergeToolResultArtifacts(
  existing: readonly ToolResultArtifactTransfer[] | undefined,
  incoming: readonly ToolResultArtifactTransfer[] | undefined,
): readonly ToolResultArtifactTransfer[] | undefined {
  if (!incoming) return existing;
  return mergeArtifacts(existing, incoming);
}

function mergeDataPatch(
  existingData: unknown,
  dataPatch: Record<string, unknown>,
  mergePolicy?: ToolResultBackfillMergePolicy,
): {
  readonly data: Record<string, unknown>;
  readonly diagnostics: readonly ToolResultBackfillDiagnostic[];
} {
  const existing = isRecord(existingData) ? existingData : {};
  const overwriteKeys = new Set(
    mergePolicy?.overwriteKeys ?? DEFAULT_TOOL_RESULT_BACKFILL_OVERWRITE_KEYS,
  );
  const preserveKeys = new Set(mergePolicy?.preserveKeys ?? []);
  const diagnostics: ToolResultBackfillDiagnostic[] = [];
  const data: Record<string, unknown> = { ...existing };

  for (const [key, incoming] of Object.entries(dataPatch)) {
    if (preserveKeys.has(key)) {
      if (hasOwn(existing, key) && existing[key] !== incoming) {
        diagnostics.push({ path: key, reason: 'conflict', existing: existing[key], incoming });
      }
      continue;
    }

    if (!hasOwn(existing, key) || overwriteKeys.has(key)) {
      data[key] = incoming;
      continue;
    }

    if (existing[key] !== incoming) {
      diagnostics.push({ path: key, reason: 'conflict', existing: existing[key], incoming });
    }
  }

  return { data, diagnostics };
}

function mergeAttachments(
  existing: readonly ToolResultAttachment[] | undefined,
  incoming: readonly ToolResultAttachment[],
): readonly ToolResultAttachment[] {
  const byKey = new Map<string, ToolResultAttachment>();
  for (const attachment of existing ?? []) {
    byKey.set(getAttachmentKey(attachment), attachment);
  }
  for (const attachment of incoming) {
    const key = getAttachmentKey(attachment);
    if (!byKey.has(key)) {
      byKey.set(key, attachment);
    }
  }
  return Array.from(byKey.values());
}

function mergePerceptionCards(
  existing: readonly PerceptionCard[] | undefined,
  incoming: readonly PerceptionCard[],
): readonly PerceptionCard[] {
  const byKey = new Map<string, PerceptionCard>();
  for (const card of [...(existing ?? []), ...incoming]) {
    byKey.set(getPerceptionCardKey(card), card);
  }
  return Array.from(byKey.values()).sort((left, right) => left.createdAt - right.createdAt);
}

function mergeArtifacts(
  existing: readonly ToolResultArtifactTransfer[] | undefined,
  incoming: readonly ToolResultArtifactTransfer[],
): readonly ToolResultArtifactTransfer[] {
  const byKey = new Map<string, ToolResultArtifactTransfer>();
  for (const artifact of existing ?? []) {
    byKey.set(getArtifactTransferKey(artifact), artifact);
  }
  for (const artifact of incoming) {
    byKey.set(getArtifactTransferKey(artifact), artifact);
  }
  return Array.from(byKey.values());
}

function mergeDiagnostics(
  left: readonly ToolResultBackfillDiagnostic[] | undefined,
  right: readonly ToolResultBackfillDiagnostic[] | undefined,
): readonly ToolResultBackfillDiagnostic[] {
  return [...(left ?? []), ...(right ?? [])];
}

function getAttachmentKey(attachment: ToolResultAttachment): string {
  return [attachment.type, attachment.path, attachment.mimeType ?? ''].join(':');
}

function getPerceptionCardKey(card: PerceptionCard): string {
  return [card.assetId, card.version, card.cacheKey ?? ''].join(':');
}

function getArtifactTransferKey(artifact: ToolResultArtifactTransfer): string {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
