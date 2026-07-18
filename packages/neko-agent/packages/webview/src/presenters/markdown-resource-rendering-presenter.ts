import type { ContentBlock, ToolCall } from '@neko-agent/types';
import {
  normalizeMarkdownResourceLookupToken,
  projectNekoMarkdownExtensions,
  stripMarkdownPlacementHint,
  type NekoMarkdownDiagnostic,
  type NekoMarkdownMentionResolver,
  type NekoMarkdownMentionToken,
  type NekoMarkdownResourceReferenceToken,
  type NekoMarkdownResourceResolver,
  type NekoMarkdownSemanticPromptSpan,
  type NekoMarkdownStableRef,
} from '@neko/markdown';
import {
  type AgentContextPayload,
  isRuntimeOnlyCanvasMarkdownResourceValue,
  isResourceRef,
  parseDocumentArchiveResourceRef,
  type CanvasMarkdownResourceRef,
  type DocumentArchiveResourceRef,
  type PerceptionCard,
  type PerceptualAssetRef,
  type ResourceRef,
  type ResourceSourceRef,
  type ToolResultAttachment,
} from '@neko/shared';
import type { AmbientCanvasNodeProjection } from './plugin-transfer-presenter';

export type MarkdownResourceStatus = 'bound' | 'ambiguous' | 'missing' | 'unsupported';

export interface MarkdownResourceDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly token?: string;
  readonly range?: NekoMarkdownDiagnostic['range'];
  readonly candidates?: readonly MarkdownResourceCandidateSummary[];
}

export interface MarkdownResourceCandidateSummary {
  readonly token?: string;
  readonly label?: string;
  readonly role?: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sourceTitle?: string;
  readonly pageNumber?: number;
}

export interface MarkdownRenderedResourceToken {
  readonly token: string;
  readonly status: MarkdownResourceStatus;
  readonly refs: readonly MarkdownResourceCandidateSummary[];
  readonly resources: readonly CanvasMarkdownResourceRef[];
  readonly renderUris: readonly string[];
  readonly diagnostics: readonly MarkdownResourceDiagnostic[];
}

export interface MarkdownMentionResolverItem {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly description?: string;
  readonly filePath?: string;
  readonly contextPayload?: AgentContextPayload;
}

export interface MarkdownMentionProjection {
  readonly raw: string;
  readonly label: string;
  readonly status: MarkdownResourceStatus;
  readonly ref?: NekoMarkdownStableRef;
  readonly candidates: readonly NekoMarkdownStableRef[];
  readonly range: NekoMarkdownMentionToken['range'];
}

export interface MarkdownResourceReferenceProjection {
  readonly raw: string;
  readonly target: string;
  readonly lookupToken: string;
  readonly embed: boolean;
  readonly status: MarkdownResourceStatus;
  readonly ref?: NekoMarkdownStableRef;
  readonly candidates: readonly NekoMarkdownStableRef[];
  readonly placementHint?: string;
  readonly range: NekoMarkdownResourceReferenceToken['range'];
}

export interface MarkdownSemanticPromptSpanProjection {
  readonly kind: string;
  readonly range: NekoMarkdownSemanticPromptSpan['range'];
  readonly fieldId?: string;
  readonly label?: string;
  readonly ref?: NekoMarkdownStableRef;
  readonly tone?: string;
  readonly tooltip?: string;
}

export interface MarkdownResourceRenderingProjection {
  readonly status: 'none' | 'ready' | 'diagnostic';
  readonly tokens: readonly MarkdownRenderedResourceToken[];
  readonly mentions?: readonly MarkdownMentionProjection[];
  readonly resourceReferences?: readonly MarkdownResourceReferenceProjection[];
  readonly promptSpans?: readonly MarkdownSemanticPromptSpanProjection[];
  readonly diagnostics: readonly MarkdownResourceDiagnostic[];
}

interface MarkdownToolResultImageRef {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly assetIndex: number;
  readonly label?: string;
  readonly alias?: string;
  readonly aliasScope?: string;
  readonly sourceDocumentId?: string;
  readonly entryPath?: string;
  readonly batchKey: string;
  readonly mimeType?: string;
  readonly pageNumber?: number;
  readonly sequenceNumber?: number;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
  readonly resourceRef?: ResourceRef;
  readonly renderUri?: string;
  readonly extraTokens?: readonly string[];
  readonly width?: number;
  readonly height?: number;
}

export interface ProjectMarkdownResourceRenderingInput {
  readonly markdown: string;
  readonly siblingBlocks?: readonly ContentBlock[];
  readonly toolCalls?: readonly ToolCall[];
  readonly contextChips?: readonly AgentContextPayload[];
  readonly ambientNodes?: readonly AmbientCanvasNodeProjection[];
  readonly mentionItems?: readonly MarkdownMentionResolverItem[];
  readonly promptSpans?: readonly NekoMarkdownSemanticPromptSpan[];
  readonly requireResolvedReferences?: boolean;
}

export { normalizeMarkdownResourceLookupToken } from '@neko/markdown';

const COMMONMARK_IMAGE_RE = /!\[[^\]]*]\(([^)]+)\)/g;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const RESOURCE_CELL_TOKEN_RE =
  /`?([A-Za-z][A-Za-z0-9_.-]{0,80})(?:#[A-Za-z][A-Za-z0-9_.:-]{0,80})?`?/g;
const RESOURCE_COLUMN_HINTS = new Set([
  'image',
  'images',
  'picture',
  'source_page',
  'perception',
  'perception_card',
  'resource',
  'resources',
  'asset',
  'assets',
  'reference',
  'references',
  'ref',
  'media',
  'source',
  '来源',
  '来源页',
  '感知卡',
  '源图',
  '图片',
  '图像',
  '资源',
  '素材',
  '参考图',
  '参考',
]);

export function projectMarkdownResourceRendering(
  input: ProjectMarkdownResourceRenderingInput,
): MarkdownResourceRenderingProjection {
  const refs = collectMarkdownToolResultImageRefs(input);
  const resourceIndex = createResourceIndex(refs);
  const extensionProjection = projectNekoMarkdownExtensions(input.markdown, {
    resourceReferences: 'enabled',
    resourceResolver: createMarkdownResourceReferenceResolver(resourceIndex),
    mentionResolver: createMarkdownMentionResolver(input),
    ...(input.promptSpans ? { promptSpans: input.promptSpans } : {}),
    requireResolvedReferences: input.requireResolvedReferences === true,
  });
  const diagnostics = extensionProjection.diagnostics.map(toMarkdownResourceDiagnostic);
  const tokens = extractMarkdownResourceTokens(input.markdown, refs.length > 0).map((token) =>
    projectMarkdownResourceToken(token, resourceIndex, refs.length),
  );
  const allDiagnostics = [
    ...diagnostics,
    ...tokens.flatMap((projection) => projection.diagnostics),
  ];
  const mentions = extensionProjection.mentions.map(projectMarkdownMention);
  const resourceReferences = extensionProjection.resourceReferences.map(
    projectMarkdownResourceReference,
  );
  const promptSpans = extensionProjection.promptSpans.map(projectMarkdownSemanticPromptSpan);
  if (
    tokens.length === 0 &&
    mentions.length === 0 &&
    resourceReferences.length === 0 &&
    promptSpans.length === 0 &&
    allDiagnostics.length === 0
  ) {
    return { status: 'none', tokens: [], diagnostics: [] };
  }
  return {
    status: allDiagnostics.some((diagnostic) => diagnostic.severity === 'error')
      ? 'diagnostic'
      : 'ready',
    tokens,
    ...(mentions.length > 0 ? { mentions } : {}),
    ...(resourceReferences.length > 0 ? { resourceReferences } : {}),
    ...(promptSpans.length > 0 ? { promptSpans } : {}),
    diagnostics: allDiagnostics,
  };
}

function projectMarkdownResourceToken(
  token: string,
  resourceIndex: ReadonlyMap<string, readonly MarkdownToolResultImageRef[]>,
  resourceCount: number,
): MarkdownRenderedResourceToken {
  const refs = resourceIndex.get(normalizeMarkdownResourceLookupToken(token)) ?? [];
  if (refs.length === 0) {
    const hasResourceContext = resourceCount > 0;
    return {
      token,
      status: 'missing',
      refs: [],
      resources: [],
      renderUris: [],
      diagnostics: [
        {
          severity: 'error',
          code: hasResourceContext ? 'missing-resource-token' : 'missing-resource-context',
          token,
          message: hasResourceContext
            ? `Markdown resource token "${token}" does not match a known resource.`
            : `Markdown resource token "${token}" cannot be resolved because this message has no image resource context.`,
        },
      ],
    };
  }
  const summaries = refs.map(createSafeCandidateSummary);
  if (refs.length > 1) {
    return {
      token,
      status: 'ambiguous',
      refs: summaries,
      resources: refs.flatMap((ref) => projectCanvasMarkdownResourceRef(token, ref) ?? []),
      renderUris: uniqueStrings(refs.flatMap((ref) => (ref.renderUri ? [ref.renderUri] : []))),
      diagnostics: [
        {
          severity: 'error',
          code: 'ambiguous-resource-token',
          token,
          message: `Markdown resource token "${token}" matches multiple resources.`,
          candidates: summaries,
        },
      ],
    };
  }
  const ref = refs[0];
  if (!ref) {
    throw new Error(`Resource index returned an empty candidate for token "${token}".`);
  }
  const resource = projectCanvasMarkdownResourceRef(token, ref);
  return {
    token,
    status: 'bound',
    refs: summaries,
    resources: resource ? [resource] : [],
    renderUris: ref.renderUri ? [ref.renderUri] : [],
    diagnostics: [],
  };
}

function createMarkdownMentionResolver(
  input: Pick<
    ProjectMarkdownResourceRenderingInput,
    'contextChips' | 'ambientNodes' | 'mentionItems'
  >,
): NekoMarkdownMentionResolver | undefined {
  const candidates = collectMarkdownMentionCandidates(input);
  if (candidates.length === 0) return undefined;
  return {
    resolveMention(mention) {
      const mentionKey = normalizeMarkdownResourceLookupToken(mention.label);
      const matches = candidates.filter((candidate) => candidate.lookupTokens.includes(mentionKey));
      const uniqueMatches = dedupeMarkdownMentionCandidates(matches);
      if (uniqueMatches.length === 0) return { status: 'unresolved' };
      if (uniqueMatches.length > 1) {
        return {
          status: 'ambiguous',
          candidates: uniqueMatches.map((candidate) => candidate.ref),
        };
      }
      const match = uniqueMatches[0];
      return match ? { status: 'resolved', ref: match.ref } : { status: 'unresolved' };
    },
  };
}

function createMarkdownResourceReferenceResolver(
  resourceIndex: ReadonlyMap<string, readonly MarkdownToolResultImageRef[]>,
): NekoMarkdownResourceResolver | undefined {
  if (resourceIndex.size === 0) return undefined;
  return {
    resolveResource(resource) {
      const refs =
        resourceIndex.get(normalizeMarkdownResourceLookupToken(resource.lookupToken)) ?? [];
      if (refs.length === 0) return { status: 'unresolved' };
      const stableRefs = dedupeStableRefs(
        refs.flatMap((ref) => {
          const stableRef = projectMarkdownStableRefForResource(ref);
          return stableRef ? [stableRef] : [];
        }),
      );
      if (stableRefs.length === 0) return { status: 'unresolved' };
      if (stableRefs.length > 1) return { status: 'ambiguous', candidates: stableRefs };
      const ref = stableRefs[0];
      return ref ? { status: 'resolved', ref } : { status: 'unresolved' };
    },
  };
}

function projectMarkdownStableRefForResource(
  ref: MarkdownToolResultImageRef,
): NekoMarkdownStableRef | undefined {
  if (ref.resourceRef) {
    return {
      kind: ref.resourceRef.kind,
      id: ref.resourceRef.id,
      namespace: ref.resourceRef.scope,
    };
  }
  if (ref.documentResourceRef) {
    const sourceId = readDocumentResourceSourceId(ref.documentResourceRef) ?? 'document';
    const entryId =
      ref.documentResourceRef.entryPath ?? JSON.stringify(ref.documentResourceRef.locator);
    return {
      kind: 'document-entry',
      id: `${sourceId}:${entryId}`,
      namespace: 'document',
    };
  }
  if (ref.entryPath && !isRuntimeOnlyCanvasMarkdownResourceValue(ref.entryPath)) {
    return { kind: 'file', id: ref.entryPath };
  }
  return undefined;
}

function dedupeStableRefs(
  refs: readonly NekoMarkdownStableRef[],
): readonly NekoMarkdownStableRef[] {
  const byKey = new Map<string, NekoMarkdownStableRef>();
  for (const ref of refs) {
    byKey.set(`${ref.namespace ?? ''}:${ref.kind}:${ref.id}`, ref);
  }
  return [...byKey.values()];
}

interface MarkdownMentionCandidate {
  readonly ref: NekoMarkdownStableRef;
  readonly lookupTokens: readonly string[];
}

function collectMarkdownMentionCandidates(
  input: Pick<
    ProjectMarkdownResourceRenderingInput,
    'contextChips' | 'ambientNodes' | 'mentionItems'
  >,
): readonly MarkdownMentionCandidate[] {
  return [
    ...(input.contextChips ?? []).map(markdownMentionCandidateFromContextChip),
    ...(input.ambientNodes ?? []).map(markdownMentionCandidateFromAmbientCanvasNode),
    ...(input.mentionItems ?? []).map(markdownMentionCandidateFromMentionItem),
  ];
}

function markdownMentionCandidateFromContextChip(
  chip: AgentContextPayload,
): MarkdownMentionCandidate {
  return {
    ref: { kind: chip.type, id: chip.id, namespace: contextPayloadNamespace(chip.type) },
    lookupTokens: mentionLookupTokens([chip.label, chip.id, chip.summary]),
  };
}

function markdownMentionCandidateFromAmbientCanvasNode(
  node: AmbientCanvasNodeProjection,
): MarkdownMentionCandidate {
  return {
    ref: { kind: 'canvas-node', id: node.nodeId, namespace: 'canvas' },
    lookupTokens: mentionLookupTokens([node.nodeId, node.summary]),
  };
}

function markdownMentionCandidateFromMentionItem(
  item: MarkdownMentionResolverItem,
): MarkdownMentionCandidate {
  const ref = item.contextPayload
    ? {
        kind: item.contextPayload.type,
        id: item.contextPayload.id,
        namespace: contextPayloadNamespace(item.contextPayload.type),
      }
    : {
        kind: item.kind,
        id: item.filePath ?? item.id,
        namespace: item.kind === 'canvas-node' ? 'canvas' : undefined,
      };
  return {
    ref,
    lookupTokens: mentionLookupTokens([
      item.label,
      item.id,
      item.filePath,
      item.description,
      item.contextPayload?.label,
      item.contextPayload?.summary,
    ]),
  };
}

function contextPayloadNamespace(type: AgentContextPayload['type']): string | undefined {
  if (type === 'canvas-node') return 'canvas';
  if (type === 'canvas-storyboard-action-intent') return 'canvas';
  if (type === 'character' || type === 'scene' || type === 'entity') return 'entity';
  if (type === 'asset' || type === 'media' || type === 'image' || type === 'audio-clip') {
    return 'asset';
  }
  if (type === 'model-preview') return 'asset';
  return undefined;
}

function mentionLookupTokens(values: readonly (string | undefined)[]): readonly string[] {
  return uniqueStrings(
    values
      .filter(isNonEmptyString)
      .flatMap((value) => [value, fileName(value), fileStem(value)])
      .filter(isNonEmptyString)
      .map(normalizeMarkdownResourceLookupToken),
  );
}

function dedupeMarkdownMentionCandidates(
  candidates: readonly MarkdownMentionCandidate[],
): readonly MarkdownMentionCandidate[] {
  const byRef = new Map<string, MarkdownMentionCandidate>();
  for (const candidate of candidates) {
    byRef.set(`${candidate.ref.kind}:${candidate.ref.id}`, candidate);
  }
  return [...byRef.values()];
}

function projectMarkdownMention(token: NekoMarkdownMentionToken): MarkdownMentionProjection {
  return {
    raw: token.raw,
    label: token.label,
    status:
      token.status === 'resolved'
        ? 'bound'
        : token.status === 'ambiguous'
          ? 'ambiguous'
          : 'missing',
    ...(token.ref ? { ref: token.ref } : {}),
    candidates: token.candidates,
    range: token.range,
  };
}

function projectMarkdownResourceReference(
  token: NekoMarkdownResourceReferenceToken,
): MarkdownResourceReferenceProjection {
  return {
    raw: token.raw,
    target: token.target,
    lookupToken: token.lookupToken,
    embed: token.embed,
    status:
      token.status === 'resolved'
        ? 'bound'
        : token.status === 'ambiguous'
          ? 'ambiguous'
          : 'missing',
    ...(token.ref ? { ref: token.ref } : {}),
    candidates: token.candidates,
    ...(token.placementHint ? { placementHint: token.placementHint } : {}),
    range: token.range,
  };
}

function projectMarkdownSemanticPromptSpan(
  span: NekoMarkdownSemanticPromptSpan,
): MarkdownSemanticPromptSpanProjection {
  return {
    kind: span.kind,
    range: span.range,
    ...(span.fieldId ? { fieldId: span.fieldId } : {}),
    ...(span.label ? { label: span.label } : {}),
    ...(span.ref ? { ref: span.ref } : {}),
    ...(span.tone ? { tone: span.tone } : {}),
    ...(span.tooltip ? { tooltip: span.tooltip } : {}),
  };
}

function toMarkdownResourceDiagnostic(
  diagnostic: NekoMarkdownDiagnostic,
): MarkdownResourceDiagnostic {
  const tokenValue = diagnostic.parameters['token'];
  const token = typeof tokenValue === 'string' ? tokenValue : undefined;
  return {
    severity: diagnostic.severity === 'fatal' ? 'error' : diagnostic.severity,
    code: diagnostic.code,
    message: formatNekoMarkdownDiagnostic(diagnostic, token),
    ...(token ? { token } : {}),
    ...(diagnostic.range ? { range: diagnostic.range } : {}),
  };
}

function formatNekoMarkdownDiagnostic(
  diagnostic: NekoMarkdownDiagnostic,
  token: string | undefined,
): string {
  const displayToken = token ?? 'Markdown content';
  switch (diagnostic.code) {
    case 'MD_RESOURCE_REFERENCE_UNSUPPORTED':
      return 'Markdown resource references are unsupported in this context.';
    case 'MD_RESOURCE_REFERENCE_AMBIGUOUS':
      return `Markdown resource reference "${displayToken}" is ambiguous.`;
    case 'MD_RESOURCE_REFERENCE_MISSING':
      return `Markdown resource reference "${displayToken}" could not be resolved.`;
    case 'MD_MENTION_AMBIGUOUS':
      return `Markdown mention "${displayToken}" is ambiguous.`;
    case 'MD_MENTION_MISSING':
      return `Markdown mention "${displayToken}" could not be resolved.`;
    case 'MD_RAW_HTML_PRESERVED':
      return 'Raw HTML is preserved as inert Markdown content.';
    case 'MD_TABLE_ROW_WIDTH_MISMATCH':
      return 'Markdown table rows have different cell counts.';
    case 'MD_UNSAFE_DESTINATION':
      return 'Markdown contains a destination that this host will not activate.';
    default:
      return diagnostic.externalDetail?.detail ?? diagnostic.code;
  }
}

function projectCanvasMarkdownResourceRef(
  token: string,
  ref: MarkdownToolResultImageRef,
): CanvasMarkdownResourceRef | undefined {
  const sourcePath = ref.documentResourceRef ? undefined : ref.entryPath;
  const resource: CanvasMarkdownResourceRef = {
    token,
    ...(ref.label ? { label: ref.label } : {}),
    role: 'source',
    ...(sourcePath && !isRuntimeOnlyCanvasMarkdownResourceValue(sourcePath) ? { sourcePath } : {}),
    ...(ref.resourceRef ? { resourceRef: ref.resourceRef } : {}),
    ...(ref.documentResourceRef ? { documentResourceRef: ref.documentResourceRef } : {}),
  };
  return resource.sourcePath || resource.resourceRef || resource.documentResourceRef
    ? resource
    : undefined;
}

function createSafeCandidateSummary(
  ref: MarkdownToolResultImageRef,
): MarkdownResourceCandidateSummary {
  return {
    ...((ref.alias ?? ref.label) ? { token: ref.alias ?? ref.label } : {}),
    ...(ref.label ? { label: ref.label } : {}),
    ...(ref.mimeType ? { mimeType: ref.mimeType } : {}),
    ...(ref.width !== undefined ? { width: ref.width } : {}),
    ...(ref.height !== undefined ? { height: ref.height } : {}),
    ...(ref.sourceDocumentId ? { sourceTitle: ref.sourceDocumentId } : {}),
    ...(ref.pageNumber !== undefined ? { pageNumber: ref.pageNumber } : {}),
    role: 'source',
  };
}

function extractMarkdownResourceTokens(
  markdown: string,
  includePlainTableCellTokens: boolean,
): readonly string[] {
  return uniqueStrings([
    ...extractCommonMarkImageTargets(markdown),
    ...extractNekoResourceReferenceTargets(markdown),
    ...(includePlainTableCellTokens ? extractTableResourceCellTokens(markdown) : []),
  ]);
}

function extractCommonMarkImageTargets(markdown: string): readonly string[] {
  return projectNekoMarkdownExtensions(markdown).images.map((image) => image.lookupToken);
}

function extractNekoResourceReferenceTargets(markdown: string): readonly string[] {
  return projectNekoMarkdownExtensions(markdown, { resourceReferences: 'enabled' })
    .resourceReferences.map((reference) => reference.lookupToken)
    .filter(isNonEmptyString);
}

function extractTableResourceCellTokens(markdown: string): readonly string[] {
  const tokens: string[] = [];
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length - 2; index += 1) {
    const header = parseTableLine(lines[index] ?? '');
    const separator = parseTableLine(lines[index + 1] ?? '');
    if (!header || !separator || !isSeparatorRow(separator)) continue;
    const resourceColumnIndexes = header
      .map((label, columnIndex) => (isResourceColumnHeader(label) ? columnIndex : -1))
      .filter((columnIndex) => columnIndex >= 0);
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      if (!TABLE_ROW_RE.test(lines[rowIndex] ?? '')) break;
      const cells = parseTableLine(lines[rowIndex] ?? '');
      if (!cells) break;
      for (const columnIndex of resourceColumnIndexes) {
        tokens.push(...extractCellTokens(cells[columnIndex] ?? ''));
      }
    }
  }
  return tokens;
}

function extractCellTokens(value: string): readonly string[] {
  const imageTargets = extractCommonMarkImageTargets(value);
  const resourceReferenceTargets = extractNekoResourceReferenceTargets(value);
  const valueWithoutImages = value.replace(COMMONMARK_IMAGE_RE, ' ');
  const plainTokens = Array.from(valueWithoutImages.matchAll(RESOURCE_CELL_TOKEN_RE))
    .map(
      (match) => stripMarkdownPlacementHint(stripMarkdownToken(match[1] ?? match[0])).lookupToken,
    )
    .filter((token) => token.length > 0 && !isIgnoredResourceWord(token));
  return uniqueStrings([...imageTargets, ...resourceReferenceTargets, ...plainTokens]);
}

function isResourceColumnHeader(label: string): boolean {
  const normalized = normalizeMarkdownResourceLookupToken(label);
  if (RESOURCE_COLUMN_HINTS.has(normalized)) return true;
  const parts = normalized.split('_').filter((part) => part.length > 0);
  return parts.some((part) => RESOURCE_COLUMN_HINTS.has(part));
}

function parseTableLine(line: string): readonly string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return undefined;
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function createResourceIndex(
  refs: readonly MarkdownToolResultImageRef[],
): ReadonlyMap<string, readonly MarkdownToolResultImageRef[]> {
  const index = new Map<string, MarkdownToolResultImageRef[]>();
  for (const ref of refs) {
    for (const token of createMarkdownToolResultTokens(ref)) {
      const key = normalizeMarkdownResourceLookupToken(token);
      const existing = index.get(key) ?? [];
      if (
        existing.some((candidate) => resourceIdentityKey(candidate) === resourceIdentityKey(ref))
      ) {
        continue;
      }
      index.set(key, [...existing, ref]);
    }
  }
  return index;
}

function resourceIdentityKey(ref: MarkdownToolResultImageRef): string {
  if (ref.resourceRef) return `resource:${ref.resourceRef.id}`;
  if (ref.documentResourceRef) {
    return `document:${readDocumentResourceSourceId(ref.documentResourceRef) ?? 'unknown'}:${ref.documentResourceRef.entryPath ?? JSON.stringify(ref.documentResourceRef.locator)}`;
  }
  return `tool:${ref.toolCallId}:${ref.assetIndex}`;
}

function createMarkdownToolResultTokens(ref: MarkdownToolResultImageRef): readonly string[] {
  return uniqueStrings(
    [
      ref.alias,
      ref.label,
      ref.resourceRef?.id,
      ...(ref.resourceRef ? resourceRefLookupTokens(ref.resourceRef) : []),
      ref.documentResourceRef?.entryPath,
      ref.pageNumber !== undefined ? `page_${ref.pageNumber}` : undefined,
      ref.pageNumber !== undefined ? `P${ref.pageNumber}` : undefined,
      ref.sequenceNumber !== undefined ? `image_${ref.sequenceNumber}` : undefined,
      ref.sequenceNumber !== undefined ? `page_${ref.sequenceNumber}` : undefined,
      ref.sequenceNumber !== undefined ? `P${ref.sequenceNumber}` : undefined,
      ...sequenceNumberLookupTokens(ref.sequenceNumber),
      ...(ref.entryPath ? pathLookupTokens(ref.entryPath) : []),
      ...(ref.documentResourceRef?.entryPath
        ? pathLookupTokens(ref.documentResourceRef.entryPath)
        : []),
      ...(ref.toolName === 'ReadImage' ? readImageDerivedAssetTokens(ref) : []),
      ...(ref.extraTokens ?? []),
    ]
      .filter(isNonEmptyString)
      .flatMap((value) => [value, normalizeMarkdownResourceLookupToken(value)]),
  );
}

function collectMarkdownToolResultImageRefs(
  options: Pick<ProjectMarkdownResourceRenderingInput, 'siblingBlocks' | 'toolCalls'>,
): readonly MarkdownToolResultImageRef[] {
  return dedupeMarkdownImageRefs(
    collectMarkdownToolCalls(options).flatMap((toolCall) =>
      collectMarkdownImageRefsFromToolCall(toolCall),
    ),
  );
}

function collectMarkdownToolCalls(
  options: Pick<ProjectMarkdownResourceRenderingInput, 'siblingBlocks' | 'toolCalls'>,
): readonly ToolCall[] {
  const byId = new Map<string, ToolCall>();
  for (const block of options.siblingBlocks ?? []) {
    if (block.type === 'tool_call' && block.toolCall) byId.set(block.toolCall.id, block.toolCall);
  }
  for (const toolCall of options.toolCalls ?? []) {
    byId.set(toolCall.id, toolCall);
  }
  return Array.from(byId.values());
}

function collectMarkdownImageRefsFromToolCall(
  toolCall: ToolCall,
): readonly MarkdownToolResultImageRef[] {
  const data = asRecord(toolCall.result?.data);
  const renderUrisByIndex = createToolResultRenderUriIndex(toolCall);
  const assetTokensByIndex = createToolResultAssetTokenIndex(toolCall);
  const refs: MarkdownToolResultImageRef[] = [];

  for (const [index, image] of collectToolResultImageInfoRecords(data).entries()) {
    refs.push(
      projectMarkdownImageRef(
        toolCall.id,
        toolCall.name,
        index,
        image,
        renderUrisByIndex.get(index),
        index + 1,
        assetTokensByIndex.get(index),
      ),
    );
  }

  for (const [index, image] of collectToolResultImageRecords(data).entries()) {
    const documentImage = asRecord(image['documentImage']);
    const resourceRef = documentImage?.['resourceRef'] ?? image['resourceRef'];
    refs.push(
      projectMarkdownImageRef(
        toolCall.id,
        toolCall.name,
        index,
        {
          ...(documentImage ?? {}),
          ...image,
          ...(resourceRef !== undefined ? { resourceRef } : {}),
        },
        renderUrisByIndex.get(index),
        index + 1,
        assetTokensByIndex.get(index),
      ),
    );
  }
  if (refs.length === 0) {
    refs.push(...collectMarkdownImageRefsFromPerceptionCards(toolCall, renderUrisByIndex));
  }
  return refs;
}

function collectToolResultImageInfoRecords(
  data: Record<string, unknown> | undefined,
): readonly Record<string, unknown>[] {
  if (!data) return [];
  return [
    ...readRecordArray(data, 'imageInfo'),
    ...readRecordArray(asRecord(data['excerpt']), 'imageInfo'),
  ];
}

function collectToolResultImageRecords(
  data: Record<string, unknown> | undefined,
): readonly Record<string, unknown>[] {
  if (!data) return [];
  return readRecordArray(data, 'images');
}

function collectMarkdownImageRefsFromPerceptionCards(
  toolCall: ToolCall,
  renderUrisByIndex: ReadonlyMap<number, string>,
): readonly MarkdownToolResultImageRef[] {
  return (toolCall.result?.perceptionCards ?? []).flatMap((card, index) => {
    const imageRef =
      card.perceptual?.thumbnailRef ??
      card.perceptual?.keyframeRefs?.[0] ??
      card.perceptual?.multiViewRefs?.[0];
    if (!imageRef) return [];
    const record: Record<string, unknown> = {
      label: imageRef.label ?? card.cacheKey ?? card.assetId,
      alias: imageRef.assetId,
      mimeType: imageRef.mimeType ?? card.structural.mimeType,
      width: card.structural.width,
      height: card.structural.height,
      ...(imageRef.documentResourceRef
        ? { documentResourceRef: imageRef.documentResourceRef }
        : {}),
      entryPath: imageRef.documentResourceRef?.entryPath ?? imageRef.uri,
    };
    return [
      projectMarkdownImageRef(
        toolCall.id,
        toolCall.name,
        index,
        record,
        renderUrisByIndex.get(index) ?? readRenderablePerceptionCardUri(card),
        index + 1,
        readPerceptionCardLookupTokens(card).filter(isNonEmptyString),
      ),
    ];
  });
}

function projectMarkdownImageRef(
  toolCallId: string,
  toolName: string,
  assetIndex: number,
  image: Record<string, unknown>,
  renderUri?: string,
  sequenceNumber?: number,
  extraTokens?: readonly string[],
): MarkdownToolResultImageRef {
  const locator = asRecord(image['locator']);
  const documentResourceRef =
    parseStableDocumentArchiveResourceRef(image['documentResourceRef']) ??
    parseStableDocumentArchiveResourceRef(image['resourceRef']);
  const resourceRef = parseStableResourceRef(image['resourceRef']);
  const label = readString(image, 'label');
  const alias = readString(image, 'alias');
  const sourceDocumentId =
    readString(image, 'sourceDocumentId') ?? readDocumentResourceSourceId(documentResourceRef);
  const entryPath = readString(image, 'entryPath') ?? documentResourceRef?.entryPath;
  const pageNumber =
    readFinitePositiveInteger(locator?.['pageNumber']) ??
    resolveStoryboardSourceImageNumber(alias) ??
    resolveStoryboardSourceImageNumber(label) ??
    readDocumentResourcePageNumber(documentResourceRef);
  return {
    toolCallId,
    toolName,
    assetIndex,
    batchKey: sourceDocumentId ?? `tool:${toolCallId}`,
    ...(label ? { label } : {}),
    ...(alias ? { alias } : {}),
    ...(sourceDocumentId ? { sourceDocumentId } : {}),
    ...(entryPath ? { entryPath } : {}),
    ...(readString(image, 'mimeType') ? { mimeType: readString(image, 'mimeType') } : {}),
    ...((readRenderableUri(image) ?? renderUri)
      ? { renderUri: readRenderableUri(image) ?? renderUri }
      : {}),
    ...(extraTokens && extraTokens.length > 0 ? { extraTokens } : {}),
    ...(pageNumber !== undefined ? { pageNumber } : {}),
    ...(sequenceNumber !== undefined ? { sequenceNumber } : {}),
    ...(documentResourceRef ? { documentResourceRef } : {}),
    ...(resourceRef ? { resourceRef } : {}),
    ...(readFinitePositiveInteger(image['width'])
      ? { width: readFinitePositiveInteger(image['width']) }
      : {}),
    ...(readFinitePositiveInteger(image['height'])
      ? { height: readFinitePositiveInteger(image['height']) }
      : {}),
  };
}

function createToolResultRenderUriIndex(toolCall: ToolCall): ReadonlyMap<number, string> {
  const renderUris = new Map<number, string>();
  for (const [index, attachment] of (toolCall.result?.attachments ?? []).entries()) {
    const uri = readRenderableAttachmentUri(attachment);
    if (uri) renderUris.set(index, uri);
  }
  for (const [index, card] of (toolCall.result?.perceptionCards ?? []).entries()) {
    if (renderUris.has(index)) continue;
    const uri = readRenderablePerceptionCardUri(card);
    if (uri) renderUris.set(index, uri);
  }
  return renderUris;
}

function createToolResultAssetTokenIndex(
  toolCall: ToolCall,
): ReadonlyMap<number, readonly string[]> {
  const tokensByIndex = new Map<number, string[]>();
  const addTokens = (index: number, values: readonly (string | undefined)[]): void => {
    const stableValues = values.filter(isStableResourceLookupTokenCandidate);
    if (stableValues.length === 0) return;
    tokensByIndex.set(index, uniqueStrings([...(tokensByIndex.get(index) ?? []), ...stableValues]));
  };

  for (const [index, attachment] of (toolCall.result?.attachments ?? []).entries()) {
    addTokens(index, readToolResultAttachmentLookupTokens(attachment));
  }
  for (const [index, card] of (toolCall.result?.perceptionCards ?? []).entries()) {
    addTokens(index, readPerceptionCardLookupTokens(card));
  }

  return tokensByIndex;
}

function readToolResultAttachmentLookupTokens(
  attachment: ToolResultAttachment,
): readonly (string | undefined)[] {
  return readPerceptualAssetRefLookupTokens(attachment.assetRef);
}

function readPerceptionCardLookupTokens(card: PerceptionCard): readonly (string | undefined)[] {
  return [
    card.assetId,
    card.cacheKey,
    ...readPerceptualAssetRefLookupTokens(card.perceptual?.thumbnailRef),
    ...(card.perceptual?.keyframeRefs ?? []).flatMap(readPerceptualAssetRefLookupTokens),
    ...(card.perceptual?.multiViewRefs ?? []).flatMap(readPerceptualAssetRefLookupTokens),
  ];
}

function readPerceptualAssetRefLookupTokens(
  ref: PerceptualAssetRef | undefined,
): readonly (string | undefined)[] {
  return ref ? [ref.assetId, ref.label, ref.uri, ref.documentResourceRef?.entryPath] : [];
}

function readRenderableAttachmentUri(attachment: ToolResultAttachment): string | undefined {
  const record = asRecord(attachment);
  return readRenderableUri(record) ?? readRenderableUri(asRecord(record?.['assetRef']));
}

function readRenderablePerceptionCardUri(card: PerceptionCard): string | undefined {
  return (
    readRenderableUri(asRecord(card.perceptual?.thumbnailRef)) ??
    (card.perceptual?.keyframeRefs ?? [])
      .map((ref) => readRenderableUri(asRecord(ref)))
      .find(isNonEmptyString)
  );
}

function readRenderableUri(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined;
  for (const key of [
    'renderUri',
    'previewUri',
    'preview',
    'thumbnailUrl',
    'url',
    'imageUrl',
    'src',
    'path',
    'uri',
  ]) {
    const value = readString(record, key);
    if (value && isRenderableUri(value)) return value;
  }
  return undefined;
}

function isRenderableUri(value: string): boolean {
  if (!value) return false;
  if (value.startsWith('file:') || value.startsWith('data:') || value.startsWith('blob:')) {
    return false;
  }
  if (value.startsWith('${') || isAbsolutePath(value)) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  if (value.startsWith('webview://')) return true;
  return value.includes('vscode-resource') || value.includes('vscode-webview');
}

function isStableResourceLookupTokenCandidate(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const trimmed = value.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return false;
  if (trimmed.startsWith('file:') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return false;
  }
  if (trimmed.startsWith('${') || isAbsolutePath(trimmed)) return false;
  return !isRuntimeOnlyCanvasMarkdownResourceValue(trimmed);
}

function dedupeMarkdownImageRefs(
  refs: readonly MarkdownToolResultImageRef[],
): readonly MarkdownToolResultImageRef[] {
  const seen = new Set<string>();
  const deduped: MarkdownToolResultImageRef[] = [];
  for (const ref of refs) {
    const key = markdownImageRefDedupeKey(ref);
    if (seen.has(key)) {
      const existingIndex = deduped.findIndex(
        (candidate) => markdownImageRefDedupeKey(candidate) === key,
      );
      const existing = existingIndex >= 0 ? deduped[existingIndex] : undefined;
      if (existing) {
        deduped[existingIndex] = mergeMarkdownImageRefs(existing, ref);
      }
      continue;
    }
    seen.add(key);
    deduped.push(ref);
  }
  return deduped;
}

function markdownImageRefDedupeKey(ref: MarkdownToolResultImageRef): string {
  return (
    (ref.documentResourceRef
      ? `${readDocumentResourceSourceId(ref.documentResourceRef) ?? 'unknown'}:${ref.documentResourceRef.entryPath ?? JSON.stringify(ref.documentResourceRef.locator)}`
      : undefined) ??
    (ref.resourceRef ? `${ref.resourceRef.provider}:${ref.resourceRef.id}` : undefined) ??
    `${ref.toolCallId}:${ref.assetIndex}`
  );
}

function mergeMarkdownImageRefs(
  existing: MarkdownToolResultImageRef,
  incoming: MarkdownToolResultImageRef,
): MarkdownToolResultImageRef {
  return {
    ...incoming,
    toolCallId: existing.toolCallId,
    toolName: existing.toolName,
    assetIndex: existing.assetIndex,
    batchKey: existing.batchKey,
    ...((existing.label ?? incoming.label) ? { label: existing.label ?? incoming.label } : {}),
    ...((existing.alias ?? incoming.alias) ? { alias: existing.alias ?? incoming.alias } : {}),
    ...((existing.aliasScope ?? incoming.aliasScope)
      ? { aliasScope: existing.aliasScope ?? incoming.aliasScope }
      : {}),
    ...((existing.sourceDocumentId ?? incoming.sourceDocumentId)
      ? { sourceDocumentId: existing.sourceDocumentId ?? incoming.sourceDocumentId }
      : {}),
    ...((existing.entryPath ?? incoming.entryPath)
      ? { entryPath: existing.entryPath ?? incoming.entryPath }
      : {}),
    ...((existing.mimeType ?? incoming.mimeType)
      ? { mimeType: existing.mimeType ?? incoming.mimeType }
      : {}),
    ...((existing.pageNumber ?? incoming.pageNumber)
      ? { pageNumber: existing.pageNumber ?? incoming.pageNumber }
      : {}),
    ...((existing.sequenceNumber ?? incoming.sequenceNumber)
      ? { sequenceNumber: existing.sequenceNumber ?? incoming.sequenceNumber }
      : {}),
    ...((existing.documentResourceRef ?? incoming.documentResourceRef)
      ? { documentResourceRef: existing.documentResourceRef ?? incoming.documentResourceRef }
      : {}),
    ...((existing.resourceRef ?? incoming.resourceRef)
      ? { resourceRef: existing.resourceRef ?? incoming.resourceRef }
      : {}),
    ...((existing.renderUri ?? incoming.renderUri)
      ? { renderUri: existing.renderUri ?? incoming.renderUri }
      : {}),
    extraTokens: uniqueStrings([...(existing.extraTokens ?? []), ...(incoming.extraTokens ?? [])]),
    ...((existing.width ?? incoming.width) ? { width: existing.width ?? incoming.width } : {}),
    ...((existing.height ?? incoming.height) ? { height: existing.height ?? incoming.height } : {}),
  };
}

function readDocumentResourcePageNumber(
  resourceRef: DocumentArchiveResourceRef | undefined,
): number | undefined {
  if (resourceRef?.locator?.kind === 'page' || resourceRef?.locator?.kind === 'region') {
    return resourceRef.locator.pageNumber;
  }
  return resolveStoryboardSourceImageNumber(resourceRef?.entryPath);
}

function readDocumentResourceSourceId(
  resourceRef: DocumentArchiveResourceRef | undefined,
): string | undefined {
  if (!resourceRef) return undefined;
  return (
    resourceRef.source.identity?.hash ??
    resourceRef.source.identity?.fileId ??
    resourceRef.source.fileId ??
    resourceRef.source.filePath
  );
}

function parseStableResourceRef(value: unknown): ResourceRef | undefined {
  return isResourceRef(value) ? value : undefined;
}

function parseStableDocumentArchiveResourceRef(
  value: unknown,
): DocumentArchiveResourceRef | undefined {
  return parseDocumentArchiveResourceRef(value);
}

function resolveStoryboardSourceImageNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match =
    /(?:^|[\s/:：#_.\\-])(?:p|page|pg|页|原页|来源页|source|image|img|图|图片|panel|分格)[\s_#_.:-]*(\d{1,4})(?:\b|$)/i.exec(
      value.trim(),
    );
  return parsePositiveIntegerValue(match?.[1]);
}

function fileStem(value: string): string | undefined {
  const name = value.replace(/\\/g, '/').split('/').pop();
  if (!name) return undefined;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function fileName(value: string): string | undefined {
  return value.replace(/\\/g, '/').split('/').pop();
}

function pathLookupTokens(value: string): readonly string[] {
  return [value, fileName(value), fileStem(value)].filter(isNonEmptyString);
}

function sequenceNumberLookupTokens(value: number | undefined): readonly string[] {
  if (value === undefined || !Number.isInteger(value) || value <= 0) return [];
  const zeroBased = value - 1;
  const paddedZeroBased = String(zeroBased).padStart(2, '0');
  return [
    ...(zeroBased === 0 ? ['P0', 'page_0', 'image_0'] : []),
    `P${paddedZeroBased}`,
    `page_${paddedZeroBased}`,
    `image_${paddedZeroBased}`,
  ];
}

function stripMarkdownToken(value: string): string {
  return value.trim().replace(/^`+|`+$/g, '');
}

function resourceRefLookupTokens(resourceRef: ResourceRef): readonly string[] {
  return uniqueStrings(
    [
      readResourceSourceLocalPath(resourceRef.source),
      resourceRef.source.projectRelativePath,
      resourceRef.source.document?.filePath,
      resourceRef.locator?.kind === 'file' ? resourceRef.locator.path : undefined,
      resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
    ]
      .filter(isNonEmptyString)
      .flatMap(pathLookupTokens),
  );
}

function readImageDerivedAssetTokens(ref: MarkdownToolResultImageRef): readonly string[] {
  return uniqueStrings(
    [
      ref.alias,
      ref.label,
      ref.entryPath ? fileName(ref.entryPath) : undefined,
      ref.entryPath ? fileStem(ref.entryPath) : undefined,
      ref.resourceRef ? resourceSourceFileName(ref.resourceRef.source) : undefined,
      ref.resourceRef?.source.document?.filePath
        ? fileName(ref.resourceRef.source.document.filePath)
        : undefined,
      ref.resourceRef?.locator?.kind === 'document' && ref.resourceRef.locator.entryPath
        ? fileName(ref.resourceRef.locator.entryPath)
        : undefined,
      ref.resourceRef?.locator?.kind === 'file' && ref.resourceRef.locator.path
        ? fileName(ref.resourceRef.locator.path)
        : undefined,
    ]
      .filter(isNonEmptyString)
      .map(toReadImageDerivedAssetToken)
      .filter(isNonEmptyString),
  );
}

function toReadImageDerivedAssetToken(value: string): string | undefined {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized || normalized.startsWith('read-image-')) return undefined;
  return `read-image-${normalized}`;
}

function isIgnoredResourceWord(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized === 'image' ||
    normalized === 'asset' ||
    normalized === 'resource' ||
    normalized === 'source' ||
    normalized === 'http' ||
    normalized === 'https'
  );
}

function readRecordArray(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown>[] {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readFinitePositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function parsePositiveIntegerValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function readResourceSourceLocalPath(source: ResourceSourceRef): string | undefined {
  return source.filePath ?? source.projectRelativePath ?? source.document?.filePath ?? source.uri;
}

function resourceSourceFileName(source: ResourceSourceRef): string | undefined {
  const localPath = readResourceSourceLocalPath(source);
  return localPath ? fileName(localPath) : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
