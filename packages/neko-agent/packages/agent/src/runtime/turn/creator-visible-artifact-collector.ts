import {
  areResourceRefsContentCompatible,
  compareResourceRefObservationStrength,
  createResourceLogicalContentIdentity,
  hashStableValue,
  isDocumentArchiveResourceRef,
  isResourceRef,
  TOOL_NAMES_SYSTEM,
  validateDurableResourceRef,
  validateCompositeArtifact,
  type CanvasWorkspaceArtifactDimensions,
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
  readonly intrinsicDimensions?: CanvasWorkspaceArtifactDimensions;
  readonly provenanceSource?: 'tool-result' | 'assistant-declared' | 'native-image-analysis';
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
  const nativeImageAnalysisKinds = new Set<ReadImageAnalysisKind>();
  const nativeImageSourceArtifactIds: string[] = [];
  for (const result of input.toolResults) {
    if (!result.success) continue;
    if (result.name === 'ReadDocument') {
      const source = collectReadDocumentSource(result.data);
      if (source) candidates.push(source);
    }
    const isReadImage = result.name === TOOL_NAMES_SYSTEM.READ_IMAGE;
    const imageDimensions = isReadImage
      ? collectReadImageDimensions(result.data)
      : EMPTY_IMAGE_DIMENSIONS;
    const nativeImageAnalysisKind = isReadImage
      ? readReadImageAnalysisKind(result.data)
      : undefined;
    if (nativeImageAnalysisKind) nativeImageAnalysisKinds.add(nativeImageAnalysisKind);
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
      const intrinsicDimensions = imageDimensions.get(
        createImageResourceIdentity(resourceRef ?? documentResourceRef),
      );
      const candidate: CreatorVisibleArtifactCandidate = {
        artifactId: attachment.assetRef?.assetId ?? sourceId,
        revision: resourceRevision(resourceRef) ?? `attachment:${hashStableValue(attachment)}`,
        role: nativeImageAnalysisKind || input.consumedResourceIds ? 'source' : 'output',
        kind: attachment.type,
        title: attachment.assetRef?.label ?? `${attachment.type} result`,
        sourceId,
        ...(resourceRef ? { resourceRef } : {}),
        ...(documentResourceRef ? { documentResourceRef } : {}),
        ...(intrinsicDimensions ? { intrinsicDimensions } : {}),
      };
      candidates.push(candidate);
      if (nativeImageAnalysisKind) nativeImageSourceArtifactIds.push(candidate.artifactId);
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
  const fencedCandidates = extractCompositeContentFenceCandidates(input.assistantMarkdown ?? '');
  for (const fenced of fencedCandidates) {
    const candidate = collectCompositeMarkdownArtifact(fenced.value);
    if (candidate) candidates.push(candidate);
  }
  if (
    nativeImageSourceArtifactIds.length > 0 &&
    fencedCandidates.length === 0 &&
    !candidates.some((candidate) => candidate.role === 'analysis')
  ) {
    const analysis = collectNativeImageAnalysisArtifact({
      analysisKinds: [...nativeImageAnalysisKinds],
      sourceArtifactIds: nativeImageSourceArtifactIds,
      assistantMarkdown: input.assistantMarkdown,
    });
    if (analysis) candidates.push(analysis);
  }
  const reviewable = candidates.some((candidate) => candidate.role !== 'source');
  return deduplicateCandidates(
    reviewable ? candidates : candidates.filter((candidate) => candidate.role !== 'source'),
  );
}

type ReadImageAnalysisKind = 'describe' | 'ocr' | 'panels' | 'storyboard' | 'custom';

interface NativeImageAnalysisArtifactInput {
  readonly analysisKinds: readonly ReadImageAnalysisKind[];
  readonly sourceArtifactIds: readonly string[];
  readonly assistantMarkdown?: string;
}

function collectNativeImageAnalysisArtifact(
  input: NativeImageAnalysisArtifactInput,
): CreatorVisibleArtifactCandidate | undefined {
  const markdown = readNonEmptyString(input.assistantMarkdown);
  if (!markdown || input.analysisKinds.length === 0 || input.sourceArtifactIds.length === 0) {
    return undefined;
  }
  const analysisKinds = [...new Set(input.analysisKinds)].sort();
  const sourceArtifactIds = [...new Set(input.sourceArtifactIds)];
  const identity = { analysisKinds, sourceArtifactIds, markdown };
  const artifactId = `read-image-analysis:${hashStableValue(identity)}`;
  return {
    artifactId,
    revision: `markdown:${hashStableValue(identity)}`,
    role: 'analysis',
    kind: 'markdown',
    title: nativeImageAnalysisTitle(analysisKinds),
    sourceId: `artifact:${artifactId}`,
    sourceArtifactIds,
    markdown,
    provenanceSource: 'native-image-analysis',
  };
}

function readReadImageAnalysisKind(data: unknown): ReadImageAnalysisKind | undefined {
  if (!isRecord(data)) return undefined;
  const analysis = data['analysis'];
  return analysis === 'describe' ||
    analysis === 'ocr' ||
    analysis === 'panels' ||
    analysis === 'storyboard' ||
    analysis === 'custom'
    ? analysis
    : undefined;
}

function nativeImageAnalysisTitle(analysisKinds: readonly ReadImageAnalysisKind[]): string {
  if (analysisKinds.length !== 1) return 'Image Analysis';
  const analysisKind = analysisKinds[0];
  if (!analysisKind) return 'Image Analysis';
  switch (analysisKind) {
    case 'describe':
      return 'Image Description';
    case 'ocr':
      return 'Image OCR';
    case 'panels':
      return 'Panel Analysis';
    case 'storyboard':
      return 'Storyboard Analysis';
    case 'custom':
      return 'Image Analysis';
  }
}

const EMPTY_IMAGE_DIMENSIONS: ReadonlyMap<string, CanvasWorkspaceArtifactDimensions> = new Map();

function collectReadImageDimensions(
  data: unknown,
): ReadonlyMap<string, CanvasWorkspaceArtifactDimensions> {
  if (!isRecord(data) || !Array.isArray(data['images'])) return EMPTY_IMAGE_DIMENSIONS;
  const dimensions = new Map<string, CanvasWorkspaceArtifactDimensions>();
  for (const image of data['images']) {
    if (!isRecord(image)) continue;
    const resourceRef = image['resourceRef'];
    if (!isResourceRef(resourceRef) && !isDocumentArchiveResourceRef(resourceRef)) continue;
    const width = readPositiveFiniteNumber(image['width']);
    const height = readPositiveFiniteNumber(image['height']);
    if (width === undefined || height === undefined) continue;
    const identity = createImageResourceIdentity(resourceRef);
    const existing = dimensions.get(identity);
    if (existing && (existing.width !== width || existing.height !== height)) {
      throw new Error(`ReadImage returned conflicting dimensions for ${identity}.`);
    }
    dimensions.set(identity, { width, height });
  }
  return dimensions;
}

function createImageResourceIdentity(
  resourceRef: ResourceRef | DocumentArchiveResourceRef | undefined,
): string {
  if (!resourceRef) return 'missing';
  return isResourceRef(resourceRef)
    ? `resource:${resourceRef.id}`
    : `document:${hashStableValue(resourceRef)}`;
}

function readPositiveFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function collectMarkdownArtifact(
  transfer: ToolResultArtifactTransfer,
): CreatorVisibleArtifactCandidate | undefined {
  if (transfer.type !== 'artifactSnapshot' && transfer.type !== 'artifactBackfill')
    return undefined;
  if (transfer.type === 'artifactSnapshot' && transfer.complete === false) return undefined;
  return collectCompositeMarkdownArtifact(transfer.artifact, 'tool-result');
}

function collectCompositeMarkdownArtifact(
  value: unknown,
  provenanceSource: CreatorVisibleArtifactCandidate['provenanceSource'] = 'assistant-declared',
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
    provenanceSource,
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
  const retained: CreatorVisibleArtifactCandidate[] = [];
  const seen = new Set<string>();
  const resourceIndexes = new Map<string, number[]>();
  const aliases = new Map<string, string>();

  for (const candidate of candidates) {
    if (candidate.resourceRef) {
      const resourceRef = candidate.resourceRef;
      const logicalIdentity = createResourceLogicalContentIdentity(resourceRef);
      const indexes = resourceIndexes.get(logicalIdentity) ?? [];
      const compatibleIndex = indexes.find((index) => {
        const existing = retained[index];
        return (
          existing?.resourceRef !== undefined &&
          areResourceRefsContentCompatible(existing.resourceRef, resourceRef)
        );
      });
      if (compatibleIndex !== undefined) {
        const existing = retained[compatibleIndex];
        if (!existing) throw new Error('Creator-visible artifact deduplication index is invalid.');
        if (
          existing.resourceRef &&
          compareResourceRefObservationStrength(resourceRef, existing.resourceRef) > 0
        ) {
          retained[compatibleIndex] = mergeIntrinsicDimensions(candidate, existing);
          aliases.set(existing.artifactId, candidate.artifactId);
        } else {
          retained[compatibleIndex] = mergeIntrinsicDimensions(existing, candidate);
          aliases.set(candidate.artifactId, existing.artifactId);
        }
        continue;
      }
      indexes.push(retained.length);
      resourceIndexes.set(logicalIdentity, indexes);
      retained.push(candidate);
      continue;
    }
    const identity = `${candidate.artifactId}:${candidate.revision}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    retained.push(candidate);
  }

  return retained.map((candidate) => rewriteSourceArtifactAliases(candidate, aliases));
}

function mergeIntrinsicDimensions(
  preferred: CreatorVisibleArtifactCandidate,
  alternate: CreatorVisibleArtifactCandidate,
): CreatorVisibleArtifactCandidate {
  return preferred.intrinsicDimensions || !alternate.intrinsicDimensions
    ? preferred
    : { ...preferred, intrinsicDimensions: alternate.intrinsicDimensions };
}

function rewriteSourceArtifactAliases(
  candidate: CreatorVisibleArtifactCandidate,
  aliases: ReadonlyMap<string, string>,
): CreatorVisibleArtifactCandidate {
  if (!candidate.sourceArtifactIds) return candidate;
  const sourceArtifactIds = [
    ...new Set(
      candidate.sourceArtifactIds.map((artifactId) => resolveArtifactAlias(artifactId, aliases)),
    ),
  ];
  return { ...candidate, sourceArtifactIds };
}

function resolveArtifactAlias(artifactId: string, aliases: ReadonlyMap<string, string>): string {
  let resolved = artifactId;
  const visited = new Set<string>();
  while (aliases.has(resolved)) {
    if (visited.has(resolved)) throw new Error('Creator-visible artifact alias cycle.');
    visited.add(resolved);
    const next = aliases.get(resolved);
    if (!next) throw new Error('Creator-visible artifact alias is invalid.');
    resolved = next;
  }
  return resolved;
}
