import type { ReactNode } from 'react';
import { Collapsible } from '@neko/ui';
import { ChevronDownIcon, PackageIcon } from '@neko/ui/icons';
import type { AgentEntryMode } from '@neko/agent-contracts';
import { useTranslation } from '../../i18n/I18nContext';
import type { SkillSummary } from './InputArea/types';
import { EntryResourceCard } from './EntryResourceCard';

interface HomeExperienceQuickActionsProps {
  readonly mode: AgentEntryMode;
  readonly selectionPending?: boolean;
  readonly disabled?: boolean;
  readonly detailExpanded: boolean;
  readonly summary?: string;
  readonly title?: string;
  readonly skills?: readonly SkillSummary[];
  readonly onSkillSelect?: (skill: SkillSummary) => void;
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
  skills = [],
  onSkillSelect,
  onExpandedChange,
  children,
}: HomeExperienceQuickActionsProps): JSX.Element | null {
  const { t } = useTranslation();
  const globalActions = skills.filter((skill) => skill.enabled).slice(0, 4);

  if (mode === 'world-experience' || (mode === 'assistant' && globalActions.length === 0)) {
    return null;
  }

  const titleKey =
    mode === 'assistant'
      ? 'chat.entryPanel.assistantTitle'
      : mode === 'authoring'
        ? 'chat.entryPanel.authoringTitle'
        : 'chat.entryPanel.characterTitle';
  const title = titleOverride ?? t(titleKey);
  const accessibleLabel = summary ? `${title}: ${summary}` : title;
  const content =
    mode === 'assistant' && (children === undefined || children === null) ? (
      <div className="agent-entry-resource-grid">
        {globalActions.map((skill) => (
          <EntryResourceCard
            key={skill.id}
            resourceKind="skill"
            label={skill.name}
            description={skill.description}
            media={<PackageIcon size={18} />}
            disabled={selectionPending}
            onSelect={() => onSkillSelect?.(skill)}
          />
        ))}
      </div>
    ) : (
      children
    );

  return (
    <section className="agent-entry-quick-actions" aria-label={t('chat.entryQuickActions.label')}>
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
        {content ? <div data-entry-quick-detail="true">{content}</div> : <div />}
      </Collapsible>
    </section>
  );
}
