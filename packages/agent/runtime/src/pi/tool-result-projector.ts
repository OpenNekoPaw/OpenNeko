import type {
  PerceptionCard,
  ToolCall,
  ToolResultArtifactTransfer,
  ToolResultAttachment,
  ToolResultBackfillDiagnostic,
} from '@neko/agent-contracts';
import { isContentLocator, isContentRepresentationLocator } from '@neko/content';

export function projectPiToolResult(
  value: unknown,
  isError: boolean,
): NonNullable<ToolCall['result']> {
  const record = asRecord(value);
  const details = asRecord(record?.['details']);
  const envelope =
    details && typeof details['success'] === 'boolean'
      ? details
      : record && typeof record['success'] === 'boolean'
        ? record
        : undefined;
  if (envelope) {
    return {
      success: envelope['success'] === true,
      data: structuredClone(envelope['data']),
      ...(typeof envelope['error'] === 'string' ? { error: envelope['error'] } : {}),
      ...(typeof envelope['duration'] === 'number' ? { duration: envelope['duration'] } : {}),
      ...projectToolResultCollections(envelope),
    };
  }

  return {
    success: !isError,
    data: structuredClone(details?.['data'] ?? record?.['details'] ?? value),
    ...(isError
      ? {
          error:
            readTextContent(record?.['content']) ??
            'Pi tool execution failed without a diagnostic.',
        }
      : {}),
    ...projectToolResultCollections(details ?? record),
  };
}

function projectToolResultCollections(value: unknown): {
  readonly attachments?: readonly ToolResultAttachment[];
  readonly perceptionCards?: readonly PerceptionCard[];
  readonly backfillDiagnostics?: readonly ToolResultBackfillDiagnostic[];
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
} {
  const record = asRecord(value);
  if (!record) return {};
  const attachments = readCollection(record, 'attachments', isToolResultAttachment);
  const perceptionCards = readCollection(record, 'perceptionCards', isPerceptionCard);
  const backfillDiagnostics = readCollection(
    record,
    'backfillDiagnostics',
    isToolResultBackfillDiagnostic,
  );
  const artifacts = readCollection(record, 'artifacts', isToolResultArtifactTransfer);
  return {
    ...(attachments ? { attachments } : {}),
    ...(perceptionCards ? { perceptionCards } : {}),
    ...(backfillDiagnostics ? { backfillDiagnostics } : {}),
    ...(artifacts ? { artifacts } : {}),
  };
}

function readCollection<T>(
  record: Readonly<Record<string, unknown>>,
  field: string,
  predicate: (value: unknown) => value is T,
): readonly T[] | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`Pi ToolResult ${field} must be an array.`);
  }
  return value.map((item, index) => {
    if (!predicate(item)) {
      throw new Error(`Pi ToolResult ${field}[${index}] is invalid.`);
    }
    return structuredClone(item);
  });
}

function isToolResultAttachment(value: unknown): value is ToolResultAttachment {
  const record = asRecord(value);
  if (!record) return false;
  const type = record['type'];
  if (type !== 'image' && type !== 'audio' && type !== 'video') return false;
  if (isContentLocator(record['contentLocator'])) return true;
  if (typeof record['path'] === 'string' && record['path'].trim().length > 0) return true;
  const assetRef = asRecord(record['assetRef']);
  return (
    assetRef !== undefined &&
    typeof assetRef['assetId'] === 'string' &&
    typeof assetRef['uri'] === 'string' &&
    (isContentLocator(assetRef['contentLocator']) ||
      isContentRepresentationLocator(assetRef['representationLocator']))
  );
}

function isPerceptionCard(value: unknown): value is PerceptionCard {
  const record = asRecord(value);
  const modality = record?.['modality'];
  const layerStatus = asRecord(record?.['layerStatus']);
  const structural = asRecord(record?.['structural']);
  return (
    typeof record?.['assetId'] === 'string' &&
    (modality === 'image' ||
      modality === 'video' ||
      modality === 'audio' ||
      modality === 'data' ||
      modality === 'text' ||
      modality === 'mixed') &&
    typeof record['createdAt'] === 'number' &&
    layerStatus?.['layer0'] === 'complete' &&
    typeof structural?.['format'] === 'string' &&
    typeof structural['mimeType'] === 'string' &&
    typeof structural['byteSize'] === 'number'
  );
}

function isToolResultBackfillDiagnostic(value: unknown): value is ToolResultBackfillDiagnostic {
  const record = asRecord(value);
  return (
    typeof record?.['path'] === 'string' &&
    (record['reason'] === 'conflict' ||
      record['reason'] === 'missing-tool-call' ||
      record['reason'] === 'invalid-existing-result')
  );
}

function isToolResultArtifactTransfer(value: unknown): value is ToolResultArtifactTransfer {
  const type = asRecord(value)?.['type'];
  return (
    type === 'artifactSnapshot' ||
    type === 'artifactBackfill' ||
    type === 'artifactBlockPage' ||
    type === 'artifactExecutionSummary'
  );
}

function readTextContent(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const text = value
    .flatMap((part) => {
      const record = asRecord(part);
      return record?.['type'] === 'text' && typeof record['text'] === 'string'
        ? [record['text'].trim()]
        : [];
    })
    .filter(Boolean)
    .join('\n');
  return text.length > 0 ? text : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}
