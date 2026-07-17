import {
  type CanvasMarkdownCapabilityTarget,
  type CanvasMarkdownResourceRef,
  isRuntimeOnlyCanvasMarkdownResourceValue,
} from '@neko/shared';
import type {
  CanvasAuthoringHandoffDiagnostic,
  CanvasAuthoringHandoffPromptSpan,
  CanvasAuthoringHandoffSourceRange,
  CanvasAuthoringHandoffStableRef,
  PluginTransferProvenance,
  PluginTransferTargetRef,
} from '@neko-agent/types';
import type { MarkdownSourceRange } from '@neko/markdown';
import type { MarkdownResourceRenderingProjection } from './markdown-resource-rendering-presenter';

export interface CanvasMarkdownHandoffRequest {
  readonly markdown: string;
  readonly title?: string;
  readonly sourceFormat?:
    'markdown' | 'markdown-table' | 'gfm-table' | 'resource-reference-markdown';
  readonly resources?: readonly CanvasMarkdownResourceRef[];
  readonly stableRefs?: readonly CanvasAuthoringHandoffStableRef[];
  readonly diagnostics?: readonly CanvasAuthoringHandoffDiagnostic[];
  readonly promptSpans?: readonly CanvasAuthoringHandoffPromptSpan[];
  readonly target?: CanvasMarkdownCapabilityTarget;
  readonly provenance?: PluginTransferProvenance;
  readonly userIntent?: string;
  readonly declaredIntentHint?: 'auto' | 'note' | 'table' | 'creative-table';
  readonly declaredProfileHint?: string;
}

export interface ProjectCanvasMarkdownHandoffRequestOptions {
  readonly markdown: string;
  readonly markdownResources?: MarkdownResourceRenderingProjection;
  readonly target?: PluginTransferTargetRef;
  readonly provenance?: PluginTransferProvenance;
  readonly title?: string;
  readonly userIntent?: string;
  readonly declaredIntentHint?: CanvasMarkdownHandoffRequest['declaredIntentHint'];
  readonly declaredProfileHint?: string;
}

export function projectCanvasMarkdownHandoffRequest(
  options: ProjectCanvasMarkdownHandoffRequestOptions,
): CanvasMarkdownHandoffRequest | null {
  const markdown = options.markdown.trim();
  if (!markdown) return null;

  const handoffKind = inferCanvasMarkdownHandoffKind(markdown);
  if (!handoffKind) return null;

  const resources = projectCanvasMarkdownResources(options.markdownResources);
  const stableRefs = projectCanvasMarkdownStableRefs(options.markdownResources);
  const diagnostics = projectCanvasMarkdownDiagnostics(options.markdownResources);
  const promptSpans = projectCanvasMarkdownPromptSpans(options.markdownResources);
  const target = projectCanvasMarkdownTarget(options.target);
  const provenance = projectCanvasMarkdownProvenance(options.provenance);
  const declaredIntentHint = options.declaredIntentHint ?? handoffKind.declaredIntentHint;
  const declaredProfileHint = options.declaredProfileHint ?? handoffKind.declaredProfileHint;

  return {
    markdown,
    sourceFormat: 'gfm-table',
    ...(options.title ? { title: options.title } : {}),
    ...(options.userIntent ? { userIntent: options.userIntent } : {}),
    ...(declaredIntentHint ? { declaredIntentHint } : {}),
    ...(declaredProfileHint ? { declaredProfileHint } : {}),
    ...(resources.length > 0 ? { resources } : {}),
    ...(stableRefs.length > 0 ? { stableRefs } : {}),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    ...(promptSpans.length > 0 ? { promptSpans } : {}),
    ...(target ? { target } : {}),
    ...(provenance ? { provenance } : {}),
  };
}

function projectCanvasMarkdownStableRefs(
  projection: MarkdownResourceRenderingProjection | undefined,
): readonly CanvasAuthoringHandoffStableRef[] {
  if (!projection) return [];
  const byKey = new Map<string, CanvasAuthoringHandoffStableRef>();
  for (const mention of projection.mentions ?? []) {
    if (!mention.ref) continue;
    const ref = {
      ...mention.ref,
      token: mention.raw,
    };
    byKey.set(canvasAuthoringStableRefKey(ref), ref);
  }
  return Array.from(byKey.values());
}

function projectCanvasMarkdownDiagnostics(
  projection: MarkdownResourceRenderingProjection | undefined,
): readonly CanvasAuthoringHandoffDiagnostic[] {
  return (
    projection?.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.token ? { token: diagnostic.token } : {}),
      ...(diagnostic.range ? { range: projectCanvasMarkdownSourceRange(diagnostic.range) } : {}),
    })) ?? []
  );
}

function projectCanvasMarkdownPromptSpans(
  projection: MarkdownResourceRenderingProjection | undefined,
): readonly CanvasAuthoringHandoffPromptSpan[] {
  return (
    projection?.promptSpans?.map((span) => ({
      kind: span.kind,
      range: projectCanvasMarkdownSourceRange(span.range),
      ...(span.fieldId ? { fieldId: span.fieldId } : {}),
      ...(span.label ? { label: span.label } : {}),
      ...(span.ref ? { ref: span.ref } : {}),
      ...(span.tone ? { tone: span.tone } : {}),
      ...(span.tooltip ? { tooltip: span.tooltip } : {}),
    })) ?? []
  );
}

function projectCanvasMarkdownSourceRange(
  range: MarkdownSourceRange,
): CanvasAuthoringHandoffSourceRange {
  return {
    start: range.startOffset,
    end: range.endOffset,
  };
}

function projectCanvasMarkdownResources(
  projection: MarkdownResourceRenderingProjection | undefined,
): readonly CanvasMarkdownResourceRef[] {
  if (!projection) return [];
  const byKey = new Map<string, CanvasMarkdownResourceRef>();
  for (const token of projection.tokens) {
    for (const resource of token.resources) {
      if (!isSafeCanvasMarkdownHandoffResource(resource)) continue;
      const key = canvasMarkdownResourceKey(resource);
      if (!byKey.has(key)) byKey.set(key, resource);
    }
  }
  return Array.from(byKey.values());
}

function isSafeCanvasMarkdownHandoffResource(resource: CanvasMarkdownResourceRef): boolean {
  if (resource.token && isRuntimeOnlyCanvasMarkdownResourceValue(resource.token)) return false;
  if (resource.sourcePath && isRuntimeOnlyCanvasMarkdownResourceValue(resource.sourcePath)) {
    return false;
  }
  return true;
}

interface CanvasMarkdownHandoffKind {
  readonly declaredIntentHint?: CanvasMarkdownHandoffRequest['declaredIntentHint'];
  readonly declaredProfileHint?: string;
}

function inferCanvasMarkdownHandoffKind(markdown: string): CanvasMarkdownHandoffKind | null {
  const tables = extractGfmTables(markdown);
  const handoffTables = tables.filter(
    (table) => table.rowCount > 0 && !isResourceMetadataInventoryTable(table.headers),
  );
  if (handoffTables.length === 0) return null;
  return {};
}

interface GfmTableSummary {
  readonly headers: readonly string[];
  readonly rowCount: number;
}

function extractGfmTables(markdown: string): readonly GfmTableSummary[] {
  const lines = markdown.split(/\r?\n/);
  const tables: GfmTableSummary[] = [];
  let inFence = false;

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index] ?? '';
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const next = lines[index + 1] ?? '';
    if (looksLikeTableRow(line) && looksLikeDividerRow(next)) {
      const headers = parseTableCells(line);
      let rowCount = 0;
      let rowIndex = index + 2;
      for (; rowIndex < lines.length; rowIndex += 1) {
        if (!looksLikeTableRow(lines[rowIndex] ?? '')) break;
        const cells = parseTableCells(lines[rowIndex] ?? '');
        if (cells.length !== headers.length) break;
        if (cells.some((cell) => cell.length > 0)) rowCount += 1;
      }
      tables.push({ headers, rowCount });
      index = rowIndex - 1;
    }
  }

  return tables;
}

function isResourceMetadataInventoryTable(headers: readonly string[]): boolean {
  const normalizedHeaders = headers.map(normalizeTableHeader);
  if (hasStoryboardCreativeAnchors(normalizedHeaders)) return false;

  const hasPage = normalizedHeaders.some((header) =>
    ['page', 'pageno', 'pagenumber', 'sourcepage', '页', '页码', '页面', '来源页'].includes(header),
  );
  const hasAsset = normalizedHeaders.some((header) =>
    [
      'asset',
      'assetid',
      'resource',
      'resourceid',
      'image',
      'imageid',
      'source',
      'token',
      '感知卡',
      '图片卡片',
      '资源',
      '素材',
      '来源',
    ].includes(header),
  );
  const hasSize = normalizedHeaders.some((header) =>
    ['size', 'dimensions', 'resolution', '尺寸', '分辨率'].includes(header),
  );
  const hasType = normalizedHeaders.some((header) =>
    ['type', 'mimetype', 'mime', '类型'].includes(header),
  );

  return (hasPage && hasAsset && hasSize) || (hasAsset && hasSize && hasType);
}

function hasStoryboardCreativeAnchors(normalizedHeaders: readonly string[]): boolean {
  const hasScene = normalizedHeaders.some((header) => header === 'scene' || header === '场景');
  const hasShot = normalizedHeaders.some((header) => header === 'shot' || header === '镜头');
  return hasScene && hasShot;
}

function normalizeTableHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_\-/#:：]+/g, '');
}

function looksLikeTableRow(line: string): boolean {
  return line.includes('|') && parseTableCells(line).length > 1;
}

function looksLikeDividerRow(line: string): boolean {
  const cells = parseTableCells(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim();
  const withoutLeading = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const withoutTrailing = withoutLeading.endsWith('|')
    ? withoutLeading.slice(0, -1)
    : withoutLeading;
  return withoutTrailing.split('|').map((cell) => stripInlineMarkdown(cell.trim()));
}

function stripInlineMarkdown(value: string): string {
  return value.replace(/^`(.+)`$/, '$1').trim();
}

function projectCanvasMarkdownTarget(
  target: PluginTransferTargetRef | undefined,
): CanvasMarkdownCapabilityTarget | undefined {
  if (!target) return undefined;
  const { plugin: _plugin, ...rest } = target;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function projectCanvasMarkdownProvenance(
  provenance: PluginTransferProvenance | undefined,
): PluginTransferProvenance | undefined {
  if (!provenance) return undefined;
  const { metadata: _metadata, ...rest } = provenance;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function canvasMarkdownResourceKey(resource: CanvasMarkdownResourceRef): string {
  return (
    (resource.resourceRef
      ? `resource:${resource.resourceRef.provider}:${resource.resourceRef.id}`
      : undefined) ??
    (resource.documentResourceRef
      ? `document:${resource.documentResourceRef.source.filePath}:${resource.documentResourceRef.entryPath ?? JSON.stringify(resource.documentResourceRef.locator)}`
      : undefined) ??
    (resource.sourcePath ? `path:${resource.sourcePath}` : undefined) ??
    `token:${resource.token ?? ''}`
  );
}

function canvasAuthoringStableRefKey(ref: CanvasAuthoringHandoffStableRef): string {
  return `${ref.namespace ?? 'default'}:${ref.kind}:${ref.id}:${ref.token ?? ''}`;
}
