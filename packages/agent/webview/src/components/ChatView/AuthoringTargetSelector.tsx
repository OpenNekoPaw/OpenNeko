import { useCallback, useState } from 'react';
import { FolderIcon } from '@neko/ui/icons';
import { useTranslation } from '../../i18n/I18nContext';
import type {
  AgentComposerWorkspacePresentation,
  AgentComposerWorkspaceTarget,
} from '../ComposerWorkspaceContext';
import { EntryResourceCard } from './EntryResourceCard';

export interface AuthoringTargetSelectorProps {
  readonly presentation: Pick<
    Extract<AgentComposerWorkspacePresentation, { readonly kind: 'entry' }>,
    'projects' | 'onSelectProject'
  >;
  readonly selected?: AgentComposerWorkspaceTarget;
  readonly pending: boolean;
  readonly onChange: (target: AgentComposerWorkspaceTarget | undefined) => Promise<void>;
}

export function AuthoringTargetSelector({
  presentation,
  selected,
  pending,
  onChange,
}: AuthoringTargetSelectorProps): JSX.Element {
  const { t } = useTranslation();
  const [diagnostic, setDiagnostic] = useState<string>();
  const commitTarget = useCallback(
    async (target: AgentComposerWorkspaceTarget | undefined) => {
      await onChange(target);
    },
    [onChange],
  );

  return (
    <div className="agent-entry-authoring-selector">
      <div
        className="agent-entry-resource-grid agent-entry-authoring-actions"
        aria-label={t('chat.entryAction.label')}
      >
        {presentation.projects.map((project) => (
          <EntryResourceCard
            key={project.projectId}
            resourceKind="project"
            label={project.label}
            description={t('chat.entryAction.chooseProjectDescription')}
            media={<FolderIcon size={18} />}
            selected={selected?.authority?.projectId === project.projectId}
            disabled={project.disabled || pending}
            onSelect={() =>
              void presentation
                .onSelectProject(project.projectId)
                .then(async (target) => {
                  if (target) await commitTarget(target);
                })
                .catch((error: unknown) => setDiagnostic(describeError(error)))
            }
          />
        ))}
      </div>
      {diagnostic ? <p role="alert">{diagnostic}</p> : null}
    </div>
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
