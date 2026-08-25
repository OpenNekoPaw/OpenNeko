import type { ReactNode } from 'react';
import { Collapsible } from '@neko/ui';
import { ChevronDownIcon } from '@neko/ui/icons';
import type { AgentEntryMode } from '@neko/agent-contracts';
import { useTranslation } from '../../i18n/I18nContext';

interface HomeExperienceQuickActionsProps {
  readonly mode: AgentEntryMode;
  readonly selectionPending?: boolean;
  readonly disabled?: boolean;
  readonly detailExpanded: boolean;
  readonly summary?: string;
  readonly title?: string;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly children?: ReactNode;
}

export function HomeExperienceQuickActions({
  mode,
  selectionPending = false,
  disabled = false,
  detailExpanded,
  summary,
  title: titleOverride,
  onExpandedChange,
  children,
}: HomeExperienceQuickActionsProps): JSX.Element | null {
  const { t } = useTranslation();
  if ((mode === 'assistant' || mode === 'world-experience') && children == null) return null;

  const titleKey =
    mode === 'assistant'
      ? 'chat.entryPanel.assistantTitle'
      : mode === 'authoring'
        ? 'chat.entryPanel.authoringTitle'
        : 'chat.entryPanel.characterTitle';
  const title = titleOverride ?? t(titleKey);
  const accessibleLabel = summary ? `${title}: ${summary}` : title;

  return (
    <section
      className="agent-entry-quick-actions"
      aria-label={t('chat.entryQuickActions.label')}
      data-entry-panel-mode={mode}
    >
      <Collapsible
        className="agent-entry-quick-panel"
        contentClassName="agent-entry-quick-detail"
        open={detailExpanded}
        disabled={selectionPending || disabled}
        onOpenChange={onExpandedChange}
        trigger={
          <button
            type="button"
            className="agent-entry-quick-toggle"
            data-entry-panel-mode={mode}
            aria-label={accessibleLabel}
            title={accessibleLabel}
          >
            <span>{title}</span>
            {summary ? <small>{summary}</small> : null}
            <ChevronDownIcon className="agent-entry-quick-toggle-chevron" size={14} />
          </button>
        }
      >
        {children == null ? <div /> : <div data-entry-quick-detail="true">{children}</div>}
      </Collapsible>
    </section>
  );
}
