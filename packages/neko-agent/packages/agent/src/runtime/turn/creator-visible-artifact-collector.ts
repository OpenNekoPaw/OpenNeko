import {
  hashStableValue,
  validateDurableResourceRef,
  validateCompositeArtifact,
  type CanvasWorkspaceProjectionKind,
  type DocumentArchiveResourceRef,
  type GeneratedAssetRevisionRef,
  type ResourceRef,
  type ToolResultArtifactTransfer,
  type ToolResultAttachment,
} from '@neko/shared';

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
}

export interface CreatorVisibleToolResult {
  readonly success: boolean;
  readonly attachments?: readonly ToolResultAttachment[];
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
}

export function collectCreatorVisibleArtifacts(
  input: CreatorVisibleArtifactCollectionInput,
): readonly CreatorVisibleArtifactCandidate[] {
  const candidates: CreatorVisibleArtifactCandidate[] = [];
  for (const result of input.toolResults) {
    if (!result.success) continue;
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
  return deduplicateCandidates(candidates);
}

function collectMarkdownArtifact(
  transfer: ToolResultArtifactTransfer,
): CreatorVisibleArtifactCandidate | undefined {
  if (transfer.type !== 'artifactSnapshot' && transfer.type !== 'artifactBackfill')
    return undefined;
  if (transfer.type === 'artifactSnapshot' && transfer.complete === false) return undefined;
  if (!validateCompositeArtifact(transfer.artifact).ok) return undefined;
  const markdown = compositeArtifactMarkdown(transfer.artifact);
  if (!markdown) return undefined;
  const artifact = transfer.artifact;
  const sourceArtifactIds = artifact.provenance?.sourceArtifactIds;
  return {
    artifactId: artifact.artifactId,
    revision: `markdown:${hashStableValue({ artifact, markdown })}`,
    role: 'analysis',
    kind: 'markdown',
    title: artifact.title,
    sourceId: `artifact:${artifact.artifactId}`,
    ...(sourceArtifactIds ? { sourceArtifactIds } : {}),
    markdown,
  };
}

function compositeArtifactMarkdown(artifact: {
  readonly title: string;
  readonly blocks: readonly {
    readonly kind: string;
    readonly text?: string;
    readonly title?: string;
    readonly table?: {
      readonly columns: readonly { readonly columnId: string; readonly label?: string }[];
      readonly rows: readonly {
        readonly cells: Readonly<Record<string, Record<string, unknown>>>;
      }[];
    };
  }[];
}): string | undefined {
  const sections = [`# ${artifact.title.trim()}`];
  for (const block of artifact.blocks) {
    if (block.kind === 'text' && block.text?.trim()) {
      sections.push(block.text.trim());
      continue;
    }
    if (block.kind === 'table' && block.table) {
      sections.push(renderTable(block.table));
    }
  }
  return sections.length > 1 ? sections.join('\n\n') : undefined;
}

function renderTable(table: {
  readonly columns: readonly { readonly columnId: string; readonly label?: string }[];
  readonly rows: readonly { readonly cells: Readonly<Record<string, unknown>> }[];
}): string {
  const headers = table.columns.map((column) => column.label ?? column.columnId);
  const lines = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of table.rows) {
    const values = table.columns.map((column) => {
      const cell = row.cells[column.columnId];
      if (!isRecord(cell)) return '';
      const value = cell['value'] ?? cell['valueMs'];
      return typeof value === 'string' ? value : String(value ?? '');
    });
    lines.push(`| ${values.join(' | ')} |`);
  }
  return lines.join('\n');
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
