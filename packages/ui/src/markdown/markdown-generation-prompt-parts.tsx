import type React from 'react';
import {
  projectNekoMarkdownGenerationPromptParts,
  type NekoMarkdownGenerationPromptPart,
  type NekoMarkdownGenerationPromptPartKind,
} from '@neko/markdown';
import { cn } from '../utils';
import { createMarkdownRenderableTokens, renderMarkdownInlineSegments } from './token-rendering';
import { projectMarkdownForUi } from './projection';

export interface MarkdownGenerationPromptPartsProps {
  readonly value: string;
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly placeholderClassName?: string;
  readonly partClassName?: string;
}

export function MarkdownGenerationPromptParts({
  value,
  placeholder,
  ariaLabel,
  className,
  placeholderClassName,
  partClassName,
}: MarkdownGenerationPromptPartsProps): React.ReactElement {
  const parts = projectNekoMarkdownGenerationPromptParts(value);

  return (
    <div
      className={cn('min-w-0 whitespace-pre-wrap break-words text-current', className)}
      data-markdown-generation-prompt-parts="true"
      data-markdown-generation-prompt-part-count={parts.length}
      data-markdown-generation-prompt-visual-style="subtle-inline"
      aria-label={ariaLabel}
      title={value || placeholder}
    >
      {parts.length > 0 ? (
        renderGenerationPromptParts(parts, partClassName)
      ) : (
        <span className={cn('text-gray-400', placeholderClassName)}>{placeholder}</span>
      )}
    </div>
  );
}

export function getMarkdownGenerationPromptPartClassName(
  kind: NekoMarkdownGenerationPromptPartKind,
): string {
  const base =
    'rounded-sm border px-0.5 py-[1px] text-current underline decoration-2 underline-offset-[3px] box-decoration-clone';
  switch (kind) {
    case 'intent':
      return `${base} border-blue-300/60 bg-blue-50/45 font-medium decoration-blue-500/70`;
    case 'reference':
      return `${base} border-cyan-300/60 bg-cyan-50/45 decoration-cyan-400/75`;
    case 'operation':
      return `${base} border-amber-300/60 bg-amber-50/50 decoration-amber-400/80`;
    case 'camera':
      return `${base} border-sky-300/60 bg-sky-50/45 decoration-sky-400/75`;
    case 'dialogue':
      return `${base} border-indigo-300/60 bg-indigo-50/45 decoration-indigo-400/75`;
    case 'constraint':
      return `${base} border-emerald-300/60 bg-emerald-50/45 decoration-emerald-400/75`;
    case 'detail':
      return `${base} border-gray-300/60 bg-gray-50/55 decoration-gray-400/75`;
  }
}

function renderGenerationPromptParts(
  parts: readonly NekoMarkdownGenerationPromptPart[],
  partClassName: string | undefined,
): readonly React.ReactNode[] {
  return parts.map((part, index) => (
    <span key={`${part.kind}:${index}:${part.text}`}>
      {index === 0 ? null : ' '}
      <span
        className={cn(getMarkdownGenerationPromptPartClassName(part.kind), partClassName)}
        data-markdown-generation-prompt-part="true"
        data-markdown-generation-prompt-part-kind={part.kind}
      >
        {renderGenerationPromptPartText(part.text)}
      </span>
    </span>
  ));
}

function renderGenerationPromptPartText(value: string): readonly React.ReactNode[] {
  const result = projectMarkdownForUi({
    value,
    profile: 'resource-markdown',
  });
  const tokens = createMarkdownRenderableTokens({
    value,
    projection: result.projection,
    semanticSpans: result.semanticSpans,
  });
  return renderMarkdownInlineSegments({ value, tokens });
}
