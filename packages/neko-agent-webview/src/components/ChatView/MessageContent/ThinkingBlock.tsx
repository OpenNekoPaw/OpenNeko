/**
 * ThinkingBlock - AI 思考过程展示组件
 * 支持折叠/展开，显示思考动画
 */

import { useState, useCallback, memo } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ThinkingBlockProps {
  content: string;
  isComplete?: boolean;
  sessionKey: string;
  defaultExpanded?: boolean;
}

function ThinkingBlockComponent({
  content,
  isComplete = true,
  sessionKey,
  defaultExpanded = false,
}: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Don't render if no content
  if (!content || content.trim().length === 0) {
    return null;
  }

  return (
    <div className="my-2 rounded-lg border border-[var(--vscode-panel-border)] overflow-hidden">
      {/* Header */}
      <button
        onClick={toggleExpand}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--vscode-editor-background)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors text-left"
      >
        {/* Expand/Collapse icon */}
        <ChevronIcon
          className={`w-4 h-4 text-[var(--vscode-foreground)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />

        {/* Thinking indicator */}
        <div className="flex items-center gap-2">
          {!isComplete && (
            <span className="flex gap-0.5">
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-foreground)] animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-foreground)] animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-foreground)] animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </span>
          )}
          {isComplete && (
            <BrainIcon className="w-4 h-4 text-[var(--vscode-descriptionForeground)]" />
          )}

          <span className="text-[12px] font-medium text-[var(--vscode-foreground)]">
            {isComplete ? 'Thinking' : 'Thinking...'}
          </span>
        </div>

        {/* Content preview when collapsed */}
        {!isExpanded && (
          <span className="flex-1 text-[11px] text-[var(--vscode-descriptionForeground)] truncate ml-2">
            {content.slice(0, 100)}...
          </span>
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-3 py-2 bg-[var(--vscode-textBlockQuote-background)] border-t border-[var(--vscode-panel-border)]">
          <MarkdownRenderer
            content={content}
            isStreaming={!isComplete}
            className="text-[var(--vscode-descriptionForeground)]"
            sessionKey={sessionKey}
          />
        </div>
      )}
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export const ThinkingBlock = memo(ThinkingBlockComponent);

// Chevron icon
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// Brain icon
function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  );
}
