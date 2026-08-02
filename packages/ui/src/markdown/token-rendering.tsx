import type React from 'react';
import type { NekoMarkdownExtensionProjection } from '@neko/markdown';
import type {
  MarkdownRenderableToken,
  MarkdownRenderableTokenKind,
  MarkdownSemanticSpan,
  MarkdownTokenRenderer,
} from './types';
import { cn } from '../utils';

export interface MarkdownInlineTokenRenderOptions {
  readonly className?: string;
  readonly placeholder?: string;
  readonly placeholderClassName?: string;
  readonly spanVariant?: 'compact' | 'editor';
  readonly renderToken?: MarkdownTokenRenderer;
}

export function createMarkdownRenderableTokens({
  value,
  projection,
  semanticSpans,
}: {
  readonly value: string;
  readonly projection: NekoMarkdownExtensionProjection;
  readonly semanticSpans: readonly MarkdownSemanticSpan[];
}): readonly MarkdownRenderableToken[] {
  const candidates: MarkdownRenderableToken[] = [
    ...projection.images.map((image) => ({
      kind: 'commonmark-image' as const,
      start: image.range.startOffset,
      end: image.range.endOffset,
      raw: value.slice(image.range.startOffset, image.range.endOffset),
      display: image.altText || image.lookupToken,
      title: image.rawTarget,
    })),
    ...projection.resourceReferences.map((reference) => ({
      kind: 'resource-reference' as const,
      start: reference.range.startOffset,
      end: reference.range.endOffset,
      raw: reference.raw,
      display: reference.target,
      title: reference.target,
      embed: reference.embed,
      status: reference.status,
    })),
    ...projection.mentions.map((mention) => ({
      kind: 'mention' as const,
      start: mention.range.startOffset,
      end: mention.range.endOffset,
      raw: mention.raw,
      display: mention.raw,
      title: mention.ref ? `${mention.ref.kind}:${mention.ref.id}` : mention.raw,
      status: mention.status,
    })),
    ...semanticSpans.map((span) => ({
      kind: 'semantic-span' as const,
      start: span.range.startOffset,
      end: span.range.endOffset,
      raw: value.slice(span.range.startOffset, span.range.endOffset),
      display: value.slice(span.range.startOffset, span.range.endOffset),
      title: span.tooltip ?? span.label ?? span.kind,
      span,
    })),
    ...extractMarkdownStyleTokens(value),
  ];

  return normalizeNonOverlappingTokens(value, candidates);
}

export function renderMarkdownInlineSegments({
  value,
  tokens,
  renderToken,
  spanVariant = 'compact',
}: {
  readonly value: string;
  readonly tokens: readonly MarkdownRenderableToken[];
  readonly renderToken?: MarkdownTokenRenderer;
  readonly spanVariant?: 'compact' | 'editor';
}): readonly React.ReactNode[] {
  if (!value) return [];
  if (tokens.length === 0) return [value];

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  tokens.forEach((token, index) => {
    if (token.start > cursor) {
      nodes.push(value.slice(cursor, token.start));
    }

    const key = `${token.kind}-${token.start}-${token.end}-${index}`;
    nodes.push(
      renderToken?.({ token, key }) ?? renderDefaultMarkdownToken(token, key, spanVariant),
    );
    cursor = token.end;
  });

  if (cursor < value.length) {
    nodes.push(value.slice(cursor));
  }
  return nodes;
}

export function renderDefaultMarkdownToken(
  token: MarkdownRenderableToken,
  key: string,
  spanVariant: 'compact' | 'editor' = 'compact',
): React.ReactNode {
  switch (token.kind) {
    case 'commonmark-image':
      return (
        <span
          key={key}
          className={getMarkdownReferenceClassName('image')}
          data-markdown-image-reference="true"
          title={token.title ?? token.raw}
        >
          {getTokenText(token, spanVariant)}
        </span>
      );
    case 'resource-reference':
      return (
        <span
          key={key}
          className={getMarkdownReferenceClassName(token.embed ? 'embed' : 'link')}
          data-markdown-resource-reference="true"
          data-markdown-resource-reference-embed={token.embed ? 'true' : 'false'}
          data-markdown-reference-status={token.status}
          title={token.title ?? token.raw}
        >
          {getTokenText(token, spanVariant)}
        </span>
      );
    case 'mention':
      return (
        <span
          key={key}
          className="box-decoration-clone rounded-sm border border-violet-300/70 bg-violet-50/60 px-1 py-[1px] text-current underline decoration-violet-400/80 decoration-2 underline-offset-[3px]"
          data-markdown-mention="true"
          data-markdown-reference-status={token.status}
          title={token.title ?? token.raw}
        >
          {getTokenText(token, spanVariant)}
        </span>
      );
    case 'semantic-span':
      return (
        <span
          key={key}
          className={getSemanticSpanClassName(token.span?.kind, spanVariant)}
          data-markdown-semantic-span="true"
          data-markdown-semantic-span-kind={token.span?.kind}
          data-markdown-semantic-field-id={token.span?.fieldId}
          data-semantic-prompt-span-kind={token.span?.kind}
          data-semantic-prompt-field-id={token.span?.fieldId}
          title={token.title ?? token.raw}
        >
          {getTokenText(token, spanVariant)}
        </span>
      );
    case 'strong':
      return (
        <strong key={key} className="font-semibold text-current" data-markdown-inline-strong="true">
          {getTokenText(token, spanVariant)}
        </strong>
      );
    case 'emphasis':
      return (
        <em key={key} className="italic text-current" data-markdown-inline-emphasis="true">
          {getTokenText(token, spanVariant)}
        </em>
      );
    case 'code':
      return (
        <code
          key={key}
          className="rounded border border-gray-200 bg-gray-100 px-1 py-[1px] font-mono text-[0.92em] text-current"
          data-markdown-inline-code="true"
        >
          {getTokenText(token, spanVariant)}
        </code>
      );
  }
}

function getTokenText(token: MarkdownRenderableToken, spanVariant: 'compact' | 'editor'): string {
  return spanVariant === 'editor' ? token.raw : token.display;
}

function extractMarkdownStyleTokens(value: string): readonly MarkdownRenderableToken[] {
  return [
    ...extractDelimitedMarkdownTokens(value, /`([^`\n]+)`/g, 'code', 1),
    ...extractDelimitedMarkdownTokens(value, /(\*\*|__)([^\n]+?)\1/g, 'strong', 2),
    ...extractEmphasisMarkdownTokens(value),
  ];
}

function extractDelimitedMarkdownTokens(
  value: string,
  pattern: RegExp,
  kind: Extract<MarkdownRenderableTokenKind, 'code' | 'strong'>,
  displayGroupIndex: number,
): readonly MarkdownRenderableToken[] {
  return Array.from(value.matchAll(pattern)).flatMap((match) => {
    const raw = match[0] ?? '';
    const display = match[displayGroupIndex] ?? '';
    const start = match.index ?? 0;
    const end = start + raw.length;
    return createToken(value, { kind, start, end, raw, display });
  });
}

function extractEmphasisMarkdownTokens(value: string): readonly MarkdownRenderableToken[] {
  const pattern = /(^|[^\p{L}\p{N}_*])(\*([^*\n]+)\*|_([^_\n]+)_)/gu;
  return Array.from(value.matchAll(pattern)).flatMap((match) => {
    const prefix = match[1] ?? '';
    const raw = match[2] ?? '';
    const display = match[3] ?? match[4] ?? '';
    const start = (match.index ?? 0) + prefix.length;
    const end = start + raw.length;
    return createToken(value, { kind: 'emphasis', start, end, raw, display });
  });
}

function createToken(
  value: string,
  token: MarkdownRenderableToken,
): readonly MarkdownRenderableToken[] {
  if (token.end <= token.start || token.start < 0 || token.end > value.length) return [];
  if (!token.display.trim()) return [];
  return [token];
}

function normalizeNonOverlappingTokens(
  value: string,
  tokens: readonly MarkdownRenderableToken[],
): readonly MarkdownRenderableToken[] {
  const sorted = tokens
    .filter((token) => token.end > token.start && token.end <= value.length && token.start >= 0)
    .sort(
      (left, right) =>
        left.start - right.start ||
        getTokenPriority(left.kind) - getTokenPriority(right.kind) ||
        right.end - left.end,
    );

  const result: MarkdownRenderableToken[] = [];
  let cursor = 0;
  for (const token of sorted) {
    if (token.start < cursor) continue;
    result.push(token);
    cursor = token.end;
  }
  return result;
}

function getTokenPriority(kind: MarkdownRenderableTokenKind): number {
  switch (kind) {
    case 'semantic-span':
      return 0;
    case 'commonmark-image':
      return 1;
    case 'resource-reference':
      return 2;
    case 'mention':
      return 3;
    case 'code':
      return 4;
    case 'strong':
      return 5;
    case 'emphasis':
      return 6;
  }
}

function getMarkdownReferenceClassName(kind: 'image' | 'embed' | 'link'): string {
  const base =
    'box-decoration-clone rounded-sm border px-1 py-[1px] text-current underline decoration-2 underline-offset-[3px]';
  switch (kind) {
    case 'image':
      return cn(base, 'border-blue-300/70 bg-blue-50/55 decoration-blue-400/80');
    case 'embed':
      return cn(base, 'border-cyan-300/70 bg-cyan-50/60 decoration-cyan-400/80');
    case 'link':
      return cn(base, 'border-sky-300/70 bg-sky-50/60 decoration-sky-400/80');
  }
}

function getSemanticSpanClassName(kind: string | undefined, variant: 'compact' | 'editor'): string {
  const base =
    variant === 'editor'
      ? 'box-decoration-clone rounded-sm border px-0.5 py-[1px] font-medium text-current underline decoration-2 underline-offset-[3px] shadow-sm'
      : 'box-decoration-clone rounded-sm border px-0.5 py-[1px] text-current underline decoration-2 underline-offset-[3px]';

  switch (kind) {
    case 'scene':
      return cn(base, 'border-emerald-300/60 bg-emerald-50/45 decoration-emerald-400/75');
    case 'character':
    case 'entity':
      return cn(base, 'border-violet-300/60 bg-violet-50/45 decoration-violet-400/75');
    case 'action':
      return cn(base, 'border-blue-300/60 bg-blue-50/45 decoration-blue-400/75');
    case 'camera':
      return cn(base, 'border-amber-300/60 bg-amber-50/50 decoration-amber-400/80');
    case 'style':
      return cn(base, 'border-pink-300/60 bg-pink-50/45 decoration-pink-400/75');
    case 'voice':
      return cn(base, 'border-indigo-300/60 bg-indigo-50/45 decoration-indigo-400/75');
    case 'resource':
    case 'media':
      return cn(base, 'border-cyan-300/60 bg-cyan-50/45 decoration-cyan-400/75');
    default:
      return cn(base, 'border-gray-300/60 bg-gray-50/55 decoration-gray-400/75');
  }
}
