import { hashStableValue } from '@neko/shared';
import { contentLocatorKey, isContentLocator, type ContentLocator } from '@neko/content';
import { type GeneratedAssetRevisionRef } from '@neko/generation';
import {
  TOOL_NAMES_SYSTEM,
  type ToolResultArtifactTransfer,
  type ToolResultAttachment,
} from '@neko/agent-contracts';
import {
  type CanvasGenerationEvidence,
  type CanvasWorkspaceArtifactDimensions,
  type CanvasWorkspaceProjectionKind,
} from '@neko/canvas-domain';
import { validateCompositeArtifact } from '@neko/agent-contracts';
import { extractCompositeContentFenceCandidates } from '@neko/agent-contracts';
import type { ConversationTurnProjection } from '@neko/agent-contracts';

export interface CreatorVisibleArtifactCandidate {
  readonly artifactId: string;
  readonly contentFingerprint: string;
  readonly role: 'source' | 'analysis' | 'output';
  readonly kind: Exclude<CanvasWorkspaceProjectionKind, 'markdown'> | 'markdown';
  readonly title: string;
  readonly sourceId: string;
  readonly sourceArtifactIds?: readonly string[];
  readonly markdown?: string;
  readonly contentLocator?: ContentLocator;
  readonly mimeType?: string;
  readonly generation?: CanvasGenerationEvidence;
  readonly intrinsicDimensions?: CanvasWorkspaceArtifactDimensions;
  readonly provenanceSource?: 'tool-result' | 'assistant-declared' | 'native-image-analysis';
}

export interface CreatorVisibleArtifactCollectionInput {
  readonly toolResults: readonly CreatorVisibleToolResult[];
  readonly generatedLifecycles?: readonly GeneratedAssetRevisionRef[];
  readonly consumedContentSourceIds?: ReadonlySet<string>;
  readonly assistantMarkdown?: string;
}

export interface CreatorVisibleToolResult {
  readonly name?: string;
  readonly success: boolean;
  readonly data?: unknown;
  readonly attachments?: readonly ToolResultAttachment[];
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
}

export interface AgentCreatorVisibleArtifactDeliveryInput {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly runId: string;
  readonly completedAt: number;
  readonly artifacts: readonly CreatorVisibleArtifactCandidate[];
}

export type AgentCreatorVisibleArtifactDeliveryOutcome =
  | { readonly status: 'accepted' }
  | {
      readonly status: 'blocked';
      readonly diagnostic: {
        readonly code: string;
        readonly message: string;
      };
    };

export interface AgentCreatorVisibleArtifactDeliveryPort {
  deliver(
    input: AgentCreatorVisibleArtifactDeliveryInput,
  ): Promise<AgentCreatorVisibleArtifactDeliveryOutcome>;
}

export async function deliverCreatorVisibleArtifactsFromTurnProjection(input: {
  readonly turn: ConversationTurnProjection;
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly runId: string;
  readonly delivery?: AgentCreatorVisibleArtifactDeliveryPort;
}): Promise<AgentCreatorVisibleArtifactDeliveryOutcome | undefined> {
  try {
    const artifacts = collectCreatorVisibleArtifactsFromTurnProjection(input.turn);
    if (artifacts.length === 0) return undefined;
    if (!input.delivery) {
      return {
        status: 'blocked',
        diagnostic: {
          code: 'agent-artifact-delivery-unavailable',
          message: 'Creator-visible artifacts are durable but no Host delivery port is composed.',
        },
      };
    }
    return await input.delivery.deliver({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      turnId: input.turnId,
      runId: input.runId,
      completedAt: input.turn.completion?.completedAt ?? Date.now(),
      artifacts,
    });
  } catch (error) {
    return {
      status: 'blocked',
      diagnostic: {
        code: 'agent-artifact-delivery-failed',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
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
    if (result.name === 'Read') {
      const source = collectWorkspaceFileArtifact(result.data, 'source');
      if (source) candidates.push(source);
    }
    if (result.name === 'Write') {
      const output = collectWorkspaceFileArtifact(result.data, 'output');
      if (output) candidates.push(output);
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
      const contentLocator = attachment.contentLocator ?? attachment.assetRef?.contentLocator;
      if (!contentLocator) {
        throw new Error('Creator-visible Tool attachment requires contentLocator.');
      }
      if (!isContentLocator(contentLocator)) {
        throw new Error('Creator-visible Tool attachment contains an invalid contentLocator.');
      }
      const sourceId = createContentSourceId(contentLocator);
      if (input.consumedContentSourceIds && !input.consumedContentSourceIds.has(sourceId)) {
        continue;
      }
      const intrinsicDimensions = imageDimensions.get(contentLocatorKey(contentLocator));
      const generation = collectGenerationEvidence(result.data, contentLocator);
      const role = nativeImageAnalysisKind || input.consumedContentSourceIds ? 'source' : 'output';
      const candidate: CreatorVisibleArtifactCandidate = {
        artifactId: role === 'source' ? sourceId : (attachment.assetRef?.assetId ?? sourceId),
        contentFingerprint: createContentFingerprint(contentLocator),
        role,
        kind: attachment.type,
        title: attachment.assetRef?.label ?? `${attachment.type} result`,
        sourceId,
        contentLocator,
        ...((attachment.mimeType ?? attachment.assetRef?.mimeType)
          ? { mimeType: attachment.mimeType ?? attachment.assetRef?.mimeType }
          : {}),
        ...(generation ? { generation } : {}),
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
    const generation = collectLifecycleGenerationEvidence(lifecycle);
    candidates.push({
      artifactId: lifecycle.assetId,
      contentFingerprint: lifecycle.revision,
      role: 'output',
      kind: lifecycle.mediaKind,
      title: `Generated ${lifecycle.mediaKind}`,
      sourceId: createContentSourceId(lifecycle.contentLocator),
      contentLocator: lifecycle.contentLocator,
      mimeType: lifecycle.mimeType,
      ...(generation ? { generation } : {}),
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

function collectGenerationEvidence(
  data: unknown,
  contentLocator: ContentLocator,
): CanvasGenerationEvidence | undefined {
  if (contentLocator.kind !== 'generated-output' || !isRecord(data)) return undefined;
  const jobKind = data['jobKind'];
  const jobId = readNonEmptyString(data['jobId']);
  const prompt = readNonEmptyString(data['message']);
  const routedTo = data['routedTo'];
  const model = isRecord(routedTo) ? readNonEmptyString(routedTo['model']) : undefined;
  if (jobKind !== 'generation' || !jobId || (!prompt && !model)) return undefined;
  return {
    jobRef: { kind: 'generation', jobId },
    summary: {
      ...(prompt ? { prompt } : {}),
      ...(model ? { model } : {}),
    },
  };
}

function collectLifecycleGenerationEvidence(
  lifecycle: GeneratedAssetRevisionRef,
): CanvasGenerationEvidence | undefined {
  const model = readNonEmptyString(lifecycle.generation.modelId);
  if (!model) return undefined;
  return {
    jobRef: { kind: 'generation', jobId: lifecycle.generation.operationId },
    summary: { model },
  };
}

export function collectCreatorVisibleArtifactsFromTurnProjection(
  turn: ConversationTurnProjection,
): readonly CreatorVisibleArtifactCandidate[] {
  if (turn.completion?.status !== 'completed') return [];
  const toolResults: CreatorVisibleToolResult[] = [];
  const assistantMarkdown: string[] = [];
  for (const item of turn.items) {
    if (item.kind === 'assistant_text' && item.status === 'complete') {
      const content = item.payload.content.trim();
      if (content) assistantMarkdown.push(content);
      continue;
    }
    if (item.kind !== 'tool_call') continue;
    const result = item.payload.toolCall.result;
    if (!result) continue;
    toolResults.push({
      name: item.payload.toolCall.name,
      success: result.success,
      data: result.data,
      ...(result.attachments ? { attachments: result.attachments } : {}),
      ...(result.artifacts ? { artifacts: result.artifacts } : {}),
    });
  }
  return collectCreatorVisibleArtifacts({
    toolResults,
    ...(assistantMarkdown.length > 0 ? { assistantMarkdown: assistantMarkdown.join('\n\n') } : {}),
  });
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
    contentFingerprint: `markdown:${hashStableValue(identity)}`,
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
    const contentLocator = image['contentLocator'];
    if (!isContentLocator(contentLocator)) {
      throw new Error('Creator-visible ReadImage output entry requires a valid contentLocator.');
    }
    const width = readPositiveFiniteNumber(image['width']);
    const height = readPositiveFiniteNumber(image['height']);
    if (width === undefined || height === undefined) continue;
    const identity = contentLocatorKey(contentLocator);
    const existing = dimensions.get(identity);
    if (existing && (existing.width !== width || existing.height !== height)) {
      throw new Error(`ReadImage returned conflicting dimensions for ${identity}.`);
    }
    dimensions.set(identity, { width, height });
  }
  return dimensions;
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
    contentFingerprint: `markdown:${hashStableValue({ artifact: value, markdown })}`,
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
  const contentLocator = data['contentLocator'];
  if (!isContentLocator(contentLocator)) {
    throw new Error('Creator-visible ReadDocument output requires a valid contentLocator.');
  }
  const id = createContentSourceId(contentLocator);
  return {
    artifactId: id,
    contentFingerprint: createContentFingerprint(contentLocator),
    role: 'source',
    kind: 'file-reference',
    title: createContentTitle(contentLocator),
    sourceId: id,
    contentLocator,
  };
}

function collectWorkspaceFileArtifact(
  data: unknown,
  role: 'source' | 'output',
): CreatorVisibleArtifactCandidate | undefined {
  if (!isRecord(data)) return undefined;
  const contentLocator = data['contentLocator'];
  if (contentLocator === undefined) return undefined;
  if (!isContentLocator(contentLocator) || contentLocator.kind !== 'workspace-file') {
    throw new Error(`Creator-visible ${role} file requires a Workspace ContentLocator.`);
  }
  const id = createContentSourceId(contentLocator);
  return {
    artifactId: role === 'output' ? `output:${id}` : id,
    contentFingerprint: createContentFingerprint(contentLocator),
    role,
    kind: 'file-reference',
    title: createContentTitle(contentLocator),
    sourceId: id,
    contentLocator,
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

function createContentSourceId(locator: ContentLocator): string {
  return `content:${hashStableValue(contentLocatorKey(locator))}`;
}

function createContentFingerprint(locator: ContentLocator): string {
  switch (locator.kind) {
    case 'generated-output':
      return locator.digest;
    case 'package-resource':
      return locator.revision;
    case 'workspace-file':
      return locator.fingerprint?.value ?? `locator:${hashStableValue(contentLocatorKey(locator))}`;
    case 'document-entry':
      return (
        locator.fingerprint?.value ??
        locator.source.fingerprint?.value ??
        `locator:${hashStableValue(contentLocatorKey(locator))}`
      );
  }
}

function createContentTitle(locator: ContentLocator): string {
  switch (locator.kind) {
    case 'workspace-file':
    case 'generated-output':
      return locator.path;
    case 'document-entry':
      return locator.entryPath;
    case 'package-resource':
      return locator.resourcePath;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deduplicateCandidates(
  candidates: readonly CreatorVisibleArtifactCandidate[],
): readonly CreatorVisibleArtifactCandidate[] {
  const retained: CreatorVisibleArtifactCandidate[] = [];
  const seen = new Set<string>();
  const contentIndexes = new Map<string, number>();
  const aliases = new Map<string, string>();

  for (const candidate of candidates) {
    if (candidate.contentLocator) {
      const identity = contentLocatorKey(candidate.contentLocator);
      const existingIndex = contentIndexes.get(identity);
      if (existingIndex !== undefined) {
        const existing = retained[existingIndex];
        if (!existing) throw new Error('Creator-visible artifact deduplication index is invalid.');
        retained[existingIndex] = mergeIntrinsicDimensions(existing, candidate);
        aliases.set(candidate.artifactId, existing.artifactId);
        continue;
      }
      contentIndexes.set(identity, retained.length);
      retained.push(candidate);
      continue;
    }
    const identity = `${candidate.artifactId}:${candidate.contentFingerprint}`;
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
