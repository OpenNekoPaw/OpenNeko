import type {
  PerceptionCard,
  ToolCall,
  ToolResultArtifactTransfer,
  ToolResultAttachment,
  ToolResultBackfillDiagnostic,
} from '@neko/agent-contracts';
import { contentLocatorKey, isContentLocator, isContentRepresentationHandle } from '@neko/content';

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
      data: projectDurableValue(envelope['data']),
      ...(typeof envelope['error'] === 'string' ? { error: envelope['error'] } : {}),
      ...(typeof envelope['duration'] === 'number' ? { duration: envelope['duration'] } : {}),
      ...projectToolResultCollections(envelope),
    };
  }

  return {
    success: !isError,
    data: projectDurableValue(details?.['data'] ?? record?.['details'] ?? value),
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
  const attachments = readCollection(record, 'attachments', isToolResultAttachment)?.flatMap(
    (attachment) => {
      const projected = projectDurableAttachment(attachment);
      return projected ? [projected] : [];
    },
  );
  const perceptionCards = readCollection(record, 'perceptionCards', isPerceptionCard)?.map(
    (card) => projectDurableValue(card) as PerceptionCard,
  );
  const backfillDiagnostics = readCollection(
    record,
    'backfillDiagnostics',
    isToolResultBackfillDiagnostic,
  );
  const artifacts = readCollection(record, 'artifacts', isToolResultArtifactTransfer);
  return {
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
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
      isContentRepresentationHandle(assetRef['representationHandle']))
  );
}

function projectDurableAttachment(
  attachment: ToolResultAttachment,
): ToolResultAttachment | undefined {
  const assetRef = asRecord(attachment.assetRef);
  const contentLocator = isContentLocator(attachment.contentLocator)
    ? attachment.contentLocator
    : isContentLocator(assetRef?.['contentLocator'])
      ? assetRef['contentLocator']
      : undefined;
  const hasRepresentationHandle = isContentRepresentationHandle(assetRef?.['representationHandle']);
  if (hasRepresentationHandle && !contentLocator) return undefined;
  return projectDurableValue(attachment) as ToolResultAttachment;
}

function projectDurableValue(value: unknown): unknown {
  if (isContentRepresentationHandle(value)) return undefined;
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const projected = projectDurableValue(entry);
      return projected === undefined ? [] : [projected];
    });
  }
  const record = asRecord(value);
  if (!record) return structuredClone(value);
  const contentLocator = isContentLocator(record['contentLocator'])
    ? record['contentLocator']
    : undefined;
  if (record['portableForTransfer'] === false && !contentLocator) return undefined;
  const hasRepresentationHandle = isContentRepresentationHandle(record['representationHandle']);
  const projected: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (key === 'representationHandle') continue;
    if (
      hasRepresentationHandle &&
      !contentLocator &&
      (key === 'uri' || key === 'previewUri' || key === 'renderUri' || key === 'path')
    ) {
      continue;
    }
    const next = projectDurableValue(entry);
    if (next !== undefined) projected[key] = next;
  }
  if (contentLocator && typeof projected['uri'] === 'string') {
    const uri = projected['uri'];
    if (uri.startsWith('data:') || uri.startsWith('blob:') || uri.startsWith('openneko:')) {
      projected['uri'] = `content:${contentLocatorKey(contentLocator)}`;
    }
  }
  return projected;
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
