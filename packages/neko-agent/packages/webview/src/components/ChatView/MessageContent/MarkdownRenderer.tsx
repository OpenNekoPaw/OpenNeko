/**
 * MarkdownRenderer - Markdown 渲染组件
 * 支持 GFM (表格、任务列表、删除线等)
 * 支持 Mermaid 图表渲染
 */

import {
  Fragment,
  isValidElement,
  memo,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  MarkdownStreamingSession,
  projectNekoMarkdownGenerationPromptParts,
  type MarkdownDefinitionNode,
  type MarkdownNode,
  type MarkdownStreamingSnapshot,
  type MarkdownTableCellNode,
  type MarkdownTableNode,
  type NekoMarkdownGenerationPromptPartKind,
} from '@neko/markdown';
import {
  isCompositeContentFenceLanguage,
  parseCompositeContentJson,
  parseCompositeContentJsonCandidates,
  type ContentBlock,
} from '@neko-agent/types';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import {
  isCanvasStoryboardReferenceImageProcessingPrompt,
  resolveCreativeTableField,
  STORYBOARD_CREATIVE_TABLE_PROFILE,
  validateCompositeArtifact,
  type CreativeTableFieldDescriptor,
  type CompositeArtifact,
} from '@neko/shared';
import { RichContentRenderer } from '@/components/ChatView/RichContent';
import { projectCompositeBlockRichContent } from '@/presenters/composite-content-presenter';
import {
  normalizeMarkdownResourceLookupToken,
  type MarkdownResourceDiagnostic,
  type MarkdownResourceRenderingProjection,
} from '@/presenters/markdown-resource-rendering-presenter';
import { getLocale, t } from '@/i18n';
import { CodeBlock } from './CodeBlock';
import { MermaidBlock } from './MermaidBlock';
import { useAgentMarkdownSessionRegistry } from '@/markdown/agent-markdown-session-context';

type MarkdownDisplayLocale = 'en' | 'zh-cn';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
  markdownResources?: MarkdownResourceRenderingProjection;
  sessionKey: string;
  contentBlockId?: string;
  siblingBlocks?: readonly ContentBlock[];
  conversationId?: string | null;
  plugins?: PluginsAvailable;
}

interface NormalizedMarkdownRenderContext {
  readonly isStreaming: boolean;
  readonly markdownResources?: MarkdownResourceRenderingProjection;
  readonly locale: MarkdownDisplayLocale;
  readonly definitions: ReadonlyMap<string, MarkdownDefinitionNode>;
  readonly contentBlockId?: string;
  readonly siblingBlocks?: readonly ContentBlock[];
  readonly conversationId?: string | null;
  readonly plugins?: PluginsAvailable;
}

function renderNormalizedMarkdownDocument(
  snapshot: MarkdownStreamingSnapshot,
  context: Omit<NormalizedMarkdownRenderContext, 'definitions'>,
): ReactNode {
  const definitions = collectMarkdownDefinitions(snapshot.document.root);
  const renderContext: NormalizedMarkdownRenderContext = { ...context, definitions };
  return projectNormalizedMarkdownDisplayNodes(snapshot.document.root.children).map((node) =>
    renderNormalizedMarkdownNode(node, renderContext),
  );
}

const MARKDOWN_RESOURCE_INDEX_HEADING_RE =
  /^\s*(?:资源索引|图片索引|资源图片索引|resource\s+index|image\s+index|resource\s+image\s+index)\s*$/i;

function projectNormalizedMarkdownDisplayNodes(
  nodes: readonly MarkdownNode[],
): readonly MarkdownNode[] {
  const visible: MarkdownNode[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node) continue;
    if (
      node.type === 'heading' &&
      MARKDOWN_RESOURCE_INDEX_HEADING_RE.test(readNormalizedMarkdownPlainText(node))
    ) {
      const next = nodes[index + 1];
      if (next?.type === 'table' && isResourceMetadataInventoryTable(next)) {
        index += 1;
        continue;
      }
    }
    if (node.type === 'table' && shouldHideNormalizedMarkdownTable(node)) continue;
    visible.push(node);
  }
  return visible;
}

function shouldHideNormalizedMarkdownTable(node: MarkdownTableNode): boolean {
  if (isResourceMetadataInventoryTable(node)) return true;
  const fields = node.header.cells.map((cell) =>
    resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, readMarkdownTableCellText(cell)),
  );
  return node.rows.length === 0 && shouldRenderCanvasSceneStoryboardFields(fields);
}

function isResourceMetadataInventoryTable(node: MarkdownTableNode): boolean {
  const headers = node.header.cells.map((cell) =>
    normalizeMarkdownTableHeader(readMarkdownTableCellText(cell)),
  );
  if (hasStoryboardCreativeDisplayAnchors(headers)) return false;
  const hasPage = headers.some((header) =>
    ['page', 'pageno', 'pagenumber', 'sourcepage', '页', '页码', '页面', '来源页'].includes(header),
  );
  const hasAsset = headers.some((header) =>
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
  const hasSize = headers.some((header) =>
    ['size', 'dimensions', 'resolution', '尺寸', '分辨率'].includes(header),
  );
  const hasType = headers.some((header) => ['type', 'mimetype', 'mime', '类型'].includes(header));
  return (hasPage && hasAsset && hasSize) || (hasAsset && hasSize && hasType);
}

function hasStoryboardCreativeDisplayAnchors(headers: readonly string[]): boolean {
  return (
    headers.some((header) => header === 'scene' || header === '场景') &&
    headers.some((header) => header === 'shot' || header === '镜头')
  );
}

function normalizeMarkdownTableHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_\-/#:：]+/g, '');
}

function renderNormalizedMarkdownNode(
  node: MarkdownNode,
  context: NormalizedMarkdownRenderContext,
): ReactNode {
  const children =
    node.type !== 'table' &&
    node.type !== 'tableRow' &&
    node.type !== 'tableCell' &&
    'children' in node
      ? node.children.map((child) => renderNormalizedMarkdownNode(child, context))
      : undefined;
  switch (node.type) {
    case 'root':
      return <Fragment key={node.id}>{children}</Fragment>;
    case 'paragraph':
      return (
        <p key={node.id} className="mb-2 last:mb-0">
          {children}
        </p>
      );
    case 'heading': {
      const className = headingClassName(node.depth);
      if (node.depth === 1)
        return (
          <h1 key={node.id} className={className}>
            {children}
          </h1>
        );
      if (node.depth === 2)
        return (
          <h2 key={node.id} className={className}>
            {children}
          </h2>
        );
      if (node.depth === 3)
        return (
          <h3 key={node.id} className={className}>
            {children}
          </h3>
        );
      if (node.depth === 4)
        return (
          <h4 key={node.id} className={className}>
            {children}
          </h4>
        );
      if (node.depth === 5)
        return (
          <h5 key={node.id} className={className}>
            {children}
          </h5>
        );
      return (
        <h6 key={node.id} className={className}>
          {children}
        </h6>
      );
    }
    case 'blockquote':
      return (
        <blockquote
          key={node.id}
          className="border-l-2 border-[var(--vscode-textBlockQuote-border)] pl-3 my-2 text-[var(--vscode-textBlockQuote-foreground)]"
        >
          {children}
        </blockquote>
      );
    case 'list': {
      const className = `${node.kind === 'ordered' ? 'list-decimal' : 'list-disc'} list-inside mb-2 space-y-0.5`;
      return node.kind === 'ordered' ? (
        <ol key={node.id} start={node.start} className={className}>
          {children}
        </ol>
      ) : (
        <ul key={node.id} className={className}>
          {children}
        </ul>
      );
    }
    case 'listItem':
      return (
        <li key={node.id} className="text-[var(--vscode-foreground)]">
          {node.checked !== undefined && (
            <input type="checkbox" checked={node.checked} readOnly className="mr-1 align-middle" />
          )}
          {children}
        </li>
      );
    case 'codeBlock': {
      const language = node.language.normalized ?? node.language.raw;
      if (language === 'mermaid') return <MermaidBlock key={node.id} code={node.value} />;
      const structured = projectStructuredCodeBlock(node, context);
      return structured ? (
        <Fragment key={node.id}>{structured}</Fragment>
      ) : (
        <CodeBlock key={node.id} code={node.value} language={language} />
      );
    }
    case 'thematicBreak':
      return <hr key={node.id} className="my-3 border-t border-[var(--vscode-panel-border)]" />;
    case 'html':
      return (
        <code
          key={node.id}
          className="whitespace-pre-wrap text-[11px] text-[var(--vscode-descriptionForeground)]"
          data-markdown-html="inert"
        >
          {node.value}
        </code>
      );
    case 'definition':
      return null;
    case 'text':
      return node.value;
    case 'softBreak':
      return '\n';
    case 'hardBreak':
      return <br key={node.id} />;
    case 'emphasis':
      return (
        <em key={node.id} className="italic">
          {children}
        </em>
      );
    case 'strong':
      return (
        <strong key={node.id} className="font-semibold">
          {children}
        </strong>
      );
    case 'delete':
      return (
        <del key={node.id} className="line-through text-[var(--vscode-descriptionForeground)]">
          {children}
        </del>
      );
    case 'inlineCode':
      return (
        <code
          key={node.id}
          className="px-1.5 py-0.5 rounded bg-[var(--vscode-textCodeBlock-background)] text-[var(--vscode-textPreformat-foreground)] text-[12px] font-mono break-words"
        >
          {node.value}
        </code>
      );
    case 'link':
      return renderNormalizedMarkdownLink(node.id, node.destination, node.title, children);
    case 'linkReference': {
      const definition = context.definitions.get(node.identifier.toLowerCase());
      return definition ? (
        renderNormalizedMarkdownLink(node.id, definition.destination, definition.title, children)
      ) : (
        <span key={node.id} data-markdown-link-status="unresolved">
          {children}
        </span>
      );
    }
    case 'image':
      return (
        <Fragment key={node.id}>
          {renderNormalizedMarkdownImage(node.destination, node.altText, context.markdownResources)}
        </Fragment>
      );
    case 'imageReference': {
      const definition = context.definitions.get(node.identifier.toLowerCase());
      return (
        <Fragment key={node.id}>
          {definition ? (
            renderNormalizedMarkdownImage(
              definition.destination,
              node.altText,
              context.markdownResources,
            )
          ) : (
            <span data-markdown-image-status="unresolved">{node.altText}</span>
          )}
        </Fragment>
      );
    }
    case 'table':
      return renderNormalizedMarkdownTable(node, context);
    case 'tableRow':
    case 'tableCell':
      throw new Error(`Normalized Markdown ${node.type} must be rendered through its table owner.`);
    case 'nekoMention':
      return (
        <Fragment key={node.id}>
          {projectMarkdownMentionText(
            node.raw,
            context.markdownResources ?? emptyMarkdownResources(),
          )}
        </Fragment>
      );
    case 'nekoResourceReference':
      return (
        <Fragment key={node.id}>
          {projectMarkdownInlineResourceReference(
            node.raw,
            node.target,
            node.embed,
            context.markdownResources ?? emptyMarkdownResources(),
          )}
        </Fragment>
      );
  }
}

function renderNormalizedMarkdownTable(
  node: MarkdownTableNode,
  context: NormalizedMarkdownRenderContext,
): ReactNode {
  const storyboard = projectStoryboardCreativeTableNode(
    node,
    context.markdownResources,
    context.locale,
  );
  if (storyboard) return <Fragment key={node.id}>{storyboard}</Fragment>;
  return (
    <div key={node.id} className="my-2 min-w-0 max-w-full overflow-x-auto">
      <table className="w-full border-collapse text-left text-[12px]">
        <thead>
          <tr>
            {node.header.cells.map((cell) =>
              renderNormalizedMarkdownTableCell(cell, true, node, context),
            )}
          </tr>
        </thead>
        <tbody>
          {node.rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell) =>
                renderNormalizedMarkdownTableCell(cell, false, node, context),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderNormalizedMarkdownTableCell(
  cell: MarkdownTableCellNode,
  header: boolean,
  table: MarkdownTableNode,
  context: NormalizedMarkdownRenderContext,
): ReactNode {
  const children = cell.children.map((child) => renderNormalizedMarkdownNode(child, context));
  const projected = projectMarkdownResourceTokenCell(children, context.markdownResources);
  const displayValue = projectCreativeTableCellDisplayValue(cell, header, table, context.locale);
  const className = 'border border-[var(--vscode-panel-border)] px-2 py-1 align-top';
  const style = { textAlign: normalizeTableTextAlign(table.alignments[cell.columnIndex]) } as const;
  const content = displayValue ?? projected ?? children;
  return header ? (
    <th
      key={cell.id}
      className={`${className} font-semibold bg-[var(--vscode-editorWidget-background)]`}
      style={style}
    >
      {content}
    </th>
  ) : (
    <td key={cell.id} className={className} style={style}>
      {content}
    </td>
  );
}

function projectCreativeTableCellDisplayValue(
  cell: MarkdownTableCellNode,
  header: boolean,
  table: MarkdownTableNode,
  locale: MarkdownDisplayLocale,
): string | undefined {
  const headers = table.header.cells.map(readMarkdownTableCellText);
  const fields = headers.map((value) =>
    resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, value),
  );
  if (!shouldLocalizeStoryboardCreativeTable(fields)) return undefined;
  const field = fields[cell.columnIndex];
  if (!field) return undefined;
  if (header) return field.labels[locale];
  const value = stripInlineMarkdown(readMarkdownTableCellText(cell));
  return STORYBOARD_CREATIVE_TABLE_VALUE_LABELS[field.id]?.[value.toLowerCase()]?.[locale];
}

function shouldLocalizeStoryboardCreativeTable(
  fields: readonly (CreativeTableFieldDescriptor | undefined)[],
): boolean {
  const known = fields.filter(
    (field): field is CreativeTableFieldDescriptor => field !== undefined,
  );
  if (known.length < 3) return false;
  const fieldIds = new Set(known.map((field) => field.id));
  return fieldIds.has('scene') || fieldIds.has('shot');
}

const STORYBOARD_CREATIVE_TABLE_VALUE_LABELS: Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<MarkdownDisplayLocale, string>>>>>
> = {
  decision: {
    keep: { en: 'Keep', 'zh-cn': '保留' },
    skip: { en: 'Skip', 'zh-cn': '跳过' },
    merge: { en: 'Merge', 'zh-cn': '合并' },
    split: { en: 'Split', 'zh-cn': '拆分' },
    duplicate: { en: 'Duplicate', 'zh-cn': '重复' },
    'reference-only': { en: 'Reference only', 'zh-cn': '仅作参考' },
  },
  reviewStatus: {
    'needs-review': { en: 'Needs review', 'zh-cn': '待审阅' },
    'needs-panel-analysis': { en: 'Needs panel analysis', 'zh-cn': '待分析分格' },
    'needs-resource-binding': { en: 'Needs resource binding', 'zh-cn': '待绑定资源' },
    'needs-prompt': { en: 'Needs prompt', 'zh-cn': '待补提示词' },
    approved: { en: 'Approved', 'zh-cn': '已通过' },
    rejected: { en: 'Rejected', 'zh-cn': '已拒绝' },
  },
  contentType: {
    story: { en: 'Story', 'zh-cn': '正片' },
    cover: { en: 'Cover', 'zh-cn': '封面' },
    metadata: { en: 'Metadata', 'zh-cn': '元数据' },
    reference: { en: 'Reference', 'zh-cn': '参考' },
    transition: { en: 'Transition', 'zh-cn': '转场' },
  },
  requiresSplit: {
    true: { en: 'Yes', 'zh-cn': '是' },
    false: { en: 'No', 'zh-cn': '否' },
  },
};

function renderNormalizedMarkdownLink(
  key: string,
  destination: string,
  title: string | undefined,
  children: ReactNode,
): ReactNode {
  if (!isSafeMarkdownLink(destination)) {
    return (
      <span key={key} title={title} data-markdown-link-status="unsafe">
        {children}
      </span>
    );
  }
  return (
    <a
      key={key}
      href={destination}
      title={title}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--vscode-textLink-foreground)] hover:underline"
    >
      {children}
    </a>
  );
}

function renderNormalizedMarkdownImage(
  destination: string,
  altText: string,
  markdownResources: MarkdownResourceRenderingProjection | undefined,
): ReactNode {
  return (
    projectMarkdownImageResource(destination, markdownResources) ?? (
      <span
        className="my-2 inline-flex rounded border border-[var(--vscode-inputValidation-warningBorder)] bg-[var(--vscode-inputValidation-warningBackground)] px-2 py-1 text-[11px] text-[var(--vscode-inputValidation-warningForeground)]"
        data-markdown-image-status="unprojected"
      >
        {altText || destination || t('chat.markdown.image.missingSource')}
      </span>
    )
  );
}

function collectMarkdownDefinitions(
  root: MarkdownNode,
): ReadonlyMap<string, MarkdownDefinitionNode> {
  const definitions = new Map<string, MarkdownDefinitionNode>();
  const visit = (node: MarkdownNode): void => {
    if (node.type === 'definition') definitions.set(node.identifier.toLowerCase(), node);
    if ('children' in node) for (const child of node.children) visit(child);
  };
  visit(root);
  return definitions;
}

function headingClassName(depth: number): string {
  if (depth === 1) return 'text-lg font-bold mb-2 mt-4 first:mt-0 text-[var(--vscode-foreground)]';
  if (depth === 2)
    return 'text-base font-bold mb-2 mt-3 first:mt-0 text-[var(--vscode-foreground)]';
  return 'text-sm font-semibold mb-1.5 mt-2 first:mt-0 text-[var(--vscode-foreground)]';
}

function normalizeTableTextAlign(
  alignment: MarkdownTableNode['alignments'][number] | undefined,
): 'left' | 'center' | 'right' | undefined {
  return alignment === 'unspecified' ? undefined : alignment;
}

function isSafeMarkdownLink(destination: string): boolean {
  const value = destination.trim();
  if (value.startsWith('#') || value.startsWith('/')) return true;
  try {
    const url = new URL(value, 'https://neko.invalid/');
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function emptyMarkdownResources(): MarkdownResourceRenderingProjection {
  return { status: 'none', tokens: [], diagnostics: [] };
}

function projectMarkdownResourceTokenCell(
  children: ReactNode,
  markdownResources: MarkdownResourceRenderingProjection | undefined,
): ReactNode | null {
  const token = readPlainText(children);
  if (!token) return null;
  const normalizedToken = normalizeMarkdownResourceLookupToken(token);
  const projection = markdownResources?.tokens.find(
    (candidate) => normalizeMarkdownResourceLookupToken(candidate.token) === normalizedToken,
  );
  if (!projection) return null;
  if (projection.status === 'bound' && projection.renderUris.length > 0) {
    return (
      <span className="flex max-w-[28rem] flex-wrap gap-1.5 align-top">
        {projection.renderUris.slice(0, 4).map((uri, index) => (
          <img
            key={`${uri}-${index}`}
            src={uri}
            alt={projection.refs[index]?.label ?? token}
            title={projection.refs[index]?.label ?? token}
            className="max-h-40 min-h-24 w-auto max-w-[14rem] rounded border border-[var(--vscode-panel-border)] object-contain"
            loading="lazy"
          />
        ))}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-[8rem] max-w-full flex-col gap-1 align-top">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] text-[var(--vscode-foreground)]">{token}</span>
        <span
          className="rounded border border-[var(--vscode-panel-border)] px-1 py-0.5 text-[10px] text-[var(--vscode-descriptionForeground)]"
          data-markdown-resource-status={projection.status}
        >
          {markdownResourceStatusLabel(projection)}
        </span>
      </span>
      {projection.renderUris.length > 0 ? (
        <span className="flex max-w-[28rem] flex-wrap gap-1.5">
          {projection.renderUris.slice(0, 4).map((uri, index) => (
            <img
              key={`${uri}-${index}`}
              src={uri}
              alt={projection.refs[index]?.label ?? token}
              className="max-h-40 min-h-24 w-auto max-w-[14rem] rounded border border-[var(--vscode-panel-border)] object-contain"
              loading="lazy"
            />
          ))}
        </span>
      ) : null}
      {projection.diagnostics.length > 0 ? (
        <span className="text-[10px] text-[var(--vscode-errorForeground)]">
          {formatMarkdownResourceDiagnostic(projection.diagnostics[0])}
        </span>
      ) : null}
    </span>
  );
}

function projectStoryboardResourceTokenCell(
  token: string,
  markdownResources: MarkdownResourceRenderingProjection | undefined,
): ReactNode | null {
  const normalizedToken = normalizeMarkdownResourceLookupToken(token);
  const projection = markdownResources?.tokens.find(
    (candidate) => normalizeMarkdownResourceLookupToken(candidate.token) === normalizedToken,
  );
  if (!projection) return null;
  if (projection.status === 'bound' && projection.renderUris.length > 0) {
    return (
      <span className="flex max-w-full flex-wrap gap-1.5 align-top">
        {projection.renderUris.slice(0, 2).map((uri, index) => (
          <img
            key={`${uri}-${index}`}
            src={uri}
            alt={projection.refs[index]?.label ?? token}
            title={projection.refs[index]?.label ?? token}
            className="max-h-28 min-h-16 w-auto max-w-[7rem] rounded border border-[var(--vscode-panel-border)] object-contain"
            loading="lazy"
          />
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1 align-top">
      <span className="min-w-0 truncate font-mono text-[11px] text-[var(--vscode-foreground)]">
        {token}
      </span>
      <span
        className="shrink-0 rounded border border-[var(--vscode-panel-border)] px-1 py-0.5 text-[10px] text-[var(--vscode-descriptionForeground)]"
        data-markdown-resource-status={projection.status}
      >
        {markdownResourceStatusLabel(projection)}
      </span>
    </span>
  );
}

function projectMarkdownImageResource(
  src: string | undefined,
  markdownResources: MarkdownResourceRenderingProjection | undefined,
): ReactNode | null {
  if (!src) return null;
  const baseToken = stripResourcePlacementHint(src);
  const normalizedToken = normalizeMarkdownResourceLookupToken(baseToken);
  const projection = markdownResources?.tokens.find(
    (candidate) => normalizeMarkdownResourceLookupToken(candidate.token) === normalizedToken,
  );
  if (!projection) return null;
  if (projection.renderUris.length === 0) {
    return projectMarkdownResourceTokenCell(baseToken, markdownResources);
  }
  const renderUri = projection.renderUris[0];
  return (
    <span className="my-2 inline-flex max-w-full flex-col gap-1">
      <img
        src={renderUri}
        alt={projection.refs[0]?.label ?? baseToken}
        title={projection.refs[0]?.label ?? baseToken}
        className="max-w-full rounded border border-[var(--vscode-panel-border)]"
        loading="lazy"
      />
    </span>
  );
}

function projectMarkdownMentionText(
  text: string,
  markdownResources: MarkdownResourceRenderingProjection,
): readonly ReactNode[] {
  const mentionRegex = /(^|[^\p{L}\p{N}_./-])@([\p{L}\p{N}_.-]{1,80})/gu;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(mentionRegex)) {
    const full = match[0] ?? '';
    const prefix = match[1] ?? '';
    const label = match[2] ?? '';
    const start = match.index ?? 0;
    const mentionStart = start + prefix.length;
    const raw = `@${label}`;
    if (mentionStart > cursor) {
      nodes.push(text.slice(cursor, mentionStart));
    }
    const projection = findMarkdownMentionProjection(raw, label, markdownResources);
    nodes.push(
      projection ? (
        <span
          key={`${raw}:${mentionStart}`}
          className={markdownMentionClassName(projection.status)}
          data-markdown-mention="true"
          data-markdown-mention-status={projection.status}
          title={projection.ref ? `${projection.ref.kind}:${projection.ref.id}` : raw}
        >
          {raw}
        </span>
      ) : (
        raw
      ),
    );
    cursor = mentionStart + raw.length;
    if (full.length > prefix.length + raw.length) {
      nodes.push(full.slice(prefix.length + raw.length));
      cursor = start + full.length;
    }
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes.length > 0 ? nodes : [text];
}

function projectMarkdownInlineResourceReference(
  raw: string,
  target: string,
  embed: boolean,
  markdownResources: MarkdownResourceRenderingProjection,
): ReactNode {
  if (embed) {
    const imageProjection =
      projectMarkdownImageResource(target, markdownResources) ??
      projectMarkdownResourceTokenCell(stripResourcePlacementHint(target), markdownResources);
    if (imageProjection) return imageProjection;
  }
  const projection = findMarkdownResourceReferenceProjection(raw, target, markdownResources);
  return (
    <span
      className={markdownResourceReferenceClassName(projection?.status ?? 'missing')}
      data-markdown-resource-reference="true"
      data-markdown-resource-reference-status={projection?.status ?? 'missing'}
      title={projection?.ref ? `${projection.ref.kind}:${projection.ref.id}` : target}
    >
      {raw}
    </span>
  );
}

function findMarkdownResourceReferenceProjection(
  raw: string,
  target: string,
  markdownResources: MarkdownResourceRenderingProjection,
): NonNullable<MarkdownResourceRenderingProjection['resourceReferences']>[number] | undefined {
  const normalizedRaw = normalizeMarkdownResourceLookupToken(raw);
  const normalizedTarget = normalizeMarkdownResourceLookupToken(target);
  const normalizedBaseTarget = normalizeMarkdownResourceLookupToken(
    stripResourcePlacementHint(target),
  );
  return markdownResources.resourceReferences?.find(
    (reference) =>
      normalizeMarkdownResourceLookupToken(reference.raw) === normalizedRaw ||
      normalizeMarkdownResourceLookupToken(reference.target) === normalizedTarget ||
      normalizeMarkdownResourceLookupToken(reference.lookupToken) === normalizedBaseTarget,
  );
}

function markdownResourceReferenceClassName(
  status: NonNullable<MarkdownResourceRenderingProjection['resourceReferences']>[number]['status'],
): string {
  const base =
    'rounded-sm border px-1 py-[1px] font-mono text-[11px] underline decoration-2 underline-offset-[3px]';
  if (status === 'bound') {
    return `${base} border-[var(--vscode-textLink-foreground)] text-[var(--vscode-textLink-foreground)] decoration-[color-mix(in_srgb,var(--vscode-textLink-foreground)_72%,transparent)]`;
  }
  if (status === 'ambiguous') {
    return `${base} border-[var(--vscode-inputValidation-warningBorder)] text-[var(--vscode-inputValidation-warningForeground)] decoration-[var(--vscode-inputValidation-warningBorder)]`;
  }
  return `${base} border-[var(--vscode-inputValidation-errorBorder)] text-[var(--vscode-errorForeground)] decoration-[var(--vscode-inputValidation-errorBorder)]`;
}

function findMarkdownMentionProjection(
  raw: string,
  label: string,
  markdownResources: MarkdownResourceRenderingProjection,
): NonNullable<MarkdownResourceRenderingProjection['mentions']>[number] | undefined {
  const normalizedRaw = normalizeMarkdownResourceLookupToken(raw);
  const normalizedLabel = normalizeMarkdownResourceLookupToken(label);
  return markdownResources.mentions?.find(
    (mention) =>
      normalizeMarkdownResourceLookupToken(mention.raw) === normalizedRaw ||
      normalizeMarkdownResourceLookupToken(mention.label) === normalizedLabel,
  );
}

function markdownMentionClassName(
  status: NonNullable<MarkdownResourceRenderingProjection['mentions']>[number]['status'],
): string {
  const base =
    'rounded-sm border-b px-0.5 font-medium underline decoration-2 underline-offset-[3px]';
  if (status === 'bound') {
    return `${base} border-[var(--vscode-textLink-foreground)] text-[var(--vscode-textLink-foreground)] decoration-[color-mix(in_srgb,var(--vscode-textLink-foreground)_72%,transparent)]`;
  }
  if (status === 'ambiguous') {
    return `${base} border-[var(--vscode-inputValidation-warningBorder)] text-[var(--vscode-inputValidation-warningForeground)] decoration-[var(--vscode-inputValidation-warningBorder)]`;
  }
  return `${base} border-[var(--vscode-inputValidation-errorBorder)] text-[var(--vscode-errorForeground)] decoration-[var(--vscode-inputValidation-errorBorder)]`;
}

interface MarkdownTableProjection {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly fields: readonly (CreativeTableFieldDescriptor | undefined)[];
}

type StoryboardSceneColumnId =
  'shot' | 'referenceMedia' | 'imagePrompt' | 'videoPrompt' | 'duration' | 'dialogue' | 'action';

type StoryboardPromptCellKind = 'image' | 'video';

const STORYBOARD_SCENE_COLUMNS = [
  'shot',
  'referenceMedia',
  'imagePrompt',
  'videoPrompt',
  'duration',
  'dialogue',
  'action',
] as const;

const STORYBOARD_SCENE_COLUMN_WIDTHS: Record<StoryboardSceneColumnId, number> = {
  shot: 76,
  referenceMedia: 132,
  imagePrompt: 216,
  videoPrompt: 248,
  duration: 72,
  dialogue: 176,
  action: 112,
};

const STORYBOARD_SCENE_TABLE_MIN_WIDTH = STORYBOARD_SCENE_COLUMNS.reduce(
  (total, columnId) => total + STORYBOARD_SCENE_COLUMN_WIDTHS[columnId],
  0,
);

function projectStoryboardCreativeTableNode(
  node: MarkdownTableNode,
  markdownResources: MarkdownResourceRenderingProjection | undefined,
  locale: MarkdownDisplayLocale,
): ReactNode | null {
  const table = readMarkdownTableProjectionFromNode(node);
  if (!table || !shouldRenderCanvasSceneStoryboardTable(table)) return null;

  return (
    <div
      className="my-2 min-w-0 max-w-full overflow-x-auto"
      data-markdown-storyboard-scene-table="true"
    >
      <table
        className="table-fixed border-collapse text-left text-[11px] text-[var(--vscode-foreground)]"
        style={{ minWidth: STORYBOARD_SCENE_TABLE_MIN_WIDTH }}
      >
        <colgroup>
          {STORYBOARD_SCENE_COLUMNS.map((columnId) => (
            <col key={columnId} style={{ width: STORYBOARD_SCENE_COLUMN_WIDTHS[columnId] }} />
          ))}
        </colgroup>
        <thead className="bg-[var(--vscode-editorWidget-background)] text-[10px] uppercase tracking-normal text-[var(--vscode-descriptionForeground)]">
          <tr>
            {STORYBOARD_SCENE_COLUMNS.map((columnId) => (
              <th
                key={columnId}
                className="border border-[var(--vscode-panel-border)] px-2 py-1.5 font-medium"
                data-markdown-storyboard-scene-column={columnId}
              >
                {storyboardSceneColumnLabel(columnId, locale)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <MarkdownStoryboardSceneTableRow
              key={`${readCellByField(table, row, 'scene')}:${readCellByField(table, row, 'shot')}:${rowIndex}`}
              table={table}
              row={row}
              rowIndex={rowIndex}
              markdownResources={markdownResources}
              locale={locale}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkdownStoryboardSceneTableRow({
  table,
  row,
  rowIndex,
  markdownResources,
  locale,
}: {
  readonly table: MarkdownTableProjection;
  readonly row: readonly string[];
  readonly rowIndex: number;
  readonly markdownResources: MarkdownResourceRenderingProjection | undefined;
  readonly locale: MarkdownDisplayLocale;
}) {
  const shot = readCellByField(table, row, 'shot') || String(rowIndex + 1);
  const source = readCellByField(table, row, 'source');
  const imagePrompt =
    readCellByField(table, row, 'imagePrompt') || readCellByField(table, row, 'prompt');
  const videoPrompt = readCellByField(table, row, 'videoPrompt');
  const duration = readCellByField(table, row, 'duration');
  const dialogue = readCellByField(table, row, 'dialogue');
  const action =
    readCellByField(table, row, 'nextAction') ||
    deriveStoryboardSceneAction({
      source,
      imagePrompt,
      videoPrompt,
      locale,
    });

  return (
    <tr
      className="align-top text-[11px] text-[var(--vscode-foreground)] odd:bg-[color-mix(in_srgb,var(--vscode-editorWidget-background)_44%,transparent)] hover:bg-[var(--vscode-list-hoverBackground)]"
      data-markdown-storyboard-scene-row="true"
    >
      <StoryboardSceneTableCell columnId="shot">
        <span className="flex min-w-0 items-center gap-1 text-left text-[12px] font-medium text-[var(--vscode-foreground)]">
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--vscode-button-background)] text-[10px] leading-none text-[var(--vscode-button-foreground)]">
            {rowIndex + 1}
          </span>
          <span className="truncate">{shot}</span>
        </span>
      </StoryboardSceneTableCell>
      <StoryboardSceneTableCell columnId="referenceMedia">
        {source ? (
          (projectStoryboardResourceCell(source, markdownResources) ?? (
            <BoundedStoryboardSceneCellText value={source} />
          ))
        ) : (
          <BoundedStoryboardSceneCellText
            value=""
            placeholder={storyboardScenePlaceholder('referenceMedia', locale)}
          />
        )}
      </StoryboardSceneTableCell>
      <StoryboardSceneTableCell columnId="imagePrompt">
        <StoryboardPromptCellText
          kind="image"
          value={imagePrompt}
          placeholder={storyboardScenePlaceholder('imagePrompt', locale)}
        />
      </StoryboardSceneTableCell>
      <StoryboardSceneTableCell columnId="videoPrompt">
        <StoryboardPromptCellText
          kind="video"
          value={videoPrompt}
          placeholder={storyboardScenePlaceholder('videoPrompt', locale)}
        />
      </StoryboardSceneTableCell>
      <StoryboardSceneTableCell columnId="duration">
        <BoundedStoryboardSceneCellText
          value={duration}
          placeholder={storyboardScenePlaceholder('duration', locale)}
        />
      </StoryboardSceneTableCell>
      <StoryboardSceneTableCell columnId="dialogue">
        <BoundedStoryboardSceneCellText
          value={dialogue}
          placeholder={storyboardScenePlaceholder('dialogue', locale)}
        />
      </StoryboardSceneTableCell>
      <StoryboardSceneTableCell columnId="action">
        <StoryboardSceneActionPill value={action} locale={locale} />
      </StoryboardSceneTableCell>
    </tr>
  );
}

function StoryboardSceneTableCell({
  columnId,
  children,
}: {
  readonly columnId: StoryboardSceneColumnId;
  readonly children: ReactNode;
}) {
  return (
    <td
      className="border border-[var(--vscode-panel-border)] px-2 py-2"
      data-markdown-storyboard-scene-cell={columnId}
    >
      {children}
    </td>
  );
}

function StoryboardPromptCellText({
  kind,
  value,
  placeholder,
}: {
  readonly kind: StoryboardPromptCellKind;
  readonly value: string;
  readonly placeholder: string;
}) {
  if (!value) {
    return <BoundedStoryboardSceneCellText value="" placeholder={placeholder} />;
  }
  const parts = projectNekoMarkdownGenerationPromptParts(value);
  return (
    <div
      className="min-w-0 whitespace-pre-wrap break-words text-[11px] leading-[1.45] text-[var(--vscode-foreground)]"
      title={value}
      data-markdown-storyboard-prompt-cell={kind}
      data-markdown-storyboard-prompt-visual-style="subtle-inline"
    >
      {parts.map((part, index) => {
        const separator = index === 0 ? '' : ' ';
        return (
          <Fragment key={`${part.kind}:${index}:${part.text}`}>
            {separator}
            <span
              className={getStoryboardPromptPartClassName(part.kind)}
              data-markdown-storyboard-prompt-part="true"
              data-markdown-storyboard-prompt-part-kind={part.kind}
            >
              {part.text}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

function BoundedStoryboardSceneCellText({
  value,
  placeholder = '-',
}: {
  readonly value: string;
  readonly placeholder?: string;
}) {
  return (
    <div
      className="line-clamp-2 min-w-0 whitespace-pre-wrap break-words text-[11px] leading-[1.35] text-[var(--vscode-foreground)]"
      title={value || placeholder}
    >
      {value || <span className="text-[var(--vscode-descriptionForeground)]">{placeholder}</span>}
    </div>
  );
}

function getStoryboardPromptPartClassName(kind: NekoMarkdownGenerationPromptPartKind): string {
  const base =
    'rounded-sm border px-0.5 py-[1px] text-[var(--vscode-foreground)] underline decoration-2 underline-offset-[3px] box-decoration-clone';
  switch (kind) {
    case 'intent':
      return `${base} border-[color-mix(in_srgb,var(--vscode-button-background)_42%,transparent)] bg-[color-mix(in_srgb,var(--vscode-button-background)_8%,transparent)] font-medium decoration-[color-mix(in_srgb,var(--vscode-button-background)_70%,transparent)]`;
    case 'reference':
      return `${base} border-cyan-300/60 bg-cyan-50/40 decoration-cyan-400/75`;
    case 'operation':
      return `${base} border-amber-300/60 bg-amber-50/45 decoration-amber-400/80`;
    case 'camera':
      return `${base} border-blue-300/60 bg-blue-50/40 decoration-blue-400/75`;
    case 'dialogue':
      return `${base} border-indigo-300/60 bg-indigo-50/40 decoration-indigo-400/75`;
    case 'constraint':
      return `${base} border-emerald-300/60 bg-emerald-50/40 decoration-emerald-400/75`;
    case 'detail':
      return `${base} border-[color-mix(in_srgb,var(--vscode-foreground)_16%,transparent)] bg-[color-mix(in_srgb,var(--vscode-foreground)_4%,transparent)] decoration-[color-mix(in_srgb,var(--vscode-foreground)_30%,transparent)]`;
  }
}

function StoryboardSceneActionPill({
  value,
  locale,
}: {
  readonly value: string;
  readonly locale: MarkdownDisplayLocale;
}) {
  if (!value) {
    return (
      <BoundedStoryboardSceneCellText
        value=""
        placeholder={storyboardScenePlaceholder('action', locale)}
      />
    );
  }
  return (
    <span
      className="inline-flex max-w-full rounded border border-[var(--vscode-button-background)] bg-[var(--vscode-button-secondaryBackground)] px-2 py-1 text-[11px] leading-none text-[var(--vscode-button-secondaryForeground)]"
      title={value}
      data-markdown-storyboard-scene-action={value}
    >
      <span className="truncate">{value}</span>
    </span>
  );
}

function projectStoryboardResourceCell(
  value: string,
  markdownResources: MarkdownResourceRenderingProjection | undefined,
): ReactNode | null {
  const tokens = extractStoryboardResourceCellTokens(value);
  const projected = tokens.flatMap((token, index) => {
    const projection = projectStoryboardResourceTokenCell(token, markdownResources);
    return projection ? [<Fragment key={`${token}:${index}`}>{projection}</Fragment>] : [];
  });
  if (projected.length === 0) return null;
  return <span className="flex max-w-full flex-wrap gap-1.5">{projected}</span>;
}

function extractStoryboardResourceCellTokens(value: string): readonly string[] {
  const imageTargets = Array.from(value.matchAll(/!\[[^\]]*]\(([^)]+)\)/g))
    .map((match) => match[1])
    .filter((target): target is string => Boolean(target));
  if (imageTargets.length > 0) {
    return imageTargets.map(stripResourcePlacementHint);
  }
  return value
    .split(/[\s,，、;；]+/)
    .map((token) => stripInlineMarkdown(token.trim()))
    .filter(Boolean);
}

function readCellByField(
  table: MarkdownTableProjection,
  row: readonly string[],
  fieldId: string,
): string {
  const index = table.fields.findIndex((field) => field?.id === fieldId);
  return index >= 0 ? (row[index]?.trim() ?? '') : '';
}

function shouldRenderCanvasSceneStoryboardTable(table: MarkdownTableProjection): boolean {
  return shouldRenderCanvasSceneStoryboardFields(table.fields);
}

function shouldRenderCanvasSceneStoryboardFields(
  fields: readonly (CreativeTableFieldDescriptor | undefined)[],
): boolean {
  const fieldIds = new Set(fields.flatMap((field) => (field ? [field.id] : [])));
  const hasPromptFirstSurface =
    fieldIds.has('imagePrompt') ||
    fieldIds.has('videoPrompt') ||
    fieldIds.has('duration') ||
    fieldIds.has('dialogue');
  return fieldIds.has('scene') && fieldIds.has('shot') && hasPromptFirstSurface;
}

function storyboardSceneColumnLabel(
  columnId: StoryboardSceneColumnId,
  locale: MarkdownDisplayLocale,
): string {
  const labels: Record<StoryboardSceneColumnId, Record<MarkdownDisplayLocale, string>> = {
    shot: { en: 'Shot', 'zh-cn': '镜头' },
    referenceMedia: { en: 'Reference', 'zh-cn': '参考素材' },
    imagePrompt: { en: 'Image Prompt', 'zh-cn': '图片提示词' },
    videoPrompt: { en: 'Scene Video Prompt', 'zh-cn': '场景视频提示词' },
    duration: { en: 'Duration', 'zh-cn': '时长' },
    dialogue: { en: 'Dialogue', 'zh-cn': '台词' },
    action: { en: 'Action', 'zh-cn': '操作' },
  };
  return labels[columnId][locale];
}

function storyboardScenePlaceholder(
  columnId: StoryboardSceneColumnId,
  locale: MarkdownDisplayLocale,
): string {
  const labels: Partial<Record<StoryboardSceneColumnId, Record<MarkdownDisplayLocale, string>>> = {
    referenceMedia: { en: 'No reference', 'zh-cn': '无参考' },
    imagePrompt: { en: 'Not needed', 'zh-cn': '不需要' },
    videoPrompt: { en: 'None', 'zh-cn': '暂无' },
    duration: { en: '-', 'zh-cn': '-' },
    dialogue: { en: 'No dialogue', 'zh-cn': '无台词' },
    action: { en: 'None', 'zh-cn': '暂无' },
  };
  return labels[columnId]?.[locale] ?? '-';
}

function deriveStoryboardSceneAction(input: {
  readonly source: string;
  readonly imagePrompt: string;
  readonly videoPrompt: string;
  readonly locale: MarkdownDisplayLocale;
}): string {
  if (input.source && isCanvasStoryboardReferenceImageProcessingPrompt(input.imagePrompt)) {
    return input.locale === 'zh-cn' ? '处理参考素材' : 'Process reference';
  }
  if (!input.videoPrompt) {
    return input.locale === 'zh-cn' ? '优化场景视频提示词' : 'Optimize scene video prompt';
  }
  if (!input.source && input.imagePrompt) {
    return input.locale === 'zh-cn' ? '生成图片' : 'Generate image';
  }
  return input.locale === 'zh-cn' ? '生成视频' : 'Generate video';
}

function readMarkdownTableProjectionFromNode(
  node: MarkdownTableNode,
): MarkdownTableProjection | undefined {
  const headers = node.header.cells.map(readMarkdownTableCellText);
  if (headers.length < 2) return undefined;
  const rows = node.rows
    .filter((row) => row.cells.length === headers.length)
    .map((row) => row.cells.map(readMarkdownTableCellText));
  if (rows.length === 0) return undefined;
  return {
    headers,
    rows,
    fields: headers.map((header) =>
      resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, header),
    ),
  };
}

function readMarkdownTableCellText(cell: MarkdownTableCellNode): string {
  return cell.children.map(readNormalizedMarkdownPlainText).join('').trim();
}

function readNormalizedMarkdownPlainText(node: MarkdownNode): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
    case 'html':
      return node.value;
    case 'softBreak':
    case 'hardBreak':
      return '\n';
    case 'image':
    case 'imageReference':
      return node.altText;
    case 'nekoMention':
    case 'nekoResourceReference':
      return node.raw;
    case 'codeBlock':
      return node.value;
    case 'definition':
    case 'thematicBreak':
      return '';
    default:
      return 'children' in node ? node.children.map(readNormalizedMarkdownPlainText).join('') : '';
  }
}

function stripResourcePlacementHint(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z][A-Za-z0-9_.~:@/%+-]*#[A-Za-z][A-Za-z0-9_.:-]*$/.test(trimmed)) {
    return trimmed.slice(0, trimmed.indexOf('#'));
  }
  return trimmed;
}

function markdownResourceStatusLabel(
  projection: MarkdownResourceRenderingProjection['tokens'][number],
): string {
  if (projection.status === 'bound') {
    return projection.refs.length > 1
      ? t('chat.markdown.resourceStatus.images', { count: projection.refs.length })
      : t('chat.markdown.resourceStatus.image');
  }
  if (projection.status === 'ambiguous') {
    const candidateCount = projection.diagnostics[0]?.candidates?.length;
    return candidateCount
      ? t('chat.markdown.resourceStatus.candidates', { count: candidateCount })
      : t('chat.markdown.resourceStatus.ambiguous');
  }
  if (projection.status === 'missing') return t('chat.markdown.resourceStatus.missing');
  if (projection.status === 'unsupported') return t('chat.markdown.resourceStatus.unsupported');
  return t('chat.markdown.resourceStatus.unbound');
}

function readPlainText(node: ReactNode): string | undefined {
  if (typeof node === 'string' || typeof node === 'number') {
    const value = String(node).trim();
    return value.length > 0 ? value : undefined;
  }
  if (Array.isArray(node)) {
    const parts = node.map(readPlainText);
    if (parts.some((part) => part === undefined)) return undefined;
    const value = parts.join('').trim();
    return value.length > 0 ? value : undefined;
  }
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) {
    return readPlainText(node.props.children);
  }
  return undefined;
}

function projectStructuredCodeBlock(
  node: Extract<MarkdownNode, { readonly type: 'codeBlock' }>,
  context: NormalizedMarkdownRenderContext,
) {
  const language = node.language.normalized ?? node.language.raw;
  if (!isCompositeContentFenceLanguage(language)) return null;

  const derivedComposites = (context.siblingBlocks ?? [])
    .filter((block) => {
      const source = block.compositeSource;
      return (
        block.type === 'composite' &&
        block.composite !== undefined &&
        source !== undefined &&
        source.sourceBlockId === context.contentBlockId &&
        source.startOffset === node.range.startOffset &&
        source.endOffset === node.range.endOffset
      );
    })
    .sort(
      (left, right) =>
        (left.compositeSource?.candidateIndex ?? 0) - (right.compositeSource?.candidateIndex ?? 0),
    )
    .flatMap((block) => (block.composite ? [block.composite] : []));
  const composites =
    derivedComposites.length > 0 ? derivedComposites : parseCompositeContentJson(node.value);
  const artifacts = composites.length === 0 ? parseCompositeArtifacts(node.value) : [];
  if (composites.length === 0 && artifacts.length === 0) {
    if (!context.isStreaming || !shouldTreatAsStreamingStructuredArtifact(node.value, language)) {
      return null;
    }
    return <StructuredArtifactPending />;
  }

  return (
    <div className="my-2 flex flex-col gap-2">
      {composites.map((composite, index) => {
        const richContent = projectCompositeBlockRichContent({
          composite,
          plugins: context.plugins,
        });
        return (
          <RichContentRenderer
            key={`${composite.template}-${composite.title ?? 'artifact'}-${index}`}
            kind={richContent.kind}
            data={richContent.data}
            conversationId={context.conversationId}
          />
        );
      })}
      {artifacts.map((artifact) => (
        <RichContentRenderer
          key={artifact.artifactId}
          kind="composite-artifact"
          data={artifact}
          conversationId={context.conversationId}
        />
      ))}
    </div>
  );
}

function parseCompositeArtifacts(code: string): readonly CompositeArtifact[] {
  return parseCompositeContentJsonCandidates(code).filter(isValidCompositeArtifact);
}

function isValidCompositeArtifact(value: unknown): value is CompositeArtifact {
  return validateCompositeArtifact(value).ok;
}

function shouldTreatAsStreamingStructuredArtifact(code: string, language?: string): boolean {
  if (language !== 'json') return true;
  return /"kind"\s*:\s*"(?:composite-artifact|storyboard-table)"/i.test(code);
}

function StructuredArtifactPending() {
  return (
    <div className="my-2 rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] px-3 py-2 text-[12px] text-[var(--vscode-descriptionForeground)]">
      <span className="inline-block h-2 w-2 rounded-full bg-[var(--vscode-charts-blue)] align-middle animate-pulse" />
      <span className="ml-2 align-middle">{t('chat.structuredArtifact.generating')}</span>
    </div>
  );
}

function CreativeDraftDiagnostics({
  content,
  markdownResources,
}: {
  readonly content: string;
  readonly markdownResources?: MarkdownResourceRenderingProjection;
}) {
  const storyboardReferenceTokens = collectStoryboardReferenceResourceTokens(content);
  const diagnostics =
    markdownResources?.status === 'diagnostic'
      ? markdownResources.diagnostics
          .filter((diagnostic) => diagnostic.severity === 'error')
          .filter((diagnostic) => !isSemanticPromptDiagnostic(diagnostic))
          .filter(
            (diagnostic) =>
              !isStoryboardReferenceResourceDiagnostic(diagnostic, storyboardReferenceTokens),
          )
          .slice(0, 3)
      : [];
  if (diagnostics.length === 0) return null;

  return (
    <div
      role="alert"
      className="mt-2 rounded border border-[var(--vscode-inputValidation-errorBorder)] bg-[var(--vscode-inputValidation-errorBackground)] px-2 py-1.5 text-[11px] text-[var(--vscode-inputValidation-errorForeground)]"
    >
      {diagnostics.map((diagnostic, index) => (
        <div key={`${diagnostic.code}-${diagnostic.token ?? 'markdown'}-${index}`}>
          {formatMarkdownResourceDiagnostic(diagnostic)}
        </div>
      ))}
    </div>
  );
}

const STORYBOARD_REFERENCE_RESOURCE_DIAGNOSTIC_CODES = new Set([
  'ambiguous-resource-token',
  'missing-resource-context',
  'missing-resource-token',
]);

function collectStoryboardReferenceResourceTokens(markdown: string): ReadonlySet<string> {
  const tokens = new Set<string>();
  const lines = markdown.split(/\r?\n/);
  let inFence = false;

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index] ?? '';
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const headers = parseMarkdownTableCells(line);
    const separator = parseMarkdownTableCells(lines[index + 1] ?? '');
    if (!headers || !separator || !isMarkdownTableSeparator(separator)) continue;

    const fields = headers.map((header) =>
      resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, header),
    );
    if (!shouldRenderCanvasSceneStoryboardFields(fields)) continue;

    const sourceIndexes = fields
      .map((field, fieldIndex) => (field?.id === 'source' ? fieldIndex : -1))
      .filter((fieldIndex) => fieldIndex >= 0);
    if (sourceIndexes.length === 0) continue;

    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const cells = parseMarkdownTableCells(lines[rowIndex] ?? '');
      if (!cells) break;
      for (const sourceIndex of sourceIndexes) {
        for (const token of extractStoryboardResourceCellTokens(cells[sourceIndex] ?? '')) {
          tokens.add(normalizeMarkdownResourceLookupToken(token));
        }
      }
    }
  }

  return tokens;
}

function isStoryboardReferenceResourceDiagnostic(
  diagnostic: MarkdownResourceDiagnostic,
  storyboardReferenceTokens: ReadonlySet<string>,
): boolean {
  return Boolean(
    diagnostic.token &&
    STORYBOARD_REFERENCE_RESOURCE_DIAGNOSTIC_CODES.has(diagnostic.code) &&
    storyboardReferenceTokens.has(normalizeMarkdownResourceLookupToken(diagnostic.token)),
  );
}

function SemanticPromptSpanProjectionList({
  content,
  markdownResources,
}: {
  readonly content: string;
  readonly markdownResources?: MarkdownResourceRenderingProjection;
}) {
  const spans = markdownResources?.promptSpans ?? [];
  if (spans.length === 0) return null;

  return (
    <div className="mt-2 flex max-w-full flex-wrap gap-1.5" data-markdown-prompt-spans="true">
      {spans.map((span, index) => (
        <SemanticPromptSpanChip
          key={`${span.kind}:${span.range.startOffset}:${span.range.endOffset}:${span.fieldId ?? index}`}
          content={content}
          span={span}
        />
      ))}
    </div>
  );
}

function SemanticPromptSpanChip({
  content,
  span,
}: {
  readonly content: string;
  readonly span: NonNullable<MarkdownResourceRenderingProjection['promptSpans']>[number];
}) {
  const sourceText = readPromptSpanSourceText(content, span);
  const displayLabel = span.label ?? sourceText ?? span.kind;
  const title = formatPromptSpanTitle(span, sourceText);

  return (
    <span
      className="inline-flex min-h-6 max-w-full items-center gap-1 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] px-1.5 py-0.5 text-[11px] text-[var(--vscode-foreground)] border-b-2"
      style={{ borderBottomColor: promptSpanColor(span) }}
      title={title}
      data-markdown-prompt-span="true"
      data-markdown-prompt-span-kind={span.kind}
      data-markdown-prompt-span-field-id={span.fieldId}
      data-markdown-prompt-span-ref-kind={span.ref?.kind}
      data-markdown-prompt-span-ref-id={span.ref?.id}
      data-markdown-prompt-span-ref-namespace={span.ref?.namespace}
      data-markdown-prompt-span-range={`${span.range.startOffset}:${span.range.endOffset}`}
      data-canvas-handoff-ref-kind={span.ref?.kind}
      data-canvas-handoff-ref-id={span.ref?.id}
      data-canvas-handoff-ref-namespace={span.ref?.namespace}
    >
      <span className="max-w-[14rem] truncate underline decoration-[var(--vscode-descriptionForeground)] underline-offset-2">
        {displayLabel}
      </span>
      {span.fieldId ? (
        <span className="max-w-[10rem] truncate font-mono text-[10px] text-[var(--vscode-descriptionForeground)]">
          {span.fieldId}
        </span>
      ) : null}
      {span.ref ? (
        <span className="max-w-[10rem] truncate font-mono text-[10px] text-[var(--vscode-descriptionForeground)]">
          @{span.ref.id}
        </span>
      ) : null}
    </span>
  );
}

function SemanticPromptSpanDiagnostics({
  markdownResources,
}: {
  readonly markdownResources?: MarkdownResourceRenderingProjection;
}) {
  const diagnostics =
    markdownResources?.diagnostics.filter(isSemanticPromptDiagnostic).slice(0, 3) ?? [];
  if (diagnostics.length === 0) return null;

  const hasError = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  return (
    <div
      role={hasError ? 'alert' : 'note'}
      className={`mt-2 rounded border px-2 py-1.5 text-[11px] ${
        hasError
          ? 'border-[var(--vscode-inputValidation-errorBorder)] bg-[var(--vscode-inputValidation-errorBackground)] text-[var(--vscode-inputValidation-errorForeground)]'
          : 'border-[var(--vscode-inputValidation-warningBorder)] bg-[var(--vscode-inputValidation-warningBackground)] text-[var(--vscode-inputValidation-warningForeground)]'
      }`}
    >
      {diagnostics.map((diagnostic, index) => (
        <div key={`${diagnostic.code}-${diagnostic.token ?? 'prompt-span'}-${index}`}>
          {formatMarkdownResourceDiagnostic(diagnostic)}
        </div>
      ))}
    </div>
  );
}

function readPromptSpanSourceText(
  content: string,
  span: NonNullable<MarkdownResourceRenderingProjection['promptSpans']>[number],
): string | undefined {
  if (
    span.range.startOffset < 0 ||
    span.range.endOffset <= span.range.startOffset ||
    span.range.endOffset > content.length
  ) {
    return undefined;
  }
  const value = content.slice(span.range.startOffset, span.range.endOffset).trim();
  return value.length > 0 ? value : undefined;
}

function formatPromptSpanTitle(
  span: NonNullable<MarkdownResourceRenderingProjection['promptSpans']>[number],
  sourceText: string | undefined,
): string {
  return [
    span.tooltip,
    sourceText ? `source: ${sourceText}` : undefined,
    span.fieldId ? `field: ${span.fieldId}` : undefined,
    span.ref ? `ref: ${span.ref.kind}:${span.ref.id}` : undefined,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n');
}

function promptSpanColor(
  span: NonNullable<MarkdownResourceRenderingProjection['promptSpans']>[number],
): string {
  const tone = (span.tone ?? span.kind).toLowerCase();
  if (tone.includes('scene') || tone.includes('location')) return 'var(--vscode-charts-green)';
  if (tone.includes('character') || tone.includes('entity')) return 'var(--vscode-charts-purple)';
  if (tone.includes('voice') || tone.includes('audio') || tone.includes('dialogue')) {
    return 'var(--vscode-charts-yellow)';
  }
  if (tone.includes('resource') || tone.includes('media') || tone.includes('asset')) {
    return 'var(--vscode-charts-orange)';
  }
  if (tone.includes('style')) return 'var(--vscode-charts-red)';
  return 'var(--vscode-charts-blue)';
}

function MarkdownRendererComponent({
  content,
  isStreaming = false,
  className,
  markdownResources,
  sessionKey,
  contentBlockId,
  siblingBlocks,
  conversationId,
  plugins,
}: MarkdownRendererProps) {
  const locale = normalizeMarkdownDisplayLocale(getLocale());
  const snapshot = useCanonicalMarkdownSnapshot({ content, isStreaming, sessionKey });
  const renderedDocument = useMemo(
    () =>
      renderNormalizedMarkdownDocument(snapshot, {
        isStreaming,
        markdownResources,
        locale,
        contentBlockId,
        siblingBlocks,
        conversationId,
        plugins,
      }),
    [
      contentBlockId,
      conversationId,
      isStreaming,
      locale,
      markdownResources,
      plugins,
      siblingBlocks,
      snapshot,
    ],
  );

  return (
    <div
      className={`markdown-content min-w-0 max-w-full overflow-hidden text-[13px] leading-relaxed break-words ${className || ''}`}
      data-markdown-session-id={snapshot.sessionId}
      data-markdown-revision={snapshot.revision}
      data-markdown-final={snapshot.isFinal ? 'true' : 'false'}
    >
      {renderedDocument}
      <SemanticPromptSpanProjectionList content={content} markdownResources={markdownResources} />
      <SemanticPromptSpanDiagnostics markdownResources={markdownResources} />
      <MarkdownExtensionDiagnostics markdownResources={markdownResources} />
      <CreativeDraftDiagnostics content={content} markdownResources={markdownResources} />
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 ml-1 bg-[var(--vscode-foreground)] animate-pulse" />
      )}
    </div>
  );
}

function useCanonicalMarkdownSnapshot(input: {
  readonly content: string;
  readonly isStreaming: boolean;
  readonly sessionKey: string;
}): MarkdownStreamingSnapshot {
  const registry = useAgentMarkdownSessionRegistry();
  const subscribe = useMemo(
    () => (listener: () => void) => registry.subscribe(input.sessionKey, listener),
    [input.sessionKey, registry],
  );
  const getSnapshot = useMemo(
    () => () => registry.getSnapshot(input.sessionKey),
    [input.sessionKey, registry],
  );
  const timelineSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => {
    if (timelineSnapshot) {
      if (timelineSnapshot.source !== input.content) {
        throw new Error(
          `Normalized Markdown source mismatch for ${input.sessionKey}: Timeline revision ${timelineSnapshot.revision} exposes ${timelineSnapshot.source.length} characters while rendered content exposes ${input.content.length}.`,
        );
      }
      return timelineSnapshot;
    }
    if (input.isStreaming) {
      throw new Error(
        `Normalized Markdown streaming session is missing for ${input.sessionKey}; active streaming must be Timeline-owned.`,
      );
    }
    return createLocalMarkdownSnapshot(input.content);
  }, [input.content, input.isStreaming, input.sessionKey, timelineSnapshot]);
}

function createLocalMarkdownSnapshot(content: string): MarkdownStreamingSnapshot {
  const session = new MarkdownStreamingSession();
  const result = session.finalize(content);
  if (result.status === 'ready') return result.snapshot;
  throw new Error(
    `Normalized Markdown local session failed: ${result.diagnostics
      .map((diagnostic) => diagnostic.code)
      .join('; ')}.`,
  );
}

// Memoize to prevent unnecessary re-renders during streaming
export const MarkdownRenderer = memo(MarkdownRendererComponent);

function MarkdownExtensionDiagnostics({
  markdownResources,
}: {
  readonly markdownResources?: MarkdownResourceRenderingProjection;
}) {
  const diagnostics =
    markdownResources?.diagnostics
      .filter((diagnostic) => diagnostic.code === 'MD_RESOURCE_REFERENCE_UNSUPPORTED')
      .slice(0, 3) ?? [];
  if (diagnostics.length === 0) return null;

  return (
    <div
      role="note"
      className="mt-2 rounded border border-[var(--vscode-inputValidation-warningBorder)] bg-[var(--vscode-inputValidation-warningBackground)] px-2 py-1.5 text-[11px] text-[var(--vscode-inputValidation-warningForeground)]"
    >
      {diagnostics.map((diagnostic, index) => (
        <div key={`${diagnostic.code}-${diagnostic.token ?? 'embed'}-${index}`}>
          {formatMarkdownResourceDiagnostic(diagnostic)}
        </div>
      ))}
    </div>
  );
}

function normalizeMarkdownDisplayLocale(locale: string | undefined): MarkdownDisplayLocale {
  return locale?.trim().toLowerCase().startsWith('zh') ? 'zh-cn' : 'en';
}

function parseMarkdownTableCells(line: string): readonly string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return undefined;
  const withoutLeading = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const withoutTrailing = withoutLeading.endsWith('|')
    ? withoutLeading.slice(0, -1)
    : withoutLeading;
  const cells = withoutTrailing.split('|').map((cell) => cell.trim());
  return cells.length > 1 ? cells : undefined;
}

function isMarkdownTableSeparator(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function stripInlineMarkdown(value: string): string {
  return value.replace(/^`(.+)`$/, '$1').trim();
}

function formatMarkdownResourceDiagnostic(
  diagnostic: MarkdownResourceDiagnostic | undefined,
): string {
  if (!diagnostic) return '';
  const token = diagnostic.token ?? '';
  if (diagnostic.code === 'missing-resource-token') {
    return t('chat.markdown.diagnostic.missingResourceToken', { token });
  }
  if (diagnostic.code === 'missing-resource-context') {
    return t('chat.markdown.diagnostic.missingResourceContext', { token });
  }
  if (diagnostic.code === 'ambiguous-resource-token') {
    return t('chat.markdown.diagnostic.ambiguousResourceToken', { token });
  }
  if (diagnostic.code === 'MD_RESOURCE_REFERENCE_UNSUPPORTED') {
    return t('chat.markdown.diagnostic.unsupportedResourceReference');
  }
  return diagnostic.message;
}

function isSemanticPromptDiagnostic(diagnostic: MarkdownResourceDiagnostic): boolean {
  const code = diagnostic.code.toLowerCase();
  return code.includes('prompt-span') || code.includes('semantic-prompt');
}
