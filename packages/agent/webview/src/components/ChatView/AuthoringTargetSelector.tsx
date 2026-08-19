import { FolderIcon } from '@neko/ui/icons';
import { useTranslation } from '../../i18n/I18nContext';
import type { AgentComposerProjectOption } from '../ComposerWorkspaceContext';
import { EntryResourceCard } from './EntryResourceCard';

export interface AuthoringTargetSelectorProps {
  readonly projects: readonly AgentComposerProjectOption[];
  readonly selected?: DshEntryProjectSelection;
  readonly pending: boolean;
  readonly onChange: (target: DshEntryProjectSelection | undefined) => void;
}

export interface DshEntryProjectSelection {
  readonly projectId: string;
  readonly label: string;
}

export function AuthoringTargetSelector({
  projects,
  selected,
  pending,
  onChange,
}: AuthoringTargetSelectorProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="agent-entry-authoring-selector">
      <div
        className="agent-entry-resource-grid agent-entry-authoring-actions"
        aria-label={t('chat.entryAction.label')}
      >
        {projects.map((project) => (
          <EntryResourceCard
            key={project.projectId}
            resourceKind="project"
            label={project.label}
            description={t('chat.entryAction.chooseProjectDescription')}
            media={<FolderIcon size={18} />}
            selected={selected?.projectId === project.projectId}
            disabled={project.disabled || pending}
            onSelect={() => {
              onChange(
                selected?.projectId === project.projectId
                  ? undefined
                  : { projectId: project.projectId, label: project.label },
              );
            }}
          />
        ))}
      </div>
    </div>
  );
}
