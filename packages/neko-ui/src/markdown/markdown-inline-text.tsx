import type React from 'react';
import type { MarkdownTokenRenderer, MarkdownSemanticSpan } from './types';
import { useMarkdownProjection } from './use-markdown-projection';
import {
  createMarkdownRenderableTokens,
  renderMarkdownInlineSegments,
} from './token-rendering';
import { cn } from '../utils';

export interface MarkdownInlineTextProps {
  readonly value: string;
  readonly semanticSpans?: readonly MarkdownSemanticSpan[];
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly placeholderClassName?: string;
  readonly spanVariant?: 'compact' | 'editor';
  readonly renderToken?: MarkdownTokenRenderer;
}

export function MarkdownInlineText({
  value,
  semanticSpans,
  placeholder,
  ariaLabel,
  className,
  placeholderClassName,
  spanVariant = 'compact',
  renderToken,
}: MarkdownInlineTextProps): React.ReactElement {
  const result = useMarkdownProjection({
    value,
    profile: semanticSpans && semanticSpans.length > 0 ? 'semantic-prompt' : 'resource-markdown',
    semanticSpans,
  });
  const tokens = createMarkdownRenderableTokens({
    value,
    projection: result.projection,
    semanticSpans: result.semanticSpans,
  });

  return (
    <div
      className={className}
      data-markdown-inline-text="true"
      data-markdown-token-count={tokens.length}
      data-semantic-prompt-text={semanticSpans && semanticSpans.length > 0 ? 'true' : undefined}
      data-semantic-prompt-visual-style={
        semanticSpans && semanticSpans.length > 0 ? 'subtle' : undefined
      }
      data-semantic-prompt-span-count={semanticSpans?.length}
      aria-label={ariaLabel}
      title={value || placeholder}
    >
      {value ? (
        renderMarkdownInlineSegments({ value, tokens, renderToken, spanVariant })
      ) : (
        <span className={cn('text-gray-400', placeholderClassName)}>{placeholder}</span>
      )}
    </div>
  );
}
