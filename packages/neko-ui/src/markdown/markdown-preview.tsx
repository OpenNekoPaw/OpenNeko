import type React from 'react';
import type { MarkdownSemanticSpan, MarkdownTokenRenderer } from './types';
import { MarkdownInlineText } from './markdown-inline-text';
import { cn } from '../utils';

export interface MarkdownPreviewProps {
  readonly value: string;
  readonly semanticSpans?: readonly MarkdownSemanticSpan[];
  readonly className?: string;
  readonly renderToken?: MarkdownTokenRenderer;
}

export function MarkdownPreview({
  value,
  semanticSpans,
  className,
  renderToken,
}: MarkdownPreviewProps): React.ReactElement {
  return (
    <div className={cn('whitespace-pre-wrap break-words', className)} data-markdown-preview="true">
      <MarkdownInlineText
        value={value}
        semanticSpans={semanticSpans}
        renderToken={renderToken}
        className="contents"
      />
    </div>
  );
}
