/**
 * MessageActions - 消息操作按钮组
 * P2: 支持复制、反馈、编辑、重发
 */

import { useState, useCallback, memo } from 'react';
import { Message } from '@neko-agent/types';
import { getLogger } from '../../utils/logger';
import { CopyIcon, CheckIcon, EditIcon, RefreshIcon } from '@neko/shared/icons';

const logger = getLogger('MessageActions');

interface MessageActionsProps {
  message: Message;
  onCopy?: () => void;
  onFeedback?: (feedback: 'positive' | 'negative') => void;
  onEdit?: () => void;
  onResend?: () => void;
}

export const MessageActions = memo(function MessageActions({
  message,
  onCopy,
  onFeedback,
  onEdit,
  onResend,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(
    message.feedback ?? null,
  );

  // Copy message content
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy?.();
    } catch (err) {
      logger.error('Failed to copy:', err);
    }
  }, [message.content, onCopy]);

  // Handle feedback
  const handleFeedback = useCallback(
    (type: 'positive' | 'negative') => {
      const newFeedback = feedback === type ? null : type;
      setFeedback(newFeedback);
      if (newFeedback) {
        onFeedback?.(newFeedback);
      }
    },
    [feedback, onFeedback],
  );

  const isAssistant = message.role === 'assistant';

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {/* Copy button */}
      <ActionButton onClick={handleCopy} title={copied ? 'Copied!' : 'Copy'} active={copied}>
        {copied ? (
          <CheckIcon className="w-3.5 h-3.5 text-[var(--vscode-charts-green)]" />
        ) : (
          <CopyIcon className="w-3.5 h-3.5" />
        )}
      </ActionButton>

      {/* Feedback buttons (only for assistant messages) */}
      {isAssistant && (
        <>
          <ActionButton
            onClick={() => handleFeedback('positive')}
            title="Good response"
            active={feedback === 'positive'}
          >
            <ThumbUpIcon filled={feedback === 'positive'} />
          </ActionButton>
          <ActionButton
            onClick={() => handleFeedback('negative')}
            title="Bad response"
            active={feedback === 'negative'}
          >
            <ThumbDownIcon filled={feedback === 'negative'} />
          </ActionButton>
        </>
      )}

      {/* Edit button (only for user messages) */}
      {!isAssistant && onEdit && (
        <ActionButton onClick={onEdit} title="Edit message">
          <EditIcon className="w-3.5 h-3.5" />
        </ActionButton>
      )}

      {/* Resend button (only for user messages) */}
      {!isAssistant && onResend && (
        <ActionButton onClick={onResend} title="Resend from here">
          <RefreshIcon className="w-3.5 h-3.5" />
        </ActionButton>
      )}
    </div>
  );
});

// Action button wrapper
interface ActionButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}

function ActionButton({ children, onClick, title, active }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1 rounded transition-colors ${
        active
          ? 'text-[var(--vscode-button-foreground)] bg-[var(--vscode-button-background)]'
          : 'text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]'
      }`}
    >
      {children}
    </button>
  );
}

// Icons

function ThumbUpIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill={filled ? 'currentColor' : 'none'}
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
      />
    </svg>
  );
}

function ThumbDownIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill={filled ? 'currentColor' : 'none'}
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"
      />
    </svg>
  );
}
