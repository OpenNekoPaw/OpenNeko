import type { ReactNode } from 'react';
import {
  MarkdownGenerationPromptParts,
  MarkdownInlineText,
  renderDefaultMarkdownToken,
  type MarkdownSemanticSpan,
  type MarkdownTokenRenderContext,
} from '@neko/ui/markdown';
import type { CanvasAuthoringSemanticPromptSpan } from '@neko/shared';
import { t } from '../../i18n';

export interface SemanticPromptTextProps {
  readonly text: string;
  readonly spans?: readonly CanvasAuthoringSemanticPromptSpan[];
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly placeholderClassName?: string;
  readonly spanVariant?: 'compact' | 'editor';
}

export function SemanticPromptText({
  text,
  spans,
  placeholder,
  ariaLabel,
  className,
  placeholderClassName,
  spanVariant = 'compact',
}: SemanticPromptTextProps): ReactNode {
  const semanticSpans = createCanvasMarkdownSemanticSpans(text, spans ?? []);
  const hasSemanticSpans = semanticSpans.length > 0;
  return (
    <div
      className={className}
      data-semantic-prompt-text="true"
      data-semantic-prompt-visual-style="subtle"
      data-semantic-prompt-span-count={semanticSpans.length}
      data-semantic-prompt-generation-parts={hasSemanticSpans ? undefined : 'true'}
      aria-label={ariaLabel}
      title={text || placeholder}
    >
      {hasSemanticSpans ? (
        <MarkdownInlineText
          value={text}
          semanticSpans={semanticSpans}
          placeholder={placeholder}
          placeholderClassName={placeholderClassName}
          spanVariant={spanVariant}
          className="contents"
          renderToken={(context) => renderCanvasSemanticPromptToken(context, spanVariant)}
        />
      ) : (
        <MarkdownGenerationPromptParts
          value={text}
          placeholder={placeholder}
          placeholderClassName={placeholderClassName}
          ariaLabel={ariaLabel}
          className="contents"
        />
      )}
    </div>
  );
}

function readSemanticPromptSpanText(text: string, span: CanvasAuthoringSemanticPromptSpan): string {
  const start = clampPromptOffset(span.range.start, text.length);
  const end = clampPromptOffset(span.range.end, text.length);
  if (end <= start) return '';
  return text.slice(start, end).trim();
}

function formatSemanticPromptSpanTitle(
  text: string,
  span: CanvasAuthoringSemanticPromptSpan,
): string {
  const kindLabel = getSemanticPromptSpanKindLabel(span.kind);
  const fieldLabel = span.fieldId ? getSemanticPromptFieldLabel(span.fieldId) : undefined;
  const parts = [
    kindLabel,
    fieldLabel && fieldLabel !== kindLabel ? fieldLabel : undefined,
    readSemanticPromptSpanText(text, span),
  ].filter(Boolean);
  return parts.join(' · ');
}

function getSemanticPromptSpanKindLabel(kind: string): string {
  return translateDisplayKey(`content.promptSpanKind.${kind}`, kind);
}

export function getSemanticPromptFieldLabel(fieldId: string): string {
  return translateDisplayKey(`content.promptField.${fieldId}`, fieldId);
}

export function createCanvasMarkdownSemanticSpans(
  text: string,
  spans: readonly CanvasAuthoringSemanticPromptSpan[],
): readonly MarkdownSemanticSpan[] {
  const result: MarkdownSemanticSpan[] = [];
  let cursor = 0;
  const sorted = spans
    .filter((span) => isValidSpanRange(text, span))
    .sort(
      (left, right) => left.range.start - right.range.start || left.range.end - right.range.end,
    );

  for (const span of sorted) {
    if (span.range.start < cursor) continue;
    result.push({
      id: span.id,
      kind: span.kind,
      range: { startOffset: span.range.start, endOffset: span.range.end },
      fieldId: span.fieldId,
      label: getSemanticPromptSpanKindLabel(span.kind),
      tooltip: formatSemanticPromptSpanTitle(text, span),
    });
    cursor = span.range.end;
  }
  return result;
}

export function renderCanvasSemanticPromptToken(
  context: MarkdownTokenRenderContext,
  spanVariant: 'compact' | 'editor',
): ReactNode {
  const { token, key } = context;
  if (token.kind !== 'semantic-span') {
    return renderDefaultMarkdownToken(token, key, spanVariant);
  }

  return (
    <span
      key={key}
      className={getSemanticPromptSpanClassName(token.span?.kind, spanVariant)}
      data-semantic-prompt-span-kind={token.span?.kind}
      data-semantic-prompt-field-id={token.span?.fieldId}
      title={token.title ?? token.raw}
    >
      {token.display}
    </span>
  );
}

function isValidSpanRange(text: string, span: CanvasAuthoringSemanticPromptSpan): boolean {
  return (
    Number.isInteger(span.range.start) &&
    Number.isInteger(span.range.end) &&
    span.range.start >= 0 &&
    span.range.end > span.range.start &&
    span.range.end <= text.length
  );
}

function clampPromptOffset(value: number, textLength: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), textLength);
}

function getSemanticPromptSpanClassName(
  kind: string | undefined,
  variant: 'compact' | 'editor',
): string {
  const base =
    variant === 'editor'
      ? 'rounded-sm border px-0.5 py-[1px] font-medium text-current underline decoration-2 underline-offset-[3px] shadow-sm box-decoration-clone'
      : 'rounded-sm border px-0.5 py-[1px] text-current underline decoration-2 underline-offset-[3px] box-decoration-clone';
  switch (kind) {
    case 'scene':
      return `${base} border-emerald-300/60 bg-emerald-50/45 decoration-emerald-400/75`;
    case 'character':
    case 'entity':
      return `${base} border-violet-300/60 bg-violet-50/45 decoration-violet-400/75`;
    case 'action':
      return `${base} border-blue-300/60 bg-blue-50/45 decoration-blue-400/75`;
    case 'camera':
      return `${base} border-amber-300/60 bg-amber-50/50 decoration-amber-400/80`;
    case 'style':
      return `${base} border-pink-300/60 bg-pink-50/45 decoration-pink-400/75`;
    case 'voice':
      return `${base} border-indigo-300/60 bg-indigo-50/45 decoration-indigo-400/75`;
    case 'resource':
    case 'media':
      return `${base} border-cyan-300/60 bg-cyan-50/45 decoration-cyan-400/75`;
    default:
      return `${base} border-gray-300/60 bg-gray-50/55 decoration-gray-400/75`;
  }
}

function translateDisplayKey(key: string, fallback: string): string {
  const value = t(key);
  return value === key ? fallback : value;
}
