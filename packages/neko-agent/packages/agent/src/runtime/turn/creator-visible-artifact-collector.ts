import {
  hashStableValue,
  isResourceRef,
  validateDurableResourceRef,
  validateCompositeArtifact,
  type CanvasWorkspaceProjectionKind,
  type DocumentArchiveResourceRef,
  type GeneratedAssetRevisionRef,
  type ResourceRef,
  type ToolResultArtifactTransfer,
  type ToolResultAttachment,
} from '@neko/shared';
import { extractCompositeContentFenceCandidates } from '@neko-agent/types';

export interface CreatorVisibleArtifactCandidate {
  readonly artifactId: string;
  readonly revision: string;
  readonly role: 'source' | 'analysis' | 'output';
  readonly kind: Exclude<CanvasWorkspaceProjectionKind, 'markdown'> | 'markdown';
  readonly title: string;
  readonly sourceId: string;
  readonly sourceArtifactIds?: readonly string[];
  readonly markdown?: string;
  readonly resourceRef?: ResourceRef;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
}

export interface CreatorVisibleArtifactCollectionInput {
  readonly toolResults: readonly CreatorVisibleToolResult[];
  readonly generatedLifecycles?: readonly GeneratedAssetRevisionRef[];
  readonly consumedResourceIds?: ReadonlySet<string>;
  readonly assistantMarkdown?: string;
}

export interface CreatorVisibleToolResult {
  readonly name?: string;
  readonly success: boolean;
  readonly data?: unknown;
  readonly attachments?: readonly ToolResultAttachment[];
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
}

export function collectCreatorVisibleArtifacts(
  input: CreatorVisibleArtifactCollectionInput,
): readonly CreatorVisibleArtifactCandidate[] {
  const candidates: CreatorVisibleArtifactCandidate[] = [];
  for (const result of input.toolResults) {
    if (!result.success) continue;
    if (result.name === 'ReadDocument') {
      const source = collectReadDocumentSource(result.data);
      if (source) candidates.push(source);
    }
    for (const attachment of result.attachments ?? []) {
      const resourceRef = attachment.assetRef?.resourceRef;
      const documentResourceRef = attachment.assetRef?.documentResourceRef;
      if (!resourceRef && !documentResourceRef) continue;
      if (resourceRef && !validateDurableResourceRef(resourceRef).ok) continue;
      const sourceId =
        resourceRef?.id ??
        (documentResourceRef
          ? `document:${hashStableValue(documentResourceRef.source)}`
          : undefined);
      if (!sourceId) continue;
      if (input.consumedResourceIds && !input.consumedResourceIds.has(sourceId)) continue;
      candidates.push({
        artifactId: attachment.assetRef?.assetId ?? sourceId,
        revision: resourceRevision(resourceRef) ?? `attachment:${hashStableValue(attachment)}`,
        role: input.consumedResourceIds ? 'source' : 'output',
        kind: attachment.type,
        title: attachment.assetRef?.label ?? `${attachment.type} result`,
        sourceId,
        ...(resourceRef ? { resourceRef } : {}),
        ...(documentResourceRef ? { documentResourceRef } : {}),
      });
    }
    for (const transfer of result.artifacts ?? []) {
      const candidate = collectMarkdownArtifact(transfer);
      if (candidate) candidates.push(candidate);
    }
  }
  for (const lifecycle of input.generatedLifecycles ?? []) {
    candidates.push({
      artifactId: lifecycle.assetId,
      revision: lifecycle.revision,
      role: 'output',
      kind: lifecycle.mediaKind,
      title: `Generated ${lifecycle.mediaKind}`,
      sourceId: lifecycle.resourceRef.id,
      resourceRef: lifecycle.resourceRef,
    });
  }
  for (const fenced of extractCompositeContentFenceCandidates(input.assistantMarkdown ?? '')) {
    const candidate = collectCompositeMarkdownArtifact(fenced.value);
    if (candidate) candidates.push(candidate);
  }
  const reviewable = candidates.some((candidate) => candidate.role !== 'source');
  return deduplicateCandidates(
    reviewable ? candidates : candidates.filter((candidate) => candidate.role !== 'source'),
  );
}

function collectMarkdownArtifact(
  transfer: ToolResultArtifactTransfer,
): CreatorVisibleArtifactCandidate | undefined {
  if (transfer.type !== 'artifactSnapshot' && transfer.type !== 'artifactBackfill')
    return undefined;
  if (transfer.type === 'artifactSnapshot' && transfer.complete === false) return undefined;
  return collectCompositeMarkdownArtifact(transfer.artifact);
}

function collectCompositeMarkdownArtifact(
  value: unknown,
): CreatorVisibleArtifactCandidate | undefined {
  if (!validateCompositeArtifact(value).ok || !isRecord(value)) return undefined;
  const artifactId = readNonEmptyString(value['artifactId']);
  const title = readNonEmptyString(value['title']);
  if (!artifactId || !title) return undefined;
  const markdown = compositeArtifactMarkdown(value);
  if (!markdown) return undefined;
  const sourceArtifactIds = readSourceArtifactIds(value['provenance']);
  return {
    artifactId,
    revision: `markdown:${hashStableValue({ artifact: value, markdown })}`,
    role: 'analysis',
    kind: 'markdown',
    title,
    sourceId: `artifact:${artifactId}`,
    ...(sourceArtifactIds ? { sourceArtifactIds } : {}),
    markdown,
  };
}

function compositeArtifactMarkdown(
  artifact: Readonly<Record<string, unknown>>,
): string | undefined {
  const title = readNonEmptyString(artifact['title']);
  const blocks = artifact['blocks'];
  if (!title || !Array.isArray(blocks)) return undefined;
  const sections = [`# ${title}`];
  for (const block of blocks) {
    if (!isRecord(block)) continue;
    const kind = block['kind'];
    const text = readNonEmptyString(block['text']);
    if (kind === 'text' && text) {
      sections.push(text);
      continue;
    }
    if (kind === 'table' && isRecord(block['table'])) {
      const table = renderTable(block['table']);
      if (table) sections.push(table);
    }
  }
  return sections.length > 1 ? sections.join('\n\n') : undefined;
}

function renderTable(table: Readonly<Record<string, unknown>>): string | undefined {
  const rawColumns = table['columns'];
  const rawRows = table['rows'];
  if (!Array.isArray(rawColumns) || !Array.isArray(rawRows)) return undefined;
  const columns = rawColumns.flatMap((column) => {
    if (!isRecord(column)) return [];
    const columnId = readNonEmptyString(column['columnId']);
    if (!columnId) return [];
    return [{ columnId, label: readNonEmptyString(column['label']) }];
  });
  if (columns.length === 0) return undefined;
  const headers = columns.map((column) => column.label ?? column.columnId);
  const lines = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rawRows) {
    if (!isRecord(row) || !isRecord(row['cells'])) continue;
    const cells = row['cells'];
    const values = columns.map((column) => {
      const cell = cells[column.columnId];
      if (!isRecord(cell)) return '';
      const value = cell['value'] ?? cell['valueMs'];
      return typeof value === 'string' ? value : String(value ?? '');
    });
    lines.push(`| ${values.join(' | ')} |`);
  }
  return lines.join('\n');
}

function collectReadDocumentSource(data: unknown): CreatorVisibleArtifactCandidate | undefined {
  if (!isRecord(data)) return undefined;
  const resourceRef = data['resourceRef'];
  if (!isResourceRef(resourceRef) || !validateDurableResourceRef(resourceRef).ok) return undefined;
  const id = readNonEmptyString(resourceRef.id);
  const fingerprint = readNonEmptyString(resourceRef.fingerprint.value);
  if (!id || !fingerprint) return undefined;
  const source = resourceRef.source;
  const title =
    readNonEmptyString(source.projectRelativePath) ??
    readNonEmptyString(source.filePath) ??
    'Document source';
  return {
    artifactId: id,
    revision: fingerprint,
    role: 'source',
    kind: 'file-reference',
    title,
    sourceId: id,
    resourceRef,
  };
}

function readSourceArtifactIds(value: unknown): readonly string[] | undefined {
  if (!isRecord(value) || !Array.isArray(value['sourceArtifactIds'])) return undefined;
  const ids = value['sourceArtifactIds'].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0,
  );
  return ids.length > 0 ? ids : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resourceRevision(resourceRef: ResourceRef | undefined): string | undefined {
  if (!resourceRef) return undefined;
  return resourceRef.fingerprint.strategy === 'hash' ? resourceRef.fingerprint.value : undefined;
}

function deduplicateCandidates(
  candidates: readonly CreatorVisibleArtifactCandidate[],
): readonly CreatorVisibleArtifactCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const identity = `${candidate.artifactId}:${candidate.revision}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
