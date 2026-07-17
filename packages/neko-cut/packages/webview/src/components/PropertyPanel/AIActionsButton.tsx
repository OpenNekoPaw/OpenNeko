/**
 * AIActionsButton Component
 * AI 操作按钮组件 - 在 Property Panel 中显示可用的 AI 操作
 */

import { memo, useMemo, useState, useCallback } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { TimelineElement, AIQuickAction, AIActionElementType } from '../../types';
import { getActionsForElementType, mapElementTypeToAIType } from '../../types';

// =============================================================================
// Types
// =============================================================================

interface AIActionsButtonProps {
  element: TimelineElement | null;
  onExecuteAction: (actionId: string, elementIds: string[]) => void;
  disabled?: boolean;
}

// =============================================================================
// Icon Component (simple inline SVG)
// =============================================================================

const SparklesIcon = () => (
  <svg
    className="w-3.5 h-3.5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
    <path d="M5 19l1 3 1-3 3-1-3-1-1-3-1 3-3 1 3 1z" />
  </svg>
);

// =============================================================================
// Action Item Component
// =============================================================================

interface ActionItemProps {
  action: AIQuickAction;
  onClick: () => void;
}

const ActionItem = memo(function ActionItem({ action, onClick }: ActionItemProps) {
  const { t } = useTranslation();

  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
      onClick={onClick}
    >
      <span className="text-[var(--vscode-textLink-foreground)]">✦</span>
      <span>{t(action.label)}</span>
    </button>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const AIActionsButton = memo(function AIActionsButton({
  element,
  onExecuteAction,
  disabled = false,
}: AIActionsButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  // Determine element type for AI actions
  const elementType: AIActionElementType | null = useMemo(() => {
    if (!element) return null;
    const mediaType = element.type === 'media' ? element.mediaType : undefined;
    return mapElementTypeToAIType(element.type, mediaType);
  }, [element]);

  // Get available actions for this element type
  const availableActions = useMemo(() => {
    if (!elementType) return [];
    return getActionsForElementType(elementType, false);
  }, [elementType]);

  // Handle action click
  const handleActionClick = useCallback(
    (action: AIQuickAction) => {
      if (!element) return;
      onExecuteAction(action.id, [element.id]);
      setIsOpen(false);
    },
    [element, onExecuteAction],
  );

  // Don't render if no element or no actions
  if (!element || availableActions.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5
          text-[11px] font-medium
          bg-[var(--vscode-button-secondaryBackground)]
          text-[var(--vscode-button-secondaryForeground)]
          hover:bg-[var(--vscode-button-secondaryHoverBackground)]
          border border-[var(--vscode-button-border,transparent)]
          rounded transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        title={t('ai.action.title')}
      >
        <SparklesIcon />
        <span>{t('ai.action.button')}</span>
        <span className="text-[9px] opacity-60">▼</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Dropdown menu */}
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] rounded shadow-lg overflow-hidden">
            {availableActions.map((action) => (
              <ActionItem
                key={action.id}
                action={action}
                onClick={() => handleActionClick(action)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
});

export default AIActionsButton;
